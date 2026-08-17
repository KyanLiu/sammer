import { describe, it, expect } from "vitest";
import { z } from "zod";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine } from "../src/engine.js";
import { defineTool } from "../src/agent/define-tool.js";
import type { LlmClient } from "../src/llm/client.js";
import type { Config } from "@sammer/shared";

type Step = { tool?: [string, Record<string, unknown>]; text?: string };

// Replays a fixed script of model turns. The last step repeats, so a loop that
// runs longer than expected ends rather than throwing on an exhausted script.
function scriptedLlm(script: Step[]): LlmClient {
  let i = 0;
  return {
    chat: async () => {
      const step = script[Math.min(i++, script.length - 1)]!;
      if (step.tool) {
        return {
          content: null,
          toolCalls: [{ id: `c${i}`, name: step.tool[0], arguments: step.tool[1] }],
        };
      }
      return { content: step.text ?? "done", toolCalls: [] };
    },
    embed: async (texts) => texts.map(() => []),
  };
}

async function makeCfg(): Promise<Config> {
  return {
    dataDir: await mkdtemp(join(tmpdir(), "sammer-engine-")),
    llm: { baseUrl: "x", apiKey: "x", chatModel: "m", embedModel: "e", embedDim: 3 },
  };
}

const writesCats: Step[] = [
  {
    tool: [
      "write_page",
      {
        title: "Cats",
        body: "A cat is a small feline. Cats nap a lot.",
        category: "Animals",
        summary: "Everything about cats",
      },
    ],
  },
  { text: "Stored." },
];

describe("Engine", () => {
  it("ingests through the curation loop, then answers from what it stored", async () => {
    const engine = await Engine.create(await makeCfg(), {
      llm: scriptedLlm([
        ...writesCats,
        { tool: ["search_wiki", { query: "cat" }] },
        { tool: ["read_page", { slug: "cats" }] },
        { text: "A cat is a small feline. [[cats]]" },
      ]),
    });

    expect(await engine.ingest("Cats are small felines that nap a lot.")).toBe("Stored.");
    expect(await engine.listPages()).toEqual(["cats"]);

    expect(await engine.ask("what is a cat?")).toMatch(/feline/i);
    engine.close();
  });

  it("regenerates index.md from each page's category and summary", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: scriptedLlm(writesCats) });

    await engine.ingest("cats");

    const index = await readFile(join(cfg.dataDir, "wiki", "index.md"), "utf8");
    expect(index).toContain("## Animals");
    expect(index).toContain("[[cats]]");
    expect(index).toContain("Everything about cats");
    engine.close();
  });

  it("appends a dated entry to log.md on every ingest", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: scriptedLlm(writesCats) });

    await engine.ingest("cats");

    const log = await readFile(join(cfg.dataDir, "wiki", "log.md"), "utf8");
    expect(log).toMatch(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
    expect(log).toContain("Stored.");
    engine.close();
  });

  it("rebuilds the search index from the markdown on disk", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        {
          tool: [
            "write_page",
            { title: "Boxes", body: "A box holds a cat.", category: "Storage", summary: "Boxes" },
          ],
        },
        { text: "ok" },
      ]),
    });
    await engine.ingest("boxes");

    await engine.reindex();

    expect((await engine.search("box")).map((h) => h.slug)).toContain("boxes");
    engine.close();
  });

  it("reads pages an existing vault already contains on startup", async () => {
    const cfg = await makeCfg();
    const first = await Engine.create(cfg, { llm: scriptedLlm(writesCats) });
    await first.ingest("cats");
    first.close();

    // A second engine over the same dataDir starts from the markdown alone.
    const second = await Engine.create(cfg, { llm: scriptedLlm([{ text: "unused" }]) });

    expect(await second.listPages()).toEqual(["cats"]);
    expect((await second.getPage("cats"))?.category).toBe("Animals");
    expect((await second.search("feline")).map((h) => h.slug)).toContain("cats");
    second.close();
  });

  it("refuses to let a question write to the wiki", async () => {
    const cfg = await makeCfg();
    // The model tries to write while merely answering a question.
    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        { tool: ["write_page", { title: "Sneaky", body: "b", summary: "s" }] },
        { text: "could not" },
      ]),
    });

    await engine.ask("what is a cat?");

    expect(await engine.listPages()).toEqual([]);
    engine.close();
  });

  it("registers custom tools passed in at construction", async () => {
    const cfg = await makeCfg();
    const messages = defineTool({
      name: "search_messages",
      description: "Search the message archive",
      mutates: false,
      schema: z.object({ query: z.string() }),
      run: async ({ query }) => `2 messages about ${query}`,
    });

    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        { tool: ["search_messages", { query: "cats" }] },
        { text: "They talked about cats twice." },
      ]),
      tools: [messages],
    });

    expect(await engine.ask("what did they say about cats?")).toMatch(/twice/);
    engine.close();
  });
});
