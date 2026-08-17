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

    expect(page.slug).toBe("cats");
    expect(page.id).toBe("cats");
    expect(page.category).toBe("Uncategorized");
    expect(page.tags).toEqual([]);
    expect(page.sources).toEqual([]);
  });

  it("derives the slug from the title, or uses the one given", async () => {
    expect((await wiki.savePage({ title: "Big Boxes", body: "b", summary: "s" })).slug).toBe(
      "big-boxes",
    );
    expect(
      (await wiki.savePage({ title: "Big Boxes", body: "b", summary: "s", slug: "Crates" })).slug,
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

    expect(second.id).toBe(first.id);
    expect(second.created).toBe(first.created);
    expect(Date.parse(second.updated)).toBeGreaterThan(Date.parse(first.created));
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

    expect(updated.category).toBe("Animals");
    expect(updated.tags).toEqual(["pets"]);
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
});
