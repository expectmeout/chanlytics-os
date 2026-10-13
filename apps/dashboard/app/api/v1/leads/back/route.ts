import { read, workspace } from "@/server/route";
import { backTodayOf } from "@/server/leads/lead-workbench";

/**
 * GET /api/v1/leads/back — Leads' Back today (00426 leads_back_today): the leads who asked to hear back on a day that
 * has come, within the week after it, still not closed, booked, stopped or won, the earliest first. No reach-out writes
 * to them again (decision 9 of the lead workbench): the owner writes by hand. Any member.
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => backTodayOf(ctx, member.tenantId),
});
