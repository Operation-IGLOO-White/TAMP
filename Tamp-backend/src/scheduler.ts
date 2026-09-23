// In-process background worker. Next.js has no cron, so a single interval loop
// (started once from instrumentation.ts) owns the recurring jobs:
//   • expireStaleMatches — enforce Match.expiresAt (the store never did)
//   • drainWebhookQueue  — sign + POST pending deliveries with backoff
//   • gcExpired          — delete expired sessions / codes
// It is deliberately simple (no external queue); for a real deployment this
// would move to a proper worker + durable queue, but the job logic is the same.
import { createHmac, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Match } from "@/lib/tamp-types";
import { gcExpired } from "./auth";
import { emitEvent } from "./events";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { loadRow, matchRow, readAll } from "./routers/snapshot";

const TICK_MS = 30_000; // one sweep every 30s
const WEBHOOK_BATCH = 20;
const WEBHOOK_MAX_ATTEMPTS = 6;
const WEBHOOK_TIMEOUT_MS = 8_000;
const EXPIRABLE = new Set(["SUGGESTED", "OFFERED", "ACCEPTED"]);

const auditId = () =>
  `EV-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`;

// Backoff schedule (ms) indexed by prior attempts: ~30s, 2m, 10m, 30m, 2h, 6h.
const BACKOFF = [30_000, 120_000, 600_000, 1_800_000, 7_200_000, 21_600_000];

// ── Job: expire stale matches ────────────────────────────────────
async function expireStaleMatches(): Promise<number> {
  const all = await readAll();
  const now = Date.now();
  const stale = all.matches.filter(
    (m) => EXPIRABLE.has(m.status) && Date.parse(m.expiresAt) < now,
  );
  if (!stale.length) return 0;

  for (const m of stale) {
    const expired: Match = { ...m, status: "EXPIRED", rejectionReason: "Expired (no response in time)" };
    const load = all.loads.find((l) => l.id === m.loadId);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.match.update({ where: { id: m.id }, data: matchRow(expired) }),
      prisma.auditEvent.create({
        data: {
          id: auditId(),
          data: {
            id: auditId(),
            eventType: "MATCH_EXPIRED",
            eventId: "EVT-24",
            actorId: "SYSTEM",
            actorRole: "SYSTEM",
            subjectType: "MATCH",
            subjectId: m.id,
            summary: `Match on ${m.loadId} expired without confirmation.`,
            at: new Date().toISOString(),
          } as object,
        },
      }),
    ];
    // An ACCEPTED match had moved its load to MATCHED — release it back to POSTED.
    if (m.status === "ACCEPTED" && load && load.status === "MATCHED") {
      ops.push(
        prisma.load.update({ where: { id: load.id }, data: loadRow({ ...load, status: "POSTED" }) }),
      );
    }
    await prisma.$transaction(ops);

    const truck = all.trucks.find((t) => t.id === m.truckPostingId);
    await emitEvent({
      event: "MATCH_EXPIRED",
      notifications: [load?.ownerId, truck?.transporterId]
        .filter((id): id is string => !!id)
        .map((partyId) => ({
          partyId,
          title: "Match expired",
          detail: `The match on ${m.loadId} expired before it was confirmed.`,
          tone: "warning" as const,
          subjectType: "MATCH",
          subjectId: m.id,
        })),
      webhook: {
        data: { loadId: m.loadId, matchId: m.id, status: "EXPIRED" },
        involvedPartyIds: [load?.ownerId, truck?.transporterId].filter((id): id is string => !!id),
      },
    });
  }
  logger.info("matches_expired", { count: stale.length });
  return stale.length;
}

// ── Job: drain the webhook delivery queue ────────────────────────
function sign(secret: string, body: string, ts: number): string {
  return createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

async function drainWebhookQueue(): Promise<{ sent: number; failed: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: WEBHOOK_BATCH,
  });
  let sent = 0;
  let failed = 0;
  for (const d of due) {
    const ep = await prisma.webhookEndpoint.findUnique({ where: { id: d.endpointId } });
    const attempts = d.attempts + 1;
    if (!ep || !ep.active) {
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: { status: "FAILED", attempts, lastError: "Endpoint missing or inactive" },
      });
      failed++;
      continue;
    }
    const body = JSON.stringify(d.payload);
    const ts = Date.now();
    let ok = false;
    let responseCode: number | null = null;
    let lastError: string | null = null;
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "TAMP-Webhooks/1",
          "x-tamp-event": d.event,
          "x-tamp-delivery": d.id,
          "x-tamp-timestamp": String(ts),
          "x-tamp-signature": `t=${ts},sha256=${sign(ep.secret, body, ts)}`,
        },
        body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      responseCode = res.status;
      ok = res.ok;
      if (!ok) lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (ok) {
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: { status: "SUCCESS", attempts, responseCode, lastError: null },
      });
      sent++;
    } else if (attempts >= WEBHOOK_MAX_ATTEMPTS) {
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: { status: "FAILED", attempts, responseCode, lastError },
      });
      failed++;
    } else {
      const delay = BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)]!;
      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: "PENDING",
          attempts,
          responseCode,
          lastError,
          nextAttemptAt: new Date(Date.now() + delay),
        },
      });
    }
  }
  if (sent || failed) logger.info("webhooks_drained", { sent, failed, due: due.length });
  return { sent, failed };
}

async function tick(): Promise<void> {
  try {
    await expireStaleMatches();
  } catch (err) {
    logger.error("job_expire_matches_failed", { message: String(err) });
  }
  try {
    await drainWebhookQueue();
  } catch (err) {
    logger.error("job_webhooks_failed", { message: String(err) });
  }
  try {
    await gcExpired();
  } catch (err) {
    logger.error("job_gc_failed", { message: String(err) });
  }
}

// Guard against double-start (HMR, multiple instrumentation calls).
let started = false;
export function startScheduler(): void {
  if (started) return;
  started = true;
  logger.info("scheduler_started", { tickMs: TICK_MS });
  // Kick once shortly after boot, then on the interval. `unref` so the timer
  // never keeps the process alive on shutdown.
  const timer = setInterval(() => void tick(), TICK_MS);
  if (typeof timer.unref === "function") timer.unref();
  setTimeout(() => void tick(), 3_000).unref?.();
}

// Exposed for tests and for an on-demand admin trigger.
export const jobs = { expireStaleMatches, drainWebhookQueue };
