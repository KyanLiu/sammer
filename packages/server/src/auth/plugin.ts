import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { verifyUser, createSession, resolveSession, deleteSession } from "@sammer/core";
import type { Caller } from "@sammer/shared";

declare module "fastify" {
  interface FastifyRequest {
    caller: Caller;
  }
}

const SESSION_COOKIE = "sammer_session";
const GUEST_CALLER: Caller = { role: "guest" };

export interface AuthPluginOptions {
  db: Database.Database;
  secureCookies?: boolean;
}

export const authPlugin = fp(async (app: FastifyInstance, opts: AuthPluginOptions) => {
  const { db } = opts;
  const secure = opts.secureCookies ?? true;

  app.decorateRequest("caller", null, []);

  app.addHook("onRequest", async (request) => {
    request.caller = GUEST_CALLER;

    const raw = request.cookies[SESSION_COOKIE];
    if (!raw) return;
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;

    const caller = resolveSession(db, unsigned.value);
    if (caller) request.caller = caller;
  });

  app.post("/auth/login", async (request, reply) => {
    const { email, password } = (request.body ?? {}) as { email?: string; password?: string };
    if (!email || !password) {
      reply.code(400);
      return { error: "email and password are required" };
    }

    const user = await verifyUser(db, email, password);
    if (!user) {
      reply.code(401);
      return { error: "invalid email or password" };
    }

    const session = createSession(db, user.id);
    reply.setCookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      signed: true,
      path: "/",
      expires: new Date(session.expiresAt),
    });
    return { email: user.email, role: user.role };
  });

  app.post("/auth/logout", async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE];
    if (raw) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) deleteSession(db, unsigned.value);
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { role: "guest" };
  });

  app.get("/auth/me", async (request) => {
    return request.caller.email
      ? { email: request.caller.email, role: request.caller.role }
      : { role: "guest" };
  });
});
