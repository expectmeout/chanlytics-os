import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { broadcastScope, recordDecision } from "@/server/verbs";
import { schedule } from "@/server/service";

/**
 * POST /api/v1/broadcasts/:id/approve — a run that was waiting for a person
 * goes out now.
 *
 * Under the ask mode a playbook's run is made as pending_approval: the
 * recipients are enrolled, nothing is scheduled. Approving schedules the
 * send now and records the decision as the approver's; skipping is the
 * cancel route. Owner or operator, judged where the run lives
 * (broadcastScope).
 */
export const POST = write({
  scope: broadcastScope,
  role: "operator",
  rate: "broadcast",
  handle: async ({ ctx, row: b }) => {
    const id = b.id;
    if (b.state !== "pending_approval") throw new AppError("conflict", "This run is not waiting for approval.", 409);

    const now = new Date();
    const { data: moved, error: uErr } = await ctx.supabase
      .from("broadcasts")
      .update({ state: "scheduled" })
      .eq("id", id)
      .eq("state", "pending_approval")
      .select("id");
    if (uErr) throw new Error(uErr.message);
    if (!moved || moved.length === 0) throw new AppError("conflict", "This run just changed state; look again.", 409);
    try {
      await schedule(b.tenant_id, "broadcast_send", now, { broadcast_id: id });
    } catch (e) {
      await ctx.supabase.from("broadcasts").update({ state: "pending_approval" }).eq("id", id);
      throw new AppError("upstream_meta", "The send could not be scheduled. The run is still waiting; try again.", 502, e instanceof Error ? e.message : undefined);
    }
    const decisionId = await recordDecision(ctx, b.tenant_id, "broadcast", id, "send_broadcast", {
      name: b.name, playbook_id: b.playbook_id, recipients: b.recipient_count, approved: true, scheduled_for: now.toISOString(),
    });
    return { id, state: "scheduled", recipient_count: b.recipient_count, decision_id: decisionId };
  },
});
