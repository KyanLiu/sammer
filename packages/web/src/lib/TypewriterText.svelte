<script lang="ts">
  import { activateOnKey } from "./keyboard.js";

  let {
    text,
    speed = 26,
    ondone,
    instant = false,
  }: {
    text: string;
    speed?: number;
    ondone?: () => void;
    instant?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally -- initial value only; the
  // $effect below keeps both synced to text/instant on every subsequent change.
  let count = $state(instant ? text.length : 0);
  // svelte-ignore state_referenced_locally
  let lastText = $state(instant ? text : "");

  $effect(() => {
    if (instant) {
      if (text !== lastText) {
        lastText = text;
        count = text.length;
      }
      return;
    }
    if (text !== lastText) {
      lastText = text;
      count = 0;
    }
    if (!text) return;
    if (count >= text.length) {
      ondone?.();
      return;
    }
    const timer = setTimeout(() => {
      count += 1;
    }, speed);
    return () => clearTimeout(timer);
  });

  const done = $derived(!text || count >= text.length);

  function reveal() {
    if (text) count = text.length;
  }
</script>

{#if done}
  <span class="typewriter done">{text}</span>
{:else}
  <span class="typewriter" role="button" tabindex="0" onclick={reveal} onkeydown={activateOnKey(reveal)}>
    {text ? text.slice(0, count) : ""}
    <span class="caret"></span>
  </span>
{/if}

<style>
  .typewriter {
    cursor: pointer;
  }
  .typewriter.done {
    cursor: default;
  }
  .caret {
    display: inline-block;
    width: 0.45em;
    height: 1.05em;
    margin-left: 3px;
    background: var(--honey-200);
    vertical-align: text-bottom;
    animation: sammer-caret 640ms steps(1, end) infinite;
  }
  @keyframes sammer-caret {
    0%,
    49% {
      opacity: 1;
    }
    50%,
    100% {
      opacity: 0;
    }
  }
</style>
