import { write } from "@/server/route";
import { broadcastScope } from "@/server/verbs";
import { recheckRun } from "@/server/campaigns/reach-outs";

/**
 * POST /api/v1/broadcasts/:id/recheck — a reach-out run's "Check the held again" (R18): every email the check could
 * not answer, back to be checked in one call, so two hundred holds are never two hundred clicks. Owner or operator.
 */
export const POST = write({
  scope: broadcastScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, row }) => recheckRun(ctx, row.id),
});
