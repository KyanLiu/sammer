import type Database from "better-sqlite3";
import type { Page } from "@sammer/shared";

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
    const tx = this.db.transaction(() => {
      // Clear any prior rows for this page — by id AND by slug (slug may have changed).
      this.removePage(page.id);
      this.db.prepare("DELETE FROM pages_fts WHERE slug = ?").run(page.slug);
      this.db.prepare("DELETE FROM links WHERE src_slug = ?").run(page.slug);
      this.db.prepare("DELETE FROM pages WHERE slug = ?").run(page.slug);

      this.db
        .prepare(
          "INSERT INTO pages (id, slug, title, category, summary, updated) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(page.id, page.slug, page.title, page.category, page.summary, page.updated);
      this.db
        .prepare("INSERT INTO pages_fts (slug, title, summary, body) VALUES (?, ?, ?, ?)")
        .run(page.slug, page.title, page.summary, page.body);
      const insLink = this.db.prepare("INSERT INTO links (src_slug, dst_slug) VALUES (?, ?)");
      for (const dst of page.links) insLink.run(page.slug, dst);
    });
    tx();
  }
}
