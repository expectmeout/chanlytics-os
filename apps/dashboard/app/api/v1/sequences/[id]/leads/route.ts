import { ReachOutAddSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { addToReachOut } from "@/server/leads/lead-workbench";

/**
 * POST /api/v1/sequences/:id/leads — { lead_ids }: leads added to a sequence to leads (00426 reach_out_add, 00459: every
 * sequence to leads holds its list, a draft too). Each lead the one predicate lets go (or whose address is still being
 * checked), counted, not on its list and in no other sequence joins; the rest are left out with why. An operator's; the
 * answer carries the add's undo. ./check asks the same, writing nothing.
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "lead_member",
  input: ReachOutAddSchema,
  handle: ({ ctx, row, input }) => addToReachOut(ctx, row.id, input, false),
});
