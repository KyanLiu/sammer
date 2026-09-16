import type { Source, SourceMetadata } from "@sammer/shared";
import type { IngestResult } from "@sammer/core";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { createUser } from "@sammer/core";
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

export async function adminCookie(app: FastifyInstance, authDb: Database.Database): Promise<string> {
  await createUser(authDb, "admin@test.local", "test-password", "admin");
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@test.local", password: "test-password" },
  });
  const setCookie = res.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!cookie) throw new Error("login did not set a session cookie");
  return cookie.split(";")[0]!;
}
