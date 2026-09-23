// Client wrappers over the tRPC `matching` router — replaces the direct
// import of the matching engine from the old @tamp/shared package.
import { trpc } from "@/lib/trpc";
import type { BodyType, CargoType, Load, Party, Place, TruckPosting } from "tamp-backend/src/types";

export interface ScoredMatch {
  truck: TruckPosting;
  operator: Party;
  score: number;
  breakdown: import("tamp-backend/src/types").MatchScoreComponent[];
  hardFilterResults: import("tamp-backend/src/types").RuleResult[];
  passed: boolean;
}

export const scoreLoadAgainstTrucks = (
  load: Load,
  trucks: TruckPosting[],
  operators: Party[],
  owner: Party,
): Promise<ScoredMatch[]> => trpc.matching.score.query({ load, trucks, operators, owner });

export const bodyTypesForCargo = (cargoType: CargoType): Promise<BodyType[]> =>
  trpc.matching.bodyTypesForCargo.query({ cargoType });

export const roadDistanceKm = (a: Place, b: Place): Promise<number> =>
  trpc.matching.roadDistanceKm.query({ a, b });
