// Client wrappers over the authoritative `commands` router.
import { trpc } from "@/lib/trpc";
import type { MatchOffer } from "@/types/api";

export interface OfferProof {
  offerId: string;
  revision: number;
  termsHash: string;
}

export interface PodInput {
  recipientName: string;
  signature?: string | undefined;
  photoName?: string | undefined;
  photoUrl?: string | undefined;
  note?: string | undefined;
}

export const advanceTripCmd = (
  loadId: string,
  proof?: PodInput,
): Promise<{ ok: true; status: string; progressPct: number }> =>
  trpc.mutation("commands.advanceTrip", { loadId, proof });

export const prepareOfferCmd = (
  loadId: string,
  truckId: string,
  journeyRouteToken: string,
  deadheadRouteToken?: string,
): Promise<MatchOffer> =>
  trpc.mutation("commands.prepareOffer", {
    loadId,
    truckId,
    journeyRouteToken,
    ...(deadheadRouteToken ? { deadheadRouteToken } : {}),
  });

export const acceptMatchCmd = (
  loadId: string,
  truckId: string,
  proof: OfferProof,
): Promise<{ ok: true }> =>
  trpc.mutation("commands.acceptMatch", { loadId, truckId, ...proof });

export const confirmMatchCmd = (
  loadId: string,
  truckId: string | undefined,
  proof: OfferProof,
): Promise<{ ok: true; tripId: string }> =>
  trpc.mutation("commands.confirmMatch", { loadId, truckId, ...proof });

export const acceptRequestCmd = (
  loadId: string,
  truckId: string,
  proof: OfferProof,
): Promise<{ ok: true }> =>
  trpc.mutation("commands.acceptRequest", { loadId, truckId, ...proof });

export type OperationalIncidentKind = "DELAY" | "BREAKDOWN" | "ACCIDENT" | "NO_SHOW" | "CARGO_ISSUE" | "ROUTE_OBSTRUCTION";

export const reportIncidentCmd = (loadId: string, kind: OperationalIncidentKind, description: string, delayMinutes?: number) =>
  trpc.mutation<{ ok: true; incidentId: string }>("commands.reportIncident", {
    loadId,
    kind,
    description,
    ...(delayMinutes ? { delayMinutes } : {}),
  });

export const cancelTripCmd = (loadId: string, reason: string) =>
  trpc.mutation<{ ok: true; incidentId: string }>("commands.cancelTrip", { loadId, reason });
