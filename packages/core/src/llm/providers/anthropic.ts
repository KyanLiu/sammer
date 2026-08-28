import Anthropic from "@anthropic-ai/sdk";
import type { Config, ModelMessage, ToolCall } from "@sammer/shared";
import type { ChatRequest, ChatResponse, LlmClient } from "../client.js";
import { splitSystem } from "../messages.js";

const DEFAULT_CHAT_MODEL = "claude-opus-5";
const DEFAULT_MAX_TOKENS = 16_000;

function toAnthropicMessages(messages: ModelMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      const result: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
      };
      // Every result answering one assistant turn belongs in a single user turn,
      // but the agent loop appends them one message at a time.
      const prev = out.at(-1);
      if (prev?.role === "user" && Array.isArray(prev.content)) prev.content.push(result);
      else out.push({ role: "user", content: [result] });
      continue;
    }
    if (m.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const call of m.toolCalls ?? []) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
      }
      out.push({ role: "assistant", content });
      continue;
    }
    // Same reason as the tool results: the turn a batch of them opened stays one
    // turn, so a following user message joins it instead of starting a second.
    const prev = out.at(-1);
    if (prev?.role === "user" && Array.isArray(prev.content)) {
      prev.content.push({ type: "text", text: m.content });
    } else {
      out.push({ role: "user", content: m.content });
    }
  }
  return out;
}

export class AnthropicLlmClient implements LlmClient {
  constructor(
    private readonly cfg: Config["llm"],
    private readonly client: Anthropic = new Anthropic({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl,
    }),
  ) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { system, rest } = splitSystem(req.messages);
    const message = await this.client.messages.create({
      model: this.cfg.chatModel ?? DEFAULT_CHAT_MODEL,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
      thinking: { type: "disabled" },
      ...(system.length ? { system: system.join("\n\n") } : {}),
      messages: toAnthropicMessages(rest),
      tools: req.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      })),
    });

    if (message.stop_reason === "refusal") {
      const detail = message.stop_details?.explanation ?? message.stop_details?.category ?? "";
      throw new Error(`Anthropic refused the request${detail ? `: ${detail}` : ""}`);
    }

    const text: string[] = [];
    const toolCalls: ToolCall[] = [];
    for (const block of message.content) {
      if (block.type === "text") text.push(block.text);
      else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    return { content: text.join("") || null, toolCalls };
  }
}
