import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { broadcastScope, recordDecision } from "@/server/verbs";
import { cancelKindFor } from "@/server/service";

/**
 * POST /api/v1/broadcasts/:id/cancel — stop a broadcast that has not
 * finished.
 *
 * Scheduled: the job is withdrawn and nothing is sent. Sending: the job
 * stops at its next batch — the messages already on their way are on their
 * way, and the row says how many. Waiting for approval (a playbook's run
 * under the ask mode): skipped, nothing was ever scheduled. Anything else
 * has already ended and says so. Owner or operator, judged where the
 * broadcast lives (broadcastScope); the ledger records the decision.
 */
export const POST = write({
  scope: broadcastScope,
  role: "operator",
  rate: "broadcast",
  handle: async ({ ctx, row: b }) => {
    const id = b.id;
    if (b.state === "scheduled") {
      await cancelKindFor(b.tenant_id, "broadcast_send", "broadcast_id", id);
    } else if (b.state !== "sending" && b.state !== "pending_approval") {
      const said = b.state === "sent" ? "already been sent" : b.state === "canceled" ? "already been canceled" : "already failed";
      throw new AppError("conflict", `This broadcast has ${said}.`, 409);
    }
    const { data: moved, error: uErr } = await ctx.supabase
      .from("broadcasts")
      .update({ state: "canceled" })
      .eq("id", id)
      .eq("state", b.state)
      .select("id");
    if (uErr) throw new Error(uErr.message);
    if (!moved || moved.length === 0) throw new AppError("conflict", "This broadcast just changed state; look again.", 409);

    const decisionId = await recordDecision(ctx, b.tenant_id, "broadcast", id, "cancel_broadcast", { name: b.name, was: b.state });
    return { id, state: "canceled", was: b.state, decision_id: decisionId };
  },
});
