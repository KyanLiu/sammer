import { describe, it, expect } from "vitest";
import { OpenAiLlmClient } from "../../../src/llm/providers/openai.js";

describe("OpenAiLlmClient", () => {
  it("maps an OpenAI chat completion into ChatResponse with tool calls", async () => {
    const fakeOpenAI = {
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
      fakeOpenAI as any,
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
