import { RenameLeadSearchSchema } from "@chanlytics/contracts";
import { read, workspace, write } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { leadSearchScope, removeSearch, renameSearch, searchRow } from "@/server/leads";

/** GET /api/v1/lead-searches/:id: one search with its latest round, as lead_searches_view says it. */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => ({
    search: await searchRow(ctx, member.tenantId, requireUuid(ctx.params.id, "search")),
  }),
});

/** PATCH /api/v1/lead-searches/:id — rename. An operator's: a name changes nothing that is spent. */
export const PATCH = write({
  scope: leadSearchScope,
  role: "operator",
  rate: "lead_member",
  input: RenameLeadSearchSchema,
  handle: ({ ctx, row, input }) => renameSearch(ctx, row, input.name),
});

/**
 * DELETE /api/v1/lead-searches/:id — remove the search, keeping the leads that
 * are being worked. The owner's: live rounds end, memberships are blanked, and
 * what it kept is what the toast counts.
 */
export const DELETE = write({
  scope: leadSearchScope,
  role: "partner",
  rate: "lead_member",
  handle: ({ ctx, row }) => removeSearch(ctx, row),
});
