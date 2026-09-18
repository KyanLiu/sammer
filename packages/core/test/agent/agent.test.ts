import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { Agent, asTool } from "../../src/agent/agent.js";
import { Memory } from "../../src/agent/memory.js";
import { ToolRegistry, type Tool } from "../../src/agent/registry.js";
import type { LlmClient, ChatRequest, ChatResponse } from "../../src/llm/client.js";
import type { AgentEvent } from "@sammer/shared";
import { AgentTelemetry } from "../../src/agent/telemetry.js";

// Agent is abstract only because CuratorAgent/OrchestratorAgent fix their own
// system prompt; there is no behavior left to override, so an empty subclass
// is enough to exercise the loop directly.
class TestAgent extends Agent {}

// A fake LLM that replays a fixed script of responses and records every request
// it was handed, so tests can assert on what the loop fed back to the model.
function scriptedLlm(script: ChatResponse[]): LlmClient & { seen: ChatRequest[] } {
  const seen: ChatRequest[] = [];
  let i = 0;
  return {
    seen,
    async chat(req) {
      seen.push(structuredClone(req));
      const res = script[i++];
      if (!res) throw new Error("scripted LLM ran out of responses");
      return res;
    },
    async embed() {
      return [[]];
    },
  };
}

function toolNamed(name: string, run: Tool["run"], mutates = false): Tool {
  return {
    def: { name, description: "d", parameters: { type: "object", properties: {} } },
    mutates,
    run,
  };
}

const TODAY = "2026-09-18";

// every system message is the shared date preamble followed by the agent's own prompt.
function withDate(system: string): string {
  return `Today's date is ${TODAY}.\n\n${system}`;
}

