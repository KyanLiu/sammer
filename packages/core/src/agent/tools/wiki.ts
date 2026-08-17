import { z } from "zod";
import type Database from "better-sqlite3";
import type { Tool } from "../registry.js";
import { defineTool } from "../define-tool.js";
import type { WikiService } from "../../wiki/service.js";
import { keywordSearch } from "../../index/search.js";

export interface WikiToolDeps {
  wiki: WikiService;
  db: Database.Database;
}

export function buildWikiTools(deps: WikiToolDeps): Tool[] {
  return [
    defineTool({
      name: "read_index",
      description:
        "Read index.md, the catalog of every wiki page grouped by category with a one-line summary. " +
        "ALWAYS read this first to orient before answering.",
      mutates: false,
      schema: z.object({}),
      run: async () => {
        const page = await deps.wiki.getPage("index");
        return page && page.body.trim()
          ? page.body
          : "The index is empty. No pages have been catalogued yet.";
      },
    }),

    defineTool({
      name: "search_wiki",
      description:
        "Keyword-search the wiki. Returns matching pages as slug, title, and a snippet.",
      mutates: false,
      schema: z.object({ query: z.string().describe("words to search for") }),
      run: async ({ query }) => {
        const hits = keywordSearch(deps.db, query, { k: 5, expandHops: 1 });
        if (hits.length === 0) return "No matching pages.";
        return hits.map((h) => `- [[${h.slug}]] "${h.title}": ${h.snippet}`).join("\n");
      },
    }),

    defineTool({
      name: "read_page",
      description: "Read the full markdown body of a wiki page by slug.",
      mutates: false,
      schema: z.object({ slug: z.string() }),
      run: async ({ slug }) => {
        const page = await deps.wiki.getPage(slug);
        return page ? page.body : `Page "${slug}" does not exist.`;
      },
    }),

    defineTool({
      name: "list_pages",
      description: "List all content page slugs in the wiki.",
      mutates: false,
      schema: z.object({}),
      run: async () => {
        const slugs = await deps.wiki.listPages();
        return slugs.length ? slugs.join("\n") : "The wiki is empty.";
      },
    }),

    defineTool({
      name: "write_page",
      description:
        "Create or overwrite a wiki page. Use [[slug]] in the body to link related pages. " +
        "Provide the full new body; existing content at this slug is replaced.",
      mutates: true,
      schema: z.object({
        title: z.string(),
        body: z.string(),
        summary: z.string().describe("one-line summary shown in the index"),
        category: z
          .string()
          .optional()
          .describe("single section for the index (e.g. 'Animals')"),
        tags: z.array(z.string()).optional(),
        slug: z.string().optional().describe("optional; derived from title if omitted"),
      }),
      run: async (input) => {
        const page = await deps.wiki.savePage(input);
        return `Wrote page "${page.slug}".`;
      },
    }),
  ];
}
