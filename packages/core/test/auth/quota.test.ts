import { describe, it, expect } from "vitest";
import { openAuthDb } from "../../src/auth/db.js";
import { tryConsumeGuestQuota } from "../../src/auth/quota.js";

describe("tryConsumeGuestQuota", () => {
  it("allows requests under both limits, then blocks the requesting IP at its own cap", () => {
    const db = openAuthDb(":memory:");
    const limits = { perIp: 2, total: 10 };

    expect(tryConsumeGuestQuota(db, "1.1.1.1", limits)).toEqual({ ok: true });
    expect(tryConsumeGuestQuota(db, "1.1.1.1", limits)).toEqual({ ok: true });
    expect(tryConsumeGuestQuota(db, "1.1.1.1", limits)).toEqual({ ok: false, reason: "ip" });

    // A different IP is unaffected by the first one's per-IP cap.
    expect(tryConsumeGuestQuota(db, "2.2.2.2", limits)).toEqual({ ok: true });
  });

  it("blocks every IP once the global daily total is reached", () => {
    const db = openAuthDb(":memory:");
    const limits = { perIp: 10, total: 2 };

    expect(tryConsumeGuestQuota(db, "1.1.1.1", limits)).toEqual({ ok: true });
    expect(tryConsumeGuestQuota(db, "2.2.2.2", limits)).toEqual({ ok: true });
    expect(tryConsumeGuestQuota(db, "3.3.3.3", limits)).toEqual({ ok: false, reason: "global" });
  });
});
