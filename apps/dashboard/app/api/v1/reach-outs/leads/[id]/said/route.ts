import { ReachOutReplySaidSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { leadScope } from "@/server/leads/leads";
import { sayReply } from "@/server/campaigns/reach-out-said";

/**
 * POST /api/v1/reach-outs/leads/:id/said — what the business wrote back to an email its owner sent from their own inbox,
 * as the owner says it (00428): read as a person's reply through the one reading door (reach_out_reply_said), so the
 * reach-out stops for them, a yes is Talking, a no is never written to again, a not now comes back on its day, and the
 * reading's undo is the one every reading has. The lead is the row (leadScope). An operator's; refused while nothing
 * has gone to them.
 */
export const POST = write({
  scope: leadScope,
  role: "operator",
  rate: "playbook",
  input: ReachOutReplySaidSchema,
  handle: ({ ctx, row, input }) => sayReply(ctx, row, input),
});
