import { join } from "node:path";
import type Database from "better-sqlite3";
import type { Config, Page, SearchHit } from "@sammer/shared";
import type { LlmClient } from "./llm/client.js";
import { createLlmClient } from "./llm/factory.js";
import { WikiStore } from "./wiki/store.js";
import { WikiService } from "./wiki/service.js";
import { openIndexDb } from "./index/db.js";
import { Indexer } from "./index/indexer.js";
import { keywordSearch } from "./index/search.js";
import { ToolRegistry, type Tool } from "./agent/registry.js";
import { buildWikiTools } from "./agent/tools/wiki.js";
import { runAgent, ASSIST_SYSTEM, CURATION_SYSTEM } from "./agent/loop.js";

export interface EngineOptions {
  llm?: LlmClient;
  // Custom tools an integration supplies. They are registered alongside the
  // wiki tools and reach the agent through the same registry, so an integration
  // needs no privileged access to the engine.
  tools?: Tool[];
}

export class Engine {
  private constructor(
    private readonly llm: LlmClient,
    private readonly store: WikiStore,
    private readonly wiki: WikiService,
    private readonly db: Database.Database,
    private readonly registry: ToolRegistry,
  ) {}

  static async create(cfg: Config, opts: EngineOptions = {}): Promise<Engine> {
    const client = opts.llm ?? createLlmClient(cfg.llm);
    const store = new WikiStore(join(cfg.dataDir, "wiki"));
    await store.init();

    const db = openIndexDb(join(cfg.dataDir, "index.db"));
    const wiki = new WikiService(store, new Indexer(db));

    const registry = new ToolRegistry();
    for (const tool of buildWikiTools({ wiki, db })) registry.register(tool);
    for (const tool of opts.tools ?? []) registry.register(tool);

    const engine = new Engine(client, store, wiki, db, registry);
    // The markdown is the source of truth; the index is derived, so it is
    // rebuilt on every startup rather than trusted to be current.
    await engine.reindex();
    return engine;
  }

  async ask(question: string, opts: { signal?: AbortSignal } = {}): Promise<string> {
    const { answer } = await runAgent({
      llm: this.llm,
      registry: this.registry,
      system: ASSIST_SYSTEM,
      user: question,
      // Answering must never rewrite the wiki, so the read path is denied
      // mutating tools outright rather than merely discouraged from them.
      readOnly: true,
      signal: opts.signal,
    });
    return answer;
  }

  async ingest(text: string, opts: { signal?: AbortSignal } = {}): Promise<string> {
    const { answer } = await runAgent({
      llm: this.llm,
      registry: this.registry,
      system: CURATION_SYSTEM,
      user: `New information to integrate:\n\n${text}`,
      signal: opts.signal,
    });
    // The agent writes pages; the engine owns the derived catalog and the log,
    // so they are regenerated here rather than left to the model (ADR D3).
    await this.rebuildIndexPage();
    await this.appendLog(answer);
    return answer;
  }

  async reindex(): Promise<void> {
    return this.wiki.reindex();
  }

  // index.md is the catalog the assist loop reads first: every page as one line
  // under its category, so orienting costs a single tool call.
  async rebuildIndexPage(): Promise<void> {
    const byCategory = new Map<string, Page[]>();
    for (const slug of await this.store.list()) {
      const page = await this.store.read(slug);
      if (!page) continue;
      const bucket = byCategory.get(page.metadata.category);
      if (bucket) bucket.push(page);
      else byCategory.set(page.metadata.category, [page]);
    }

    const sections = [...byCategory.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, pages]) => {
        const lines = pages
          .sort((a, b) => a.metadata.title.localeCompare(b.metadata.title))
          .map(({ metadata: m }) => `- [[${m.slug}]] — ${m.summary || m.title}`);
        return `## ${category}\n\n${lines.join("\n")}\n`;
      });

    const body = sections.length
      ? sections.join("\n")
      : "_No pages yet._\n";
    await this.store.writeText("index", `# Index\n\n${body}`);
  }

  async appendLog(entry: string): Promise<void> {
    const existing = await this.store.readText("log");
    const header = existing === null ? "# Log\n\n" : "";
    await this.store.appendText("log", `${header}- ${new Date().toISOString()} — ${entry}\n`);
  }

  async listPages(): Promise<string[]> {
    return this.store.list();
  }

  async getPage(slug: string): Promise<Page | null> {
    return this.store.read(slug);
  }

  async search(q: string): Promise<SearchHit[]> {
    return keywordSearch(this.db, q, { k: 8, expandHops: 1 });
  }

  close(): void {
    this.db.close();
  }
}
