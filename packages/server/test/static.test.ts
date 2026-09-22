import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAuthDb } from "@sammer/core";
import { buildServer } from "../src/app.js";
import { fakeDeps, adminCookie } from "./helpers.js";

describe("static web serving", () => {
  it("serves the built web app and falls back to index.html for client routes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sammer-web-dist-"));
    await writeFile(join(dir, "index.html"), "<html>sammer</html>");
    await writeFile(join(dir, "app.js"), "console.log('hi')");

    const app = await buildServer(fakeDeps(), { webDist: dir });

    const asset = await app.inject({ method: "GET", url: "/app.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain("console.log");

    const clientRoute = await app.inject({ method: "GET", url: "/some/client/route" });
    expect(clientRoute.statusCode).toBe(200);
    expect(clientRoute.body).toContain("sammer");
  });

  it("does not shadow API routes with the SPA fallback", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sammer-web-dist-"));
    await writeFile(join(dir, "index.html"), "<html>sammer</html>");

    const authDb = openAuthDb(":memory:");
    const app = await buildServer(fakeDeps({ listPageSummaries: async () => [] }), {
      webDist: dir,
      auth: { db: authDb, cookieSecret: "test-secret" },
    });
    const cookie = await adminCookie(app, authDb);

    const res = await app.inject({ method: "GET", url: "/pages", headers: { cookie } });
    expect(res.json()).toEqual([]);
  });
});
