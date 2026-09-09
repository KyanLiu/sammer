import type { Tool } from "../registry.js";
import {
  buildReadIndexTool,
  buildSearchWikiTool,
  buildReadPageTool,
  buildListPagesTool,
  buildWritePageTool,
  type WikiToolDeps,
} from "./wiki.js";

// interface defining all dependencies used for tools
export interface ToolDeps {
  wikiDeps: WikiToolDeps;
}

export function buildToolIndex(deps: ToolDeps): Record<string, Tool> {
  return {
    read_wiki_index: buildReadIndexTool(deps.wikiDeps),
    search_wiki: buildSearchWikiTool(deps.wikiDeps),
    read_wiki_page: buildReadPageTool(deps.wikiDeps),
    list_wiki_pages: buildListPagesTool(deps.wikiDeps),
    write_wiki_page: buildWritePageTool(deps.wikiDeps),
  };
}

export function resolveTools(names: string[], index: Record<string, Tool>): Tool[] {
  return names.map((name) => {
    const tool = index[name];
    if (!tool) throw new Error(`Unknown tool "${name}" in tool index.`);
    return tool;
  });
}
