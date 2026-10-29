/**
 * Day keys, "YYYY-MM-DD" in the business's zone, and the calendar counted in them: the day `n` after, a week's
 * Monday, a month and the six weeks its grid shows, and the instant a day starts (zoneMidnight). The board, the
 * playbooks and Reach out step days here. And a day in words: the weekday a word names (weekdayNamed), the day a sentence
 * names (dayWordIn), the next day that is that weekday (onOrAfter) and the day a text names as a key (dayKeyNamed): the
 * one reading Ask, the openings a caller asks for and a listing's hours share.
 */
import { WEEKDAY_KEYS, localToUtcMs } from "./zone-math";
import { dateFormat } from "../shared/time";

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

/** "September 2026": the key's month for every viewer, its first's UTC noon said in UTC (calendar-words.ts says why). */
export function monthLabelOf(key: string): string {
  const { y, m } = keyParts(key);
  return dateFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(
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

/* ------------------------------------------------------- a day in words */

/** A weekday, as the week's hours key it: "mon" to "sun". */
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/**
 * Every word a weekday is written in, English and Spanish, whole or cut short, with its accent and without: Ask read
 * "sábado" as today, and the openings a caller asked for on "miércoles" as any day. A word of two letters ("Mo", "Th")
 * is a listing's own and lead-hours.ts reads those itself: in a sentence, "we" and "sa" are not days.
 */
const WEEKDAY_WORDS = new Map<string, WeekdayKey>(
  (
    [
      ["mon", ["mon", "monday", "lunes"]],
      ["tue", ["tue", "tues", "tuesday", "martes"]],
      ["wed", ["wed", "weds", "wednesday", "miércoles", "miercoles"]],
      ["thu", ["thu", "thur", "thurs", "thursday", "jueves"]],
      ["fri", ["fri", "friday", "viernes"]],
      ["sat", ["sat", "saturday", "sábado", "sabado"]],
      ["sun", ["sun", "sunday", "domingo"]],
    ] as const
  ).flatMap(([key, words]) => words.map((w) => [w, key] as const)),
);

/** The weekday one word names ("Monday", "tues", "Sábado"), whatever its case; null for any other word. */
export function weekdayNamed(word: string): WeekdayKey | null {
  return WEEKDAY_WORDS.get(word.trim().toLowerCase()) ?? null;
}

/** The day a question names: today, tomorrow, or a weekday. */
export type DayWord = "today" | "tomorrow" | WeekdayKey;

/**
 * The day a sentence names, in English or Spanish: tomorrow before today before a weekday, and of weekdays the first
 * named. "Mañana" is tomorrow but for the morning: after "la" it is a part of the day ("el lunes por la mañana" is
 * Monday), and after "esta" it is this morning, today.
 */
export function dayWordIn(text: string): DayWord | null {
  const words = text.toLowerCase().split(/[^\p{L}]+/u);
  let near: "today" | "tomorrow" | null = null;
  let weekday: WeekdayKey | null = null;
  words.forEach((w, i) => {
    if (w === "mañana" || w === "manana") {
      if (words[i - 1] === "esta") near ??= "today";
      else if (words[i - 1] !== "la") near = "tomorrow";
    } else if (w === "tomorrow") near = "tomorrow";
    else if (w === "today" || w === "hoy") near ??= "today";
    else weekday ??= weekdayNamed(w);
  });
  return near ?? weekday;
}

/** The first day on or after `key` that is `weekday`: "Saturday" asked on a Saturday is that day. */
export function onOrAfter(key: string, weekday: WeekdayKey): string {
  const { y, m, d } = keyParts(key);
  const gap = (WEEKDAY_KEYS.indexOf(weekday) - new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 7) % 7;
  return shiftKey(key, gap);
}

/**
 * The day a text names, as a key, from the business's today: a date as written, today, tomorrow, or the next day that is
 * the weekday it names ("sábado", "this friday"); null for none. Ask's calendar reads the day it is asked for here.
 */
export function dayKeyNamed(text: string, todayKey: string): string | null {
  const asked = text.trim();
  if (isDayKey(asked)) return asked;
  const named = dayWordIn(asked);
  if (named === "today") return todayKey;
  if (named === "tomorrow") return shiftKey(todayKey, 1);
  return named ? onOrAfter(todayKey, named) : null;
}
