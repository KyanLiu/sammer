import { z } from "zod";
import { EPOCH, slugify, SourceMetadataSchema, type Source } from "@sammer/shared";

// formatted string on disk
export function serializeRecord(source: Source): string {
  return `${JSON.stringify({ ...source.metadata, fileName: source.fileName }, null, 2)}\n`;
}

const RecordSchema = SourceMetadataSchema.extend({ fileName: z.string().min(1).catch("") });

// Parse the Source metadata schema record from JSON
// Requires a real ID and origin
export function parseRecord(json: string, at: { origin: string; id: string }): Source {
  const { fileName, ...metadata } = RecordSchema.parse(JSON.parse(json));
  return {
    metadata: {
      ...metadata,
      id: metadata.id || at.id,
      origin: metadata.origin || at.origin,
      created: metadata.created || EPOCH,
      updated: metadata.updated || EPOCH,
    },
    fileName: fileName || `${slugify(at.id)}.txt`,
  };
}
