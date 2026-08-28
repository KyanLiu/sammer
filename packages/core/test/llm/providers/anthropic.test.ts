import { describe, it, expect } from "vitest";
import { AnthropicLlmClient } from "../../../src/llm/providers/anthropic.js";

const cfg = { provider: "anthropic" as const, apiKey: "x", chatModel: "m", embedModel: "e", embedDim: 2 };

/** A stand-in for the Anthropic SDK that records the request and replays a canned response. */
function fakeAnthropic(response: any) {
  const calls: any[] = [];
  const client = { messages: { create: async (params: any) => (calls.push(params), response) } };
  return { client: client as any, calls };
}

const textOnly = { content: [{ type: "text", text: "hi" }], stop_reason: "end_turn" };

describe("AnthropicLlmClient", () => {
  it("maps content blocks into ChatResponse with tool calls", async () => {
    const { client } = fakeAnthropic({
      content: [
        { type: "text", text: "looking that up" },
        { type: "tool_use", id: "toolu_1", name: "search_wiki", input: { query: "cats" } },
      ],
      stop_reason: "tool_use",
    });
    const res = await new AnthropicLlmClient(cfg, client).chat({
      messages: [{ role: "user", content: "cats?" }],
    });
    expect(res.content).toBe("looking that up");
    expect(res.toolCalls).toEqual([
      { id: "toolu_1", name: "search_wiki", arguments: { query: "cats" } },
    ]);
  });

  it("returns null content when the model only calls tools", async () => {
    const { client } = fakeAnthropic({
      content: [{ type: "tool_use", id: "toolu_1", name: "read_index", input: {} }],
      stop_reason: "tool_use",
    });
    const res = await new AnthropicLlmClient(cfg, client).chat({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.content).toBeNull();
  });

  it("hoists system messages into the top-level system parameter", async () => {
    const { client, calls } = fakeAnthropic(textOnly);
    await new AnthropicLlmClient(cfg, client).chat({
      messages: [
        { role: "system", content: "you are sammer" },
        { role: "user", content: "hi" },
      ],
    });
    expect(calls[0].system).toBe("you are sammer");
    expect(calls[0].messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("joins several system messages into one prompt", async () => {
    const { client, calls } = fakeAnthropic(textOnly);
    await new AnthropicLlmClient(cfg, client).chat({
      messages: [
        { role: "system", content: "first" },
        { role: "system", content: "second" },
        { role: "user", content: "hi" },
      ],
    });
    expect(calls[0].system).toBe("first\n\nsecond");
  });

  it("omits the system field when there is no system message", async () => {
    const { client, calls } = fakeAnthropic(textOnly);
    await new AnthropicLlmClient(cfg, client).chat({
      messages: [{ role: "user", content: "hi" }],
    });
    expect("system" in calls[0]).toBe(false);
  });

  it("batches consecutive tool results into a single user turn", async () => {
    const { client, calls } = fakeAnthropic(textOnly);
    await new AnthropicLlmClient(cfg, client).chat({
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            { id: "t1", name: "read_index", arguments: {} },
            { id: "t2", name: "read_page", arguments: { slug: "cats" } },
          ],
        },
        { role: "tool", toolCallId: "t1", content: "index" },
        { role: "tool", toolCallId: "t2", content: "page" },
      ],
    });
    const [, assistant, results] = calls[0].messages;
    expect(assistant.content).toEqual([
      { type: "tool_use", id: "t1", name: "read_index", input: {} },
      { type: "tool_use", id: "t2", name: "read_page", input: { slug: "cats" } },
    ]);
    expect(calls[0].messages).toHaveLength(3);
    expect(results).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "index" },
        { type: "tool_result", tool_use_id: "t2", content: "page" },
      ],
    });
  });

  it("folds a user message that follows tool results into the same turn", async () => {
    const { client, calls } = fakeAnthropic(textOnly);
    await new AnthropicLlmClient(cfg, client).chat({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: null, toolCalls: [{ id: "t1", name: "read_index", arguments: {} }] },
        { role: "tool", toolCallId: "t1", content: "index" },
        { role: "user", content: "out of tool calls, answer now" },
      ],
    });
    expect(calls[0].messages).toHaveLength(3);
    expect(calls[0].messages[2].content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: "index" },
      { type: "text", text: "out of tool calls, answer now" },
    ]);
  });

  it("disables thinking and omits temperature unless one is given", async () => {
    const { client, calls } = fakeAnthropic(textOnly);
    const llm = new AnthropicLlmClient(cfg, client);
    await llm.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(calls[0].thinking).toEqual({ type: "disabled" });
    expect(calls[0].max_tokens).toBeGreaterThan(0);
    expect("temperature" in calls[0]).toBe(false);

    await llm.chat({ messages: [{ role: "user", content: "hi" }], temperature: 0.5 });
    expect(calls[1].temperature).toBe(0.5);
  });

  it("translates tool definitions into Anthropic's input_schema shape", async () => {
    const { client, calls } = fakeAnthropic(textOnly);
    await new AnthropicLlmClient(cfg, client).chat({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "read_page", description: "read one", parameters: { type: "object" } }],
    });
    expect(calls[0].tools).toEqual([
      { name: "read_page", description: "read one", input_schema: { type: "object" } },
    ]);
  });

  it("throws on a refusal rather than returning an empty answer", async () => {
    const { client } = fakeAnthropic({
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: "no" },
    });
    await expect(
      new AnthropicLlmClient(cfg, client).chat({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/refused/i);
  });
});
