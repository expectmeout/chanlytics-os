import "server-only";
import {
  AppError,
  chainTotalsFromReport,
  chainTotalsOf,
  type CampaignReportDto,
  type ReachOutChainTotalsDto,
  type ReachOutReportDto,
} from "@chanlytics/contracts";
import { campaignSeries, reachOutChainTotals, type ReportWindow } from "@chanlytics/db";
import { log } from "@/server/log";
import { reachOutReportOf } from "../campaigns/reach-out-report";
import { stamp, type Reader } from "./index";
import { windowRead } from "./report";

/**
 * GET reports/campaigns, as the route answers it: what the offers earned over one of the three presets (the route
 * refuses any other) -- the route's body, moved here whole. The twin of `report`: one SECURITY INVOKER function
 * computes the series in the tenant's own zone under the caller's RLS, over two periods so the page can show a change,
 * plus the current period by playbook or broadcast; a function that answers nothing is the route's 404, in its words.
 * No row of its own: it is drawn on the Reports page, which `report` names.
 */
export const campaignReport: Reader<ReportWindow, { report: CampaignReportDto }> = {
  name: "campaignReport",
  async read(rc, window) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const report = (await windowRead(campaignSeries(ctx.supabase, tenantId, window))) as unknown as CampaignReportDto;
    if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
    return { data: { report }, rows: [], stamp: stamp() };
  },
};

/**
 * GET reports/reach-outs, as the route answers it: what the reach-outs wrote over the window and what came of it (00241
 * reach_out_report, campaigns/reach-out-report.ts reachOutReportOf), and beside it each chain's own totals by its root
 * (reach_out_chain_totals, 00374), so a chain past the report's twenty still says its numbers or "Nothing sent" (spec
 * 2026-10-09 §4.5). Both are read over the one window the route worked out (readers/report.ts reportWindowFor), its
 * last day named to each only where it is not today, so the report and the chains count the same days. The report's own
 * chains, said as not every chain (`complete: false`), stand in wherever the totals cannot be read: for one release a
 * database without the function (so either deploy order works), and always a read that fails (a timeout, a refusal),
 * logged, so the chains' totals never take the report down with them: the report is what the section says, and the
 * totals only what lies past its twenty. Only the report's own read throws. The campaigns' report's twin; Ask's report
 * reads it too.
 */
export const reachOutReport: Reader<
  ReportWindow,
  { report: ReachOutReportDto; chains: ReachOutChainTotalsDto | null }
> = {
  name: "reachOutReport",
  async read(rc, window) {
    const [{ report }, totals] = await Promise.all([
      reachOutReportOf(rc.ctx, rc.tenantId, window),
      reachOutChainTotals(rc.ctx.supabase, rc.tenantId, window).catch((e: unknown) => {
        log.error("reach_out_chain_totals_read_failed", {
          tenant_id: rc.tenantId,
          error: e instanceof Error ? e.message : String(e),
        });
        return "failed" as const;
      }),
    ]);
    const chains = typeof totals === "string" ? chainTotalsFromReport(report) : chainTotalsOf(totals);
    return { data: { report, chains }, rows: [], stamp: stamp() };
  },
};
