import { describe, it, expect } from "vitest";
import { canExtract, extractText } from "../../src/raw/extract.js";

describe("extractText", () => {
  it("decodes the formats it can read", () => {
    expect(extractText(Buffer.from("hello", "utf8"), ".txt")).toBe("hello");
    expect(extractText(Buffer.from('{"a":1}', "utf8"), ".json")).toBe('{"a":1}');
    expect(extractText(Buffer.from("# Cats", "utf8"), ".md")).toBe("# Cats");
  });

  it("returns null for a format with no extractor yet, rather than guessing", () => {
    expect(extractText(Buffer.from([0x25, 0x50, 0x44, 0x46]), ".pdf")).toBeNull();
    expect(extractText(Buffer.from([0x89, 0x50, 0x4e, 0x47]), ".png")).toBeNull();
    expect(extractText(Buffer.from("anything", "utf8"), ".weird")).toBeNull();
  });

  it("agrees with canExtract", () => {
    expect(canExtract(".md")).toBe(true);
    expect(canExtract(".pdf")).toBe(false);
  });
});
