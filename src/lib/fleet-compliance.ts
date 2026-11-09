import type { MaintenanceTask, TruckPosting, Vehicle } from "@/types/domain";

export type ComplianceLevel = "COMPLIANT" | "DUE_SOON" | "ACTION_REQUIRED";

export interface FleetCompliance {
  level: ComplianceLevel;
  score: number;
  blockers: string[];
  warnings: string[];
  licenceDaysRemaining: number | null;
}

const DAY = 86_400_000;

export function assessFleetCompliance(
  truck: TruckPosting,
  vehicle?: Vehicle,
  maintenance: MaintenanceTask[] = [],
  now = Date.now(),
): FleetCompliance {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const expiry = truck.licenceExpiry ? new Date(truck.licenceExpiry).getTime() : Number.NaN;
  const licenceDaysRemaining = Number.isFinite(expiry) ? Math.ceil((expiry - now) / DAY) : null;
  const documents = vehicle?.documents ?? truck.documents ?? [];

  if (licenceDaysRemaining === null) blockers.push("Licence expiry date is missing");
  else if (licenceDaysRemaining < 0) blockers.push("Vehicle licence has expired");
  else if (licenceDaysRemaining <= 30)
    warnings.push(`Vehicle licence expires in ${licenceDaysRemaining} days`);
  if (documents.length < 3)
    blockers.push(`Vehicle documents incomplete (${documents.length}/3 uploaded)`);
  if (!vehicle) warnings.push("Vehicle review is pending");
  else if (vehicle.verification === "REJECTED") blockers.push("Vehicle verification was rejected");
  else if (vehicle?.verification === "PENDING") warnings.push("Vehicle review is pending");
  if (vehicle?.status === "SUSPENDED" || vehicle?.status === "RETIRED")
    blockers.push(`Vehicle is ${vehicle.status.toLowerCase()}`);

  const scheduled = maintenance.filter(
    (item) => item.truckId === truck.id && item.status === "SCHEDULED",
  );
  const overdue = scheduled.filter((item) => new Date(item.dueDate).getTime() < now);
  if (overdue.length) blockers.push(`${overdue.length} overdue maintenance task(s)`);
  else if (scheduled.some((item) => new Date(item.dueDate).getTime() <= now + 30 * DAY))
    warnings.push("Maintenance is due within 30 days");

  return {
    level: blockers.length ? "ACTION_REQUIRED" : warnings.length ? "DUE_SOON" : "COMPLIANT",
    score: Math.max(0, 100 - blockers.length * 25 - warnings.length * 10),
    blockers,
    warnings,
    licenceDaysRemaining,
  };
}
