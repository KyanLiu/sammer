/**
 * Reduce a title to its canonical slug — the page's filename and its identity in
 * links, search, and URLs. Lowercase, with every run of non-alphanumerics
 * collapsed to a single hyphen and the ends trimmed.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
