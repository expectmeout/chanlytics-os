import { LeadDraftInputSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { draftFor, leadScope } from "@/server/leads/leads";

/**
 * POST /api/v1/leads/:id/draft — one email to one business, written here and
 * sent from the owner's own mail app.
 *
 * A model call, counted in Ask's one daily budget, so it has a bucket of its
 * own (per person, sixty an hour) on top of that budget. It is refused before
 * any model call when the workspace has no address — US law asks for one at
 * the foot — and when this lead has no address that reaches them.
 */
export const POST = write({
  scope: leadScope,
  role: "operator",
  rate: "lead_draft",
  input: LeadDraftInputSchema,
  handle: ({ ctx, row, input }) => draftFor(ctx, row, input),
});
