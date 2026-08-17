import matter from "gray-matter";
import { EPOCH, toIso, type Page } from "@sammer/shared";
import { extractLinks } from "./links.js";

// A page hand-added to the vault carries no `created`/`updated`. Callers that
// know when the file was actually written pass those timestamps here rather
// than letting the page date itself to 1970.
export interface PageDates {
  created?: string;
  updated?: string;
}

export function parsePage(slug: string, markdown: string, dates: PageDates = {}): Page {
  const { data, content } = matter(markdown);
  const body = content.replace(/^\n+/, "");
  return {
    id: String(data.id ?? slug),
    title: String(data.title ?? slug),
    slug: String(data.slug ?? slug),
    category: String(data.category ?? "Uncategorized"),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    summary: String(data.summary ?? ""),
    created: toIso(data.created, dates.created ?? EPOCH),
    updated: toIso(data.updated, dates.updated ?? EPOCH),
    sources: Array.isArray(data.sources) ? data.sources.map(String) : [],
    body,
    links: extractLinks(body),
  };
}

export function serializePage(page: Page): string {
  const fm = {
    id: page.id,
    title: page.title,
    slug: page.slug,
    category: page.category,
    tags: page.tags,
    summary: page.summary,
    created: page.created,
    updated: page.updated,
    sources: page.sources,
  };
  return matter.stringify(page.body, fm);
}
