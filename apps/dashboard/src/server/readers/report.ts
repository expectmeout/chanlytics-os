import "server-only";
import { z } from "zod";
import {
  AppError,
  dealsAreOn,
  fixedDaysOf,
  monthDaysAt,
  parseTenantConfigResult,
  plural,
  REPORT_PERIOD_IDS,
  reportPeriodOf,
  zoneDayKey,
  type BookingReportDto,
  type DealReportDto,
  type ReportDto,
  type ReportProfile,
} from "@chanlytics/contracts";
import { reportSeries } from "@chanlytics/db";
import { everyone } from "../people/people";
import { bookingReport } from "../calendar/people-visits";
import { dealReport } from "../people/deals";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import * as facts from "./facts";
import { log } from "@/server/log";

/**
 * GET reports, as the route answers it: the receptionist's numbers day by day for one of the three presets (the route
 * refuses any other), then the booking line and the deals beside them -- the route's body, moved here whole, so the
 * Reports page and Ask's report tool read the same rows the same way. One SECURITY INVOKER function computes the series
 * in the tenant's own zone under the caller's RLS; a function that answers nothing is the route's 404, in its words,
 * before anything else is read. The calendar's zone and settings, and how the workspace's customers buy, come through
 * their readers, once in a turn. It returns the workspace's profile too: the hours and closures the while-you-were-closed
 * count is made from, `{}` where it was read with none, null where it could not be read. The page is the row a citation
 * names.
 */
export const report: Reader<
  { days: number },
  { report: ReportDto; booking: BookingReportDto | null; deals: DealReportDto | null; profile: ReportProfile | null }
> = {
  name: "report",
  async read(rc, { days }) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const report = (await reportSeries(ctx.supabase, tenantId, days)) as unknown as ReportDto;
    if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
    // Asked, then booked — the one conversion line, from the calendar. Never
    // fatal: a feed that cannot be read costs this line, not the report.
    // everyone(), not one 1000-row page: every other number on this page is
    // computed in SQL over the whole tenant, and a conversion rate over a
    // truncated denominator would disagree with all of them. Read once: the
    // deals below say where the new clients came from out of the same rows.
    const people = everyone(ctx, tenantId);
    const booking = await people
      .then(async (rows) => {
        // The calendar's zone and settings are the turn's (readers/facts.ts): a turn that holds them reads neither
        // again, and a request reads each once, where the booking line's own lookup read them.
        const [zone, settings] = await Promise.all([
          load(rc, facts.facts, undefined),
          load(rc, facts.config, undefined),
        ]);
        return bookingReport(ctx, tenantId, rows, days, undefined, {
          timezone: zone.data.timezone,
          config: settings.data?.config ?? null,
        });
      })
      .catch((e: unknown) => {
        log.error("booking_report_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
        return null;
      });
    // The deals of the period and the stock (0004), only where deals are on (0008) and a deal was recorded. Never
    // fatal either: a table that cannot be read costs the section, and People that cannot be read cost only the line
    // that says where the new clients came from. How the workspace's customers buy is the turn's (readers/facts.ts).
    const deals = await load(rc, facts.sellsBy, undefined)
      .then((r) => r.data)
      .then(async (sellsBy) => dealReport(ctx, tenantId, days, dealsAreOn(sellsBy), await people.catch(() => [])))
      .catch(() => null);
    // The workspace's hours and closures, which Reports' while-you-were-closed counts against (spec A2): the turn's
    // config, which the booking line above already read, parsed as the calendar parses it, without its log line. Null
    // is a profile that could not be read (no row, a config the parser refuses, a read that failed): the report then
    // says nothing of the hours. A config read whole that keeps none is an empty profile, which is how the report
    // knows the workspace has not set them.
    const profile: ReportProfile | null = await load(rc, facts.config, undefined)
      .then((s) => {
        const parsed = s.data ? parseTenantConfigResult(s.data.config) : null;
        if (!parsed?.ok) return null;
        const { hours, closures } = parsed.config.brain?.profile ?? {};
        return { ...(hours && { hours }), ...(closures && { closures }) };
      })
      .catch(() => null);
    return {
      data: { report, booking, deals, profile },
      rows: [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${plural(days, "day")}` }],
      stamp: stamp(),
    };
  },
};

/**
 * The one query the three report routes take (GET reports, reports/campaigns and reports/reach-outs): the window they
 * read, said once, so the three never disagree about it.
 */
export const ReportQuery = z.object({
  /** `7d`, `30d`, `90d` or `month`; thirty days when none is named. */
  period: z.literal(REPORT_PERIOD_IDS).optional(),
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
