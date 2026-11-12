import type { OrganisationMember } from "@/fns/organisations";
import type { Trip, TruckPosting } from "@/types/domain";

export const DRIVER_ROLE_ID = "ROLE-DRIVER";

export type DriverAvailability = "ON_TRIP" | "AVAILABLE" | "PENDING" | "SUSPENDED";

export function driverAvailability(driver: OrganisationMember, truck?: TruckPosting): DriverAvailability {
  if (driver.suspended) return "SUSPENDED";
  if (driver.verification !== "VERIFIED") return "PENDING";
  if (truck?.status === "ON_TRIP" || truck?.status === "RESERVED") return "ON_TRIP";
  return "AVAILABLE";
}

export function driverTrips(driverId: string, trips: Trip[]) {
  return trips.filter((trip) => trip.assignedDriverId === driverId);
}

export const statusStyle: Record<DriverAvailability, string> = {
  AVAILABLE: "bg-positive/15 text-positive",
  ON_TRIP: "bg-sky-400/15 text-sky-500",
  PENDING: "bg-signal/15 text-signal",
  SUSPENDED: "bg-danger/15 text-danger",
};

