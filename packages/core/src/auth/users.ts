import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import type Database from "better-sqlite3";
import type { Role } from "@sammer/shared";

export interface User {
  id: string;
  email: string;
  role: Role;
}

export async function createUser(
  db: Database.Database,
  email: string,
  password: string,
  role: Role,
): Promise<User> {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) throw new Error(`a user with email "${email}" already exists`);

  const id = randomUUID();
  const passwordHash = await argon2.hash(password);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, email, passwordHash, role, new Date().toISOString());
  return { id, email, role };
}

export async function verifyUser(
  db: Database.Database,
  email: string,
  password: string,
): Promise<User | null> {
  const row = db.prepare("SELECT id, email, password_hash, role FROM users WHERE email = ?").get(
    email,
  ) as { id: string; email: string; password_hash: string; role: Role } | undefined;
  if (!row) return null;

  const valid = await argon2.verify(row.password_hash, password);
  if (!valid) return null;
  return { id: row.id, email: row.email, role: row.role };
}
