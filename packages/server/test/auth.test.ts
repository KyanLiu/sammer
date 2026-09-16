import { describe, it, expect } from "vitest";
import { openAuthDb, createUser } from "@sammer/core";
import { buildServer } from "../src/app.js";
import { fakeDeps } from "./helpers.js";

function buildAuthedServer(authDb: ReturnType<typeof openAuthDb>) {
  return buildServer(fakeDeps(), { auth: { db: authDb, cookieSecret: "test-secret" } });
}

describe("POST /auth/login", () => {
  it("sets a session cookie and returns the account's email and role on success", async () => {
    const authDb = openAuthDb(":memory:");
    await createUser(authDb, "friend@example.com", "hunter2", "friend");
    const app = await buildAuthedServer(authDb);

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "friend@example.com", password: "hunter2" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ email: "friend@example.com", role: "friend" });
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("401s on a wrong password without revealing which part was wrong", async () => {
    const authDb = openAuthDb(":memory:");
    await createUser(authDb, "friend@example.com", "hunter2", "friend");
    const app = await buildAuthedServer(authDb);

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "friend@example.com", password: "wrong" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("400s when email or password is missing", async () => {
    const app = await buildAuthedServer(openAuthDb(":memory:"));
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /auth/me and POST /auth/logout", () => {
  it("resolves the logged-in account from the session cookie, and guest without one", async () => {
    const authDb = openAuthDb(":memory:");
    await createUser(authDb, "friend@example.com", "hunter2", "friend");
    const app = await buildAuthedServer(authDb);

    const anon = await app.inject({ method: "GET", url: "/auth/me" });
    expect(anon.json()).toEqual({ role: "guest" });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "friend@example.com", password: "hunter2" },
    });
    const cookie = login.headers["set-cookie"];

    const me = await app.inject({ method: "GET", url: "/auth/me", cookies: parseCookie(cookie) });
    expect(me.json()).toEqual({ email: "friend@example.com", role: "friend" });

    await app.inject({ method: "POST", url: "/auth/logout", cookies: parseCookie(cookie) });
    const afterLogout = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: parseCookie(cookie),
    });
    expect(afterLogout.json()).toEqual({ role: "guest" });
  });
});

function parseCookie(setCookie: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error("no set-cookie header");
  const [pair] = raw.split(";");
  const [name, value] = pair!.split("=");
  return { [name!]: value! };
}
