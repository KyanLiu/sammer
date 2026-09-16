import { DEFAULT_PAGE_ROLE, roleRank } from "@sammer/shared";

export const DDL = `
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  updated TEXT NOT NULL,
  role_rank INTEGER NOT NULL DEFAULT ${roleRank(DEFAULT_PAGE_ROLE)}
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
