import { withRoute, memberContext } from "@/server/with-route";
import { AppError, REPORT_RANGES, type CampaignReportDto } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";

/**
 * GET /api/v1/reports/campaigns?days=7|30|90 — what the offers earned.
 *
 * The twin of /api/v1/reports: one SECURITY INVOKER function computes the
 * series in the tenant's own time zone under the caller's RLS, over two
 * periods so the page can show a change, plus the current period by
 * playbook or broadcast. The same three presets, for the same reason.
 */
export const GET = withRoute(async (req, ctx) => {
  await takeRate(ctx.userId, "aggregate");
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 30);
  if (!REPORT_RANGES.some((r) => r.days === days)) {
    throw new AppError("validation", "days must be 7, 30 or 90.");
  }
  const { tenantId } = await memberContext(ctx, url.searchParams.get("workspace"));
  const { data, error } = await ctx.supabase.rpc("campaign_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(error.message);
  const report = data as unknown as CampaignReportDto;
  if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
  return { report };
});
