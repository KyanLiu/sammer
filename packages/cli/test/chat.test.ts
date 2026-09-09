import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { chatCommand, type Conversant } from "../src/commands/chat.js";

function fakeConversant(answer = "I know things."): Conversant & { turns: string[] } {
  const turns: string[] = [];
  return {
    turns,
    async run(prompt) {
      turns.push(prompt);
      return answer;
    },
  };
}

function streams() {
  const input = new PassThrough();
  const output = new PassThrough();
  const written: string[] = [];
  output.on("data", (chunk) => written.push(String(chunk)));
  return { input, output, text: () => written.join("") };
}

describe("chat command", () => {
  it("answers a line and exits on /exit", async () => {
    const engine = fakeConversant("The capybara.");
    const { input, output, text } = streams();

    const done = chatCommand(engine, { readOnly: false, input, output });
    input.write("what is the largest rodent\n");
    input.write("/exit\n");
    await done;

    expect(engine.turns).toEqual(["what is the largest rodent"]);
    expect(text()).toContain("The capybara.");
  });

  it("exits cleanly when stdin ends at the prompt", async () => {
    const engine = fakeConversant();
    const { input, output } = streams();

    const done = chatCommand(engine, { readOnly: false, input, output });
    input.end();

    await expect(done).resolves.toBeUndefined();
    expect(engine.turns).toEqual([]);
  });

  it("exits cleanly when stdin ends after an exchange", async () => {
    const engine = fakeConversant();
    const { input, output } = streams();

    const done = chatCommand(engine, { readOnly: false, input, output });
    input.write("hello\n");
    input.end();

    await expect(done).resolves.toBeUndefined();
    expect(engine.turns).toEqual(["hello"]);
  });

  it("forwards read-only to the engine and says so", async () => {
    const engine: Conversant & { readOnly?: boolean } = {
      async run(_prompt, opts) {
        this.readOnly = opts?.readOnly;
        return "ok";
      },
    };
    const { input, output, text } = streams();

    const done = chatCommand(engine, { readOnly: true, input, output });
    input.write("anything\n");
    input.write("/exit\n");
    await done;

    expect(engine.readOnly).toBe(true);
    expect(text()).toContain("read-only");
  });
});
