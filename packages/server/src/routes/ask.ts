import { Type, type Static } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Asker } from "../deps.js";

const AskBody = Type.Object({
  question: Type.String({ pattern: "\\S" }),
  maxSteps: Type.Optional(Type.Number()),
});
type AskBody = Static<typeof AskBody>;

export const askRoute: FastifyPluginAsyncTypebox<{ deps: Asker }> = async (app, { deps }) => {
  app.post("/", { schema: { body: AskBody }, sse: "dual" }, async (request, reply) => {
    const { question, maxSteps } = request.body;

    if (!reply.sse) {
      return { answer: await deps.ask(question, { maxSteps }) };
    }

    await reply.sse.send({ event: "ack", data: null });
    try {
      const answer = await deps.ask(question, { maxSteps });
      await reply.sse.send({ event: "answer", data: { answer } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reply.sse.send({ event: "error", data: { message } });
    }
  });
};