describe("Agent.run", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a tool call and feeds its result back to the model", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("search_wiki", async (args) => `RESULT for ${args.query}`));

    const llm = scriptedLlm([
      { content: null, toolCalls: [{ id: "c1", name: "search_wiki", arguments: { query: "cats" } }] },
      { content: "Cats are great.", toolCalls: [] },
    ]);

    const answer = await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "sys", registry }).run("tell me about cats");

    expect(answer).toBe("Cats are great.");
    expect(llm.seen).toHaveLength(2);

    // The conversation opens with the system prompt, then the user's question.
    expect(llm.seen[0]!.messages).toEqual([
      { role: "system", content: withDate("sys") },
      { role: "user", content: "tell me about cats" },
    ]);
    expect(llm.seen[0]!.tools).toEqual([
      { name: "search_wiki", description: "d", parameters: { type: "object", properties: {} } },
    ]);

    // The second call must carry the assistant's tool call and the tool's output.
    const second = llm.seen[1]!.messages;
    expect(second).toContainEqual({
      role: "tool",
      toolCallId: "c1",
      content: "RESULT for cats",
    });
  });

  it("emits telemetry events for each tool call and the run itself", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("search_wiki", async (args) => `RESULT for ${args.query}`));

    const llm = scriptedLlm([
      { content: null, toolCalls: [{ id: "c1", name: "search_wiki", arguments: { query: "cats" } }] },
      { content: "Cats are great.", toolCalls: [] },
    ]);

    const telemetry = new AgentTelemetry();
    const events: AgentEvent[] = [];
    telemetry.subscribe((e) => events.push(e));

    await new TestAgent({ id: "test-agent", llm, system: "sys", registry, telemetry }).run(
      "tell me about cats",
    );

    expect(events.map((e) => e.type)).toEqual(["agent-start", "tool-start", "tool-end", "agent-end"]);
    expect(events[0]).toMatchObject({ agentId: "test-agent", parentRunId: undefined });
    expect(events[1]).toMatchObject({
      agentId: "test-agent",
      iteration: 1,
      name: "search_wiki",
      args: { query: "cats" },
    });
    expect(events[2]).toMatchObject({
      agentId: "test-agent",
      iteration: 1,
      name: "search_wiki",
      result: "RESULT for cats",
    });
    expect(events[3]).toMatchObject({ agentId: "test-agent", output: "Cats are great." });

    const runId = events[0]!.runId;
    expect(events.every((e) => e.runId === runId)).toBe(true);
  });

  it("makes the model answer from what it has when it runs out of iterations", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("search_wiki", async () => "loop"));

    // Calls tools for as long as it is offered any. Withholding the tools is
    // what forces prose, so this stands in for a model that never stops.
    const seen: ChatRequest[] = [];
    const llm: LlmClient = {
      chat: async (req) => {
        seen.push(structuredClone(req));
        return req.tools?.length
          ? { content: null, toolCalls: [{ id: "c", name: "search_wiki", arguments: {} }] }
          : { content: "Partial, from what I gathered.", toolCalls: [] };
      },
      embed: async () => [[]],
    };

    const answer = await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "s", registry }).run("u", { maxIterations: 3 });

    expect(answer).toBe("Partial, from what I gathered.");
    // The wrap-up is not another iteration; the loop still ran exactly maxIterations times.
    expect(seen).toHaveLength(4);
    expect(seen[3]!.tools ?? []).toEqual([]);
  });

  it("falls back to a plain notice if the model has nothing to say either", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("search_wiki", async () => "loop"));

    let calls = 0;
    const llm: LlmClient = {
      chat: async () => {
        calls++;
        return { content: null, toolCalls: [{ id: "c", name: "search_wiki", arguments: {} }] };
      },
      embed: async () => [[]],
    };

    const answer = await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "s", registry }).run("u", { maxIterations: 3 });

    // 3 tool-calling rounds, plus the final no-tools call.
    expect(calls).toBe(4);
    expect(answer).toMatch(/iteration limit/i);
  });

  it("reports a throwing tool to the model instead of crashing", async () => {
    const registry = new ToolRegistry();
    registry.register(
      toolNamed("search_wiki", async () => {
        throw new Error("index unavailable");
      }),
    );

    const llm = scriptedLlm([
      { content: null, toolCalls: [{ id: "c1", name: "search_wiki", arguments: {} }] },
      { content: "I could not search just now.", toolCalls: [] },
    ]);

    const answer = await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "s", registry }).run("u");

    expect(answer).toBe("I could not search just now.");
    const toolMsg = llm.seen[1]!.messages.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ content: "Error: index unavailable" });
  });

  it("reports an unknown tool to the model instead of crashing", async () => {
    const registry = new ToolRegistry();

    const llm = scriptedLlm([
      { content: null, toolCalls: [{ id: "c1", name: "no_such_tool", arguments: {} }] },
      { content: "That tool does not exist.", toolCalls: [] },
    ]);

    const answer = await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "s", registry }).run("u");

    expect(answer).toBe("That tool does not exist.");
    const toolMsg = llm.seen[1]!.messages.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ content: 'Error: unknown tool "no_such_tool".' });
  });

  it("never offers mutating tools to a read-only agent", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("read_page", async () => "body"));
    registry.register(toolNamed("write_page", async () => "WROTE", true));

    const llm = scriptedLlm([{ content: "answer", toolCalls: [] }]);

    await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "s", registry }).run("u", { readOnly: true });

    expect(llm.seen[0]!.tools!.map((t) => t.name)).toEqual(["read_page"]);
  });

  it("refuses a mutating tool a read-only agent asks for anyway", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("write_page", async () => "WROTE", true));

    const llm = scriptedLlm([
      { content: null, toolCalls: [{ id: "c1", name: "write_page", arguments: {} }] },
      { content: "could not write", toolCalls: [] },
    ]);

    await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "s", registry }).run("u", { readOnly: true });

    const toolMsg = llm.seen[1]!.messages.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ content: expect.stringMatching(/not available/i) });
  });

  it("runs every tool call the model makes in one turn", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("read_page", async (args) => `body of ${args.slug}`));

    const llm = scriptedLlm([
      {
        content: null,
        toolCalls: [
          { id: "a", name: "read_page", arguments: { slug: "cats" } },
          { id: "b", name: "read_page", arguments: { slug: "boxes" } },
        ],
      },
      { content: "done", toolCalls: [] },
    ]);

    await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "s", registry }).run("u");

    const toolMsgs = llm.seen[1]!.messages.filter((m) => m.role === "tool");
    expect(toolMsgs).toEqual([
      { role: "tool", toolCallId: "a", content: "body of cats" },
      { role: "tool", toolCallId: "b", content: "body of boxes" },
    ]);
  });

  it("threads prior turns between the system prompt and the new question", async () => {
    const registry = new ToolRegistry();
    const llm = scriptedLlm([{ content: "Blue.", toolCalls: [] }]);

    await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "sys", registry }).run("and my favourite colour?", {
      context: [
        { role: "user", content: "my name is kyan" },
        { role: "assistant", content: "Noted." },
      ],
    });

    expect(llm.seen[0]!.messages).toEqual([
      { role: "system", content: withDate("sys") },
      { role: "user", content: "my name is kyan" },
      { role: "assistant", content: "Noted." },
      { role: "user", content: "and my favourite colour?" },
    ]);
  });

  it("starts from the system prompt alone when no history is given", async () => {
    const registry = new ToolRegistry();
    const llm = scriptedLlm([{ content: "hi", toolCalls: [] }]);

    await new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "sys", registry }).run("hello");

    expect(llm.seen[0]!.messages).toEqual([
      { role: "system", content: withDate("sys") },
      { role: "user", content: "hello" },
    ]);
  });

  it("remembers past turns across calls when given a Memory", async () => {
    const registry = new ToolRegistry();
    const llm = scriptedLlm([
      { content: "Noted.", toolCalls: [] },
      { content: "Blue.", toolCalls: [] },
    ]);
    const agent = new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "sys", registry, memory: new Memory() });

    await agent.run("my name is kyan");
    await agent.run("and my favourite colour?");

    expect(llm.seen[1]!.messages).toEqual([
      { role: "system", content: withDate("sys") },
      { role: "user", content: "my name is kyan" },
      { role: "assistant", content: "Noted." },
      { role: "user", content: "and my favourite colour?" },
    ]);
  });

  it("appends per-call context after remembered history rather than replacing it", async () => {
    const registry = new ToolRegistry();
    const llm = scriptedLlm([
      { content: "Noted.", toolCalls: [] },
      { content: "Blue.", toolCalls: [] },
    ]);
    const agent = new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "sys", registry, memory: new Memory() });

    await agent.run("my name is kyan");
    await agent.run("what's the weather like?", {
      context: [{ role: "user", content: "(aside: it is raining)" }],
    });

    expect(llm.seen[1]!.messages).toEqual([
      { role: "system", content: withDate("sys") },
      { role: "user", content: "my name is kyan" },
      { role: "assistant", content: "Noted." },
      { role: "user", content: "(aside: it is raining)" },
      { role: "user", content: "what's the weather like?" },
    ]);
  });

  it("lets a caller reset an agent's memory by clearing the Memory it was given", async () => {
    const registry = new ToolRegistry();
    const llm = scriptedLlm([
      { content: "Noted.", toolCalls: [] },
      { content: "Who?", toolCalls: [] },
    ]);
    const memory = new Memory();
    const agent = new TestAgent({ id: "test-agent", telemetry: new AgentTelemetry(), llm, system: "sys", registry, memory });

    await agent.run("my name is kyan");
    memory.clear();
    await agent.run("what's my name?");

    expect(llm.seen[1]!.messages).toEqual([
      { role: "system", content: withDate("sys") },
      { role: "user", content: "what's my name?" },
    ]);
  });
});

