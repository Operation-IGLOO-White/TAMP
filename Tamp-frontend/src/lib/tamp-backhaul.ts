// Backhaul optimisation & forward-haul pre-booking (objective 3.2).
// A truck finishing a trip at D would otherwise run empty back toward its base
// (O). This engine finds open loads it can pick up at/near D — reducing empty
// (non-revenue) kilometres, fuel and emissions — and quantifies the saving.

import { roadDistanceKm } from "./tamp-matching";
import type { Load, Place, TruckPosting } from "./tamp-types";

// Fuel/emissions model — ISO 14083 / GLEC-aligned placeholder for the MVP.
export const EMPTY_L_PER_KM = 0.28; // diesel burn, empty heavy truck
export const CO2_KG_PER_L = 2.68; // diesel emission factor

export type HaulMode = "backhaul" | "forward";

export interface HaulSuggestion {
  load: Load;
  mode: HaulMode;
  repositionKm: number; // deadhead from the truck's free point (D) to the load origin
  paidKm: number; // the load's paid distance
  emptyReturnKm: number; // empty leg the truck faces without a backhaul (D → base)
  emptyKmReduced: number; // net empty running avoided by taking this load
  fuelSavedL: number;
  co2SavedKg: number;
  eligible: boolean; // capacity + body + still within the load's pickup window
}

/** Eligibility from the truck's free point — no origin-radius check (the truck
 *  will already be at D, not its posted location). */
function isEligible(load: Load, truck: TruckPosting, availableFrom: string): boolean {
  const capacityOk = truck.payloadCapacityKg >= load.weightKg;
  const bodyOk = load.requiredBodyTypes.includes(truck.bodyType);
  const timeOk = new Date(availableFrom).getTime() <= new Date(load.pickupWindow.to).getTime();
  return capacityOk && bodyOk && timeOk;
}

export interface HaulParams {
  truck: TruckPosting;
  fromPlace: Place; // where the truck becomes free (the trip destination, D)
  basePlace: Place; // where it would otherwise return empty (the trip origin, O)
  availableFrom: string; // ISO — when the truck is free (ETA)
  openLoads: Load[];
  mode: HaulMode;
  radiusKm?: number; // how far the truck will reposition to pick up (default 200)
}

/** Ranked next-load suggestions for a returning/finishing truck. */
export function haulSuggestions(p: HaulParams): HaulSuggestion[] {
  const radius = p.radiusKm ?? 200;
  const emptyReturnKm = roadDistanceKm(p.fromPlace, p.basePlace);

  return p.openLoads
    .map((load): HaulSuggestion | null => {
      const repositionKm = roadDistanceKm(p.fromPlace, load.origin);
      if (repositionKm > radius) return null;

      // Backhaul must head back toward base (shrinking the empty return);
      // forward-haul pre-booking accepts any onward direction.
      if (p.mode === "backhaul") {
        const towardBase = roadDistanceKm(load.destination, p.basePlace) < emptyReturnKm;
        if (!towardBase) return null;
      }

      const emptyKmReduced = Math.max(0, emptyReturnKm - repositionKm);
      const fuelSavedL = emptyKmReduced * EMPTY_L_PER_KM;
      const co2SavedKg = fuelSavedL * CO2_KG_PER_L;

      return {
        load,
        mode: p.mode,
        repositionKm,
        paidKm: load.distanceKm,
        emptyReturnKm,
        emptyKmReduced,
        fuelSavedL,
        co2SavedKg,
        eligible: isEligible(load, p.truck, p.availableFrom),
      };
    })
    .filter((x): x is HaulSuggestion => x !== null)
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.emptyKmReduced - a.emptyKmReduced ||
        a.repositionKm - b.repositionKm,
    );
}

/** Compute the haul metrics for one specific load (e.g. an already-reserved
 *  backhaul), inferring backhaul vs forward from the load's direction. */
export function haulMetrics(
  truck: TruckPosting,
  fromPlace: Place,
  basePlace: Place,
  availableFrom: string,
  load: Load,
): HaulSuggestion {
  const emptyReturnKm = roadDistanceKm(fromPlace, basePlace);
  const repositionKm = roadDistanceKm(fromPlace, load.origin);
  const emptyKmReduced = Math.max(0, emptyReturnKm - repositionKm);
  const fuelSavedL = emptyKmReduced * EMPTY_L_PER_KM;
  const mode: HaulMode =
    roadDistanceKm(load.destination, basePlace) < emptyReturnKm ? "backhaul" : "forward";
  return {
    load,
    mode,
    repositionKm,
    paidKm: load.distanceKm,
    emptyReturnKm,
    emptyKmReduced,
    fuelSavedL,
    co2SavedKg: fuelSavedL * CO2_KG_PER_L,
    eligible: isEligible(load, truck, availableFrom),
  };
}

/** Best pre-bookable next load for a finishing trip: prefer a backhaul that
 *  reduces the empty return; fall back to the best forward-haul. */
export function bestNextLoad(params: Omit<HaulParams, "mode">): HaulSuggestion | undefined {
  const backhaul = haulSuggestions({ ...params, mode: "backhaul" }).find((s) => s.eligible);
  if (backhaul) return backhaul;
  return haulSuggestions({ ...params, mode: "forward" }).find((s) => s.eligible);
}
