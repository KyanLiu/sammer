import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openIndexDb } from "../../src/index/db.js";

describe("openIndexDb", () => {
  it("creates the pages table with a role_rank column", () => {
    const db = openIndexDb(":memory:");
    const columns = db.prepare("PRAGMA table_info(pages)").all() as { name: string }[];
    expect(columns.map((c) => c.name)).toContain("role_rank");
  });

  it("drops and recreates tables from an older schema version instead of failing", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "sammer-db-")), "index.db");
    const old = new Database(path);
    old.exec("CREATE TABLE pages (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL)");
    old.close();

    const db = openIndexDb(path);
    const columns = db.prepare("PRAGMA table_info(pages)").all() as { name: string }[];
    expect(columns.map((c) => c.name)).toContain("role_rank");
  });
});
