import type { LlmClient } from "../llm/client.js";
import type { RawStore } from "../raw/store.js";
import type { WikiStore } from "../wiki/store.js";
import { buildCurateTool } from "./curator/curatorAdapter.js";
import { buildCurator, type CuratorAgent } from "./curator/index.js";
import { Memory } from "./memory.js";
import { buildOrchestrator, type OrchestratorAgent } from "./orchestrator/index.js";
import { readOnlyTools, type Tool } from "./registry.js";
import type { AgentTelemetry } from "./telemetry.js";

export interface BuildAgentsDeps {
  llm: LlmClient;
  toolIndex: Record<string, Tool>;
  custom: Tool[];
  store: WikiStore;
  raw: RawStore;
  telemetry: AgentTelemetry;
}

export interface Agents {
  curator: CuratorAgent;
  orchestrator: OrchestratorAgent;
}

export function buildAgents(deps: BuildAgentsDeps): Agents {
  const curator = buildCurator(deps.llm, deps.toolIndex, deps.custom, deps.store, deps.telemetry);
  const curate = buildCurateTool(curator, deps.raw);

  const orchestrator = buildOrchestrator(
    deps.llm,
    { ...deps.toolIndex, curate },
    readOnlyTools(deps.custom),
    new Memory(),
    deps.telemetry,
  );

  return { curator, orchestrator };
}
