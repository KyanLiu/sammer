import type Database from "better-sqlite3";

export interface PageSummary {
  slug: string;
  title: string;
  category: string;
  summary: string;
}

export function listPageSlugs(db: Database.Database, maxRank: number): string[] {
  const rows = db.prepare("SELECT slug FROM pages WHERE role_rank <= ? ORDER BY slug").all(maxRank) as {
    slug: string;
  }[];
  return rows.map((r) => r.slug);
}

export function listPageSummaries(db: Database.Database, maxRank: number): PageSummary[] {
  return db
    .prepare(
      "SELECT slug, title, category, summary FROM pages WHERE role_rank <= ? ORDER BY category, title",
    )
    .all(maxRank) as PageSummary[];
}
