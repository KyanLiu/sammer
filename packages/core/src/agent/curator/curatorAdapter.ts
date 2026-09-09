import { z } from "zod";
import { asTool } from "../agent.js";
import type { Tool } from "../registry.js";
import { archiveText, type IngestSource } from "../../raw/archive.js";
import type { RawStore } from "../../raw/store.js";
import type { CuratorAgent } from "./index.js";

const CHAT_SOURCE: IngestSource = { origin: "chat", kind: "conversation" };

// Agent as a Tool call
export function buildCurateTool(curator: CuratorAgent, raw: RawStore): Tool {
  return asTool({
    name: "curate",
    description:
      "Fold information into the wiki, creating or updating whatever pages it belongs on. " +
      "Write the material out in full and self-contained: resolve relative dates like " +
      "'today' to actual dates and include any earlier context, because the curator " +
      "cannot see this conversation. Returns a one-line summary of what changed.",
    mutates: true,
    schema: z.object({
      material: z.string().min(1).describe("the information to store, written out in full"),
    }),
    toMessage: ({ material }) => material,
    run: async (material, opts) => {
      const archived = await archiveText(raw, material, CHAT_SOURCE);
      if (archived.skipped) return "Already ingested; nothing to do.";
      return curator.run(material, { signal: opts.signal });
    },
  });
}
