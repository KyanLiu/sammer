import type { ModelMessage } from "@sammer/shared";
import type { LlmClient } from "../llm/client.js";
import type { ToolContext, ToolRegistry } from "./registry.js";

// The read loop. Retrieval here is navigation, not chunk-and-embed: the agent
// orients from the index.md catalog, then opens whole pages and follows their
// [[links]], falling back to keyword search when the catalog gives no lead.
export const ASSIST_SYSTEM = `You are sammer, an agent that answers from a personal markdown wiki.

Always call read_index first — it is the catalog of every page, grouped by category
with a one-line summary, and it tells you where to look. Then open the pages that
look relevant with read_page, and follow any [[links]] in their bodies to related
pages. Use search_wiki when the catalog gives you no obvious lead, or to find a
page whose title you cannot guess.

Cite the pages you used as [[slug]]. Answer only from what the wiki actually says.
If the wiki does not contain the answer, say so plainly rather than guessing from
your own knowledge. Be concise.`;

// The write loop. index.md and log.md are engine-maintained (see ADR D3), so the
// agent never edits them directly — it only supplies the category and summary
// they are generated from.
export const CURATION_SYSTEM = `You are sammer's curator. You are given new information
to fold into a personal markdown wiki.

First find out what the wiki already knows: call read_index, then search_wiki and
read_page for anything related. Prefer updating an existing page over creating a
near-duplicate — if a page already covers the topic, rewrite its body to include the
new information rather than adding a second page about the same thing.

Then call write_page. It takes the full new body, so include the existing content you
want to keep. Link related pages with [[slug]]. Give every page a category (its single
bucket in the catalog) and a one-line summary — these generate the index, so make them
accurate and specific. Do not write to index.md or log.md; those are maintained for you.

When you are done, reply with a one-line summary of what you changed.`;

/** Tool-calling rounds before the loop stops and answers from what it gathered. */
const DEFAULT_MAX_STEPS = 8;

export interface RunAgentOptions {
  llm: LlmClient;
  registry: ToolRegistry;
  system: string;
  user: string;
  maxSteps?: number;
  // The assist loop sets this. Mutating tools are then neither offered to the
  // model nor executed if it asks for one regardless — the read path cannot
  // write, structurally, rather than because the prompt asked it not to.
  readOnly?: boolean;
  signal?: AbortSignal;
}

export interface RunAgentResult {
  answer: string;
  steps: number;
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const { llm, registry, system, user, readOnly, signal } = opts;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const ctx: ToolContext = { readOnly, signal };

  const messages: ModelMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  let steps = 0;
  while (steps < maxSteps) {
    steps++;
    const res = await llm.chat({ messages, tools: registry.defs({ readOnly }) });

    if (res.toolCalls.length === 0) {
      return { answer: res.content ?? "", steps };
    }

    messages.push({ role: "assistant", content: res.content, toolCalls: res.toolCalls });
    for (const call of res.toolCalls) {
      // invoke never throws: a failed tool is a message the model can react to.
      const content = await registry.invoke(call.name, call.arguments, ctx);
      messages.push({ role: "tool", toolCallId: call.id, content });
    }
  }

  // Out of steps, but the run is not worthless — by now the model has usually
  // read most of what it needed. Ask once more with no tools offered, which
  // leaves it nothing to do but answer from what it already gathered.
  messages.push({
    role: "user",
    content:
      "You have used all of your tool calls. Answer now using only what you have already " +
      "gathered, and say plainly which part you could not finish.",
  });
  const final = await llm.chat({ messages });
  return {
    answer: final.content?.trim() || "Reached the step limit before finishing.",
    steps,
  };
}
