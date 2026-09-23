// Domain-event side effects: per-user notification rows and outbound webhook
// deliveries. The authoritative audit row is written inside each command's own
// transaction; this module handles *delivery* concerns after that commit, so a
// delivery hiccup never rolls back a domain change. Both notifications and
// webhooks are enqueued to Postgres — the scheduler drains the webhook queue.
import { randomBytes } from "node:crypto";
import { logger } from "./logger";
import { prisma } from "./prisma";

export type DomainEventType =
  | "MATCH_ACCEPTED"
  | "ENGAGEMENT_CONFIRMED"
  | "TRIP_STATUS_CHANGED"
  | "LOAD_DELIVERED"
  | "MATCH_EXPIRED"
  | "VERIFICATION_CHANGED";

export type NotificationTone = "info" | "positive" | "warning" | "critical";

export interface NotificationSpec {
  partyId: string;
  title: string;
  detail: string;
  tone?: NotificationTone;
  subjectType?: string;
  subjectId?: string;
}

const rid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;

// Persist per-user notifications. Recipients are de-duplicated and empty
// partyIds dropped, so callers can pass the involved parties without worrying
// about the actor appearing twice.
export async function notify(type: DomainEventType, specs: NotificationSpec[]): Promise<number> {
  const seen = new Set<string>();
  const rows = specs
    .filter((s) => s.partyId && !seen.has(s.partyId) && (seen.add(s.partyId), true))
    .map((s) => ({
      id: rid("NT"),
      partyId: s.partyId,
      type,
      title: s.title,
      detail: s.detail,
      tone: s.tone ?? "info",
      subjectType: s.subjectType ?? null,
      subjectId: s.subjectId ?? null,
    }));
  if (!rows.length) return 0;
  await prisma.notification.createMany({ data: rows });
  return rows.length;
}

// Fan an event out to subscribed, active endpoints, by enqueuing a delivery row
// per endpoint. An endpoint receives an event if its owner is one of the
// involved parties OR its owner is an ADMIN — admin endpoints are a
// platform-wide monitoring feed and get every event. The scheduler signs and
// POSTs these with retry/backoff.
export async function enqueueWebhooks(
  event: DomainEventType,
  data: unknown,
  involvedPartyIds: string[],
): Promise<number> {
  const admins = await prisma.party.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  const parties = new Set([...involvedPartyIds.filter(Boolean), ...admins.map((a) => a.id)]);
  if (!parties.size) return 0;
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { active: true, partyId: { in: [...parties] } },
  });
  const targeted = endpoints.filter((e) => {
    const events = Array.isArray(e.events) ? (e.events as unknown[]).map(String) : [];
    return events.includes("*") || events.includes(event);
  });
  if (!targeted.length) return 0;
  const now = new Date();
  const envelope = (endpointId: string) => ({
    id: rid("WD"),
    endpointId,
    event,
    payload: { id: rid("EVT"), event, at: now.toISOString(), data } as object,
    status: "PENDING",
    attempts: 0,
    nextAttemptAt: now,
  });
  await prisma.webhookDelivery.createMany({ data: targeted.map((e) => envelope(e.id)) });
  return targeted.length;
}

// One call for a domain event's delivery side effects. Never throws — a failure
// here is logged, not propagated, so it can't undo a committed domain change.
export async function emitEvent(args: {
  event: DomainEventType;
  notifications: NotificationSpec[];
  webhook: { data: unknown; involvedPartyIds: string[] };
}): Promise<void> {
  try {
    const [notified, queued] = await Promise.all([
      notify(args.event, args.notifications),
      enqueueWebhooks(args.event, args.webhook.data, args.webhook.involvedPartyIds),
    ]);
    logger.debug("event_emitted", { event: args.event, notified, webhooks: queued });
  } catch (err) {
    logger.error("emit_event_failed", {
      event: args.event,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
