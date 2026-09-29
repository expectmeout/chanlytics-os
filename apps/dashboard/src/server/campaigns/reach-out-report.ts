import "server-only";
/**
 * Reports › Reach-outs (Reach out, Part 6: H1, H3–H6): what the workspace's reach-outs wrote over one of Reports'
 * periods, and what came of it, read by one definer function that checks the member again (00241 reach_out_report).
 * The route refuses any other period; the page draws it through contracts' toReachOutReportVM.
 */
import type { ReachOutReportDto } from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { dtoOf, reachOutRefusal } from "@/server/campaigns/reach-outs";

export async function reachOutReportOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  days: number,
): Promise<{ report: ReachOutReportDto }> {
  const { data, error } = await ctx.supabase.rpc("reach_out_report", { p_tenant_id: tenantId, p_days: days });
  if (error) throw reachOutRefusal(error);
  return { report: dtoOf<ReachOutReportDto>(data) };
}
