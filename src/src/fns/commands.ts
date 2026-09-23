// Client wrappers over the authoritative `commands` router.
import { trpc } from "@/lib/trpc";

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
  trpc.commands.advanceTrip.mutate({ loadId, proof });

export const acceptMatchCmd = (loadId: string, truckId: string): Promise<{ ok: true }> =>
  trpc.commands.acceptMatch.mutate({ loadId, truckId });

export const confirmMatchCmd = (
  loadId: string,
  truckId?: string,
): Promise<{ ok: true; tripId: string }> =>
  trpc.commands.confirmMatch.mutate({ loadId, truckId });

export const acceptRequestCmd = (
  loadId: string,
  truckId: string,
): Promise<{ ok: true; tripId: string }> =>
  trpc.commands.acceptRequest.mutate({ loadId, truckId });
