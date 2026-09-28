/**
 * The Calendar's views and the window loaded around them: the days a week, a day, a month or the agenda needs,
 * whether the loaded days cover them, and a day's frame before its data has landed.
 */
import { DOW, keyParts, mondayOf, monthSpan, shiftKey } from "./day-keys";
import { longDate, shortDate } from "./calendar-words";

/* ------------------------------------------------- the window and the views */

export type CalendarView = "week" | "day" | "month" | "agenda";

/** The days a view needs, from the day it looks at: a week (the day's week), six weeks for a month, two weeks for the agenda. */
export function spanForView(view: CalendarView, anchor: string): { from: string; days: number } {
  if (view === "month") return monthSpan(anchor);
  if (view === "agenda") return { from: anchor, days: 14 };
  return { from: mondayOf(anchor), days: 7 };
}

/**
 * The window loaded around an anchor: nine weeks from the Monday a week
 * before the anchor's month starts — enough for the month grid, the anchor's
 * week and its neighbours, and two weeks of agenda from any day in it, so
 * switching views and moving a week are slices, not reads.
 */
export function windowFor(anchor: string): { from: string; days: number } {
  return { from: shiftKey(mondayOf(`${anchor.slice(0, 7)}-01`), -7), days: 63 };
}

/** Whether contiguous loaded days cover `count` days from `from`. */
export function coversSpan(days: ReadonlyArray<{ key: string }>, from: string, count: number): boolean {
  if (!days.length || count < 1) return false;
  return days[0].key <= from && days[days.length - 1].key >= shiftKey(from, count - 1);
}

/** A day's frame from its key alone — the shape a view draws before the day's data has landed. */
export function frameOf(
  key: string,
  todayKey: string,
): { key: string; dow: string; date: string; long: string; dayNum: string; today: boolean; past: boolean } {
  const { y, m, d } = keyParts(key);
  return {
    key,
    dow: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
    date: shortDate(key),
    long: longDate(key),
    dayNum: String(d),
    today: key === todayKey,
    past: key < todayKey,
  };
}
