<script lang="ts">
  import AppHeader from "./lib/AppHeader.svelte";
  import HistorySidebar from "./lib/HistorySidebar.svelte";
  import AskLanding from "./lib/AskLanding.svelte";
  import AnswerStage from "./lib/AnswerStage.svelte";
  import VoiceScreen from "./lib/VoiceScreen.svelte";
  import IngestView from "./lib/IngestView.svelte";
  import MemoryView from "./lib/MemoryView.svelte";
  import SourcesView from "./lib/SourcesView.svelte";
  import { history } from "./lib/stores/history.js";
  import { ask, login, logout, me, type Session } from "./api.js";

  type Page = "ask" | "memory" | "sources" | "ingest";
  type Phase = "idle" | "thinking" | "answering";

  let page = $state<Page>("ask");
  let asked = $state(false);
  let phase = $state<Phase>("idle");
  let draft = $state("");
  let question = $state<string | null>(null);
  let answer = $state("");
  let typed = $state(false);
  let voice = $state(false);
  let activeId = $state<string | null>(null);
  let session = $state<Session>({ role: "guest" });
  let allowWrite = $state(false);

  const canWrite = $derived(session.role === "admin");

  $effect(() => {
    me().then((s) => (session = s));
  });

  $effect(() => {
    if (!canWrite) allowWrite = false;
  });

  async function handleLogin(email: string, password: string) {
    session = await login(email, password);
  }

  async function handleLogout() {
    await logout();
    session = { role: "guest" };
  }

  const entries = $derived($history);

  // Bumped by send/advance/openEntry so a fetch that resolves after the user
  // has navigated away (a second send, a history entry, "New question")
  // finds itself stale and discards its result instead of overwriting
  // whatever is now on screen.
  let requestId = 0;

  async function send(text?: string) {
    const body = (text ?? draft).trim();
    if (!body) return;
    draft = "";
    question = body;
    typed = false;
    asked = true;
    activeId = null;
    phase = "thinking";
    const id = ++requestId;
    let result: string;
    try {
      result = await ask(body, { allowWrite: canWrite && allowWrite });
    } catch {
      result = "Couldn't reach Sammer. Try again in a moment.";
    }
    if (id !== requestId) return;
    answer = result;
    phase = "answering";
  }

  function handleTyped() {
    typed = true;
    // activeId is non-null only while replaying an existing entry
    // (openEntry sets it; send() clears it) — without this guard, replaying
    // an entry re-adds it as a duplicate the moment TypewriterText's ondone
    // fires again.
    if (question && activeId === null) {
      const entry = history.add(question, answer);
      activeId = entry.id;
    }
  }

  function advance() {
    requestId += 1;
    phase = "idle";
    question = null;
    typed = false;
    activeId = null;
  }

  function openEntry(id: string) {
    const entry = entries.find((item) => item.id === id);
    if (!entry) return;
    requestId += 1;
    activeId = id;
    voice = false;
    page = "ask";
    asked = true;
    question = entry.question;
    answer = entry.answer;
    typed = true;
    phase = "answering";
  }

  function navigate(next: Page) {
    page = next;
    voice = false;
  }

  const showHistory = $derived(page === "ask" && !voice);
</script>

<div class="site">
  <AppHeader
    {page}
    onnav={navigate}
    history={showHistory ? { entries, activeId, onpick: openEntry, onnew: advance } : null}
    {session}
    onLogin={handleLogin}
    onLogout={handleLogout}
  />
  <div class="body">
    <div class="main">
      {#if page === "ask"}
        {#if voice}
          <VoiceScreen onclose={() => (voice = false)} />
        {:else if phase === "idle" && !asked}
          <AskLanding
            {draft}
            onchange={(value) => (draft = value)}
            onsend={send}
            onvoice={() => (voice = true)}
            {allowWrite}
            onToggleAllowWrite={canWrite ? () => (allowWrite = !allowWrite) : undefined}
          />
        {:else}
          <AnswerStage
            {phase}
            {answer}
            {draft}
            onchange={(value) => (draft = value)}
            onsend={send}
            onvoice={() => (voice = true)}
            onadvance={advance}
            ontyped={handleTyped}
            {typed}
            {allowWrite}
            onToggleAllowWrite={canWrite ? () => (allowWrite = !allowWrite) : undefined}
          />
        {/if}
      {:else if page === "ingest"}
        {#if canWrite}
          <IngestView />
        {:else}
          <div class="placeholder">Not authorized.</div>
        {/if}
      {:else if page === "memory"}
        <MemoryView canViewGenerated={canWrite} />
      {:else if page === "sources"}
        {#if canWrite}
          <SourcesView />
        {:else}
          <div class="placeholder">Not authorized.</div>
        {/if}
      {:else}
        <div class="placeholder">Coming soon.</div>
      {/if}
    </div>
    {#if showHistory}
      <HistorySidebar {entries} {activeId} onpick={openEntry} onnew={advance} />
    {/if}
  </div>
</div>

<style>
  .site {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--surface-app);
    position: relative;
  }
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-faint);
    font:
      400 var(--text-body-size) / var(--text-body-lh)
      var(--font-ui);
  }
</style>
