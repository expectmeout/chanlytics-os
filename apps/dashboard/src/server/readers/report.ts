import "server-only";
import { z } from "zod";
import {
  AppError,
  dealsAreOn,
  fixedDaysOf,
  headlineOf,
  isReceptionistSeriesDto,
  isReportDto,
  isReviewsLedgerDto,
  monthDaysAt,
  parseTenantConfigResult,
  plural,
  receptionistDtoOf,
  REPORT_PERIOD_IDS,
  reportDaysCount,
  reportDaysRefusal,
  reportPeriodOf,
  reportRangeAsked,
  reviewsAreOnRecord,
  shiftKey,
  zoneDayKey,
  zoneMidnight,
  type BookingReportDto,
  type DealReportDto,
  type PersonRowDto,
  type ReceptionistDto,
  type ReceptionistSeriesDto,
  type ReportDto,
  type ReportHeadlineDto,
  type ReportPeriodId,
  type ReportProfile,
  type ReviewsReportDto,
} from "@chanlytics/contracts";
import {
  ReportWindowNotReadable,
  receptionistSeries,
  reportSeries,
  reviewsLedger,
  type ReportWindow,
} from "@chanlytics/db";
import { googleReadiness } from "../connections/google";
import { bookingReport, linksBooked } from "../calendar/people-visits";
import { dealReport } from "../people/deals";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import { googleReader } from "./connections";
import { everyone as everyoneRead } from "./everyone";
import * as facts from "./facts";
import { log } from "@/server/log";

/**
 * Everyone in People, as the turn holds them (readers/everyone.ts): the booking line, the deals and the booking link's people
 * all count from this one read, so a report (and an Ask turn that reads it) asks People once.
 */
const everyoneOf = (rc: ReaderContext): Promise<PersonRowDto[]> =>
  load(rc, everyoneRead, undefined).then((r) => r.data);

/**
 * Asked, then booked over the window: the one conversion line, from everyone in People and the calendar. Never fatal: a feed that
 * cannot be read costs this line (null), not the report. `people` is everyone, not one 1000-row page: every other number is
 * computed in SQL over the whole workspace, and a conversion rate over a truncated denominator would disagree with all of them.
 * The calendar's zone and settings are the turn's (readers/facts.ts): a turn that holds them reads neither again, and a request
 * reads each once, where the booking line's own lookup read them. The report and the headline both count the line here.
 *
 * Counted only for a window that ends today. The line is made from people as they stand now (when each last wrote, and
 * what is on the calendar now): of a month that ended weeks ago that says nothing true, since a person who wrote then
 * and again last night is dated by last night. So days that ended before today answer "ended", with nothing read, and
 * the page says why (contracts BOOKED_NEEDS_TODAY).
 */
