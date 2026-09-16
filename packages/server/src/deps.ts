import type { AgentEvent, Caller, Page, SearchHit, Source } from "@sammer/shared";
import type { IngestResult, IngestSource } from "@sammer/core";

export interface PageReader {
  listPages(caller?: Caller): Promise<string[]>;
  getPage(slug: string, caller?: Caller): Promise<Page | null>;
}

export interface Asker {
  ask(question: string, opts?: { maxSteps?: number; caller?: Caller }): Promise<string>;
}

export interface Runner {
  run(prompt: string, opts?: { readOnly?: boolean; maxSteps?: number; caller?: Caller }): Promise<string>;
}

export interface TextIngester {
  ingest(text: string, opts?: { source?: IngestSource }): Promise<IngestResult>;
}

export interface FileIngester {
  ingestFile(path: string, opts?: { maxSteps?: number }): Promise<IngestResult>;
}

export interface Searcher {
  search(q: string, caller?: Caller): Promise<SearchHit[]>;
}

export interface TelemetrySource {
  telemetry: { subscribe(listener: (event: AgentEvent) => void): () => void };
}

export type ServerDeps = PageReader &
  Asker &
  Runner &
  TextIngester &
  FileIngester &
  Searcher &
  TelemetrySource;

export type { Source };
