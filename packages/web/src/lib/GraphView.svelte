<script lang="ts">
  import { layoutGraph } from "./forceGraph.js";
  import type { PageGraph } from "../api.js";

  let { graph, onopen }: { graph: PageGraph; onopen: (slug: string) => void } = $props();

  const MOBILE_WIDTH = 480;
  const MIN_SCALE = 1;
  const MAX_SCALE = 3;

  // Measured from .wrap so the viewBox always matches the container's real
  // aspect ratio — without this a landscape viewBox inside a portrait phone
  // container gets letterboxed down to a thumbnail by preserveAspectRatio.
  let wrapWidth = $state(760);
  let wrapHeight = $state(420);
  const isMobile = $derived(wrapWidth < MOBILE_WIDTH);
  const baseRadius = $derived(isMobile ? 20 : 8);

  const positions = $derived(
    layoutGraph(
      graph.nodes.map((n) => n.slug),
      graph.edges,
      { width: wrapWidth, height: wrapHeight },
    ),
  );

  const linked = $derived(new Set(graph.edges.flatMap((e) => [e.src, e.dst])));

  function degree(slug: string): number {
    return graph.edges.filter((e) => e.src === slug || e.dst === slug).length;
  }

  // Pan/zoom is a view transform on the already-laid-out <g> — it never
  // re-runs the force simulation, just translates/scales the fixed result.
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);

  const pointers = new Map<number, { x: number; y: number }>();
  let dragStart: { x: number; y: number; tx: number; ty: number } | null = null;
  let pinchStart: { dist: number; scale: number } | null = null;

  function pointerDistance(): number {
    const pts = [...pointers.values()];
    if (pts.length < 2) return 1;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onPointerDown(e: PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragStart = { x: e.clientX, y: e.clientY, tx, ty };
    } else if (pointers.size === 2) {
      pinchStart = { dist: pointerDistance(), scale };
      dragStart = null;
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStart.scale * (pointerDistance() / pinchStart.dist)));
    } else if (pointers.size === 1 && dragStart) {
      tx = dragStart.tx + (e.clientX - dragStart.x);
      ty = dragStart.ty + (e.clientY - dragStart.y);
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size < 1) dragStart = null;
  }

  function zoomBy(factor: number) {
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    if (scale === MIN_SCALE) {
      tx = 0;
      ty = 0;
    }
  }
</script>

<div class="wrap" bind:clientWidth={wrapWidth} bind:clientHeight={wrapHeight}>
  <svg
    viewBox="0 0 {wrapWidth} {wrapHeight}"
    role="application"
    aria-label="Page link graph — drag to pan, pinch to zoom"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <g transform="translate({tx},{ty}) scale({scale})">
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
          {@const r = baseRadius + Math.min(4, degree(node.slug)) * 2}
          <g
            class="node"
            class:orphan={!linked.has(node.slug)}
            role="button"
            tabindex="0"
            onclick={() => onopen(node.slug)}
            onkeydown={(e) => (e.key === "Enter" || e.key === " ") && onopen(node.slug)}
          >
            <circle cx={p.x} cy={p.y} r={r} />
            <text x={p.x} y={p.y - r - 8} text-anchor="middle" class:mobile-label={isMobile}>{node.title}</text>
          </g>
        {/if}
      {/each}
    </g>
  </svg>
  <div class="zoom-controls">
    <button type="button" aria-label="Zoom in" onclick={() => zoomBy(1.3)}>+</button>
    <button type="button" aria-label="Zoom out" onclick={() => zoomBy(1 / 1.3)}>&minus;</button>
  </div>
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
  @media (max-width: 640px) {
    .wrap {
      height: auto;
      aspect-ratio: 3 / 4;
      min-height: 360px;
    }
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
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
  .node text.mobile-label {
    font-size: 16px;
  }
  .zoom-controls {
    position: absolute;
    right: 12px;
    bottom: 44px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .zoom-controls button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-card);
    border: var(--border-width) solid var(--line-strong);
    color: var(--text-strong);
    font: 500 16px / 1 var(--font-mono);
    cursor: pointer;
    padding: 0;
  }
  .zoom-controls button:hover {
    border-color: var(--nav-rule);
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
