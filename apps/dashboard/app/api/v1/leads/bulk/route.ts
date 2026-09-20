import { LeadsBulkSchema } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { bulkStage } from "@/server/leads";

/**
 * POST /api/v1/leads/bulk — mark many leads contacted, or not a fit.
 *
 * The ids the owner selected, or every lead the view matches when they chose
 * "Select all 1,240 that match" (S13) — never both, and the door refuses a
 * body that names both. The view's filters are the ones `leads_page` reads,
 * with no paging, so the act reaches 1,240 and not the 500 on screen.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lead_bulk",
  input: LeadsBulkSchema,
  handle: ({ ctx, member, input }) => bulkStage(ctx, member.tenantId, input),
});
