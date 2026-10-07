import { LeadImportSchema, SPEND_LEADS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { importLeads } from "@/server/leads/lead-lists";

/**
 * POST /api/v1/lead-searches/import: a file of the owner's own leads as a search of its own (Reach out, Part 7, 00242
 * lead_search_import). Every address is checked first, by the finder's own round, and one that checks out counts as a
 * lead of the month, so it is the finder's: an owner or a partner, on a workspace that may spend, counted against
 * `lead_search`. The body is a name, who they are, and 1 to 500 rows the page read from the file (contracts
 * leadImportPlanOf); the door reads each row again and says what it left out.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lead_search",
  spend: true,
  // A refusal here is about finding leads, not about buying a number.
  spendWords: SPEND_LEADS,
  input: LeadImportSchema,
  handle: ({ ctx, member, input }) => importLeads(ctx, member.tenantId, input),
});
