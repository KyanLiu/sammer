import { Type, type Static } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Searcher } from "../deps.js";

const SearchQuery = Type.Object({
  q: Type.String({ pattern: "\\S" }),
});
type SearchQuery = Static<typeof SearchQuery>;

export const searchRoute: FastifyPluginAsyncTypebox<{ deps: Searcher }> = async (app, { deps }) => {
  app.get("/", { schema: { querystring: SearchQuery } }, async (request) => {
    return await deps.search(request.query.q);
  });
};
