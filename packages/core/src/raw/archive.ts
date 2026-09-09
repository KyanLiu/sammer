import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { Source, SourceKind, SourceMetadata } from "@sammer/shared";
import type { RawStore } from "./store.js";
import { sourceId } from "./id.js";
import { classifyFile } from "./kind.js";

export type IngestSource = Pick<SourceMetadata, "origin"> &
  Partial<Pick<SourceMetadata, "kind" | "title" | "url" | "externalId">>;

export interface Archived {
  source: Source;
  bytes: Buffer;
  ext: string;
  skipped: boolean;
}

// metadata for archived data
function archiveMetadata(id: string, from: IngestSource, kind: SourceKind): SourceMetadata {
  const now = new Date().toISOString();
  return {
    id,
    title: from.title ?? "",
    category: "",
    tags: [],
    summary: "",
    created: now,
    updated: now,
    kind: from.kind ?? kind,
    origin: from.origin,
    ...(from.externalId === undefined ? {} : { externalId: from.externalId }),
    ...(from.url === undefined ? {} : { url: from.url }),
  };
}

// archives data
async function archive(
  store: RawStore,
  bytes: Buffer,
  ext: string,
  kind: SourceKind,
  from: IngestSource,
): Promise<Archived> {
  const id = sourceId(bytes);
  const held = await store.read(from.origin, id);
  if (held) return { source: held, bytes, ext, skipped: true };

  const source = await store.write(archiveMetadata(id, from, kind), bytes, ext);
  return { source, bytes, ext, skipped: false };
}

export async function archiveFile(
  store: RawStore,
  path: string,
  from: IngestSource,
): Promise<Archived> {
  const { ext, kind } = classifyFile(path);
  const bytes = await readFile(path);
  return archive(store, bytes, ext, kind, {
    title: basename(path),
    url: resolve(path),
    ...from,
  });
}

export async function archiveText(
  store: RawStore,
  text: string,
  from: IngestSource,
): Promise<Archived> {
  return archive(store, Buffer.from(text.trim(), "utf8"), ".txt", "text", from);
}
