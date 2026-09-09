import { createHash } from "node:crypto";

const ID_LENGTH = 12;

// serves to convert raw bytes into an ID for storing raw sources
export function sourceId(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, ID_LENGTH);
}

// text sources are converted to bytes, then grabbing ID
export function textSourceId(text: string): string {
  return sourceId(Buffer.from(text.trim(), "utf8"));
}
