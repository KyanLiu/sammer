#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadConfig, loadDotEnv } from "@sammer/shared";
import { Engine } from "@sammer/core";
import { ingestCommand, UsageError } from "./commands/ingest.js";
import { chatCommand } from "./commands/chat.js";
import { formatHits, formatPages } from "./commands/search.js";
import { USAGE } from "./usage.js";
import { createTraceListener } from "./eventFormatter.js";

const INGEST_MAX_ITERATIONS = 16;
const TITLE_LENGTH = 80;
const firstLine = (text: string) => text.trim().split("\n", 1)[0]!.slice(0, TITLE_LENGTH);

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h", default: false },
      "read-only": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "max-steps": { type: "string" },
    },
  });

  const [command, ...rest] = positionals;
  if (values.help || !command) {
    if (values.help) console.log(USAGE);
    else console.error(USAGE);
    return values.help ? 0 : 2;
  }

  const maxSteps = values["max-steps"] === undefined ? undefined : Number(values["max-steps"]);
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps < 1)) {
    throw new UsageError(`--max-steps must be a positive integer, got "${values["max-steps"]}"`);
  }

  loadDotEnv();
  const cfg = loadConfig();
  const engine = await Engine.create(cfg);
  engine.telemetry.subscribe(createTraceListener((line) => console.log(line)));

  try {
    switch (command) {
      case "chat":
        await chatCommand(engine, { readOnly: values["read-only"] });
        return 0;

      case "ingest": {
        const result = await ingestCommand(
          engine,
          { paths: rest, maxSteps: maxSteps ?? INGEST_MAX_ITERATIONS, dryRun: values["dry-run"] },
          (line) => console.log(line),
        );
        const pages = await engine.listPages();
        const extra = [
          result.archived ? `${result.archived} archived only` : "",
          result.skipped ? `${result.skipped} already ingested` : "",
        ].filter(Boolean);
        const counts = [`${result.ingested} ingested`, ...extra, `${result.failed} failed`];
        console.log(`\n${counts.join(", ")} — the vault holds ${pages.length} pages.`);
        return result.failed === 0 ? 0 : 1;
      }

      case "tell": {
        const text = rest.join(" ");
        if (!text.trim()) throw new UsageError("tell needs some text");
        const { summary } = await engine.ingest(text, {
          maxSteps: maxSteps ?? INGEST_MAX_ITERATIONS,
          source: { origin: "cli", kind: "text", title: firstLine(text) },
        });
        console.log(summary);
        return 0;
      }

      case "ask": {
        const question = rest.join(" ");
        if (!question.trim()) throw new UsageError("ask needs a question");
        console.log(await engine.ask(question, { maxSteps }));
        return 0;
      }

      case "search": {
        const query = rest.join(" ");
        if (!query.trim()) throw new UsageError("search needs a query");
        console.log(formatHits(await engine.search(query)));
        return 0;
      }

      case "pages":
        console.log(formatPages(await engine.listPages()));
        return 0;

      default:
        throw new UsageError(`unknown command "${command}"`);
    }
  } finally {
    engine.close();
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError) {
    console.error(`${e.message}\n\n${USAGE}`);
    process.exitCode = 2;
  } else if (e && typeof e === "object" && "issues" in e) {
    // an environment variable is missing
    const missing = (e as { issues: { message: string }[] }).issues.map((i) => i.message);
    console.error(`configuration problem:\n${missing.map((m) => `  - ${m}`).join("\n")}`);
    process.exitCode = 2;
  } else {
    console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exitCode = 1;
  }
}
