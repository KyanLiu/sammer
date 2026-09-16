import { describe, it, expect } from "vitest";
import { openAuthDb } from "@sammer/core";
import { buildServer } from "../src/app.js";
import { fakeDeps, fakeIngestResult, adminCookie } from "./helpers.js";

describe("POST /ingest", () => {
  it("ingests text using the deps' ingest()", async () => {
    const seen: { text?: string; source?: unknown } = {};
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(
      fakeDeps({
        ingest: async (text, opts) => {
          seen.text = text;
          seen.source = opts?.source;
          return fakeIngestResult("wrote a page");
        },
      }),
      { auth: { db: authDb, cookieSecret: "test-secret" } },
    );
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({
      method: "POST",
      url: "/ingest",
      headers: { cookie },
      payload: { text: "capybaras are large rodents" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(fakeIngestResult("wrote a page"));
    expect(seen.text).toBe("capybaras are large rodents");
    expect(seen.source).toBeUndefined();
  });

  it("passes source through when given", async () => {
    let seenSource: unknown;
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(
      fakeDeps({
        ingest: async (_text, opts) => {
          seenSource = opts?.source;
          return fakeIngestResult("ok");
        },
      }),
      { auth: { db: authDb, cookieSecret: "test-secret" } },
    );
    const cookie = await adminCookie(app, authDb);

    await app.inject({
      method: "POST",
      url: "/ingest",
      headers: { cookie },
      payload: { text: "t", source: { origin: "api", title: "note" } },
    });

    expect(seenSource).toEqual({ origin: "api", title: "note" });
  });

  it("400s when text is missing", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps(), { auth: { db: authDb, cookieSecret: "test-secret" } });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "POST", url: "/ingest", headers: { cookie }, payload: {} });

    expect(res.statusCode).toBe(400);
  });

  it("400s when source has no origin", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps(), { auth: { db: authDb, cookieSecret: "test-secret" } });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({
      method: "POST",
      url: "/ingest",
      headers: { cookie },
      payload: { text: "t", source: { title: "note" } },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /ingest access", () => {
  it("401s without a session", async () => {
    const app = await buildServer(fakeDeps());
    const res = await app.inject({ method: "POST", url: "/ingest", payload: { text: "hi" } });
    expect(res.statusCode).toBe(401);
  });

  it("200s for an admin session", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ ingest: async (t) => fakeIngestResult(`got: ${t}`) }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({
      method: "POST",
      url: "/ingest",
      headers: { cookie },
      payload: { text: "hi" },
    });

    expect(res.statusCode).toBe(200);
  });
});
