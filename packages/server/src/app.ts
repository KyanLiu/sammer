import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sse from "@fastify/sse";
import fastifyStatic from "@fastify/static";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { openAuthDb, type GuestQuotaLimits } from "@sammer/core";
import { authPlugin } from "./auth/plugin.js";
import type { ServerDeps } from "./deps.js";
import { pagesRoutes } from "./routes/pages.js";
import { rawRoutes } from "./routes/raw.js";
import { askRoute } from "./routes/ask.js";
import { runRoute } from "./routes/run.js";
import { ingestRoutes, MAX_UPLOAD_BYTES } from "./routes/ingest.js";
import { searchRoute } from "./routes/search.js";
import { eventsRoute } from "./routes/events.js";

export interface ServerOptions {
  rateLimit?: { max: number; timeWindow: string | number };
  logger?: FastifyServerOptions["logger"];
  trustProxy?: FastifyServerOptions["trustProxy"];
  auth?: { db: Database.Database; cookieSecret: string };
  secureCookies?: boolean;
  guestQuota?: { authDb: Database.Database; limits: GuestQuotaLimits };
  webDist?: string;
  corsOrigin?: boolean | string;
}

export async function buildServer(deps: ServerDeps, opts: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: opts.trustProxy ?? false,
    connectionTimeout: 60_000,
    requestTimeout: 2 * 60_000,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.validation ? 400 : (error.statusCode ?? 500);
    if (statusCode >= 500) request.log.error(error);
    reply.code(statusCode).send({ error: error.message });
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, opts.rateLimit ?? { max: 100, timeWindow: "1 minute" });
  await app.register(cors, { origin: opts.corsOrigin || false });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
  await app.register(sse, { heartbeatInterval: 5_000 });

  const auth = opts.auth ?? { db: openAuthDb(":memory:"), cookieSecret: randomBytes(32).toString("hex") };
  await app.register(cookie, { secret: auth.cookieSecret });
  await app.register(authPlugin, { db: auth.db, secureCookies: opts.secureCookies ?? true });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(pagesRoutes, { prefix: "/pages", deps });
  await app.register(rawRoutes, { prefix: "/raw", deps });
  await app.register(askRoute, { prefix: "/ask", deps, guestQuota: opts.guestQuota });
  await app.register(runRoute, { prefix: "/run", deps });
  await app.register(ingestRoutes, { prefix: "/ingest", deps });
  await app.register(searchRoute, { prefix: "/search", deps });
  await app.register(eventsRoute, { prefix: "/events", deps });

  const API_PREFIXES = ["/health", "/auth", "/ask", "/run", "/ingest", "/search", "/pages", "/raw", "/events"];

  if (opts.webDist) {
    await app.register(fastifyStatic, { root: opts.webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !API_PREFIXES.some((p) => request.url.startsWith(p))) {
        return reply.sendFile("index.html");
      }
      reply.code(404).send({ error: "not found" });
    });
  }

  return app;
}
