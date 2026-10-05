/**
 * The days a date picker walks (kit/datepicker/datepicker.tsx): a day is the page's own "YYYY-MM-DD", and the arithmetic
 * runs on UTC midnights, which have no daylight saving to cross, so a day is never skipped or met twice. Nothing here
 * knows a zone or a clock: the page says which day is today.
 */

/** A day's parts, read once; a string that is not a day reads as the first of January 1970 rather than throwing. */
function partsOf(key: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : { year: 1970, month: 1, day: 1 };
}

const dateOf = (key: string): Date => {
  const { year, month, day } = partsOf(key);
  return new Date(Date.UTC(year, month - 1, day));
};

const dayKeyOf = (date: Date): string => date.toISOString().slice(0, 10);

/** The day `n` days from `key` (negative for before). */
export function shiftDays(key: string, n: number): string {
  const date = dateOf(key);
  date.setUTCDate(date.getUTCDate() + n);
  return dayKeyOf(date);
}

/** The same day of the month `n` months from `key`, or the month's last day where it has fewer. */
export function shiftMonths(key: string, n: number): string {
  const { day } = partsOf(key);
  const date = dateOf(key);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + n);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return dayKeyOf(date);
}

/** Whether two days are in the same month. */
export const sameMonth = (a: string, b: string): boolean => a.slice(0, 7) === b.slice(0, 7);

/** The day of the month, as the number a cell says. */
export const dayNumber = (key: string): number => partsOf(key).day;

/** How many days `key` is after the first day of its week, which `weekStartsOn` names (0 Sunday, 1 Monday). */
function intoWeek(key: string, weekStartsOn: 0 | 1): number {
  return (dateOf(key).getUTCDay() - weekStartsOn + 7) % 7;
}

/** The first day of `key`'s week. */
export const weekStart = (key: string, weekStartsOn: 0 | 1): string => shiftDays(key, -intoWeek(key, weekStartsOn));

/** Six weeks that hold `key`'s month, from the week its first day is in: always six, so the picker never changes height. */
export function monthWeeks(key: string, weekStartsOn: 0 | 1): string[][] {
  const first = `${key.slice(0, 8)}01`;
  const start = weekStart(first, weekStartsOn);
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, at) => shiftDays(start, week * 7 + at)));
}

const utcWords = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });

/** "October 2026". */
export const monthTitle = (key: string): string => utcWords({ month: "long", year: "numeric" }).format(dateOf(key));

/** "Mon". */
export const weekdayShort = (key: string): string => utcWords({ weekday: "short" }).format(dateOf(key));

/** "Monday". */
export const weekdayLong = (key: string): string => utcWords({ weekday: "long" }).format(dateOf(key));

/** "Friday, October 2, 2026": what a screen reader says of a cell. */
export const dayLong = (key: string): string =>
  utcWords({ weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(dateOf(key));
