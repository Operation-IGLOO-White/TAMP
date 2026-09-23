// UI data contracts — mirrors TAMP-SPEC-GUIDE.md §5.1 and §5.2.

export type UUID = string;
export type ISODate = string;

export type Money = { amount: number; currency: "ZAR"; vat: "incl" | "excl" };

export type Role = "FREIGHT_OWNER" | "TRANSPORTER" | "DRIVER" | "ADMIN";
export type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

// Rich onboarding profile captured at sign-up (BRS D1). Stored as JSONB on the
// party; the core Party columns (role, contactName, companyName…) are derived
// from it. Passwords are never captured here — auth is still mock in this phase.
export type OnboardingUserType = "CARGO_OWNER" | "CARRIER" | "BROKER" | "DRIVER";

export interface OnboardingData {
  userType: OnboardingUserType;
  firstName: string;
  lastName: string;
  business?: {
    companyName: string;
    registrationNumber: string;
    businessType: string;
    address: string;
    contactDetails: string;
    vat: string;
  };
  // Individual truck-driver onboarding (Uber/Bolt-style driver signup).
  driver?: {
    vehicleClasses: string[]; // truck categories the driver operates
    licenceCode: string; // SA driving-licence code (C1, C, EC1, EC)
    prdp: boolean; // holds a valid Professional Driving Permit
    workType: "OWNER" | "FLEET"; // owner-operator vs employed by a fleet
    fleetName?: string; // linked fleet/operator (when FLEET)
    truck?: { registration: string; bodyType: string; capacityT: number }; // when OWNER
  };
  documents?: string[]; // labels of the verification documents supplied (mock)
}

export interface Party {
  id: UUID;
  role: Role;
  companyName: string;
  contactName: string;
  email: string; // masked until CONFIRMED (C6)
  phone: string; // masked until CONFIRMED (C6)
  province: string;
  verification: VerificationStatus;
  ratingAvg: number | null; // 1-5, null until 3 ratings received
  ratingCount: number;
  suspended: boolean;
  avatarUrl?: string | undefined; // profile image; falls back to generated avatar
  // Mock KYC document captured at registration (filename only — no contents
  // are read or stored). Drives the admin verification queue.
  kycDocument?: { name: string; url?: string | undefined; uploadedAt: ISODate } | undefined;
  // False for a social-login account that hasn't picked a role / finished
  // onboarding yet. Undefined/true means complete.
  onboardingComplete?: boolean | undefined;
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

// State machine per spec §5.2:
// DRAFT -> POSTED -> MATCHED -> CONFIRMED -> COMPLETED -> CLOSED
// plus CANCELLED and EXPIRED branches.
export type LoadStatus =
  "DRAFT" | "POSTED" | "MATCHED" | "CONFIRMED" | "COMPLETED" | "CLOSED" | "CANCELLED" | "EXPIRED";

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
  distanceKm: number; // computed, straight-line x 1.25 road factor (mock)
  pickupWindow: { from: ISODate; to: ISODate };
  deliveryBy: ISODate;
  targetRate?: Money | undefined;
  specialRequirements?: string | undefined;
  status: LoadStatus;
  createdAt: ISODate;
}

export type TruckStatus = "AVAILABLE" | "RESERVED" | "ON_TRIP" | "OFFLINE" | "EXPIRED";

export interface TruckPosting {
  id: UUID; // display ref: TR-0087
  transporterId: UUID;
  driverId?: UUID | undefined; // assigned truck driver (Party with role DRIVER)
  registration: string; // masked to last 3 chars until CONFIRMED
  bodyType: BodyType;
  payloadCapacityKg: number;
  volumeCapacityM3?: number | undefined;
  currentLocation: Place;
  availableFrom: ISODate;
  availableTo: ISODate;
  preferredLanes?: { origin: string; destination: string }[] | undefined;
  // Uber/Bolt-style vehicle onboarding: photos of the actual truck and the
  // matching vehicle documents (filenames / labels — files aren't stored in the
  // demo).
  photos?: string[];
  documents?: string[];
  // Vehicle-licence-disc expiry, for licensing status + renewal reminders.
  licenceExpiry?: ISODate | undefined;
  status: TruckStatus;
  createdAt: ISODate;
}

export type MatchStatus =
  "SUGGESTED" | "OFFERED" | "ACCEPTED" | "CONFIRMED" | "REJECTED" | "WITHDRAWN" | "EXPIRED";

export interface MatchScoreComponent {
  ruleId: string; // "R-PROXIMITY"
  label: string; // "Truck is near the pickup point"
  weight: number; // 30
  earned: number; // 24.6
  detail: string; // "42 km from Bethal - within the 150 km radius"
}

