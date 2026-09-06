import { withRoute, memberContext } from "@/server/with-route";
import { AppError, REPORT_RANGES, type ReportDto } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";
import { listPeople } from "@/server/people";
import { bookingReport } from "@/server/calendar";

/**
 * GET /api/v1/reports?days=7|30|90 — the receptionist's numbers, day by day.
 *
 * One SECURITY INVOKER function computes the series in the tenant's own time
 * zone under the caller's RLS. The payload spans two periods so the client can
 * show deltas without a second round trip. Only the three presets are
 * accepted: a report that anyone can point at a different window than the
 * one beside it stops agreeing with itself.
 */
export const GET = withRoute(async (req, ctx) => {
  await takeRate(ctx.userId, "aggregate");
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 30);
  if (!REPORT_RANGES.some((r) => r.days === days)) {
    throw new AppError("validation", "days must be 7, 30 or 90.");
  }
  const { tenantId } = await memberContext(ctx, url.searchParams.get("workspace"));
  const { data, error } = await ctx.supabase.rpc("report_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(error.message);
  const report = data as unknown as ReportDto;
  if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
  // Asked, then booked — the one conversion line, from the calendar. Never
  // fatal: a feed that cannot be read costs this line, not the report.
  const booking = await listPeople(ctx, tenantId)
    .then((rows) => bookingReport(ctx, tenantId, rows, days))
    .catch((e: unknown) => { console.error("booking_report_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) })); return null; });
  return { report, booking };
});
