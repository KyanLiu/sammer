import { describe, it, expect } from "vitest";
import { buildServer } from "../src/app.js";
import { fakeDeps } from "./helpers.js";

describe("security headers", () => {
  it("sets standard security headers on every response", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("does not add CORS headers by default (same-origin only)", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example.com" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("treats an empty-string corsOrigin the same as unset instead of erroring", async () => {
    const app = await buildServer(fakeDeps(), { corsOrigin: "" });

    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example.com" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
