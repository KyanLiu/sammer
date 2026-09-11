import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { buildServer } from "../src/app.js";
import { fakeDeps } from "./helpers.js";

function captureStream(): { stream: Writable; lines: () => unknown[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines: () => chunks.map((c) => JSON.parse(c)) };
}

describe("request logging", () => {
  it("logs each request with a request id", async () => {
    const { stream, lines } = captureStream();
    const app = await buildServer(fakeDeps(), { logger: { stream } });

    await app.inject({ method: "GET", url: "/health" });

    const completed = lines().find((l: any) => l.msg === "request completed");
    expect(completed).toBeDefined();
    expect((completed as any).reqId).toBeDefined();
  });

  it("logs a thrown engine error through the request logger instead of the console", async () => {
    const { stream, lines } = captureStream();
    const app = await buildServer(
      fakeDeps({
        search: async () => {
          throw new Error("boom");
        },
      }),
      { logger: { stream } },
    );

    const res = await app.inject({ method: "GET", url: "/search?q=x" });

    expect(res.statusCode).toBe(500);
    const errorLine = lines().find((l: any) => l.level === 50);
    expect(errorLine).toBeDefined();
    expect((errorLine as any).reqId).toBeDefined();
  });
});
