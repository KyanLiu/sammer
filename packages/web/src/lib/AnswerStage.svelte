<script lang="ts">
  import CharacterSprite from "./CharacterSprite.svelte";
  import TypewriterText from "./TypewriterText.svelte";
  import FramedPanel from "./FramedPanel.svelte";
  import ComposerInput from "./ComposerInput.svelte";
  import SuggestionOption from "./SuggestionOption.svelte";
  import PixelIcon from "./PixelIcon.svelte";
  import { SUGGESTED_ASKS } from "./suggestions.js";
  import { activateOnKey } from "./keyboard.js";

  type Phase = "idle" | "thinking" | "answering";

  let {
    phase,
    answer,
    draft,
    onchange,
    onsend,
    onvoice,
    onadvance,
    ontyped,
    typed,
    spriteSrc = null,
    allowWrite = false,
    onToggleAllowWrite,
  }: {
    phase: Phase;
    answer: string;
    draft: string;
    onchange: (value: string) => void;
    onsend: (text?: string) => void;
    onvoice: () => void;
    onadvance: () => void;
    ontyped: () => void;
    typed: boolean;
    spriteSrc?: string | null;
    allowWrite?: boolean;
    onToggleAllowWrite?: () => void;
  } = $props();

  const spriteState = $derived(
    phase === "answering" ? (typed ? "idle" : "speaking") : phase === "thinking" ? "thinking" : "idle",
  );

  // The scrolling element (scrollEl) and the frame the arrow buttons anchor
  // to (the FramedPanel's own box, further up the tree) must stay separate:
  // a position:absolute child of the element that itself has overflow-y:auto
  // tracks the scrolled content, not the visible viewport, so it drifts as
  // you scroll instead of staying put in the corner.
  let scrollEl: HTMLDivElement | undefined = $state();
  let contentEl: HTMLDivElement | undefined = $state();
  let railVisible = $state(false);
  let canUp = $state(false);
  let canDown = $state(false);
  let pageLabel = $state("");
  // Whether the reader was caught up to the bottom as of their last manual
  // scroll — while true, the typewriter's growth keeps following it down;
  // scrolling up to read earlier text (canDown becomes true) turns it off
  // so the stream doesn't yank them back to the bottom mid-read.
  let stickToBottom = $state(true);

  function updateRail() {
    const el = scrollEl;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const total = Math.max(1, Math.ceil(el.scrollHeight / el.clientHeight));
    if (total <= 1) {
      railVisible = false;
      return;
    }
    // Map scroll position by ratio, not by dividing into clientHeight-sized
    // steps: content almost never divides evenly, so a straight division
    // undercounts and the label can never reach the last page.
    const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    const current = Math.min(total, Math.round(ratio * (total - 1)) + 1);
    railVisible = true;
    canUp = el.scrollTop > 2;
    canDown = el.scrollTop < maxScroll - 2;
    pageLabel = `${current} / ${total}`;
  }

  function handleScroll() {
    const el = scrollEl;
    if (el) {
      const maxScroll = el.scrollHeight - el.clientHeight;
      stickToBottom = el.scrollTop >= maxScroll - 2;
    }
    updateRail();
  }

  function scrollPage(dir: 1 | -1) {
    scrollEl?.scrollBy({ top: dir * (scrollEl.clientHeight ?? 0), behavior: "smooth" });
  }

  $effect(() => {
    // Re-run whenever the answer text changes — a new question, or picking
    // a different history entry while one is already on screen — so the
    // rail reflects the new content instead of stale scroll state.
    answer;
    const el = scrollEl;
    if (!el) return;
    el.scrollTop = 0;
    stickToBottom = true;
    updateRail();
  });

  $effect(() => {
    // The typewriter reveal grows contentEl's height a character at a time;
    // scrollEl's own box stays the same size throughout, so only observing
    // the growing content (not the fixed-size scroll container) catches it.
    const content = contentEl;
    const container = scrollEl;
    if (!content || !container) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom) {
        container.scrollTop = container.scrollHeight;
      }
      updateRail();
    });
    observer.observe(content);
    observer.observe(container);
    return () => observer.disconnect();
  });
</script>

