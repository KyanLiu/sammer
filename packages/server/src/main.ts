#!/usr/bin/env node
import { loadConfig, loadDotEnv } from "@sammer/shared";
import { Engine, createTraceListener } from "@sammer/core";
import { buildServer } from "./app.js";

async function main(): Promise<void> {
  loadDotEnv();
  const cfg = loadConfig();
  const engine = await Engine.create(cfg);
  engine.telemetry.subscribe(createTraceListener((line) => console.log(line)));
  const app = await buildServer(engine, {
    logger: true,
    trustProxy: process.env.TRUST_PROXY === "true",
    rateLimit: {
      max: Number(process.env.RATE_LIMIT_MAX ?? 100),
      timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    },
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
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 1;
});
