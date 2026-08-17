import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WikiStore } from "../../../src/wiki/store.js";
import { WikiService } from "../../../src/wiki/service.js";
import { openIndexDb } from "../../../src/index/db.js";
import { Indexer } from "../../../src/index/indexer.js";
import { ToolRegistry } from "../../../src/agent/registry.js";
import { buildWikiTools } from "../../../src/agent/tools/wiki.js";

let store: WikiStore;
let registry: ToolRegistry;

beforeEach(async () => {
  store = new WikiStore(await mkdtemp(join(tmpdir(), "sammer-tools-")));
  await store.init();
  const db = openIndexDb(":memory:");
  const wiki = new WikiService(store, new Indexer(db));
  registry = new ToolRegistry();
  for (const tool of buildWikiTools({ wiki, db })) registry.register(tool);
});

describe("wiki tools", () => {
  it("write_page persists and indexes, and the read tools find it", async () => {
    const wrote = await registry.invoke("write_page", {
      title: "Cats",
      body: "Cats are great. A cat naps a lot.",
      category: "Animals",
      summary: "Everything about cats",
    });
    expect(wrote).toMatch(/cats/);

    const page = await store.read("cats");
    expect(page?.title).toBe("Cats");
    expect(page?.category).toBe("Animals");
    expect(page?.summary).toBe("Everything about cats");

    expect(await registry.invoke("search_wiki", { query: "cat" })).toMatch(/cats/);
    expect(await registry.invoke("read_page", { slug: "cats" })).toMatch(/Cats are great/);
    expect(await registry.invoke("list_pages", {})).toMatch(/cats/);
  });

  it("read_index says so when nothing has been catalogued", async () => {
    expect(await registry.invoke("read_index", {})).toMatch(/empty/i);
  });

  it("marks only write_page as mutating", () => {
    expect(registry.defs({ readOnly: true }).map((d) => d.name).sort()).toEqual([
      "list_pages",
      "read_index",
      "read_page",
      "search_wiki",
    ]);
  });

  it("rejects a write_page call missing a required field", async () => {
    const out = await registry.invoke("write_page", { title: "Cats" });

    expect(out).toMatch(/^Error: invalid arguments/);
    expect(await store.read("cats")).toBeNull();
  });

  it("tells the model when a page does not exist", async () => {
    expect(await registry.invoke("read_page", { slug: "ghosts" })).toMatch(/does not exist/i);
  });
});
