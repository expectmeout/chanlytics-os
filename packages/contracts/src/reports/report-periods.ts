/**
 * The periods Reports offers and how a request names one (the table is REPORT_RANGES, reports.ts: said once). Three are a
 * count of days; Month is the days since the 1st in the workspace's own zone, today included, so on the 5th it is 5 days,
 * against the 5 before. A request names `period`; `days`, which every page sent before there was a Month, is read for a
 * release longer so a tab opened before the deploy still reads (either deploy order works), and the day it ends is held by
 * tests/reports/periods/report-periods.test.mjs.
 */
import { shiftKey } from "../calendar/day-keys";
import { REPORT_RANGES, fmtDay } from "./reports";

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

/** The days a period covers at a business day, and how the period's picker says them. */
export interface ReportWindowVM {
  period: ReportPeriodId;
  /** The first day and the last, "YYYY-MM-DD", today the last. */
  from: string;
  to: string;
  /** "Sep 7 – Oct 6". */
  range: string;
  /** "Last 30 days", or "This month so far". */
  said: string;
}

/**
 * The days a period covers at a business day ("2026-10-06", the workspace's own today): a count of days ends today, today
 * included, as the report reads them; Month is the 1st to today. Said for the picker before its read lands, so the window
 * picked shows at once, by the same arithmetic the route reads with (fixedDaysOf, monthDaysAt).
 */
export function reportWindowOf(period: ReportPeriodId, today: string): ReportWindowVM {
  const fixed = fixedDaysOf(period);
  const from = periodSince(today, fixed ?? monthDaysAt(today));
  const label = REPORT_RANGES.find((r) => r.id === period)?.label ?? "";
  return {
    period,
    from,
    to: today,
    range: from === today ? fmtDay(today) : `${fmtDay(from)} – ${fmtDay(today)}`,
    said: fixed === null ? "This month so far" : `Last ${label}`,
  };
}
