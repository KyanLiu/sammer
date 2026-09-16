import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { ROLES, type Role } from "@sammer/shared";

export class UserCommandError extends Error {}

export interface UserAdder {
  addUser(email: string, password: string, role: Role): Promise<{ id: string; email: string; role: Role }>;
}

export interface UserAddOptions {
  email?: string;
  role?: string;
  input?: Readable;
  output?: Writable;
}

export async function userAddCommand(adder: UserAdder, opts: UserAddOptions): Promise<void> {
  if (!opts.email) {
    throw new UserCommandError("user add needs an email: sammer user add <email> --role <role>");
  }
  const role = opts.role as Role | undefined;
  if (!role || !(ROLES as readonly string[]).includes(role)) {
    throw new UserCommandError(`--role must be one of ${ROLES.join(", ")}`);
  }

  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const rl = createInterface({ input, output });
  const password = (await rl.question("Password: ")).trim();
  rl.close();
  if (!password) throw new UserCommandError("password cannot be empty");

  const user = await adder.addUser(opts.email, password, role);
  output.write(`Created ${user.role} account for ${user.email}.\n`);
}
