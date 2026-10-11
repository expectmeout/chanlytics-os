/**
 * How Reports' date control says a range (9 Oct 2026): the days a range covers at a business day, the windows a member
 * reaches in one press, and the words under the month a member picks days on. Out of report-periods.ts, which is what a
 * range is and how every layer names it: the frame's strip and the document's head need those on every page, and only
 * Reports' own page draws the control, so its words load with that page and not with the route every page loads.
 */
import { keyParts, mondayOf, shiftKey, shiftMonth } from "../calendar/day-keys";
import { plural } from "../shared/words";
import {
  REPORT_MOST_DAYS,
  fixedDaysOf,
  monthDaysAt,
  periodSince,
  reportDaysCount,
  reportRangeKey,
  type ReportDays,
  type ReportPeriodId,
  type ReportRange,
} from "./report-periods";
import { REPORT_RANGES, daysWords, fmtDay } from "./reports";

/**
 * The windows a member reaches in one press that are not a period ending today, at a business day: named here, and
 * worked out from that day, so "Last month" is always the month before the workspace's own. They are days like any a
 * member picks: nothing of them is kept or sent by name, and a yesterday someone shared is the day it was, not the day
 * before whoever opens it.
 */
export function reportShortcuts(today: string): { id: string; label: string; days: ReportDays }[] {
  const yesterday = shiftKey(today, -1);
  const monday = mondayOf(today);
  return [
    { id: "yesterday", label: "Yesterday", days: { from: yesterday, to: yesterday } },
    { id: "last-week", label: "Last week", days: { from: shiftKey(monday, -7), to: shiftKey(monday, -1) } },
    {
      id: "last-month",
      label: "Last month",
      days: { from: shiftMonth(today, -1), to: shiftKey(shiftMonth(today, 0), -1) },
    },
  ];
}

/** The days a range covers at a business day, and how the range's control says them. */
export interface ReportWindowVM {
  /** The range itself: what a pick sends and the address keeps. */
  range: ReportRange;
  /** The period by name; null for days a member picked. */
  period: ReportPeriodId | null;
  /** The range's one name (reportRangeKey). */
  key: string;
  /** The first day and the last, "YYYY-MM-DD". */
  from: string;
  to: string;
  /** How many days, both included. */
  days: number;
  /** Whether it ends on the workspace's today. One that does names no day to the database, and is read as it always was. */
  live: boolean;
  /** The days in words: "Sep 7 – Oct 6", or the one day's "Oct 6". */
  dates: string;
  /** What it is, beside the days: "Last 30 days", "This month so far", "Last month", or the count, "20 days". */
  said: string;
  /** The control's own word, as short as it can be said: "30 days", "Month", "Yesterday", "Sep 1 – 20". */
  short: string;
  /** What stands beside the control where there is room, the half its word leaves out: the days of a period or a
   *  shortcut ("Sep 7 – Oct 6"), and for days said by their dates, how many they are ("20 days"). */
  beside: string;
  /** The same number of days before it, which every figure is read against. */
  before: { from: string; to: string; dates: string };
}

/** A window's days as the control says them where room is short: "Sep 1 – 20" in one month, "Sep 28 – Oct 4" across two. */
function shortDates(from: string, to: string): string {
  if (from === to) return fmtDay(to);
  return from.slice(0, 7) === to.slice(0, 7) ? `${fmtDay(from)} – ${keyParts(to).d}` : daysWords(from, to);
}

/**
 * The days a range covers at a business day ("2026-10-06", the workspace's own today). A period by name is a count of
 * days ending today, today included, as the report reads them (Month: the 1st to today); days a member picked are those
 * days. Said for the control before its read lands, so the window picked shows at once, by the same arithmetic the route
 * reads with (fixedDaysOf, monthDaysAt, reportDaysCount).
 */
export function reportWindowOf(range: ReportRange, today: string): ReportWindowVM {
  const picked = typeof range === "string" ? null : range;
  const period = typeof range === "string" ? range : null;
  const fixed = period === null ? null : fixedDaysOf(period);
  const to = picked?.to ?? today;
  const from = picked?.from ?? periodSince(today, fixed ?? monthDaysAt(today));
  const days = reportDaysCount({ from, to });
  const label = REPORT_RANGES.find((r) => r.id === period)?.label ?? "";
  // Days a member picked that are one of the shortcuts say its name, for as long as they still are it.
  const shortcut = picked ? reportShortcuts(today).find((s) => s.days.from === from && s.days.to === to) : undefined;
  const before = { from: shiftKey(from, -days), to: shiftKey(from, -1) };
  // Days with no name of their own are said by their dates, and the count stands beside them.
  const dated = period === null && shortcut === undefined;
  return {
    range,
    period,
    key: reportRangeKey(range),
    from,
    to,
    days,
    live: to === today,
    dates: daysWords(from, to),
    said:
      period === null
        ? (shortcut?.label ?? plural(days, "day"))
        : fixed === null
          ? "This month so far"
          : `Last ${label}`,
    short: period === null ? (shortcut?.label ?? shortDates(from, to)) : label,
    beside: dated ? plural(days, "day") : daysWords(from, to),
    before: { ...before, dates: daysWords(before.from, before.to) },
  };
}

/**
 * What the month a member picks days on says under itself (the kit's DayRangePicker `hint`): how to pick, then the
 * first day pressed, then the days the band covers and how many they are, while the last is still to be pressed. A day
 * the month could not choose (`refused`: one to come, or too far from the first day) is said, and why, until a press
 * chooses.
 */
export function reportPickWords(
  first: string | null,
  band: ReportDays,
  refused: { day: string; why: "to-come" | "too-far" } | null,
): string {
  if (refused?.why === "to-come") return `${fmtDay(refused.day)} is still to come. Press today or a day before.`;
  if (refused && first !== null)
    return `${fmtDay(refused.day)} is more than ${REPORT_MOST_DAYS} days from ${fmtDay(first)}. Press a nearer day.`;
  if (first === null) return `Press a first day, then a last. ${REPORT_MOST_DAYS} days at most.`;
  const days = reportDaysCount(band);
  if (days === 1) return `From ${fmtDay(first)}. Press the last day, or this one again for the day alone.`;
  return `${daysWords(band.from, band.to)}, ${plural(days, "day")}. Press to choose.`;
}
