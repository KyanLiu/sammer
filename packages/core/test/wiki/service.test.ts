import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WikiStore } from "../../src/wiki/store.js";
import { WikiService } from "../../src/wiki/service.js";
import { openIndexDb } from "../../src/index/db.js";
import { Indexer } from "../../src/index/indexer.js";
import { keywordSearch } from "../../src/index/search.js";

let wiki: WikiService;
let store: WikiStore;
let db: ReturnType<typeof openIndexDb>;

beforeEach(async () => {
  store = new WikiStore(await mkdtemp(join(tmpdir(), "sammer-service-")));
  await store.init();
  db = openIndexDb(":memory:");
  wiki = new WikiService(store, new Indexer(db));
});

describe("WikiService.savePage", () => {
  it("fills in the defaults a caller leaves out", async () => {
    const page = await wiki.savePage({ title: "Cats", body: "Meow.", summary: "About cats" });

    expect(page.metadata.slug).toBe("cats");
    expect(page.metadata.id).toBe("cats");
    expect(page.metadata.category).toBe("Uncategorized");
    expect(page.metadata.tags).toEqual([]);
    expect(page.metadata.sources).toEqual([]);
  });

  it("derives the slug from the title, or uses the one given", async () => {
    expect((await wiki.savePage({ title: "Big Boxes", body: "b", summary: "s" })).metadata.slug).toBe(
      "big-boxes",
    );
    expect(
      (await wiki.savePage({ title: "Big Boxes", body: "b", summary: "s", slug: "Crates" })).metadata.slug,
    ).toBe("crates");
  });

  it("records the [[links]] found in the body", async () => {
    const page = await wiki.savePage({
      title: "Cats",
      body: "Cats like [[boxes]] and [[Warm Spots]].",
      summary: "s",
    });

    expect(page.links).toEqual(["boxes", "warm-spots"]);
  });

  it("keeps id and created when overwriting, but moves updated forward", async () => {
    const first = await wiki.savePage({ title: "Cats", body: "v1", summary: "s" });
    await new Promise((r) => setTimeout(r, 2));

    const second = await wiki.savePage({ title: "Cats", body: "v2", summary: "s" });

    expect(second.metadata.id).toBe(first.metadata.id);
    expect(second.metadata.created).toBe(first.metadata.created);
    expect(Date.parse(second.metadata.updated)).toBeGreaterThan(Date.parse(first.metadata.created));
  });

  it("carries forward fields the caller omits on an update", async () => {
    await wiki.savePage({
      title: "Cats",
      body: "v1",
      summary: "About cats",
      category: "Animals",
      tags: ["pets"],
    });

    const updated = await wiki.savePage({ title: "Cats", body: "v2", summary: "About cats" });

    expect(updated.metadata.category).toBe("Animals");
    expect(updated.metadata.tags).toEqual(["pets"]);
  });

  it("makes the page searchable, not just written to disk", async () => {
    await wiki.savePage({ title: "Cats", body: "A feline naps.", summary: "s" });

    expect(keywordSearch(db, "feline").map((h) => h.slug)).toContain("cats");
    // The file on disk ends with a newline, so the body round-trips with one.
    expect((await wiki.getPage("cats"))?.body.trim()).toBe("A feline naps.");
    expect(await wiki.listPages()).toEqual(["cats"]);
  });

  it("refuses to write a page onto an engine-owned slug", async () => {
    await store.writeText("index", "# Index\n\ngenerated\n");

    // Reachable from a tool call: the agent only supplies a title, and
    // "Index" slugifies straight onto the catalog.
    await expect(wiki.savePage({ title: "Index", body: "b", summary: "s" })).rejects.toThrow(
      /reserved/i,
    );
    await expect(
      wiki.savePage({ title: "Anything", body: "b", summary: "s", slug: "log" }),
    ).rejects.toThrow(/reserved/i);

    expect(await store.readText("index")).toBe("# Index\n\ngenerated\n");
  });

  it("defaults a new page's role to admin, and carries it forward on update", async () => {
    const created = await wiki.savePage({ title: "Cats", body: "v1", summary: "s" });
    expect(created.metadata.role).toBe("admin");

    await store.write({ ...created, metadata: { ...created.metadata, role: "guest" } });
    const updated = await wiki.savePage({ title: "Cats", body: "v2", summary: "s" });
    expect(updated.metadata.role).toBe("guest");
  });

  it("withholds a page above the caller's rank, same as a nonexistent slug", async () => {
    await wiki.savePage({ title: "Secrets", body: "shh", summary: "s" });

    expect(await wiki.getPage("secrets", 0 /* guest */)).toBeNull();
    expect((await wiki.getPage("secrets"))?.metadata.slug).toBe("secrets");
  });
});

