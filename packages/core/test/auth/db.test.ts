import { describe, it, expect } from "vitest";
import { openAuthDb } from "../../src/auth/db.js";

describe("openAuthDb", () => {
  it("creates users, sessions, and guest-ask-counter tables", () => {
    const db = openAuthDb(":memory:");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["users", "sessions", "guest_asks", "guest_asks_total"]),
    );
  });
});
