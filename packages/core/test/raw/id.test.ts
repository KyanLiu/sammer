import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { sourceId, textSourceId } from "../../src/raw/id.js";

describe("sourceId", () => {
  it("is the first twelve hex characters of the sha256 of the bytes", () => {
    const bytes = Buffer.from("capybara", "utf8");
    const expected = createHash("sha256").update(bytes).digest("hex").slice(0, 12);

    expect(sourceId(bytes)).toBe(expected);
    expect(sourceId(bytes)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("gives different bytes different ids", () => {
    expect(sourceId(Buffer.from("a"))).not.toBe(sourceId(Buffer.from("b")));
  });

  it("hashes bytes verbatim, so binary content survives unnormalized", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x20]);
    const expected = createHash("sha256").update(png).digest("hex").slice(0, 12);

    expect(sourceId(png)).toBe(expected);
  });
});

describe("textSourceId", () => {
  it("ignores surrounding whitespace", () => {
    expect(textSourceId("  Capybaras are large.\n\n")).toBe(textSourceId("Capybaras are large."));
  });

  it("does not ignore whitespace inside the text", () => {
    expect(textSourceId("a b")).not.toBe(textSourceId("ab"));
  });

  it("agrees with sourceId over the trimmed utf8 bytes", () => {
    expect(textSourceId(" hello ")).toBe(sourceId(Buffer.from("hello", "utf8")));
  });
});
