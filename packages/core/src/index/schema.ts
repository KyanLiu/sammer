// Derived, rebuildable index. FTS5 gives BM25 keyword ranking over whole pages;
// `links` is the [[wikilink]] graph. No vector table — retrieval is keyword + graph.
export const DDL = `
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  slug UNINDEXED, title, summary, body
);
CREATE TABLE IF NOT EXISTS links (
  src_slug TEXT NOT NULL,
  dst_slug TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_src ON links(src_slug);
CREATE INDEX IF NOT EXISTS idx_links_dst ON links(dst_slug);
`;
