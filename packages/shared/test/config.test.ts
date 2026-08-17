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
    expect(cfg.llm.chatModel).toBe("gpt-4o-mini"); // default
    expect(cfg.llm.embedDim).toBe(1536); // default
    expect(cfg.dataDir).toBe("./data"); // default
  });

  it("throws when required api key is missing", () => {
    expect(() => loadConfig({})).toThrow(/LLM_API_KEY/);
  });
});
