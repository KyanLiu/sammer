import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine } from "../src/engine.js";
import { textSourceId } from "../src/raw/id.js";
import type { LlmClient } from "../src/llm/client.js";
import type { Config } from "@sammer/shared";

const WRITES_CATS = [
  {
    content: null,
    toolCalls: [
      {
        id: "c1",
        name: "write_wiki_page",
        arguments: {
          title: "Cats",
          body: "A cat is a small feline.",
          category: "Animals",
          summary: "Everything about cats",
        },
      },
    ],
  },
  { content: "Stored.", toolCalls: [] },
];

function countingLlm(onCall?: () => void): LlmClient & { calls: number } {
  let i = 0;
  const llm = {
    calls: 0,
    chat: async () => {
      onCall?.();
      llm.calls++;
      return WRITES_CATS[Math.min(i++, WRITES_CATS.length - 1)]!;
    },
  };
  return llm;
}

async function makeCfg(): Promise<Config> {
  return {
    dataDir: await mkdtemp(join(tmpdir(), "sammer-raw-engine-")),
    llm: { provider: "openai", baseUrl: "x", apiKey: "x", chatModel: "m", embedModel: "e", embedDim: 3 },
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const rawDir = (cfg: Config, origin: string) => join(cfg.dataDir, "raw", origin, today());
const rawFiles = (cfg: Config, origin: string) => readdir(rawDir(cfg, origin));

describe("Engine raw archive", () => {
  it("keeps the verbatim text and a metadata record for what it ingests", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: countingLlm() });
    const text = "Cats are small felines that nap a lot.";

    await engine.ingest(text, { source: { origin: "cli", kind: "text", title: "a cat fact" } });

    const id = textSourceId(text);
    expect(await readFile(join(rawDir(cfg, "cli"), `${id}.txt`), "utf8")).toBe(text);
    const record = JSON.parse(await readFile(join(rawDir(cfg, "cli"), `${id}.meta.json`), "utf8"));
    expect(record).toMatchObject({
      id,
      origin: "cli",
      kind: "text",
      title: "a cat fact",
      fileName: `${id}.txt`,
    });
    expect(record.created).toMatch(/\d{4}-\d{2}-\d{2}T/);
    engine.close();
  });

  it("archives the material before the curator runs, so a failed run still keeps it", async () => {
    const cfg = await makeCfg();
    let onDiskAtFirstCall: string[] | undefined;
    let i = 0;
    const engine = await Engine.create(cfg, {
      llm: {
        chat: async () => {
          onDiskAtFirstCall ??= await rawFiles(cfg, "cli").catch(() => []);
          return WRITES_CATS[Math.min(i++, WRITES_CATS.length - 1)]!;
        },
      },
    });

    await engine.ingest("Cats nap.", { source: { origin: "cli", kind: "text" } });

    expect(onDiskAtFirstCall).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.txt$/), expect.stringMatching(/\.json$/)]),
    );
    engine.close();
  });

  it("skips a second ingest of the same text without calling the model again", async () => {
    const cfg = await makeCfg();
    const llm = countingLlm();
    const engine = await Engine.create(cfg, { llm });

    const first = await engine.ingest("Cats nap a lot.", { source: { origin: "cli", kind: "text" } });
    const callsAfterFirst = llm.calls;
    const second = await engine.ingest("Cats nap a lot.", { source: { origin: "cli", kind: "text" } });

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(llm.calls).toBe(callsAfterFirst);
    expect(await rawFiles(cfg, "cli")).toHaveLength(2);
    engine.close();
  });

  it("treats whitespace-only differences as the same material", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: countingLlm() });

    await engine.ingest("Cats nap.", { source: { origin: "cli", kind: "text" } });
    const second = await engine.ingest("  Cats nap.\n\n", { source: { origin: "cli", kind: "text" } });

    expect(second.skipped).toBe(true);
    engine.close();
  });

  it("keeps two records when the same filename carries different content", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: countingLlm() });
    const source = { origin: "file", kind: "text" as const, title: "conversations.txt" };

    const monday = await engine.ingest("monday's export", { source });
    const friday = await engine.ingest("friday's export", { source });

    expect(monday.skipped).toBe(false);
    expect(friday.skipped).toBe(false);
    expect(monday.source!.metadata.id).not.toBe(friday.source!.metadata.id);
    expect(await rawFiles(cfg, "file")).toHaveLength(4);
    engine.close();
  });

  it("separates records by origin, so a file and a tell are not confused", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: countingLlm() });

    await engine.ingest("same words", { source: { origin: "cli", kind: "text" } });
    const viaFile = await engine.ingest("same words", { source: { origin: "file", kind: "text" } });

    expect(viaFile.skipped).toBe(false);
    expect(await rawFiles(cfg, "cli")).toHaveLength(2);
    expect(await rawFiles(cfg, "file")).toHaveLength(2);
    engine.close();
  });

  it("leaves the wiki untouched when it skips", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: countingLlm() });

    await engine.ingest("Cats nap.", { source: { origin: "cli", kind: "text" } });
    const logBefore = await readFile(join(cfg.dataDir, "wiki", "log.md"), "utf8");
    await engine.ingest("Cats nap.", { source: { origin: "cli", kind: "text" } });

    expect(await readFile(join(cfg.dataDir, "wiki", "log.md"), "utf8")).toBe(logBefore);
    engine.close();
  });

  it("records what the conversation agent curates as its own origin", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, {
      llm: {
        chat: async (req) => {
          const asked = req.messages.some((m) => m.role === "tool");
          if (req.messages.some((m) => String(m.content).includes("New information to integrate"))) {
            return asked ? { content: "Wrote it.", toolCalls: [] } : WRITES_CATS[0]!;
          }
          return asked
            ? { content: "Saved.", toolCalls: [] }
            : {
                content: null,
                toolCalls: [{ id: "t1", name: "curate", arguments: { material: "Cats nap a lot." } }],
              };
        },
      },
    });

    await engine.run("remember that cats nap a lot");

    expect(await rawFiles(cfg, "chat")).toHaveLength(2);
    engine.close();
  });

  it("wraps ingested material in untrusted-data markers before handing it to the curator", async () => {
    const cfg = await makeCfg();
    let curatorContent: string | undefined;
    let i = 0;
    const engine = await Engine.create(cfg, {
      llm: {
        chat: async (req) => {
          const userMsg = req.messages.find((m) => m.role === "user");
          if (userMsg && String(userMsg.content).includes("<<<BEGIN SOURCE MATERIAL>>>")) {
            curatorContent ??= String(userMsg.content);
          }
          return WRITES_CATS[Math.min(i++, WRITES_CATS.length - 1)]!;
        },
      },
    });

    await engine.ingest("Cats nap.", { source: { origin: "cli", kind: "text" } });

    expect(curatorContent).toContain("<<<BEGIN SOURCE MATERIAL>>>");
    expect(curatorContent).toContain("Cats nap.");
    expect(curatorContent).toContain("<<<END SOURCE MATERIAL>>>");
    engine.close();
  });

  it("wraps chat-triggered curate material with the same untrusted-data markers", async () => {
    const cfg = await makeCfg();
    let curatorContent: string | undefined;
    const engine = await Engine.create(cfg, {
      llm: {
        chat: async (req) => {
          const asked = req.messages.some((m) => m.role === "tool");
          const userMsg = [...req.messages].reverse().find((m) => m.role === "user");
          if (userMsg && String(userMsg.content).includes("<<<BEGIN SOURCE MATERIAL>>>")) {
            curatorContent ??= String(userMsg.content);
            return asked ? { content: "Wrote it.", toolCalls: [] } : WRITES_CATS[0]!;
          }
          return asked
            ? { content: "Saved.", toolCalls: [] }
            : {
                content: null,
                toolCalls: [{ id: "t1", name: "curate", arguments: { material: "Cats nap a lot." } }],
              };
        },
      },
    });

    await engine.run("remember that cats nap a lot");

    expect(curatorContent).toContain("<<<BEGIN SOURCE MATERIAL>>>");
    expect(curatorContent).toContain("Cats nap a lot.");
    engine.close();
  });
});

