import type { AgentEvent } from "@sammer/shared";

const MAX_INLINE_LENGTH = 40;

function formatValue(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= MAX_INLINE_LENGTH ? JSON.stringify(collapsed) : `${collapsed.length} chars`;
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(", ");
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function createTraceListener(out: (line: string) => void): (event: AgentEvent) => void {
  const depthOf = new Map<string, number>();
  const hasParentOf = new Map<string, boolean>();

  const print = (runId: string, agentId: string, text: string): void => {
    const depth = depthOf.get(runId) ?? 0;
    out(`${"  ".repeat(depth + 1)}${agentId}: ${text}`);
  };

  return (event) => {
    switch (event.type) {
      case "agent-start": {
        const depth = event.parentRunId !== undefined ? (depthOf.get(event.parentRunId) ?? 0) + 1 : 0;
        depthOf.set(event.runId, depth);
        hasParentOf.set(event.runId, event.parentRunId !== undefined);
        return;
      }
      case "tool-start":
        print(
          event.runId,
          event.agentId,
          `iteration ${event.iteration}: calling ${event.name}(${formatArgs(event.args)})`,
        );
        return;
      case "tool-end":
        print(
          event.runId,
          event.agentId,
          `iteration ${event.iteration}: ${event.name} → ${formatValue(event.result)} (${formatDuration(event.durationMs)})`,
        );
        return;
      case "agent-end": {
        const suffix = event.error
          ? `errored: ${event.error}`
          : hasParentOf.get(event.runId)
            ? `done (${formatDuration(event.durationMs)}): ${formatValue(event.output ?? "")}`
            : `done (${formatDuration(event.durationMs)})`;
        print(event.runId, event.agentId, suffix);
        depthOf.delete(event.runId);
        hasParentOf.delete(event.runId);
      }
    }
  };
}
