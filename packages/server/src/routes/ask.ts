import { Type, type Static } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type Database from "better-sqlite3";
import { tryConsumeGuestQuota, type GuestQuotaLimits } from "@sammer/core";
import type { Asker, Runner } from "../deps.js";

const AskBody = Type.Object({
  question: Type.String({ pattern: "\\S" }),
  maxSteps: Type.Optional(Type.Number()),
  allowWrite: Type.Optional(Type.Boolean()),
});
type AskBody = Static<typeof AskBody>;

export const askRoute: FastifyPluginAsyncTypebox<{
  deps: Asker & Runner;
  guestQuota?: { authDb: Database.Database; limits: GuestQuotaLimits };
}> = async (app, { deps, guestQuota }) => {
  app.post("/", { schema: { body: AskBody }, sse: "dual" }, async (request, reply) => {
    const { question, maxSteps, allowWrite } = request.body;

    if (request.caller.role === "guest") {
      if (guestQuota) {
        const result = tryConsumeGuestQuota(guestQuota.authDb, request.ip, guestQuota.limits);
        if (!result.ok) {
          reply.code(429);
          return {
            error:
              result.reason === "ip"
                ? "daily limit reached for your IP"
                : "daily guest limit reached",
          };
        }
      }
    }

    // allowWrite is client-supplied, so it's only honored for an already-resolved
    // admin caller — never trusted on its own the way maxSteps/question are.
    const respond = () =>
      allowWrite && request.caller.role === "admin"
        ? deps.run(question, { readOnly: false, maxSteps, caller: request.caller })
        : deps.ask(question, { maxSteps, caller: request.caller });

    if (!reply.sse) {
      return { answer: await respond() };
    }

    await reply.sse.send({ event: "ack", data: null });
    try {
      const answer = await respond();
      await reply.sse.send({ event: "answer", data: { answer } }).catch(() => {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reply.sse.send({ event: "error", data: { message } }).catch(() => {});
    }
  });
};
