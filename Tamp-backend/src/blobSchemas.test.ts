import { describe, expect, it } from "vitest";
import { BLOB_SCHEMAS, validateBlob } from "./blobSchemas";

// Valid sample rows for each blob kind — these mirror what snapshot.sync writes.
const samples = {
  truck: {
    id: "TR-1",
    transporterId: "P-1",
    registration: "ND 88 210",
    bodyType: "SIDE_TIPPER",
    payloadCapacityKg: 34000,
    currentLocation: { label: "Rustenburg", province: "NW", lat: -25.6, lng: 27.2 },
    status: "AVAILABLE",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  rating: {
    id: "RT-1",
    tripId: "TP-1",
    raterId: "P-1",
    rateeId: "P-2",
    stars: 5,
    tags: ["on-time"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  dispute: {
    id: "DP-1",
    tripId: "TP-1",
    raisedById: "P-1",
    category: "DAMAGE",
    description: "x",
    status: "OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  acceptance: {
    id: "AC-1",
    matchId: "MT-1",
    loadId: "LD-1",
    party: "FREIGHT_OWNER",
    byUserId: "P-1",
    ip: "1.1.1.1",
    userAgent: "x",
    at: "2026-01-01T00:00:00.000Z",
    hash: "abc",
  },
  reservation: {
    id: "RS-1",
    truckId: "TR-1",
    loadId: "LD-1",
    transporterId: "P-1",
    status: "RESERVED",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  audit: {
    id: "EV-1",
    eventType: "LOAD_POSTED",
    eventId: "EVT-10",
    actorId: "P-1",
    actorRole: "FREIGHT_OWNER",
    subjectType: "LOAD",
    subjectId: "LD-1",
    summary: "posted",
    at: "2026-01-01T00:00:00.000Z",
  },
  fuelLog: {
    id: "FL-1",
    truckId: "TR-1",
    transporterId: "P-1",
    litres: 200,
    cost: { amount: 4000, currency: "ZAR" },
    filledAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  maintenance: {
    id: "MN-1",
    truckId: "TR-1",
    transporterId: "P-1",
    kind: "SERVICE",
    title: "Service",
    dueDate: "2026-01-01T00:00:00.000Z",
    status: "SCHEDULED",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  proof: {
    id: "PR-1",
    tripId: "TP-1",
    loadId: "LD-1",
    recipientName: "Sipho",
    capturedAt: "2026-01-01T00:00:00.000Z",
  },
} as const;

describe("blob schemas", () => {
  it("has a schema for every blob kind", () => {
    expect(Object.keys(BLOB_SCHEMAS).sort()).toEqual(Object.keys(samples).sort());
  });

  for (const kind of Object.keys(samples) as (keyof typeof samples)[]) {
    it(`accepts a valid ${kind}`, () => {
      expect(validateBlob(kind, samples[kind])).toBeNull();
    });

    it(`keeps unknown keys on ${kind} (additive changes don't break)`, () => {
      expect(validateBlob(kind, { ...samples[kind], somethingNew: 1 })).toBeNull();
    });

    it(`rejects ${kind} missing its id`, () => {
      const { id: _id, ...rest } = samples[kind];
      expect(validateBlob(kind, rest)).not.toBeNull();
    });
  }

  it("rejects an out-of-range rating", () => {
    expect(validateBlob("rating", { ...samples.rating, stars: 9 })).not.toBeNull();
  });

  it("rejects a bad reservation status enum", () => {
    expect(validateBlob("reservation", { ...samples.reservation, status: "NOPE" })).not.toBeNull();
  });
});
