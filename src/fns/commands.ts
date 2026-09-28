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
  trpc.mutation("commands.advanceTrip", { loadId, proof });

export const acceptMatchCmd = (loadId: string, truckId: string): Promise<{ ok: true }> =>
  trpc.mutation("commands.acceptMatch", { loadId, truckId });

export const confirmMatchCmd = (
  loadId: string,
  truckId?: string,
): Promise<{ ok: true; tripId: string }> =>
  trpc.mutation("commands.confirmMatch", { loadId, truckId });

export const acceptRequestCmd = (
  loadId: string,
  truckId: string,
): Promise<{ ok: true; tripId: string }> =>
  trpc.mutation("commands.acceptRequest", { loadId, truckId });
