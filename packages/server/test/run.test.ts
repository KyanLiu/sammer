import { describe, it, expect } from "vitest";
import { buildServer } from "../src/app.js";
import { fakeDeps } from "./helpers.js";

describe("POST /run", () => {
  it("answers using the deps' run()", async () => {
    const app = await buildServer(fakeDeps({ run: async (prompt) => `ran: ${prompt}` }));

    const res = await app.inject({ method: "POST", url: "/run", payload: { prompt: "remember this" } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ answer: "ran: remember this" });
  });

  it("400s when prompt is missing", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "POST", url: "/run", payload: {} });

    expect(res.statusCode).toBe(400);
  });

  it("passes readOnly and maxSteps through when given", async () => {
    let seenReadOnly: boolean | undefined;
    let seenMaxSteps: number | undefined;
    const app = await buildServer(
      fakeDeps({
        run: async (_prompt, opts) => {
          seenReadOnly = opts?.readOnly;
          seenMaxSteps = opts?.maxSteps;
          return "ok";
        },
      }),
    );

    await app.inject({
      method: "POST",
      url: "/run",
      payload: { prompt: "p", readOnly: true, maxSteps: 2 },
    });

    expect(seenReadOnly).toBe(true);
    expect(seenMaxSteps).toBe(2);
  });

  it("400s when readOnly is not a boolean", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "POST", url: "/run", payload: { prompt: "p", readOnly: "yes" } });

    expect(res.statusCode).toBe(400);
  });
});
