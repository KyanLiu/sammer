import type Database from "better-sqlite3";
import { DEFAULT_PAGE_ROLE, roleRank, type Page } from "@sammer/shared";

export class Indexer {
  constructor(private readonly db: Database.Database) {}

  removePage(pageId: string): void {
    const row = this.db.prepare("SELECT slug FROM pages WHERE id = ?").get(pageId) as
      | { slug: string }
      | undefined;
    if (row) {
      this.db.prepare("DELETE FROM pages_fts WHERE slug = ?").run(row.slug);
      this.db.prepare("DELETE FROM links WHERE src_slug = ?").run(row.slug);
    }
    this.db.prepare("DELETE FROM pages WHERE id = ?").run(pageId);
  }

  upsertPage(page: Page): void {
    const { id, slug, title, category, summary, updated, role } = page.metadata;
    const roleRankValue = roleRank(role ?? DEFAULT_PAGE_ROLE);
    const tx = this.db.transaction(() => {
      this.removePage(id);
      this.db.prepare("DELETE FROM pages_fts WHERE slug = ?").run(slug);
      this.db.prepare("DELETE FROM links WHERE src_slug = ?").run(slug);
      this.db.prepare("DELETE FROM pages WHERE slug = ?").run(slug);

      this.db
        .prepare(
          "INSERT INTO pages (id, slug, title, category, summary, updated, role_rank) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, slug, title, category, summary, updated, roleRankValue);
      this.db
        .prepare("INSERT INTO pages_fts (slug, title, summary, body) VALUES (?, ?, ?, ?)")
        .run(slug, title, summary, page.body);
      const insLink = this.db.prepare("INSERT INTO links (src_slug, dst_slug) VALUES (?, ?)");
      for (const dst of page.links) insLink.run(slug, dst);
    });
    tx();
  }
}
