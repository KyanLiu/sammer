import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WikiStore } from "../../src/wiki/store.js";
import { parsePage } from "../../src/wiki/format.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sammer-wiki-"));
});

describe("WikiStore", () => {
  it("writes, reads, lists, and removes pages", async () => {
    const store = new WikiStore(dir);
    await store.init();
    const page = parsePage("cats", "---\ntitle: Cats\nslug: cats\n---\nMeow [[boxes]].");
    await store.write(page);
    const read = await store.read("cats");
    expect(read?.metadata.title).toBe("Cats");
    expect(await store.list()).toEqual(["cats"]);
    await store.remove("cats");
    expect(await store.read("cats")).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it("dates a hand-added page from the file's timestamps, not the epoch", async () => {
    const store = new WikiStore(dir);
    await store.init();
    const file = join(dir, "dogs.md");
    await writeFile(file, "---\ntitle: Dogs\n---\nWoof.", "utf8");

    const page = await store.read("dogs");
    const { mtime } = await stat(file);

    expect(page?.metadata.updated).toBe(mtime.toISOString());
    expect(page?.metadata.created).not.toBe(new Date(0).toISOString());
    expect(Date.parse(page!.metadata.created)).toBeLessThanOrEqual(mtime.getTime());
    await rm(dir, { recursive: true, force: true });
  });

  it("hides the engine-maintained index and log from the page listing", async () => {
    const store = new WikiStore(dir);
    await store.init();
    await store.write(parsePage("cats", "---\ntitle: Cats\nslug: cats\n---\nMeow."));
    await store.writeText("index", "# Index\n");
    await store.appendText("log", "- something happened\n");

    // They are real files the agent can still read by name...
    expect(await store.read("index")).not.toBeNull();
    // ...but they are not content pages, so they never show up as ones.
    expect(await store.list()).toEqual(["cats"]);
    await rm(dir, { recursive: true, force: true });
  });

  it("appendText builds a file up across calls without rewriting it", async () => {
    const store = new WikiStore(dir);
    await store.init();

    await store.appendText("log", "first\n");
    await store.appendText("log", "second\n");

    expect(await store.readText("log")).toBe("first\nsecond\n");
    await rm(dir, { recursive: true, force: true });
  });

  it("writeText replaces the whole file", async () => {
    const store = new WikiStore(dir);
    await store.init();

    await store.writeText("index", "old\n");
    await store.writeText("index", "new\n");

    expect(await store.readText("index")).toBe("new\n");
    await rm(dir, { recursive: true, force: true });
  });

  it("readText returns null for a file that does not exist", async () => {
    const store = new WikiStore(dir);
    await store.init();
    expect(await store.readText("log")).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps frontmatter dates when the page declares them", async () => {
    const store = new WikiStore(dir);
    await store.init();
    const declared = "2026-03-04T05:06:07.000Z";
    await writeFile(
      join(dir, "birds.md"),
      `---\ntitle: Birds\ncreated: ${declared}\nupdated: ${declared}\n---\nTweet.`,
      "utf8",
    );

    const page = await store.read("birds");

    expect(page?.metadata.created).toBe(declared);
    expect(page?.metadata.updated).toBe(declared);
    await rm(dir, { recursive: true, force: true });
  });
});
