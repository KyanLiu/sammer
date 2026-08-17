import { describe, it, expect } from "vitest";
import { slugify } from "../src/slug.js";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Big Boxes")).toBe("big-boxes");
  });

  it("drops punctuation", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("collapses a run of non-alphanumerics into one hyphen", () => {
    expect(slugify("cats  &  dogs")).toBe("cats-dogs");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  ...cats...  ")).toBe("cats");
  });

  it("keeps digits", () => {
    expect(slugify("Task 8")).toBe("task-8");
  });

  it("returns empty for a title with nothing sluggable", () => {
    expect(slugify("!!!")).toBe("");
  });
});
