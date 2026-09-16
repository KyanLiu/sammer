import Database from "better-sqlite3";
import { DDL } from "./schema.js";

export function openIndexDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec("DROP TABLE IF EXISTS pages; DROP TABLE IF EXISTS pages_fts; DROP TABLE IF EXISTS links;");
  db.exec(DDL);
  return db;
}
