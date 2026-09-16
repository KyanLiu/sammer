#!/usr/bin/env node
import { join } from "node:path";
import { loadConfig, loadDotEnv } from "@sammer/shared";
import { Engine, createTraceListener, openAuthDb } from "@sammer/core";
import { buildServer } from "./app.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}


async function main(): Promise<void> {
  loadDotEnv();
  const cfg = loadConfig();
  const engine = await Engine.create(cfg);
  engine.telemetry.subscribe(createTraceListener((line) => console.log(line)));

  const authDb = openAuthDb(join(cfg.dataDir, "auth.db"));
  const cookieSecret = requireEnv("COOKIE_SECRET");

  const app = await buildServer(engine, {
    logger: true,
    trustProxy: process.env.TRUST_PROXY === "true",
    rateLimit: {
      max: Number(process.env.RATE_LIMIT_MAX ?? 100),
      timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    },
    auth: { db: authDb, cookieSecret },
    guestQuota: {
      authDb,
      limits: {
        perIp: Number(process.env.GUEST_DAILY_IP_ASK_CAP ?? 5),
        total: Number(process.env.GUEST_DAILY_ASK_CAP ?? 50),
      },
    },
    webDist: process.env.WEB_DIST,
    corsOrigin: process.env.CORS_ORIGIN,
  });

  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  console.log(`sammer server listening on http://${host}:${port}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received, shutting down...`);
    await app.close();
    engine.close();
    authDb.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 1;
});
