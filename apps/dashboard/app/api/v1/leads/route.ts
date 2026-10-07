import { LeadsQuerySchema } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { leads } from "@/server/readers/leads";

/**
 * GET /api/v1/leads: the Leads scope's rows, as the database ordered them.
 *
 * The rail's list, the class, one of six sorts and its direction are all SQL
 * (`leads_page`), under the caller's own row security, and the next page
 * carries on from the key the database answered rather than from a count of
 * rows read. The first page brings the rail's counts with it, so a view costs
 * one round trip and not two. The body is its reader's (readers/leads.ts),
 * which Ask's page context reads too.
 */
export const GET = read({
  scope: workspace,
  query: LeadsQuerySchema,
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), leads, input)).data,
});
