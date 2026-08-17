import { describe, it, expect } from "vitest";
import { parsePage, serializePage } from "../../src/wiki/format.js";

describe("page format", () => {
  it("round-trips a page", () => {
    const md = [
      "---",
      "id: p1",
      "title: Cats",
      "slug: cats",
      "tags: [animals]",
      "created: 2026-01-01T00:00:00.000Z",
      "updated: 2026-01-01T00:00:00.000Z",
      "sources: []",
      "---",
      "Cats like [[boxes]].",
      "",
    ].join("\n");
    const page = parsePage("cats", md);
    expect(page.title).toBe("Cats");
    expect(page.tags).toEqual(["animals"]);
    expect(page.links).toEqual(["boxes"]);
    expect(page.body.trim()).toBe("Cats like [[boxes]].");
    const out = parsePage("cats", serializePage(page));
    expect(out).toEqual(page);
  });

  it("preserves unquoted ISO timestamps as ISO strings", () => {
    const md = [
      "---",
      "title: T",
      "slug: t",
      "created: 2026-03-04T05:06:07.000Z",
      "updated: 2026-03-04T05:06:07.000Z",
      "---",
      "body",
    ].join("\n");
    const page = parsePage("t", md);
    expect(page.created).toBe("2026-03-04T05:06:07.000Z");
    expect(page.updated).toBe("2026-03-04T05:06:07.000Z");
  });

  it("parses category and summary, applying defaults", () => {
    const withVals = parsePage(
      "p",
      "---\ntitle: P\nslug: p\ncategory: Animals\nsummary: About cats\n---\nbody",
    );
    expect(withVals.category).toBe("Animals");
    expect(withVals.summary).toBe("About cats");
    const defaults = parsePage("p", "---\ntitle: P\nslug: p\n---\nbody");
    expect(defaults.category).toBe("Uncategorized");
    expect(defaults.summary).toBe("");
  });
});
