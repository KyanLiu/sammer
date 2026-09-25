import { describe, expect, it } from "vitest";
import { splitWikiLinks } from "../src/lib/wikiLinks.js";

describe("splitWikiLinks", () => {
  it("returns plain text untouched", () => {
    expect(splitWikiLinks("no links here")).toEqual([{ kind: "text", text: "no links here" }]);
  });

  it("turns a [[link]] into a link segment with its slug", () => {
    expect(splitWikiLinks("see [[Cloudflare Tunnel]] for more")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "Cloudflare Tunnel", slug: "cloudflare-tunnel" },
      { kind: "text", text: " for more" },
    ]);
  });

  it("shows the alias and ignores the heading anchor", () => {
    expect(splitWikiLinks("[[home-lab#network|the lab]]")).toEqual([
      { kind: "link", text: "the lab", slug: "home-lab" },
    ]);
  });

  it("keeps the heading in the label when there is no alias", () => {
    expect(splitWikiLinks("[[home-lab#network]]")).toEqual([
      { kind: "link", text: "home-lab#network", slug: "home-lab" },
    ]);
  });

  it("leaves embeds and empty targets as text", () => {
    expect(splitWikiLinks("a ![[diagram.png]] b [[#]] c")).toEqual([
      { kind: "text", text: "a ![[diagram.png]] b [[#]] c" },
    ]);
  });

  it("handles adjacent links", () => {
    expect(splitWikiLinks("[[a]][[b]]")).toEqual([
      { kind: "link", text: "a", slug: "a" },
      { kind: "link", text: "b", slug: "b" },
    ]);
  });
});
