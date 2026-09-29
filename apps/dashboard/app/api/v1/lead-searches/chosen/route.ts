import { LeadChooseSchema } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { chooseLeads } from "@/server/leads/lead-lists";

/**
 * POST /api/v1/lead-searches/chosen: *Write to them* on Leads' bulk bar (Reach out, Part 7, 00242 lead_search_choose).
 * The chosen leads become a search of their own for a reach-out to write to, so it is the reach-out's own permission:
 * an owner, an operator or a partner. It spends nothing: only a lead already counted joins, and it is not counted
 * again. At most 500 a press.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lead_bulk",
  spend: false,
  input: LeadChooseSchema,
  handle: ({ ctx, member, input }) => chooseLeads(ctx, member.tenantId, input),
});
