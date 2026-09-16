import { describe, it, expect } from "vitest";
import { openAuthDb } from "@sammer/core";
import { buildServer } from "../src/app.js";
import { fakeDeps, adminCookie } from "./helpers.js";
import type { Caller } from "@sammer/shared";

describe("GET /pages", () => {
  it("returns the slugs from listPages for an admin session", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ listPages: async () => ["cats", "boxes"] }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "GET", url: "/pages", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(["cats", "boxes"]);
  });

  it("passes the caller's resolved role through to listPages()", async () => {
    let seenCaller: Caller | undefined;
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(
      fakeDeps({
        listPages: async (caller) => {
          seenCaller = caller;
          return [];
        },
      }),
      { auth: { db: authDb, cookieSecret: "test-secret" } },
    );
    const cookie = await adminCookie(app, authDb);

    await app.inject({ method: "GET", url: "/pages", headers: { cookie } });

    expect(seenCaller?.role).toEqual("admin");
  });

  it("401s without a session", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "GET", url: "/pages" });

    expect(res.statusCode).toBe(401);
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
