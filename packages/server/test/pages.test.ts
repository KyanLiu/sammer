import { describe, it, expect } from "vitest";
import { buildServer } from "../src/app.js";
import { fakeDeps } from "./helpers.js";

describe("GET /pages", () => {
  it("returns the slugs from listPages", async () => {
    const app = await buildServer(fakeDeps({ listPages: async () => ["cats", "boxes"] }));

    const res = await app.inject({ method: "GET", url: "/pages" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(["cats", "boxes"]);
  });
});

describe("GET /pages/:slug", () => {
  const page = {
    metadata: {
      id: "1",
      title: "Cats",
      category: "animals",
      tags: [],
      summary: "s",
      created: "now",
      updated: "now",
      slug: "cats",
      sources: [],
    },
    body: "About cats.",
    links: [],
  };

  it("returns the page when it exists", async () => {
    const app = await buildServer(fakeDeps({ getPage: async (slug) => (slug === "cats" ? page : null) }));

    const res = await app.inject({ method: "GET", url: "/pages/cats" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(page);
  });

  it("404s when the page does not exist", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "GET", url: "/pages/missing" });

    expect(res.statusCode).toBe(404);
  });
});
