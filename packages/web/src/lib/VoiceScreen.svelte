<script lang="ts">
  import CharacterSprite from "./CharacterSprite.svelte";
  import TypewriterText from "./TypewriterText.svelte";
  import FramedPanel from "./FramedPanel.svelte";
  import { activateOnKey } from "./keyboard.js";

  type VoiceState = "idle" | "listening" | "thinking" | "speaking";

  let { onclose, spriteSrc = null }: { onclose: () => void; spriteSrc?: string | null } = $props();

  const ORDER: VoiceState[] = ["idle", "listening", "thinking", "speaking"];
  const COPY: Record<VoiceState, [string, string]> = {
    idle: ["Tap to start talking", "Sammer answers out loud and shows its sources."],
    listening: ["“What am I forgetting this week?”", "Listening — tap Sammer to stop."],
    thinking: ["Looking through this week", "Reading Calendar, Slack and Notes."],
    speaking: ["The pricing sheet for Dana, and the rent renewal.", "Speaking · tap to interrupt."],
  };

  let voiceState = $state<VoiceState>("listening");
  const copy = $derived(COPY[voiceState]);

  function cycle() {
    voiceState = ORDER[(ORDER.indexOf(voiceState) + 1) % ORDER.length];
  }
</script>

<div class="stage">
  <div class="sprite">
    <CharacterSprite fit spriteState={voiceState} pixel={9} {spriteSrc} onclick={cycle} />
  </div>
  <FramedPanel style="flex:0 0 auto;max-width:560px;width:100%;text-align:center">
    <div class="line"><TypewriterText text={copy[0]} speed={30} /></div>
    <div class="sub">{copy[1]}</div>
  </FramedPanel>
  <span
    class="back font-label"
    role="button"
    tabindex="0"
    onclick={onclose}
    onkeydown={activateOnKey(onclose)}
  >&#9662; back to typing</span>
</div>

<style>
  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: clamp(20px, 3vw, 40px);
  }
  .sprite {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .line {
    font:
      400 var(--dialogue-size) / var(--dialogue-lh)
      var(--font-dialogue);
    letter-spacing: var(--dialogue-track);
    color: var(--text-strong);
    text-wrap: pretty;
  }
  .sub {
    margin-top: 10px;
    font:
      400 var(--dialogue-size-sm) / var(--dialogue-lh-sm)
      var(--font-dialogue);
    letter-spacing: var(--dialogue-track);
    color: var(--text-muted);
  }
  .back {
    flex: 0 0 auto;
    cursor: pointer;
    font:
      400 var(--text-label-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
  }
</style>
