/**
 * Day keys, "YYYY-MM-DD" in the business's zone, and the calendar counted in them: the day `n` after, a week's
 * Monday, a month and the six weeks its grid shows, and the instant a day starts (zoneMidnight). The board, the
 * playbooks and Reach out step days here.
 */
import { localToUtcMs } from "./zone-math";

/* ------------------------------------------------------------ day keys */

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_SHORT: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export function keyParts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m ?? 1, d: d ?? 1 };
}

/** The key `n` days after `key`. */
export function shiftKey(key: string, n: number): string {
  const { y, m, d } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}

/** The Monday of the week `key` is in. */
export function mondayOf(key: string): string {
  const { y, m, d } = keyParts(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shiftKey(key, -((dow + 6) % 7));
}

export function isDayKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** The span a month view shows: six weeks from the Monday on or before the first. */
export function monthSpan(key: string): { from: string; days: number } {
  return { from: mondayOf(`${key.slice(0, 7)}-01`), days: 42 };
}

/** The first of the month `n` months away from `key`'s month. */
export function shiftMonth(key: string, n: number): string {
  const { y, m } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "September 2026" */
export function monthLabelOf(key: string): string {
  const { y, m } = keyParts(key);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1, 12)),
  );
}

/** Midnight of a day key in `tz`, as an instant. */
/**
 * Midnight of a day key, in the business's zone.
 *
 * ONE CLOCK, NOT TWO. This was a hand-written two-pass guess over a private
 * `zoneOffsetOf`, which computed the same offset `zoneOffsetMs` in
 * availability.ts already computed, by a different route — and the two passes
 * were `localToUtcMs` spelled out again, in a file that already imported from
 * that module. Daylight saving is the one piece of arithmetic in this product
 * it is least affordable to have two of: a second copy does not fail, it
 * disagrees, twice a year, about which hour a day starts.
 */
export function zoneMidnight(tz: string, key: string): number {
  const { y, m, d } = keyParts(key);
  return localToUtcMs(tz, y, m, d, 0, 0);
}
