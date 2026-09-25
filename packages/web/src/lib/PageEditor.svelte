<script lang="ts">
  import FramedPanel from "./FramedPanel.svelte";
  import { activateOnKey } from "./keyboard.js";
  import { formatDate } from "./format.js";
  import { splitWikiLinks } from "./wikiLinks.js";
  import { getPage, getPageRaw, savePageRaw, type Page } from "../api.js";

  const NEW_TEMPLATE = "---\ntitle: \ncategory: \nrole: friend\nsummary: \n---\n\n";

  let {
    slug,
    canEdit = false,
    onback,
    onsaved,
    onopen,
  }: {
    slug: string | null;
    canEdit?: boolean;
    onback: () => void;
    onsaved: () => void;
    onopen: (slug: string) => void;
  } = $props();

  let text = $state("");
  let newSlug = $state("");
  let viewed = $state<Page | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    error = null;
    viewed = null;
    if (slug === null) {
      text = NEW_TEMPLATE;
      newSlug = "";
      loading = false;
      return;
    }
    loading = true;
    // Editing needs the exact raw bytes (admin-only, may carry internal
    // fields); viewing uses the same public, role-filtered read as everywhere
    // else in the app, so a guest/friend can read a page without ever
    // touching the admin-only raw endpoint.
    const fetchPage = canEdit ? getPageRaw(slug).then((raw) => (text = raw)) : getPage(slug).then((p) => (viewed = p));
    fetchPage
      .catch((err) => (error = err instanceof Error ? err.message : "Couldn't load this page."))
      .finally(() => (loading = false));
  });

  async function save() {
    const targetSlug = slug ?? newSlug.trim();
    if (!targetSlug) {
      error = "A slug is required for a new page.";
      return;
    }
    error = null;
    saving = true;
    try {
      await savePageRaw(targetSlug, text);
      onsaved();
    } catch (err) {
      error = err instanceof Error ? err.message : "Save failed.";
    } finally {
      saving = false;
    }
  }
</script>

<FramedPanel style="padding:0;border:var(--border-width) solid var(--line-strong)">
  <div class="editor">
    <div class="head">
      <span class="back" role="button" tabindex="0" onclick={onback} onkeydown={activateOnKey(onback)}
        >← Back</span
      >
      <span class="title font-display">{canEdit ? (slug ?? "New page") : (viewed?.metadata.title ?? slug)}</span>
      {#if slug}<span class="slug-tag font-mono">{slug}.md</span>{/if}
    </div>

    {#if canEdit && slug === null}
      <label class="field">
        <span class="field-label font-label">Slug</span>
        <input type="text" bind:value={newSlug} placeholder="e.g. cloudflare-tunnel" />
      </label>
    {/if}

    {#if error}
      <div class="error-banner">{error}</div>
    {/if}

    {#if loading}
      <div class="loading">Loading…</div>
    {:else if canEdit}
      <textarea class="raw" bind:value={text} spellcheck="false"></textarea>
    {:else if viewed}
      <div class="meta-line">
        <span>{viewed.metadata.category}</span>
        <span class="role-pill" class:admin={viewed.metadata.role === "admin"}>{viewed.metadata.role}</span>
        <span>updated {formatDate(viewed.metadata.updated)}</span>
      </div>
      <pre class="body-view">{#each splitWikiLinks(viewed.body) as seg}{#if seg.kind === "link"}<a
              class="wiki-link"
              href={`#${seg.slug}`}
              onclick={(e) => {
                e.preventDefault();
                onopen(seg.slug);
              }}>{seg.text}</a
            >{:else}{seg.text}{/if}{/each}</pre>
    {/if}

    {#if canEdit}
      <div class="actions">
        <button type="button" class="btn primary" disabled={saving || loading} onclick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" class="btn ghost" onclick={onback}>Cancel</button>
      </div>
    {/if}
  </div>
</FramedPanel>

<style>
  .editor {
    padding: 22px 26px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .back {
    font-size: var(--text-nav-size);
    color: var(--text-muted);
    cursor: pointer;
  }
  .back:hover {
    color: var(--text-strong);
  }
  .title {
    font-size: var(--text-heading-size);
    color: var(--text-strong);
  }
  .slug-tag {
    font-size: 12.5px;
    color: var(--text-faint);
    background: var(--surface-app);
    border: 1px solid var(--line-hairline);
    padding: 2px 8px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field-label {
    font-size: var(--text-label-size);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
  }
  input[type="text"] {
    background: var(--surface-app);
    border: var(--border-width) solid var(--line-hairline);
    color: var(--text-strong);
    font: 400 var(--text-body-size) / 1.5 var(--font-ui);
    padding: 9px 12px;
    outline: none;
  }
  input[type="text"]:focus {
    border-color: var(--line-strong);
  }

  .error-banner {
    font-size: var(--text-small-size);
    color: var(--status-alert-fg);
    background: var(--status-alert-bg);
    padding: 8px 12px;
  }

  .loading {
    color: var(--text-faint);
    font-size: var(--text-body-size);
    padding: 40px 0;
    text-align: center;
  }

  .meta-line {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: var(--text-small-size);
    color: var(--text-faint);
  }
  .role-pill {
    display: inline-block;
    font-size: 12px;
    letter-spacing: 0.03em;
    padding: 3px 8px;
    color: var(--text-faint);
    border: 1px solid var(--line-hairline);
  }
  .role-pill.admin {
    color: var(--text-accent);
    border-color: var(--text-accent);
  }
  .body-view {
    margin: 0;
    width: 100%;
    min-height: 200px;
    background: var(--surface-app);
    border: var(--border-width) solid var(--line-hairline);
    color: var(--text-strong);
    font: 400 var(--text-mono-size) / 1.6 var(--font-mono);
    padding: 16px 18px;
    white-space: pre-wrap;
  }

  .wiki-link {
    color: var(--text-accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .wiki-link:hover {
    color: var(--text-strong);
  }

  textarea.raw {
    width: 100%;
    min-height: 360px;
    resize: vertical;
    background: var(--surface-app);
    border: var(--border-width) solid var(--line-hairline);
    color: var(--text-strong);
    font: 400 var(--text-mono-size) / 1.6 var(--font-mono);
    padding: 16px 18px;
    outline: none;
  }
  textarea.raw:focus {
    border-color: var(--line-strong);
  }

  .actions {
    display: flex;
    gap: 12px;
    border-top: var(--border-width) solid var(--line-hairline);
    padding-top: 16px;
  }
  .btn {
    font: 600 var(--text-small-size) / 1 var(--font-ui);
    padding: 9px 20px;
    cursor: pointer;
    border: var(--border-width) solid var(--line-strong);
    background: none;
    color: var(--text-strong);
  }
  .btn.primary {
    background: var(--action-primary);
    border-color: var(--action-primary);
    color: var(--text-on-accent);
  }
  .btn.primary:hover {
    background: var(--action-primary-hover);
  }
  .btn.primary:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .btn.ghost {
    border-color: var(--line-hairline);
    color: var(--text-faint);
  }
  .btn.ghost:hover {
    color: var(--text-strong);
    border-color: var(--line-strong);
  }
</style>
