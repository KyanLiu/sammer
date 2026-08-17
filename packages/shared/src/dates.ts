/** Time zero, as an ISO string — fallback for an unknown file date. */
export const EPOCH = new Date(0).toISOString();

/**
 * Coerce a loosely-typed date into an ISO string, or fall back.
 * YAML parses unquoted ISO timestamps into Date objects, so values read from
 * hand-edited frontmatter arrive as Dates as often as strings; anything else
 * (missing, empty, or the wrong type) takes the fallback.
 */
export function toIso(value: unknown, fallback: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return fallback;
}
