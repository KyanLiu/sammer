import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";

export interface Conversant {
  run(prompt: string, opts?: { readOnly?: boolean }): Promise<string>;
}

export interface ChatOptions {
  readOnly: boolean;
  input?: Readable;
  output?: Writable;
}

export async function chatCommand(engine: Conversant, opts: ChatOptions): Promise<void> {
  const output = opts.output ?? process.stdout;
  const rl = createInterface({ input: opts.input ?? process.stdin, output });
  const say = (text: string) => void output.write(`${text}\n`);

  say(
    opts.readOnly
      ? "sammer (read-only) — it can read the wiki but not change it. /exit to quit."
      : "sammer — tell it things to keep, or ask about what it knows. /exit to quit.",
  );

  // Iterating rather than asking question by question: the iterator queues lines
  // that arrive while a turn is still running, and ends on Ctrl-D instead of
  // leaving a question that never settles.
  rl.setPrompt("\n› ");
  rl.prompt();

  try {
    for await (const raw of rl) {
      const line = raw.trim();
      if (line === "/exit" || line === "/quit") break;
      if (!line) {
        rl.prompt();
        continue;
      }

      const answer = await engine.run(line, { readOnly: opts.readOnly });
      say(`\n${answer}`);

      rl.prompt();
    }
  } finally {
    rl.close();
  }
}
