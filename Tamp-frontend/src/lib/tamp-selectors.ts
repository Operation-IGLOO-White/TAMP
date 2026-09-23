// Derived read helpers shared across screens. Keeps Load/Match/Trip as
// separate entities (spec §5.1) while giving the UI a single display status.

import type {
  AuditEvent,
  Dispute,
  Load,
  MaintenanceTask,
  Match,
  Rating,
  Role,
  Trip,
  TruckPosting,
} from "./tamp-types";

export interface Notification {
  id: string;
  title: string;
  detail: string;
  at: string;
  unread: boolean;
  tone: "info" | "success" | "warning";
  subjectType: AuditEvent["subjectType"];
  subjectId: string;
}

// Map the server notification store's tone vocabulary onto the three tones the
// UI renders. (Server: info | positive | warning | critical.)
export function toClientTone(tone: string): Notification["tone"] {
  if (tone === "positive") return "success";
  if (tone === "critical" || tone === "warning") return "warning";
  return "info";
}

// Where a notification links to. The only per-item detail page is the owner's
// load view; every other role deep-links to its most relevant section.
export type NotifTarget =
  | { kind: "load"; loadId: string }
  | {
      kind: "route";
      to: "/owner/board" | "/transporter/engagements" | "/driver" | "/admin/oversight";
    };

function resolveLoadId(
  subjectType: AuditEvent["subjectType"],
  subjectId: string,
  data: { matches: Match[]; trips: Trip[]; disputes: Dispute[] },
): string | null {
  switch (subjectType) {
    case "LOAD":
      return subjectId;
    case "MATCH":
      return data.matches.find((m) => m.id === subjectId)?.loadId ?? null;
    case "TRIP": {
      const trip = data.trips.find((t) => t.id === subjectId);
      return data.matches.find((m) => m.id === trip?.matchId)?.loadId ?? null;
    }
    case "DISPUTE": {
      const dispute = data.disputes.find((d) => d.id === subjectId);
      const trip = data.trips.find((t) => t.id === dispute?.tripId);
      return data.matches.find((m) => m.id === trip?.matchId)?.loadId ?? null;
    }
    default:
      return null;
  }
}

export function notificationTarget(
  role: Role,
  n: Pick<Notification, "subjectType" | "subjectId">,
  data: { matches: Match[]; trips: Trip[]; disputes: Dispute[] },
): NotifTarget {
  if (role === "FREIGHT_OWNER") {
    const loadId = resolveLoadId(n.subjectType, n.subjectId, data);
    return loadId ? { kind: "load", loadId } : { kind: "route", to: "/owner/board" };
  }
  if (role === "TRANSPORTER") return { kind: "route", to: "/transporter/engagements" };
  if (role === "DRIVER") return { kind: "route", to: "/driver" };
  return { kind: "route", to: "/admin/oversight" };
}

const EVENT_TITLE: Record<string, string> = {
  LOAD_POSTED: "New load posted",
  TRUCK_POSTED: "Truck posted",
  MATCH_OFFERED: "Match suggested",
  MATCH_ACCEPTED: "Match accepted",
  MATCH_REJECTED: "Match rejected",
  ENGAGEMENT_CONFIRMED: "Engagement confirmed",
  TRIP_STATUS_CHANGED: "Trip updated",
  DISPUTE_RAISED: "Dispute raised",
  DISPUTE_RESOLVED: "Dispute resolved",
  RATING_SUBMITTED: "Rating submitted",
  PROOF_CAPTURED: "Delivery confirmed",
  MAINTENANCE_LOGGED: "Maintenance scheduled",
  MAINTENANCE_DONE: "Maintenance completed",
};

const EVENT_TONE: Record<string, Notification["tone"]> = {
  MATCH_ACCEPTED: "success",
  ENGAGEMENT_CONFIRMED: "success",
  DISPUTE_RESOLVED: "success",
  RATING_SUBMITTED: "success",
  PROOF_CAPTURED: "success",
  MAINTENANCE_DONE: "success",
  DISPUTE_RAISED: "warning",
  MATCH_REJECTED: "warning",
};

// Audit events are the activity feed; surface the role-relevant ones as
// notifications. Owners don't care about raw truck postings, and vice versa.
export function buildNotifications(
  audit: AuditEvent[],
  role: Role,
  readAtISO: string,
  limit = 20,
): Notification[] {
  const readAt = new Date(readAtISO).getTime();
  return audit
    .filter((e) => {
      if (e.eventType === "FUEL_LOGGED") return false; // self-action, not notify-worthy
      if (role === "FREIGHT_OWNER")
        // Owners care about their loads/deliveries, not carriers' fleet upkeep.
        return !["TRUCK_POSTED", "MAINTENANCE_LOGGED", "MAINTENANCE_DONE"].includes(e.eventType);
      if (role === "TRANSPORTER") return e.eventType !== "LOAD_POSTED";
      if (role === "DRIVER")
        // Drivers care about the trips they run and their truck's upkeep.
        return (
          [
            "ENGAGEMENT_CONFIRMED",
            "MATCH_ACCEPTED",
            "TRIP_STATUS_CHANGED",
            "PROOF_CAPTURED",
            "MAINTENANCE_LOGGED",
            "MAINTENANCE_DONE",
          ].includes(e.eventType) || e.eventType.startsWith("DISPUTE")
        );
      return true;
    })
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      title: EVENT_TITLE[e.eventType] ?? e.eventType,
      detail: e.summary,
      at: e.at,
      unread: new Date(e.at).getTime() > readAt,
      tone: EVENT_TONE[e.eventType] ?? "info",
      subjectType: e.subjectType,
      subjectId: e.subjectId,
    }));
}

