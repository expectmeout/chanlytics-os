import "server-only";
import { AppError, dealsAreOn, type BookingReportDto, type DealReportDto, type ReportDto } from "@chanlytics/contracts";
import { everyone } from "../people/people";
import { bookingReport } from "../calendar/calendar";
import { dealReport } from "../people/deals";
import { load, stamp, type Reader } from "./index";
import * as facts from "./facts";

/**
 * GET reports, as the route answers it: the receptionist's numbers day by day for one of the three presets (the route
 * refuses any other), then the booking line and the deals beside them -- the route's body, moved here whole, so the
 * Reports page and Ask's report tool read the same rows the same way. One SECURITY INVOKER function computes the series
 * in the tenant's own zone under the caller's RLS; a function that answers nothing is the route's 404, in its words,
 * before anything else is read. The calendar's zone and settings, and how the workspace's customers buy, come through
 * their readers, once in a turn. The page is the row a citation names.
 */
export const report: Reader<
  { days: number },
  { report: ReportDto; booking: BookingReportDto | null; deals: DealReportDto | null }
> = {
  name: "report",
  async read(rc, { days }) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const { data, error } = await ctx.supabase.rpc("report_series", { p_tenant_id: tenantId, p_days: days });
    if (error) throw new Error(error.message);
    const report = data as unknown as ReportDto;
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
        console.error(
          "booking_report_failed",
          JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
        );
        return null;
      });
    // The deals of the period and the stock (0004), only where deals are on (0008) and a deal was recorded. Never
    // fatal either: a table that cannot be read costs the section, and People that cannot be read cost only the line
    // that says where the new clients came from. How the workspace's customers buy is the turn's (readers/facts.ts).
    const deals = await load(rc, facts.sellsBy, undefined)
      .then((r) => r.data)
      .then(async (sellsBy) => dealReport(ctx, tenantId, days, dealsAreOn(sellsBy), await people.catch(() => [])))
      .catch(() => null);
    return {
      data: { report, booking, deals },
      rows: [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${days} days` }],
      stamp: stamp(),
    };
  },
};
