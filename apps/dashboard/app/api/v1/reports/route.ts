import { z } from "zod";
import { read, workspace } from "@/server/route";
import { AppError, REPORT_RANGES, dealsAreOn, type ReportDto } from "@chanlytics/contracts";
import { everyone } from "@/server/people";
import { bookingReport } from "@/server/calendar";
import { dealReport, sellsByOf } from "@/server/deals";

const Query = z.object({
  /** 7, 30 or 90; thirty by default. */
  days: z.string().optional(),
});

/**
 * GET /api/v1/reports?days=7|30|90 — the receptionist's numbers, day by day.
 *
 * One SECURITY INVOKER function computes the series in the tenant's own time
 * zone under the caller's RLS. The payload spans two periods so the client can
 * show deltas without a second round trip. Only the three presets are
 * accepted: a report that anyone can point at a different window than the
 * one beside it stops agreeing with itself. Counted with the other aggregate
 * reads.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const days = Number(input.days ?? 30);
    if (!REPORT_RANGES.some((r) => r.days === days)) {
      throw new AppError("validation", "days must be 7, 30 or 90.");
    }
    const tenantId = member.tenantId;
    const { data, error } = await ctx.supabase.rpc("report_series", { p_tenant_id: tenantId, p_days: days });
    if (error) throw new Error(error.message);
    const report = data as unknown as ReportDto;
    if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
    // Asked, then booked — the one conversion line, from the calendar. Never
    // fatal: a feed that cannot be read costs this line, not the report.
    // everyone(), not one 1000-row page: every other number on this page is
    // computed in SQL over the whole tenant, and a conversion rate over a
    // truncated denominator would disagree with all of them.
    const booking = await everyone(ctx, tenantId)
      .then((rows) => bookingReport(ctx, tenantId, rows, days))
      .catch((e: unknown) => {
        console.error(
          "booking_report_failed",
          JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
        );
        return null;
      });
    // The deals of the period and the clients now (0004), only where deals are on (0008) and a deal was recorded.
    // Never fatal either: a table that cannot be read costs the section, not the report.
    const deals = await sellsByOf(ctx, tenantId)
      .then((sellsBy) => dealReport(ctx, tenantId, days, dealsAreOn(sellsBy)))
      .catch(() => null);
    return { report, booking, deals };
  },
});
