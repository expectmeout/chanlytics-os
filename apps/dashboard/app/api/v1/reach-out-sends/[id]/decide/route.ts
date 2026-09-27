import { ReachOutDecideSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { reachOutSendScope } from "@/server/verbs";
import { decideSend } from "@/server/campaigns/reach-outs";

/**
 * POST /api/v1/reach-out-sends/:id/decide — an owner's answer to one held email of a live run (R18): include it (never
 * past the fortnight it waits, R10), rewrite its opening, skip it, or set its business aside as not a fit, the lead
 * and the email in one transaction (00198 reach_out_send_decide). The email is the row (reachOutSendScope), so the
 * role is judged where it lives. Owner or operator.
 */
export const POST = write({
  scope: reachOutSendScope,
  role: "operator",
  rate: "playbook",
  input: ReachOutDecideSchema,
  handle: ({ ctx, row, input }) => decideSend(ctx, row.id, input.decision),
});
