// Server-authoritative state-transition rules. The snapshot sync is a store, but
// these guards make the server the AUTHORITY for the transitions that matter:
// a crafted client cannot mark a trip DELIVERED without a POD, jump a trip
// straight to delivered, move a trip backwards, or confirm a match whose load it
// doesn't own. Pure functions so they're unit-testable without a database.

export const TRIP_ORDER: Record<string, number> = {
  SCHEDULED: 0,
  AT_PICKUP: 1,
  LOADED: 2,
  IN_TRANSIT: 3,
  AT_DROPOFF: 4,
  DELIVERED: 5,
  COMPLETED: 6,
};

/**
 * Returns an error message if a trip's status change is illegal, else null.
 * `hasProof` = a Proof of Delivery exists for the trip (in the DB or this sync).
 */
export function tripTransitionError(
  prev: { status: string } | undefined,
  next: { status: string },
  hasProof: boolean,
): string | null {
  if (next.status === "CANCELLED") return null; // cancellation always allowed
  const newIdx = TRIP_ORDER[next.status];
  if (newIdx === undefined) return null; // unknown status — not our concern

  // A brand-new trip must begin at the start of the lifecycle.
  if (!prev) {
    return newIdx > TRIP_ORDER["AT_PICKUP"]!
      ? `A new trip can't start at ${next.status}.`
      : null;
  }

  const oldIdx = TRIP_ORDER[prev.status] ?? -1;
  if (prev.status === "CANCELLED" || prev.status === "COMPLETED") return null; // terminal; allow no-op resend
  if (newIdx < oldIdx) {
    return `A trip can't move backwards (${prev.status} → ${next.status}).`;
  }
  if ((next.status === "DELIVERED" || next.status === "COMPLETED") && newIdx > oldIdx) {
    if (oldIdx < TRIP_ORDER["IN_TRANSIT"]!) {
      return "A trip must be in transit before it can be delivered.";
    }
    if (!hasProof) {
      return "Proof of delivery is required before a trip can be marked delivered.";
    }
  }
  return null;
}

/**
 * Guards a match reaching CONFIRMED.
 * - From ACCEPTED (the owner already agreed) either party may finalise — this is
 *   the carrier's second step of the handshake.
 * - From anything else (OFFERED/SUGGESTED → CONFIRMED, i.e. the owner awarding a
 *   request or a suggestion) only the load owner may confirm.
 * Returns an error message, or null if allowed.
 */
export function matchConfirmError(
  prev: { status: string } | undefined,
  next: { status: string },
  loadOwnerId: string | undefined,
  actorId: string,
): string | null {
  if (next.status !== "CONFIRMED" || prev?.status === "CONFIRMED") return null;
  if (prev?.status === "ACCEPTED") return null; // owner already accepted; carrier may finalise
  if (loadOwnerId && loadOwnerId !== actorId) {
    return "Only the load owner can confirm a match.";
  }
  return null;
}
