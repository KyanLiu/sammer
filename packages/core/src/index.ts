// The public surface of the engine. Apps (server, cli) and integrations import
// from here only — they never reach into subpaths, so internals stay free to move.
export { Engine, type EngineOptions } from "./engine.js";
export { OpenAiLlmClient, AnthropicLlmClient } from "./llm/providers/index.js";
export { createLlmClient } from "./llm/factory.js";
export type { LlmClient, EmbeddingClient, ChatRequest, ChatResponse } from "./llm/client.js";

// Authoring custom tools: defineTool is the supported way to build one.
export { defineTool, type ToolSpec } from "./agent/define-tool.js";
export { ToolRegistry, type Tool, type ToolContext } from "./agent/registry.js";
export { WikiService, type SavePageInput } from "./wiki/service.js";
export { ASSIST_SYSTEM, CURATION_SYSTEM } from "./agent/loop.js";
