import { describe, expect, it } from "vitest";
import { matchConfirmError, tripTransitionError } from "./transitions";

const s = (status: string) => ({ status });

describe("tripTransitionError", () => {
  it("allows a normal forward step", () => {
    expect(tripTransitionError(s("AT_PICKUP"), s("LOADED"), false)).toBeNull();
  });

  it("allows delivering from at-drop-off with a POD", () => {
    expect(tripTransitionError(s("AT_DROPOFF"), s("DELIVERED"), true)).toBeNull();
  });

  it("blocks delivering WITHOUT a POD", () => {
    expect(tripTransitionError(s("AT_DROPOFF"), s("DELIVERED"), false)).toMatch(/Proof of delivery/i);
  });

  it("blocks jumping straight to delivered", () => {
    expect(tripTransitionError(s("SCHEDULED"), s("DELIVERED"), true)).toMatch(/in transit/i);
  });

  it("blocks a new trip that starts delivered", () => {
    expect(tripTransitionError(undefined, s("DELIVERED"), true)).toMatch(/can't start/i);
  });

  it("allows a new trip at scheduled", () => {
    expect(tripTransitionError(undefined, s("SCHEDULED"), false)).toBeNull();
  });

  it("blocks moving backwards", () => {
    expect(tripTransitionError(s("IN_TRANSIT"), s("AT_PICKUP"), false)).toMatch(/backwards/i);
  });

  it("allows cancellation from anywhere", () => {
    expect(tripTransitionError(s("IN_TRANSIT"), s("CANCELLED"), false)).toBeNull();
  });

  it("allows a no-op resend of a delivered trip", () => {
    expect(tripTransitionError(s("DELIVERED"), s("DELIVERED"), true)).toBeNull();
  });
});

describe("matchConfirmError", () => {
  it("lets the load owner confirm", () => {
    expect(matchConfirmError(s("OFFERED"), s("CONFIRMED"), "owner-1", "owner-1")).toBeNull();
  });

  it("blocks a carrier self-confirming a request (from OFFERED)", () => {
    expect(matchConfirmError(s("OFFERED"), s("CONFIRMED"), "owner-1", "carrier-9")).toMatch(
      /load owner/i,
    );
  });

  it("lets the carrier finalise after the owner ACCEPTED (3-step handshake)", () => {
    expect(matchConfirmError(s("ACCEPTED"), s("CONFIRMED"), "owner-1", "carrier-9")).toBeNull();
  });

  it("ignores non-confirm changes", () => {
    expect(matchConfirmError(s("SUGGESTED"), s("OFFERED"), "owner-1", "carrier-9")).toBeNull();
  });

  it("allows a no-op resend of an already-confirmed match", () => {
    expect(matchConfirmError(s("CONFIRMED"), s("CONFIRMED"), "owner-1", "carrier-9")).toBeNull();
  });
});
