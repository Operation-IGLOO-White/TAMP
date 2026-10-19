// Frontend wire contracts derived from the supplied spec and existing UI.
export type UUID = string;
export type ISODate = string; // "2026-08-24T06:30:00+02:00"
export type Money = { amount: number; currency: "ZAR"; vat: "incl" | "excl" };

export type Role = "FREIGHT_OWNER" | "TRANSPORTER" | "DRIVER" | "ADMIN";
export type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface Party {
  avatarUrl?: string | undefined;
  onboardingComplete?: boolean;
  onboardingUserType?: OnboardingUserType;
  kycDocument?: { name: string; uploadedAt: string; url?: string } | undefined;
  id: UUID;
  role: Role;
  companyName: string;
  contactName: string;
  email: string; // masked until CONFIRMED (C6)
  phone: string; // masked until CONFIRMED (C6)
  province: string;
  verification: VerificationStatus;
  ratingAvg: number | null; // 1–5, null until 3 ratings received
  ratingCount: number;
  suspended: boolean;
  createdAt: ISODate;
}

export type CargoType =
  | "GENERAL_PALLETISED"
  | "BULK_DRY"
  | "BULK_LIQUID"
  | "REFRIGERATED"
  | "ABNORMAL"
  | "CONTAINERISED"
  | "LIVESTOCK"
  | "HAZARDOUS";

export type BodyType =
  | "TAUTLINER"
  | "FLATBED"
  | "TIPPER"
  | "TANKER"
  | "REFRIGERATED"
  | "SIDE_TIPPER"
  | "LOWBED"
  | "DROPSIDE";

export interface Place {
  label: string;
  province: string;
  lat: number;
  lng: number;
}

export interface Load {
  id: UUID; // display ref: LD-0142
  ownerId: UUID;
  reference: string;
  cargoType: CargoType;
  weightKg: number;
  volumeM3?: number | undefined;
  requiredBodyTypes: BodyType[];
  origin: Place;
  destination: Place;
  distanceKm: number; // computed, straight-line × 1.25 road factor (mock)
  pickupWindow: { from: ISODate; to: ISODate };
  deliveryBy: ISODate;
  targetRate?: Money;
  specialRequirements?: string | undefined;
  status: LoadStatus;
  createdAt: ISODate;
}

export interface TruckPosting {
  licenceExpiry?: string | undefined;
  driverId?: string | undefined;
  photos?: string[];
  documents?: string[];
  id: UUID; // display ref: TR-0087
  transporterId: UUID;
  registration: string; // masked to last 3 chars until CONFIRMED
  bodyType: BodyType;
  payloadCapacityKg: number;
  volumeCapacityM3?: number;
  currentLocation: Place;
  availableFrom: ISODate;
  availableTo: ISODate;
  preferredLanes?: { origin: string; destination: string }[] | undefined;
  status: TruckStatus;
  createdAt: ISODate;
}

export interface Match {
  confirmedByOwnerAt?: string;
  confirmedByTransporterAt?: string;
  id: UUID; // display ref: MT-0311
  loadId: UUID;
  truckPostingId: UUID;
  score: number; // 0–100
  breakdown: MatchScoreComponent[]; // required by C2
  hardFilterResults: RuleResult[];
  status: MatchStatus;
  initiatedBy: "FREIGHT_OWNER" | "TRANSPORTER" | "SYSTEM";
  agreedRate?: Money;
  activeOfferId?: string;
  offerRevision?: number;
  termsHash?: string;
  expiresAt: ISODate;
  createdAt: ISODate;
}

export interface MatchScoreComponent {
  ruleId: string; // "R-PROXIMITY"
  label: string; // "Truck is near the pickup point"
  weight: number; // 30
  earned: number; // 24.6
  detail: string; // "42 km from Bethal — within the 150 km radius"
}

