import { join } from "node:path";

export function loadDotEnv(dir: string = process.cwd()): void {
  try {
    process.loadEnvFile(join(dir, ".env"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
