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
});
