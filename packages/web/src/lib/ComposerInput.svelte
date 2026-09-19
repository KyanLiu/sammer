<script lang="ts">
  import IconButton from "./IconButton.svelte";
  import { activateOnKey } from "./keyboard.js";

  let {
    value,
    onchange,
    onsend,
    onvoice,
    autofocus = false,
    allowWrite = false,
    onToggleAllowWrite,
  }: {
    value: string;
    onchange: (value: string) => void;
    onsend: () => void;
    onvoice: () => void;
    autofocus?: boolean;
    allowWrite?: boolean;
    onToggleAllowWrite?: () => void;
  } = $props();

  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (autofocus) input?.focus();
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") onsend();
  }
</script>

<div class="composer">
  <span class="marker">*</span>
  <input
    bind:this={input}
    type="text"
    {value}
    oninput={(event) => onchange(event.currentTarget.value)}
    onkeydown={handleKeydown}
    placeholder="Ask Sammer anything you're curious about"
  />
  {#if onToggleAllowWrite}
    <button
      type="button"
      class="write-toggle font-label"
      class:on={allowWrite}
      aria-pressed={allowWrite}
      title={allowWrite ? "Write mode: this answer may update the wiki" : "Read-only: this answer won't change the wiki"}
      onclick={onToggleAllowWrite}
    >Write</button>
  {/if}
  <div class="trailing">
    {#if value.trim()}
      <span
        class="send font-label"
        role="button"
        tabindex="0"
        onclick={onsend}
        onkeydown={activateOnKey(onsend)}
      >Enter</span>
    {:else}
      <IconButton icon="heart" label="More ways to ask, coming soon" size="sm" disabled />
    {/if}
  </div>
</div>

<style>
  .composer {
    display: flex;
    align-items: baseline;
    gap: 14px;
  }
  .marker {
    flex: 0 0 auto;
    font:
      400 var(--dialogue-size-sm) / 1
      var(--font-dialogue);
    color: var(--honey-200);
  }
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font:
      400 var(--dialogue-size-sm) / var(--dialogue-lh-sm)
      var(--font-dialogue);
    letter-spacing: var(--dialogue-track);
    color: var(--text-strong);
    padding: 0;
  }
  .trailing {
    flex: 0 0 auto;
    align-self: center;
    height: 34px;
    min-width: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .send {
    cursor: pointer;
    font:
      400 var(--text-label-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--honey-200);
  }
  .write-toggle {
    flex: 0 0 auto;
    cursor: pointer;
    background: transparent;
    border: none;
    padding: 0;
    white-space: nowrap;
    font:
      400 var(--text-label-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
    transition: color var(--dur-fast) var(--ease-standard);
  }
  .write-toggle:hover,
  .write-toggle.on {
    color: var(--nav-active);
  }
</style>
