import { describe, it, expect } from "vitest";
import { runAgent } from "../../src/agent/loop.js";
import { ToolRegistry, type Tool } from "../../src/agent/registry.js";
import type { LlmClient, ChatRequest, ChatResponse } from "../../src/llm/client.js";

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

describe("runAgent", () => {
  it("runs a tool call and feeds its result back to the model", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("search_wiki", async (args) => `RESULT for ${args.query}`));

    const llm = scriptedLlm([
      { content: null, toolCalls: [{ id: "c1", name: "search_wiki", arguments: { query: "cats" } }] },
      { content: "Cats are great.", toolCalls: [] },
    ]);

    const res = await runAgent({ llm, registry, system: "sys", user: "tell me about cats" });

    expect(res.answer).toBe("Cats are great.");
    expect(res.steps).toBe(2);

    // The conversation opens with the system prompt, then the user's question.
    expect(llm.seen[0]!.messages).toEqual([
      { role: "system", content: "sys" },
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

  it("makes the model answer from what it has when it runs out of steps", async () => {
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

    const res = await runAgent({ llm, registry, system: "s", user: "u", maxSteps: 3 });

    expect(res.answer).toBe("Partial, from what I gathered.");
    // The wrap-up is not another step; the loop still ran exactly maxSteps times.
    expect(res.steps).toBe(3);
    expect(seen).toHaveLength(4);
    expect(seen[3]!.tools ?? []).toEqual([]);
  });

  it("falls back to a plain notice if the model has nothing to say either", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("search_wiki", async () => "loop"));

    const llm: LlmClient = {
      chat: async () => ({
        content: null,
        toolCalls: [{ id: "c", name: "search_wiki", arguments: {} }],
      }),
      embed: async () => [[]],
    };

    const res = await runAgent({ llm, registry, system: "s", user: "u", maxSteps: 3 });

    expect(res.steps).toBe(3);
    expect(res.answer).toMatch(/step limit/i);
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

    const res = await runAgent({ llm, registry, system: "s", user: "u" });

    expect(res.answer).toBe("I could not search just now.");
    const toolMsg = llm.seen[1]!.messages.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ content: "Error: index unavailable" });
  });

  it("reports an unknown tool to the model instead of crashing", async () => {
    const registry = new ToolRegistry();

    const llm = scriptedLlm([
      { content: null, toolCalls: [{ id: "c1", name: "no_such_tool", arguments: {} }] },
      { content: "That tool does not exist.", toolCalls: [] },
    ]);

    const res = await runAgent({ llm, registry, system: "s", user: "u" });

    expect(res.answer).toBe("That tool does not exist.");
    const toolMsg = llm.seen[1]!.messages.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ content: 'Error: unknown tool "no_such_tool".' });
  });

  it("never offers mutating tools to a read-only run", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("read_page", async () => "body"));
    registry.register(toolNamed("write_page", async () => "WROTE", true));

    const llm = scriptedLlm([{ content: "answer", toolCalls: [] }]);

    await runAgent({ llm, registry, system: "s", user: "u", readOnly: true });

    expect(llm.seen[0]!.tools!.map((t) => t.name)).toEqual(["read_page"]);
  });

  it("refuses a mutating tool a read-only run asks for anyway", async () => {
    const registry = new ToolRegistry();
    registry.register(toolNamed("write_page", async () => "WROTE", true));

    const llm = scriptedLlm([
      { content: null, toolCalls: [{ id: "c1", name: "write_page", arguments: {} }] },
      { content: "could not write", toolCalls: [] },
    ]);

    await runAgent({ llm, registry, system: "s", user: "u", readOnly: true });

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

    await runAgent({ llm, registry, system: "s", user: "u" });

    const toolMsgs = llm.seen[1]!.messages.filter((m) => m.role === "tool");
    expect(toolMsgs).toEqual([
      { role: "tool", toolCallId: "a", content: "body of cats" },
      { role: "tool", toolCallId: "b", content: "body of boxes" },
    ]);
  });
});
