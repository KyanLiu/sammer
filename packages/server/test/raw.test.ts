import { describe, it, expect } from "vitest";
import { openAuthDb } from "@sammer/core";
import { buildServer } from "../src/app.js";
import { fakeDeps, adminCookie, sessionCookie, fakeSource } from "./helpers.js";

describe("GET /raw", () => {
  it("returns the raw archive listing for an admin session", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ listRawSources: async () => [fakeSource] }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "GET", url: "/raw", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([fakeSource]);
  });

  it("403s for a friend session", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps(), { auth: { db: authDb, cookieSecret: "test-secret" } });
    const cookie = await sessionCookie(app, authDb, "friend");

    const res = await app.inject({ method: "GET", url: "/raw", headers: { cookie } });

    expect(res.statusCode).toBe(403);
  });

  it("401s without a session", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "GET", url: "/raw" });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /raw/:origin/:id", () => {
  it("returns the source and content when it exists", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(
      fakeDeps({
        getRawSource: async (origin, id) =>
          origin === "api" && id === "src-1" ? { source: fakeSource, content: "hello" } : null,
      }),
      { auth: { db: authDb, cookieSecret: "test-secret" } },
    );
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "GET", url: "/raw/api/src-1", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ source: fakeSource, content: "hello" });
  });

  it("404s when it does not exist", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps(), { auth: { db: authDb, cookieSecret: "test-secret" } });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "GET", url: "/raw/api/missing", headers: { cookie } });

    expect(res.statusCode).toBe(404);
  });
});
