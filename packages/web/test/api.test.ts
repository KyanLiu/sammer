import { afterEach, describe, expect, it, vi } from "vitest";
import { ask, ingestText, login, logout, me } from "../src/api.js";

describe("baseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("honors an explicitly-set empty VITE_SERVER_URL instead of falling back to /api", async () => {
    vi.stubEnv("VITE_SERVER_URL", "");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => ({ role: "guest" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledWith("/auth/logout", { method: "POST", credentials: "include" });
  });
});

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

function sseResponse(chunks: string[]) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/event-stream" : null) },
    body: sseBody(chunks),
  };
}

describe("ask", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the question to /api/ask, asking for an SSE response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => ({ answer: "The pricing sheet still hasn't gone out." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ask("What am I forgetting?");

    expect(result).toBe("The pricing sheet still hasn't gone out.");
    expect(fetchMock).toHaveBeenCalledWith("/api/ask", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ question: "What am I forgetting?" }),
    });
  });

  it("falls back to a plain JSON body when the server doesn't answer with SSE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => null },
        json: async () => ({ answer: "plain answer" }),
      }),
    );

    await expect(ask("hello")).resolves.toBe("plain answer");
  });

  it("reads the answer out of an SSE stream, ignoring the leading ack and any heartbeats", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          "event: ack\ndata: null\n\n",
          ": heartbeat\n\n",
          `event: answer\ndata: ${JSON.stringify({ answer: "a cat is a small domesticated carnivore" })}\n\n`,
        ]),
      ),
    );

    await expect(ask("what is a cat?")).resolves.toBe("a cat is a small domesticated carnivore");
  });

  it("reassembles a frame split across multiple stream chunks", async () => {
    const frame = `event: answer\ndata: ${JSON.stringify({ answer: "reassembled" })}\n\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse(["event: ack\ndata: null\n\n", frame.slice(0, 10), frame.slice(10)])),
    );

    await expect(ask("split?")).resolves.toBe("reassembled");
  });

  it("rejects with the message from an SSE error frame", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          "event: ack\ndata: null\n\n",
          `event: error\ndata: ${JSON.stringify({ message: "the model is unreachable" })}\n\n`,
        ]),
      ),
    );

    await expect(ask("hello")).rejects.toThrow("the model is unreachable");
  });

  it("rejects if the SSE stream ends without ever sending an answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(["event: ack\ndata: null\n\n"])));

    await expect(ask("hello")).rejects.toThrow(/ended without an answer/);
  });

  it("throws with the status when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" }),
    );

    await expect(ask("hello")).rejects.toThrow("ask failed: 500 Internal Server Error");
  });
});

describe("login / logout / me", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login posts credentials and returns the session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => ({ email: "a@example.com", role: "member" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await login("a@example.com", "hunter2");

    expect(result).toEqual({ email: "a@example.com", role: "member" });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "hunter2" }),
    });
  });

  it("logout posts to /api/auth/logout with credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST", credentials: "include" });
  });

  it("me returns guest when unauthenticated", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => ({ role: "guest" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await me();

    expect(result).toEqual({ role: "guest" });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" });
  });
});

describe("ingestText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts text with no source when none is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => ({ summary: "added a page", skipped: false, curated: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ingestText("some content");

    expect(result).toEqual({ summary: "added a page", skipped: false, curated: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/ingest", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "some content", source: undefined }),
    });
  });

  it("posts the source object when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => null },
      json: async () => ({ summary: "already archived", skipped: true, curated: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await ingestText("dup content", { origin: "web-ui", title: "My note" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ingest",
      expect.objectContaining({
        body: JSON.stringify({ text: "dup content", source: { origin: "web-ui", title: "My note" } }),
      }),
    );
  });

  it("throws with the server's error message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "text is required" }),
      }),
    );

    await expect(ingestText("")).rejects.toThrow("text is required");
  });
});
