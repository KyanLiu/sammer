import { describe, it, expect } from "vitest";
import { buildServer } from "../src/app.js";
import { fakeDeps } from "./helpers.js";

describe("rate limiting", () => {
  it("allows requests within the configured limit", async () => {
    const app = await buildServer(fakeDeps(), { rateLimit: { max: 2, timeWindow: "1 minute" } });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
  });

  it("rejects requests once the configured limit is exceeded", async () => {
    const app = await buildServer(fakeDeps(), { rateLimit: { max: 2, timeWindow: "1 minute" } });

    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/health" });
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(429);
  });
});