describe("Engine.ingestFile", () => {
  async function fileWith(name: string, content: Buffer | string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "sammer-docs-"));
    const path = join(dir, name);
    await writeFile(path, content);
    return path;
  }

  it("archives a document byte for byte and curates what it extracts", async () => {
    const cfg = await makeCfg();
    const llm = countingLlm();
    const engine = await Engine.create(cfg, { llm });
    const path = await fileWith("notes.md", "# Cats\n\nCats nap a lot.\n");

    const result = await engine.ingestFile(path);

    expect(result.curated).toBe(true);
    expect(result.skipped).toBe(false);
    expect(llm.calls).toBeGreaterThan(0);
    expect(await engine.listPages()).toEqual(["cats"]);
    expect(await readFile(join(rawDir(cfg, "file"), result.source.fileName), "utf8")).toBe(
      "# Cats\n\nCats nap a lot.\n",
    );
    engine.close();
  });

  it("keeps a file that is not valid utf8 intact, which a text read would corrupt", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: countingLlm() });
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    const path = await fileWith("cafe.txt", latin1);

    const result = await engine.ingestFile(path);

    const archived = await readFile(join(rawDir(cfg, "file"), result.source.fileName));
    expect(archived.equals(latin1)).toBe(true);
    engine.close();
  });

  it("archives a pdf without curating it, since nothing can read one yet", async () => {
    const cfg = await makeCfg();
    const llm = countingLlm();
    const engine = await Engine.create(cfg, { llm });
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0xff]);
    const path = await fileWith("report.pdf", pdf);

    const result = await engine.ingestFile(path);

    expect(result.curated).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.summary).toMatch(/pdf/i);
    expect(llm.calls).toBe(0);
    expect((await readFile(join(rawDir(cfg, "file"), result.source.fileName))).equals(pdf)).toBe(true);
    expect(await engine.listPages()).toEqual([]);
    engine.close();
  });

  it("leaves the log alone for material it archived but could not curate", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: countingLlm() });

    await engine.ingestFile(await fileWith("photo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47])));

    expect(await readFile(join(cfg.dataDir, "wiki", "log.md"), "utf8").catch(() => null)).toBeNull();
    engine.close();
  });

  it("skips a document it has already archived", async () => {
    const cfg = await makeCfg();
    const llm = countingLlm();
    const engine = await Engine.create(cfg, { llm });
    const path = await fileWith("notes.md", "# Cats");

    await engine.ingestFile(path);
    const callsAfterFirst = llm.calls;
    const again = await engine.ingestFile(path);

    expect(again.skipped).toBe(true);
    expect(again.curated).toBe(false);
    expect(llm.calls).toBe(callsAfterFirst);
    engine.close();
  });

  it("records the file name and path it came from", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: countingLlm() });
    const path = await fileWith("conversations.txt", "chat log");

    const { source } = await engine.ingestFile(path);

    expect(source.metadata.title).toBe("conversations.txt");
    expect(source.metadata.url).toBe(path);
    expect(source.metadata.origin).toBe("file");
    engine.close();
  });
});
