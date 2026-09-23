// Rule-based matching engine — TAMP-SPEC-GUIDE.md §6.
// Deterministic, explainable. No AI/ML.

import type {
  BodyType,
  CargoType,
  Load,
  MatchScoreComponent,
  Party,
  Place,
  RuleResult,
  TruckPosting,
} from "./tamp-types";

const SOURCING_RADIUS_KM = 150;
const ROAD_FACTOR = 1.25;

// The cargo type determines which truck bodies can legally/practically carry
// it — the platform derives this, the cargo owner never picks a body type.
export const CARGO_BODY_COMPAT: Record<CargoType, BodyType[]> = {
  GENERAL_PALLETISED: ["TAUTLINER", "DROPSIDE", "FLATBED"],
  BULK_DRY: ["TIPPER", "SIDE_TIPPER", "DROPSIDE"],
  BULK_LIQUID: ["TANKER"],
  REFRIGERATED: ["REFRIGERATED"],
  ABNORMAL: ["LOWBED", "FLATBED"],
  CONTAINERISED: ["FLATBED", "TAUTLINER"],
  LIVESTOCK: ["DROPSIDE"],
  HAZARDOUS: ["TANKER", "TAUTLINER"],
};

/** Body types the platform will accept for a given cargo type. */
export function bodyTypesForCargo(cargo: CargoType): BodyType[] {
  return CARGO_BODY_COMPAT[cargo];
}

function haversineKm(a: Place, b: Place): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight-line distance x road factor (mock). Spec §13. */
export function roadDistanceKm(a: Place, b: Place): number {
  return Math.round(haversineKm(a, b) * ROAD_FACTOR);
}

function windowsOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return new Date(aFrom) <= new Date(bTo) && new Date(bFrom) <= new Date(aTo);
}

/** §6.1 hard filters. A truck failing any of these is not suggested. */
export function hardFilterResults(
  load: Load,
  truck: TruckPosting,
  operator: Party,
  owner: Party,
): RuleResult[] {
  const proximityKm = roadDistanceKm(load.origin, truck.currentLocation);

  return [
    {
      ruleId: "R-CAPACITY",
      label: "Payload capacity suits the load",
      passed: truck.payloadCapacityKg >= load.weightKg,
      detail:
        truck.payloadCapacityKg >= load.weightKg
          ? `${truck.payloadCapacityKg.toLocaleString("en-ZA")} kg capacity covers the ${load.weightKg.toLocaleString("en-ZA")} kg load.`
          : "Payload capacity is below the load weight.",
    },
    {
      ruleId: "R-BODY",
      label: "Body type suits the cargo",
      passed: load.requiredBodyTypes.includes(truck.bodyType),
      detail: load.requiredBodyTypes.includes(truck.bodyType)
        ? `${truck.bodyType} is an accepted body type for this cargo.`
        : "Body type doesn't suit this cargo.",
    },
    {
      ruleId: "R-WINDOW",
      label: "Available during the pickup window",
      passed: windowsOverlap(
        truck.availableFrom,
        truck.availableTo,
        load.pickupWindow.from,
        load.pickupWindow.to,
      ),
      detail: windowsOverlap(
        truck.availableFrom,
        truck.availableTo,
        load.pickupWindow.from,
        load.pickupWindow.to,
      )
        ? "Truck's availability window overlaps the pickup window."
        : "Not available during the pickup window.",
    },
    {
      ruleId: "R-RADIUS",
      label: "Within sourcing radius",
      passed: proximityKm <= SOURCING_RADIUS_KM,
      detail:
        proximityKm <= SOURCING_RADIUS_KM
          ? `${proximityKm} km from ${load.origin.label} - within the ${SOURCING_RADIUS_KM} km radius.`
          : `Outside the ${SOURCING_RADIUS_KM} km sourcing radius (${proximityKm} km away).`,
    },
    {
      ruleId: "R-STATUS",
      label: "Truck posting is available",
      passed: truck.status === "AVAILABLE",
      detail:
        truck.status === "AVAILABLE"
          ? "Truck posting is available."
          : "Truck is already committed.",
    },
    {
      ruleId: "R-ACTIVE",
      label: "Neither party suspended",
      passed: !operator.suspended && !owner.suspended,
      detail: "Internal eligibility check.",
    },
  ];
}

/**
 * §6.2 weighted score (100 points), only meaningful once hard filters pass.
 * The six components map to the six matching factors: real-time location,
 * load characteristics, availability, routing constraints, historical
 * behaviour and cost efficiency (the platform's engine-set price).
 */
