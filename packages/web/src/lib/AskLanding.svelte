<script lang="ts">
  import CharacterSprite from "./CharacterSprite.svelte";
  import SuggestionGrid from "./SuggestionGrid.svelte";
  import FramedPanel from "./FramedPanel.svelte";
  import ComposerInput from "./ComposerInput.svelte";

  let {
    draft,
    onchange,
    onsend,
    onvoice,
    spriteSrc = null,
    allowWrite = false,
    onToggleAllowWrite,
  }: {
    draft: string;
    onchange: (value: string) => void;
    onsend: (text?: string) => void;
    onvoice: () => void;
    spriteSrc?: string | null;
    allowWrite?: boolean;
    onToggleAllowWrite?: () => void;
  } = $props();
</script>

<div class="stage">
  <div class="column">
    <div class="sprite">
      <CharacterSprite fit spriteState="idle" pixel={8} {spriteSrc} />
    </div>
    <div class="starts">
      <div class="rule-row">
        <span class="label font-label">or start from</span>
        <span class="rule"></span>
      </div>
      <SuggestionGrid onsend={(text) => onsend(text)} />
    </div>
    <FramedPanel style="padding:18px 24px">
      <ComposerInput
        value={draft}
        {onchange}
        onsend={() => onsend()}
        {onvoice}
        autofocus
        {allowWrite}
        {onToggleAllowWrite}
      />
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
    height: clamp(150px, 28vh, 250px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .starts {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .rule-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .label {
    font:
      400 var(--text-label-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
  }
  .rule {
    flex: 1;
    height: var(--border-width);
    background: var(--line-hairline);
  }
</style>
