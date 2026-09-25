import { describe, expect, it } from "vitest";
import { computeHomes, createSimulation, isHub, toLayoutNodes } from "../src/lib/graph/layout.js";
import type { PageGraph } from "../src/api.js";

const size = { width: 800, height: 500 };

function node(slug: string, category = "Personal") {
  return { slug, title: slug, category, role: "guest", summary: "" };
}

const graph: PageGraph = {
  nodes: [node("hub"), node("a"), node("b"), node("c"), node("d"), node("e"), node("lonely", "Uncategorized")],
  edges: [
    { src: "hub", dst: "a" },
    { src: "hub", dst: "b" },
    { src: "hub", dst: "c" },
    { src: "hub", dst: "d" },
    { src: "e", dst: "hub" },
    { src: "a", dst: "hub" },
    { src: "a", dst: "missing" },
  ],
};

describe("toLayoutNodes", () => {
  it("counts each neighbour once and ignores edges to pages that aren't in the graph", () => {
    const nodes = toLayoutNodes(graph, size);
    const bySlug = new Map(nodes.map((n) => [n.slug, n]));

    expect(bySlug.get("hub")?.degree).toBe(5);
    expect(bySlug.get("a")?.degree).toBe(1);
    expect(bySlug.get("lonely")?.degree).toBe(0);
  });

  it("marks pages with five or more links as hubs", () => {
    const nodes = toLayoutNodes(graph, size);

    expect(nodes.filter(isHub).map((n) => n.slug)).toEqual(["hub"]);
  });
});

describe("computeHomes", () => {
  it("places every page inside the canvas", () => {
    const nodes = toLayoutNodes(graph, size);
    computeHomes(nodes, graph.edges, size);

    for (const n of nodes) {
      expect(n.homeX).toBeGreaterThan(0);
      expect(n.homeX).toBeLessThan(size.width);
      expect(n.homeY).toBeGreaterThan(0);
      expect(n.homeY).toBeLessThan(size.height);
    }
  });

  it("gives the same layout for the same graph", () => {
    const first = toLayoutNodes(graph, size);
    const second = toLayoutNodes(graph, size);
    computeHomes(first, graph.edges, size);
    computeHomes(second, graph.edges, size);

    expect(second.map((n) => [n.homeX, n.homeY])).toEqual(first.map((n) => [n.homeX, n.homeY]));
  });
});

describe("createSimulation", () => {
  it("springs a released page back to its home when snap is on", () => {
    const nodes = toLayoutNodes(graph, size);
    const sim = createSimulation(nodes, graph.edges, size, () => ({ snap: true, drift: false })).stop();
    for (const n of nodes) {
      n.x = n.homeX;
      n.y = n.homeY;
    }
    const pulled = nodes.find((n) => n.slug === "b")!;
    pulled.x! += 220;
    pulled.y! -= 140;

    sim.alpha(1);
    for (let i = 0; i < 400; i++) sim.tick();

    expect(Math.hypot(pulled.x! - pulled.homeX, pulled.y! - pulled.homeY)).toBeLessThan(6);
  });
});
