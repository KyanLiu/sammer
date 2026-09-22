import { describe, it, expect } from "vitest";
import { z } from "zod";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine } from "../src/engine.js";
import { defineTool } from "../src/agent/define-tool.js";
import type { LlmClient, ChatRequest } from "../src/llm/client.js";
import type { Config } from "@sammer/shared";
import type { AgentEvent } from "@sammer/shared";

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

// Wraps scriptedLlm and records the requests, so a test can assert on which
// tools the agent was actually offered.
function recordingLlm(script: Step[]): LlmClient & { seen: ChatRequest[] } {
  const inner = scriptedLlm(script);
  const seen: ChatRequest[] = [];
  return {
    seen,
    chat: async (req) => {
      seen.push(structuredClone(req));
      return inner.chat(req);
    },
  };
}

async function makeCfg(): Promise<Config> {
  return {
    dataDir: await mkdtemp(join(tmpdir(), "sammer-engine-")),
    llm: { provider: "openai", baseUrl: "x", apiKey: "x", chatModel: "m", embedModel: "e", embedDim: 3 },
  };
}

const writesCats: Step[] = [
  {
    tool: [
      "write_wiki_page",
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
        { tool: ["read_wiki_page", { slug: "cats" }] },
        { text: "A cat is a small feline. [[cats]]" },
      ]),
    });

    expect((await engine.ingest("Cats are small felines that nap a lot.")).summary).toBe("Stored.");
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
            "write_wiki_page",
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
    expect((await second.getPage("cats"))?.metadata.category).toBe("Animals");
    expect((await second.search("feline")).map((h) => h.slug)).toContain("cats");
    second.close();
  });

  it("refuses to let a question write to the wiki", async () => {
    const cfg = await makeCfg();
    // The model tries to write while merely answering a question.
    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        { tool: ["write_wiki_page", { title: "Sneaky", body: "b", summary: "s" }] },
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

describe("Engine.run", () => {
  it("answers a question by reading the wiki", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: scriptedLlm(writesCats) });
    await engine.ingest("cats");
    engine.close();

    const second = await Engine.create(cfg, {
      llm: scriptedLlm([
        { tool: ["search_wiki", { query: "cat" }] },
        { tool: ["read_wiki_page", { slug: "cats" }] },
        { text: "A cat is a small feline. [[cats]]" },
      ]),
    });

    expect(await second.run("what is a cat?")).toMatch(/feline/i);
    second.close();
  });

  it("curates through the curate tool and regenerates the catalog and log", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        { tool: ["curate", { material: "On 2026-08-29 the user adopted a cat." }] },
        {
          tool: [
            "write_wiki_page",
            { title: "Cats", body: "Adopted 2026-08-29.", category: "Animals", summary: "Cats" },
          ],
        },
        { text: "Wrote the cats page." },
        { text: "Saved that to [[cats]]." },
      ]),
    });

    const answer = await engine.run("today I adopted a cat, remember that");

    expect(answer).toMatch(/saved/i);
    expect(await engine.listPages()).toEqual(["cats"]);

    const index = await readFile(join(cfg.dataDir, "wiki", "index.md"), "utf8");
    expect(index).toContain("[[cats]]");
    const log = await readFile(join(cfg.dataDir, "wiki", "log.md"), "utf8");
    expect(log).toContain("Wrote the cats page.");
    engine.close();
  });

  it("links the curator's run to the orchestrator's via telemetry", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        { tool: ["curate", { material: "On 2026-08-29 the user adopted a cat." }] },
        {
          tool: [
            "write_wiki_page",
            { title: "Cats", body: "Adopted 2026-08-29.", category: "Animals", summary: "Cats" },
          ],
        },
        { text: "Wrote the cats page." },
        { text: "Saved that to [[cats]]." },
      ]),
    });

    const events: AgentEvent[] = [];
    engine.telemetry.subscribe((e) => events.push(e));

    await engine.run("today I adopted a cat, remember that");

    const starts = events.filter((e) => e.type === "agent-start");
    expect(starts.map((e) => e.agentId)).toEqual(["orchestrator", "curator"]);
    expect(starts[1]).toMatchObject({ parentRunId: starts[0]!.runId });
    engine.close();
  });

  it("never offers the conversation agent a write tool directly", async () => {
    const llm = recordingLlm([{ text: "hello" }]);
    const engine = await Engine.create(await makeCfg(), { llm });

    await engine.run("hi");

    const offered = llm.seen[0]!.tools!.map((t) => t.name);
    expect(offered).toContain("curate");
    expect(offered).not.toContain("write_wiki_page");
    engine.close();
  });

  it("remembers prior turns across calls", async () => {
    const llm = recordingLlm([{ text: "Noted." }, { text: "Blue." }]);
    const engine = await Engine.create(await makeCfg(), { llm });

    await engine.run("my name is kyan");
    await engine.run("and my favourite colour?");

    expect(llm.seen[1]!.messages).toContainEqual({ role: "user", content: "my name is kyan" });
    expect(llm.seen[1]!.messages.at(-1)).toEqual({
      role: "user",
      content: "and my favourite colour?",
    });
    engine.close();
  });

  it("answers without tools when the wiki is not involved", async () => {
    const engine = await Engine.create(await makeCfg(), {
      llm: scriptedLlm([{ text: "Hello." }]),
    });

    expect(await engine.run("hi there")).toBe("Hello.");
    expect(await engine.listPages()).toEqual([]);
    engine.close();
  });
  it("withholds the curate tool from a read-only request", async () => {
    const llm = recordingLlm([{ text: "I cannot write." }]);
    const engine = await Engine.create(await makeCfg(), { llm });

    await engine.run("save this for me", { readOnly: true });

    const offered = llm.seen[0]!.tools!.map((t) => t.name);
    expect(offered).not.toContain("curate");
    expect(offered).not.toContain("write_wiki_page");
    expect(offered).toContain("read_wiki_page");
    engine.close();
  });

  it("refuses curate to a read-only request that names it anyway", async () => {
    const cfg = await makeCfg();
    const llm = recordingLlm([
      { tool: ["curate", { material: "sneak this in" }] },
      { text: "I could not save that." },
    ]);
    const engine = await Engine.create(cfg, { llm });

    await engine.run("save this for me", { readOnly: true });

    const toolMsg = llm.seen[1]!.messages.find((m) => m.role === "tool");
    expect(toolMsg!.content).toMatch(/unknown tool|not available/i);
    expect(await engine.listPages()).toEqual([]);
    engine.close();
  });

  it("ask() is exactly a read-only run", async () => {
    const viaAsk = recordingLlm([{ text: "a" }]);
    const askEngine = await Engine.create(await makeCfg(), { llm: viaAsk });
    await askEngine.ask("what is a cat?");
    askEngine.close();

    const viaRun = recordingLlm([{ text: "a" }]);
    const runEngine = await Engine.create(await makeCfg(), { llm: viaRun });
    await runEngine.run("what is a cat?", { readOnly: true });
    runEngine.close();

    expect(viaAsk.seen[0]!.messages).toEqual(viaRun.seen[0]!.messages);
    expect(viaAsk.seen[0]!.tools).toEqual(viaRun.seen[0]!.tools);
  });

  it("ask() still writes nothing when the model reaches for curate", async () => {
    const engine = await Engine.create(await makeCfg(), {
      llm: scriptedLlm([
        { tool: ["curate", { material: "sneak this in" }] },
        { text: "could not" },
      ]),
    });

    await engine.ask("what is a cat?");

    expect(await engine.listPages()).toEqual([]);
    engine.close();
  });
  it("passes a maxSteps override down to the loop", async () => {
    // Calls a tool for as long as it is offered any, so the only thing that can
    // stop it is the step cap.
    const seen: ChatRequest[] = [];
    const llm: LlmClient = {
      chat: async (req) => {
        seen.push(structuredClone(req));
        return req.tools?.length
          ? { content: null, toolCalls: [{ id: "c", name: "read_wiki_index", arguments: {} }] }
          : { content: "Out of steps.", toolCalls: [] };
      },
    };
    const engine = await Engine.create(await makeCfg(), { llm });

    await engine.run("go", { maxSteps: 2 });

    // 2 tool-calling rounds, then the no-tools wrap-up call.
    expect(seen).toHaveLength(3);
    expect(seen[2]!.tools ?? []).toEqual([]);
    engine.close();
  });
});

