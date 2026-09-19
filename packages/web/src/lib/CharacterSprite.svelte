<script lang="ts">
  import { activateOnKey } from "./keyboard.js";

  const SPROUT = [
    ".......BBB....B........",
    "......BBBBB.BBBBB......",
    "......BBBBBBBBBBB......",
    "......BBBBBBBBBBB......",
    "......BBBBBBBBBBB......",
    ".BBBB.BBBKKKKKBBB..BB..",
    "BBB.BB.KKKCCCKKK.BBBBB.",
    "BBBBBBKKCCCCCCCKKBBBBBB",
    "BBBBBBKCKKCCCCCCKBBBBBB",
    "BBBBBKKCKKCCCKKKKKBBBBB",
    "BB.BBKCCCCCCCKKKCKBBBB.",
    ".BBBBKCCCCCCCCCCCKBBB..",
    ".BBBBKCCCCCCCCKCCKBB.B.",
    ".BBBBKKCKCCCCKCCKKBBBB.",
    "BBBBBBKCCKKKKCCCKBBBBBB",
    ".BBBBBKKCCCCCCCKKBBBBBB",
    ".BBBBBBKKKCCCKKKBBBBBBB",
    ".....BBBBKKKKKBBBBB.BB.",
    ".....BBBBBB.BBBB.BBBB..",
    ".....B.BBBB.BBBBBB.....",
    ".....BBBBBB.BBBBBB.....",
    ".....BBBBBB...BBB......",
    "......BBB..............",
    "...........S...........",
    "...........SS..........",
    "............S..........",
    "..........SS...........",
    ".........SSSSS.........",
  ];

  // rows 0-22 are the flower head; 23+ are the stem drawn beneath it.
  const HEAD_ROWS = 23;

  const SPROUT_COLORS: Record<string, string> = {
    B: "var(--honey-200)",
    C: "var(--honey-400)",
    K: "#000000",
    S: "var(--ink-900)",
  };

  type SpriteState = "idle" | "listening" | "thinking" | "speaking";

  const ANIMATIONS: Record<SpriteState, string> = {
    idle: "sammer-sway var(--presence-idle) steps(1, end) infinite",
    listening: "sammer-lean var(--presence-quick) steps(1, end) infinite",
    thinking: "sammer-sway-flat var(--presence-thinking) steps(1, end) infinite",
    speaking: "sammer-nod var(--presence-talk) steps(1, end) infinite",
  };

  let {
    spriteState = "idle",
    pixel = 7,
    spriteSrc = null,
    fit = false,
    onclick,
  }: {
    spriteState?: SpriteState;
    pixel?: number;
    spriteSrc?: string | null;
    fit?: boolean;
    onclick?: () => void;
  } = $props();

  let wrap: HTMLDivElement | undefined = $state();
  // svelte-ignore state_referenced_locally -- initial value only; the $effect
  // right below keeps px synced to pixel on every subsequent change.
  let px = $state(pixel);

  $effect(() => {
    px = pixel;
  });

  $effect(() => {
    if (!fit) return;
    const parent = wrap?.parentElement;
    if (!parent) return;
    const measure = () => {
      const available = parent.clientHeight;
      if (!available) return;
      const chrome = 26;
      px = Math.max(5, Math.min(pixel, Math.floor((available - chrome) / SPROUT.length)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  });

  const animation = $derived(ANIMATIONS[spriteState] ?? "none");
  const swayX = $derived(Math.max(1, Math.round(px / 1.6)));
  const swayY = $derived(Math.max(1, Math.round(px / 2.4)));
  const leanY = $derived(px);
  const nodY = $derived(Math.max(1, Math.round(px / 3)));
  const rows = $derived(SPROUT.map((row) => row.split("").map((ch) => SPROUT_COLORS[ch] ?? "transparent")));
  const headRows = $derived(rows.slice(0, HEAD_ROWS));
  const stemRows = $derived(rows.slice(HEAD_ROWS));
</script>

{#snippet body()}
  <div class="sprite-stack">
    <div
      class="figure"
      style="animation:{animation};--sway-x:{swayX}px;--sway-y:{swayY}px;--lean-y:{leanY}px;--nod-y:{nodY}px"
    >
      {#if spriteSrc}
        <img src={spriteSrc} alt="Sammer" style="width:{px * SPROUT[0].length}px" />
      {:else}
        <div class="pixel-map" style="grid-template-columns:repeat({SPROUT[0].length}, {px}px);grid-auto-rows:{px}px">
          {#each headRows as row, y (y)}
            {#each row as color, x (x)}
              <span style="background:{color}"></span>
            {/each}
          {/each}
        </div>
      {/if}
    </div>
    {#if !spriteSrc}
      <div class="pixel-map" style="grid-template-columns:repeat({SPROUT[0].length}, {px}px);grid-auto-rows:{px}px">
        {#each stemRows as row, y (y)}
          {#each row as color, x (x)}
            <span style="background:{color}"></span>
          {/each}
        {/each}
      </div>
    {/if}
  </div>
  <div class="ground" style="width:{px * 11}px;height:{Math.max(2, Math.round(px * 0.8))}px"></div>
{/snippet}

{#if onclick}
  <div
    bind:this={wrap}
    class="wrap clickable"
    role="button"
    tabindex="0"
    onclick={onclick}
    onkeydown={activateOnKey(onclick)}
  >
    {@render body()}
  </div>
{:else}
  <div bind:this={wrap} class="wrap">
    {@render body()}
  </div>
{/if}

<style>
  :root {
    --presence-idle: 5000ms;
    --presence-thinking: 4000ms;
    --presence-quick: 520ms;
    --presence-talk: 260ms;
  }
  @media (prefers-reduced-motion: reduce) {
    :root {
      --presence-idle: 7000ms;
      --presence-thinking: 3000ms;
      --presence-quick: 3000ms;
      --presence-talk: 2400ms;
    }
  }
  .wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    cursor: default;
  }
  .wrap.clickable {
    cursor: pointer;
  }
  .sprite-stack {
    display: flex;
    flex-direction: column;
  }
  .figure {
    transform-origin: bottom center;
  }
  .pixel-map {
    display: grid;
    line-height: 0;
  }
  img {
    image-rendering: pixelated;
    display: block;
  }
  .ground {
    background: var(--paper-300);
  }
  /* -global- : these names are assembled at runtime (ANIMATIONS map ->
     inline style), so Svelte's per-component keyframe hashing must be
     turned off here or the browser can never find the rule by name. */
  @keyframes -global-sammer-sway {
    0%,
    24% {
      transform: translate(0, 0);
    }
    25%,
    49% {
      transform: translate(var(--sway-x), calc(-1 * var(--sway-y)));
    }
    50%,
    74% {
      transform: translate(0, 0);
    }
    75%,
    99% {
      transform: translate(calc(-1 * var(--sway-x)), var(--sway-y));
    }
    100% {
      transform: translate(0, 0);
    }
  }
  @keyframes -global-sammer-sway-flat {
    0%,
    24% {
      transform: translateX(0);
    }
    25%,
    49% {
      transform: translateX(var(--sway-x));
    }
    50%,
    74% {
      transform: translateX(0);
    }
    75%,
    99% {
      transform: translateX(calc(-1 * var(--sway-x)));
    }
    100% {
      transform: translateX(0);
    }
  }
  @keyframes -global-sammer-lean {
    0%,
    49% {
      transform: translateY(0);
    }
    50%,
    100% {
      transform: translateY(calc(-1 * var(--lean-y)));
    }
  }
  @keyframes -global-sammer-nod {
    0%,
    49% {
      transform: translateY(0);
    }
    50%,
    100% {
      transform: translateY(calc(-1 * var(--nod-y)));
    }
  }
</style>