async function bookingOf(
  rc: ReaderContext,
  window: ReportWindow,
  people: Promise<PersonRowDto[]>,
): Promise<BookingReportDto | null> {
  const { days } = window;
  if (window.end !== null) return { calendar: "ended", days, asked: 0, booked: 0 };
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
 * The workspace's hours and closures, which Reports' while-you-were-closed counts against (spec A2): the turn's config,
 * which the booking line already read, parsed as the calendar parses it, without its log line. Null is a profile that
 * could not be read (no row, a config the parser refuses, a read that failed): the report then says nothing of the
 * hours. A config read whole that keeps none is an empty profile, which is how the report knows the workspace has not
 * set them. The report and the Receptionist lens both read it here: one derivation.
 */
async function profileOf(rc: ReaderContext): Promise<ReportProfile | null> {
  return load(rc, facts.config, undefined)
    .then((s) => {
      const parsed = s.data ? parseTenantConfigResult(s.data.config) : null;
      if (!parsed?.ok) return null;
      const { hours, closures } = parsed.config.brain?.profile ?? {};
      return { ...(hours && { hours }), ...(closures && { closures }) };
    })
    .catch(() => null);
}

/**
 * GET reports, as the route answers it: the receptionist's numbers day by day for one of the four periods (the route
 * refuses any other), then the booking line and the deals beside them -- the route's body, moved here whole, so the
 * Reports page and Ask's report tool read the same rows the same way. One SECURITY INVOKER function computes the series
 * in the tenant's own zone under the caller's RLS; a function that answers nothing is the route's 404, in its words,
 * whatever was asked beside it (the series, the booking line and the deals are read together, as the headline's are,
 * and nothing of the others is answered without it). The calendar's zone and settings, and how the workspace's customers buy, come through
 * their readers, once in a turn. It returns the workspace's profile too: the hours and closures the while-you-were-closed
 * count is made from, `{}` where it was read with none, null where it could not be read. The page is the row a citation
 * names.
 */
export const report: Reader<
  ReportWindow,
  { report: ReportDto; booking: BookingReportDto | null; deals: DealReportDto | null; profile: ReportProfile | null }
> = {
  name: "report",
  async read(rc, window) {
    const { days } = window;
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    // The series, the booking line and the deals are asked for together, as the headline's are (below): none needs
    // another's answer, and one after the other the page stood behind each in turn (9 Oct 2026, production: 240 to
    // 330 ms on the server for a workspace of a few conversations, the slowest read the dashboard makes). The series
    // is still what decides there is a report at all: its answer is waited for first, and a function that answers
    // nothing is the route's 404 whatever the others found, each of which keeps its own failure to itself.
    const series = windowRead(reportSeries(ctx.supabase, tenantId, window));
    // Asked, then booked — the one conversion line, from the calendar. Read once: the deals below say where the new
    // clients came from out of the same rows.
    const people = everyoneOf(rc);
    const bookingRead = bookingOf(rc, window, people);
    // The deals of the period and the stock (0004), only where deals are on (0008) and a deal was recorded. Never
    // fatal either: a table that cannot be read costs the section, and People that cannot be read cost only the line
    // that says where the new clients came from. How the workspace's customers buy is the turn's (readers/facts.ts).
    // A window that ended before today is its own days in the workspace's zone, first midnight to the one after its last.
    const dealsRead = Promise.all([load(rc, facts.sellsBy, undefined), spanOf(rc, window)])
      .then(async ([sells, span]) =>
        dealReport(ctx, tenantId, days, dealsAreOn(sells.data), await people.catch(() => []), rc.now, span),
      )
      .catch(() => null);
    const report = (await series) as unknown as ReportDto;
    if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
    const [booking, deals] = await Promise.all([bookingRead, dealsRead]);
    const profile = await profileOf(rc);
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
    // Today reads a period by name, which ends today: no day is named to the database.
    const window = await reportWindowFor(rc, { period });
    const { days } = window;
    const [answer, booking] = await Promise.all([
      reportSeries(rc.ctx.supabase, rc.tenantId, window),
      bookingOf(rc, window, everyoneOf(rc)),
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
 * window they read, said once, so the four never disagree about it. A period by name, or the first and the last day of a
 * window a member picked, never both.
 */
export const ReportQuery = z.object({
  /** `7d`, `30d`, `90d` or `month`; thirty days when none is named. */
  period: z.literal(REPORT_PERIOD_IDS).optional(),
  /** The first day of a window a member picked, "YYYY-MM-DD" in the workspace's zone; with `to`, and no `period` beside them. */
  from: z.string().optional(),
  /** Its last day, today at the latest, no more than ninety days from `from`. */
  to: z.string().optional(),
});

/** The period a request names, or the request's refusal in words: it is the window every report route reads, said once. */
export function reportPeriodAsked(input: z.infer<typeof ReportQuery>): ReportPeriodId {
  const period = reportPeriodOf(input);
  if (period === null) throw new AppError("validation", "period must be 7d, 30d, 90d or month.");
  return period;
}

/** What a request that names days it may not is told: a window is a first and a last day together, and nothing else. */
const WINDOW_REFUSAL =
  "from and to are a first and a last day together, written YYYY-MM-DD, with no period beside them.";

/**
 * The window a request reads: the one place a request becomes days, for every report route. A period by name is a count
 * of days ending today (Month: the days since the 1st in the workspace's own zone, today included) and names no last day,
 * so it is read as it always was. Days a member picked are those days, refused in words where they are not a window
 * (half of one, out of order, to come, or more than a report reads: contracts reportDaysRefusal), and name their last day
 * only where that is before today. The workspace's today is the membership's zone at the turn's own clock (`readerContext`
 * seeds the zone: nothing is read for it, and nothing at all for a period of fixed days), never the request's.
 */
export async function reportWindowFor(rc: ReaderContext, input: z.infer<typeof ReportQuery>): Promise<ReportWindow> {
  const range = reportRangeAsked(input);
  if (range === null) {
    if (input.from !== undefined || input.to !== undefined) throw new AppError("validation", WINDOW_REFUSAL);
    throw new AppError("validation", "period must be 7d, 30d, 90d or month.");
  }
  const fixed = typeof range === "string" ? fixedDaysOf(range) : null;
  if (fixed !== null) return { days: fixed, end: null };
  const zone = (await load(rc, facts.facts, undefined)).data.timezone;
  const today = zoneDayKey(rc.now.getTime(), zone);
  if (typeof range === "string") return { days: monthDaysAt(today), end: null };
  const refusal = reportDaysRefusal(range, today);
  if (refusal) throw new AppError("validation", refusal);
  return { days: reportDaysCount(range), end: range.to === today ? null : range.to };
}

/**
 * The instants a window that ended before today covers, in the workspace's zone: its first midnight, and the midnight
 * after its last day. Null for a window that ends today, which the readers that count by the clock (deals) read as they
 * always did: the days up to now.
 */
async function spanOf(rc: ReaderContext, window: ReportWindow): Promise<{ since: number; until: number } | null> {
  if (window.end === null) return null;
  const zone = (await load(rc, facts.facts, undefined)).data.timezone;
  return {
    since: zoneMidnight(zone, shiftKey(window.end, -(window.days - 1))),
    until: zoneMidnight(zone, shiftKey(window.end, 1)),
  };
}

/**
 * A report read of days that ended before today, on a database that cannot read one yet: the dashboard deploys at the
 * merge and 00360 goes to production on the owner's word, so until then a picked window is refused in words, where a
 * period by name reads as it always did. Never the days of some other window in its place.
 */
export async function windowRead<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (e) {
    if (e instanceof ReportWindowNotReadable)
      throw new AppError("validation", "Picked days cannot be read yet. Pick a period that ends today.");
    throw e;
  }
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
export const reviewsReport: Reader<ReportWindow, ReviewsReportDto> = {
  name: "reviewsReport",
  async read(rc, window) {
    const { days } = window;
    const [held, answer] = await Promise.all([
      load(rc, googleReader, undefined),
      reviewsLedger(rc.ctx.supabase, rc.tenantId, window),
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
        // The window's last day where it ended before today: the lens counts to it, and says so (contracts endedOn).
        ...(window.end !== null && { end: window.end }),
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

/**
 * Of the people sent the booking link, how many have booked since: People read once, narrowed to the people the link went
 * to, and counted against the calendar by the one rule "asked, then booked" counts by (linksBooked). Never fatal: a read
 * that fails is `unavailable` (logged, as the booking line's is), and a calendar that cannot say (`none`, `unavailable`)
 * leaves `booked` null, never 0. The zone and the settings are the turn's, as bookingOf takes them. Days that ended before
 * today are `ended` with nothing read, for the reason the booking line gives (bookingOf): People and the calendar are as
 * they stand now, and say nothing true of a link that went weeks ago. More people sent the link than the database lists
 * (`total` counts them all, `people` is capped) is `ok` with `booked` null and nothing read: a count of the listed
 * alone would understate who booked, and the lens then says how many were sent and nothing of how many booked. No link
 * sent is none booked of none, with nothing read: there is no one to find.
 */
async function linksOf(
  rc: ReaderContext,
  window: ReportWindow,
  links: ReceptionistSeriesDto["links"],
): Promise<{ calendar: BookingReportDto["calendar"]; booked: number | null }> {
  if (window.end !== null) return { calendar: "ended", booked: null };
  if (links.total > links.people.length) return { calendar: "ok", booked: null };
  if (links.people.length === 0) return { calendar: "ok", booked: 0 };
  const linked = new Set(links.people.map((p) => p.c));
  try {
    const [people, zone, settings] = await Promise.all([
      everyoneOf(rc),
      load(rc, facts.facts, undefined),
      load(rc, facts.config, undefined),
    ]);
    const known = { timezone: zone.data.timezone, config: settings.data?.config ?? null };
    const found = await linksBooked(
      rc.ctx,
      rc.tenantId,
      people.filter((p) => linked.has(p.id)),
      links.people,
      rc.now,
      known,
    );
    return { calendar: found.calendar, booked: found.calendar === "ok" ? found.booked : null };
  } catch (e) {
    log.error("booking_report_failed", {
      tenant_id: rc.tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { calendar: "unavailable", booked: null };
  }
}

/**
 * GET reports/receptionist, as the route answers it: what the receptionist did over `days`, which one SECURITY INVOKER
 * function counts in the workspace's own zone (receptionistSeries: the held replies, the topics and languages, the
 * calls, the handovers, when people write, the booking links sent and what is open now), and beside it the hours the
 * workspace keeps (the report's own profile, profileOf). Contracts' receptionistDtoOf makes the route's answer of the
 * two: who waits on the person looking is decided there, by the one rule (standingOfThread), and the people sent the link
 * are counted here (linksOf) against what the calendar could say. The two reads are independent, so they are made
 * together. A function that answers nothing is the page's 404, in its words; a read that fails is the route's failure.
 * A database that does not have the function yet (00380 is applied on the owner's word, after the dashboard deploys)
 * answers null for a period and for picked days alike: the answer is then the window the route was asked with no series,
 * the lens draws its kept cards and none of its own parts (Ask's answer says `{ available: false }`), and the log says
 * `receptionist_series_missing` once a read. No row of its own: it is drawn on the Reports page, which `report` names.
 */
export const receptionistReport: Reader<ReportWindow, ReceptionistDto> = {
  name: "receptionistReport",
  async read(rc, window) {
    // The workspace's zone is asked for with the other two, so a database without the function costs no round trip after
    // them; only that answer waits on it (a membership's turn holds it already). A failed read of it is handled here and
    // costs a database that has the function nothing: the booking link's own read asks again, and a failure is not kept.
    const zone = load(rc, facts.facts, undefined);
    zone.catch(() => undefined);
    const [answer, profile] = await Promise.all([
      receptionistSeries(rc.ctx.supabase, rc.tenantId, window),
      profileOf(rc),
    ]);
    const nowMs = rc.now.getTime();
    if (answer === null) {
      log.warn("receptionist_series_missing", { tenant_id: rc.tenantId });
      const timezone = (await zone).data.timezone;
      const head = {
        timezone,
        today: zoneDayKey(nowMs, timezone),
        ...(window.end !== null && { end: window.end }),
        days: window.days,
      };
      return { data: receptionistDtoOf(null, { booked: null, profile, head, nowMs }), rows: [], stamp: stamp() };
    }
    if (!isReceptionistSeriesDto(answer)) throw new AppError("not_found", "No workspace found for this report.", 404);
    const booked = await linksOf(rc, window, answer.links);
    return { data: receptionistDtoOf(answer, { booked, profile, head: answer, nowMs }), rows: [], stamp: stamp() };
  },
};
