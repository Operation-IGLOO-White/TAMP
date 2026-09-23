// Pricing engine — the platform sets the freight rate, not the cargo owner.
// Deterministic and explainable: distance × base rate, adjusted for the cargo
// type (equipment/fuel/permit demands) and the load weight. Excl. VAT.

import type { CargoType, Money } from "./tamp-types";

export const BASE_RATE_PER_KM = 22; // R/km reference, excl. VAT

// Cargo type drives the equipment and handling demands, so it moves the rate.
export const CARGO_RATE_MULTIPLIER: Record<CargoType, number> = {
  GENERAL_PALLETISED: 1.0,
  BULK_DRY: 0.95,
  CONTAINERISED: 1.05,
  BULK_LIQUID: 1.15,
  LIVESTOCK: 1.25,
  REFRIGERATED: 1.3,
  HAZARDOUS: 1.4,
  ABNORMAL: 1.5,
};

export interface PriceBreakdown {
  amount: number; // total, excl. VAT, rounded to the rand
  perKm: number; // effective R/km
  distanceKm: number;
  components: { label: string; amount: number }[];
}

function cargoLabel(c: CargoType): string {
  return c.replaceAll("_", " ").toLowerCase();
}

/** The rate the platform quotes for a load. */
export function priceLoad(distanceKm: number, weightKg: number, cargo: CargoType): PriceBreakdown {
  const base = distanceKm * BASE_RATE_PER_KM;
  const cargoMult = CARGO_RATE_MULTIPLIER[cargo];
  const cargoSurcharge = base * (cargoMult - 1);

  // Heavier loads carry a modest premium (0.90 → 1.20 across 0–34 t).
  const weightFactor = 0.9 + 0.3 * Math.min(1, weightKg / 34000);
  const weightAdj = (base + cargoSurcharge) * (weightFactor - 1);

  const amount = Math.max(0, Math.round(base + cargoSurcharge + weightAdj));
  const perKm = distanceKm > 0 ? Math.round((amount / distanceKm) * 10) / 10 : 0;

  return {
    amount,
    perKm,
    distanceKm,
    components: [
      { label: `Base — ${distanceKm} km × R${BASE_RATE_PER_KM}/km`, amount: Math.round(base) },
      {
        label: `${cargoLabel(cargo)} adjustment (×${cargoMult.toFixed(2)})`,
        amount: Math.round(cargoSurcharge),
      },
      {
        label: `Weight adjustment — ${(weightKg / 1000).toFixed(1)} t`,
        amount: Math.round(weightAdj),
      },
    ],
  };
}

/** Convenience: the quoted amount as a Money value (excl. VAT). */
export function priceLoadMoney(distanceKm: number, weightKg: number, cargo: CargoType): Money {
  return {
    amount: priceLoad(distanceKm, weightKg, cargo).amount,
    currency: "ZAR",
    vat: "excl",
  };
}
