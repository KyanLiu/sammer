import type { ModelMessage, ToolDef, ToolCall } from "@sammer/shared";

export interface ChatRequest {
  messages: ModelMessage[];
  tools?: ToolDef[];
  temperature?: number;
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface LlmClient {
  chat(req: ChatRequest): Promise<ChatResponse>;
  embed(texts: string[]): Promise<number[][]>;
}
