<script lang="ts">
  import FramedPanel from "./FramedPanel.svelte";
  import { listRawSources, getRawSource, type RawSource } from "../api.js";

  let sources = $state<RawSource[]>([]);
  let loading = $state(true);
  let listError = $state<string | null>(null);

  let selected = $state<{ origin: string; id: string } | null>(null);
  let previewContent = $state<string | null>(null);
  let previewError = $state<string | null>(null);

  async function load() {
    loading = true;
    listError = null;
    try {
      sources = await listRawSources();
    } catch (err) {
      listError = err instanceof Error ? err.message : "Couldn't load the raw archive.";
    } finally {
      loading = false;
    }
  }
  load();

  async function preview(origin: string, id: string) {
    selected = { origin, id };
    previewContent = null;
    previewError = null;
    try {
      const result = await getRawSource(origin, id);
      previewContent = result.content;
    } catch (err) {
      previewError = err instanceof Error ? err.message : "Couldn't load this source.";
    }
  }
</script>

<div class="page">
  <h1 class="page-title font-display">Sources</h1>

  <FramedPanel style="padding:0">
    {#if loading}
      <div class="status">Loading…</div>
    {:else if listError}
      <div class="status error">{listError}</div>
    {:else}
      <div class="rows">
        {#each sources as source (source.metadata.origin + "/" + source.metadata.id)}
          <div
            class="row"
            role="button"
            tabindex="0"
            onclick={() => preview(source.metadata.origin, source.metadata.id)}
            onkeydown={(e) => e.key === "Enter" && preview(source.metadata.origin, source.metadata.id)}
          >
            <span class="kind">{source.metadata.kind}</span>
            <span class="title">{source.metadata.title || source.fileName}</span>
            <span class="date">{source.metadata.created}</span>
          </div>
        {:else}
          <div class="status">Nothing archived yet.</div>
        {/each}
      </div>
    {/if}

    {#if selected}
      <div class="preview">
        <span class="readonly-tag">raw archive — never rewritten</span>
        {#if previewError}
          <div class="error-banner">{previewError}</div>
        {:else}
          <pre>{previewContent ?? "Loading…"}</pre>
        {/if}
      </div>
    {/if}
  </FramedPanel>
</div>

<style>
  .page {
    max-width: 920px;
    margin: 0 auto;
    width: 100%;
    padding: clamp(24px, 4vw, 44px) 20px 64px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .page-title {
    font: 600 var(--text-title-size) / var(--text-title-lh) var(--font-display);
    color: var(--text-strong);
  }

  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 13px 20px;
    border-bottom: 1px solid var(--line-hairline);
    cursor: pointer;
  }
  .row:hover {
    background: var(--surface-sunken);
  }
  .row:last-child {
    border-bottom: none;
  }
  .kind {
    font-size: 12px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--text-faint);
    border: 1px solid var(--line-hairline);
    padding: 3px 8px;
    flex: 0 0 auto;
  }
  .title {
    color: var(--text-strong);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .date {
    color: var(--text-faint);
    font-size: 13px;
    flex: 0 0 auto;
  }

  .status {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-faint);
  }
  .status.error {
    color: var(--status-alert-fg);
  }

  .preview {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: var(--border-width) solid var(--line-hairline);
  }
  .readonly-tag {
    font-size: 12px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .preview pre {
    margin: 0;
    font: var(--text-mono-size) / 1.6 var(--font-mono);
    color: var(--text-body);
    white-space: pre-wrap;
    background: var(--surface-app);
    padding: 16px 18px;
    max-height: 320px;
    overflow: auto;
  }
  .error-banner {
    font-size: var(--text-small-size);
    color: var(--status-alert-fg);
    background: var(--status-alert-bg);
    padding: 8px 12px;
  }
</style>
