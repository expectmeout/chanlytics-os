import "server-only";
/**
 * Reports › Reach-outs (Reach out, Part 6: H1, H3–H6): what the workspace's reach-outs wrote over one of Reports'
 * periods, and what came of it, read by one definer function that checks the member again (00241 reach_out_report).
 * The route refuses any other period; the page draws it through contracts' toReachOutReportVM.
 */
import type { ReachOutReportDto } from "@chanlytics/contracts";
import { reachOutReport } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { dtoOf, reachOutRefusal } from "@/server/campaigns/reach-outs";

export async function reachOutReportOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  days: number,
): Promise<{ report: ReachOutReportDto }> {
  const answered = await reachOutReport(ctx.supabase, tenantId, days);
  if (!answered.ok) throw reachOutRefusal({ code: answered.code, message: answered.message });
  return { report: dtoOf<ReachOutReportDto>(answered.data) };
}
