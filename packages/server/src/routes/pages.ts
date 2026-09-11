import type { FastifyPluginAsync } from "fastify";
import type { PageReader } from "../deps.js";

export const pagesRoutes: FastifyPluginAsync<{ deps: PageReader }> = async (app, { deps }) => {
  app.get("/", async () => {
    return await deps.listPages();
  });

  app.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    const page = await deps.getPage(request.params.slug);
    if (page === null) {
      reply.code(404);
      return { error: `no page "${request.params.slug}"` };
    }
    return page;
  });
};
