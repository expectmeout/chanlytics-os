/**
 * Relative time, said one way.
 *
 * Five helpers used to round a gap into words on their own, and each rounded
 * differently at the seams: fifty-nine and a half minutes came out as "60m",
 * a thread's wait was printed as "146m" beside a strip that said "2h", and
 * the calendar wrote "5 min ago" where People wrote "5m ago". Every surface
 * now reads these two shapes:
 *
 *   spanLabel   "now" · "5m" · "3h" · "2d"        the bell, a wait, a countdown
 *   agoWords    "just now" · "5m ago" · "3h ago"  a sentence about the past
 *
 * Units carry: a gap that rounds to sixty minutes is "1h", one that rounds to
 * twenty-four hours is "1d". Beyond a week a sentence gives a date instead of
 * a count, because "31d ago" is not how anyone says it.
 */

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface SpanUnits {
  n: number;
  unit: "s" | "m" | "h" | "d";
}

/** The largest whole unit a gap rounds to, with carry across the seams. */
export function spanUnits(ms: number): SpanUnits {
  const gap = Math.max(0, ms);
  if (gap < MIN_MS) return { n: Math.round(gap / 1000), unit: "s" };
  const minutes = Math.round(gap / MIN_MS);
  if (minutes < 60) return { n: minutes, unit: "m" };
  const hours = Math.round(gap / HOUR_MS);
  if (hours < 24) return { n: hours, unit: "h" };
  return { n: Math.round(gap / DAY_MS), unit: "d" };
}

/** "now" · "5m" · "3h" · "2d" — the bell's time, a countdown, a wait. */
export function spanLabel(ms: number): string {
  const u = spanUnits(ms);
  return u.unit === "s" ? "now" : `${u.n}${u.unit}`;
}

/** A wait never reads as nothing: under a minute is "1m". */
export function waitedLabel(ms: number): string {
  const u = spanUnits(ms);
  return u.unit === "s" ? "1m" : `${u.n}${u.unit}`;
}

/** The gap since a moment, as spanLabel says it: "now" · "5m" · "3h" · "2d". */
export function agoShort(atMs: number, nowMs: number): string {
  return spanLabel(nowMs - atMs);
}

/**
 * "just now" · "5m ago" · "3h ago" · "2d ago", and a date once the gap is
 * older than `dateAfterMs` (a week unless the caller says otherwise).
 */
export function agoWords(atMs: number, nowMs: number, opts: { dateAfterMs?: number; date?: (ms: number) => string } = {}): string {
  const gap = Math.max(0, nowMs - atMs);
  const dateAfter = opts.dateAfterMs ?? WEEK_MS;
  if (gap >= dateAfter && opts.date) return opts.date(atMs);
  const u = spanUnits(gap);
  return u.unit === "s" ? "just now" : `${u.n}${u.unit} ago`;
}
