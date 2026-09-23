// Client wrappers over the tRPC `loads` router. Signatures match the previous
// TanStack server functions so existing React Query call sites are unchanged.
import { trpc } from "@/lib/trpc";
import type { CargoType, Load, Place } from "@/lib/tamp-types";

export const listLoads = (): Promise<Load[]> => trpc.loads.list.query();

export interface CreateLoadInput {
  ownerId: string;
  cargoType: CargoType;
  weightKg: number;
  volumeM3?: number | undefined;
  origin: Place;
  destination: Place;
  distanceKm: number;
  pickupWindow: { from: string; to: string };
  deliveryBy: string;
  specialRequirements?: string | undefined;
}

export const createLoad = ({ data }: { data: CreateLoadInput }): Promise<{ id: string }> =>
  trpc.loads.create.mutate(data);
