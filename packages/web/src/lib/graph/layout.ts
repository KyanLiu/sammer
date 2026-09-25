import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import type { GraphEdge, GraphNode, PageGraph } from "../../api.js";

export const HUB_LINKS = 5;

export interface LayoutNode extends GraphNode, SimulationNodeDatum {
  degree: number;
  phase: number;
  homeX: number;
  homeY: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Motion {
  snap: boolean;
  drift: boolean;
}

export type LayoutSimulation = Simulation<LayoutNode, undefined>;

const EDGE_MARGIN = 28;
const LABEL_ROOM = 24;
const HOME_PULL = 0.045;
const DRIFT = 0.012;
const SETTLE_TICKS = 420;

export function isHub(n: { degree: number }): boolean {
  return n.degree >= HUB_LINKS;
}

export function spriteScale(n: { degree: number }): number {
  return Math.round(2.9 + Math.min(n.degree, 8) * 0.3) + (isHub(n) ? 1 : 0);
}

export function nodeRadius(n: { degree: number }): number {
  return spriteScale(n) * 3.5;
}

export function neighbourMap(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Set<string>> {
  const adj = new Map(nodes.map((n) => [n.slug, new Set<string>()]));
  for (const { src, dst } of edges) {
    if (src === dst || !adj.has(src) || !adj.has(dst)) continue;
    adj.get(src)!.add(dst);
    adj.get(dst)!.add(src);
  }
  return adj;
}

export function toLayoutNodes(graph: PageGraph, size: Size): LayoutNode[] {
  const adj = neighbourMap(graph.nodes, graph.edges);
  return graph.nodes.map((n, i) => ({
    ...n,
    degree: adj.get(n.slug)!.size,
    phase: i * 1.7,
    x: size.width / 2 + Math.cos(i) * 30,
    y: size.height / 2 + Math.sin(i) * 30,
    homeX: size.width / 2,
    homeY: size.height / 2,
  }));
}

function perNode(apply: (nodes: LayoutNode[]) => void): Force<LayoutNode, undefined> {
  let nodes: LayoutNode[] = [];
  const force = () => apply(nodes);
  force.initialize = (next: LayoutNode[]) => {
    nodes = next;
  };
  return force;
}

function linkData(nodes: { slug: string }[], edges: GraphEdge[]) {
  const present = new Set(nodes.map((n) => n.slug));
  return edges
    .filter((e) => e.src !== e.dst && present.has(e.src) && present.has(e.dst))
    .map((e) => ({ source: e.src, target: e.dst }));
}

function applyLayoutForces(sim: LayoutSimulation, edges: GraphEdge[], size: Size) {
  const { width, height } = size;
  const isolated = (n: LayoutNode) => n.degree === 0;
  sim
    .force(
      "link",
      forceLink<LayoutNode, { source: string | LayoutNode; target: string | LayoutNode }>(linkData(sim.nodes(), edges))
        .id((d) => d.slug)
        .distance((l) => {
          const a = l.source as LayoutNode, b = l.target as LayoutNode;
          return 48 + (nodeRadius(a) + nodeRadius(b)) * 1.3;
        })
        .strength((l) => 0.6 / Math.min((l.source as LayoutNode).degree, (l.target as LayoutNode).degree)),
    )
    .force("charge", forceManyBody<LayoutNode>().strength((n) => -160 - n.degree * 24).distanceMax(420))
    .force("collide", forceCollide<LayoutNode>((n) => nodeRadius(n) + 18).strength(0.9))
    .force("x", forceX<LayoutNode>(width / 2).strength((n) => (isolated(n) ? 0.003 : 0.04)))
    .force("y", forceY<LayoutNode>(height / 2).strength((n) => (isolated(n) ? 0.003 : 0.06)))
    .force("ring", forceRadial<LayoutNode>(Math.min(width, height) * 0.38, width / 2, height / 2).strength((n) => (isolated(n) ? 0.08 : 0)))
    .force(
      "bounds",
      perNode((nodes) => {
        for (const n of nodes) {
          const r = nodeRadius(n);
          const x0 = EDGE_MARGIN + r, x1 = width - EDGE_MARGIN - r;
          const y0 = EDGE_MARGIN + r, y1 = height - EDGE_MARGIN - r - LABEL_ROOM;
          if (n.x! < x0) n.vx! += (x0 - n.x!) * 0.15;
          if (n.x! > x1) n.vx! -= (n.x! - x1) * 0.15;
          if (n.y! < y0) n.vy! += (y0 - n.y!) * 0.15;
          if (n.y! > y1) n.vy! -= (n.y! - y1) * 0.15;
        }
      }),
    );
}

export function computeHomes(nodes: LayoutNode[], edges: GraphEdge[], size: Size) {
  const copies: LayoutNode[] = nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    return { ...n, x: size.width / 2 + Math.cos(a) * 160, y: size.height / 2 + Math.sin(a) * 120, vx: 0, vy: 0, fx: null, fy: null };
  });
  const settle = forceSimulation(copies).stop();
  applyLayoutForces(settle, edges, size);
  for (let i = 0; i < SETTLE_TICKS; i++) settle.tick();
  copies.forEach((c, i) => {
    nodes[i].homeX = c.x!;
    nodes[i].homeY = c.y!;
  });
}

export function createSimulation(nodes: LayoutNode[], edges: GraphEdge[], size: Size, motion: () => Motion): LayoutSimulation {
  computeHomes(nodes, edges, size);
  const sim: LayoutSimulation = forceSimulation(nodes).alphaDecay(0.02).velocityDecay(0.22);
  applyLayoutForces(sim, edges, size);
  const startedAt = performance.now();
  sim.force(
    "home",
    perNode((ns) => {
      if (!motion().snap) return;
      for (const n of ns) {
        if (n.fx != null) continue;
        n.vx! += (n.homeX - n.x!) * HOME_PULL;
        n.vy! += (n.homeY - n.y!) * HOME_PULL;
      }
    }),
  );
  sim.force(
    "drift",
    perNode((ns) => {
      if (!motion().drift) return;
      const t = (performance.now() - startedAt) / 1000;
      for (const n of ns) {
        if (n.fx != null) continue;
        n.vx! += Math.sin(t * 0.4 + n.phase) * DRIFT;
        n.vy! += Math.cos(t * 0.33 + n.phase * 1.3) * DRIFT;
      }
    }),
  );
  return sim;
}

export function resizeSimulation(sim: LayoutSimulation, edges: GraphEdge[], size: Size) {
  computeHomes(sim.nodes(), edges, size);
  applyLayoutForces(sim, edges, size);
}
