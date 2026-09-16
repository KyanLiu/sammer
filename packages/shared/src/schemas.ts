import { z } from "zod";
import { SOURCE_KINDS } from "./types.js";
import { DEFAULT_PAGE_ROLE, ROLES } from "./constants.js";

// Validate Date Strings
const IsoDate = z.union([z.string().min(1), z.date().transform((d) => d.toISOString())]);

const RecordMetadataSchema = z.object({
  id: z.string().min(1).catch(""),
  title: z.string().min(1).catch(""),
  category: z.string().min(1).catch(""),
  tags: z
    .array(z.string())
    .catch([])
    .transform((tags) => [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]),
  summary: z.string().catch(""),
  created: IsoDate.catch(""),
  updated: IsoDate.catch(""),
});

// Raw source's metadata validation
export const SourceMetadataSchema = RecordMetadataSchema.extend({
  origin: z.string().min(1).catch(""),
  kind: z.enum(SOURCE_KINDS).catch("text"),
  externalId: z.string().optional().catch(undefined),
  url: z.string().optional().catch(undefined),
});

// Page's metadata validation
export const PageMetadataSchema = RecordMetadataSchema.extend({
  slug: z.string().min(1).catch(""),
  category: z.string().min(1).catch("Uncategorized"),
  role: z.enum(ROLES).catch(DEFAULT_PAGE_ROLE),
  sources: z
    .array(SourceMetadataSchema.nullable().catch(null))
    .catch([])
    .transform((entries) => entries.filter((entry) => entry !== null)),
});
