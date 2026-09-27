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
 *
 * The lengths of time are named here once, and every module that counts in
 * minutes, hours, days or weeks imports them: fifteen files each spelled a day
 * for themselves, as 86_400_000 or as 24 * 3600 * 1000.
 */

export const MIN_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

/** "Sep 6", in the runtime's own locale and zone: the date a sentence gives once a count would read oddly. */
export const DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });

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
export function agoWords(
  atMs: number,
  nowMs: number,
  opts: { dateAfterMs?: number; date?: (ms: number) => string } = {},
): string {
  const gap = Math.max(0, nowMs - atMs);
  const dateAfter = opts.dateAfterMs ?? WEEK_MS;
  if (gap >= dateAfter && opts.date) return opts.date(atMs);
  const u = spanUnits(gap);
  return u.unit === "s" ? "just now" : `${u.n}${u.unit} ago`;
}

/**
 * "New York" from "America/New_York" — the part a person recognises. Here, with nothing to import, so the Calendar's
 * view model can name a zone without taking the sign-up schema into every package that bundles it (C3).
 */
export function timezoneCity(tz: string): string {
  const tail = tz.split("/").pop() || tz;
  return tail.replace(/_/g, " ");
}
