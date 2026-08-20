import matter from "gray-matter";
import { EPOCH, toIso, type Page, type Slug, type SourceMetadata } from "@sammer/shared";
import { extractLinks } from "./links.js";

// A page hand-added to the vault carries no `created`/`updated`. Callers that
// know when the file was actually written pass those timestamps here rather
// than letting the page date itself to 1970.
export interface PageDates {
  created?: string;
  updated?: string;
}

export function parsePage(slug: Slug, markdown: string, dates: PageDates = {}): Page {
  const { data, content } = matter(markdown);
  const body = content.replace(/^\n+/, "");
  return {
    // Built in the order it is written back out, so a round-trip leaves the
    // frontmatter's field order untouched.
    metadata: {
      id: String(data.id ?? slug),
      title: String(data.title ?? slug),
      slug: String(data.slug ?? slug),
      category: String(data.category ?? "Uncategorized"),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      summary: String(data.summary ?? ""),
      created: toIso(data.created, dates.created ?? EPOCH),
      updated: toIso(data.updated, dates.updated ?? EPOCH),
      sources: Array.isArray(data.sources) ? (data.sources as SourceMetadata[]) : [],
    },
    body,
    links: extractLinks(body),
  };
}

// PageMetadata is exactly the set of fields kept in frontmatter, so it is written
// wholesale rather than listed field by field — the two cannot fall out of step.
export function serializePage(page: Page): string {
  return matter.stringify(page.body, page.metadata);
}
