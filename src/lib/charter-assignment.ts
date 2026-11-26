export type AssignmentStatus = "OFFERED" | "ACCEPTED" | "DECLINED" | "CANCELLED";

export const charterAssignmentLabel: Record<AssignmentStatus, string> = {
  OFFERED: "Awaiting driver response",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

export type CharterLegKey = "outbound" | "returnLeg";
export type CharterLegAction = "START" | "ARRIVE_PICKUP" | "BOARD" | "COMPLETE_STOP" | "COMPLETE";

export type CharterLegProgress = {
  stage: "SCHEDULED" | "TO_PICKUP" | "AT_PICKUP" | "ON_ROUTE" | "COMPLETED";
  nextStop: number;
  revision: number;
  updatedAt?: string;
  events?: { action: string; at: string; stopIndex?: number }[];
};

export const charterStageLabel: Record<CharterLegProgress["stage"], string> = {
  SCHEDULED: "Scheduled",
  TO_PICKUP: "Heading to pickup",
  AT_PICKUP: "At pickup",
  ON_ROUTE: "On route",
  COMPLETED: "Completed",
};

export type CharterVehicleProgress = {
  vehicleId: string;
  registration: string;
  status: AssignmentStatus;
  legs: { outbound: CharterLegProgress; returnLeg?: CharterLegProgress };
};

export function charterVehicleComplete(vehicle: CharterVehicleProgress) {
  return vehicle.status === "ACCEPTED" && vehicle.legs.outbound.stage === "COMPLETED"
    && (!vehicle.legs.returnLeg || vehicle.legs.returnLeg.stage === "COMPLETED");
}


export function charterJourneyPercent(legs: { outbound: { progress: CharterLegProgress }; returnLeg?: { progress: CharterLegProgress } }) {
  const portion = (leg: { progress: CharterLegProgress }) => ({ SCHEDULED: 0, TO_PICKUP: 10, AT_PICKUP: 20, ON_ROUTE: 60, COMPLETED: 100 })[leg.progress.stage];
  return Math.round((portion(legs.outbound) + (legs.returnLeg ? portion(legs.returnLeg) : 0)) / (legs.returnLeg ? 2 : 1));
}
