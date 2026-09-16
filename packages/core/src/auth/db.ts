import Database from "better-sqlite3";
import { AUTH_DDL } from "./schema.js";

export function openAuthDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(AUTH_DDL);
  return db;
}