describe("Engine role scoping", () => {
  it("withholds a page above the caller's role from getPage/listPages/search", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        {
          tool: [
            "write_wiki_page",
            { title: "Secrets", body: "top secret stuff", category: "Private", summary: "Shh" },
          ],
        },
        { text: "Stored." },
      ]),
    });
    await engine.ingest("secret stuff");

    expect(await engine.listPages({ role: "guest" })).toEqual([]);
    expect(await engine.listPages()).toEqual(["secrets"]);
    expect(await engine.getPage("secrets", { role: "guest" })).toBeNull();
    expect((await engine.getPage("secrets"))?.metadata.slug).toBe("secrets");
    expect((await engine.search("secret", { role: "guest" })).map((h) => h.slug)).not.toContain(
      "secrets",
    );
    engine.close();
  });

  it("keeps a guest-scoped run from reading an admin-only page even via tools", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        {
          tool: [
            "write_wiki_page",
            { title: "Secrets", body: "the launch code is 1234", category: "Private", summary: "Shh" },
          ],
        },
        { text: "Stored." },
      ]),
    });
    await engine.ingest("secret stuff");

    const guestRun = await Engine.create(cfg, {
      llm: scriptedLlm([
        { tool: ["search_wiki", { query: "secret" }] },
        { tool: ["read_wiki_page", { slug: "secrets" }] },
        { text: "I don't have anything on that." },
      ]),
    });

    const answer = await guestRun.ask("what's the launch code?", { caller: { role: "guest" } });
    expect(answer).not.toContain("1234");
    guestRun.close();
    engine.close();
  });
});

