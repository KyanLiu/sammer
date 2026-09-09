import type { SearchHit } from "@sammer/shared";

export function formatHits(hits: SearchHit[]): string {
  if (hits.length === 0) return "No matching pages.";
  return hits
    .map((hit) => `${hit.slug}  ${hit.title}\n    ${hit.snippet.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

export function formatPages(slugs: string[]): string {
  return slugs.length ? slugs.join("\n") : "The wiki is empty.";
}
