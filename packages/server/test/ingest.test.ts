import { describe, it, expect } from "vitest";
import { buildServer } from "../src/app.js";
import { fakeDeps, fakeIngestResult } from "./helpers.js";

describe("POST /ingest", () => {
  it("ingests text using the deps' ingest()", async () => {
    const seen: { text?: string; source?: unknown } = {};
    const app = await buildServer(
      fakeDeps({
        ingest: async (text, opts) => {
          seen.text = text;
          seen.source = opts?.source;
          return fakeIngestResult("wrote a page");
        },
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/ingest",
      payload: { text: "capybaras are large rodents" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(fakeIngestResult("wrote a page"));
    expect(seen.text).toBe("capybaras are large rodents");
    expect(seen.source).toBeUndefined();
  });

  it("passes source through when given", async () => {
    let seenSource: unknown;
    const app = await buildServer(
      fakeDeps({
        ingest: async (_text, opts) => {
          seenSource = opts?.source;
          return fakeIngestResult("ok");
        },
      }),
    );

    await app.inject({
      method: "POST",
      url: "/ingest",
      payload: { text: "t", source: { origin: "api", title: "note" } },
    });

    expect(seenSource).toEqual({ origin: "api", title: "note" });
  });

  it("400s when text is missing", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({ method: "POST", url: "/ingest", payload: {} });

    expect(res.statusCode).toBe(400);
  });

  it("400s when source has no origin", async () => {
    const app = await buildServer(fakeDeps());

    const res = await app.inject({
      method: "POST",
      url: "/ingest",
      payload: { text: "t", source: { title: "note" } },
    });

    expect(res.statusCode).toBe(400);
  });
});
