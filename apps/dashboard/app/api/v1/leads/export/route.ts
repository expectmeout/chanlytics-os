import { LeadExportQuerySchema } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { exportLeads } from "@/server/leads";

/**
 * GET /api/v1/leads/export — the view, as a CSV, for the business's own
 * records. Owners only and on the ledger, exactly as the people export is:
 * this is a copy of a list leaving the building. What it takes is marked, so
 * the month is not charged twice for the same lead (§0.2).
 */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "export",
  query: LeadExportQuerySchema,
  handle: ({ ctx, member, input }) => exportLeads(ctx, member.tenantId, input),
});
