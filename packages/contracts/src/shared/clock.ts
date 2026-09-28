/**
 * Absolute time, said by the business's clock.
 *
 * A time the owner reads — a message's minute, a call's start, when a broadcast
 * goes, a day on a person's timeline — is said in the WORKSPACE's zone. The pages
 * printed it with Intl.DateTimeFormat([]) and no timeZone: the browser's zone. One
 * call read as two times to an owner away from home or a teammate elsewhere, and
 * "the same day" meant the browser's day (the 12 September audit's D5). time.ts
 * says how long ago; this says when.
 *
 *   clockTime      "3:10 PM"
 *   clockDate      "Sep 6" · "Dec 31, 2025" (another year says its year)
 *   clockDateYear  "Sep 6, 2026"                                 a record
 *   clockShort     today "3:10 PM", else "Sep 6"                 a list row
 *   clockStamp     today "3:10 PM", else "Sep 6 · 3:10 PM"       a message
 *   clockWhen      "today 6:00 PM" · "tomorrow 10:00 AM" · "Sep 12 · 10:00 AM"
 *   clockDayLabel  "Today · Sep 4" · "Yesterday · Sep 3" · "Sep 2"
 *   clockNear      "today" · "yesterday" · "tomorrow" · "Tue" · "Sep 12"     a chip, a week either side by name
 *   clockNearWhen  "today 2:00 PM" · "Fri 2:00 PM" · "Oct 2 · 2:00 PM"
 *
 * And the other way, a wall-clock time by the business's clock as an instant:
 * wallClockAt, tomorrowAtIn (a snooze target), and a datetime-local box read and
 * written in the zone (fromZonedInput, zonedInputValue).
 *
 * And a length on a clock face, which has no zone: mmss, "2:05", a call's length or a line's minute within it, and
 * callLength, the one rule for a call with no length.
 *
 * The formatters are built once per zone, and an instant's calendar parts are
 * remembered for a while: view models format every message on every refresh, and
 * every one of them asks for "now" again. A zone that is not a zone is read as
 * UTC, so a bad row never throws on a page; the write path already refuses one
 * (workspace.ts isTimezone).
 */
import { localToUtcMs } from "../calendar/zone-math";
import { DAY_MS } from "./time";

interface ZoneFormats {
  zone: string;
  time: Intl.DateTimeFormat;
  date: Intl.DateTimeFormat;
  dateYear: Intl.DateTimeFormat;
  weekday: Intl.DateTimeFormat;
  parts: Intl.DateTimeFormat;
}

const FORMATS = new Map<string, ZoneFormats>();

function formatsFor(tz: string): ZoneFormats {
  const hit = FORMATS.get(tz);
  if (hit) return hit;
  let zone = tz || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const made: ZoneFormats = {
    zone,
    time: new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }),
    date: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }),
    dateYear: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", year: "numeric" }),
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }),
    parts: new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
  FORMATS.set(tz, made);
  return made;
}

interface Wall {
  key: string;
  year: number;
  hh: number;
  mm: number;
}

const WALLS = new Map<string, Wall>();
const WALLS_MAX = 2048;

/** The business's calendar day and wall clock at an instant. */
function wall(atMs: number, tz: string): Wall {
  const id = `${tz}|${atMs}`;
  const hit = WALLS.get(id);
  if (hit) return hit;
  const p: Record<string, string> = {};
  for (const x of formatsFor(tz).parts.formatToParts(new Date(atMs))) p[x.type] = x.value;
  const made: Wall = {
    key: `${p.year}-${p.month}-${p.day}`,
    year: Number(p.year),
    hh: Number(p.hour) % 24,
    mm: Number(p.minute),
  };
  if (WALLS.size >= WALLS_MAX) WALLS.clear();
  WALLS.set(id, made);
  return made;
}

/**
 * A day key moved by whole days: arithmetic on the date alone, never on a clock.
 * calendar.ts's shiftKey does the same; it is not imported so that every view
 * model reading a time does not also load the configuration schema.
 */
