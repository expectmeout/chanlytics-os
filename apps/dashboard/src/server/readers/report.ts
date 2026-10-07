import "server-only";
import { z } from "zod";
import {
  AppError,
  dealsAreOn,
  fixedDaysOf,
  headlineOf,
  isReportDto,
  isReviewsLedgerDto,
  monthDaysAt,
  parseTenantConfigResult,
  plural,
  REPORT_PERIOD_IDS,
  reportPeriodOf,
  reviewsAreOnRecord,
  zoneDayKey,
  type BookingReportDto,
  type DealReportDto,
  type PersonRowDto,
  type ReportDto,
  type ReportHeadlineDto,
  type ReportPeriodId,
  type ReportProfile,
  type ReviewsReportDto,
} from "@chanlytics/contracts";
import { reportSeries, reviewsLedger } from "@chanlytics/db";
import { googleReadiness } from "../connections/google";
import { everyone } from "../people/people";
import { bookingReport } from "../calendar/people-visits";
import { dealReport } from "../people/deals";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import { googleReader } from "./connections";
import * as facts from "./facts";
import { log } from "@/server/log";

/**
 * Asked, then booked over `days`: the one conversion line, from everyone in People and the calendar. Never fatal: a feed that
 * cannot be read costs this line (null), not the report. `people` is everyone, not one 1000-row page: every other number is
 * computed in SQL over the whole workspace, and a conversion rate over a truncated denominator would disagree with all of them.
 * The calendar's zone and settings are the turn's (readers/facts.ts): a turn that holds them reads neither again, and a request
 * reads each once, where the booking line's own lookup read them. The report and the headline both count the line here.
 */
async function bookingOf(
  rc: ReaderContext,
  days: number,
  people: Promise<PersonRowDto[]>,
): Promise<BookingReportDto | null> {
  return people
    .then(async (rows) => {
      const [zone, settings] = await Promise.all([load(rc, facts.facts, undefined), load(rc, facts.config, undefined)]);
      return bookingReport(rc.ctx, rc.tenantId, rows, days, undefined, {
        timezone: zone.data.timezone,
        config: settings.data?.config ?? null,
      });
    })
    .catch((e: unknown) => {
      log.error("booking_report_failed", {
        tenant_id: rc.tenantId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    });
}

/**
 * GET reports, as the route answers it: the receptionist's numbers day by day for one of the four periods (the route
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
    // Asked, then booked — the one conversion line, from the calendar. Read once: the deals below say where the new
    // clients came from out of the same rows.
    const people = everyone(ctx, tenantId);
    const booking = await bookingOf(rc, days, people);
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
 * GET reports/headline, as the route answers it: what Today reads of a period and nothing else of the report. The same
 * `report_series` the page's route calls, summed here by contracts' `headlineOf` (so the number is the page's number and no day of
 * the series goes over the wire), and the booking line counted by `bookingOf`, the page's own code, beside it: the series and the
 * people and the calendar are read together, not one after the other. A function that answers nothing is the page's 404.
 */
export const reportHeadline: Reader<{ period: ReportPeriodId }, { headline: ReportHeadlineDto }> = {
  name: "report_headline",
  async read(rc, { period }) {
    const days = await reportDaysFor(rc, { period });
    const [answer, booking] = await Promise.all([
      reportSeries(rc.ctx.supabase, rc.tenantId, days),
      bookingOf(rc, days, everyone(rc.ctx, rc.tenantId)),
    ]);
    if (!isReportDto(answer)) throw new AppError("not_found", "No workspace found for this report.", 404);
    return {
      data: { headline: headlineOf(answer, period, booking) },
      rows: [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${plural(days, "day")}` }],
      stamp: stamp(),
    };
  },
};

/**
 * The one query the four report routes take (GET reports, reports/campaigns, reports/reach-outs and reports/reviews): the
 * window they read, said once, so the four never disagree about it.
 */
export const ReportQuery = z.object({
  /** `7d`, `30d`, `90d` or `month`; thirty days when none is named. */
  period: z.literal(REPORT_PERIOD_IDS).optional(),
  /** What the pages sent before `period` existed: read until 19 October 2026 (contracts report-periods.ts, and the day is held by tests/reports/periods/report-periods.test.mjs). */
  days: z.string().optional(),
});

/** The period a request names, or the request's refusal in words: it is the window every report route reads, said once. */
export function reportPeriodAsked(input: z.infer<typeof ReportQuery>): ReportPeriodId {
  const period = reportPeriodOf(input);
  if (period === null) throw new AppError("validation", "period must be 7d, 30d, 90d or month.");
  return period;
}

/**
 * The days a request's period is. Month is the days since the 1st in the workspace's own zone, today included (the zone is
 * the membership's, which `readerContext` seeds: nothing is read for it, and nothing at all for a period of fixed days).
 * A period that is none of ours is the request's refusal.
 */
export async function reportDaysFor(rc: ReaderContext, input: z.infer<typeof ReportQuery>): Promise<number> {
  const period = reportPeriodAsked(input);
  const fixed = fixedDaysOf(period);
  if (fixed !== null) return fixed;
  const zone = (await load(rc, facts.facts, undefined)).data.timezone;
  return monthDaysAt(zoneDayKey(rc.now.getTime(), zone));
}

/**
 * GET reports/reviews, as the route answers it: what customers say in public over `days`, drawn from what is stored.
 * Google as the Google reader holds it (the listing, the newest reviews, the daily readings, once a turn: `GET google`
 * answers the same read), and beside it the ledger of the reviews on record, which one SECURITY INVOKER function counts in
 * the workspace's own zone (reviewsLedger). The two are independent, so they are read together, and the ledger is kept only
 * where a listing is linked and the Business Profile has synced (contracts reviewsAreOnRecord); the five reviews Google shows
 * are no record to count. The window is the database's where the ledger is kept, else the turn's own zone and day. Whether
 * the lens has anything to draw asks what this deployment can do with Google only when no listing is kept. A function that
 * answers nothing is the page's 404, in its words; a ledger that cannot be read is the route's failure, never null, so "not
 * on record" and "could not read" are not the same answer. A database that does not have the function yet (00350 is applied
 * on the owner's word, after the dashboard deploys) answers null: the ledger is then null for every workspace, the lens
 * draws the listing alone, and the log says `reviews_ledger_missing` once a read. No row of its own: it is drawn on the
 * Reports page, which `report` names.
 */
export const reviewsReport: Reader<{ days: number }, ReviewsReportDto> = {
  name: "reviewsReport",
  async read(rc, { days }) {
    const [held, answer] = await Promise.all([
      load(rc, googleReader, undefined),
      reviewsLedger(rc.ctx.supabase, rc.tenantId, days),
    ]);
    if (answer === null) log.warn("reviews_ledger_missing", { tenant_id: rc.tenantId });
    else if (!isReviewsLedgerDto(answer)) throw new AppError("not_found", "No workspace found for this report.", 404);
    const g = held.data;
    const ledger = isReviewsLedgerDto(answer) && reviewsAreOnRecord(g) ? answer : null;
    const timezone = ledger?.timezone ?? (await load(rc, facts.facts, undefined)).data.timezone;
    const readable = g.listing !== null || (await googleReadiness().then((r) => r.places || r.profile));
    return {
      data: {
        timezone,
        today: ledger?.today ?? zoneDayKey(rc.now.getTime(), timezone),
        days: ledger?.days ?? days,
        google: g,
        readable,
        ledger,
      },
      rows: [],
      stamp: stamp(),
    };
  },
};
