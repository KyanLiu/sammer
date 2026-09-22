import type { FastifyPluginAsync } from "fastify";
import type { PageReader, PageWriter } from "../deps.js";
import { requireRole } from "../guard.js";

const GENERATED_NAMES = new Set(["index", "log"]);

export const pagesRoutes: FastifyPluginAsync<{ deps: PageReader & PageWriter }> = async (app, { deps }) => {
  // Any signed-in role can browse (each page's own role still filters what
  // comes back) — only writing is admin-only.
  app.get("/", { preHandler: requireRole("guest") }, async (request) => {
    return await deps.listPageSummaries(request.caller);
  });

  app.get("/graph", { preHandler: requireRole("guest") }, async (request) => {
    return await deps.graph(request.caller);
  });

  app.get<{ Params: { name: string } }>(
    "/generated/:name",
    { preHandler: requireRole("guest") },
    async (request, reply) => {
      const { name } = request.params;
      if (!GENERATED_NAMES.has(name)) {
        reply.code(400);
        return { error: `"${name}" is not a generated file` };
      }
      const content = await deps.readGenerated(name as "index" | "log");
      if (content === null) {
        reply.code(404);
        return { error: `no generated file "${name}"` };
      }
      return { name, content };
    },
  );

  app.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    const page = await deps.getPage(request.params.slug, request.caller);
    if (page === null) {
      reply.code(404);
      return { error: `no page "${request.params.slug}"` };
    }
    return page;
  });

  app.put<{ Params: { slug: string }; Body: { raw?: string } }>(
    "/:slug",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { raw } = request.body ?? {};
      if (typeof raw !== "string" || !raw.trim()) {
        reply.code(400);
        return { error: "raw is required" };
      }
      try {
        return await deps.savePageRaw(request.params.slug, raw);
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : "save failed" };
      }
    },
  );
};
