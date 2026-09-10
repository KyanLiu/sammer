import { describe, it, expect } from "vitest";
import type { AgentEvent } from "@sammer/shared";
import { AgentTelemetry } from "../../src/agent/telemetry.js";

function agentStarts(events: AgentEvent[]) {
  return events.filter(
    (e): e is Extract<AgentEvent, { type: "agent-start" }> => e.type === "agent-start",
  );
}

describe("AgentTelemetry.run", () => {
  it("emits agent-start then agent-end around the wrapped call", async () => {
    const telemetry = new AgentTelemetry();
    const events: AgentEvent[] = [];
    telemetry.subscribe((e) => events.push(e));

    const result = await telemetry.run("orchestrator", async () => "the answer");

    expect(result).toBe("the answer");
    expect(events.map((e) => e.type)).toEqual(["agent-start", "agent-end"]);
    expect(events[0]).toMatchObject({ agentId: "orchestrator", parentRunId: undefined });
    expect(events[1]).toMatchObject({ agentId: "orchestrator", output: "the answer" });
    expect(events[0]!.runId).toBe(events[1]!.runId);
  });

  it("links a run started inside another run's callback as its child", async () => {
    const telemetry = new AgentTelemetry();
    const events: AgentEvent[] = [];
    telemetry.subscribe((e) => events.push(e));

    await telemetry.run("orchestrator", async () => {
      await telemetry.run("curator", async () => "child answer");
      return "parent answer";
    });

    const starts = agentStarts(events);
    expect(starts.map((e) => e.agentId)).toEqual(["orchestrator", "curator"]);
    expect(starts[0]!.parentRunId).toBeUndefined();
    expect(starts[1]!.parentRunId).toBe(starts[0]!.runId);
  });

  it("emits agent-end with the error and still rethrows when the run throws", async () => {
    const telemetry = new AgentTelemetry();
    const events: AgentEvent[] = [];
    telemetry.subscribe((e) => events.push(e));

    await expect(
      telemetry.run("orchestrator", async () => {
        throw new Error("model unavailable");
      }),
    ).rejects.toThrow("model unavailable");

    expect(events.map((e) => e.type)).toEqual(["agent-start", "agent-end"]);
    expect(events[1]).toMatchObject({ error: "model unavailable" });
  });

  it("keeps concurrent runs' parentRunId independent of each other", async () => {
    const telemetry = new AgentTelemetry();
    const events: AgentEvent[] = [];
    telemetry.subscribe((e) => events.push(e));

    await Promise.all([
      telemetry.run("branch-a", async () => {
        await telemetry.run("branch-a-child", async () => "a-child");
        return "a";
      }),
      telemetry.run("branch-b", async () => {
        await telemetry.run("branch-b-child", async () => "b-child");
        return "b";
      }),
    ]);

    const starts = agentStarts(events);
    const rootA = starts.find((e) => e.agentId === "branch-a")!;
    const childA = starts.find((e) => e.agentId === "branch-a-child")!;
    const rootB = starts.find((e) => e.agentId === "branch-b")!;
    const childB = starts.find((e) => e.agentId === "branch-b-child")!;

    expect(childA.parentRunId).toBe(rootA.runId);
    expect(childB.parentRunId).toBe(rootB.runId);
    expect(childA.parentRunId).not.toBe(childB.parentRunId);
  });

  it("stops delivering events to a listener that has unsubscribed", async () => {
    const telemetry = new AgentTelemetry();
    const events: AgentEvent[] = [];
    const unsubscribe = telemetry.subscribe((e) => events.push(e));

    await telemetry.run("a", async () => "one");
    unsubscribe();
    await telemetry.run("a", async () => "two");

    expect(events).toHaveLength(2);
  });
});

describe("AgentTelemetry.tool", () => {
  it("emits tool-start/tool-end with the enclosing run's id, passing args/result through raw", async () => {
    const telemetry = new AgentTelemetry();
    const events: AgentEvent[] = [];
    telemetry.subscribe((e) => events.push(e));

    await telemetry.run("orchestrator", async () => {
      const result = await telemetry.tool(
        "orchestrator",
        1,
        { id: "c1", name: "search_wiki", arguments: { query: "cats" } },
        async () => "3 hits",
      );
      expect(result).toBe("3 hits");
      return "done";
    });

    const [start, toolStart, toolEnd, end] = events;
    expect(toolStart).toMatchObject({
      type: "tool-start",
      agentId: "orchestrator",
      iteration: 1,
      callId: "c1",
      name: "search_wiki",
      args: { query: "cats" },
    });
    expect(toolEnd).toMatchObject({
      type: "tool-end",
      agentId: "orchestrator",
      iteration: 1,
      callId: "c1",
      name: "search_wiki",
      result: "3 hits",
    });
    expect(toolStart!.runId).toBe(start!.runId);
    expect(toolEnd!.runId).toBe(end!.runId);
  });
});
