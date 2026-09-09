import { stat } from "node:fs/promises";
import { extname } from "node:path";

export interface Curator {
  ingestFile(
    path: string,
    opts?: { maxSteps?: number },
  ): Promise<{ summary: string; skipped: boolean; curated: boolean }>;
}

export interface IngestArgs {
  paths: string[];
  maxSteps: number;
  dryRun: boolean;
}

export interface IngestResult {
  ingested: number;
  archived: number;
  skipped: number;
  failed: number;
  truncated: string[];
}

export class UsageError extends Error {}

const EXTRACTABLE = new Set([".txt", ".json", ".md"]);

interface Doc {
  path: string;
  bytes: number;
}

// Every path is checked before any is ingested, so a bad path fails before spending
// money on the documents ahead of it. The contents are never read here: the engine
// archives the file byte for byte, and a utf8 read would corrupt anything binary.
async function checkAll(paths: string[], out: (line: string) => void): Promise<Doc[]> {
  const docs: Doc[] = [];
  for (const path of paths) {
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new UsageError(`not a readable file: ${path}`);
    if (info.size > 0) docs.push({ path, bytes: info.size });
    else out(`skipping empty file: ${path}`);
  }
  return docs;
}

export async function ingestCommand(
  engine: Curator,
  args: IngestArgs,
  out: (line: string) => void,
): Promise<IngestResult> {
  if (args.paths.length === 0) throw new UsageError("ingest needs at least one file");
  if (!Number.isInteger(args.maxSteps) || args.maxSteps < 1) {
    throw new UsageError(`--max-steps must be a positive integer, got "${args.maxSteps}"`);
  }

  const docs = await checkAll(args.paths, out);
  const result: IngestResult = { ingested: 0, archived: 0, skipped: 0, failed: 0, truncated: [] };

  if (args.dryRun) {
    for (const { path, bytes } of docs) {
      const readable = EXTRACTABLE.has(extname(path).toLowerCase());
      const cost = readable ? `~${Math.ceil(bytes / 4)} tokens` : "archive only, not curated";
      out(`  ${path}  ${bytes} bytes, ${cost}`);
    }
    out("dry run — nothing was ingested.");
    return result;
  }

  for (const [i, { path }] of docs.entries()) {
    const started = Date.now();
    out(`[${i + 1}/${docs.length}] ${path}`);
    try {
      const { summary, skipped, curated } = await engine.ingestFile(path, {
        maxSteps: args.maxSteps,
      });
      if (skipped) {
        result.skipped++;
        out(`  already ingested — skipped`);
        continue;
      }
      if (!curated) {
        result.archived++;
        out(`  archived, not curated  ${summary}`);
        continue;
      }
      result.ingested++;
      out(`  ok  ${summary}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      // The loop answers instead of finishing when it runs out of steps, so a
      // truncated curation reads as success unless this is checked.
      if (/step limit/i.test(summary)) {
        result.truncated.push(path);
        out(`  ! hit the step limit; pages may be missing. Retry with --max-steps=${args.maxSteps * 2}`);
      }
    } catch (e) {
      result.failed++;
      out(`  failed  ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
