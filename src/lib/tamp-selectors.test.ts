import { describe, expect, it } from "vitest";
import { notificationTarget } from "./tamp-selectors";

describe("notificationTarget", () => {
  it("opens the exact Asset Hire booking for either organisation", () => {
    const notification = { subjectType: "ASSET_HIRE", subjectId: "HIRE-1" } as const;
    const data = { matches: [], trips: [], disputes: [] };
    for (const role of ["TRANSPORTER", "FREIGHT_OWNER"] as const) {
      expect(notificationTarget(role, notification, data)).toEqual({
        kind: "route",
        to: "/asset-hire?booking=HIRE-1",
      });
    }
  });
});
