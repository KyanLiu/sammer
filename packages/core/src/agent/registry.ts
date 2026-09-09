import type { ToolDef } from "@sammer/shared";

export interface ToolContext {
  signal?: AbortSignal;
  readOnly?: boolean;
}

export interface Tool {
  def: ToolDef;
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

// build Registry from tools
export function registryOf(tools: Tool[]): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of tools) registry.register(tool);
  return registry;
}

// Tool predicate
export type ToolFilter = (tool: Tool) => boolean;

export function toolsMatching(tools: Tool[], allowed: ToolFilter): Tool[] {
  return tools.filter(allowed);
}

export const readOnlyTools = (tools: Tool[]): Tool[] => toolsMatching(tools, (tool) => !tool.mutates);
