/** Time zero, as an ISO string — fallback for an unknown file date. */
export const EPOCH = new Date(0).toISOString();

// to Iso String conversion with fallback
export function toIso(value: unknown, fallback: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return fallback;
}
// returns an ISO date string
export function toDay(value: unknown, fallback: string): string {
  const day = toIso(value, fallback).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : fallback.slice(0, 10);
}
