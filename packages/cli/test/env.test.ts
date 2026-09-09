import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDotEnv } from "../src/env.js";

const VARS = ["SAMMER_TEST_KEY", "SAMMER_TEST_OTHER"];

afterEach(() => {
  for (const name of VARS) delete process.env[name];
});

async function dirWith(dotenv?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sammer-env-"));
  if (dotenv !== undefined) await writeFile(join(dir, ".env"), dotenv, "utf8");
  return dir;
}

describe("loadDotEnv", () => {
  it("reads values from a .env in the given directory", async () => {
    const dir = await dirWith("SAMMER_TEST_KEY=from_file\n");

    loadDotEnv(dir);

    expect(process.env.SAMMER_TEST_KEY).toBe("from_file");
  });

  it("leaves a variable already set in the environment alone", async () => {
    const dir = await dirWith("SAMMER_TEST_KEY=from_file\n");
    process.env.SAMMER_TEST_KEY = "from_shell";

    loadDotEnv(dir);

    expect(process.env.SAMMER_TEST_KEY).toBe("from_shell");
  });

  it("does nothing when there is no .env", async () => {
    const dir = await dirWith();

    expect(() => loadDotEnv(dir)).not.toThrow();
    expect(process.env.SAMMER_TEST_KEY).toBeUndefined();
  });

  it("reports a .env it cannot read rather than ignoring it", async () => {
    const dir = await dirWith();
    await mkdir(join(dir, ".env"));

    expect(() => loadDotEnv(dir)).toThrow();
  });
});
