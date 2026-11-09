import { describe, expect, it } from "vitest";
import { assessFleetCompliance } from "./fleet-compliance";
import type { TruckPosting, Vehicle } from "@/types/domain";

const now = new Date("2026-11-09T00:00:00Z").getTime();
const truck = {
  id: "TR-1",
  vehicleId: "VH-1",
  transporterId: "P-1",
  registration: "ABC 123 GP",
  bodyType: "TAUTLINER",
  payloadCapacityKg: 30_000,
  currentLocation: { label: "Pretoria", province: "Gauteng", lat: -25.7, lng: 28.2 },
  availableFrom: "2026-11-10T08:00:00Z",
  availableTo: "2026-11-12T08:00:00Z",
  status: "AVAILABLE",
  createdAt: "2026-01-01T00:00:00Z",
  licenceExpiry: "2027-01-01T00:00:00Z",
  documents: ["licence", "roadworthy", "insurance"],
} satisfies TruckPosting;

const vehicle = {
  id: "VH-1",
  ownerId: "P-1",
  registration: truck.registration,
  bodyType: truck.bodyType,
  payloadCapacityKg: truck.payloadCapacityKg,
  photos: [],
  documents: truck.documents,
  verification: "VERIFIED",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} satisfies Vehicle;

describe("assessFleetCompliance", () => {
  it("marks a road-ready vehicle compliant", () => {
    expect(assessFleetCompliance(truck, vehicle, [], now).level).toBe("COMPLIANT");
  });

  it("blocks expired and incomplete vehicles", () => {
    const report = assessFleetCompliance(
      { ...truck, licenceExpiry: "2026-11-01T00:00:00Z", documents: [] },
      { ...vehicle, documents: [] },
      [],
      now,
    );
    expect(report.level).toBe("ACTION_REQUIRED");
    expect(report.blockers).toHaveLength(2);
  });
});
