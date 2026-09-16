import { describe, it, expect } from "vitest";
import { Readable, Writable } from "node:stream";
import { userAddCommand, UserCommandError, type UserAdder } from "../src/commands/user.js";

function collect(): { stream: Writable; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, text: () => chunks.join("") };
}

describe("userAddCommand", () => {
  it("creates a user with the given email, role, and prompted password", async () => {
    const seen: { email: string; password: string; role: string }[] = [];
    const adder: UserAdder = {
      addUser: async (email, password, role) => {
        seen.push({ email, password, role });
        return { id: "u1", email, role };
      },
    };
    const out = collect();

    await userAddCommand(adder, {
      email: "admin@example.com",
      role: "admin",
      input: Readable.from(["hunter2\n"]),
      output: out.stream,
    });

    expect(seen).toEqual([{ email: "admin@example.com", password: "hunter2", role: "admin" }]);
    expect(out.text()).toContain("Created admin account for admin@example.com");
  });

  it("rejects a missing email", async () => {
    const adder: UserAdder = { addUser: async () => ({ id: "u1", email: "e", role: "admin" }) };
    await expect(
      userAddCommand(adder, { role: "admin", input: Readable.from(["p\n"]) }),
    ).rejects.toThrow(UserCommandError);
  });

  it("rejects an invalid role", async () => {
    const adder: UserAdder = { addUser: async () => ({ id: "u1", email: "e", role: "admin" }) };
    await expect(
      userAddCommand(adder, {
        email: "a@example.com",
        role: "superuser",
        input: Readable.from(["p\n"]),
      }),
    ).rejects.toThrow(/--role must be one of/);
  });

  it("rejects an empty password", async () => {
    const adder: UserAdder = { addUser: async () => ({ id: "u1", email: "e", role: "admin" }) };
    await expect(
      userAddCommand(adder, {
        email: "a@example.com",
        role: "admin",
        input: Readable.from(["\n"]),
      }),
    ).rejects.toThrow(/password cannot be empty/);
  });
});
