import type Database from "better-sqlite3";
import type { SearchHit } from "@sammer/shared";

/** Default result count. */
const DEFAULT_K = 5;

/** Ordinal of `body` in pages_fts (slug, title, summary, body) — snippet() takes
 * a column index, so this must track the schema's column order. */
const FTS_BODY_COLUMN = 3;

/** Tokens of context around a match in a snippet — roughly a sentence or two, so
 * a hit reads at about the same weight as the summary an expansion hit carries. */
const SNIPPET_TOKENS = 30;

/** Score for a page reached by link expansion rather than by matching. Positive
 * so it outranks nothing, small enough to sort below every real keyword hit. */
const LINK_HIT_SCORE = 0.0001;

// Keyword (BM25) search over pages_fts, with optional 1+ hop link-graph expansion.
export function keywordSearch(
  db: Database.Database,
  query: string,
  opts: { k?: number; expandHops?: number } = {},
): SearchHit[] {
  const k = opts.k ?? DEFAULT_K;
  const hops = opts.expandHops ?? 0;

  const match = escapeFts(query);
  const rows = match
    ? (db
        .prepare(
          `SELECT slug, title, bm25(pages_fts) AS bm,
                  snippet(pages_fts, ${FTS_BODY_COLUMN}, '', '', '…', ${SNIPPET_TOKENS}) AS snip
           FROM pages_fts
           WHERE pages_fts MATCH ?
           ORDER BY bm25(pages_fts)
           LIMIT ?`,
        )
        .all(match, k) as { slug: string; title: string; bm: number; snip: string }[])
    : [];

  const hits = new Map<string, SearchHit>();
  for (const r of rows) {
    // bm25 returns lower (more negative) = better; negate so higher score = better.
    hits.set(r.slug, { slug: r.slug, title: r.title, score: -r.bm, snippet: r.snip });
  }

  if (hops > 0) expand(db, [...hits.keys()], hops, hits);

  return [...hits.values()].sort((a, b) => b.score - a.score);
}

function expand(
  db: Database.Database,
  seeds: string[],
  hops: number,
  hits: Map<string, SearchHit>,
): void {
  const linkStmt = db.prepare(
    `SELECT p.slug AS slug, p.title AS title, p.summary AS summary
     FROM links l JOIN pages p ON p.slug = l.dst_slug
     WHERE l.src_slug = ?`,
  );
  let frontier = [...seeds];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const src of frontier) {
      for (const row of linkStmt.all(src) as { slug: string; title: string; summary: string }[]) {
        if (!hits.has(row.slug)) {
          hits.set(row.slug, {
            slug: row.slug,
            title: row.title,
            score: LINK_HIT_SCORE,
            snippet: row.summary,
          });
          next.push(row.slug);
        }
      }
    }
    frontier = next;
  }
}

// FTS5 treats punctuation as syntax; quote each term so it matches literally.
function escapeFts(query: string): string {
  const terms = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (terms.length === 0) return "";
  return terms.map((t) => `"${t}"`).join(" OR ");
}
