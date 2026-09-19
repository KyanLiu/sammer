<script lang="ts">
  import PixelIcon from "./PixelIcon.svelte";
  import type { HistoryEntry } from "./stores/history.js";
  import type { Session } from "../api.js";
  import { activateOnKey } from "./keyboard.js";

  type Page = "ask" | "memory" | "sources";

  const NAV: { id: Page; label: string }[] = [
    { id: "ask", label: "Ask" },
    { id: "memory", label: "Memory" },
    { id: "sources", label: "Sources" },
  ];

  let {
    page,
    onnav,
    history = null,
    session,
    onLogin,
    onLogout,
  }: {
    page: Page;
    onnav: (page: Page) => void;
    history?: {
      entries: HistoryEntry[];
      activeId: string | null;
      onpick: (id: string) => void;
      onnew: () => void;
    } | null;
    session: Session;
    onLogin: (email: string, password: string) => Promise<void>;
    onLogout: () => void;
  } = $props();

  let earlierOpen = $state(false);
  let mobileOpen = $state(false);
  let loginOpen = $state(false);
  let loginEmail = $state("");
  let loginPassword = $state("");
  let loginError = $state<string | null>(null);

  let sessionEl = $state<HTMLElement>();
  let earlierEl = $state<HTMLElement>();
  let mobileMenuEl = $state<HTMLElement>();

  function closeMenusOutside(event: MouseEvent) {
    if (!(event.target instanceof Node)) return;
    const target = event.target;
    const inSession = (sessionEl?.contains(target) ?? false) || (mobileMenuEl?.contains(target) ?? false);
    if (loginOpen && !inSession) loginOpen = false;
    if (earlierOpen && earlierEl && !earlierEl.contains(target)) earlierOpen = false;
    if (mobileOpen && mobileMenuEl && !mobileMenuEl.contains(target)) mobileOpen = false;
  }

  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(),
  );

  function pick(id: string) {
    earlierOpen = false;
    mobileOpen = false;
    history?.onpick(id);
  }

  function startNew() {
    earlierOpen = false;
    mobileOpen = false;
    history?.onnew();
  }

  function selectNav(next: Page) {
    mobileOpen = false;
    onnav(next);
  }

  async function submitLogin(event: SubmitEvent) {
    event.preventDefault();
    loginError = null;
    try {
      await onLogin(loginEmail, loginPassword);
      loginOpen = false;
      loginEmail = "";
      loginPassword = "";
    } catch (err) {
      loginError = err instanceof Error ? err.message : "Login failed";
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key !== "Escape") return;
    earlierOpen = false;
    mobileOpen = false;
    loginOpen = false;
  }}
  onclick={closeMenusOutside}
/>

