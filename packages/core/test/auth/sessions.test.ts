import { describe, it, expect } from "vitest";
import { openAuthDb } from "../../src/auth/db.js";
import { createUser } from "../../src/auth/users.js";
import { createSession, resolveSession, deleteSession } from "../../src/auth/sessions.js";

describe("sessions", () => {
  it("resolves a live session back to its user's id, email, and role", async () => {
    const db = openAuthDb(":memory:");
    const user = await createUser(db, "a@example.com", "p", "admin");
    const session = createSession(db, user.id);

    expect(resolveSession(db, session.id)).toEqual({ userId: user.id, email: user.email, role: "admin" });
  });

  it("returns null for an unknown session id", () => {
    const db = openAuthDb(":memory:");
    expect(resolveSession(db, "nope")).toBeNull();
  });

  it("returns null and deletes an expired session", async () => {
    const db = openAuthDb(":memory:");
    const user = await createUser(db, "a@example.com", "p", "admin");
    const session = createSession(db, user.id);
    db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      session.id,
    );

    expect(resolveSession(db, session.id)).toBeNull();
    expect(db.prepare("SELECT id FROM sessions WHERE id = ?").get(session.id)).toBeUndefined();
  });

  it("deleteSession makes the session unresolvable", async () => {
    const db = openAuthDb(":memory:");
    const user = await createUser(db, "a@example.com", "p", "admin");
    const session = createSession(db, user.id);

    deleteSession(db, session.id);

    expect(resolveSession(db, session.id)).toBeNull();
  });
});
