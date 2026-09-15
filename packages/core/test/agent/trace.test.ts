import { describe, it, expect } from "vitest";
import type { AgentEvent } from "@sammer/shared";
import { createTraceListener } from "../../src/agent/trace.js";

function run(events: AgentEvent[]): string[] {
  const lines: string[] = [];
  const listener = createTraceListener((line) => lines.push(line));
  for (const event of events) listener(event);
  return lines;
}

describe("createTraceListener", () => {
  it("indents a nested run, truncates long values, and suppresses the root's own output", () => {
    const events: AgentEvent[] = [
      { type: "agent-start", timestamp: 0, runId: "A", agentId: "orchestrator" },
      {
        type: "tool-start",
        timestamp: 1,
        runId: "A",
        agentId: "orchestrator",
        iteration: 1,
        callId: "c1",
        name: "search_wiki",
        args: { query: "server crash" },
      },
      {
        type: "tool-end",
        timestamp: 2,
        runId: "A",
        agentId: "orchestrator",
        iteration: 1,
        callId: "c1",
        name: "search_wiki",
        result: "3 hits",
        durationMs: 100,
      },
      {
        type: "tool-start",
        timestamp: 3,
        runId: "A",
        agentId: "orchestrator",
        iteration: 2,
        callId: "c2",
        name: "curate",
        args: { material: "x".repeat(50) },
      },
      { type: "agent-start", timestamp: 4, runId: "B", parentRunId: "A", agentId: "curator" },
      {
        type: "tool-start",
        timestamp: 5,
        runId: "B",
        agentId: "curator",
        iteration: 1,
        callId: "c3",
        name: "read_wiki_index",
        args: {},
      },
      {
        type: "tool-end",
        timestamp: 6,
        runId: "B",
        agentId: "curator",
        iteration: 1,
        callId: "c3",
        name: "read_wiki_index",
        result: "y".repeat(60),
        durationMs: 0,
      },
      {
        type: "agent-end",
        timestamp: 7,
        runId: "B",
        agentId: "curator",
        durationMs: 1400,
        output: "Updated the page.",
      },
      {
        type: "tool-end",
        timestamp: 8,
        runId: "A",
        agentId: "orchestrator",
        iteration: 2,
        callId: "c2",
        name: "curate",
        result: "Updated the page.",
        durationMs: 1600,
      },
      {
        type: "agent-end",
        timestamp: 9,
        runId: "A",
        agentId: "orchestrator",
        durationMs: 1600,
        output: "Some final answer the user already saw.",
      },
    ];

    expect(run(events)).toEqual([
      '  orchestrator: iteration 1: calling search_wiki(query: "server crash")',
      '  orchestrator: iteration 1: search_wiki → "3 hits" (0.1s)',
      "  orchestrator: iteration 2: calling curate(material: 50 chars)",
      "    curator: iteration 1: calling read_wiki_index()",
      "    curator: iteration 1: read_wiki_index → 60 chars (0.0s)",
      '    curator: done (1.4s): "Updated the page."',
      '  orchestrator: iteration 2: curate → "Updated the page." (1.6s)',
      "  orchestrator: done (1.6s)",
    ]);
  });

  it("reports an errored run instead of its (nonexistent) output", () => {
    const events: AgentEvent[] = [
      { type: "agent-start", timestamp: 0, runId: "A", agentId: "orchestrator" },
      {
        type: "tool-start",
        timestamp: 1,
        runId: "A",
        agentId: "orchestrator",
        iteration: 1,
        callId: "c1",
        name: "search_wiki",
        args: { query: "x" },
      },
      {
        type: "tool-end",
        timestamp: 2,
        runId: "A",
        agentId: "orchestrator",
        iteration: 1,
        callId: "c1",
        name: "search_wiki",
        result: "0 hits",
        durationMs: 5,
      },
      {
        type: "agent-end",
        timestamp: 3,
        runId: "A",
        agentId: "orchestrator",
        durationMs: 10,
        error: "model unavailable",
      },
    ];

    expect(run(events)).toEqual([
      '  orchestrator: iteration 1: calling search_wiki(query: "x")',
      '  orchestrator: iteration 1: search_wiki → "0 hits" (0.0s)',
      "  orchestrator: errored: model unavailable",
    ]);
  });
});
