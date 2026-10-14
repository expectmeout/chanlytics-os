import { ReachOutSaidSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { reachOutSendScope } from "@/server/verbs";
import { saySend } from "@/server/campaigns/reach-outs";

/**
 * POST /api/v1/reach-out-sends/:id/said — the owner's word on an email of a reach-out they send (00429): it went from
 * their own inbox (sent: the email, the send and the lead written in one transaction, 00429 reach_out_send_said, whatever
 * changed since it was handed, with what would refuse its lead now said beside it), or it did not (not_sent: left out of
 * the run). Said once; a second word answers how it stands. The email is the row
 * (reachOutSendScope), so the role is judged where it lives. Owner or operator.
 */
export const POST = write({
  scope: reachOutSendScope,
  role: "operator",
  rate: "playbook",
  input: ReachOutSaidSchema,
  handle: ({ ctx, row, input }) => saySend(ctx, row, input.outcome),
});
