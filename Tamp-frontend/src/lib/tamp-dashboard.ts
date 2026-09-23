// Derived metrics shared by the role dashboards. Everything here reads from
// the store's entities — nothing is persisted.

import type { Dispute, Load, Match, Party, Trip, TruckPosting } from "./tamp-types";

export const ACTIVE_TRIP_STATUSES = [
  "SCHEDULED",
  "AT_PICKUP",
  "LOADED",
  "IN_TRANSIT",
  "AT_DROPOFF",
];

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
}

export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

export function isActiveTrip(status: Trip["status"]): boolean {
  return ACTIVE_TRIP_STATUSES.includes(status);
}

export interface EnrichedTrip {
  trip: Trip;
  match: Match | undefined;
  load: Load | undefined;
  truck: TruckPosting | undefined;
  driver: Party | undefined;
  owner: Party | undefined;
}

export function enrichTrip(
  trip: Trip,
  data: { matches: Match[]; loads: Load[]; trucks: TruckPosting[]; parties: Party[] },
): EnrichedTrip {
  const match = data.matches.find((m) => m.id === trip.matchId);
  const load = data.loads.find((l) => l.id === match?.loadId);
  const truck = data.trucks.find((t) => t.id === match?.truckPostingId);
  const driver = truck?.driverId ? data.parties.find((p) => p.id === truck.driverId) : undefined;
  const owner = load ? data.parties.find((p) => p.id === load.ownerId) : undefined;
  return { trip, match, load, truck, driver, owner };
}

export function lastEventAt(trip: Trip): string {
  return trip.events[trip.events.length - 1]?.at ?? trip.events[0]?.at ?? trip.events[0]?.at ?? "";
}

export function suggestionCount(loadId: string, matches: Match[]): number {
  return matches.filter((m) => m.loadId === loadId && m.status === "SUGGESTED").length;
}

/** A simple mock ETA: pickup-window start plus a road-time estimate (70 km/h). */
export function estimateEta(load: Load, trip: Trip): Date {
  if (trip.etaAt) return new Date(trip.etaAt);
  const remainingKm = load.distanceKm * (1 - trip.progressPct / 100);
  return new Date(Date.now() + (remainingKm / 70) * 36e5);
}

export function tripDisputed(trip: Trip, disputes: Dispute[]): boolean {
  return (
    trip.disputed ||
    disputes.some(
      (d) => d.tripId === trip.id && (d.status === "OPEN" || d.status === "UNDER_REVIEW"),
    )
  );
}

/** Cost per tonne-km — the number a supply-chain lead is measured on. */
export function costPerTonneKm(load: Load): number | null {
  const tonnes = load.weightKg / 1000;
  const denom = tonnes * load.distanceKm;
  if (!load.targetRate || denom <= 0) return null;
  return load.targetRate.amount / denom;
}

export const zarShort = (n: number) => "R " + Math.round(n).toLocaleString("en-ZA");
