import "server-only";
import { AppError, type CampaignReportDto } from "@chanlytics/contracts";
import { campaignSeries } from "@chanlytics/db";
import { stamp, type Reader } from "./index";

/**
 * GET reports/campaigns, as the route answers it: what the offers earned over one of the three presets (the route
 * refuses any other) -- the route's body, moved here whole. The twin of `report`: one SECURITY INVOKER function
 * computes the series in the tenant's own zone under the caller's RLS, over two periods so the page can show a change,
 * plus the current period by playbook or broadcast; a function that answers nothing is the route's 404, in its words.
 * No row of its own: it is drawn on the Reports page, which `report` names.
 */
export const campaignReport: Reader<{ days: number }, { report: CampaignReportDto }> = {
  name: "campaignReport",
  async read(rc, { days }) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const report = (await campaignSeries(ctx.supabase, tenantId, days)) as unknown as CampaignReportDto;
    if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
    return { data: { report }, rows: [], stamp: stamp() };
  },
};
