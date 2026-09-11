import type { Source, SourceMetadata } from "@sammer/shared";
import type { IngestResult } from "@sammer/core";
import type { ServerDeps } from "../src/deps.js";

const now = new Date().toISOString();

const fakeSourceMetadata: SourceMetadata = {
  id: "src-1",
  title: "",
  category: "",
  tags: [],
  summary: "",
  created: now,
  updated: now,
  kind: "text",
  origin: "api",
};

export const fakeSource: Source = { metadata: fakeSourceMetadata, fileName: "src-1.txt" };

export function fakeIngestResult(summary: string, overrides: Partial<IngestResult> = {}): IngestResult {
  return { summary, source: fakeSource, skipped: false, curated: true, ...overrides };
}

export function fakeDeps(overrides: Partial<ServerDeps> = {}): ServerDeps {
  return {
    listPages: async () => [],
    getPage: async () => null,
    ask: async () => "",
    run: async () => "",
    ingest: async () => fakeIngestResult(""),
    ingestFile: async () => fakeIngestResult(""),
    search: async () => [],
    telemetry: { subscribe: () => () => {} },
    ...overrides,
  };
}
