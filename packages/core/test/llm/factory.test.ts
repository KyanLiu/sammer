import { describe, it, expect } from "vitest";
import { LLM_PROVIDERS, type Config } from "@sammer/shared";
import { createLlmClient } from "../../src/llm/factory.js";
import { PROVIDERS } from "../../src/llm/providers/index.js";
import { OpenAiLlmClient } from "../../src/llm/providers/openai.js";
import { AnthropicLlmClient } from "../../src/llm/providers/anthropic.js";

function cfg(provider: Config["llm"]["provider"]): Config["llm"] {
  return { provider, apiKey: "x", embedModel: "e", embedDim: 2 };
}

describe("createLlmClient", () => {
  it("builds the adapter for the configured provider", () => {
    expect(createLlmClient(cfg("openai"))).toBeInstanceOf(OpenAiLlmClient);
    expect(createLlmClient(cfg("anthropic"))).toBeInstanceOf(AnthropicLlmClient);
  });

  it("registers every provider the config accepts", () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...LLM_PROVIDERS].sort());
  });
});
