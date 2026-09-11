import { Type, type Static } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Asker } from "../deps.js";

const AskBody = Type.Object({
  question: Type.String({ pattern: "\\S" }),
  maxSteps: Type.Optional(Type.Number()),
});
type AskBody = Static<typeof AskBody>;

export const askRoute: FastifyPluginAsyncTypebox<{ deps: Asker }> = async (app, { deps }) => {
  app.post("/", { schema: { body: AskBody } }, async (request) => {
    const { question, maxSteps } = request.body;
    return { answer: await deps.ask(question, { maxSteps }) };
  });
};
