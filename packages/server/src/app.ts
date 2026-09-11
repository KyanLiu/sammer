import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sse from "@fastify/sse";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { ServerDeps } from "./deps.js";
import { pagesRoutes } from "./routes/pages.js";
import { askRoute } from "./routes/ask.js";
import { runRoute } from "./routes/run.js";
import { ingestRoutes, MAX_UPLOAD_BYTES } from "./routes/ingest.js";
import { searchRoute } from "./routes/search.js";
import { eventsRoute } from "./routes/events.js";

export interface ServerOptions {
  rateLimit?: { max: number; timeWindow: string | number };
  logger?: FastifyServerOptions["logger"];
  trustProxy?: FastifyServerOptions["trustProxy"];
}

export async function buildServer(deps: ServerDeps, opts: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: opts.trustProxy ?? false,
    connectionTimeout: 10_000,
    requestTimeout: 30_000,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.validation ? 400 : (error.statusCode ?? 500);
    if (statusCode >= 500) request.log.error(error);
    reply.code(statusCode).send({ error: error.message });
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, opts.rateLimit ?? { max: 100, timeWindow: "1 minute" });
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
  await app.register(sse);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(pagesRoutes, { prefix: "/pages", deps });
  await app.register(askRoute, { prefix: "/ask", deps });
  await app.register(runRoute, { prefix: "/run", deps });
  await app.register(ingestRoutes, { prefix: "/ingest", deps });
  await app.register(searchRoute, { prefix: "/search", deps });
  await app.register(eventsRoute, { prefix: "/events", deps });

  return app;
}
