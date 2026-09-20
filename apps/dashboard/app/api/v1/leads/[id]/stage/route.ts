import { LeadStageInputSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { leadScope, setStage } from "@/server/leads";

/**
 * POST /api/v1/leads/:id/stage — the one door for a lead's stage, a call's six
 * outcomes, "Did you send it?" and Not a fit.
 *
 * An operator's: working a lead spends nothing, and the workspace's money is
 * spent by the search that found it. A click to Talking marks Talking and
 * nothing else — only a real conversation makes a person (§9.6), which the
 * door decides and the answer's `converted` says.
 */
export const POST = write({
  scope: leadScope,
  role: "operator",
  rate: "lead_member",
  input: LeadStageInputSchema,
  handle: ({ ctx, row, input }) => setStage(ctx, row, input),
});
