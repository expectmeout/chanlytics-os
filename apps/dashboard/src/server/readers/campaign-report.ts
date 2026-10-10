import "server-only";
import {
  AppError,
  CAMPAIGNS_RESULTS_PERIOD,
  MIN_MS,
  chainTotalsFromReport,
  chainTotalsOf,
  type CampaignReportDto,
  type CampaignSourceDto,
  type ReachOutChainTotalsDto,
  type ReachOutReportDto,
} from "@chanlytics/contracts";
import { campaignSeries, reachOutChainTotals, type ReportWindow } from "@chanlytics/db";
import { log } from "@/server/log";
import { reachOutReportOf } from "../campaigns/reach-out-report";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import { reportWindowFor, windowRead } from "./report";

/**
 * GET reports/campaigns, as the route answers it: what the offers earned over one of the three presets (the route
 * refuses any other) -- the route's body, moved here whole. The twin of `report`: one SECURITY INVOKER function
 * computes the series in the tenant's own zone under the caller's RLS, over two periods so the page can show a change,
 * plus the current period by playbook or broadcast; a function that answers nothing is the route's 404, in its words.
 * No row of its own: it is drawn on the Reports page, which `report` names.
 *
 * Kept a minute across an Ask turn's next questions (only a turn keeps: a route reads it fresh), since every Campaigns
 * turn reads it for its rows. It depends on nothing but its window and the workspace: a window that ends today is the
 * database's today, never the turn's clock.
 */
export const campaignReport: Reader<ReportWindow, { report: CampaignReportDto }> = {
  name: "campaignReport",
  ttlMs: MIN_MS,
  async read(rc, window) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const report = (await windowRead(campaignSeries(ctx.supabase, tenantId, window))) as unknown as CampaignReportDto;
    if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
    return { data: { report }, rows: [], stamp: stamp() };
  },
};

/**
 * Each campaign's numbers over Campaigns' own period (contracts CAMPAIGNS_RESULTS_PERIOD, 30 days ending today), read as
 * GET reports/campaigns?period=30d reads them (its window from the route's own reportWindowFor): campaign_series'
 * sources, the numbers a campaign's row on Campaigns says (D35). Null where they could not be read, logged, never
 * all-time totals in their place. Ask's campaigns read and the Campaigns page's context say them.
 */
export async function lastDaysBySource(rc: ReaderContext): Promise<CampaignSourceDto[] | null> {
  try {
    const window = await reportWindowFor(rc, { period: CAMPAIGNS_RESULTS_PERIOD });
    return (await load(rc, campaignReport, window)).data.report.sources ?? [];
  } catch (e) {
    log.error("campaign_last_days_read_failed", {
      tenant_id: rc.tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** A campaign's sends and replies in those days (lastDaysBySource's): none where it sent nothing, null where unread. */
export function lastDaysOf(
  sources: readonly CampaignSourceDto[] | null,
  id: string,
): { sent: number; replied: number } | null {
  if (!sources) return null;
  const s = sources.find((x) => x.kind === "playbook" && x.id === id);
  return { sent: s?.sent ?? 0, replied: s?.replied ?? 0 };
}

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

/**
 * Each reach-out's numbers over Campaigns' own period, read as GET reports/reach-outs?period=30d reads them (reachOutReport,
 * over the route's own window): each chain's own totals by its root, or the report's twenty where those cannot be read,
 * which its row on Campaigns says (contracts chainResultsOf). Null where the report could not be read, logged. The
 * reach-outs' twin of lastDaysBySource: Ask's context of the page says them.
 */
export async function chainLastDays(rc: ReaderContext): Promise<ReachOutChainTotalsDto | null> {
  try {
    const window = await reportWindowFor(rc, { period: CAMPAIGNS_RESULTS_PERIOD });
    return (await load(rc, reachOutReport, window)).data.chains;
  } catch (e) {
    log.error("reach_out_last_days_read_failed", {
      tenant_id: rc.tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
