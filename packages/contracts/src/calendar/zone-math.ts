/**
 * Zone math, the business's clock: a time zone's offset at an instant, the instant a wall-clock time there names,
 * and the calendar day an instant falls on and the days after it, counted by the calendar and never by the clock.
 * The feed (feed.ts), the open times (availability.ts) and the board (calendar.ts) read a zone through here.
 */

/* ------------------------------------------------------------- zone math */

interface ZoneParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
  weekday: string;
}

export function zoneParts(tz: string, at: Date): ZoneParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hh: Number(get("hour")) % 24,
    mm: Number(get("minute")),
    ss: Number(get("second")),
    weekday: get("weekday").toLowerCase().slice(0, 3),
  };
}

/** Offset of `tz` from UTC at the instant `atMs`, in milliseconds. */
export function zoneOffsetMs(tz: string, atMs: number): number {
  const p = zoneParts(tz, new Date(atMs));
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
  const p = zoneParts(tz, new Date(atMs));
  return { hh: p.hh, mm: p.mm, ss: p.ss };
}

/** "YYYY-MM-DD" and the weekday key ("mon".."sun") of an instant in `tz`. */
export function dayInZone(tz: string, atMs: number): { key: string; weekday: string; y: number; m: number; d: number } {
  const p = zoneParts(tz, new Date(atMs));
  const pad = (n: number) => String(n).padStart(2, "0");
  return { key: `${p.y}-${pad(p.m)}-${pad(p.d)}`, weekday: p.weekday, y: p.y, m: p.m, d: p.d };
}

/** Days since epoch for a calendar date, for stepping and week arithmetic. */
export const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);

/** The weekday keys in the order getUTCDay() numbers them, which is Sunday first. */
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
 * change and the offered days did not. `calendar.ts shiftKey` is the twin that
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
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = at.getUTCFullYear(),
    m = at.getUTCMonth() + 1,
    d = at.getUTCDate();
  return { key: `${y}-${pad(m)}-${pad(d)}`, weekday: WEEKDAY_KEYS[at.getUTCDay()], y, m, d };
}
