import { cancelBroadcast } from "@chanlytics/core";
import { write } from "@/server/route";
import { broadcastScope } from "@/server/verbs";
import { cancelBroadcastPorts } from "@/server/ports/campaign-ports";

/**
 * POST /api/v1/broadcasts/:id/cancel — stop a broadcast that has not
 * finished.
 *
 * Scheduled: the job is withdrawn and nothing is sent. Sending: the job
 * stops at its next batch — the messages already on their way are on their
 * way, and the row says how many. Waiting for approval (a playbook's run
 * under the ask mode): skipped, nothing was ever scheduled. Anything else
 * has already ended and says so. The rule is core's (cancelBroadcast).
 * Owner or operator, judged where the broadcast lives (broadcastScope); the
 * ledger records the decision.
 */
export const POST = write({
  scope: broadcastScope,
  role: "operator",
  rate: "broadcast",
  handle: async ({ ctx, row: b }) => cancelBroadcast(cancelBroadcastPorts(ctx, b.tenant_id), { row: b }),
});