type Call = { message: string; signal?: AbortSignal };

function buildTestTool(summary = "Wrote the cats page.") {
  const calls: Call[] = [];
  const tool = asTool({
    name: "curate",
    description: "Fold information into the wiki.",
    mutates: true,
    schema: z.object({ material: z.string().min(1) }),
    toMessage: ({ material }) => material,
    run: async (message, opts) => {
      calls.push({ message, signal: opts.signal });
      return summary;
    },
  });
  return { tool, calls };
}

describe("asTool", () => {
  it("turns the parsed arguments into the message run() receives", async () => {
    const { tool, calls } = buildTestTool("Wrote the cats page.");

    const result = await tool.run({ material: "Cats nap a lot." }, {});

    expect(result).toBe("Wrote the cats page.");
    expect(calls).toEqual([{ message: "Cats nap a lot.", signal: undefined }]);
  });

  it("passes the caller's abort signal through to run()", async () => {
    const { tool, calls } = buildTestTool();
    const signal = AbortSignal.timeout(1000);

    await tool.run({ material: "m" }, { signal });

    expect(calls[0]!.signal).toBe(signal);
  });

  it("is refused under a read-only run when mutates is true", async () => {
    const { tool, calls } = buildTestTool();
    const registry = new ToolRegistry();
    registry.register(tool);

    expect(registry.defs({ readOnly: true })).toEqual([]);
    expect(await registry.invoke("curate", { material: "m" }, { readOnly: true })).toMatch(
      /not available/i,
    );
    expect(calls).toEqual([]);
  });

  it("rejects a call that fails the schema rather than calling run()", async () => {
    const { tool, calls } = buildTestTool();
    const registry = new ToolRegistry();
    registry.register(tool);

    expect(await registry.invoke("curate", {}, {})).toMatch(/invalid arguments/i);
    expect(await registry.invoke("curate", { material: "" }, {})).toMatch(/invalid arguments/i);
    expect(calls).toEqual([]);
  });
});
