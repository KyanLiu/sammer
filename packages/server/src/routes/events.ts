import type { FastifyPluginAsync } from "fastify";
import type { TelemetrySource } from "../deps.js";
import { requireRole } from "../guard.js";

export const eventsRoute: FastifyPluginAsync<{ deps: TelemetrySource }> = async (app, { deps }) => {
  app.addHook("preHandler", requireRole("admin"));

  app.get("/", { sse: "only" }, async (request, reply) => {
    reply.sse.keepAlive();

    const unsubscribe = deps.telemetry.subscribe((event) => {
      reply.sse.send({ data: event }).catch(() => {});
    });
    reply.sse.onClose(() => {
      unsubscribe();
    });

    await reply.sse.send({ event: "connected", data: null });
  });
};
