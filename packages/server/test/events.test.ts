import { describe, it, expect, afterEach, vi } from "vitest";
import type { AgentEvent } from "@sammer/shared";
import { openAuthDb } from "@sammer/core";
import { buildServer } from "../src/app.js";
import { fakeDeps, adminCookie } from "./helpers.js";

function fakeTelemetry() {
  const listeners = new Set<(event: AgentEvent) => void>();
  let unsubscribeCount = 0;
  return {
    telemetry: {
      subscribe(listener: (event: AgentEvent) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
          unsubscribeCount++;
        };
      },
    },
    emit(event: AgentEvent) {
      for (const listener of listeners) listener(event);
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
  };
}

function addressOf(app: Awaited<ReturnType<typeof buildServer>>): string {
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("server has no port");
  return `http://127.0.0.1:${address.port}`;
}

describe("GET /events", () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("streams telemetry events as SSE frames and unsubscribes on disconnect", async () => {
    const telemetry = fakeTelemetry();
    const authDb = openAuthDb(":memory:");
    app = await buildServer(fakeDeps({ telemetry: telemetry.telemetry }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await adminCookie(app, authDb);
    await app.listen({ port: 0, host: "127.0.0.1" });

    const controller = new AbortController();
    const res = await fetch(`${addressOf(app)}/events`, { signal: controller.signal, headers: { cookie } });
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();

    // The route sends an immediate handshake frame (under its own event
    // name, so default onmessage/`data:`-only consumers never see it) to
    // flush headers right away rather than leaving the client waiting on a
    // telemetry event that may never come.
    const handshake = await reader.read();
    expect(new TextDecoder().decode(handshake.value)).toBe("event: connected\ndata: null\n\n");

    const event: AgentEvent = { type: "agent-start", timestamp: 1, runId: "r1", agentId: "orchestrator" };
    telemetry.emit(event);

    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe(`data: ${JSON.stringify(event)}\n\n`);

    controller.abort();
    await vi.waitFor(() => expect(telemetry.unsubscribeCount).toBe(1));
  });
});
