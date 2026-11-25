import { createContext } from "react";
import type { AssignmentStatus, CharterLegKey, CharterLegProgress } from "@/lib/charter-assignment";
import type { Place } from "@/types/domain";

type PassengerCount = { passengers: number; wheelchairPositions: number };
export type CharterDriverLeg = {
  origin: Place;
  destination: Place;
  stops: Place[];
  pickupAt: string;
  assigned: PassengerCount | null;
  progress: CharterLegProgress;
  groupPassengers: number;
  groupWheelchairPositions: number;
};

export type CharterDriverJob = {
  bookingId: string;
  reservationStartsAt: string;
  responseDeadline?: string;
  supplier: string;
  customer: string;
  vehicle: { id: string; registration: string; make: string; model: string };
  itinerary: { outbound: CharterDriverLeg; returnLeg?: CharterDriverLeg };
  notes: string;
  status: AssignmentStatus;
  reason?: string;
};

export type CharterPosition = { lat: number; lng: number; accuracyM: number; recordedAt: string };
export type SharingTarget = { bookingId: string; vehicleId: string; leg: CharterLegKey };

export function activeCharterLeg(job: CharterDriverJob): CharterLegKey | undefined {
  if (job.status !== "ACCEPTED") return undefined;
  return (["outbound", "returnLeg"] as const).find((key) => {
    const stage = job.itinerary[key]?.progress?.stage;
    return stage === "TO_PICKUP" || stage === "AT_PICKUP" || stage === "ON_ROUTE";
  });
}

export function charterJobsKey(party: { id: string; activeOrganisationId?: string | null } | null | undefined) {
  return ["charter-driver-jobs", party?.id, party?.activeOrganisationId] as const;
}

export const CharterLocationContext = createContext<{
  active: boolean;
  state: "requesting" | "sharing" | "error";
  message: string;
  retry: () => void;
}>({ active: false, state: "requesting", message: "", retry: () => {} });
