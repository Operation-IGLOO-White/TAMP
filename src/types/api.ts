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
  TripIncident,
  Invoice,
  FinancialTransaction,
  DispatchAssignment,
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
  incidents: TripIncident[];
  invoices: Invoice[];
  transactions: FinancialTransaction[];
  dispatches: DispatchAssignment[];
}
export interface RouteResult {
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  distanceKm: number;
  durationMin: number;
  provider: "valhalla" | string;
  routeToken: string;
  expiresAt: string;
}
export interface MatchOffer {
  id: string;
  matchId: string;
  routeQuoteId: string;
  revision: number;
  termsHash: string;
  status: "OPEN" | "PARTIALLY_ACCEPTED" | "CONFIRMED" | "SUPERSEDED";
  createdAt: string;
  expiresAt: string;
  ownerAcceptedAt?: string | null;
  transporterAcceptedAt?: string | null;
  routeQuote: {
    id: string;
    matchId: string;
    loadId: string;
    truckId: string;
    deadhead: RouteSnapshot | null;
    journey: RouteSnapshot;
    provider: string;
    createdAt: string;
  };
}
export type RouteSnapshot = Omit<RouteResult, "routeToken" | "expiresAt">;
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
