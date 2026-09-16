import { describe, it, expect } from "vitest";
import { PageMetadataSchema } from "../src/schemas.js";

describe("PageMetadataSchema", () => {
  it("defaults role to admin when omitted", () => {
    expect(PageMetadataSchema.parse({ title: "P", slug: "p" }).role).toBe("admin");
  });

  it("keeps an explicit valid role", () => {
    expect(PageMetadataSchema.parse({ title: "P", slug: "p", role: "guest" }).role).toBe("guest");
  });

  it("falls back to admin for an invalid role value", () => {
    expect(PageMetadataSchema.parse({ title: "P", slug: "p", role: "superuser" }).role).toBe("admin");
  });
});
