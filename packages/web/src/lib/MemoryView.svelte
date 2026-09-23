<script lang="ts">
  import FramedPanel from "./FramedPanel.svelte";
  import PageEditor from "./PageEditor.svelte";
  import GraphView from "./GraphView.svelte";
  import { activateOnKey } from "./keyboard.js";
  import { listPageSummaries, getPageGraph, getGeneratedFile, type PageSummary, type PageGraph } from "../api.js";

  // List/Graph/opening a page are open to any caller (role-filtered per
  // page/item, same as the rest of the app). Generated files and editing are
  // both admin-only at the API — index.md/log.md have no per-page role
  // filtering at all, and saving is gated server-side regardless — so one
  // flag covers both here.
  let { isAdmin = false }: { isAdmin?: boolean } = $props();

  type Tab = "list" | "graph";

  let tab = $state<Tab>("list");
  let summaries = $state<PageSummary[]>([]);
  let loadingList = $state(true);
  let listError = $state<string | null>(null);

  let graphData = $state<PageGraph | null>(null);
  let loadingGraph = $state(false);
  let graphError = $state<string | null>(null);

  let genOpen = $state(false);
  let genTab = $state<"index" | "log">("index");
  let genContent = $state<Record<"index" | "log", string | null>>({ index: null, log: null });
  let genError = $state<string | null>(null);

  // undefined = editor closed, null = new page, string = editing that slug
  let openSlug = $state<string | null | undefined>(undefined);

  async function loadList() {
    loadingList = true;
    listError = null;
    try {
      summaries = await listPageSummaries();
    } catch (err) {
      listError = err instanceof Error ? err.message : "Couldn't load pages.";
    } finally {
      loadingList = false;
    }
  }

  async function loadGraph() {
    loadingGraph = true;
    graphError = null;
    try {
      graphData = await getPageGraph();
    } catch (err) {
      graphError = err instanceof Error ? err.message : "Couldn't load the graph.";
    } finally {
      loadingGraph = false;
    }
  }

  loadList();

  function selectTab(next: Tab) {
    tab = next;
    if (next === "graph" && graphData === null && !loadingGraph) loadGraph();
  }

  async function loadGenerated(name: "index" | "log") {
    genTab = name;
    if (genContent[name] !== null) return;
    genError = null;
    try {
      genContent = { ...genContent, [name]: await getGeneratedFile(name) };
    } catch (err) {
      genError = err instanceof Error ? err.message : "Couldn't load this file.";
    }
  }

  function toggleGenerated() {
    genOpen = !genOpen;
    if (genOpen && genContent.index === null) loadGenerated("index");
  }

  function openEditor(slug: string | null) {
    openSlug = slug;
  }

  function closeEditor() {
    openSlug = undefined;
  }

  function onSaved() {
    openSlug = undefined;
    graphData = null; // stale after any save — refetched lazily next time the Graph tab is opened
    loadList();
  }
</script>

