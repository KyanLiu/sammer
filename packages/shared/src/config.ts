import { join } from "node:path";
import { z } from "zod";
import { findWorkspaceRoot } from "./env.js";

export const LLM_PROVIDERS = ["openai", "anthropic"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const ConfigSchema = z.object({
  dataDir: z.string().default(() => join(findWorkspaceRoot(), "data")),
  llm: z.object({
    provider: z.enum(LLM_PROVIDERS).default("openai"),
    baseUrl: z.string().optional(),
    apiKey: z.string({ required_error: "LLM_API_KEY is required" }).min(1, "LLM_API_KEY is required"),
    chatModel: z.string().optional(),
    embedModel: z.string().default("text-embedding-3-small"),
    embedDim: z.coerce.number().int().positive().default(1536),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse({
    dataDir: env.DATA_DIR,
    llm: {
      provider: env.LLM_PROVIDER,
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      chatModel: env.LLM_CHAT_MODEL,
      embedModel: env.LLM_EMBED_MODEL,
      embedDim: env.LLM_EMBED_DIM,
    },
  });
}
