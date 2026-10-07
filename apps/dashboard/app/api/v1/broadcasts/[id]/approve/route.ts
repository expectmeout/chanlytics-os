import { approveRun } from "@chanlytics/core";
import { write } from "@/server/route";
import { broadcastScope } from "@/server/verbs";
import { approveRunPorts } from "@/server/ports/campaign-ports";

/**
 * POST /api/v1/broadcasts/:id/approve — a run that was waiting for a person
 * goes out now.
 *
 * Under the ask mode a playbook's run is made as pending_approval: the
 * recipients are enrolled, nothing is scheduled. Approving schedules the
 * send now and records the decision as the approver's; skipping is the
 * cancel route. The rule is core's (approveRun). Owner or operator, judged
 * where the run lives (broadcastScope).
 */
export const POST = write({
  scope: broadcastScope,
  role: "operator",
  rate: "broadcast",
  handle: async ({ ctx, row: b }) => approveRun(approveRunPorts(ctx, b.tenant_id), { row: b, now: new Date() }),
});
