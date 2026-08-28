import type { Config } from "@sammer/shared";
import type { LlmClient } from "./client.js";
import { PROVIDERS } from "./providers/index.js";

export function createLlmClient(cfg: Config["llm"]): LlmClient {
  return PROVIDERS[cfg.provider](cfg);
}
