// Client wrappers over the tRPC `pricing` router — replaces the direct
// import of the pricing engine from the old @tamp/shared package.
import { trpc } from "@/lib/trpc";
import type { CargoType, Money } from "@/types/domain";

export interface PriceBreakdown {
  amount: number;
  perKm: number;
  distanceKm: number;
  components: { label: string; amount: number }[];
}

export const priceLoad = (
  distanceKm: number,
  weightKg: number,
  cargoType: CargoType,
): Promise<PriceBreakdown> => trpc.query("pricing.quote", { distanceKm, weightKg, cargoType });

export const priceLoadMoney = (
  distanceKm: number,
  weightKg: number,
  cargoType: CargoType,
): Promise<Money> => trpc.query("pricing.quoteMoney", { distanceKm, weightKg, cargoType });
