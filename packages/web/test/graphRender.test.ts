import { describe, expect, it } from "vitest";
import { planReveal, revealProgress, REVEAL_DELAY, REVEAL_FADE, REVEAL_STAGGER } from "../src/lib/graph/render.js";
import { categoryColors, MONSTER_WHITE, UNCATEGORIZED } from "../src/lib/graph/sprites.js";
import type { LayoutNode } from "../src/lib/graph/layout.js";

function at(slug: string, x: number, y: number): LayoutNode {
  return { slug, title: slug, category: "c", role: "guest", summary: "", degree: 1, phase: 0, homeX: x, homeY: y, x, y };
}

describe("planReveal", () => {
  it("fades neighbours in one at a time, clockwise from twelve o'clock", () => {
    const center = { x: 0, y: 0 };
    const left = at("left", -10, 0), up = at("up", 0, -10), right = at("right", 10, 0), down = at("down", 0, 10);
    const upperLeft = at("upper-left", -10, -10);

    const reveal = planReveal(center, [upperLeft, right, down, left, up], 1000);

    expect([...reveal.delays.keys()]).toEqual(["up", "right", "down", "left", "upper-left"]);
    expect(reveal.delays.get("up")).toBe(REVEAL_DELAY);
    expect(reveal.delays.get("right")).toBe(REVEAL_DELAY + REVEAL_STAGGER);
  });

  it("reports progress from 0 to 1 across the fade, and 0 for pages it doesn't reveal", () => {
    const reveal = planReveal({ x: 0, y: 0 }, [at("only", 5, 0)], 0);

    expect(revealProgress(reveal, "only", REVEAL_DELAY)).toBe(0);
    expect(revealProgress(reveal, "only", REVEAL_DELAY + REVEAL_FADE / 2)).toBeCloseTo(0.5);
    expect(revealProgress(reveal, "only", REVEAL_DELAY + REVEAL_FADE * 2)).toBe(1);
    expect(revealProgress(reveal, "elsewhere", 10_000)).toBe(0);
  });
});

describe("categoryColors", () => {
  it("gives the biggest categories the first soul colours and keeps Uncategorized white", () => {
    const colors = categoryColors([
      { category: "Music" },
      { category: "Personal" },
      { category: "Personal" },
      { category: UNCATEGORIZED },
    ]);

    expect([...colors.keys()]).toEqual(["Personal", "Music", UNCATEGORIZED]);
    expect(colors.get(UNCATEGORIZED)).toBe(MONSTER_WHITE);
    expect(colors.get("Personal")).not.toBe(colors.get("Music"));
  });
});
