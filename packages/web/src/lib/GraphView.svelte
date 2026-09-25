<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { select } from "d3-selection";
  import { drag } from "d3-drag";
  import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
  import "d3-transition";
  import GraphOptions from "./GraphOptions.svelte";
  import GraphPreview from "./GraphPreview.svelte";
  import {
    createSimulation,
    neighbourMap,
    nodeRadius,
    resizeSimulation,
    toLayoutNodes,
    type LayoutNode,
    type LayoutSimulation,
    type Size,
  } from "./graph/layout.js";
  import { drawScene, matchesQuery, nextDim, planReveal, type Link, type Reveal } from "./graph/render.js";
  import { categoryColors } from "./graph/sprites.js";
  import type { PageGraph } from "../api.js";

  let { graph, onopen }: { graph: PageGraph; onopen: (slug: string) => void } = $props();

  const PREVIEW_CLEARANCE = 340;
  const NARROW = 640;
  const IDLE_ALPHA = 0.012;
  const ZOOM_STEP = 1.4;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let arena: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let searchInput = $state<HTMLInputElement>();

  let selected = $state.raw<LayoutNode | null>(null);
  let hover = $state.raw<LayoutNode | null>(null);
  let menuOpen = $state(false);
  let query = $state("");
  let snap = $state(true);
  let drift = $state(!reduced);
  let allLabels = $state(false);
  const hidden = new SvelteSet<string>();

  const colors = $derived(categoryColors(graph.nodes));
  const categories = $derived(
    [...colors].map(([name, color]) => ({ name, color, count: graph.nodes.filter((n) => n.category === name).length })),
  );

  let nodes: LayoutNode[] = [];
  let bySlug = new Map<string, LayoutNode>();
  let adjacency = new Map<string, Set<string>>();
  let links: Link[] = [];
  let sim: LayoutSimulation | null = null;
  let built: PageGraph | null = null;
  let size: Size = { width: 0, height: 0 };
  let dpr = 1;
  let transform: ZoomTransform = zoomIdentity;
  let zoomer: ZoomBehavior<HTMLCanvasElement, unknown>;
  let dragging: LayoutNode | null = null;
  let reveal: Reveal | null = null;
  let dim = 1;
  let pointerDownAt: [number, number] | null = null;

  const neighbours = $derived(selected ? [...(adjacency.get(selected.slug) ?? [])].map((s) => bySlug.get(s)!) : []);

  function rebuild(next: PageGraph) {
    built = next;
    sim?.stop();
    selected = null;
    hover = null;
    reveal = null;
    nodes = toLayoutNodes(next, size);
    bySlug = new Map(nodes.map((n) => [n.slug, n]));
    adjacency = neighbourMap(next.nodes, next.edges);
    links = [];
    for (const [a, others] of adjacency) {
      for (const b of others) if (a < b) links.push({ a: bySlug.get(a)!, b: bySlug.get(b)! });
    }
    sim = createSimulation(nodes, next.edges, size, () => ({ snap, drift }));
    for (const n of nodes) {
      n.x = size.width / 2 + (n.homeX - size.width / 2) * 0.5;
      n.y = size.height / 2 + (n.homeY - size.height / 2) * 0.5;
    }
    sim.alpha(1).alphaTarget(drift ? IDLE_ALPHA : 0).restart();
  }

  $effect(() => {
    const next = graph;
    untrack(() => {
      if (size.width > 0 && next !== built) rebuild(next);
    });
  });

  $effect(() => {
    const idle = drift;
    untrack(() => sim?.alphaTarget(idle ? IDLE_ALPHA : 0).alpha(Math.max(sim.alpha(), 0.1)).restart());
  });

  $effect(() => {
    if (snap) untrack(() => sim?.alpha(0.5).restart());
  });

  $effect(() => {
    if (selected && hidden.has(selected.category)) untrack(() => selectNode(null));
  });

  function visible(n: LayoutNode) {
    return !hidden.has(n.category);
  }

  function nodeAt(sx: number, sy: number): LayoutNode | null {
    const [x, y] = transform.invert([sx, sy]);
    let best: LayoutNode | null = null;
    let bestDistance = Infinity;
    for (const n of nodes) {
      if (!visible(n)) continue;
      const d = Math.hypot(n.x! - x, n.y! - y);
      if (d < nodeRadius(n) + 6 / transform.k && d < bestDistance) {
        best = n;
        bestDistance = d;
      }
    }
    return best;
  }

  function selectNode(n: LayoutNode | null) {
    selected = n;
    reveal = n ? planReveal(n, neighbours, reduced ? -Infinity : performance.now()) : null;
    if (n) keepClearOfPreview(n);
  }

  function keepClearOfPreview(n: LayoutNode) {
    if (window.innerWidth <= NARROW) return;
    const [sx] = transform.apply([n.x!, n.y!]);
    if (sx >= PREVIEW_CLEARANCE) return;
    const dx = PREVIEW_CLEARANCE + (size.width - PREVIEW_CLEARANCE) / 2 - sx;
    select(canvas).transition().duration(reduced ? 0 : 450).call(zoomer.translateBy, dx / transform.k, 0);
  }

  function pick(n: LayoutNode) {
    hover = null;
    hidden.delete(n.category);
    selectNode(n);
  }

  function find() {
    const q = query.trim().toLowerCase();
    const n = nodes.find((m) => matchesQuery(m, q) && visible(m));
    if (!n) return;
    menuOpen = false;
    const k = Math.max(transform.k, 1.2);
    const offset = size.width > NARROW ? PREVIEW_CLEARANCE : 0;
    const target = zoomIdentity.translate((size.width + offset) / 2 - n.homeX * k, size.height / 2 - n.homeY * k).scale(k);
    select(canvas)
      .transition()
      .duration(reduced ? 0 : 500)
      .call(zoomer.transform, target)
      .on("end", () => selectNode(n));
  }

  function zoomBy(factor: number) {
    select(canvas).transition().duration(reduced ? 0 : 250).call(zoomer.scaleBy, factor);
  }

  function resetView() {
    selectNode(null);
    menuOpen = false;
    select(canvas).transition().duration(reduced ? 0 : 400).call(zoomer.transform, zoomIdentity);
    for (const n of nodes) n.fx = n.fy = null;
    sim?.alpha(0.8).restart();
  }

  function measure() {
    const r = arena.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = { width: r.width, height: r.height };
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
  }

  function onPointerMove(event: PointerEvent) {
    if (dragging) return;
    const r = canvas.getBoundingClientRect();
    hover = nodeAt(event.clientX - r.left, event.clientY - r.top);
  }

  function onClick(event: MouseEvent) {
    if (!pointerDownAt || Math.hypot(event.clientX - pointerDownAt[0], event.clientY - pointerDownAt[1]) > 4) return;
    const r = canvas.getBoundingClientRect();
    if (!nodeAt(event.clientX - r.left, event.clientY - r.top) && selected) selectNode(null);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (menuOpen) menuOpen = false;
      else if (selected) selectNode(null);
      return;
    }
    const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable='true']");
    if (event.key === "/" && !typing) {
      event.preventDefault();
      menuOpen = true;
      queueMicrotask(() => searchInput?.focus());
    }
  }

  onMount(() => {
    measure();
    const ctx = canvas.getContext("2d")!;

    zoomer = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.4, 4])
      .filter((event) => (!event.ctrlKey || event.type === "wheel") && !event.button)
      .on("zoom", (event) => {
        transform = event.transform;
      });

    interface Grab {
      node: LayoutNode;
      x: number;
      y: number;
    }
    let startedAt: [number, number] = [0, 0];
    let moved = 0;
    let trail: { x: number; y: number; t: number }[] = [];
    let grabOffset: [number, number] = [0, 0];
    const dragger = drag<HTMLCanvasElement, unknown, Grab>()
      .container(canvas)
      .subject((event) => {
        const node = nodeAt(event.x, event.y);
        return (node ? { node, x: event.x, y: event.y } : null) as Grab;
      })
      .on("start", (event) => {
        const n = event.subject.node;
        dragging = n;
        startedAt = [event.x, event.y];
        moved = 0;
        trail = [];
        sim?.alphaTarget(0.3).restart();
        const [wx, wy] = transform.invert([event.x, event.y]);
        grabOffset = [n.x! - wx, n.y! - wy];
        n.fx = n.x;
        n.fy = n.y;
      })
      .on("drag", (event) => {
        const n = event.subject.node;
        const [wx, wy] = transform.invert([event.x, event.y]);
        n.fx = wx + grabOffset[0];
        n.fy = wy + grabOffset[1];
        moved = Math.max(moved, Math.hypot(event.x - startedAt[0], event.y - startedAt[1]));
        trail.push({ x: n.fx, y: n.fy, t: performance.now() });
        if (trail.length > 6) trail.shift();
      })
      .on("end", (event) => {
        const n = event.subject.node;
        dragging = null;
        sim?.alphaTarget(drift ? IDLE_ALPHA : 0);
        n.fx = n.fy = null;
        if (moved < 4) {
          n.vx = n.vy = 0;
          selectNode(n);
          return;
        }
        if (trail.length >= 2 && !reduced) {
          const first = trail[0], last = trail[trail.length - 1];
          const k = (16 / Math.max(16, last.t - first.t)) * 0.9;
          n.vx = Math.max(-45, Math.min(45, (last.x - first.x) * k));
          n.vy = Math.max(-45, Math.min(45, (last.y - first.y) * k));
        }
        sim?.alpha(Math.max(sim.alpha(), 0.5)).restart();
      });

    select(canvas).call(dragger).call(zoomer).on("dblclick.zoom", null);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      const before = size;
      measure();
      if (size.width === before.width && size.height === before.height) return;
      if (!built) {
        rebuild(graph);
        return;
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!sim) return;
        resizeSimulation(sim, graph.edges, size);
        sim.alpha(0.6).restart();
      }, 120);
    });
    observer.observe(arena);

    if (size.width > 0) rebuild(graph);

    let frame = requestAnimationFrame(function loop(now) {
      dim = nextDim(dim, selected !== null, reduced);
      drawScene(ctx, {
        nodes,
        links,
        colors,
        transform,
        width: size.width,
        height: size.height,
        dpr,
        now,
        reduced,
        hover,
        selected,
        dragging,
        reveal,
        dim,
        hidden,
        query: query.trim().toLowerCase(),
        allLabels,
      });
      canvas.classList.toggle("over", hover !== null && !dragging);
      canvas.classList.toggle("dragging", dragging !== null);
      frame = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      observer.disconnect();
      sim?.stop();
    };
  });
