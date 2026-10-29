/**
 * Zone math, the business's clock: the one reading of a time zone. An instant's calendar parts there (zoneParts), a
 * zone's offset at an instant, the instant a wall-clock time there names, and the calendar day an instant falls on and
 * the days after it, counted by the calendar and never by the clock. The feed (feed.ts), the open times
 * (availability.ts), the board (calendar.ts) and the words every page says a time in (shared/clock.ts) read a zone
 * through here, and nothing else asks Intl for a zone's parts (the `zone-readers` measure).
 *
 * A zone Intl cannot use throws here, as the constructor does: a caller that must say something on a page anyway asks
 * for usableZone(tz) first, which is the zone or UTC.
 */

/* ------------------------------------------------------------- zone math */

interface ZoneParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
  /** "mon".."sun". */
  weekday: string;
  /** "YYYY-MM-DD". */
  key: string;
}

/** One parts formatter per zone, built on its first use and kept: building one costs far more than using it. */
const PARTS_FORMATS = new Map<string, Intl.DateTimeFormat>();

function partsFormatOf(tz: string): Intl.DateTimeFormat {
  let f = PARTS_FORMATS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    PARTS_FORMATS.set(tz, f);
  }
  return f;
}

/**
 * An instant's parts, remembered for a while: a view model says every message's time on every refresh, and asks for
 * "now" again each time. Shared and frozen, so no caller can change another's.
 */
const PARTS = new Map<string, Readonly<ZoneParts>>();
const PARTS_KEPT = 4096;

/** "YYYY-MM-DD" for a calendar date. */
const calendarKeyOf = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** An instant's calendar parts and wall clock in `tz`. A zone Intl cannot use throws, and nothing is kept. */
export function zoneParts(tz: string, at: Date | number): Readonly<ZoneParts> {
  const ms = typeof at === "number" ? at : at.getTime();
  const id = `${tz}\u0000${ms}`;
  const hit = PARTS.get(id);
  if (hit) return hit;
  const p: Record<string, string> = {};
  for (const x of partsFormatOf(tz).formatToParts(ms)) p[x.type] = x.value;
  const y = Number(p.year),
    m = Number(p.month),
    d = Number(p.day);
  const made = Object.freeze({
    y,
    m,
    d,
    hh: Number(p.hour) % 24,
    mm: Number(p.minute),
    ss: Number(p.second),
    weekday: (p.weekday ?? "").toLowerCase().slice(0, 3),
    key: calendarKeyOf(y, m, d),
  });
  if (PARTS.size >= PARTS_KEPT) PARTS.clear();
  PARTS.set(id, made);
  return made;
}

/** The zones already asked about, each with what usableZone answered: the zone itself, or UTC. */
const USABLE = new Map<string, string>();
const USABLE_KEPT = 512;

/**
 * `tz` when Intl can use it, else UTC: for the words a page says, where a bad row must never throw. The write path
 * refuses a zone that is not one (workspace.ts isTimezone); this is for a row from before it, or none.
 */
export function usableZone(tz: string | null | undefined): string {
  const name = tz || "UTC";
  let zone = USABLE.get(name);
  if (zone === undefined) {
    try {
      partsFormatOf(name);
      zone = name;
    } catch {
      zone = "UTC";
    }
    if (USABLE.size >= USABLE_KEPT) USABLE.clear();
    USABLE.set(name, zone);
  }
  return zone;
}

/** Offset of `tz` from UTC at the instant `atMs`, in milliseconds. */
export function zoneOffsetMs(tz: string, atMs: number): number {
  const p = zoneParts(tz, atMs);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(atMs / 1000) * 1000;
}

/** The instant a wall-clock time in `tz` refers to. Two passes cover a DST edge. */
export function localToUtcMs(tz: string, y: number, m: number, d: number, hh: number, mm: number): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - zoneOffsetMs(tz, guess);
  const second = guess - zoneOffsetMs(tz, first);
  return second;
}

/** The wall clock of an instant in `tz`. */
export function clockInZone(tz: string, atMs: number): { hh: number; mm: number; ss: number } {
  const p = zoneParts(tz, atMs);
  return { hh: p.hh, mm: p.mm, ss: p.ss };
}

/** "YYYY-MM-DD" and the weekday key ("mon".."sun") of an instant in `tz`. */
export function dayInZone(tz: string, atMs: number): { key: string; weekday: string; y: number; m: number; d: number } {
  const p = zoneParts(tz, atMs);
  return { key: p.key, weekday: p.weekday, y: p.y, m: p.m, d: p.d };
}

/** Days since epoch for a calendar date, for stepping and week arithmetic. */
export const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);

/** The days of the week by their number from Sunday (Date.getUTCDay, and Google's Point.day). */
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * The local day `days` after the one `atMs` falls on -- BY THE CALENDAR, not by
 * the clock.
 *
 * THE DEFECT THIS EXISTS FOR. Every one of these used to be written as
 * `dayInZone(tz, now + n * 86_400_000)`: add a fixed number of milliseconds,
 * then ask which local day that landed on. Two days a year that is not the
 * next day. On 8 March 2026 New York loses an hour, so a customer asking at
 * 23:30 the night before was offered 9 March next and **8 March was never
 * offered at all**; on 1 November it gains one, so a read at 00:30 emitted
 * 1 November twice and lost a day off the far end of the horizon. Nobody sees
 * an error: the receptionist simply says the wrong days out loud.
 *
 * A calendar day is a count of days, so it is counted in days. The date is
 * read in the business's zone, stepped over UTC midnights (which never shift),
 * and handed back as a date -- no instant is carried across the boundary, so
 * there is nothing for an hour to move. The RRULE expander below has always
 * stepped this way, which is why a weekly appointment stays at 2 PM across a
 * change and the offered days did not. `day-keys.ts shiftKey` is the twin that
 * steps a DATE to a date; this is the one that starts from an instant, which
 * is where reading "now" went wrong.
 */
export function dayPlusInZone(
  tz: string,
  atMs: number,
  days: number,
): { key: string; weekday: string; y: number; m: number; d: number } {
  const from = dayInZone(tz, atMs);
  if (days === 0) return from;
  const at = new Date((dayNumber(from.y, from.m, from.d) + days) * 86400000);
  const y = at.getUTCFullYear(),
    m = at.getUTCMonth() + 1,
    d = at.getUTCDate();
  // getUTCDay is 0 to 6, so the key is always there; a project that reads indexes unchecked asks for the default.
  return { key: calendarKeyOf(y, m, d), weekday: WEEKDAY_KEYS[at.getUTCDay()] ?? "sun", y, m, d };
}