function shiftDay(key: string, days: number): string {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + days))
    .toISOString()
    .slice(0, 10);
}

/** The weekday of a business day, 0 Sunday to 6 Saturday: the date alone, never a clock. */
function dayOfWeek(key: string): number {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))).getUTCDay();
}

/** The business's day at an instant: "2026-09-06". */
export function zoneDayKey(atMs: number, tz: string): string {
  return wall(atMs, tz).key;
}

/** "3:10 PM", by the business's clock. */
export function clockTime(atMs: number, tz: string): string {
  return formatsFor(tz).time.format(new Date(atMs));
}

/** "Sep 6" by the business's calendar, with the year when that is not this year there. */
export function clockDate(atMs: number, tz: string, nowMs: number): string {
  const f = formatsFor(tz);
  return wall(atMs, tz).year === wall(nowMs, tz).year
    ? f.date.format(new Date(atMs))
    : f.dateYear.format(new Date(atMs));
}

/** "Sep 6, 2026" by the business's calendar: a record that always says its year. */
export function clockDateYear(atMs: number, tz: string): string {
  return formatsFor(tz).dateYear.format(new Date(atMs));
}

/** A list row: the time on the business's today, the date before it. */
export function clockShort(atMs: number, tz: string, nowMs: number): string {
  return zoneDayKey(atMs, tz) === zoneDayKey(nowMs, tz) ? clockTime(atMs, tz) : clockDate(atMs, tz, nowMs);
}

/** A message: the time on the business's today; before it, the date and the time. */
export function clockStamp(atMs: number, tz: string, nowMs: number): string {
  const time = clockTime(atMs, tz);
  return zoneDayKey(atMs, tz) === zoneDayKey(nowMs, tz) ? time : `${clockDate(atMs, tz, nowMs)} · ${time}`;
}

/** When something goes: "today 6:00 PM" · "tomorrow 10:00 AM" · "Sep 12 · 10:00 AM". */
export function clockWhen(atMs: number, tz: string, nowMs: number): string {
  const time = clockTime(atMs, tz);
  const day = zoneDayKey(atMs, tz);
  const today = zoneDayKey(nowMs, tz);
  if (day === today) return `today ${time}`;
  if (day === shiftDay(today, 1)) return `tomorrow ${time}`;
  return `${clockDate(atMs, tz, nowMs)} · ${time}`;
}

/** Whole days from one business day to another ("2026-09-06" to "2026-09-08" is 2): the dates alone, never a clock. */
function daysBetween(fromKey: string, toKey: string): number {
  const at = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.round((at(toKey) - at(fromKey)) / DAY_MS);
}

/** How many business days a moment is from today: 0 today, -1 yesterday, 1 tomorrow. */
function daysFromToday(atMs: number, tz: string, nowMs: number): number {
  return daysBetween(zoneDayKey(nowMs, tz), zoneDayKey(atMs, tz));
}

/**
 * Whole days from one moment to another by the business's calendar: the dates each falls on, never a count of 24-hour
 * blocks. Eleven at night yesterday is 1 day ago at one in the morning. What a list's day fact counts in
 * (list-rules.ts): one clock, the workspace's zone (decision 0009).
 */
export function localDaysBetween(fromMs: number, toMs: number, tz: string): number {
  return daysBetween(zoneDayKey(fromMs, tz), zoneDayKey(toMs, tz));
}

/** Whether a moment falls in the business's week, Monday to Sunday, that `nowMs` is in. */
export function inLocalWeek(atMs: number, tz: string, nowMs: number): boolean {
  const today = zoneDayKey(nowMs, tz);
  const monday = shiftDay(today, -((dayOfWeek(today) + 6) % 7));
  const d = daysBetween(monday, zoneDayKey(atMs, tz));
  return d >= 0 && d <= 6;
}

