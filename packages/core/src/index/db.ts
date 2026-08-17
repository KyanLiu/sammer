import Database from "better-sqlite3";
import { DDL } from "./schema.js";

export function openIndexDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(DDL);
  return db;
}
