import { extname } from "node:path";
import type { SourceKind } from "@sammer/shared";

const KINDS: Record<string, SourceKind> = {
  ".txt": "text",
  ".pdf": "pdf",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  ".mp3": "audio",
  ".m4a": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".mp4": "video",
  ".mov": "video",
  ".webm": "video",
};

// defaults to text kind to read
export function classifyFile(path: string): { ext: string; kind: SourceKind } {
  const ext = extname(path).toLowerCase() || ".txt";
  return { ext, kind: KINDS[ext] ?? "text" };
}
