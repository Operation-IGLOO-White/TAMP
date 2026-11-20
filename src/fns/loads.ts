// Client wrappers over the tRPC `loads` router. Signatures match the previous
// TanStack server functions so existing React Query call sites are unchanged.
import { trpc } from "@/lib/trpc";
import type { CargoType, Load, Place } from "@/types/domain";

export const listLoads = (): Promise<Load[]> => trpc.query("loads.list");

export interface CreateLoadInput {
  ownerId: string;
  cargoType: CargoType;
  weightKg: number;
  volumeM3?: number | undefined;
  trucksRequired?: number;
  pricingMode?: "PLATFORM" | "CUSTOM";
  rateBasis?: "PER_TRIP" | "PER_TRUCK" | "PER_TONNE" | "PER_KM";
  offeredRate?: Load["offeredRate"];
  origin: Place;
  destination: Place;
  distanceKm: number;
  pickupWindow: { from: string; to: string };
  deliveryBy: string;
  specialRequirements?: string | undefined;
}

export const createLoad = ({ data }: { data: CreateLoadInput }): Promise<{ id: string }> =>
  trpc.mutation("loads.create", data);
