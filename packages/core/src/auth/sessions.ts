import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import type { Caller, Role } from "@sammer/shared";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession(db: Database.Database, userId: string): { id: string; expiresAt: string } {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, userId, expiresAt);
  return { id, expiresAt };
}

export function resolveSession(db: Database.Database, sessionId: string): Caller | null {
  const row = db
    .prepare(
      `SELECT sessions.user_id AS userId, sessions.expires_at AS expiresAt,
              users.email AS email, users.role AS role
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ?`,
    )
    .get(sessionId) as { userId: string; expiresAt: string; email: string; role: Role } | undefined;
  if (!row) return null;

  if (Date.parse(row.expiresAt) < Date.now()) {
    deleteSession(db, sessionId);
    return null;
  }
  return { userId: row.userId, email: row.email, role: row.role };
}

export function deleteSession(db: Database.Database, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