</script>

<svelte:document onkeydown={onKeydown} />

<div class="arena" bind:this={arena}>
  <canvas
    bind:this={canvas}
    aria-label="Graph of wiki pages and the links between them"
    onpointerdown={(e) => {
      pointerDownAt = [e.clientX, e.clientY];
      menuOpen = false;
    }}
    onpointermove={onPointerMove}
    onpointerleave={() => {
      if (!dragging) hover = null;
    }}
    onclick={onClick}
  ></canvas>

  <button
    type="button"
    class="options-toggle"
    aria-expanded={menuOpen}
    aria-controls="graph-options"
    onclick={() => (menuOpen = !menuOpen)}
  >
    <span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>options
  </button>

  <div class="zoom-controls">
    <button type="button" aria-label="Zoom in" onclick={() => zoomBy(ZOOM_STEP)}>+</button>
    <button type="button" aria-label="Zoom out" onclick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
  </div>

  {#if menuOpen}
    <GraphOptions
      {categories}
      {hidden}
      bind:query
      bind:snap
      bind:drift
      bind:allLabels
      bind:searchInput
      onfind={find}
      onreset={resetView}
    />
  {/if}

  {#if selected}
    <GraphPreview
      node={selected}
      {neighbours}
      {colors}
      onclose={() => selectNode(null)}
      {onopen}
      onpick={pick}
      onhover={(n) => (hover = n)}
    />
  {/if}
</div>

<style>
  .arena {
    position: relative;
    height: clamp(440px, 66vh, 620px);
    overflow: hidden;
    background: #000000;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: grab;
  }
  canvas:global(.over) {
    cursor: pointer;
  }
  canvas:global(.dragging) {
    cursor: grabbing;
  }
  .options-toggle {
    position: absolute;
    top: 12px;
    right: 12px;
    appearance: none;
    background: #000000;
    border: 2px solid #3e3e3e;
    color: #8f8f8f;
    font: 19px/1 var(--font-label);
    letter-spacing: 0.06em;
    padding: 5px 10px 4px;
    cursor: pointer;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .options-toggle:hover,
  .options-toggle[aria-expanded="true"] {
    color: #ffffff;
    border-color: #ffffff;
  }
  .options-toggle:focus-visible {
    outline: 2px solid #ffd84a;
    outline-offset: 2px;
  }
  .zoom-controls {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    flex-direction: column;
    border: 2px solid #3e3e3e;
    background: #000000;
  }
  .zoom-controls button {
    appearance: none;
    width: 32px;
    height: 30px;
    background: transparent;
    border: 0;
    color: #8f8f8f;
    font: 24px/1 var(--font-label);
    cursor: pointer;
  }
  .zoom-controls button + button {
    border-top: 2px solid #3e3e3e;
  }
  .zoom-controls button:hover {
    color: #ffffff;
    background: #141414;
  }
  .zoom-controls button:focus-visible {
    outline: 2px solid #ffd84a;
    outline-offset: -2px;
  }
  .bars {
    display: grid;
    gap: 2px;
  }
  .bars i {
    display: block;
    width: 12px;
    height: 2px;
    background: currentColor;
  }
</style>
