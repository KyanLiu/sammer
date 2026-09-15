import { describe, it, expect, afterEach } from "vitest";
import { buildServer } from "../src/app.js";
import { fakeDeps } from "./helpers.js";

function addressOf(app: Awaited<ReturnType<typeof buildServer>>): string {
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("server has no port");
  return `http://127.0.0.1:${address.port}`;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Reads one `\n\n`-delimited SSE frame, buffering across chunk boundaries. */
function frameReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async next(): Promise<string> {
      let sep;
      while ((sep = buffer.indexOf("\n\n")) === -1) {
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended before a full frame arrived");
        buffer += decoder.decode(value, { stream: true });
      }
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      return frame;
    },
  };
}

describe("POST /ask", () => {
  it("answers using the deps' ask()", async () => {
    const app = await buildServer(
      fakeDeps({ ask: async (question) => `answer to: ${question}` }),
    );

    const res = await app.inject({ method: "POST", url: "/ask", payload: { question: "what is a cat?" } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ answer: "answer to: what is a cat?" });
  });

  it("400s when question is missing", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "POST", url: "/ask", payload: {} });

    expect(res.statusCode).toBe(400);
  });

  it("400s when question is blank", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "POST", url: "/ask", payload: { question: "   " } });

    expect(res.statusCode).toBe(400);
  });

  it("passes maxSteps through when given", async () => {
    let seen: number | undefined;
    const app = await buildServer(
      fakeDeps({
        ask: async (_question, opts) => {
          seen = opts?.maxSteps;
          return "ok";
        },
      }),
    );

    await app.inject({ method: "POST", url: "/ask", payload: { question: "q", maxSteps: 4 } });

    expect(seen).toBe(4);
  });

  describe("when the client negotiates SSE", () => {
    let app: Awaited<ReturnType<typeof buildServer>> | undefined;

    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    it("commits the SSE response before ask() resolves, so a slow answer can't be mistaken for a dead connection", async () => {
      const slow = deferred<string>();
      app = await buildServer(fakeDeps({ ask: async () => slow.promise }));
      await app.listen({ port: 0, host: "127.0.0.1" });

      const res = await fetch(`${addressOf(app)}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ question: "what is a cat?" }),
      });

      // Headers (and so the SSE heartbeat that keeps the socket from being
      // reaped as idle) must already be committed here, well before ask()
      // has resolved — that ordering is the entire point of the SSE path.
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const frames = frameReader(res.body!);
      const ack = await frames.next();
      expect(ack).toBe("event: ack\ndata: null");

      slow.resolve("a cat is a small domesticated carnivore");

      const frame = await frames.next();
      expect(frame).toBe(`event: answer\ndata: ${JSON.stringify({ answer: "a cat is a small domesticated carnivore" })}`);
    });

    it("delivers a failure as an error frame instead of dropping the connection", async () => {
      app = await buildServer(
        fakeDeps({
          ask: async () => {
            throw new Error("the model is unreachable");
          },
        }),
      );
      await app.listen({ port: 0, host: "127.0.0.1" });

      const res = await fetch(`${addressOf(app)}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ question: "what is a cat?" }),
      });

      const frames = frameReader(res.body!);
      await frames.next(); // the leading ack frame
      const frame = await frames.next();
      expect(frame).toBe(`event: error\ndata: ${JSON.stringify({ message: "the model is unreachable" })}`);
    });

    it("still 400s invalid bodies as plain JSON, not SSE", async () => {
      app = await buildServer(fakeDeps());
      await app.listen({ port: 0, host: "127.0.0.1" });

      const res = await fetch(`${addressOf(app)}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).not.toContain("text/event-stream");
    });
  });
});
