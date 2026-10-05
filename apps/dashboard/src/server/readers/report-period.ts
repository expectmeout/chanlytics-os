import "server-only";
import { z } from "zod";
import { AppError, fixedDaysOf, monthDaysAt, reportPeriodOf, zoneDayKey } from "@chanlytics/contracts";
import { load, type ReaderContext } from "./index";
import * as facts from "./facts";

/**
 * The one query the three report routes take (GET reports, reports/campaigns and reports/reach-outs): the window they
 * read, said once, so the three never disagree about it.
 */
export const ReportQuery = z.object({
  /** `7d`, `30d`, `90d` or `month`; thirty days when none is named. */
  period: z.string().optional(),
  /** What the pages sent before `period` existed: read until 19 October 2026 (contracts report-periods.ts, and the day is held by tests/reports/periods/report-periods.test.mjs). */
  days: z.string().optional(),
});

/**
 * The days a request's period is. Month is the days since the 1st in the workspace's own zone, today included (the zone is
 * the membership's, which `readerContext` seeds: nothing is read for it, and nothing at all for a period of fixed days).
 * A period that is none of ours is the request's refusal.
 */
export async function reportDaysFor(rc: ReaderContext, input: z.infer<typeof ReportQuery>): Promise<number> {
  const period = reportPeriodOf(input);
  if (period === null) throw new AppError("validation", "period must be 7d, 30d, 90d or month.");
  const fixed = fixedDaysOf(period);
  if (fixed !== null) return fixed;
  const zone = (await load(rc, facts.facts, undefined)).data.timezone;
  return monthDaysAt(zoneDayKey(rc.now.getTime(), zone));
}
