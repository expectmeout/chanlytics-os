import { LeadEmailWordsSchema } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { leadScope, sendLeadEmail } from "@/server/leads/leads";

/**
 * POST /api/v1/leads/:id/send — one email a member wrote to one lead, sent from a mailbox the business connected
 * (decision 0094). It leaves through the one send door, after the grace a member's reply has: Undo is
 * POST messages/:id/cancel-send. Refused before anything is written where the door would refuse it, or where no mailbox
 * can send it now, and the mail app stays the road then.
 */
export const POST = write({
  scope: leadScope,
  role: "operator",
  rate: "lead_send",
  input: LeadEmailWordsSchema,
  handle: ({ ctx, row, input }) => sendLeadEmail(ctx, row, input),
});
