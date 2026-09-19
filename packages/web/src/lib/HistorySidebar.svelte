<script lang="ts">
  import type { HistoryEntry } from "./stores/history.js";
  import { activateOnKey } from "./keyboard.js";

  let {
    entries,
    activeId,
    onpick,
    onnew,
  }: {
    entries: HistoryEntry[];
    activeId: string | null;
    onpick: (id: string) => void;
    onnew: () => void;
  } = $props();
</script>

<aside class="rail">
  <div class="label font-label">Earlier</div>
  {#each entries as entry (entry.id)}
    <div
      class="entry"
      class:on={entry.id === activeId}
      role="button"
      tabindex="0"
      onclick={() => onpick(entry.id)}
      onkeydown={activateOnKey(() => onpick(entry.id))}
    >
      {entry.question}
    </div>
  {/each}
  <div class="new" role="button" tabindex="0" onclick={onnew} onkeydown={activateOnKey(onnew)}>New question</div>
</aside>

<style>
  .rail {
    position: absolute;
    top: 32px;
    right: clamp(20px, 3vw, 40px);
    bottom: 24px;
    width: 200px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
  }
  .label {
    font:
      400 var(--text-label-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
    margin-bottom: 12px;
  }
  .entry {
    padding: 6px 0 6px 12px;
    cursor: pointer;
    border-left: 3px solid var(--line-hairline);
    font:
      400 13px / 1.45
      var(--font-ui);
    color: var(--text-muted);
    transition:
      color var(--dur-fast) var(--ease-standard),
      border-color var(--dur-fast) var(--ease-standard);
  }
  .entry:hover {
    color: var(--text-strong);
  }
  .entry.on {
    border-left-color: var(--nav-rule);
    font-weight: 500;
    color: var(--nav-active);
  }
  .new {
    padding: 10px 0 0 12px;
    margin-top: 8px;
    cursor: pointer;
    border-top: var(--border-width) solid var(--line-hairline);
    font:
      500 13px / 1.45
      var(--font-ui);
    color: var(--honey-200);
  }
  @media (max-width: 1259px) {
    .rail {
      display: none;
    }
  }
</style>
