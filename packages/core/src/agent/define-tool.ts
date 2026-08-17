import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool, ToolContext } from "./registry.js";

export interface ToolSpec<S extends z.ZodType> {
  name: string;
  description: string;
  mutates: boolean;
  schema: S;
  run(args: z.infer<S>, ctx: ToolContext): Promise<string>;
}

// One declaration produces both halves of a tool: the JSON Schema the model is
// shown, and the runtime check that the arguments it sends actually match. They
// cannot drift apart, because they are the same schema.
export function defineTool<S extends z.ZodType>(spec: ToolSpec<S>): Tool {
  const { $schema, ...parameters } = zodToJsonSchema(spec.schema) as Record<string, unknown>;

  return {
    def: { name: spec.name, description: spec.description, parameters },
    mutates: spec.mutates,
    run: async (args, ctx) => {
      const parsed = spec.schema.safeParse(args ?? {});
      if (!parsed.success) {
        // Models recover from a specific complaint; a raw ZodError dump is noise.
        const detail = parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        throw new Error(`invalid arguments: ${detail}`);
      }
      return spec.run(parsed.data, ctx);
    },
  };
}
