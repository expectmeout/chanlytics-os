import { RenameLeadSearchSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { leadSearchScope, removeSearch, renameSearch } from "@/server/leads/leads";

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
