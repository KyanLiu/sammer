import type { z } from "zod";
import type { ModelMessage } from "@sammer/shared";
import type { LlmClient } from "../llm/client.js";
import type { ToolRegistry, Tool, ToolContext } from "./registry.js";
import { defineTool } from "./define-tool.js";
import type { Memory } from "./memory.js";

export interface BridgeSpec<S extends z.ZodType> {
  name: string;
  description: string;
  mutates: boolean;
  schema: S;
  toMessage: (args: z.infer<S>) => string;
  run: (message: string, opts: { signal?: AbortSignal }) => Promise<string>;
}

// converts agent or tool into a tool format for agents to use under a single tool registry interface
export function asTool<S extends z.ZodType>(spec: BridgeSpec<S>): Tool {
  return defineTool({
    name: spec.name,
    description: spec.description,
    mutates: spec.mutates,
    schema: spec.schema,
    run: (args, ctx) => spec.run(spec.toMessage(args), { signal: ctx.signal }),
  });
}

const DEFAULT_MAX_ITERATIONS = 8;

// agent initialization config
export interface AgentConfig {
  llm: LlmClient;
  system: string;
  registry: ToolRegistry;
  memory?: Memory;
  maxIterations?: number;
}
// run-time agent call options
export interface AgentRunOptions {
  context?: ModelMessage[];
  maxIterations?: number;
  readOnly?: boolean;
  signal?: AbortSignal;
}

// Abstracted agent class
export abstract class Agent {
  private readonly llm: LlmClient;
  private readonly system: string;
  private readonly registry: ToolRegistry;
  private readonly memory: Memory | undefined;
  private readonly maxIterations: number;

  constructor(config: AgentConfig) {
    this.llm = config.llm;
    this.system = config.system;
    this.registry = config.registry;
    this.memory = config.memory;
    this.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  }

  async run(user: string, opts: AgentRunOptions = {}): Promise<string> {
    const readOnly = opts.readOnly;
    const maxIterations = opts.maxIterations ?? this.maxIterations;
    const ctx: ToolContext = { readOnly, signal: opts.signal };

    const history = [...(this.memory?.get() ?? []), ...(opts.context ?? [])];
    const messages: ModelMessage[] = [
      { role: "system", content: this.system },
      ...history,
      { role: "user", content: user },
    ];

    let iterations = 0;
    let answer: string | undefined;
    while (iterations < maxIterations) {
      iterations++;
      const res = await this.llm.chat({ messages, tools: this.registry.defs({ readOnly }) });

      if (res.toolCalls.length === 0) {
        answer = res.content ?? "";
        break;
      }

      messages.push({ role: "assistant", content: res.content, toolCalls: res.toolCalls });
      for (const call of res.toolCalls) {
        // invoke never throws: a failed tool is a message the model can react to.
        const content = await this.registry.invoke(call.name, call.arguments, ctx);
        messages.push({ role: "tool", toolCallId: call.id, content });
      }
    }

    if (answer === undefined) {
      // reached max iterations, return a result based on the context reached
      messages.push({
        role: "user",
        content:
          "You have used all of your tool calls. Answer now using only what you have already " +
          "gathered, and say plainly which part you could not finish.",
      });
      const final = await this.llm.chat({ messages });
      answer = final.content?.trim() || "Reached the iteration limit before finishing.";
    }

    this.memory?.append({ role: "user", content: user }, { role: "assistant", content: answer });
    return answer;
  }
}
