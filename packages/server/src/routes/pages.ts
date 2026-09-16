import type { FastifyPluginAsync } from "fastify";
import type { PageReader } from "../deps.js";
import { requireRole } from "../guard.js";

export const pagesRoutes: FastifyPluginAsync<{ deps: PageReader }> = async (app, { deps }) => {
  app.get("/", { preHandler: requireRole("admin") }, async (request) => {
    return await deps.listPages(request.caller);
  });

  app.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    const page = await deps.getPage(request.params.slug, request.caller);
    if (page === null) {
      reply.code(404);
      return { error: `no page "${request.params.slug}"` };
    }
    return page;
  });
};
