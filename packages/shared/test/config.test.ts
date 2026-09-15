import { describe, it, expect } from "vitest";
import { isAbsolute, join } from "node:path";
import { loadConfig } from "../src/config.js";
import { findWorkspaceRoot } from "../src/env.js";

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
  });

  it("defaults dataDir to the workspace root's data/, not process.cwd()", () => {
    // A relative "./data" default silently pointed at a different, empty
    // directory whenever a caller (pnpm --filter runs the server's script
    // with its cwd set to packages/server, not the repo root) had a cwd
    // other than the workspace root. Anchoring to the workspace root makes
    // this correct regardless of where the process was launched from.
    const cfg = loadConfig({ LLM_API_KEY: "sk-test" });
    expect(isAbsolute(cfg.dataDir)).toBe(true);
    expect(cfg.dataDir).toBe(join(findWorkspaceRoot(), "data"));
  });

  it("still honors an explicit DATA_DIR override as-is", () => {
    const cfg = loadConfig({ LLM_API_KEY: "sk-test", DATA_DIR: "./custom-data" });
    expect(cfg.dataDir).toBe("./custom-data");
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
