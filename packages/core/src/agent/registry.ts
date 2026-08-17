import type { ToolDef } from "@sammer/shared";

export interface ToolContext {
  // Lets a tool abandon in-flight work (a network call in an integration) when
  // the caller goes away. Local tools ignore it.
  signal?: AbortSignal;
  // Set by the assist loop. Read-only callers are refused mutating tools even
  // if the model asks for one by name.
  readOnly?: boolean;
}

export interface Tool {
  def: ToolDef;
  // Whether running this tool changes state. The assist loop is never offered
  // tools that do, so answering a question cannot rewrite the wiki.
  mutates: boolean;
  run(args: unknown, ctx: ToolContext): Promise<string>;
}

export interface DefsFilter {
  readOnly?: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.def.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  defs(filter: DefsFilter = {}): ToolDef[] {
    return [...this.tools.values()]
      .filter((tool) => !(filter.readOnly && tool.mutates))
      .map((tool) => tool.def);
  }

  // The single execution path. Every outcome — success, bad name, refused tool,
  // bad arguments, a thrown error — comes back as a string the agent loop can
  // feed to the model, so one failing tool never takes down the turn.
  async invoke(name: string, args: unknown, ctx: ToolContext = {}): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) return `Error: unknown tool "${name}".`;
    if (ctx.readOnly && tool.mutates) {
      return `Error: tool "${name}" is not available here because it modifies the wiki.`;
    }
    try {
      return await tool.run(args, ctx);
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
