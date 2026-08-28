import matter from "gray-matter";
import { EPOCH, PageMetadataSchema, type Page, type Slug } from "@sammer/shared";
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
  const fm = PageMetadataSchema.parse(data);
  return {
    metadata: {
      ...fm,
      id: fm.id || slug,
      title: fm.title || slug,
      slug: fm.slug || slug,
      created: fm.created || dates.created || EPOCH,
      updated: fm.updated || dates.updated || EPOCH,
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
