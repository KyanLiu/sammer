const utf8 = (bytes: Buffer): string => bytes.toString("utf8");

// can extend to other byte content
const EXTRACTORS: Record<string, (bytes: Buffer) => string> = {
  ".txt": utf8,
  ".json": utf8,
  ".md": utf8,
};

export const canExtract = (ext: string): boolean => ext in EXTRACTORS;

// extract text from bytes
export function extractText(bytes: Buffer, ext: string): string | null {
  const extractor = EXTRACTORS[ext];
  return extractor ? extractor(bytes) : null;
}
