// Client wrappers over the tRPC `matching` router — replaces the direct
// import of the matching engine from the old @tamp/shared package.
import { trpc } from "@/lib/trpc";
import type { BodyType, CargoType, Load, Party, Place, TruckPosting } from "@/types/domain";

export interface ScoredMatch {
  truck: TruckPosting;
  operator: Party;
  score: number;
  breakdown: import("@/types/domain").MatchScoreComponent[];
  hardFilterResults: import("@/types/domain").RuleResult[];
  passed: boolean;
}

export const scoreLoadAgainstTrucks = (
  load: Load,
  trucks: TruckPosting[],
  operators: Party[],
  owner: Party,
): Promise<ScoredMatch[]> => trpc.query("matching.score", { load, trucks, operators, owner });

export const bodyTypesForCargo = (cargoType: CargoType): Promise<BodyType[]> =>
  trpc.query("matching.bodyTypesForCargo", { cargoType });

export const roadDistanceKm = (a: Place, b: Place): Promise<number> =>
  trpc.query("matching.roadDistanceKm", { a, b });
