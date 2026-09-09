import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SourceMetadata } from "@sammer/shared";
import { RawStore } from "../../src/raw/store.js";

let dir: string;
let store: RawStore;

const TRANSCRIPT = "me: how does pgbouncer work?\nassistant: transaction mode pools connections.";
const DAY = "2026-08-16";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sammer-raw-"));
  store = new RawStore(dir);
  await store.init();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function metadata(over: Partial<SourceMetadata> = {}): SourceMetadata {
  return {
    id: "conv_abc123",
    title: "",
    category: "",
    tags: [],
    summary: "",
    created: `${DAY}T10:00:00.000Z`,
    updated: `${DAY}T10:00:00.000Z`,
    kind: "conversation",
    origin: "claude",
    externalId: "conv_abc123",
    ...over,
  };
}

const dayDir = (origin: string, day = DAY) => join(dir, origin, day);

describe("RawStore", () => {
  it("round-trips metadata and content through disk", async () => {
    const meta = metadata();
    const stored = await store.write(meta, TRANSCRIPT);

    const read = await store.read("claude", "conv_abc123");
    expect(read).toEqual(stored);
    expect(read?.metadata).toEqual(meta);
    expect(await store.readContent(read!)).toBe(TRANSCRIPT);
  });

  it("files the record and its content side by side, under the day it was archived", async () => {
    await store.write(metadata(), TRANSCRIPT);

    const record = JSON.parse(await readFile(join(dayDir("claude"), "conv-abc123.meta.json"), "utf8"));
    expect(record.kind).toBe("conversation");
    expect(record.fileName).toBe("conv-abc123.txt");
    expect(record.text).toBeUndefined(); // content never lands in the record

    // The archive is a copy, so the content file is the submitted text and nothing else.
    expect(await readFile(join(dayDir("claude"), "conv-abc123.txt"), "utf8")).toBe(TRANSCRIPT);
  });

  it("keeps an archived .json file apart from its own metadata record", async () => {
    const stored = await store.write(metadata({ kind: "text" }), '{"real": "content"}', ".json");

    expect(stored.fileName).toBe("conv-abc123.json");
    expect(await readFile(join(dayDir("claude"), "conv-abc123.json"), "utf8")).toBe('{"real": "content"}');
    const record = JSON.parse(await readFile(join(dayDir("claude"), "conv-abc123.meta.json"), "utf8"));
    expect(record.id).toBe("conv_abc123");
    expect(await store.readContent(stored)).toBe('{"real": "content"}');
  });

  it("stores bytes verbatim, so a binary source survives the round trip", async () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0xff, 0xfe, 0x80]);
    const stored = await store.write(metadata({ kind: "pdf" }), pdf, ".pdf");

    const back = await store.readBytes(stored);
    expect(back.equals(pdf)).toBe(true);
    expect(stored.fileName).toBe("conv-abc123.pdf");
  });

  it("finds a record filed under an earlier day", async () => {
    await store.write(metadata({ id: "old", created: "2026-01-04T09:00:00.000Z" }), TRANSCRIPT);
    await store.write(metadata({ id: "new" }), TRANSCRIPT);

    expect(await store.has("claude", "old")).toBe(true);
    expect((await store.read("claude", "old"))?.metadata.created).toBe("2026-01-04T09:00:00.000Z");
  });

  it("reports whether a source is already stored", async () => {
    expect(await store.has("claude", "conv_abc123")).toBe(false);
    await store.write(metadata(), TRANSCRIPT);
    expect(await store.has("claude", "conv_abc123")).toBe(true);
  });

  it("keeps the same id in two origins apart", async () => {
    await store.write(metadata({ origin: "claude" }), TRANSCRIPT);

    expect(await store.has("rss", "conv_abc123")).toBe(false);
  });

  it("returns null for a source that was never stored", async () => {
    expect(await store.read("claude", "nope")).toBeNull();
  });

  it("preserves content that looks like a container's own syntax", async () => {
    // The reason record and content are separate files: with both in one, a body like
    // this is indistinguishable from the metadata block that precedes it.
    const text = '---\nnot: frontmatter\n---\n{"nor": "json"}\nstill here';
    const stored = await store.write(metadata(), text);

    expect(await store.readContent(stored)).toBe(text);
  });

  it("keeps content byte for byte, without adding or trimming whitespace", async () => {
    const text = "  leading and trailing space, no final newline  ";
    const stored = await store.write(metadata(), text);

    expect(await store.readContent(stored)).toBe(text);
  });

  it("cannot be walked out of its directory by a hostile id or origin", async () => {
    await store.write(metadata({ origin: "../../etc", id: "../../passwd" }), TRANSCRIPT);

    await expect(readFile(join(dir, "..", "..", "passwd.meta.json"), "utf8")).rejects.toThrow();
    expect(await store.list()).toHaveLength(1);
  });

  it("lists everything stored, across origins and days", async () => {
    await store.write(metadata({ origin: "claude", id: "a" }), TRANSCRIPT);
    await store.write(metadata({ origin: "rss", id: "b" }), TRANSCRIPT);
    await store.write(metadata({ origin: "rss", id: "c", created: "2026-01-04T09:00:00.000Z" }), TRANSCRIPT);

    const all = await store.list();
    expect(all.map((s) => s.metadata.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("lists without reading content", async () => {
    const stored = await store.write(metadata(), TRANSCRIPT);
    await unlink(join(dayDir("claude"), "conv-abc123.txt"));

    // Enumeration still works with the content gone, which it could not do if list()
    // loaded it. Asking for the content is what surfaces the damage.
    expect((await store.list()).map((s) => s.metadata.id)).toEqual(["conv_abc123"]);
    await expect(store.readContent(stored)).rejects.toThrow(/missing its content file/);
  });
});
