import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { AgentEvent, ToolCall } from "@sammer/shared";

export class AgentTelemetry {
  private readonly active = new AsyncLocalStorage<string>();
  private readonly listeners = new Set<(event: AgentEvent) => void>();

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  async run(agentId: string, fn: () => Promise<string>): Promise<string> {
    const runId = randomUUID();
    const parentRunId = this.active.getStore();
    return this.active.run(runId, async () => {
      const startedAt = Date.now();
      this.emit({ type: "agent-start", timestamp: startedAt, runId, parentRunId, agentId });
      try {
        const output = await fn();
        this.emit({
          type: "agent-end",
          timestamp: Date.now(),
          runId,
          agentId,
          durationMs: Date.now() - startedAt,
          output,
        });
        return output;
      } catch (e) {
        this.emit({
          type: "agent-end",
          timestamp: Date.now(),
          runId,
          agentId,
          durationMs: Date.now() - startedAt,
          error: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    });
  }

  async tool(
    agentId: string,
    iteration: number,
    call: ToolCall,
    fn: () => Promise<string>,
  ): Promise<string> {
    const runId = this.active.getStore()!;
    const startedAt = Date.now();
    this.emit({
      type: "tool-start",
      timestamp: startedAt,
      runId,
      agentId,
      iteration,
      callId: call.id,
      name: call.name,
      args: call.arguments,
    });
    const result = await fn();
    this.emit({
      type: "tool-end",
      timestamp: Date.now(),
      runId,
      agentId,
      iteration,
      callId: call.id,
      name: call.name,
      result,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }
}
