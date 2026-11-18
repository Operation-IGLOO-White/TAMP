import { describe, expect, it } from "vitest";

import { hasPermission } from "@/lib/access";

describe("hasPermission", () => {
  it("requires the requested effective permission", () => {
    expect(hasPermission({ permissions: ["loads.read"] }, "loads.read")).toBe(true);
    expect(hasPermission({ permissions: ["loads.read"] }, "loads.manage")).toBe(false);
  });

  it("allows the system super user and permission-free views", () => {
    expect(hasPermission({ systemRole: "system_super_user" }, "platform.admin")).toBe(true);
    expect(hasPermission(null)).toBe(true);
  });
});
