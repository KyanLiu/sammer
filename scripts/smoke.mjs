// End-to-end smoke test against a real LLM. Not part of `vitest run`: it needs
// network and costs money, so it is invoked deliberately.
//
//   LLM_API_KEY=sk-... node scripts/smoke.mjs
//
// Everything in the test suite mocks the LLM, so this is the only thing that
// exercises the OpenAI adapter, the tool-call wire format, and the loop against
// a real model. It writes to a scratch vault (./data-smoke by default) rather
// than your real one; set DATA_DIR to point it elsewhere.
//
// Imports from dist/ deliberately — the same public entry point an app would
// use. Run `pnpm build` first if you have edited src/.

import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../packages/shared/dist/index.js";
import { Engine } from "../packages/core/dist/index.js";

const FACT =
  "Capybaras are the largest living rodent, native to South America. They are " +
  "semi-aquatic and highly social, living in groups of 10 to 20.";
const QUESTION = "What is the largest living rodent, and how social is it?";

let failures = 0;

// Each stage prints what it proves, so a failure says which layer broke rather
// than just which line threw.
async function stage(name, proves, fn) {
  const started = Date.now();
  process.stdout.write(`\n▶ ${name}\n  proves: ${proves}\n`);
  // The stages form a chain — no page written means nothing to index, search or
  // answer from. Reporting four failures for one broken link buries the cause.
  if (failures > 0) {
    console.log("  – skipped (an earlier stage failed)");
    return false;
  }
  try {
    const detail = await fn();
    console.log(`  ✓ ok (${Date.now() - started}ms)${detail ? `\n${indent(detail)}` : ""}`);
    return true;
  } catch (e) {
    failures++;
    console.log(`  ✗ FAILED (${Date.now() - started}ms)\n${indent(String(e?.stack ?? e))}`);
    return false;
  }
}

const indent = (s) =>
  String(s)
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Forgetting the key is the likeliest way to run this wrong, and a raw ZodError
// stack is a poor way to be told so.
if (!process.env.LLM_API_KEY) {
  console.error("LLM_API_KEY is not set.\n\n  LLM_API_KEY=sk-... node scripts/smoke.mjs\n");
  process.exit(2);
}

const cfg = loadConfig({ ...process.env, DATA_DIR: process.env.DATA_DIR ?? "./data-smoke" });
const wikiDir = join(cfg.dataDir, "wiki");

// baseUrl and chatModel are provider defaults when unset, resolved in the adapter.
const orDefault = (v) => v ?? "(provider default)";
console.log(`sammer smoke test
  provider: ${cfg.llm.provider}
  model:    ${orDefault(cfg.llm.chatModel)}
  baseUrl:  ${orDefault(cfg.llm.baseUrl)}
  dataDir:  ${cfg.dataDir}`);

// A fresh vault each run, so a pass means the flow works from nothing — not
// that a page left over from the last run happened to answer the question.
if (!process.env.KEEP) await rm(cfg.dataDir, { recursive: true, force: true });

const engine = await Engine.create(cfg);

await stage("ingest", "the curation loop runs and the model calls write_page", async () => {
  const summary = await engine.ingest(FACT);
  assert(summary && !/step limit/i.test(summary), `no usable summary: ${summary}`);
  return `summary: ${summary}`;
});

await stage("page on disk", "a real .md file was written with parseable frontmatter", async () => {
  const files = (await readdir(wikiDir)).filter((f) => f.endsWith(".md"));
  const pages = files.filter((f) => f !== "index.md" && f !== "log.md");
  assert(pages.length > 0, `no content pages in ${wikiDir} (saw: ${files.join(", ") || "nothing"})`);

  const body = await readFile(join(wikiDir, pages[0]), "utf8");
  assert(body.startsWith("---"), `${pages[0]} has no frontmatter block`);
  return `files: ${files.join(", ")}\n\n${body.slice(0, 400)}`;
});

await stage("catalog", "the engine regenerated index.md after ingest", async () => {
  const index = await readFile(join(wikiDir, "index.md"), "utf8");
  assert(/\[\[.+\]\]/.test(index), "index.md lists no pages");
  return index.slice(0, 400);
});

await stage("search", "the SQLite index was populated and FTS matches", async () => {
  const hits = await engine.search("capybara");
  assert(hits.length > 0, "no hits for 'capybara'");
  return hits.map((h) => `- ${h.slug}: ${h.snippet}`).join("\n");
});

await stage("ask", "the read loop navigates the wiki and answers from it", async () => {
  const answer = await engine.ask(QUESTION);
  assert(answer && !/step limit/i.test(answer), `no usable answer: ${answer}`);
  // Not asserted, only reported: the prompt asks for [[slug]] citations, and
  // whether the model obliges is a prompt-quality signal, not a wiring failure.
  const cited = /\[\[.+\]\]/.test(answer);
  return `${answer}\n\ncites pages: ${cited ? "yes" : "no — worth a look at CONVERSATION_SYSTEM"}`;
});

console.log(
  failures === 0
    ? `\n✓ all stages passed — the engine works end to end.\n  vault kept at ${cfg.dataDir} (rm -rf it when done)`
    : `\n✗ failed at the stage above — later stages were skipped.\n  vault left at ${cfg.dataDir} for inspection`,
);
process.exit(failures === 0 ? 0 : 1);
