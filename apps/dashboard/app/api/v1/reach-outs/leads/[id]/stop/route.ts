import { write } from "@/server/route";
import { leadScope } from "@/server/leads/leads";
import { stopLead } from "@/server/campaigns/reach-out-leads";

/**
 * POST /api/v1/reach-outs/leads/:id/stop — "Stop writing to them" (Reach out Part 6, H10): the lead's chain writes
 * nothing more to it. Its planned and held emails are skipped, and the send door and the followers read the stop
 * (00241 reach_out_lead_stop). The lead is the row (leadScope), so the role is judged where it lives. An operator's;
 * each refusal is the door's reason in contracts' words.
 */
export const POST = write({
  scope: leadScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, row }) => stopLead(ctx, row.id),
});
