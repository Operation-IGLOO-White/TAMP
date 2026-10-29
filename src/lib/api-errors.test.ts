import { expect, it } from "vitest";
import { truckRegistrationError, userFacingError } from "@/lib/api-errors";

it("hides raw JSON parsing failures", () => {
  expect(userFacingError(new Error("Unexpected token '<', '<html>' is not valid JSON"))).toBe(
    "We could not reach the TAMP service. Please try again shortly.",
  );
});

it("turns a schema pattern error into a useful truck VIN instruction", () => {
  expect(
    truckRegistrationError(new Error("trucks.0.vin: String should match the expected pattern")),
  ).toBe("Check the VIN. It must contain exactly 17 letters and numbers, excluding I, O and Q.");
});

it("explains the account quota and states the maximum", () => {
  expect(userFacingError(new Error("Account upload quota exceeded"))).toBe(
    "Your account has reached its 100 MB upload limit. Remove files you no longer need or contact support for more storage.",
  );
});

it("explains the individual file limit", () => {
  expect(userFacingError(new Error("File exceeds size limit"))).toBe(
    "This file is too large. The maximum size for one file is 10 MB.",
  );
});
