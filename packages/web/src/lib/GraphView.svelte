<script lang="ts">
  import { layoutGraph } from "./forceGraph.js";
  import type { PageGraph } from "../api.js";

  let { graph, onopen }: { graph: PageGraph; onopen: (slug: string) => void } = $props();

  const WIDTH = 760;
  const HEIGHT = 420;

  const positions = $derived(
    layoutGraph(
      graph.nodes.map((n) => n.slug),
      graph.edges,
      { width: WIDTH, height: HEIGHT },
    ),
  );

  const linked = $derived(new Set(graph.edges.flatMap((e) => [e.src, e.dst])));

  function degree(slug: string): number {
    return graph.edges.filter((e) => e.src === slug || e.dst === slug).length;
  }
</script>

<div class="wrap">
  <svg viewBox="0 0 {WIDTH} {HEIGHT}">
    {#each graph.edges as edge (edge.src + "->" + edge.dst)}
      {@const a = positions.get(edge.src)}
      {@const b = positions.get(edge.dst)}
      {#if a && b}
        <line class="edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {/if}
    {/each}
    {#each graph.nodes as node (node.slug)}
      {@const p = positions.get(node.slug)}
      {#if p}
        {@const r = 8 + Math.min(4, degree(node.slug)) * 2}
        <g
          class="node"
          class:orphan={!linked.has(node.slug)}
          role="button"
          tabindex="0"
          onclick={() => onopen(node.slug)}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && onopen(node.slug)}
        >
          <circle cx={p.x} cy={p.y} r={r} />
          <text x={p.x} y={p.y - r - 8} text-anchor="middle">{node.title}</text>
        </g>
      {/if}
    {/each}
  </svg>
  <div class="legend">
    <span><span class="dot"></span>page</span>
    <span><span class="dot orphan"></span>no links in or out</span>
  </div>
</div>

<style>
  .wrap {
    position: relative;
    height: 420px;
    background: var(--surface-sunken);
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .edge {
    stroke: var(--line-soft);
    stroke-width: 1.5;
  }
  .node circle {
    fill: var(--surface-card);
    stroke: var(--line-strong);
    stroke-width: 2;
    cursor: pointer;
    transition: stroke var(--dur-fast) var(--ease-standard);
  }
  .node:hover circle,
  .node:focus-visible circle {
    stroke: var(--nav-rule);
  }
  .node.orphan circle {
    stroke-dasharray: 3 3;
    stroke: var(--text-faint);
  }
  .node text {
    fill: var(--text-body);
    font: 13px var(--font-ui);
    pointer-events: none;
  }
  .legend {
    position: absolute;
    bottom: 12px;
    left: 16px;
    font-size: 12.5px;
    color: var(--text-faint);
    display: flex;
    gap: 16px;
  }
  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border: 2px solid var(--line-strong);
    border-radius: 50%;
    margin-right: 5px;
    vertical-align: middle;
  }
  .dot.orphan {
    border-style: dashed;
    border-color: var(--text-faint);
  }
</style>
