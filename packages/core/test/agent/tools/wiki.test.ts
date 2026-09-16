import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WikiStore } from "../../../src/wiki/store.js";
import { WikiService } from "../../../src/wiki/service.js";
import { openIndexDb } from "../../../src/index/db.js";
import { Indexer } from "../../../src/index/indexer.js";
import { ToolRegistry } from "../../../src/agent/registry.js";
import {
  buildReadIndexTool,
  buildSearchWikiTool,
  buildReadPageTool,
  buildListPagesTool,
  buildWritePageTool,
} from "../../../src/agent/tools/wiki.js";

let store: WikiStore;
let registry: ToolRegistry;
let db: ReturnType<typeof openIndexDb>;
let indexer: Indexer;

beforeEach(async () => {
  store = new WikiStore(await mkdtemp(join(tmpdir(), "sammer-tools-")));
  await store.init();
  db = openIndexDb(":memory:");
  indexer = new Indexer(db);
  const wiki = new WikiService(store, indexer);
  const deps = { wiki, db };
  registry = new ToolRegistry();
  for (const tool of [
    buildReadIndexTool(deps),
    buildSearchWikiTool(deps),
    buildReadPageTool(deps),
    buildListPagesTool(deps),
    buildWritePageTool(deps),
  ]) {
    registry.register(tool);
  }
});

describe("wiki tools", () => {
  it("write_wiki_page persists and indexes, and the read tools find it", async () => {
    const wrote = await registry.invoke("write_wiki_page", {
      title: "Cats",
      body: "Cats are great. A cat naps a lot.",
      category: "Animals",
      summary: "Everything about cats",
    });
    expect(wrote).toMatch(/cats/);

    const page = await store.read("cats");
    expect(page?.metadata.title).toBe("Cats");
    expect(page?.metadata.category).toBe("Animals");
    expect(page?.metadata.summary).toBe("Everything about cats");

    expect(await registry.invoke("search_wiki", { query: "cat" })).toMatch(/cats/);
    expect(await registry.invoke("read_wiki_page", { slug: "cats" })).toMatch(/Cats are great/);
    expect(await registry.invoke("list_wiki_pages", {})).toMatch(/cats/);
  });

  it("read_wiki_index says so when nothing has been catalogued", async () => {
    expect(await registry.invoke("read_wiki_index", {})).toMatch(/empty/i);
  });

  it("marks only write_wiki_page as mutating", () => {
    expect(registry.defs({ readOnly: true }).map((d) => d.name).sort()).toEqual([
      "list_wiki_pages",
      "read_wiki_index",
      "read_wiki_page",
      "search_wiki",
    ]);
  });

  it("rejects a write_wiki_page call missing a required field", async () => {
    const out = await registry.invoke("write_wiki_page", { title: "Cats" });

    expect(out).toMatch(/^Error: invalid arguments/);
    expect(await store.read("cats")).toBeNull();
  });

  it("tells the model when a page does not exist", async () => {
    expect(await registry.invoke("read_wiki_page", { slug: "ghosts" })).toMatch(/does not exist/i);
  });
});

describe("role-aware wiki tools", () => {
  it("withhold a page above the caller's role from every read tool", async () => {
    await registry.invoke("write_wiki_page", {
      title: "Cats",
      body: "Cats are great.",
      category: "Animals",
      summary: "Everything about cats",
    });

    // write_wiki_page always creates an admin-only page (DEFAULT_PAGE_ROLE) —
    // a page's role is only ever lowered by hand-editing its frontmatter
    // (design spec §3/§8), which this test does directly, then reindexes to
    // keep the SQLite mirror in step with the file.
    const page = await store.read("cats");
    const guestPage = { ...page!, metadata: { ...page!.metadata, role: "friend" as const } };
    await store.write(guestPage);
    indexer.upsertPage(guestPage);

    const guestCtx = { caller: { role: "guest" as const } };
    expect(await registry.invoke("read_wiki_index", {}, guestCtx)).toMatch(/empty/i);
    expect(await registry.invoke("search_wiki", { query: "cat" }, guestCtx)).toBe("No matching pages.");
    expect(await registry.invoke("list_wiki_pages", {}, guestCtx)).toMatch(/empty/i);
    expect(await registry.invoke("read_wiki_page", { slug: "cats" }, guestCtx)).toMatch(
      /does not exist/i,
    );

    const adminCtx = { caller: { role: "admin" as const } };
    expect(await registry.invoke("read_wiki_index", {}, adminCtx)).toContain("cats");
    expect(await registry.invoke("read_wiki_page", { slug: "cats" }, adminCtx)).toMatch(
      /Cats are great/,
    );
  });
});
