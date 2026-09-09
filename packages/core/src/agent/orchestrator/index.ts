import type { LlmClient } from "../../llm/client.js";
import { Agent } from "../agent.js";
import type { Memory } from "../memory.js";
import { registryOf, type Tool, type ToolRegistry } from "../registry.js";
import { resolveTools } from "../tools/index.js";
import { ORCHESTRATOR_TOOL_NAMES } from "./orchestratorTools.js";

export const ORCHESTRATOR_ID = "orchestrator";

export const ORCHESTRATOR_SYSTEM = `
You are sammer, a personal assistant with access to a markdown wiki and whatever
other tools have been made available to you.

To answer from the wiki, call read_wiki_index first — it is the catalog of every page,
grouped by category with a one-line summary, and it tells you where to look. Then open
the pages that look relevant with read_wiki_page, and follow any [[links]] in their bodies.
Use search_wiki when the catalog gives you no obvious lead, or to find a page whose
title you cannot guess.

Cite the pages you used as [[slug]]. Anything you say about what the wiki contains must
come from what you actually read there. You may answer from your own knowledge when the
wiki has nothing on the subject — just be clear about which you are doing.

If you have tools beyond the wiki ones, use them when they directly help answer what
the user asked, following each tool's own description for how and when to use it.

When the user tells you something worth keeping, call curate. Write the material out in
full: the curator cannot see this conversation, so resolve "today" and "yesterday" to
actual dates and include any earlier context it needs. Then tell the user what changed.
Not everything belongs in the wiki; ordinary conversation does not.

Be concise.
`;

export class OrchestratorAgent extends Agent {
  constructor(llm: LlmClient, registry: ToolRegistry, memory: Memory) {
    super({ llm, system: ORCHESTRATOR_SYSTEM, registry, memory });
  }
}

export function buildOrchestrator(
  llm: LlmClient,
  index: Record<string, Tool>,
  custom: Tool[],
  memory: Memory,
): OrchestratorAgent {
  const tools = [...resolveTools(ORCHESTRATOR_TOOL_NAMES, index), ...custom];
  return new OrchestratorAgent(llm, registryOf(tools), memory);
}