<header class="ledger">
  <span
    class="wordmark font-display"
    role="button"
    tabindex="0"
    onclick={() => onnav("ask")}
    onkeydown={activateOnKey(() => onnav("ask"))}
  >Sammer</span>
  <span class="divider"></span>
  <span class="date font-label">{today}</span>
  <span class="spacer"></span>
  <nav>
    {#each NAV as item (item.id)}
      <span
        class="nav-item font-label"
        class:on={item.id === page}
        role="button"
        tabindex="0"
        onclick={() => onnav(item.id)}
        onkeydown={activateOnKey(() => onnav(item.id))}
      >
        {#if item.id === page}
          <PixelIcon name="heart" size={12} />
        {/if}
        {item.label}
      </span>
    {/each}
  </nav>
  <div class="session" bind:this={sessionEl}>
    <span class="divider"></span>
    {#if session.role === "guest"}
      <span
        class="session-toggle font-label"
        class:on={loginOpen}
        role="button"
        tabindex="0"
        aria-expanded={loginOpen}
        onclick={() => (loginOpen = !loginOpen)}
        onkeydown={activateOnKey(() => (loginOpen = !loginOpen))}
      >Log in {loginOpen ? "▴" : "▾"}</span>
      {#if loginOpen}
        <form class="menu login-menu" onsubmit={submitLogin}>
          <input class="field" type="email" placeholder="Email" bind:value={loginEmail} required />
          <input class="field" type="password" placeholder="Password" bind:value={loginPassword} required />
          {#if loginError}
            <div class="login-error">{loginError}</div>
          {/if}
          <button type="submit" class="new login-submit">Log in</button>
        </form>
      {/if}
    {:else}
      <span class="session-label font-label">{session.email} ({session.role})</span>
      <span
        class="session-toggle font-label"
        role="button"
        tabindex="0"
        onclick={onLogout}
        onkeydown={activateOnKey(onLogout)}
      >Log out</span>
    {/if}
  </div>
  {#if history}
    <div class="earlier" bind:this={earlierEl}>
      <span class="divider"></span>
      <span
        class="earlier-toggle font-label"
        class:on={earlierOpen}
        role="button"
        tabindex="0"
        aria-expanded={earlierOpen}
        onclick={() => (earlierOpen = !earlierOpen)}
        onkeydown={activateOnKey(() => (earlierOpen = !earlierOpen))}
      >Earlier{history.entries.length ? ` (${history.entries.length})` : ""} {earlierOpen ? "▴" : "▾"}</span>
      {#if earlierOpen}
        <div class="menu">
          {#each history.entries as entry (entry.id)}
            <div
              class="entry"
              class:on={entry.id === history.activeId}
              role="button"
              tabindex="0"
              onclick={() => pick(entry.id)}
              onkeydown={activateOnKey(() => pick(entry.id))}
            >
              {entry.question}
            </div>
          {:else}
            <div class="empty">Nothing asked yet.</div>
          {/each}
          <div class="new" role="button" tabindex="0" onclick={startNew} onkeydown={activateOnKey(startNew)}>
            New question
          </div>
        </div>
      {/if}
    </div>
  {/if}
  <div class="mobile-menu" bind:this={mobileMenuEl}>
    <span class="divider"></span>
    <span
      class="mobile-toggle font-label"
      class:on={mobileOpen}
      role="button"
      tabindex="0"
      aria-expanded={mobileOpen}
      onclick={() => (mobileOpen = !mobileOpen)}
      onkeydown={activateOnKey(() => (mobileOpen = !mobileOpen))}
    >Menu {mobileOpen ? "▴" : "▾"}</span>
    {#if mobileOpen}
      <div class="menu">
        <div class="nav-group">
          {#each NAV as item (item.id)}
            <div
              class="menu-nav-item font-label"
              class:on={item.id === page}
              role="button"
              tabindex="0"
              onclick={() => selectNav(item.id)}
              onkeydown={activateOnKey(() => selectNav(item.id))}
            >
              {#if item.id === page}
                <PixelIcon name="heart" size={12} />
              {/if}
              {item.label}
            </div>
          {/each}
        </div>
        {#if history}
          <div class="menu-divider"></div>
          <div class="label">Earlier{history.entries.length ? ` (${history.entries.length})` : ""}</div>
          {#each history.entries as entry (entry.id)}
            <div
              class="entry"
              class:on={entry.id === history.activeId}
              role="button"
              tabindex="0"
              onclick={() => pick(entry.id)}
              onkeydown={activateOnKey(() => pick(entry.id))}
            >
              {entry.question}
            </div>
          {:else}
            <div class="empty">Nothing asked yet.</div>
          {/each}
          <div class="new" role="button" tabindex="0" onclick={startNew} onkeydown={activateOnKey(startNew)}>
            New question
          </div>
        {/if}
        <div class="menu-divider"></div>
        {#if session.role === "guest"}
          <div
            class="menu-nav-item"
            class:on={loginOpen}
            role="button"
            tabindex="0"
            aria-expanded={loginOpen}
            onclick={() => (loginOpen = !loginOpen)}
            onkeydown={activateOnKey(() => (loginOpen = !loginOpen))}
          >Log in {loginOpen ? "▴" : "▾"}</div>
          {#if loginOpen}
            <form class="mobile-login-form" onsubmit={submitLogin}>
              <input class="field" type="email" placeholder="Email" bind:value={loginEmail} required />
              <input class="field" type="password" placeholder="Password" bind:value={loginPassword} required />
              {#if loginError}
                <div class="login-error">{loginError}</div>
              {/if}
              <button type="submit" class="new login-submit">Log in</button>
            </form>
          {/if}
        {:else}
          <div class="label">{session.email} ({session.role})</div>
          <div
            class="menu-nav-item"
            role="button"
            tabindex="0"
            onclick={onLogout}
            onkeydown={activateOnKey(onLogout)}
          >Log out</div>
        {/if}
      </div>
    {/if}
  </div>
</header>

<style>
  .ledger {
    position: sticky;
    top: 0;
    z-index: 20;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: clamp(12px, 1.5vw, 20px);
    padding: 0 clamp(20px, 3vw, 40px);
    height: 56px;
    background: var(--veil-bg);
    border-bottom: var(--border-width) solid var(--line-hairline);
  }
  .wordmark {
    flex: 0 0 auto;
    font:
      700 22px / 1
      var(--font-display);
    letter-spacing: 0.02em;
    color: var(--text-strong);
    cursor: pointer;
  }
  .divider {
    flex: 0 0 auto;
    width: 1px;
    height: 18px;
    background: var(--line-soft);
  }
  .date {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font:
      400 var(--text-label-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
  }
  .spacer {
    flex: 1;
    min-width: 0;
  }
  nav {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: clamp(16px, 2vw, 28px);
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font:
      400 var(--text-nav-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-muted);
    transition: color var(--dur-fast) var(--ease-standard);
  }
  .nav-item:hover {
    color: var(--text-strong);
  }
  .nav-item.on {
    color: var(--nav-active);
  }
  .session {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: clamp(12px, 1.5vw, 20px);
    position: relative;
  }
  .session-label {
    white-space: nowrap;
    font:
      400 var(--text-nav-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
  }
  .session-toggle {
    cursor: pointer;
    white-space: nowrap;
    font:
      400 var(--text-nav-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
    transition: color var(--dur-fast) var(--ease-standard);
  }
  .session-toggle:hover,
  .session-toggle.on {
    color: var(--text-muted);
  }
  .login-menu {
    position: absolute;
    top: calc(100% + 14px);
    right: 0;
    width: 220px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--surface-sunken);
    border: var(--border-width) solid var(--line-strong);
  }
  .mobile-login-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
  }
  .field {
    border: var(--border-width) solid var(--line-hairline);
    background: transparent;
    outline: none;
    padding: 8px 10px;
    font:
      400 13px / 1.45
      var(--font-ui);
    color: var(--text-strong);
  }
  .field:focus {
    border-color: var(--line-strong);
  }
  .login-error {
    font:
      400 12px / 1.45
      var(--font-ui);
    color: var(--text-faint);
  }
  .login-submit {
    padding: 10px 0 0;
    margin-top: 4px;
    border: none;
    border-top: var(--border-width) solid var(--line-hairline);
    background: transparent;
    cursor: pointer;
    text-align: left;
    font:
      500 13px / 1.45
      var(--font-ui);
    color: var(--honey-200);
  }
  .earlier {
    display: none;
    flex: 0 0 auto;
    align-items: center;
    gap: clamp(12px, 1.5vw, 20px);
    position: relative;
  }
  .earlier-toggle,
  .mobile-toggle {
    cursor: pointer;
    white-space: nowrap;
    font:
      400 var(--text-nav-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
    transition: color var(--dur-fast) var(--ease-standard);
  }
  .earlier-toggle:hover,
  .earlier-toggle.on,
  .mobile-toggle:hover,
  .mobile-toggle.on {
    color: var(--text-muted);
  }
  .mobile-menu {
    display: none;
    flex: 0 0 auto;
    align-items: center;
    gap: clamp(12px, 1.5vw, 20px);
    position: relative;
  }
  .menu {
    position: absolute;
    top: calc(100% + 14px);
    right: 0;
    width: 260px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 16px;
    background: var(--surface-sunken);
    border: var(--border-width) solid var(--line-strong);
  }
  .nav-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 6px;
  }
  .menu-nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font:
      400 16px / 1.2
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-muted);
  }
  .menu-nav-item:hover {
    color: var(--text-strong);
  }
  .menu-nav-item.on {
    color: var(--nav-active);
  }
  .menu-divider {
    height: var(--border-width);
    background: var(--line-hairline);
    margin: 10px 0 12px;
  }
  .label {
    font:
      400 var(--text-label-size) / 1
      var(--font-label);
    letter-spacing: var(--text-label-track);
    color: var(--text-faint);
    margin-bottom: 8px;
  }
  .entry {
    padding: 6px 0 6px 11px;
    cursor: pointer;
    border-left: 3px solid var(--line-hairline);
    font:
      400 13px / 1.45
      var(--font-ui);
    color: var(--text-muted);
  }
  .entry.on {
    border-left-color: var(--nav-rule);
    font-weight: 500;
    color: var(--nav-active);
  }
  .empty {
    padding: 6px 0;
    font:
      400 13px / 1.45
      var(--font-ui);
    color: var(--text-faint);
  }
  .new {
    padding: 10px 0 0 11px;
    margin-top: 8px;
    cursor: pointer;
    border-top: var(--border-width) solid var(--line-hairline);
    font:
      500 13px / 1.45
      var(--font-ui);
    color: var(--honey-200);
  }
  @media (max-width: 1259px) {
    .earlier {
      display: flex;
    }
  }
  @media (max-width: 860px) {
    nav {
      display: none;
    }
    .earlier {
      display: none;
    }
    .session {
      display: none;
    }
    .mobile-menu {
      display: flex;
    }
  }
</style>
