import { describe, it, expect } from "vitest";
import { ROLES, roleRank, DEFAULT_PAGE_ROLE, ADMIN_CALLER } from "../src/constants.js";

describe("roles", () => {
  it("ranks roles in ascending order of access", () => {
    expect(roleRank("guest")).toBe(0);
    expect(roleRank("friend")).toBe(1);
    expect(roleRank("admin")).toBe(2);
    expect(roleRank("admin")).toBeGreaterThan(roleRank("friend"));
    expect(roleRank("friend")).toBeGreaterThan(roleRank("guest"));
  });

  it("defaults new pages to the most restrictive role", () => {
    expect(DEFAULT_PAGE_ROLE).toBe("admin");
    expect(roleRank(DEFAULT_PAGE_ROLE)).toBe(ROLES.length - 1);
  });
});

describe("ADMIN_CALLER", () => {
  it("is a full-access caller with no identity attached", () => {
    expect(ADMIN_CALLER).toEqual({ role: "admin" });
  });
});