export interface RuleResult {
  ruleId: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface Match {
  id: UUID; // display ref: MT-0311
  loadId: UUID;
  truckPostingId: UUID;
  score: number; // 0-100
  breakdown: MatchScoreComponent[]; // required by C2
  hardFilterResults: RuleResult[];
  status: MatchStatus;
  initiatedBy: "FREIGHT_OWNER" | "TRANSPORTER" | "SYSTEM";
  agreedRate?: Money | undefined;
  rejectionReason?: string | undefined;
  confirmedByOwnerAt?: ISODate | undefined;
  confirmedByTransporterAt?: ISODate | undefined;
  expiresAt: ISODate;
  createdAt: ISODate;
}

export type TripStatus =
  | "SCHEDULED"
  | "AT_PICKUP"
  | "LOADED"
  | "IN_TRANSIT"
  | "AT_DROPOFF"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

export interface TripEvent {
  status: TripStatus | "DELAY_REPORTED";
  at: ISODate;
  note?: string | undefined;
  byUserId: UUID;
}

export interface Trip {
  id: UUID; // display ref: TP-0058
  matchId: UUID;
  status: TripStatus;
  disputed: boolean;
  events: TripEvent[];
  simulatedPosition: { lat: number; lng: number; updatedAt: ISODate } | null;
  progressPct: number;
  etaAt: ISODate | null; // computed from simulation, chipped "Simulated"
}

export interface Rating {
  id: UUID;
  tripId: UUID;
  raterId: UUID;
  rateeId: UUID;
  stars: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  comment?: string | undefined;
  createdAt: ISODate;
}

// Digital-acceptance receipt object (NFR-007 / OR044): each accept/confirm
// action is sealed with the actor, a simulated IP, the device user-agent, a
// timestamp and a SHA-256 hash over the canonical payload.
export interface Acceptance {
  id: UUID; // display ref: AC-0142
  matchId: UUID; // the contract reference
  loadId: UUID;
  party: "FREIGHT_OWNER" | "TRANSPORTER";
  byUserId: UUID;
  ip: string; // simulated client IP
  userAgent: string; // device/browser user-agent
  at: ISODate;
  hash: string; // SHA-256 hex of the canonical acceptance payload
}

// A carrier's pre-booked backhaul/forward-haul: a truck (currently on a trip)
// commits to an open load it will pick up at its destination.
export interface Reservation {
  id: UUID; // display ref: RS-0142
  truckId: UUID;
  loadId: UUID;
  transporterId: UUID;
  status: "RESERVED" | "RELEASED";
  createdAt: ISODate;
}

export interface AuditEvent {
  id: UUID;
  eventType: string; // e.g. "LOAD_POSTED" (see EVT-## catalogue, spec §10.4)
  eventId: string; // e.g. "EVT-10"
  actorId: UUID;
  actorRole: Role | "SYSTEM";
  subjectType: "LOAD" | "TRUCK" | "MATCH" | "TRIP" | "USER" | "DISPUTE";
  subjectId: UUID;
  summary: string;
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
  at: ISODate;
}

export type DisputeCategory =
  "NON_ARRIVAL" | "DAMAGE" | "RATE_DISAGREEMENT" | "DELAY" | "CONDUCT" | "OTHER";

export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";

export interface Dispute {
  id: UUID;
  tripId: UUID;
  raisedById: UUID;
  category: DisputeCategory;
  description: string;
  status: DisputeStatus;
  resolutionNote?: string | undefined;
  createdAt: ISODate;
  resolvedAt?: ISODate | undefined;
}

// A fuel fill-up logged against a truck (fleet running-cost tracking).
export interface FuelLog {
  id: UUID;
  truckId: UUID;
  transporterId: UUID; // truck owner
  driverId?: UUID | undefined;
  litres: number;
  cost: Money;
  odometerKm?: number | undefined;
  station?: string | undefined;
  note?: string | undefined;
  filledAt: ISODate;
  createdAt: ISODate;
}

export type MaintenanceKind =
  | "SERVICE"
  | "INSPECTION"
  | "TYRES"
  | "REPAIR"
  | "LICENCE"
  | "OTHER";

// A scheduled or completed maintenance task for a truck.
export interface MaintenanceTask {
  id: UUID;
  truckId: UUID;
  transporterId: UUID;
  driverId?: UUID | undefined;
  kind: MaintenanceKind;
  title: string;
  dueDate: ISODate;
  status: "SCHEDULED" | "DONE";
  cost?: Money | undefined; // parts + labour, for cost-per-vehicle
  note?: string | undefined;
  completedAt?: ISODate | undefined;
  createdAt: ISODate;
}

// Proof of delivery captured at drop-off.
export interface Proof {
  id: UUID;
  tripId: UUID;
  loadId: UUID;
  recipientName: string;
  signature?: string | undefined; // small data-URL PNG from the signature pad
  photoName?: string | undefined; // captured photo's original filename (display)
  photoUrl?: string | undefined; // served URL of the uploaded photo (object storage)
  note?: string | undefined;
  capturedAt: ISODate;
}