<div class="stage">
  <div class="column">
    <div class="sprite">
      <CharacterSprite fit {spriteState} pixel={7} {spriteSrc} />
    </div>
    <FramedPanel style="flex:0 0 auto;min-height:196px;position:relative;display:flex;flex-direction:column">
      {#if phase === "idle"}
        <ComposerInput
          value={draft}
          {onchange}
          onsend={() => onsend()}
          {onvoice}
          autofocus
          {allowWrite}
          {onToggleAllowWrite}
        />
        <div class="divider"></div>
        {#each SUGGESTED_ASKS as suggestion (suggestion)}
          <SuggestionOption onclick={() => onsend(suggestion)}>{suggestion}</SuggestionOption>
        {/each}
      {:else if phase === "thinking"}
        <div class="thinking"><span>*</span>Reading your sources...</div>
      {:else}
        <div class="scroll-wrap">
          <div bind:this={scrollEl} class="answer-scroll" onscroll={handleScroll}>
            <div bind:this={contentEl} class="answer-row">
              <span class="marker">*</span>
              <p class="answer"><TypewriterText text={answer} ondone={ontyped} instant={typed} /></p>
            </div>
          </div>
          {#if railVisible}
            {#if canUp}
              <button class="page-arrow arrow-up" onclick={() => scrollPage(-1)} aria-label="Scroll up">
                <PixelIcon name="chevronUp" size={12} />
              </button>
            {/if}
            <span class="page-count">{pageLabel}</span>
            {#if canDown}
              <button class="page-arrow arrow-down" onclick={() => scrollPage(1)} aria-label="Scroll down">
                <PixelIcon name="chevronDown" size={12} />
              </button>
            {/if}
          {/if}
        </div>
        {#if typed}
          <div class="footer">
            <div class="sources"><span class="source">From your wiki</span></div>
            <span
              class="continue font-label"
              role="button"
              tabindex="0"
              onclick={onadvance}
              onkeydown={activateOnKey(onadvance)}
            >continue &#9656;</span>
          </div>
        {/if}
      {/if}
    </FramedPanel>
  </div>
</div>

<style>
  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: clamp(20px, 3vw, 34px);
    overflow-y: auto;
  }
  .column {
    width: 100%;
    max-width: 720px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }
  .sprite {
    height: clamp(120px, 24vh, 220px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .divider {
    height: var(--border-width);
    background: var(--line-hairline);
    margin: 14px 0 6px;
  }
  .thinking {
    display: flex;
    align-items: baseline;
    gap: 14px;
    font:
      400 var(--dialogue-size) / var(--dialogue-lh)
      var(--font-dialogue);
    letter-spacing: var(--dialogue-track);
    color: var(--text-faint);
  }
  .scroll-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .answer-scroll {
    flex: 1;
    min-height: 0;
    max-height: clamp(220px, 42vh, 460px);
    overflow-y: auto;
    /* Mouse wheel / trackpad / touch scrolling still works — this only
       hides the browser's own scrollbar track and thumb now that the
       arrow buttons and page count are the visible affordance instead. */
    scrollbar-width: none;
  }
  .answer-scroll::-webkit-scrollbar {
    display: none;
  }
  .answer-row {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding-right: 44px;
  }
  .marker {
    flex: 0 0 auto;
    font:
      400 var(--dialogue-size) / var(--dialogue-lh)
      var(--font-dialogue);
    color: var(--honey-200);
  }
  .answer {
    margin: 0;
    font:
      400 var(--dialogue-size) / var(--dialogue-lh)
      var(--font-dialogue);
    letter-spacing: var(--dialogue-track);
    color: var(--text-strong);
    text-wrap: pretty;
  }
  .page-arrow {
    position: absolute;
    right: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--honey-200);
  }
  .arrow-up {
    top: 0;
  }
  .arrow-down {
    bottom: 0;
  }
  .page-count {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    font:
      400 13px / 1
      var(--font-dialogue);
    color: var(--text-faint);
  }
  .footer {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    margin-top: 18px;
    flex-wrap: wrap;
  }
  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    flex: 1;
  }
  .source {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font:
      400 12px / 1
      var(--font-ui);
    color: var(--honey-200);
    border-bottom: var(--border-width) solid var(--honey-100);
    padding-bottom: 3px;
  }
  .continue {
    cursor: pointer;
    font:
      400 var(--text-label-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
    animation: sammer-caret 1200ms steps(1, end) infinite;
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
