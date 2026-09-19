<script lang="ts">
  import type { Snippet } from "svelte";
  import { activateOnKey } from "./keyboard.js";

  let {
    onclick,
    marked = false,
    children,
  }: { onclick: () => void; marked?: boolean; children: Snippet } = $props();

  let hover = $state(false);
  const on = $derived(hover || marked);
</script>

<div
  class="option"
  class:on
  role="button"
  tabindex="0"
  onclick={onclick}
  onkeydown={activateOnKey(onclick)}
  onmouseenter={() => (hover = true)}
  onmouseleave={() => (hover = false)}
  onfocus={() => (hover = true)}
  onblur={() => (hover = false)}
>
  <span class="marker">{on ? "▸" : "*"}</span>
  <span class="text">{@render children()}</span>
</div>

<style>
  .option {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 4px 0;
    cursor: pointer;
    color: var(--text-muted);
    transition: color var(--dur-fast) var(--ease-standard);
  }
  .option.on {
    color: var(--honey-200);
  }
  .marker {
    flex: 0 0 auto;
    font:
      400 var(--dialogue-size-sm) / 1
      var(--font-dialogue);
    color: var(--text-marker);
  }
  .option.on .marker {
    color: var(--honey-200);
  }
  .text {
    font:
      400 var(--dialogue-size-sm) / var(--dialogue-lh-sm)
      var(--font-dialogue);
    letter-spacing: var(--dialogue-track);
  }
</style>
