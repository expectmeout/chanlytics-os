import { ReachOutAddSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { reachOutScope } from "@/server/verbs";
import { addToReachOut } from "@/server/leads/lead-workbench";

/**
 * POST /api/v1/reach-outs/:id/leads — leads added to a reach-out fed by a list (00426 reach_out_add), by its first
 * step. Each lead the one predicate lets go (or whose address is still being checked), counted, not on the list and
 * with no other reach-out joins; the rest are left out with why. A reach-out its search keeps current refuses: it never
 * gains a lead it did not find. An operator's; the answer carries the add's undo. ./check asks the same, writing nothing.
 */
export const POST = write({
  scope: reachOutScope,
  role: "operator",
  rate: "lead_member",
  input: ReachOutAddSchema,
  handle: ({ ctx, row, input }) => addToReachOut(ctx, row.id, input, false),
});
