import { Type, type Static } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Runner } from "../deps.js";
import { requireRole } from "../guard.js";

const RunBody = Type.Object({
  prompt: Type.String({ pattern: "\\S" }),
  readOnly: Type.Optional(Type.Boolean()),
  maxSteps: Type.Optional(Type.Number()),
});
type RunBody = Static<typeof RunBody>;

export const runRoute: FastifyPluginAsyncTypebox<{ deps: Runner }> = async (app, { deps }) => {
  app.addHook("preHandler", requireRole("admin"));

  app.post("/", { schema: { body: RunBody } }, async (request) => {
    const { prompt, readOnly, maxSteps } = request.body;
    return { answer: await deps.run(prompt, { readOnly, maxSteps, caller: request.caller }) };
  });
};
