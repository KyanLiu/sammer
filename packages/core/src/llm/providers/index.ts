import type { Config, LlmProvider } from "@sammer/shared";
import type { LlmClient } from "../client.js";
import { AnthropicLlmClient } from "./anthropic.js";
import { OpenAiLlmClient } from "./openai.js";

export { AnthropicLlmClient } from "./anthropic.js";
export { OpenAiLlmClient } from "./openai.js";


export const PROVIDERS: Record<LlmProvider, (cfg: Config["llm"]) => LlmClient> = {
  anthropic: (cfg) => new AnthropicLlmClient(cfg),
  openai: (cfg) => new OpenAiLlmClient(cfg),
};