// Proactive alerts for maintenance that's overdue or due within 7 days. These
// aren't audit events — they're derived from the schedule so they surface until
// the task is completed (overdue items keep nagging).
export function maintenanceAlerts(
  maintenance: MaintenanceTask[],
  trucks: { id: string; registration: string }[],
  readAtISO: string,
): Notification[] {
  const readAt = new Date(readAtISO).getTime();
  const now = Date.now();
  const soon = now + 7 * 864e5;
  const reg = new Map(trucks.map((t) => [t.id, t.registration]));
  return maintenance
    .filter((m) => m.status === "SCHEDULED")
    .map((m): Notification | null => {
      const due = new Date(m.dueDate).getTime();
      const overdue = due < now;
      const dueSoon = due >= now && due <= soon;
      if (!overdue && !dueSoon) return null;
      const truck = reg.get(m.truckId) ?? m.truckId;
      return {
        id: `mnt-${m.id}`,
        title: overdue ? "Maintenance overdue" : "Maintenance due soon",
        detail: `${m.title} for ${truck} — due ${new Date(m.dueDate).toLocaleDateString("en-ZA")}.`,
        at: m.dueDate,
        unread: overdue ? true : new Date(m.createdAt).getTime() > readAt,
        tone: overdue ? "warning" : "info",
        subjectType: "TRUCK",
        subjectId: m.truckId,
      };
    })
    .filter((n): n is Notification => n !== null);
}

// Vehicle-licence renewal reminders: disc expired or expiring within 30 days.
export function licenceAlerts(trucks: TruckPosting[], readAtISO: string): Notification[] {
  const readAt = new Date(readAtISO).getTime();
  const now = Date.now();
  const soon = now + 30 * 864e5;
  return trucks
    .filter((t) => t.licenceExpiry)
    .map((t): Notification | null => {
      const exp = new Date(t.licenceExpiry!).getTime();
      const expired = exp < now;
      const expiring = exp >= now && exp <= soon;
      if (!expired && !expiring) return null;
      return {
        id: `lic-${t.id}`,
        title: expired ? "Vehicle licence expired" : "Vehicle licence expiring",
        detail: `${t.registration} licence ${expired ? "expired" : "expires"} ${new Date(t.licenceExpiry!).toLocaleDateString("en-ZA")}.`,
        at: t.licenceExpiry!,
        unread: expired ? true : new Date(t.createdAt).getTime() > readAt,
        tone: expired ? "warning" : "info",
        subjectType: "TRUCK",
        subjectId: t.id,
      };
    })
    .filter((n): n is Notification => n !== null);
}

export function activeMatchForLoad(loadId: string, matches: Match[]): Match | undefined {
  return matches.find(
    (m) => m.loadId === loadId && (m.status === "ACCEPTED" || m.status === "CONFIRMED"),
  );
}

export function confirmedMatchForLoad(loadId: string, matches: Match[]): Match | undefined {
  return matches.find((m) => m.loadId === loadId && m.status === "CONFIRMED");
}

export function acceptedMatchForLoad(loadId: string, matches: Match[]): Match | undefined {
  return matches.find((m) => m.loadId === loadId && m.status === "ACCEPTED");
}

/** Matches the owner has accepted that await the truck owner's confirmation. */
export function pendingConfirmations(matches: Match[]): Match[] {
  return matches.filter((m) => m.status === "ACCEPTED");
}

export function topSuggestionForLoad(loadId: string, matches: Match[]): Match | undefined {
  return matches
    .filter((m) => m.loadId === loadId && m.status === "SUGGESTED")
    .sort((a, b) => b.score - a.score)[0];
}

export function tripForMatch(matchId: string | undefined, trips: Trip[]): Trip | undefined {
  if (!matchId) return undefined;
  return trips.find((t) => t.matchId === matchId);
}

/** The rating a given party left on a trip (each party rates once). */
export function ratingByRater(
  tripId: string | undefined,
  raterId: string,
  ratings: Rating[],
): Rating | undefined {
  if (!tripId) return undefined;
  return ratings.find((r) => r.tripId === tripId && r.raterId === raterId);
}

export function openDisputeForTrip(
  tripId: string | undefined,
  disputes: Dispute[],
): Dispute | undefined {
  if (!tripId) return undefined;
  return disputes.find(
    (d) => d.tripId === tripId && d.status !== "RESOLVED" && d.status !== "DISMISSED",
  );
}

/** A single badge-friendly status for a load, folding in trip progress and disputes. */
export type DisplayStatus = Load["status"] | "IN_TRANSIT" | "DELIVERED" | "DISPUTED";

export function displayStatusForLoad(
  load: Load,
  matches: Match[],
  trips: Trip[],
  disputes: Dispute[],
): DisplayStatus {
  const match = activeMatchForLoad(load.id, matches);
  const trip = tripForMatch(match?.id, trips);

  if (trip && openDisputeForTrip(trip.id, disputes)) return "DISPUTED";
  if (trip) {
    if (trip.status === "DELIVERED" || trip.status === "COMPLETED") return "DELIVERED";
    if (trip.status !== "SCHEDULED") return "IN_TRANSIT";
  }
  // Derive from the active match so a load reflects an accept/confirm even when
  // its own record hasn't been updated (e.g. Postgres-backed loads).
  if (match) {
    if (match.status === "CONFIRMED") return "CONFIRMED";
    if (match.status === "ACCEPTED") return "MATCHED";
  }
  return load.status;
}