export interface RuleResult {
  ruleId: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface Trip {
  dispatchStatus?: "AWAITING_DRIVER" | "ASSIGNED" | "NEEDS_DRIVER";
  assignedDriverId?: UUID | null;
  disputed?: boolean;
  operationalStatus?: "DELAYED" | "ACTION_REQUIRED" | "CANCELLED";
  activeIncidentIds?: UUID[];
  id: UUID; // display ref: TP-0058
  matchId: UUID;
  status: TripStatus;
  events: TripEvent[];
  simulatedPosition: { lat: number; lng: number; updatedAt: ISODate } | null;
  progressPct: number;
  etaAt: ISODate | null; // computed from simulation, chipped "Simulated"
  geofences?: Partial<Record<"PICKUP" | "DESTINATION", { inside: boolean; distanceM?: number; enteredAt?: ISODate; exitedAt?: ISODate }>>;
  geofenceEvents?: GeofenceEvent[];
  suggestedAction?: TripStatus | null;
}

export type IncidentKind = "DELAY" | "BREAKDOWN" | "ACCIDENT" | "NO_SHOW" | "CARGO_ISSUE" | "ROUTE_OBSTRUCTION" | "CANCELLATION";

export interface TripIncident {
  id: UUID;
  tripId: UUID;
  loadId: UUID;
  truckId: UUID;
  kind: IncidentKind;
  description: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVING" | "RESOLVED";
  delayMinutes?: number;
  reportedById: UUID;
  reportedByRole: Role;
  reportedAt: ISODate;
  location?: { lat: number; lng: number; recordedAt: ISODate } | null;
  acknowledgedAt?: ISODate;
  acknowledgedById?: UUID;
  assignedToId?: UUID;
  assignedAt?: ISODate;
  resolutionStartedAt?: ISODate;
  resolutionNote?: string;
  resolvedAt?: ISODate;
  resolvedById?: UUID;
  lastNote?: string;
  updates?: { action: string; at: ISODate; byUserId: UUID; note?: string }[];
}

export interface GeofenceEvent {
  id: UUID;
  zone: "PICKUP" | "DESTINATION";
  type: "ENTERED" | "EXITED";
  at: ISODate;
  lat: number;
  lng: number;
  distanceM: number;
}

export interface TripEvent {
  status: TripStatus;
  at: ISODate;
  note?: string;
  byUserId: UUID;
}

export interface Rating {
  id: UUID;
  tripId: UUID;
  raterId: UUID;
  rateeId: UUID;
  stars: 1 | 2 | 3 | 4 | 5;
  tags: string[]; // "On time", "Good communication", "Cargo handled well"
  comment?: string | undefined;
  createdAt: ISODate;
}

export interface AuditEvent {
  eventId: string;
  id: UUID;
  eventType: string;
  actorId: UUID;
  actorRole: Role | "SYSTEM";
  subjectType: "LOAD" | "TRUCK" | "MATCH" | "TRIP" | "USER" | "DISPUTE" | "INVOICE";
  subjectId: UUID;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  at: ISODate;
}

export type InvoiceStatus = "ISSUED" | "PAID" | "SETTLED" | "VOID";
export interface Invoice {
  id: UUID;
  invoiceNumber: string;
  tripId: UUID;
  loadId: UUID;
  matchId: UUID;
  ownerId: UUID;
  carrierId: UUID;
  currency: "ZAR";
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  platformFeeRate: number;
  platformFee: number;
  carrierPayout: number;
  status: InvoiceStatus;
  payoutStatus: "PENDING" | "PAID";
  issuedAt: ISODate;
  dueAt: ISODate;
  paidAt?: ISODate | null;
  paidOutAt?: ISODate | null;
  paymentReference?: string;
  payoutReference?: string;
  lineItems: { description: string; quantity: number; unitAmount: number; amount: number }[];
}

export interface FinancialTransaction {
  id: UUID;
  invoiceId: UUID;
  type: "PAYMENT" | "PAYOUT" | "VOID";
  amount: number;
  currency: "ZAR";
  status: "SUCCEEDED";
  reference: string;
  note?: string;
  createdAt: ISODate;
  recordedById: UUID;
}

export interface DispatchAssignment {
  id: UUID;
  tripId: UUID;
  loadId: UUID;
  truckId: UUID;
  carrierId: UUID;
  driverId: UUID;
  status: "OFFERED" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  offeredAt: ISODate;
  respondedAt?: ISODate | null;
  note?: string;
  timeline: { status: string; at: ISODate; byUserId: UUID; note?: string }[];
}

export interface Dispute {
  id: UUID;
  tripId: UUID;
  raisedById: UUID;
  category: "NON_ARRIVAL" | "DAMAGE" | "RATE_DISAGREEMENT" | "DELAY" | "CONDUCT" | "OTHER";
  description: string;
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";
  resolutionNote?: string;
  createdAt: ISODate;
  resolvedAt?: ISODate;
}
export type LoadStatus =
  "DRAFT" | "POSTED" | "MATCHED" | "CONFIRMED" | "COMPLETED" | "CLOSED" | "CANCELLED" | "EXPIRED";
export type TruckStatus = "AVAILABLE" | "RESERVED" | "ON_TRIP" | "OFFLINE" | "EXPIRED";
export type MatchStatus =
  "SUGGESTED" | "OFFERED" | "ACCEPTED" | "CONFIRMED" | "REJECTED" | "WITHDRAWN" | "EXPIRED";
export type TripStatus =
  | "SCHEDULED"
  | "EN_ROUTE_PICKUP"
  | "AT_PICKUP"
  | "LOADED"
  | "IN_TRANSIT"
  | "AT_DROPOFF"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";
export type DisputeCategory = Dispute["category"];
export type OnboardingUserType = "CARGO_OWNER" | "CARRIER" | "BROKER" | "DRIVER";
export interface OnboardingData {
  userType: OnboardingUserType;
  business?:
    | {
        companyName: string;
        registrationNumber: string;
        businessType: string;
        address: string;
        contactDetails: string;
        vat: string;
      }
    | undefined;
  driver?:
    | {
        vehicleClasses: string[];
        licenceCode: string;
        prdp: boolean;
        workType: "OWNER" | "FLEET";
        fleetName?: string;
        truck?: { registration: string; bodyType: BodyType; capacityT: number };
      }
    | undefined;
  documents?: string[];
}
export interface Acceptance {
  id: string;
  matchId: string;
  party: "FREIGHT_OWNER" | "TRANSPORTER";
  hash: string;
  at: string;
  byUserId: string;
  ip: string;
  offerId: string;
  revision: number;
  termsHash: string;
}
export interface Reservation {
  id: string;
  truckId: string;
  loadId: string;
  transporterId: string;
  status: "RESERVED" | "RELEASED" | "CONSUMED";
  createdAt: string;
}
export interface Proof {
  id: string;
  tripId: string;
  loadId: string;
  recipientName: string;
  capturedAt: string;
  signature?: string | undefined;
  photoName?: string | undefined;
  photoUrl?: string | undefined;
  note?: string | undefined;
  kind?: "PICKUP" | "DELIVERY";
  location?: {
    lat: number;
    lng: number;
    accuracyM?: number | null;
    recordedAt: string;
    verified: boolean;
  };
}
export interface FuelLog {
  id: string;
  truckId: string;
  transporterId: string;
  driverId?: string | undefined;
  litres: number;
  cost: Money;
  odometerKm?: number | undefined;
  station?: string | undefined;
  note?: string | undefined;
  filledAt: string;
  createdAt: string;
}
export type MaintenanceKind = "SERVICE" | "INSPECTION" | "REPAIR" | "TYRES" | "LICENCE" | "OTHER";
export interface MaintenanceTask {
  id: string;
  truckId: string;
  transporterId: string;
  driverId?: string | undefined;
  kind: MaintenanceKind;
  title: string;
  dueDate: string;
  status: "SCHEDULED" | "DONE";
  cost?: Money | undefined;
  note?: string | undefined;
  completedAt?: string | undefined;
  createdAt: string;
}
