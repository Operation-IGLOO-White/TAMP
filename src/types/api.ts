import type {
  Acceptance,
  AuditEvent,
  Dispute,
  FuelLog,
  Load,
  MaintenanceTask,
  Match,
  Place,
  Proof,
  Rating,
  Reservation,
  Trip,
  TruckPosting,
} from "./domain";

// These describe the responses consumed by the existing frontend, not backend implementations.
export interface DomainSnapshot {
  loads: Load[];
  trucks: TruckPosting[];
  matches: Match[];
  trips: Trip[];
  ratings: Rating[];
  disputes: Dispute[];
  acceptances: Acceptance[];
  reservations: Reservation[];
  audit: AuditEvent[];
  fuelLogs: FuelLog[];
  maintenance: MaintenanceTask[];
  proofs: Proof[];
}
export interface RouteResult {
  encodedPolyline: string;
  distanceKm: number;
  durationMin: number;
}
export interface Prediction {
  id: string;
  primary: string;
  secondary?: string;
  place?: Place;
}
export interface ClientNotification {
  id: string;
  title: string;
  detail: string;
  at: string;
  unread: boolean;
  tone: string;
  subjectType?: string | null;
  subjectId?: string | null;
}
