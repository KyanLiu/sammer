import { describe, it, expect } from "vitest";
import { roleRank } from "@sammer/shared";
import { openIndexDb } from "../../src/index/db.js";
import { Indexer } from "../../src/index/indexer.js";
import { parsePage } from "../../src/wiki/format.js";
import { listPageSlugs, listPageSummaries } from "../../src/index/pages.js";

describe("listPageSlugs / listPageSummaries", () => {
  it("only returns pages at or below the caller's rank", () => {
    const db = openIndexDb(":memory:");
    const indexer = new Indexer(db);
    indexer.upsertPage(
      parsePage("cats", "---\ntitle: Cats\nslug: cats\ncategory: Animals\nrole: guest\n---\nCats."),
    );
    indexer.upsertPage(
      parsePage(
        "secrets",
        "---\ntitle: Secrets\nslug: secrets\ncategory: Private\nrole: admin\n---\nShh.",
      ),
    );

    expect(listPageSlugs(db, roleRank("guest"))).toEqual(["cats"]);
    expect(listPageSlugs(db, roleRank("admin")).sort()).toEqual(["cats", "secrets"]);
    expect(listPageSummaries(db, roleRank("guest")).map((p) => p.slug)).toEqual(["cats"]);
  });

  it("includes each page's role and updated timestamp", () => {
    const db = openIndexDb(":memory:");
    const indexer = new Indexer(db);
    indexer.upsertPage(
      parsePage(
        "cats",
        "---\ntitle: Cats\nslug: cats\ncategory: Animals\nrole: friend\nupdated: 2026-01-02T00:00:00.000Z\n---\nCats.",
      ),
    );

    const [summary] = listPageSummaries(db, roleRank("admin"));
    expect(summary?.role).toBe("friend");
    expect(summary?.updated).toBe("2026-01-02T00:00:00.000Z");
  });
});
