<script lang="ts">
  import type { SvelteSet } from "svelte/reactivity";
  import { BITMAPS, MONSTER_WHITE, ORPHAN_GREY, UNCATEGORIZED, sprite } from "./graph/sprites.js";
  import { HUB_LINKS } from "./graph/layout.js";

  interface Category {
    name: string;
    color: string;
    count: number;
  }

  let {
    categories,
    hidden,
    query = $bindable(),
    snap = $bindable(),
    drift = $bindable(),
    allLabels = $bindable(),
    searchInput = $bindable(),
    onfind,
    onreset,
  }: {
    categories: Category[];
    hidden: SvelteSet<string>;
    query: string;
    snap: boolean;
    drift: boolean;
    allLabels: boolean;
    searchInput?: HTMLInputElement;
    onfind: () => void;
    onreset: () => void;
  } = $props();

  const key = [
    { rows: BITMAPS.star, color: "#FFD84A", text: `Save star: ${HUB_LINKS}+ links` },
    { rows: BITMAPS.heart, color: "#FF2B2B", text: "Soul: an ordinary page" },
    { rows: BITMAPS.monsterHeart, color: MONSTER_WHITE, text: "Upside-down: no category" },
    { rows: BITMAPS.brokenHeart, color: ORPHAN_GREY, text: "Broken: no links" },
  ];

  function toggleCategory(name: string) {
    if (hidden.has(name)) hidden.delete(name);
    else hidden.add(name);
  }
</script>

<div class="menu" id="graph-options">
  <section>
    <h5>Find</h5>
    <input
      class="search"
      type="search"
      placeholder="page title…"
      autocomplete="off"
      aria-label="Find a page"
      bind:value={query}
      bind:this={searchInput}
      onkeydown={(e) => e.key === "Enter" && onfind()}
    />
  </section>

  <section>
    <h5>Categories</h5>
    <div class="checks two">
      {#each categories as category (category.name)}
        <label class="check cat">
          <input type="checkbox" checked={!hidden.has(category.name)} onchange={() => toggleCategory(category.name)} />
          <span class="box"></span>
          <canvas
            use:sprite={{ rows: category.name === UNCATEGORIZED ? BITMAPS.monsterHeart : BITMAPS.heart, color: category.color }}
          ></canvas>
          <span class="name">{category.name}</span>
        </label>
      {/each}
    </div>
  </section>

  <section>
    <h5>Motion</h5>
    <div class="checks">
      <label class="check"><input type="checkbox" bind:checked={snap} /><span class="box"></span><span>Snap back after drag</span></label>
      <label class="check"><input type="checkbox" bind:checked={drift} /><span class="box"></span><span>Idle drift</span></label>
      <label class="check"><input type="checkbox" bind:checked={allLabels} /><span class="box"></span><span>Show every label</span></label>
    </div>
  </section>

  <section>
    <h5>Key</h5>
    <div class="key">
      {#each key as row (row.text)}
        <div><canvas use:sprite={{ rows: row.rows, color: row.color }}></canvas>{row.text}</div>
      {/each}
    </div>
  </section>

  <button type="button" class="reset" onclick={onreset}>Reset view</button>
</div>

<style>
  .menu {
    position: absolute;
    top: 50px;
    right: 12px;
    width: min(270px, calc(100% - 24px));
    max-height: calc(100% - 62px);
    overflow: auto;
    z-index: 3;
    background: #000000;
    border: 3px solid #ffffff;
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h5 {
    margin: 0 0 5px;
    font: 400 17px/1 var(--font-label);
    color: #8f8f8f;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .search {
    width: 100%;
    background: transparent;
    border: 2px solid #3e3e3e;
    outline: 0;
    color: #ffffff;
    font: 19px var(--font-label);
    letter-spacing: 0.04em;
    padding: 5px 8px 4px;
  }
  .search:focus {
    border-color: #ffd84a;
  }
  .search::placeholder {
    color: #6e6e6e;
  }
  .checks {
    display: grid;
    gap: 2px 10px;
  }
  .checks.two {
    grid-template-columns: 1fr 1fr;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 18px/1.3 var(--font-label);
    color: #f2f2f2;
    letter-spacing: 0.03em;
    cursor: pointer;
    user-select: none;
    min-width: 0;
  }
  .check input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .box {
    width: 12px;
    height: 12px;
    border: 2px solid #8f8f8f;
    flex: none;
  }
  .check input:checked + .box {
    background: #ffd84a;
    border-color: #ffd84a;
  }
  .check input:focus-visible + .box {
    outline: 2px solid #ffd84a;
    outline-offset: 2px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat input:not(:checked) ~ .name {
    color: #6e6e6e;
    text-decoration: line-through;
  }
  .cat input:not(:checked) ~ canvas {
    opacity: 0.25;
  }
  canvas {
    width: 14px;
    height: auto;
    image-rendering: pixelated;
    flex: none;
  }
  .key {
    display: grid;
    gap: 4px;
    font: 18px/1.2 var(--font-label);
    color: #c9c9c9;
    letter-spacing: 0.03em;
  }
  .key div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .reset {
    appearance: none;
    align-self: flex-start;
    background: transparent;
    border: 2px solid #3e3e3e;
    color: #c9c9c9;
    font: 18px/1 var(--font-label);
    letter-spacing: 0.05em;
    padding: 6px 10px 5px;
    cursor: pointer;
    text-transform: uppercase;
  }
  .reset:hover,
  .reset:focus-visible {
    color: #ffffff;
    border-color: #ffffff;
    outline: 0;
  }
</style>
