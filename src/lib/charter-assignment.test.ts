import { describe, expect, it } from "vitest";
import { charterJourneyPercent, charterVehicleComplete, type CharterLegProgress } from "./charter-assignment";
const progress = (stage: CharterLegProgress["stage"]): CharterLegProgress => ({ stage, nextStop: 0, revision: 0 });
describe("charter journey completion", () => {
  it("counts outbound as half a return journey", () => {
    expect(charterJourneyPercent({ outbound: { progress: progress("COMPLETED") }, returnLeg: { progress: progress("SCHEDULED") } })).toBe(50);
    expect(charterJourneyPercent({ outbound: { progress: progress("COMPLETED") }, returnLeg: { progress: progress("COMPLETED") } })).toBe(100);
  });
  it("finishes a one-way journey independently", () => {
    expect(charterJourneyPercent({ outbound: { progress: progress("COMPLETED") } })).toBe(100);
    expect(charterVehicleComplete({ vehicleId: "one", registration: "ONE", status: "ACCEPTED", legs: { outbound: progress("COMPLETED"), returnLeg: progress("SCHEDULED") } })).toBe(false);
  });
});