export function scoreComponents(
  load: Load,
  truck: TruckPosting,
  operator: Party,
): MatchScoreComponent[] {
  const proximityKm = roadDistanceKm(load.origin, truck.currentLocation);
  const proximityEarned = Math.max(0, 25 * (1 - proximityKm / SOURCING_RADIUS_KM));

  const utilisation = load.weightKg / truck.payloadCapacityKg;
  let capacityEarned: number;
  if (utilisation > 1) {
    capacityEarned = 0;
  } else if (utilisation >= 0.8 && utilisation < 1) {
    capacityEarned = 20;
  } else if (utilisation >= 0.5) {
    capacityEarned = 20 * (0.6 + 0.4 * ((utilisation - 0.5) / 0.3));
  } else {
    capacityEarned = 20 * 0.6 * (utilisation / 0.5);
  }

  const slackHours = Math.max(
    0,
    (new Date(load.pickupWindow.from).getTime() - new Date(truck.availableFrom).getTime()) / 36e5,
  );
  const timingEarned = Math.min(15, (slackHours / 6) * 15);

  const laneEarned = (() => {
    const lanes = truck.preferredLanes ?? [];
    const exact = lanes.some(
      (l) => l.origin === load.origin.label && l.destination === load.destination.label,
    );
    if (exact) return 15;
    const provinceMatch = lanes.some(
      (l) =>
        l.origin.includes(load.origin.province) ||
        l.destination.includes(load.destination.province),
    );
    return provinceMatch ? 7.5 : 0;
  })();

  // Historical behaviour: service rating (0–10) plus a bounded experience bonus
  // from the number of completed transactions (0–5).
  const ratingPortion = (operator.ratingAvg === null ? 0.7 : operator.ratingAvg / 5) * 10;
  const experiencePortion = Math.min(5, operator.ratingCount * 0.5);
  const historyEarned = ratingPortion + experiencePortion;

  // Cost efficiency: deadhead to pickup as a share of the paid trip. Less empty
  // running against the engine-set price means a better-value match.
  const tripKm = Math.max(1, load.distanceKm);
  const costEarned = 10 * (1 - Math.min(1, proximityKm / tripKm));

  return [
    {
      ruleId: "R-PROXIMITY",
      label: "Truck is near the pickup point",
      weight: 25,
      earned: proximityEarned,
      detail: `${proximityKm} km from ${load.origin.label} - within the ${SOURCING_RADIUS_KM} km radius.`,
    },
    {
      ruleId: "R-CAPACITY-FIT",
      label: "Capacity suits the load size",
      weight: 20,
      earned: capacityEarned,
      detail: `Load uses ${Math.round(utilisation * 100)}% of the truck's ${truck.payloadCapacityKg.toLocaleString("en-ZA")} kg capacity.`,
    },
    {
      ruleId: "R-TIMING",
      label: "Timing works comfortably",
      weight: 15,
      earned: timingEarned,
      detail:
        slackHours >= 6
          ? "6+ hours of slack against the pickup window."
          : `${slackHours.toFixed(1)}h slack against the pickup window.`,
    },
    {
      ruleId: "R-LANE",
      label: "Destination matches a preferred lane",
      weight: 15,
      earned: laneEarned,
      detail:
        laneEarned === 15
          ? "Exact preferred-lane match."
          : laneEarned > 0
            ? "Province-level lane match."
            : "No preferred-lane match.",
    },
    {
      ruleId: "R-HISTORY",
      label: "Track record and experience",
      weight: 15,
      earned: historyEarned,
      detail:
        operator.ratingAvg === null
          ? `New to TAMP - no rating yet (${operator.ratingCount} trips).`
          : `Rated ${operator.ratingAvg.toFixed(1)}/5 across ${operator.ratingCount} completed trips.`,
    },
    {
      ruleId: "R-COST",
      label: "Cost-efficient against the quoted rate",
      weight: 10,
      earned: costEarned,
      detail: `${proximityKm} km deadhead against a ${load.distanceKm} km paid trip.`,
    },
  ];
}

export interface ScoredMatch {
  truck: TruckPosting;
  operator: Party;
  score: number;
  breakdown: MatchScoreComponent[];
  hardFilterResults: RuleResult[];
  passed: boolean;
}

/** Runs hard filters then, for passing trucks, the weighted score. */
export function scoreLoadAgainstTrucks(
  load: Load,
  trucks: TruckPosting[],
  operators: Party[],
  owner: Party,
): ScoredMatch[] {
  return trucks
    .map((truck) => {
      const operator = operators.find((p) => p.id === truck.transporterId);
      if (!operator) return null;
      const filters = hardFilterResults(load, truck, operator, owner);
      const passed = filters.every((f) => f.passed);
      const breakdown = passed ? scoreComponents(load, truck, operator) : [];
      const score = Math.round(breakdown.reduce((s, c) => s + c.earned, 0));
      return { truck, operator, score, breakdown, hardFilterResults: filters, passed };
    })
    .filter((m): m is ScoredMatch => m !== null)
    .sort((a, b) => b.score - a.score);
}
