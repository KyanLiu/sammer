import { describe, it, expect } from "vitest";
import { OpenAiLlmClient } from "../../../src/llm/providers/openai.js";

const cfg = { provider: "openai" as const, apiKey: "x", chatModel: "m", embedModel: "e", embedDim: 2 };

/** A stand-in for the OpenAI SDK that records the request and replays a canned response. */
function fakeOpenAI(response: any) {
  const calls: any[] = [];
  const client = {
    chat: { completions: { create: async (params: any) => (calls.push(params), response) } },
    embeddings: { create: async () => ({ data: [{ embedding: [] }] }) },
  };
  return { client: client as any, calls };
}

const textOnly = { choices: [{ message: { content: "hi", tool_calls: undefined } }] };

describe("OpenAiLlmClient", () => {
  it("omits temperature unless one is given, since some models (e.g. gpt-5) reject any explicit value", async () => {
    const { client, calls } = fakeOpenAI(textOnly);
    const llm = new OpenAiLlmClient(cfg, client);

    await llm.chat({ messages: [{ role: "user", content: "hi" }] });
    expect("temperature" in calls[0]).toBe(false);

    await llm.chat({ messages: [{ role: "user", content: "hi" }], temperature: 0.5 });
    expect(calls[1].temperature).toBe(0.5);
  });

  it("maps an OpenAI chat completion into ChatResponse with tool calls", async () => {
    const fakeSdk = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      function: { name: "search_wiki", arguments: '{"query":"cats"}' },
                    },
                  ],
                },
              },
            ],
          }),
        },
      },
      embeddings: {
        create: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
      },
    };
    const client = new OpenAiLlmClient(
      { provider: "openai", baseUrl: "x", apiKey: "x", chatModel: "m", embedModel: "e", embedDim: 2 },
      fakeSdk as any,
    );
    const res = await client.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(res.content).toBeNull();
    expect(res.toolCalls).toEqual([
      { id: "call_1", name: "search_wiki", arguments: { query: "cats" } },
    ]);
    const emb = await client.embed(["hello"]);
    expect(emb).toEqual([[0.1, 0.2]]);
  });
});
