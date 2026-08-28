import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("applies defaults and reads env overrides", () => {
    const cfg = loadConfig({
      LLM_API_KEY: "sk-test",
      LLM_BASE_URL: "http://localhost:4000/v1",
    });
    expect(cfg.llm.apiKey).toBe("sk-test");
    expect(cfg.llm.baseUrl).toBe("http://localhost:4000/v1");
    expect(cfg.llm.provider).toBe("openai"); // default
    // baseUrl and chatModel are provider-specific, so their defaults live in the
    // adapters rather than here; unset means "whatever this provider uses".
    expect(cfg.llm.chatModel).toBeUndefined();
    expect(cfg.llm.embedDim).toBe(1536); // default
    expect(cfg.dataDir).toBe("./data"); // default
  });

  it("reads the provider and rejects an unknown one", () => {
    expect(loadConfig({ LLM_API_KEY: "k", LLM_PROVIDER: "anthropic" }).llm.provider).toBe(
      "anthropic",
    );
    expect(() => loadConfig({ LLM_API_KEY: "k", LLM_PROVIDER: "gemini" })).toThrow();
  });

  it("throws when required api key is missing", () => {
    expect(() => loadConfig({})).toThrow(/LLM_API_KEY/);
  });
});
