import { describe, it, expect, afterEach } from "vitest";
import { stat } from "node:fs/promises";
import { buildServer } from "../src/app.js";
import { MAX_UPLOAD_BYTES } from "../src/routes/ingest.js";
import { fakeDeps, fakeIngestResult } from "./helpers.js";

function addressOf(app: Awaited<ReturnType<typeof buildServer>>): string {
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("server has no port");
  return `http://127.0.0.1:${address.port}`;
}

describe("POST /ingest/file", () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("streams the upload to a temp file, ingests it, and cleans up", async () => {
    const seenPaths: string[] = [];
    app = await buildServer(
      fakeDeps({
        ingestFile: async (path) => {
          seenPaths.push(path);
          return fakeIngestResult("wrote a page");
        },
      }),
    );
    await app.listen({ port: 0, host: "127.0.0.1" });

    const form = new FormData();
    form.append("file", new Blob(["hello sammer"], { type: "text/plain" }), "note.txt");

    const res = await fetch(`${addressOf(app)}/ingest/file`, { method: "POST", body: form });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fakeIngestResult("wrote a page"));
    expect(seenPaths).toHaveLength(1);
    expect(seenPaths[0]).toMatch(/\.txt$/);
    await expect(stat(seenPaths[0]!)).rejects.toThrow();
  });

  it("400s and does not ingest a file over the size limit", async () => {
    const seenPaths: string[] = [];
    app = await buildServer(
      fakeDeps({
        ingestFile: async (path) => {
          seenPaths.push(path);
          return fakeIngestResult("should not be called");
        },
      }),
    );
    await app.listen({ port: 0, host: "127.0.0.1" });

    const form = new FormData();
    const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    form.append("file", new Blob([oversized], { type: "application/octet-stream" }), "big.bin");

    const res = await fetch(`${addressOf(app)}/ingest/file`, { method: "POST", body: form });

    expect(res.status).toBe(400);
    expect(seenPaths).toHaveLength(0);
  }, 15000);

  it("400s when no file is attached", async () => {
    app = await buildServer(fakeDeps());
    await app.listen({ port: 0, host: "127.0.0.1" });

    const res = await fetch(`${addressOf(app)}/ingest/file`, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body: "--x--",
    });

    expect(res.status).toBe(400);
  });
});
