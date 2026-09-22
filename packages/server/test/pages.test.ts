import { describe, it, expect } from "vitest";
import { openAuthDb } from "@sammer/core";
import { buildServer } from "../src/app.js";
import { fakeDeps, adminCookie, sessionCookie } from "./helpers.js";
import type { Caller } from "@sammer/shared";

const summary = {
  slug: "cats",
  title: "Cats",
  category: "Animals",
  summary: "About cats.",
  role: "guest" as const,
  updated: "now",
};

describe("GET /pages", () => {
  it("returns summaries from listPageSummaries for a signed-in session", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ listPageSummaries: async () => [summary] }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "GET", url: "/pages", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([summary]);
  });

  it("passes the caller's resolved role through to listPageSummaries()", async () => {
    let seenCaller: Caller | undefined;
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(
      fakeDeps({
        listPageSummaries: async (caller) => {
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

  it("200s for a friend session, not just admin", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ listPageSummaries: async () => [summary] }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await sessionCookie(app, authDb, "friend");

    const res = await app.inject({ method: "GET", url: "/pages", headers: { cookie } });

    expect(res.statusCode).toBe(200);
  });

  it("401s without a session", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "GET", url: "/pages" });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /pages/graph", () => {
  it("returns the graph for a signed-in session", async () => {
    const authDb = openAuthDb(":memory:");
    const graph = { nodes: [{ slug: "cats", title: "Cats", category: "Animals", role: "guest" }], edges: [] };
    const app = await buildServer(fakeDeps({ graph: async () => graph }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await sessionCookie(app, authDb, "friend");

    const res = await app.inject({ method: "GET", url: "/pages/graph", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(graph);
  });

  it("401s without a session", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "GET", url: "/pages/graph" });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /pages/generated/:name", () => {
  it("returns the content of a known generated file", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(
      fakeDeps({ readGenerated: async (name) => (name === "index" ? "# Index" : null) }),
      { auth: { db: authDb, cookieSecret: "test-secret" } },
    );
    const cookie = await sessionCookie(app, authDb, "friend");

    const res = await app.inject({ method: "GET", url: "/pages/generated/index", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: "index", content: "# Index" });
  });

  it("400s for a name other than index or log", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps(), { auth: { db: authDb, cookieSecret: "test-secret" } });
    const cookie = await sessionCookie(app, authDb, "friend");

    const res = await app.inject({ method: "GET", url: "/pages/generated/secrets", headers: { cookie } });

    expect(res.statusCode).toBe(400);
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

describe("PUT /pages/:slug", () => {
  const page = {
    metadata: {
      id: "cats",
      title: "Cats",
      category: "Animals",
      tags: [],
      summary: "",
      created: "now",
      updated: "now",
      slug: "cats",
      sources: [],
      role: "guest" as const,
    },
    body: "About cats.",
    links: [],
  };

  it("saves for an admin session", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ savePageRaw: async () => page }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({
      method: "PUT",
      url: "/pages/cats",
      headers: { cookie },
      payload: { raw: "---\ntitle: Cats\n---\nAbout cats." },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(page);
  });

  it("403s for a friend session", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ savePageRaw: async () => page }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await sessionCookie(app, authDb, "friend");

    const res = await app.inject({
      method: "PUT",
      url: "/pages/cats",
      headers: { cookie },
      payload: { raw: "---\ntitle: Cats\n---\nAbout cats." },
    });

    expect(res.statusCode).toBe(403);
  });

  it("400s when raw is missing", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps(), { auth: { db: authDb, cookieSecret: "test-secret" } });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "PUT", url: "/pages/cats", headers: { cookie }, payload: {} });

    expect(res.statusCode).toBe(400);
  });

  it("400s and surfaces the error message when savePageRaw rejects it", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(
      fakeDeps({
        savePageRaw: async () => {
          throw new Error('frontmatter is invalid: "role" must be one of guest, friend, admin.');
        },
      }),
      { auth: { db: authDb, cookieSecret: "test-secret" } },
    );
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({
      method: "PUT",
      url: "/pages/cats",
      headers: { cookie },
      payload: { raw: "---\ntitle: Cats\nrole: superadmin\n---\nAbout cats." },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'frontmatter is invalid: "role" must be one of guest, friend, admin.' });
  });
});
