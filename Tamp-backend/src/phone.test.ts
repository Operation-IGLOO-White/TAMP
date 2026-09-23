import { describe, expect, it } from "vitest";
import { checkSaMobile, formatSaMobile } from "./phone";

describe("checkSaMobile", () => {
  it("accepts a spaced 0-prefixed mobile", () => {
    const r = checkSaMobile("082 123 4567");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+27821234567");
    expect(r.national).toBe("0821234567");
  });

  it("accepts +27 and 27 international forms", () => {
    expect(checkSaMobile("+27821234567").valid).toBe(true);
    expect(checkSaMobile("27821234567").valid).toBe(true);
  });

  it("accepts a bare 9-digit mobile", () => {
    expect(checkSaMobile("821234567").valid).toBe(true);
  });

  it("rejects random / too-short digits", () => {
    expect(checkSaMobile("123456").valid).toBe(false);
  });

  it("rejects a landline prefix (not 6/7/8)", () => {
    expect(checkSaMobile("0123456789").valid).toBe(false);
  });

  it("rejects empty input", () => {
    expect(checkSaMobile("").valid).toBe(false);
  });

  it("formats to 0XX XXX XXXX", () => {
    expect(formatSaMobile("0821234567")).toBe("082 123 4567");
  });
});
