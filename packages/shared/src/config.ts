import { z } from "zod";

const ConfigSchema = z.object({
  dataDir: z.string().default("./data"),
  llm: z.object({
    baseUrl: z.string().default("https://api.openai.com/v1"),
    apiKey: z.string({ required_error: "LLM_API_KEY is required" }).min(1, "LLM_API_KEY is required"),
    chatModel: z.string().default("gpt-4o-mini"),
    embedModel: z.string().default("text-embedding-3-small"),
    embedDim: z.coerce.number().int().positive().default(1536),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse({
    dataDir: env.DATA_DIR,
    llm: {
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      chatModel: env.LLM_CHAT_MODEL,
      embedModel: env.LLM_EMBED_MODEL,
      embedDim: env.LLM_EMBED_DIM,
    },
  });
}
