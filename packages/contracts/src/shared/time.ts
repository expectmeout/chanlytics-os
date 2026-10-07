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

/** How much longer a retry's wait may be drawn, as a share of the wait: up to a fifth. */
const JITTER_SPREAD = 0.2;

/**
 * A retry's wait, drawn up to JITTER_SPREAD longer at random, so the callers one outage failed together ask again
 * apart rather than all at once. Only ever longer: a wait that must outlast something (the ledger's lease) still does.
 * Every retry wait in the tree is drawn here: the ledger's, a held send's, a broadcast's back-off, a provider call's.
 * `random` is a test's to fix; a draw outside [0, 1] is held to it.
 */
export function jittered(ms: number, random: () => number = Math.random): number {
  return Math.round(ms * (1 + JITTER_SPREAD * Math.min(1, Math.max(0, random()))));
}

/**
 * A date formatter built on its first use rather than when contracts loads, so it keeps the zone the process has then.
 * A process's zone never moves in production (a browser's, the server's UTC); but a suite pins UTC in a test file
 * after the runner's preloads have already loaded contracts (tests/fixtures/pin-utc.mjs, the network stand-in), and a
 * formatter built at load kept the machine's zone, a day off twelve hours east.
 */
export function formatterOnUse(
  locales: Intl.LocalesArgument,
  options: Intl.DateTimeFormatOptions,
): Pick<Intl.DateTimeFormat, "format"> {
  let built: Intl.DateTimeFormat | null = null;
  return { format: (date) => (built ??= new Intl.DateTimeFormat(locales, options)).format(date) };
}

/** How many formatters each cache keeps before it starts again: zones times shapes, which a page uses a handful of. */
const FORMATS_KEPT = 256;
const DATE_FORMATS = new Map<string, Intl.DateTimeFormat>();
const NUMBER_FORMATS = new Map<string, Intl.NumberFormat>();

/** One formatter per locale and options, built on its first use and kept. */
function formatterKept<F>(cache: Map<string, F>, key: string, make: () => F): F {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  if (cache.size >= FORMATS_KEPT) cache.clear();
  cache.set(key, made);
  return made;
}

/**
 * A date formatter for a named zone, built once per locale and options and kept: building one costs far more than
 * using it, and a list builds one per row (a Leads row built three for when it was found, 12% of a switch to Leads at
 * 200 rows, 5 Oct 2026). Only for a zone the caller names: one in the runtime's own zone is built where it is used
 * (formatterOnUse says why). An unknown zone throws as the constructor does, and nothing is kept.
 */
export function dateFormat(
  locales: string,
  options: Intl.DateTimeFormatOptions & { timeZone: string },
): Intl.DateTimeFormat {
  return formatterKept(
    DATE_FORMATS,
    `${locales}|${JSON.stringify(options)}`,
    () => new Intl.DateTimeFormat(locales, options),
  );
}

/** A number formatter (money, a count), built once per locale and options and kept, as dateFormat's are. */
export function numberFormat(locales: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return formatterKept(
    NUMBER_FORMATS,
    `${locales}|${JSON.stringify(options)}`,
    () => new Intl.NumberFormat(locales, options),
  );
}

/** "Sep 6", in the runtime's own locale and zone: the date a sentence gives once a count would read oddly. */
export const DATE_FMT = formatterOnUse([], { month: "short", day: "numeric" });

/** The instant an ISO timestamp names, in ms; null for none, and for text that is no time (a row can hold either). */
export function isoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

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
