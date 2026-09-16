import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { SOURCE_KINDS } from "@sammer/shared";
import type { FileIngester, TextIngester } from "../deps.js";
import { requireRole } from "../guard.js";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const IngestBody = Type.Object({
  text: Type.String({ pattern: "\\S" }),
  source: Type.Optional(
    Type.Object({
      origin: Type.String(),
      kind: Type.Optional(Type.Union(SOURCE_KINDS.map((kind) => Type.Literal(kind)))),
      title: Type.Optional(Type.String()),
      url: Type.Optional(Type.String()),
      externalId: Type.Optional(Type.String()),
    }),
  ),
});
type IngestBody = Static<typeof IngestBody>;

export const ingestRoutes: FastifyPluginAsyncTypebox<{ deps: TextIngester & FileIngester }> = async (
  app,
  { deps },
) => {
  app.addHook("preHandler", requireRole("admin"));

  app.post("/", { schema: { body: IngestBody } }, async (request) => {
    const { text, source } = request.body;
    return await deps.ingest(text, { source });
  });

  app.post("/file", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      reply.code(400);
      return { error: "a file is required" };
    }

    const tmpPath = join(tmpdir(), `${randomUUID()}${extname(data.filename)}`);
    try {
      await pipeline(data.file, createWriteStream(tmpPath));
      if (data.file.truncated) {
        reply.code(400);
        return { error: `file exceeds the ${MAX_UPLOAD_BYTES}-byte limit` };
      }
      return await deps.ingestFile(tmpPath);
    } finally {
      await rm(tmpPath, { force: true });
    }
  });
};
