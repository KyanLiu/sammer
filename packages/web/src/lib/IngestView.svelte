<script lang="ts">
  import FramedPanel from "./FramedPanel.svelte";
  import { activateOnKey } from "./keyboard.js";
  import { ingestText, type IngestResult } from "../api.js";

  type Tab = "text" | "file";

  let tab = $state<Tab>("text");
  let text = $state("");
  let sourceOpen = $state(false);
  let origin = $state("web-ui");
  let title = $state("");
  let url = $state("");
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let result = $state<IngestResult | null>(null);

  function toggleSource() {
    sourceOpen = !sourceOpen;
  }

  async function submit() {
    if (!text.trim()) {
      error = "Text is required.";
      return;
    }
    error = null;
    result = null;
    submitting = true;
    try {
      const source = sourceOpen
        ? { origin: origin.trim() || "web-ui", title: title.trim() || undefined, url: url.trim() || undefined }
        : undefined;
      result = await ingestText(text, source);
    } catch (err) {
      error = err instanceof Error ? err.message : "Ingest failed";
    } finally {
      submitting = false;
    }
  }
</script>

<div class="page">
  <h1 class="page-title">Ingest</h1>

  <FramedPanel style="padding:0">
    <div class="tabs">
      <button type="button" class="tab font-label" class:on={tab === "text"} onclick={() => (tab = "text")}>
        Text
      </button>
      <button type="button" class="tab font-label" class:on={tab === "file"} onclick={() => (tab = "file")}>
        File
      </button>
    </div>

    {#if tab === "text"}
      <div class="body">
        <div class="field">
          <span class="field-label font-label">Paste content</span>
          <textarea bind:value={text} placeholder="Paste a note, article, or transcript to add to the wiki…"
          ></textarea>
        </div>

        <div>
          <div
            class="source-toggle"
            role="button"
            tabindex="0"
            aria-expanded={sourceOpen}
            onclick={toggleSource}
            onkeydown={activateOnKey(toggleSource)}
          >
            <span class="caret" class:open={sourceOpen}>▸</span> Source details (optional)
          </div>
          {#if sourceOpen}
            <div class="source-fields">
              <label class="field">
                <span class="field-label font-label">Origin</span>
                <input type="text" bind:value={origin} />
              </label>
              <label class="field">
                <span class="field-label font-label">Title</span>
                <input type="text" bind:value={title} placeholder="optional" />
              </label>
              <label class="field url">
                <span class="field-label font-label">URL</span>
                <input type="text" bind:value={url} placeholder="optional" />
              </label>
            </div>
          {/if}
        </div>

        {#if result}
          <div class="result">
            <span class="pill" class:ok={result.curated} class:info={!result.curated}>
              {result.curated ? "Curated into the wiki" : "Skipped — already archived"}
            </span>
            <p class="result-summary">{result.summary}</p>
          </div>
        {/if}

        {#if error}
          <div class="hint">{error}</div>
        {/if}

        <div class="actions">
          <button type="button" class="btn-primary" disabled={submitting} onclick={submit}>
            {submitting ? "Ingesting…" : "Ingest"}
          </button>
        </div>
      </div>
    {:else}
      <div class="stub">File upload — coming soon.<br />Use the Text tab for now.</div>
    {/if}
  </FramedPanel>
</div>

<style>
  /* This page deliberately uses --font-label (VT323) for everything, at sizes
     bumped up from the app's normal (Instrument-Sans-tuned) scale — VT323 reads
     smaller at the same nominal size. Scoped to this component only. */
  .page {
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    padding: clamp(28px, 4vw, 52px) 20px 64px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    font-family: var(--font-label);
    -webkit-font-smoothing: none;
    font-smooth: never;
  }
  .page-title {
    font-size: 34px;
    line-height: 1;
    letter-spacing: 0.01em;
    color: var(--text-strong);
  }

  .tabs {
    display: flex;
    border-bottom: var(--border-width) solid var(--line-hairline);
    padding: 0 8px;
  }
  .tab {
    font-family: inherit;
    font-size: 20px;
    letter-spacing: var(--text-label-track);
    color: var(--text-muted);
    padding: 14px 16px 12px;
    cursor: pointer;
    border: none;
    background: none;
    border-bottom: 3px solid transparent;
    margin-bottom: -2px;
  }
  .tab.on {
    color: var(--text-strong);
    border-bottom-color: var(--nav-rule);
  }
  .tab:hover:not(.on) {
    color: var(--text-strong);
  }

  .body {
    padding: 26px 28px 28px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .field-label {
    font-size: 16px;
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
  }
  .source-fields .field-label {
    font-size: 14.5px;
  }

  textarea {
    width: 100%;
    min-height: 190px;
    resize: vertical;
    background: var(--surface-app);
    border: var(--border-width) solid var(--line-hairline);
    color: var(--text-strong);
    font-family: inherit;
    font-size: 19px;
    line-height: 1.45;
    padding: 14px 16px;
    outline: none;
  }
  textarea:focus {
    border-color: var(--line-strong);
  }

  .source-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    font-family: inherit;
    font-size: 19px;
    color: var(--text-muted);
    width: fit-content;
  }
  .source-toggle:hover {
    color: var(--text-strong);
  }
  .caret {
    display: inline-block;
    transition: transform var(--dur-fast) var(--ease-standard);
    font-size: 12px;
  }
  .caret.open {
    transform: rotate(90deg);
  }

  .source-fields {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 14px 16px;
    padding: 12px 2px 2px;
  }
  .source-fields .url {
    grid-column: 1 / -1;
  }
  @media (max-width: 480px) {
    .source-fields {
      grid-template-columns: 1fr;
    }
  }

  input[type="text"] {
    background: var(--surface-app);
    border: var(--border-width) solid var(--line-hairline);
    color: var(--text-strong);
    font-family: inherit;
    font-size: 19px;
    padding: 9px 12px;
    outline: none;
    width: 100%;
  }
  input[type="text"]:focus {
    border-color: var(--line-strong);
  }

  .hint {
    font-size: 16px;
    color: var(--status-alert-fg);
    background: var(--status-alert-bg);
    padding: 8px 12px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    border-top: var(--border-width) solid var(--line-hairline);
    padding-top: 20px;
  }
  .btn-primary {
    font-family: inherit;
    font-size: 20px;
    color: var(--text-on-accent);
    background: var(--action-primary);
    border: var(--border-width) solid var(--action-primary);
    padding: 10px 26px;
    cursor: pointer;
  }
  .btn-primary:hover {
    background: var(--action-primary-hover);
  }
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .result {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface-app);
    border: var(--border-width) solid var(--line-hairline);
    padding: 16px 18px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    font-size: 16px;
    letter-spacing: var(--text-label-track);
    padding: 4px 11px;
  }
  .pill.ok {
    background: var(--status-ok-bg);
    color: var(--status-ok-fg);
  }
  .pill.info {
    background: var(--status-info-bg);
    color: var(--status-info-fg);
  }
  .result-summary {
    margin: 0;
    font-size: 19px;
    line-height: 1.45;
    color: var(--text-body);
  }

  .stub {
    padding: 56px 16px;
    text-align: center;
    color: var(--text-faint);
    font-size: 19px;
    line-height: 1.5;
  }
</style>
