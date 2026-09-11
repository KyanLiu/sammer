import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import sse from "@fastify/sse";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { ServerDeps } from "./deps.js";
import { pagesRoutes } from "./routes/pages.js";
import { askRoute } from "./routes/ask.js";
import { runRoute } from "./routes/run.js";
import { ingestRoutes, MAX_UPLOAD_BYTES } from "./routes/ingest.js";
import { searchRoute } from "./routes/search.js";
import { eventsRoute } from "./routes/events.js";

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify().withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.validation ? 400 : (error.statusCode ?? 500);
    if (statusCode >= 500) console.error(error.stack ?? error.message);
    reply.code(statusCode).send({ error: error.message });
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
  await app.register(sse);

  await app.register(pagesRoutes, { prefix: "/pages", deps });
  await app.register(askRoute, { prefix: "/ask", deps });
  await app.register(runRoute, { prefix: "/run", deps });
  await app.register(ingestRoutes, { prefix: "/ingest", deps });
  await app.register(searchRoute, { prefix: "/search", deps });
  await app.register(eventsRoute, { prefix: "/events", deps });

  return app;
}
