import { describe, it, expect } from "vitest";
import { openAuthDb } from "../../src/auth/db.js";
import { createUser, verifyUser } from "../../src/auth/users.js";

describe("createUser / verifyUser", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const db = openAuthDb(":memory:");
    await createUser(db, "admin@example.com", "correct horse battery staple", "admin");

    expect(await verifyUser(db, "admin@example.com", "correct horse battery staple")).toMatchObject({
      email: "admin@example.com",
      role: "admin",
    });
    expect(await verifyUser(db, "admin@example.com", "wrong")).toBeNull();
    expect(await verifyUser(db, "nobody@example.com", "x")).toBeNull();
  });

  it("refuses a duplicate email", async () => {
    const db = openAuthDb(":memory:");
    await createUser(db, "a@example.com", "p", "friend");
    await expect(createUser(db, "a@example.com", "p2", "admin")).rejects.toThrow(/already exists/);
  });
});
