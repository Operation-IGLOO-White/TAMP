// Schema discipline for the JSON-blob tables. Each of these entities is stored
// as opaque `data Json`, so the database enforces no shape. These Zod schemas
// are the single source of truth for what a valid blob looks like and are run
// on every write (snapshot.sync) — catching corrupt or drifted payloads before
// they reach the database, and documenting the shape in one place.
//
// Schemas are intentionally lenient (`.passthrough()` keeps unknown keys) so
// additive changes don't break writes; they assert the identifying + typed core
// fields. Tighten a schema, and old data that violates it is caught on next write.
import { z } from "zod";

const iso = z.string(); // ISO date string
const place = z
  .object({ label: z.string(), province: z.string(), lat: z.number(), lng: z.number() })
  .passthrough();
const money = z.object({ amount: z.number() }).passthrough();

export const truckSchema = z
  .object({
    id: z.string(),
    transporterId: z.string(),
    driverId: z.string().optional(),
    registration: z.string(),
    bodyType: z.string(),
    payloadCapacityKg: z.number(),
    currentLocation: place,
    status: z.string(),
    createdAt: iso,
  })
  .passthrough();

export const ratingSchema = z
  .object({
    id: z.string(),
    tripId: z.string(),
    raterId: z.string(),
    rateeId: z.string(),
    stars: z.number().int().min(1).max(5),
    tags: z.array(z.string()),
    createdAt: iso,
  })
  .passthrough();

export const disputeSchema = z
  .object({
    id: z.string(),
    tripId: z.string(),
    raisedById: z.string(),
    category: z.string(),
    description: z.string(),
    status: z.string(),
    createdAt: iso,
  })
  .passthrough();

export const acceptanceSchema = z
  .object({
    id: z.string(),
    matchId: z.string(),
    loadId: z.string(),
    party: z.enum(["FREIGHT_OWNER", "TRANSPORTER"]),
    byUserId: z.string(),
    at: iso,
    hash: z.string(),
  })
  .passthrough();

export const reservationSchema = z
  .object({
    id: z.string(),
    truckId: z.string(),
    loadId: z.string(),
    transporterId: z.string(),
    status: z.enum(["RESERVED", "RELEASED"]),
    createdAt: iso,
  })
  .passthrough();

export const auditSchema = z
  .object({
    id: z.string(),
    eventType: z.string(),
    eventId: z.string(),
    actorId: z.string(),
    actorRole: z.string(),
    subjectType: z.string(),
    subjectId: z.string(),
    summary: z.string(),
    at: iso,
  })
  .passthrough();

export const fuelLogSchema = z
  .object({
    id: z.string(),
    truckId: z.string(),
    transporterId: z.string(),
    litres: z.number(),
    cost: money,
    filledAt: iso,
    createdAt: iso,
  })
  .passthrough();

export const maintenanceSchema = z
  .object({
    id: z.string(),
    truckId: z.string(),
    transporterId: z.string(),
    kind: z.string(),
    title: z.string(),
    dueDate: iso,
    status: z.enum(["SCHEDULED", "DONE"]),
    createdAt: iso,
  })
  .passthrough();

export const proofSchema = z
  .object({
    id: z.string(),
    tripId: z.string(),
    loadId: z.string(),
    recipientName: z.string(),
    capturedAt: iso,
  })
  .passthrough();

export const BLOB_SCHEMAS = {
  truck: truckSchema,
  rating: ratingSchema,
  dispute: disputeSchema,
  acceptance: acceptanceSchema,
  reservation: reservationSchema,
  audit: auditSchema,
  fuelLog: fuelLogSchema,
  maintenance: maintenanceSchema,
  proof: proofSchema,
} as const;

export type BlobKind = keyof typeof BLOB_SCHEMAS;

/** Validate one blob row; returns the first issue path+message, or null if valid. */
export function validateBlob(kind: BlobKind, row: unknown): string | null {
  const res = BLOB_SCHEMAS[kind].safeParse(row);
  if (res.success) return null;
  const issue = res.error.issues[0];
  return issue ? `${issue.path.join(".") || "(root)"}: ${issue.message}` : "invalid";
}
