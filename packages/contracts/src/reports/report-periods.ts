/**
 * The periods Reports offers and how a request names one (the table is REPORT_RANGES, reports.ts: said once). Three are a
 * count of days; Month is the days since the 1st in the workspace's own zone, today included, so on the 5th it is 5 days,
 * against the 5 before. A request names `period`; `days`, which every page sent before there was a Month, is read for a
 * release longer so a tab opened before the deploy still reads (either deploy order works), and the day it ends is held by
 * tests/reports/periods/report-periods.test.mjs.
 *
 * And the days a member picks (9 Oct 2026). A report was "a count of days ending today" in every layer, so Reports could
 * offer the four periods and no other. What a report is read over is a RANGE now: a period by name, or a window of days
 * picked on the calendar (`ReportDays`, its first day and its last in the workspace's own zone), with one name for the
 * address, the request and every cache alike (`reportRangeKey`); a period ends on the workspace's today and is read as it
 * always was, and a window that ended earlier names its last day to the database (00360). How the control says a range,
 * and the days it covers (`reportWindowOf`), are report-window.ts's: only Reports' page draws them, and every page loads
 * this module. Nothing here reads a clock: the workspace's today is the caller's to say, since a browser's disagrees with
 * it for some hours of every day.
 */
import { isDayKey, keyParts, shiftKey } from "../calendar/day-keys";
import { DAY_MS } from "../shared/time";
import { REPORT_RANGES } from "./reports";

/** What a period is called in a request, the tab's storage and the control. */
export type ReportPeriodId = (typeof REPORT_RANGES)[number]["id"];

/** The ids of the periods, in the control's order: the closed set a request's `period` is (the typed client and docs/api.md say them). */
export const REPORT_PERIOD_IDS = REPORT_RANGES.map((r) => r.id);

/** The period a report is read over when none is named. */
export const REPORT_PERIOD_DEFAULT: ReportPeriodId = "30d";

/**
 * Where a device keeps the period it last picked: the page reads it as it loads (surfaces/reports/surface.ts), and so
 * does the document's head, which starts the report's reads over that period before the page exists
 * (shell/route-prefetch.ts routePrefetchScript). One name, so the two ask for the same report.
 */
export const REPORT_PERIOD_STORAGE = "chanlytics.report.period";

/** The most days the report reads: the SQL clamps its `p_days` there. */
const MOST_DAYS = Math.max(...REPORT_RANGES.map((r) => r.days ?? 0));

export const isReportPeriod = (value: unknown): value is ReportPeriodId => REPORT_RANGES.some((r) => r.id === value);

/** The days of a period that is a count of days; null for Month. */
export const fixedDaysOf = (period: ReportPeriodId): number | null =>
  REPORT_RANGES.find((r) => r.id === period)?.days ?? null;

/** Month to date at a business day ("2026-10-05" is 5): the day of the month, today included. */
export const monthDaysAt = (dayKey: string): number => Number(dayKey.slice(8, 10));

/** The first day of a period of `days` days that ends on `today`, today included: 30 days to "2026-10-06" start on "2026-09-07". */
export const periodSince = (today: string, days: number): string => shiftKey(today, -(days - 1));

/**
 * The period a request names: `period`, else (until its day) the `days` a page sent before there was a Month, else the
 * default. Null when what it names is none of ours.
 */
export function reportPeriodOf(asked: {
  period?: string | undefined;
  days?: string | undefined;
}): ReportPeriodId | null {
  if (asked.period !== undefined) return isReportPeriod(asked.period) ? asked.period : null;
  if (asked.days !== undefined)
    return REPORT_RANGES.find((r) => r.days !== null && r.days === Number(asked.days))?.id ?? null;
  return REPORT_PERIOD_DEFAULT;
}

/** The days a page said it shows (Ask's view of Reports): a whole count the report can read, else null. */
export function reportDaysAsked(view: string | null | undefined): number | null {
  const asked = Number(view);
  return Number.isInteger(asked) && asked >= 1 && asked <= MOST_DAYS ? asked : null;
}

/** The most days a report covers: its functions clamp their count here (00304), and a window picked may be no longer. */
export const REPORT_MOST_DAYS = MOST_DAYS;

/** A window of days a member picked on the calendar: its first day and its last, "YYYY-MM-DD", in the workspace's zone. */
export interface ReportDays {
  from: string;
  to: string;
}

/** What a report is read over: one of the periods by name, or the days a member picked. */
export type ReportRange = ReportPeriodId | ReportDays;

/**
 * A day that is on the calendar. `isDayKey` reads the shape and lets a day no month has roll into the next ("2026-02-30"
 * is 2 March to a clock), which an address typed by hand, or a request, could then name: counted from one day and read
 * from another.
 */
const isRealDay = (value: unknown): value is string => isDayKey(value) && shiftKey(value, 0) === value;

export const isReportDays = (value: unknown): value is ReportDays =>
  typeof value === "object" &&
  value !== null &&
  isRealDay((value as ReportDays).from) &&
  isRealDay((value as ReportDays).to);

/** A day as a count of days, so two are a subtraction apart whatever month or clock change lies between them. */
const dayOrdinal = (day: string): number => {
  const { y, m, d } = keyParts(day);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};

/** How many days a window holds, its first and its last included: "2026-09-01" to "2026-09-20" is 20. */
export const reportDaysCount = (days: ReportDays): number => dayOrdinal(days.to) - dayOrdinal(days.from) + 1;

/**
 * A range's one name: `30d`, or `2026-09-01~2026-09-20`. What the address, a held view and a test call it, so no layer
 * spells a window a second way.
 */
export const reportRangeKey = (range: ReportRange): string =>
  typeof range === "string" ? range : `${range.from}~${range.to}`;

/** The range a key names; null where it names none (a day that is no day, or the two out of order). */
export function reportRangeOfKey(key: string | null | undefined): ReportRange | null {
  if (isReportPeriod(key)) return key;
  const [from, to, more] = String(key ?? "").split("~");
  return more === undefined && isRealDay(from) && isRealDay(to) && from <= to ? { from, to } : null;
}

/** Whether two ranges are the one range. */
export const sameReportRange = (a: ReportRange, b: ReportRange): boolean => reportRangeKey(a) === reportRangeKey(b);

/**
 * Why a window of days cannot be read, in the request's own words; null where it can. A window ends on the workspace's
 * today at the latest (`today`, the workspace's, never the caller's clock) and covers no more days than a report reads.
 */
export function reportDaysRefusal(days: ReportDays, today: string): string | null {
  if (!isReportDays(days)) return "from and to are days, written YYYY-MM-DD.";
  if (days.from > days.to) return "from is after to.";
  if (days.to > today) return "A report ends today at the latest.";
  if (reportDaysCount(days) > MOST_DAYS) return `A report covers ${MOST_DAYS} days at most.`;
  return null;
}

/**
 * The range a request names: a first and a last day together (`from`, `to`), else `period`, else (until its day) `days`,
 * else the default. Null when what it names is none of ours: half a window, a window beside a period, a day that is no
 * day, or a period we do not offer. Whether the days may be read (not to come, not too many) is asked of the
 * workspace's today, which a request does not know: `reportDaysRefusal`.
 */
export function reportRangeAsked(asked: {
  period?: string | undefined;
  days?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}): ReportRange | null {
  if (asked.from === undefined && asked.to === undefined) return reportPeriodOf(asked);
  if (asked.period !== undefined || asked.days !== undefined) return null;
  return isRealDay(asked.from) && isRealDay(asked.to) ? { from: asked.from, to: asked.to } : null;
}
