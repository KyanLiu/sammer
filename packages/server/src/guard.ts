import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { roleRank, type Role } from "@sammer/shared";

export function requireRole(min: Role): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.caller.role === "guest") {
      reply.code(401);
      throw Object.assign(new Error("authentication required"), { statusCode: 401 });
    }
    if (roleRank(request.caller.role) < roleRank(min)) {
      reply.code(403);
      throw Object.assign(new Error(`requires ${min} access`), { statusCode: 403 });
    }
  };
}
