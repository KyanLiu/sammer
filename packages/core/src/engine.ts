import { join } from "node:path";
import type Database from "better-sqlite3";
import type { Config, Page, SearchHit, Source } from "@sammer/shared";
import type { LlmClient } from "./llm/client.js";
import { createLlmClient } from "./llm/factory.js";
import { WikiStore } from "./wiki/store.js";
import { WikiService } from "./wiki/service.js";
import { RawStore } from "./raw/store.js";
import { archiveFile, archiveText, type Archived, type IngestSource } from "./raw/archive.js";
import { extractText } from "./raw/extract.js";
import { openIndexDb } from "./index/db.js";
import { Indexer } from "./index/indexer.js";
import { keywordSearch } from "./index/search.js";
import type { Tool } from "./agent/registry.js";
import type { Agent } from "./agent/agent.js";
import { buildToolIndex } from "./agent/tools/index.js";
import { buildAgents } from "./agent/build.js";
import { CURATOR_ID, type CuratorAgent } from "./agent/curator/index.js";
import { ORCHESTRATOR_ID } from "./agent/orchestrator/index.js";
import { AgentTelemetry } from "./agent/telemetry.js";

export interface EngineOptions {
  llm?: LlmClient;
  tools?: Tool[];
}

export interface RunOptions {
  readOnly?: boolean;
  maxSteps?: number;
  signal?: AbortSignal;
}

export interface IngestOptions {
  maxSteps?: number;
  signal?: AbortSignal;
  source?: IngestSource;
}

export interface IngestResult {
  summary: string;
  source: Source;
  skipped: boolean;
  curated: boolean;
}

const DEFAULT_SOURCE: IngestSource = { origin: "api", kind: "text" };
const FILE_SOURCE: IngestSource = { origin: "file" };

export class Engine {
  private constructor(
    private readonly store: WikiStore,
    private readonly raw: RawStore,
    private readonly wiki: WikiService,
    private readonly db: Database.Database,
    private readonly agents: Map<string, Agent>,
    private readonly curator: CuratorAgent,
    readonly telemetry: AgentTelemetry,
  ) {}

  private agent(id: string): Agent {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`No agent registered for "${id}".`);
    return agent;
  }

  static async create(cfg: Config, opts: EngineOptions = {}): Promise<Engine> {
    const llm = opts.llm ?? createLlmClient(cfg.llm);

    const store = new WikiStore(join(cfg.dataDir, "wiki"));
    await store.init();

    const raw = new RawStore(join(cfg.dataDir, "raw"));
    await raw.init();

    const db = openIndexDb(join(cfg.dataDir, "index.db"));
    const wiki = new WikiService(store, new Indexer(db));

    const toolIndex = buildToolIndex({ wikiDeps: { wiki, db } });
    const custom = opts.tools ?? [];
    const telemetry = new AgentTelemetry();

    const { curator, orchestrator } = buildAgents({ llm, toolIndex, custom, store, raw, telemetry });

    const agents = new Map<string, Agent>([
      [CURATOR_ID, curator],
      [ORCHESTRATOR_ID, orchestrator],
    ]);

    const engine = new Engine(store, raw, wiki, db, agents, curator, telemetry);
    // The markdown is the source of truth; the index is derived, so it is
    // rebuilt on every startup rather than trusted to be current.
    await engine.reindex();
    return engine;
  }

  async run(prompt: string, opts: RunOptions = {}): Promise<string> {
    return this.agent(ORCHESTRATOR_ID).run(prompt, {
      maxIterations: opts.maxSteps,
      readOnly: opts.readOnly,
      signal: opts.signal,
    });
  }

  async ask(
    question: string,
    opts: { maxSteps?: number; signal?: AbortSignal } = {},
  ): Promise<string> {
    return this.run(question, { readOnly: true, ...opts });
  }

  async ingest(text: string, opts: IngestOptions = {}): Promise<IngestResult> {
    return this.curate(await archiveText(this.raw, text, opts.source ?? DEFAULT_SOURCE), opts);
  }

  async ingestFile(path: string, opts: IngestOptions = {}): Promise<IngestResult> {
    return this.curate(await archiveFile(this.raw, path, opts.source ?? FILE_SOURCE), opts);
  }

  private async curate(archived: Archived, opts: IngestOptions): Promise<IngestResult> {
    const { source, bytes, ext, skipped } = archived;
    const { origin, id, kind } = source.metadata;

    if (skipped) {
      return {
        summary: `Already ingested as ${origin}/${id}; nothing to do.`,
        source,
        skipped: true,
        curated: false,
      };
    }

    const material = extractText(bytes, ext);
    if (material === null) {
      return {
        summary: `Archived as ${origin}/${id}; nothing can read ${kind} yet, so it was not curated.`,
        source,
        skipped: false,
        curated: false,
      };
    }

    const answer = await this.curator.run(`New information to integrate:\n\n${material}`, {
      maxIterations: opts.maxSteps,
      signal: opts.signal,
    });
    return { summary: answer, source, skipped: false, curated: true };
  }

  async reindex(): Promise<void> {
    return this.wiki.reindex();
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
