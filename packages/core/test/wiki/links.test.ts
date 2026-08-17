import { describe, it, expect } from "vitest";
import { extractLinks } from "../../src/wiki/links.js";

describe("extractLinks", () => {
  it("links to the page, not the display alias", () => {
    expect(extractLinks("built on [[SQLite|the embedded database]]")).toEqual(["sqlite"]);
  });

  it("links to the page, not the heading anchor", () => {
    expect(extractLinks("see [[Architecture#Data flow]]")).toEqual(["architecture"]);
  });

  it("handles an anchor and an alias together", () => {
    expect(extractLinks("see [[Architecture#Data flow|the diagram]]")).toEqual(["architecture"]);
  });

  it("ignores a link to a heading in the same page", () => {
    expect(extractLinks("jump to [[#Data flow]]")).toEqual([]);
  });

  it("collapses aliased and plain links to the same page", () => {
    expect(extractLinks("[[cats]] and [[cats|felines]]")).toEqual(["cats"]);
  });

  it("ignores an embedded asset — a file is not a page", () => {
    expect(extractLinks("![[diagram.png]]")).toEqual([]);
  });

  it("ignores an embedded asset whatever the case of its extension", () => {
    expect(extractLinks("![[Diagram.PNG]] and ![[clip.MP4]]")).toEqual([]);
  });

  it("still links a transcluded note", () => {
    expect(extractLinks("![[Other Note]]")).toEqual(["other-note"]);
  });

  it("still links a note whose title ends in something extension-like", () => {
    expect(extractLinks("![[Node.js]]")).toEqual(["node-js"]);
  });

  it("keeps a real link next to an embedded asset", () => {
    expect(extractLinks("![[diagram.png]] explained in [[Architecture]]")).toEqual(["architecture"]);
  });
});