describe("WikiService.saveRaw", () => {
  const raw = "---\ntitle: Cats\ncategory: Animals\nrole: guest\nsummary: About cats\n---\n\nCats like [[boxes]].";

  it("writes the exact text given, not a re-serialized version", async () => {
    await wiki.saveRaw("cats", raw);

    expect(await store.readText("cats")).toBe(raw);
  });

  it("parses the written page back with the expected metadata and links", async () => {
    const page = await wiki.saveRaw("cats", raw);

    expect(page.metadata.title).toBe("Cats");
    expect(page.metadata.role).toBe("guest");
    expect(page.links).toEqual(["boxes"]);
  });

  it("indexes the page immediately, so it's searchable without a reindex", async () => {
    await wiki.saveRaw("cats", raw);

    expect(keywordSearch(db, "cats").map((h) => h.slug)).toContain("cats");
  });

  it("preserves created and refreshes updated on an overwrite", async () => {
    const first = await wiki.saveRaw("cats", raw);
    await new Promise((r) => setTimeout(r, 2));

    // A real editor round-trip shows the full current frontmatter, created
    // included — this confirms saveRaw round-trips an explicit created as-is
    // rather than testing the filesystem's birthtime fallback, which isn't
    // reliably supported everywhere.
    const second = await wiki.saveRaw(
      "cats",
      `---\ntitle: Cats\ncategory: Animals\nrole: guest\nsummary: About cats\ncreated: ${first.metadata.created}\n---\n\nCats like [[boxes]], still.`,
    );

    expect(second.metadata.created).toBe(first.metadata.created);
    expect(Date.parse(second.metadata.updated)).toBeGreaterThan(Date.parse(first.metadata.created));
  });

  it("rejects a slug that isn't already in canonical slug form", async () => {
    await expect(wiki.saveRaw("../etc/passwd", raw)).rejects.toThrow(/not a valid slug/i);
  });

  it("refuses to write onto an engine-owned slug", async () => {
    await expect(wiki.saveRaw("index", raw)).rejects.toThrow(/reserved/i);
    await expect(wiki.saveRaw("log", raw)).rejects.toThrow(/reserved/i);
  });

  it("rejects frontmatter missing a title", async () => {
    await expect(wiki.saveRaw("cats", "---\ncategory: Animals\n---\nCats.")).rejects.toThrow(/title/i);
  });

  it("rejects an invalid role rather than silently falling back", async () => {
    await expect(
      wiki.saveRaw("cats", "---\ntitle: Cats\nrole: superadmin\n---\nCats."),
    ).rejects.toThrow(/role.*must be one of/i);
  });

  it("leaves the existing file untouched when validation fails", async () => {
    await wiki.saveRaw("cats", raw);

    await expect(wiki.saveRaw("cats", "---\ncategory: Animals\n---\nbroken")).rejects.toThrow();

    expect(await store.readText("cats")).toBe(raw);
  });
});

describe("WikiService.readText", () => {
  it("reads a generated file's raw text", async () => {
    await store.writeText("index", "# Index\n\ngenerated\n");

    expect(await wiki.readText("index")).toBe("# Index\n\ngenerated\n");
  });

  it("returns null for a file that doesn't exist", async () => {
    expect(await wiki.readText("log")).toBeNull();
  });
});
