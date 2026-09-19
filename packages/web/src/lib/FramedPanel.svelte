<script lang="ts">
  import type { Snippet } from "svelte";

  let { style = "", children }: { style?: string; children: Snippet } = $props();
</script>

<div class="panel" style={style}>
  {@render children()}
</div>

<style>
  .panel {
    background: var(--surface-sunken);
    border: var(--border-panel) solid var(--line-strong);
    padding: 24px 28px;
  }
</style>
