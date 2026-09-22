import type { FastifyPluginAsync } from "fastify";
import type { RawReader } from "../deps.js";
import { requireRole } from "../guard.js";

export const rawRoutes: FastifyPluginAsync<{ deps: RawReader }> = async (app, { deps }) => {
  app.addHook("preHandler", requireRole("admin"));

  app.get("/", async () => {
    return await deps.listRawSources();
  });

  app.get<{ Params: { origin: string; id: string } }>("/:origin/:id", async (request, reply) => {
    const { origin, id } = request.params;
    const result = await deps.getRawSource(origin, id);
    if (result === null) {
      reply.code(404);
      return { error: `no raw source "${origin}/${id}"` };
    }
    return result;
  });
};