<div class="page">
  <div class="page-head">
    <h1 class="page-title font-display">Memory</h1>
    {#if isAdmin}
      <span
        class="gen-link"
        role="button"
        tabindex="0"
        onclick={toggleGenerated}
        onkeydown={activateOnKey(toggleGenerated)}
      >
        Generated files (index.md / log.md) {genOpen ? "▴" : "▾"}
      </span>
    {/if}
  </div>

  {#if isAdmin && genOpen}
    <FramedPanel style="padding:18px 24px">
      <div class="gen-tabs">
        <span
          class="gen-tab font-label"
          class:on={genTab === "index"}
          role="button"
          tabindex="0"
          onclick={() => loadGenerated("index")}
          onkeydown={activateOnKey(() => loadGenerated("index"))}
        >index.md</span>
        <span
          class="gen-tab font-label"
          class:on={genTab === "log"}
          role="button"
          tabindex="0"
          onclick={() => loadGenerated("log")}
          onkeydown={activateOnKey(() => loadGenerated("log"))}
        >log.md</span>
        <span class="spacer"></span>
        <span class="readonly-tag">read-only — engine-generated</span>
      </div>
      {#if genError}
        <div class="error-banner">{genError}</div>
      {:else}
        <pre class="gen-content">{genContent[genTab] ?? "Loading…"}</pre>
      {/if}
    </FramedPanel>
  {/if}

  {#if openSlug !== undefined}
    <PageEditor slug={openSlug} canEdit={isAdmin} onback={closeEditor} onsaved={onSaved} />
  {:else}
    <div class="tabs">
      <button type="button" class="tab font-label" class:on={tab === "list"} onclick={() => selectTab("list")}>
        List
      </button>
      <button type="button" class="tab font-label" class:on={tab === "graph"} onclick={() => selectTab("graph")}>
        Graph
      </button>
    </div>

    <FramedPanel style="padding:0">
      {#if tab === "list"}
        {#if loadingList}
          <div class="status">Loading…</div>
        {:else if listError}
          <div class="status error">{listError}</div>
        {:else}
          <table>
            <thead>
              <tr><th>Title</th><th>Category</th><th>Role</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {#each summaries as page (page.slug)}
                <tr
                  role="button"
                  tabindex="0"
                  onclick={() => openEditor(page.slug)}
                  onkeydown={(e) => (e.key === "Enter") && openEditor(page.slug)}
                >
                  <td class="title-cell">{page.title}</td>
                  <td>{page.category}</td>
                  <td><span class="role-pill" class:admin={page.role === "admin"}>{page.role}</span></td>
                  <td class="updated-cell">{page.updated}</td>
                </tr>
              {:else}
                <tr><td colspan="4" class="status">No pages yet.</td></tr>
              {/each}
            </tbody>
          </table>
          {#if isAdmin}
            <div class="list-toolbar">
              <span
                class="new-btn"
                role="button"
                tabindex="0"
                onclick={() => openEditor(null)}
                onkeydown={activateOnKey(() => openEditor(null))}
              >+ New page</span>
            </div>
          {/if}
        {/if}
      {:else if loadingGraph}
        <div class="status">Loading…</div>
      {:else if graphError}
        <div class="status error">{graphError}</div>
      {:else if graphData}
        <GraphView graph={graphData} onopen={openEditor} />
      {/if}
    </FramedPanel>
  {/if}
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
  .page-head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex-wrap: wrap;
  }
  .page-title {
    font: 600 var(--text-title-size) / var(--text-title-lh) var(--font-display);
    color: var(--text-strong);
  }
  .gen-link {
    font-size: var(--text-small-size);
    color: var(--text-faint);
    cursor: pointer;
  }
  .gen-link:hover {
    color: var(--text-strong);
  }

  .gen-tabs {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 12px;
  }
  .gen-tab {
    font-size: var(--text-nav-size);
    color: var(--text-muted);
    cursor: pointer;
  }
  .gen-tab.on {
    color: var(--text-strong);
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-color: var(--nav-rule);
  }
  .spacer {
    flex: 1;
  }
  .readonly-tag {
    font-size: 12px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .gen-content {
    margin: 0;
    font: var(--text-mono-size) / 1.6 var(--font-mono);
    color: var(--text-body);
    white-space: pre-wrap;
    background: var(--surface-app);
    padding: 16px 18px;
    max-height: 320px;
    overflow: auto;
  }

  .tabs {
    display: flex;
    border-bottom: var(--border-width) solid var(--line-hairline);
    padding: 0 4px;
  }
  .tab {
    font-size: var(--text-nav-size);
    letter-spacing: var(--text-label-track);
    color: var(--text-muted);
    padding: 12px 18px 10px;
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

  table {
    width: 100%;
    border-collapse: collapse;
  }
  thead th {
    text-align: left;
    font-size: 12.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-faint);
    padding: 12px 20px;
    border-bottom: var(--border-width) solid var(--line-hairline);
  }
  tbody td {
    padding: 13px 20px;
    font-size: 14.5px;
    border-bottom: 1px solid var(--line-hairline);
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover {
    background: var(--surface-sunken);
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  .title-cell {
    color: var(--text-strong);
    font-weight: 500;
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
  .updated-cell {
    color: var(--text-faint);
    white-space: nowrap;
  }

  .status {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-faint);
  }
  .status.error {
    color: var(--status-alert-fg);
  }
  .error-banner {
    font-size: var(--text-small-size);
    color: var(--status-alert-fg);
    background: var(--status-alert-bg);
    padding: 8px 12px;
  }

  .list-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 14px 20px 18px;
  }
  .new-btn {
    font-size: var(--text-body-size);
    color: var(--text-faint);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .new-btn:hover {
    color: var(--text-strong);
  }
</style>
