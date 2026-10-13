import { ReachOutAddSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { reachOutScope } from "@/server/verbs";
import { addToReachOut } from "@/server/leads/lead-workbench";

/**
 * POST /api/v1/reach-outs/:id/leads/check — what adding these leads would do, and nothing written (00426 reach_out_add,
 * dry): how many would join and why each other is left out, by the same rule the add keeps. "Write to the N" says it
 * before the press, and Ask before a plan's step. An operator's, as the add is.
 */
export const POST = write({
  scope: reachOutScope,
  role: "operator",
  rate: "lead_member",
  input: ReachOutAddSchema,
  handle: ({ ctx, row, input }) => addToReachOut(ctx, row.id, input, true),
});
