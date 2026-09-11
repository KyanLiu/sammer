import { describe, it, expect } from "vitest";
import { buildServer } from "../src/app.js";
import { fakeDeps } from "./helpers.js";

describe("GET /search", () => {
  it("returns hits from the deps' search()", async () => {
    const hit = { slug: "cats", title: "Cats", score: 1.2, snippet: "About cats." };
    const app = await buildServer(fakeDeps({ search: async (q) => (q === "cats" ? [hit] : []) }));

    const res = await app.inject({ method: "GET", url: "/search?q=cats" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([hit]);
  });

  it("400s when q is missing", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "GET", url: "/search" });

    expect(res.statusCode).toBe(400);
  });

  it("400s when q is blank", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "GET", url: "/search?q=%20" });

    expect(res.statusCode).toBe(400);
  });
});
