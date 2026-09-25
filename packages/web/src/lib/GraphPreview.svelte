<script lang="ts">
  import { BITMAPS, ORPHAN_GREY, soulBitmap, sprite } from "./graph/sprites.js";
  import { isHub, type LayoutNode } from "./graph/layout.js";

  let {
    node,
    neighbours,
    colors,
    onclose,
    onopen,
    onpick,
    onhover,
  }: {
    node: LayoutNode;
    neighbours: LayoutNode[];
    colors: Map<string, string>;
    onclose: () => void;
    onopen: (slug: string) => void;
    onpick: (node: LayoutNode) => void;
    onhover: (node: LayoutNode | null) => void;
  } = $props();

  const linked = $derived([...neighbours].sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title)));

  function icon(n: LayoutNode) {
    return {
      rows: isHub(n) ? BITMAPS.star : soulBitmap(n),
      color: n.degree === 0 ? ORPHAN_GREY : (colors.get(n.category) ?? "#FFFFFF"),
    };
  }
</script>

<aside class="preview" aria-label="Page preview">
  <div class="top">
    <canvas class="big" use:sprite={icon(node)}></canvas>
    <h3>{node.title}</h3>
    <button type="button" class="close" aria-label="Close preview" onclick={onclose}>×</button>
  </div>
  <div class="meta">
    {node.category} · {node.degree} link{node.degree === 1 ? "" : "s"}{#if isHub(node)} · <span class="hub">save star</span>{/if}
  </div>
  {#if node.summary}
    <p class="summary">{node.summary}</p>
  {/if}
  {#if linked.length}
    <h5>Linked pages · {linked.length}</h5>
    <ul>
      {#each linked as n (n.slug)}
        <li>
          <button
            type="button"
            onclick={() => onpick(n)}
            onmouseenter={() => onhover(n)}
            onmouseleave={() => onhover(null)}
            onfocus={() => onhover(n)}
            onblur={() => onhover(null)}
          >
            <canvas use:sprite={icon(n)}></canvas>{n.title}
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <h5>No links in or out</h5>
  {/if}
  <button type="button" class="open" onclick={() => onopen(node.slug)}>Open page ▸</button>
</aside>

<style>
  .preview {
    position: absolute;
    left: 12px;
    top: 12px;
    width: 300px;
    max-height: calc(100% - 24px);
    overflow: auto;
    z-index: 2;
    background: #000000;
    border: 3px solid #ffffff;
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .top {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  h3 {
    margin: 0;
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font: 600 19px/1.25 var(--font-display);
    color: #ffffff;
  }
  .close {
    appearance: none;
    background: transparent;
    border: 0;
    color: #8f8f8f;
    font: 24px/1 var(--font-label);
    cursor: pointer;
    padding: 0 2px;
  }
  .close:hover,
  .close:focus-visible {
    color: #ffffff;
    outline: 0;
  }
  .meta {
    font: 18px/1.1 var(--font-label);
    color: #8f8f8f;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .hub {
    color: #ffd84a;
  }
  .summary {
    margin: 0;
    font: 14px/1.5 var(--font-ui);
    color: #c9c9c9;
  }
  h5 {
    margin: 2px 0 0;
    font: 400 17px/1 var(--font-label);
    color: #8f8f8f;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1px;
  }
  li button {
    appearance: none;
    background: transparent;
    border: 0;
    color: #f2f2f2;
    font: 19px/1.3 var(--font-label);
    letter-spacing: 0.03em;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
    width: 100%;
    text-align: left;
  }
  li button:hover,
  li button:focus-visible {
    color: #ffd84a;
    outline: 0;
  }
  canvas {
    width: 14px;
    height: auto;
    image-rendering: pixelated;
    flex: none;
  }
  canvas.big {
    width: 21px;
    margin-top: 3px;
  }
  .open {
    appearance: none;
    align-self: flex-start;
    margin-top: 2px;
    background: #ffd84a;
    border: 0;
    color: #000000;
    font: 21px/1 var(--font-label);
    letter-spacing: 0.08em;
    padding: 8px 12px 7px;
    cursor: pointer;
    text-transform: uppercase;
  }
  .open:hover {
    background: #ffffff;
  }
  .open:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 2px;
  }
  @media (max-width: 640px) {
    .preview {
      left: 8px;
      right: 8px;
      top: auto;
      bottom: 8px;
      width: auto;
      max-height: 55%;
    }
  }
</style>
