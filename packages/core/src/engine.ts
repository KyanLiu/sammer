import { join } from "node:path";
import type Database from "better-sqlite3";
import type { Caller, Config, Page, SearchHit, Source } from "@sammer/shared";
import { ADMIN_CALLER, roleRank } from "@sammer/shared";
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
import { listPageSlugs, listPageSummaries, type PageSummary } from "./index/pages.js";
import type { Tool } from "./agent/registry.js";
import type { Agent } from "./agent/agent.js";
import { buildToolIndex } from "./agent/tools/index.js";
import { buildAgents } from "./agent/build.js";
import { CURATOR_ID, wrapUntrustedMaterial, type CuratorAgent } from "./agent/curator/index.js";
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
  caller?: Caller;
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

export interface GraphNode {
  slug: string;
  title: string;
  category: string;
  role: string;
}

export interface GraphEdge {
  src: string;
  dst: string;
}

export interface PageGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RawSourceContent {
  source: Source;
  content: string;
}

const DEFAULT_SOURCE: IngestSource = { origin: "api", kind: "text" };
const FILE_SOURCE: IngestSource = { origin: "file" };

export class Engine {
  private constructor(
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

    const engine = new Engine(raw, wiki, db, agents, curator, telemetry);
    // The markdown is the source of truth; the index is derived, so it is
    // rebuilt on every startup rather than trusted to be current.
    await engine.reindex();
    return engine;
  }

  async run(prompt: string, opts: RunOptions = {}): Promise<string> {
    return this.agent(ORCHESTRATOR_ID).run(prompt, {
      maxIterations: opts.maxSteps,
      readOnly: opts.readOnly,
      caller: opts.caller,
      signal: opts.signal,
    });
  }

  async ask(
    question: string,
    opts: { maxSteps?: number; signal?: AbortSignal; caller?: Caller } = {},
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

    const answer = await this.curator.run(wrapUntrustedMaterial(material), {
      maxIterations: opts.maxSteps,
      signal: opts.signal,
    });
    return { summary: answer, source, skipped: false, curated: true };
  }

  async reindex(): Promise<void> {
    return this.wiki.reindex();
  }

  async listPages(caller: Caller = ADMIN_CALLER): Promise<string[]> {
    return listPageSlugs(this.db, roleRank(caller.role));
  }

  async listPageSummaries(caller: Caller = ADMIN_CALLER): Promise<PageSummary[]> {
    return listPageSummaries(this.db, roleRank(caller.role));
  }

  async getPage(slug: string, caller: Caller = ADMIN_CALLER): Promise<Page | null> {
    return this.wiki.getPage(slug, roleRank(caller.role));
  }

  // bypasses curation agent and writes data directly
  async savePageRaw(slug: string, raw: string): Promise<Page> {
    return this.wiki.saveRaw(slug, raw);
  }

  // index.md / log.md read
  async readGenerated(name: "index" | "log"): Promise<string | null> {
    return this.wiki.readText(name);
  }

  // manual graph generation based on role access
  async graph(caller: Caller = ADMIN_CALLER): Promise<PageGraph> {
    const maxRank = roleRank(caller.role);
    const nodes: GraphNode[] = [];
    const linksBySlug = new Map<string, string[]>();
    for (const slug of await this.wiki.listPages()) {
      const page = await this.wiki.getPage(slug, maxRank);
      if (!page) continue;
      nodes.push({
        slug,
        title: page.metadata.title,
        category: page.metadata.category,
        role: page.metadata.role,
      });
      linksBySlug.set(slug, page.links);
    }
    const visible = new Set(nodes.map((n) => n.slug));
    const edges: GraphEdge[] = [];
    for (const [src, links] of linksBySlug) {
      for (const dst of links) {
        if (visible.has(dst)) edges.push({ src, dst });
      }
    }
    return { nodes, edges };
  }

  async listRawSources(): Promise<Source[]> {
    return this.raw.list();
  }

  async getRawSource(origin: string, id: string): Promise<RawSourceContent | null> {
    const source = await this.raw.read(origin, id);
    if (!source) return null;
    const content = await this.raw.readContent(source);
    return { source, content };
  }

  async search(q: string, caller: Caller = ADMIN_CALLER): Promise<SearchHit[]> {
    return keywordSearch(this.db, q, { k: 8, expandHops: 1, maxRank: roleRank(caller.role) });
  }

  close(): void {
    this.db.close();
  }
}
