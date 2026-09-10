import type { Page } from "@sammer/shared";
import type { LlmClient } from "../../llm/client.js";
import type { WikiStore } from "../../wiki/store.js";
import { Agent, type AgentRunOptions } from "../agent.js";
import { registryOf, type Tool, type ToolRegistry } from "../registry.js";
import { resolveTools } from "../tools/index.js";
import type { AgentTelemetry } from "../telemetry.js";
import { CURATOR_TOOL_NAMES } from "./curatorTools.js";

export const CURATOR_ID = "curator";

export const CURATION_SYSTEM = `You are sammer's curator. You are given new information
to fold into a personal markdown wiki.

First find out what the wiki already knows: call read_wiki_index, then search_wiki and
read_wiki_page for anything related. Prefer updating an existing page over creating a
near-duplicate — if a page already covers the topic, rewrite its body to include the
new information rather than adding a second page about the same thing.

Rules to follow:
1. When new information conflicts with what a page already says, rewrite the relevant prose
   to state the current facts instead of appending an update section. The page should hold the
   current state of a topic, written so any agent reading it later finds the current facts
   directly, without needing to cross-reference dates against older material. Write the new
   fact affirmatively, not as a mirror of how the update was phrased to you — new information
   often arrives as a negation of the old state, but the page should state what is true now
   first, with the prior state kept only as dated history if it is worth keeping.
2. Use date references whenever possible: the current facts should reflect the most recent
   date available. Older information can stay, but must be clearly marked as outdated rather
   than presented as current.
3. When updating a page you found via read_wiki_index, search_wiki, or read_wiki_page, pass its
   existing slug to write_wiki_page. write_wiki_page derives the slug from the title when none is
   given, so a reworded title would otherwise create a near-duplicate page instead of
   overwriting the one you read.
4. Reuse a category already shown in read_wiki_index when the topic fits one, rather than
   introducing a near-synonym. A fragmented catalog is the same problem as a near-duplicate
   page, one level up.
5. Only link a [[slug]] you have actually seen in read_wiki_index, search_wiki, or list_wiki_pages.
   A guessed slug that does not match a real page becomes a dead link.

Then call write_wiki_page. It takes the full new body, so include the existing content you
want to keep. Link related pages with [[slug]]. Give every page a category (its single
bucket in the catalog) and a one-line summary — these generate the index, so make them
accurate and specific. Do not write to index.md or log.md; those are maintained for you.

When you are done, reply with a one-line summary of what you changed.`;

export class CuratorAgent extends Agent {
  constructor(
    llm: LlmClient,
    registry: ToolRegistry,
    private readonly store: WikiStore,
    telemetry: AgentTelemetry,
  ) {
    super({ id: CURATOR_ID, llm, system: CURATION_SYSTEM, registry, telemetry });
  }

  override async run(user: string, opts?: AgentRunOptions): Promise<string> {
    const answer = await super.run(user, opts);
    await this.rebuildIndexPage();
    await this.appendLog(answer);
    return answer;
  }

  // index.md build
  private async rebuildIndexPage(): Promise<void> {
    const byCategory = new Map<string, Page[]>();
    for (const slug of await this.store.list()) {
      const page = await this.store.read(slug);
      if (!page) continue;
      const bucket = byCategory.get(page.metadata.category);
      if (bucket) bucket.push(page);
      else byCategory.set(page.metadata.category, [page]);
    }

    const sections = [...byCategory.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, pages]) => {
        const lines = pages
          .sort((a, b) => a.metadata.title.localeCompare(b.metadata.title))
          .map(({ metadata: m }) => `- [[${m.slug}]] — ${m.summary || m.title}`);
        return `## ${category}\n\n${lines.join("\n")}\n`;
      });

    const body = sections.length ? sections.join("\n") : "_No pages yet._\n";
    await this.store.writeText("index", `# Index\n\n${body}`);
  }
  // log.md append
  private async appendLog(entry: string): Promise<void> {
    const existing = await this.store.readText("log");
    const header = existing === null ? "# Log\n\n" : "";
    await this.store.appendText("log", `${header}- ${new Date().toISOString()} — ${entry}\n`);
  }
}

export function buildCurator(
  llm: LlmClient,
  toolIndex: Record<string, Tool>,
  custom: Tool[],
  store: WikiStore,
  telemetry: AgentTelemetry,
): CuratorAgent {
  const tools = [...resolveTools(CURATOR_TOOL_NAMES, toolIndex), ...custom];
  return new CuratorAgent(llm, registryOf(tools), store, telemetry);
}