/**
 * A day near the business's today, as a chip says it: "today", "yesterday", "tomorrow", its weekday within six days
 * either side ("Tue"), else its date ("Sep 12"). A week away is a date, because its weekday is today's. Lower case: the
 * words it sits in say where a sentence starts ("Held Tue", "Heard back today").
 */
export function clockNear(atMs: number, tz: string, nowMs: number): string {
  const gap = daysFromToday(atMs, tz, nowMs);
  if (gap === 0) return "today";
  if (gap === -1) return "yesterday";
  if (gap === 1) return "tomorrow";
  if (Math.abs(gap) <= 6) return formatsFor(tz).weekday.format(new Date(atMs));
  return clockDate(atMs, tz, nowMs);
}

/** A moment near today: its day as clockNear says it and the time, "Fri 2:00 PM"; past a week, "Oct 2 · 2:00 PM", as clockWhen joins a date. */
export function clockNearWhen(atMs: number, tz: string, nowMs: number): string {
  const time = clockTime(atMs, tz);
  return Math.abs(daysFromToday(atMs, tz, nowMs)) <= 6
    ? `${clockNear(atMs, tz, nowMs)} ${time}`
    : `${clockDate(atMs, tz, nowMs)} · ${time}`;
}

/** A day on a timeline: "Today · Sep 4" · "Yesterday · Sep 3" · "Sep 2". */
export function clockDayLabel(atMs: number, tz: string, nowMs: number): string {
  const day = zoneDayKey(atMs, tz);
  const today = zoneDayKey(nowMs, tz);
  const date = clockDate(atMs, tz, nowMs);
  if (day === today) return `Today · ${date}`;
  if (day === shiftDay(today, -1)) return `Yesterday · ${date}`;
  return date;
}

/** The instant of a wall-clock time on a business day ("2026-09-07", 10:00), clock changes included. */
export function wallClockAt(tz: string, dayKey: string, hh: number, mm: number): number {
  return localToUtcMs(
    formatsFor(tz).zone,
    Number(dayKey.slice(0, 4)),
    Number(dayKey.slice(5, 7)),
    Number(dayKey.slice(8, 10)),
    hh,
    mm,
  );
}

/** Tomorrow at a wall-clock time, by the business's day and clock: a snooze target. */
export function tomorrowAtIn(tz: string, nowMs: number, hh: number, mm = 0): number {
  return wallClockAt(tz, shiftDay(zoneDayKey(nowMs, tz), 1), hh, mm);
}

const two = (n: number): string => String(n).padStart(2, "0");

/** A datetime-local box's value for an instant, by the business's clock: "2026-09-15T09:30". */
export function zonedInputValue(atMs: number, tz: string): string {
  const w = wall(atMs, tz);
  return `${w.key}T${two(w.hh)}:${two(w.mm)}`;
}

/** A datetime-local box's value, read by the business's clock; null for anything that is not one. */
export function fromZonedInput(value: string | null | undefined, tz: string): number | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::[0-9]{2})?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const ms = localToUtcMs(formatsFor(tz).zone, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * "2:05": a length in minutes and seconds, rounded to the second, never below "0:00": a length below zero reads
 * "0:00", and so does one that is not a finite number (NaN printed "NaN:NaN", Infinity "Infinity:NaN"). A view that
 * prints nothing for a call with no length asks callLength instead.
 */
export function mmss(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A call's length on a clock face, "2:05", or nothing for a call with no length on record: none, zero, below zero, or
 * not a finite number (NaN, or an unbounded length, which is no clock reading either). The one rule for "no length":
 * the call card (toCallVM), a person's timeline, the Live card and the call's export all ask it, so a missing, NaN or
 * infinite length reads the same on each. The card and the timeline were two guards that disagreed on NaN, which the
 * timeline printed as "NaN:NaN"; an infinite length printed "Infinity:NaN" on all four.
 */
export function callLength(ms: number | null | undefined): string | undefined {
  return ms != null && Number.isFinite(ms) && ms > 0 ? mmss(ms) : undefined;
}
