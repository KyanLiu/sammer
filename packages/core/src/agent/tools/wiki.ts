import { z } from "zod";
import type Database from "better-sqlite3";
import { ADMIN_CALLER, roleRank } from "@sammer/shared";
import type { Tool } from "../registry.js";
import { defineTool } from "../define-tool.js";
import type { WikiService } from "../../wiki/service.js";
import { keywordSearch } from "../../index/search.js";
import { listPageSlugs, listPageSummaries, type PageSummary } from "../../index/pages.js";

export interface WikiToolDeps {
  wiki: WikiService;
  db: Database.Database;
}

export function buildReadIndexTool(deps: WikiToolDeps): Tool {
  return defineTool({
    name: "read_wiki_index",
    description:
      "Read the catalog of every wiki page you can see, grouped by category with a one-line " +
      "summary. ALWAYS read this first to orient before answering.",
    mutates: false,
    schema: z.object({}),
    run: async (_args, ctx) => {
      const rows = listPageSummaries(deps.db, roleRank((ctx.caller ?? ADMIN_CALLER).role));
      if (rows.length === 0) return "The index is empty. No pages have been catalogued yet.";

      const byCategory = new Map<string, PageSummary[]>();
      for (const r of rows) {
        const bucket = byCategory.get(r.category);
        if (bucket) bucket.push(r);
        else byCategory.set(r.category, [r]);
      }
      const sections = [...byCategory.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, pages]) => {
          const lines = pages.map((p) => `- [[${p.slug}]] — ${p.summary || p.title}`);
          return `## ${category}\n\n${lines.join("\n")}\n`;
        });
      return `# Index\n\n${sections.join("\n")}`;
    },
  });
}

export function buildSearchWikiTool(deps: WikiToolDeps): Tool {
  return defineTool({
    name: "search_wiki",
    description: "Keyword-search the wiki. Returns matching pages as slug, title, and a snippet.",
    mutates: false,
    schema: z.object({ query: z.string().describe("words to search for") }),
    run: async ({ query }, ctx) => {
      const hits = keywordSearch(deps.db, query, {
        k: 5,
        expandHops: 1,
        maxRank: roleRank((ctx.caller ?? ADMIN_CALLER).role),
      });
      if (hits.length === 0) return "No matching pages.";
      return hits.map((h) => `- [[${h.slug}]] "${h.title}": ${h.snippet}`).join("\n");
    },
  });
}

export function buildReadPageTool(deps: WikiToolDeps): Tool {
  return defineTool({
    name: "read_wiki_page",
    description: "Read the full markdown body of a wiki page by slug.",
    mutates: false,
    schema: z.object({ slug: z.string() }),
    run: async ({ slug }, ctx) => {
      const page = await deps.wiki.getPage(slug, roleRank((ctx.caller ?? ADMIN_CALLER).role));
      return page ? page.body : `Page "${slug}" does not exist.`;
    },
  });
}

export function buildListPagesTool(deps: WikiToolDeps): Tool {
  return defineTool({
    name: "list_wiki_pages",
    description: "List all content page slugs in the wiki.",
    mutates: false,
    schema: z.object({}),
    run: async (_args, ctx) => {
      const slugs = listPageSlugs(deps.db, roleRank((ctx.caller ?? ADMIN_CALLER).role));
      return slugs.length ? slugs.join("\n") : "The wiki is empty.";
    },
  });
}

export function buildWritePageTool(deps: WikiToolDeps): Tool {
  return defineTool({
    name: "write_wiki_page",
    description:
      "Create or overwrite a wiki page. Use [[slug]] in the body to link related pages. " +
      "Provide the full new body; existing content at this slug is replaced.",
    mutates: true,
    schema: z.object({
      title: z.string(),
      body: z.string(),
      summary: z.string().describe("one-line summary shown in the index"),
      category: z.string().optional().describe("single section for the index (e.g. 'Animals')"),
      tags: z.array(z.string()).optional(),
      slug: z.string().optional().describe("optional; derived from title if omitted"),
    }),
    run: async (input) => {
      const page = await deps.wiki.savePage(input);
      return `Wrote page "${page.metadata.slug}".`;
    },
  });
}
