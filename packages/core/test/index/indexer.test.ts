import { describe, it, expect } from "vitest";
import { openIndexDb } from "../../src/index/db.js";
import { Indexer } from "../../src/index/indexer.js";
import { keywordSearch } from "../../src/index/search.js";
import { parsePage } from "../../src/wiki/format.js";

describe("index (keyword + graph)", () => {
  it("indexes pages and retrieves by keyword (BM25)", () => {
    const db = openIndexDb(":memory:");
    const indexer = new Indexer(db);
    indexer.upsertPage(parsePage("cats", "---\ntitle: Cats\nslug: cats\nsummary: About cats\n---\nCats love a warm cat spot. See [[boxes]]."));
    indexer.upsertPage(parsePage("boxes", "---\ntitle: Boxes\nslug: boxes\nsummary: About boxes\n---\nA box is for storage."));

    const hits = keywordSearch(db, "cat", { k: 5 });
    expect(hits[0]!.slug).toBe("cats");
    expect(hits[0]!.snippet.length).toBeGreaterThan(0);
  });

  it("expands one hop along links", () => {
    const db = openIndexDb(":memory:");
    const indexer = new Indexer(db);
    indexer.upsertPage(parsePage("cats", "---\ntitle: Cats\nslug: cats\n---\nWarm cat spot. See [[boxes]]."));
    indexer.upsertPage(parsePage("boxes", "---\ntitle: Boxes\nslug: boxes\nsummary: A cardboard container.\n---\nStorage container."));

    const expanded = keywordSearch(db, "warm cat spot", { k: 1, expandHops: 1 });
    expect(expanded.map((h) => h.slug)).toContain("boxes"); // pulled in via [[boxes]]
  });

  it("upsert replaces a page's old content", () => {
    const db = openIndexDb(":memory:");
    const indexer = new Indexer(db);
    const p = parsePage("cats", "---\ntitle: Cats\nslug: cats\n---\nold obsolete text");
    indexer.upsertPage(p);
    indexer.upsertPage({ ...p, body: "new cat words" });
    expect(keywordSearch(db, "obsolete", { k: 5 }).some((h) => h.slug === "cats")).toBe(false);
    expect(keywordSearch(db, "cat", { k: 5 }).some((h) => h.slug === "cats")).toBe(true);
  });
});