describe("Engine page browser/editor", () => {
  it("listPageSummaries reflects each page's role, category, and summary", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        {
          tool: [
            "write_wiki_page",
            { title: "Cats", body: "Cats nap a lot.", category: "Animals", summary: "About cats" },
          ],
        },
        { text: "Stored." },
      ]),
    });
    await engine.ingest("cat stuff");

    const summaries = await engine.listPageSummaries();
    expect(summaries).toEqual([
      expect.objectContaining({ slug: "cats", title: "Cats", category: "Animals", summary: "About cats" }),
    ]);
    expect(await engine.listPageSummaries({ role: "guest" })).toEqual([]);
    engine.close();
  });

  it("graph reads fresh from disk and excludes edges to pages the caller can't see", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: scriptedLlm([{ text: "unused" }]) });
    // Written directly, bypassing the agent — write_wiki_page has no role
    // field, so every curator-created page defaults to admin; this test
    // needs an explicit guest-role page to exercise the visibility split.
    await engine.savePageRaw("cats", "---\ntitle: Cats\nrole: guest\n---\nCats like [[boxes]] and [[secrets]].");
    // "boxes" is never created, "secrets" is admin-only — the graph should
    // only ever show edges to nodes that actually exist and are visible.
    await engine.savePageRaw("secrets", "---\ntitle: Secrets\nrole: admin\n---\nShh.");

    const adminGraph = await engine.graph();
    expect(adminGraph.nodes.map((n) => n.slug).sort()).toEqual(["cats", "secrets"]);
    expect(adminGraph.edges).toEqual([{ src: "cats", dst: "secrets" }]);

    const guestGraph = await engine.graph({ role: "guest" });
    expect(guestGraph.nodes.map((n) => n.slug)).toEqual(["cats"]);
    expect(guestGraph.edges).toEqual([]);
    engine.close();
  });

  it("savePageRaw writes and indexes a page directly, without going through the agent", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: scriptedLlm([{ text: "unused" }]) });

    const page = await engine.savePageRaw("cats", "---\ntitle: Cats\nrole: guest\n---\nCats nap.");

    expect(page.metadata.title).toBe("Cats");
    expect((await engine.getPage("cats"))?.body.trim()).toBe("Cats nap.");
    expect((await engine.listPageSummaries()).map((p) => p.slug)).toContain("cats");
    engine.close();
  });

  it("savePageRaw rejects invalid frontmatter with a descriptive error", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: scriptedLlm([{ text: "unused" }]) });

    await expect(engine.savePageRaw("cats", "---\nrole: admin\n---\nno title")).rejects.toThrow(/title/i);
    engine.close();
  });

  it("readGenerated returns index.md and log.md content after an ingest", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, {
      llm: scriptedLlm([
        {
          tool: [
            "write_wiki_page",
            { title: "Cats", body: "Cats nap.", category: "Animals", summary: "About cats" },
          ],
        },
        { text: "Stored." },
      ]),
    });
    await engine.ingest("cat stuff");

    expect(await engine.readGenerated("index")).toContain("[[cats]]");
    expect(await engine.readGenerated("log")).not.toBeNull();
    engine.close();
  });

  it("listRawSources and getRawSource expose the archived material an ingest created", async () => {
    const cfg = await makeCfg();
    const engine = await Engine.create(cfg, { llm: scriptedLlm([{ text: "nothing to store" }]) });
    await engine.ingest("a note about cats", { source: { origin: "api", kind: "text" } });

    const sources = await engine.listRawSources();
    expect(sources).toHaveLength(1);

    const { origin, id } = sources[0]!.metadata;
    const result = await engine.getRawSource(origin, id);
    expect(result?.content).toBe("a note about cats");
    expect(await engine.getRawSource(origin, "missing")).toBeNull();
    engine.close();
  });
});
