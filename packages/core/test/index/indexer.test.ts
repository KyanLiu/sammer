import { describe, it, expect } from "vitest";
import { roleRank } from "@sammer/shared";
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

  it("stores a page's role as a queryable rank", () => {
    const db = openIndexDb(":memory:");
    const indexer = new Indexer(db);
    indexer.upsertPage(
      parsePage("secrets", "---\ntitle: Secrets\nslug: secrets\nrole: friend\n---\nShh."),
    );

    const row = db.prepare("SELECT role_rank FROM pages WHERE slug = ?").get("secrets") as {
      role_rank: number;
    };
    expect(row.role_rank).toBe(roleRank("friend"));
  });

  it("defaults role_rank to admin when a page has no role", () => {
    const db = openIndexDb(":memory:");
    const indexer = new Indexer(db);
    indexer.upsertPage(parsePage("open", "---\ntitle: Open\nslug: open\n---\nHi."));

    const row = db.prepare("SELECT role_rank FROM pages WHERE slug = ?").get("open") as {
      role_rank: number;
    };
    expect(row.role_rank).toBe(roleRank("admin"));
  });

  it("excludes pages above the caller's role from search results", () => {
    const db = openIndexDb(":memory:");
    const indexer = new Indexer(db);
    indexer.upsertPage(
      parsePage("cats", "---\ntitle: Cats\nslug: cats\nrole: guest\n---\nCats are great."),
    );
    indexer.upsertPage(
      parsePage("secrets", "---\ntitle: Secrets\nslug: secrets\nrole: admin\n---\nGreat secrets."),
    );

    expect(keywordSearch(db, "great", { maxRank: roleRank("guest") }).map((h) => h.slug)).toEqual([
      "cats",
    ]);
    expect(
      keywordSearch(db, "great", { maxRank: roleRank("admin") })
        .map((h) => h.slug)
        .sort(),
    ).toEqual(["cats", "secrets"]);
  });

  it("does not expand link hops into a page above the caller's role", () => {
    const db = openIndexDb(":memory:");
    const indexer = new Indexer(db);
    indexer.upsertPage(
      parsePage("cats", "---\ntitle: Cats\nslug: cats\nrole: guest\n---\nSee [[secrets]]."),
    );
    indexer.upsertPage(
      parsePage("secrets", "---\ntitle: Secrets\nslug: secrets\nrole: admin\n---\nHidden stuff."),
    );

    const hits = keywordSearch(db, "cats", { expandHops: 1, maxRank: roleRank("guest") });
    expect(hits.map((h) => h.slug)).not.toContain("secrets");
  });
});
