<script lang="ts">
  import { SUGGESTED_ASKS } from "./suggestions.js";
  import { activateOnKey } from "./keyboard.js";

  let { onsend }: { onsend: (text: string) => void } = $props();

  let hovered = $state<string | null>(null);
</script>

<div class="grid">
  {#each SUGGESTED_ASKS as suggestion (suggestion)}
    <span
      class="cell"
      class:on={hovered === suggestion}
      role="button"
      tabindex="0"
      onclick={() => onsend(suggestion)}
      onkeydown={activateOnKey(() => onsend(suggestion))}
      onmouseenter={() => (hovered = suggestion)}
      onmouseleave={() => (hovered = null)}
      onfocus={() => (hovered = suggestion)}
      onblur={() => (hovered = null)}
    >
      <span class="marker">{hovered === suggestion ? "▸" : "*"}</span>{suggestion}
    </span>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(232px, 1fr));
    gap: 6px 24px;
  }
  .cell {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 6px 4px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font:
      400 var(--dialogue-size-sm) / 1.3
      var(--font-dialogue);
    letter-spacing: var(--dialogue-track);
    color: var(--text-muted);
    transition: color var(--dur-fast) var(--ease-standard);
  }
  .cell.on {
    color: var(--honey-200);
  }
  .marker {
    flex: 0 0 auto;
    color: var(--text-marker);
  }
  .cell.on .marker {
    color: var(--honey-200);
  }
</style>
