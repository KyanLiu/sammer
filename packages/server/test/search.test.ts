import { describe, it, expect } from "vitest";
import { openAuthDb } from "@sammer/core";
import { buildServer } from "../src/app.js";
import { fakeDeps, adminCookie } from "./helpers.js";
import type { Caller } from "@sammer/shared";

describe("GET /search", () => {
  it("returns hits from the deps' search() for an admin session", async () => {
    const hit = { slug: "cats", title: "Cats", score: 1.2, snippet: "About cats." };
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ search: async (q) => (q === "cats" ? [hit] : []) }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "GET", url: "/search?q=cats", headers: { cookie } });

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

  it("401s without a session", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "GET", url: "/search?q=cats" });

    expect(res.statusCode).toBe(401);
  });

  it("passes the caller's resolved role through to search()", async () => {
    let seenCaller: Caller | undefined;
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(
      fakeDeps({
        search: async (_q, caller) => {
          seenCaller = caller;
          return [];
        },
      }),
      { auth: { db: authDb, cookieSecret: "test-secret" } },
    );
    const cookie = await adminCookie(app, authDb);

    await app.inject({ method: "GET", url: "/search?q=cats", headers: { cookie } });

    expect(seenCaller?.role).toEqual("admin");
  });
});
