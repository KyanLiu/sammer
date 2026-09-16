import type Database from "better-sqlite3";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface GuestQuotaLimits {
  perIp: number;
  total: number;
}

export interface GuestQuotaResult {
  ok: boolean;
  reason?: "ip" | "global";
}

export function tryConsumeGuestQuota(
  db: Database.Database,
  ip: string,
  limits: GuestQuotaLimits,
): GuestQuotaResult {
  const date = today();
  const tx = db.transaction((): GuestQuotaResult => {
    const ipRow = db.prepare("SELECT count FROM guest_asks WHERE ip = ? AND date = ?").get(ip, date) as
      | { count: number }
      | undefined;
    if ((ipRow?.count ?? 0) >= limits.perIp) return { ok: false, reason: "ip" };

    const totalRow = db.prepare("SELECT count FROM guest_asks_total WHERE date = ?").get(date) as
      | { count: number }
      | undefined;
    if ((totalRow?.count ?? 0) >= limits.total) return { ok: false, reason: "global" };

    db.prepare(
      `INSERT INTO guest_asks (ip, date, count) VALUES (?, ?, 1)
       ON CONFLICT(ip, date) DO UPDATE SET count = count + 1`,
    ).run(ip, date);
    db.prepare(
      `INSERT INTO guest_asks_total (date, count) VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET count = count + 1`,
    ).run(date);
    return { ok: true };
  });
  return tx();
}
