import { describe, it, expect } from "vitest";
import { buildServer } from "../src/app.js";
import { fakeDeps } from "./helpers.js";

describe("POST /ask", () => {
  it("answers using the deps' ask()", async () => {
    const app = await buildServer(
      fakeDeps({ ask: async (question) => `answer to: ${question}` }),
    );

    const res = await app.inject({ method: "POST", url: "/ask", payload: { question: "what is a cat?" } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ answer: "answer to: what is a cat?" });
  });

  it("400s when question is missing", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "POST", url: "/ask", payload: {} });

    expect(res.statusCode).toBe(400);
  });

  it("400s when question is blank", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "POST", url: "/ask", payload: { question: "   " } });

    expect(res.statusCode).toBe(400);
  });

  it("passes maxSteps through when given", async () => {
    let seen: number | undefined;
    const app = await buildServer(
      fakeDeps({
        ask: async (_question, opts) => {
          seen = opts?.maxSteps;
          return "ok";
        },
      }),
    );

    await app.inject({ method: "POST", url: "/ask", payload: { question: "q", maxSteps: 4 } });

    expect(seen).toBe(4);
  });
});
