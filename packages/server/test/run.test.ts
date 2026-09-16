import { describe, it, expect } from "vitest";
import { openAuthDb } from "@sammer/core";
import { buildServer } from "../src/app.js";
import { fakeDeps, adminCookie } from "./helpers.js";

describe("POST /run", () => {
  it("answers using the deps' run()", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ run: async (prompt) => `ran: ${prompt}` }), {
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({
      method: "POST",
      url: "/run",
      headers: { cookie },
      payload: { prompt: "remember this" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ answer: "ran: remember this" });
  });

  it("400s when prompt is missing", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps(), { auth: { db: authDb, cookieSecret: "test-secret" } });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "POST", url: "/run", headers: { cookie }, payload: {} });

    expect(res.statusCode).toBe(400);
  });

  it("passes readOnly and maxSteps through when given", async () => {
    let seenReadOnly: boolean | undefined;
    let seenMaxSteps: number | undefined;
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(
      fakeDeps({
        run: async (_prompt, opts) => {
          seenReadOnly = opts?.readOnly;
          seenMaxSteps = opts?.maxSteps;
          return "ok";
        },
      }),
      { auth: { db: authDb, cookieSecret: "test-secret" } },
    );
    const cookie = await adminCookie(app, authDb);

    await app.inject({
      method: "POST",
      url: "/run",
      headers: { cookie },
      payload: { prompt: "p", readOnly: true, maxSteps: 2 },
    });

    expect(seenReadOnly).toBe(true);
    expect(seenMaxSteps).toBe(2);
  });

  it("400s when readOnly is not a boolean", async () => {
    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps(), { auth: { db: authDb, cookieSecret: "test-secret" } });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({
      method: "POST",
      url: "/run",
      headers: { cookie },
      payload: { prompt: "p", readOnly: "yes" },
    });

    expect(res.statusCode).toBe(400);
  });
});
