import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestCommand, UsageError, type Curator } from "../src/commands/ingest.js";
import { formatHits, formatPages } from "../src/commands/search.js";

type Outcome = { summary: string; skipped?: boolean; curated?: boolean };

function fakeCurator(outcomes: Outcome[] | (() => never)): Curator & { seen: string[] } {
  const seen: string[] = [];
  let i = 0;
  return {
    seen,
    async ingestFile(path) {
      seen.push(path);
      if (typeof outcomes === "function") return outcomes();
      const out = outcomes[Math.min(i++, outcomes.length - 1)]!;
      return { summary: out.summary, skipped: out.skipped ?? false, curated: out.curated ?? true };
    },
  };
}

const curated = (...summaries: string[]): Outcome[] => summaries.map((summary) => ({ summary }));

async function filesWith(files: Record<string, string>): Promise<Record<string, string>> {
  const dir = await mkdtemp(join(tmpdir(), "sammer-cli-"));
  const paths: Record<string, string> = {};
  for (const [name, body] of Object.entries(files)) {
    paths[name] = join(dir, name);
    await writeFile(paths[name]!, body, "utf8");
  }
  return paths;
}

const collect = () => {
  const lines: string[] = [];
  return { lines, out: (line: string) => lines.push(line) };
};

describe("ingest command", () => {
  it("hands each path to the engine and counts the successes", async () => {
    const paths = await filesWith({ "a.md": "About cats.", "b.md": "About boxes." });
    const engine = fakeCurator(curated("Wrote cats.", "Wrote boxes."));
    const { lines, out } = collect();

    const result = await ingestCommand(
      engine,
      { paths: [paths["a.md"]!, paths["b.md"]!], maxSteps: 16, dryRun: false },
      out,
    );

    expect(result).toEqual({ ingested: 2, archived: 0, skipped: 0, failed: 0, truncated: [] });
    expect(engine.seen).toEqual([paths["a.md"], paths["b.md"]]);
    expect(lines.join("\n")).toContain("Wrote boxes.");
  });

  it("never reads the file itself, so a binary reaches the engine untouched", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sammer-cli-"));
    const path = join(dir, "report.pdf");
    await writeFile(path, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe]));
    const engine = fakeCurator([{ summary: "Archived as file/abc; nothing can read pdf yet.", curated: false }]);
    const { out } = collect();

    const result = await ingestCommand(engine, { paths: [path], maxSteps: 16, dryRun: false }, out);

    expect(engine.seen).toEqual([path]);
    expect(result.archived).toBe(1);
  });

  it("counts material archived without curation apart from material that was curated", async () => {
    const paths = await filesWith({ "report.pdf": "%PDF-1.7", "notes.md": "About cats." });
    const engine = fakeCurator([
      { summary: "Archived as file/abc123; nothing can read pdf yet, so it was not curated.", curated: false },
      { summary: "Wrote cats." },
    ]);
    const { lines, out } = collect();

    const result = await ingestCommand(
      engine,
      { paths: [paths["report.pdf"]!, paths["notes.md"]!], maxSteps: 16, dryRun: false },
      out,
    );

    expect(result).toEqual({ ingested: 1, archived: 1, skipped: 0, failed: 0, truncated: [] });
    expect(lines.join("\n")).toMatch(/archived, not curated/i);
  });

  it("counts material the engine had already archived as skipped", async () => {
    const paths = await filesWith({ "a.md": "About cats." });
    const engine = fakeCurator([
      { summary: "Already ingested as file/abc123; nothing to do.", skipped: true, curated: false },
    ]);
    const { lines, out } = collect();

    const result = await ingestCommand(
      engine,
      { paths: [paths["a.md"]!], maxSteps: 16, dryRun: false },
      out,
    );

    expect(result).toEqual({ ingested: 0, archived: 0, skipped: 1, failed: 0, truncated: [] });
    expect(lines.join("\n")).toContain("already ingested");
  });

  it("reports a run that hit the step limit rather than calling it a success", async () => {
    const paths = await filesWith({ "a.md": "A long document." });
    const engine = fakeCurator(curated("Reached the step limit before finishing."));
    const { lines, out } = collect();

    const result = await ingestCommand(
      engine,
      { paths: [paths["a.md"]!], maxSteps: 8, dryRun: false },
      out,
    );

    expect(result.ingested).toBe(1);
    expect(result.truncated).toEqual([paths["a.md"]]);
    expect(lines.join("\n")).toContain("--max-steps=16");
  });

  it("fails before ingesting anything when a path is unreadable", async () => {
    const paths = await filesWith({ "a.md": "About cats." });
    const engine = fakeCurator(curated("Wrote cats."));
    const { out } = collect();

    await expect(
      ingestCommand(
        engine,
        { paths: [paths["a.md"]!, "/no/such/file.md"], maxSteps: 16, dryRun: false },
        out,
      ),
    ).rejects.toThrow(UsageError);

    // The readable file came first, and must still not have been sent.
    expect(engine.seen).toEqual([]);
  });

  it("skips an empty file instead of archiving nothing", async () => {
    const paths = await filesWith({ "empty.md": "", "a.md": "About cats." });
    const engine = fakeCurator(curated("Wrote cats."));
    const { lines, out } = collect();

    const result = await ingestCommand(
      engine,
      { paths: [paths["empty.md"]!, paths["a.md"]!], maxSteps: 16, dryRun: false },
      out,
    );

    expect(result.ingested).toBe(1);
    expect(engine.seen).toEqual([paths["a.md"]]);
    expect(lines.join("\n")).toContain("skipping empty file");
  });

  it("sends nothing on a dry run, and says what each file would cost", async () => {
    const paths = await filesWith({ "a.md": "About cats." });
    const engine = fakeCurator(curated("unused"));
    const { lines, out } = collect();

    const result = await ingestCommand(
      engine,
      { paths: [paths["a.md"]!], maxSteps: 16, dryRun: true },
      out,
    );

    expect(result.ingested).toBe(0);
    expect(engine.seen).toEqual([]);
    expect(lines.join("\n")).toMatch(/11 bytes/);
  });

  it("says which files a dry run would archive without curating", async () => {
    const paths = await filesWith({ "report.pdf": "%PDF-1.7" });
    const engine = fakeCurator(curated("unused"));
    const { lines, out } = collect();

    await ingestCommand(engine, { paths: [paths["report.pdf"]!], maxSteps: 16, dryRun: true }, out);

    expect(lines.join("\n")).toMatch(/archive only/i);
  });

  it("keeps going after one document fails, and counts it", async () => {
    const paths = await filesWith({ "a.md": "About cats." });
    const engine: Curator = {
      async ingestFile() {
        throw new Error("provider is down");
      },
    };
    const { lines, out } = collect();

    const result = await ingestCommand(
      engine,
      { paths: [paths["a.md"]!], maxSteps: 16, dryRun: false },
      out,
    );

    expect(result).toEqual({ ingested: 0, archived: 0, skipped: 0, failed: 1, truncated: [] });
    expect(lines.join("\n")).toContain("provider is down");
  });

  it("rejects an unusable step budget before touching the filesystem", async () => {
    const engine = fakeCurator(curated("unused"));
    const { out } = collect();

    await expect(
      ingestCommand(engine, { paths: ["a.md"], maxSteps: 0, dryRun: false }, out),
    ).rejects.toThrow(/positive integer/);
  });

  it("needs at least one file", async () => {
    const engine = fakeCurator(curated("unused"));
    const { out } = collect();

    await expect(
      ingestCommand(engine, { paths: [], maxSteps: 16, dryRun: false }, out),
    ).rejects.toThrow(/at least one file/);
  });
});

describe("output formatting", () => {
  it("renders search hits as slug, title and a flattened snippet", () => {
    const text = formatHits([
      { slug: "cats", title: "Cats", score: 1, snippet: "A cat is\n  a small   feline." },
    ]);

    expect(text).toContain("cats  Cats");
    expect(text).toContain("A cat is a small feline.");
  });

  it("says so plainly when there is nothing to show", () => {
    expect(formatHits([])).toBe("No matching pages.");
    expect(formatPages([])).toBe("The wiki is empty.");
  });
});
