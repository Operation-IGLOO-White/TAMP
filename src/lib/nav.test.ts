import { describe, expect, it } from "vitest";
import { buildHref } from "./nav";

describe("navigation URLs", () => {
  it("encodes dynamic IDs and board search values", () => {
    expect(
      buildHref(
        "/owner/loads/$loadId",
        { loadId: "LD/12 #" },
        { q: "Cape Town", page: 0, active: false },
      ),
    ).toBe("/owner/loads/LD%2F12%20%23?q=Cape+Town&page=0&active=false");
  });
  it("omits absent search values", () => {
    expect(buildHref("/owner/board", undefined, { q: "", selected: null, filter: undefined })).toBe(
      "/owner/board",
    );
  });
});
