import { LeadsQuerySchema } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { leadsPage } from "@/server/leads";

/**
 * GET /api/v1/leads: the Leads scope's rows, as the database ordered them.
 *
 * The rail's list, the class, one of six sorts and its direction are all SQL
 * (`leads_page`), under the caller's own row security, and the next page
 * carries on from the key the database answered rather than from a count of
 * rows read. The first page brings the rail's counts with it, so a view costs
 * one round trip and not two.
 */
export const GET = read({
  scope: workspace,
  query: LeadsQuerySchema,
  handle: ({ ctx, member, input }) => leadsPage(ctx, member.tenantId, input),
});
