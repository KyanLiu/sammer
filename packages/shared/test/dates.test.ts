import { describe, it, expect } from "vitest";
import { EPOCH, toIso } from "../src/dates.js";

describe("toIso", () => {
  it("is the ISO string for time zero", () => {
    expect(EPOCH).toBe("1970-01-01T00:00:00.000Z");
  });

  it("coerces a Date to an ISO string", () => {
    expect(toIso(new Date("2026-03-04T05:06:07.000Z"), EPOCH)).toBe("2026-03-04T05:06:07.000Z");
  });

  it("passes through a non-empty string unchanged", () => {
    expect(toIso("2026-03-04T05:06:07.000Z", EPOCH)).toBe("2026-03-04T05:06:07.000Z");
  });

  it("falls back for empty, missing, and non-date values", () => {
    expect(toIso("", EPOCH)).toBe(EPOCH);
    expect(toIso(undefined, EPOCH)).toBe(EPOCH);
    expect(toIso(null, EPOCH)).toBe(EPOCH);
    expect(toIso(42, EPOCH)).toBe(EPOCH);
  });
});
