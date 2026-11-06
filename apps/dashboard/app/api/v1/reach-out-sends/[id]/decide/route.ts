import { ReachOutDecideSchema } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { reachOutSendScope } from "@/server/shared/verbs";
import { decideSend } from "@/server/campaigns/reach-outs";

/**
 * POST /api/v1/reach-out-sends/:id/decide — an owner's answer to one held email of a live run (R18): include it (never
 * past the fortnight it waits, R10), rewrite its opening, skip it, or set its business aside as not a fit, the lead
 * and the email in one transaction (00211 reach_out_send_decide). A rewrite may say what should change (`change`, 280
 * characters at most, 00505); POST reach-out-sends/check writes it now. The email is the row (reachOutSendScope), so
 * the role is judged where it lives. Owner or operator.
 */
export const POST = write({
  scope: reachOutSendScope,
  role: "operator",
  rate: "playbook",
  input: ReachOutDecideSchema,
  handle: ({ ctx, row, input }) => decideSend(ctx, row, input),
});
