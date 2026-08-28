import { describe, it, expect } from "vitest";
import { EPOCH } from "@sammer/shared";
import { parseRecord, serializeRecord } from "../../src/raw/format.js";

const AT = { origin: "claude", id: "conv_abc123" };

const complete = {
  id: "conv_abc123",
  origin: "claude",
  fileName: "conv-abc123.txt",
  kind: "conversation",
  title: "Pgbouncer",
  category: "Databases",
  tags: ["postgres"],
  summary: "How pooling works",
  created: "2026-08-16T10:00:00.000Z",
  updated: "2026-08-16T10:00:00.000Z",
  externalId: "conv_abc123",
};

const json = (over: Record<string, unknown> = {}) => JSON.stringify({ ...complete, ...over });

describe("record format", () => {
  it("round-trips a record", () => {
    const source = parseRecord(json(), AT);

    expect(parseRecord(serializeRecord(source), AT)).toEqual(source);
  });

  it("splits the flat file into metadata and its content pointer", () => {
    const source = parseRecord(json(), AT);

    expect(source.fileName).toBe("conv-abc123.txt");
    expect(source.metadata.id).toBe("conv_abc123");
    expect(source.metadata).not.toHaveProperty("fileName");
  });

  it("falls back to text for a kind it does not recognise", () => {
    expect(parseRecord(json({ kind: "telepathy" }), AT).metadata.kind).toBe("text");
    expect(parseRecord(json({ kind: 42 }), AT).metadata.kind).toBe("text");
  });

  it("defaults the descriptive fields rather than failing the read", () => {
    const { metadata } = parseRecord(JSON.stringify({ id: "x", origin: "manual" }), AT);

    expect(metadata.title).toBe("");
    expect(metadata.category).toBe("");
    expect(metadata.tags).toEqual([]);
    expect(metadata.summary).toBe("");
    expect(metadata.created).toBe(EPOCH);
  });

  it("recovers identity from where the record was read, not from the record", () => {
    // The caller located this file by origin and id, so a record that lost them is
    // still usable. One damaged file must not make RawStore.list() unenumerable.
    const { metadata } = parseRecord(json({ id: "", origin: undefined }), AT);

    expect(metadata.id).toBe("conv_abc123");
    expect(metadata.origin).toBe("claude");
  });

  it("recovers a missing content pointer from the id", () => {
    const source = parseRecord(json({ fileName: undefined }), AT);

    // If the guess is wrong, readContent is where it surfaces, naming the file.
    expect(source.fileName).toBe("conv-abc123.txt");
  });

  it("trims, drops empty, and dedupes tags", () => {
    const { metadata } = parseRecord(json({ tags: ["  postgres ", "sql", "", "postgres"] }), AT);

    expect(metadata.tags).toEqual(["postgres", "sql"]);
  });
});
