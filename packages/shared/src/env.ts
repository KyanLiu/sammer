import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function findWorkspaceRoot(dir: string = process.cwd()): string {
  let current = dir;
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error(`no pnpm-workspace.yaml found above ${dir}`);
    current = parent;
  }
}

export function loadDotEnv(dir: string = findWorkspaceRoot()): void {
  try {
    process.loadEnvFile(join(dir, ".env"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
