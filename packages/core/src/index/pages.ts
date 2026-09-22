import type Database from "better-sqlite3";
import { ROLES, type Role } from "@sammer/shared";

export interface PageSummary {
  slug: string;
  title: string;
  category: string;
  summary: string;
  role: Role;
  updated: string;
}

export function listPageSlugs(db: Database.Database, maxRank: number): string[] {
  const rows = db.prepare("SELECT slug FROM pages WHERE role_rank <= ? ORDER BY slug").all(maxRank) as {
    slug: string;
  }[];
  return rows.map((r) => r.slug);
}

export function listPageSummaries(db: Database.Database, maxRank: number): PageSummary[] {
  const rows = db
    .prepare(
      "SELECT slug, title, category, summary, role_rank, updated FROM pages WHERE role_rank <= ? ORDER BY category, title",
    )
    .all(maxRank) as {
    slug: string;
    title: string;
    category: string;
    summary: string;
    role_rank: number;
    updated: string;
  }[];
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    category: r.category,
    summary: r.summary,
    role: ROLES[r.role_rank] ?? "admin",
    updated: r.updated,
  }));
}
