import "server-only";
/**
 * Reports › Reach-outs (Reach out, Part 6: H1, H3–H6): what the workspace's reach-outs wrote over Reports' window, one of
 * its periods or the days a member picked (from and to), and what came of it, read by one definer function that checks
 * the member again (00241 reach_out_report; 00360 names a window's last day). The route refuses any other range; the page
 * draws it through contracts' toReachOutLensVM. The reader
 * (readers/campaign-report.ts reachOutReport) answers the route with it, and each chain's own totals beside it.
 */
import type { ReachOutReportDto } from "@chanlytics/contracts";
import { readReachOutReport, type ReportWindow } from "@chanlytics/db/reports";
import type { RouteContext } from "@/server/shared/with-route";
import { dtoOf, reachOutRefusal } from "@/server/campaigns/reach-outs/chain-acts";
import { getWindow } from "@/server/readers/report";

export async function getReachOutReport(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  window: ReportWindow,
): Promise<{ report: ReachOutReportDto }> {
  const answered = await getWindow(readReachOutReport(ctx.supabase, tenantId, window));
  if (!answered.ok) throw reachOutRefusal({ code: answered.code, message: answered.message });
  return { report: dtoOf<ReachOutReportDto>(answered.data) };
}
