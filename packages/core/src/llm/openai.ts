import OpenAI from "openai";
import type { Config, ModelMessage, ToolCall } from "@sammer/shared";
import type { LlmClient, ChatRequest, ChatResponse } from "./client.ts";

/** Translate sammer's ModelMessage[] into the OpenAI chat message wire format. */
function toOpenAIMessages(messages: ModelMessage[]): any[] {
  return messages.map((m) => {
    if (m.role === "assistant") {
      return {
        role: "assistant",
        content: m.content,
        tool_calls: m.toolCalls?.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: JSON.stringify(t.arguments) },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

/** OpenAI-compatible adapter implementing the LlmClient contract. */
export class OpenAiLlmClient implements LlmClient {
  constructor(
    private readonly cfg: Config["llm"],
    private readonly client: OpenAI = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl,
    }),
  ) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const completion = await this.client.chat.completions.create({
      model: this.cfg.chatModel,
      temperature: req.temperature ?? 0.2,
      messages: toOpenAIMessages(req.messages),
      tools: req.tools?.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    });
    const msg = completion.choices[0]!.message;
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || "{}"),
    }));
    return { content: msg.content ?? null, toolCalls };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({
      model: this.cfg.embedModel,
      input: texts,
    });
    return res.data.map((d: any) => d.embedding as number[]);
  }
}
