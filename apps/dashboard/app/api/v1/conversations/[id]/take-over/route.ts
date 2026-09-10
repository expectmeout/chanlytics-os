import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { conversationScope, recordDecision, cancelPendingAiReply, pauseMsFor } from "@/server/verbs";
import { cancelKindFor, mirrorBlobPause } from "@/server/service";

/** Take over: pause the AI, claim the thread. The open escalation stays open (§4). */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: async ({ ctx, row: conv }) => {
    const until = Date.now() + await pauseMsFor(ctx, conv.tenant_id);

    // the live bot reads Blob until Gate 1b — mirror FIRST, fail loud (D10)
    if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
    await mirrorBlobPause(conv.tenant_id, conv.phone_e164, until);

    // Row count, not just the error: an UPDATE that RLS or a vanished row
    // excludes reports success while changing nothing, and everything below
    // would then describe a change that never happened.
    const { data: taken, error } = await ctx.supabase
      .from("conversations")
      .update({ state: "needs_human", paused_until: new Date(until).toISOString(), snooze_until: null, assignee_user_id: ctx.userId })
      .eq("id", conv.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!taken || taken.length === 0) {
      // The mirror already paused the bot in Blob; release it so the two
      // stores do not disagree about a thread nobody took.
      await mirrorBlobPause(conv.tenant_id, conv.phone_e164, 0);
      throw new AppError("conflict", "Could not take this thread over — reload and try again.", 409);
    }

    // A held reply must not land after a human has taken the thread — that is
    // the exact case the veto window exists to prevent.
    const withdrawn = await cancelPendingAiReply(ctx, conv, (tid, k, v) =>
      cancelKindFor(tid, "outbound_send", k, v));
    // No timer to set: expire_stale_pauses() ends the pause from paused_until (00098).
    const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "take_over", {
      paused_until: new Date(until).toISOString(),
    });
    return { state: "needs_human", paused_until: new Date(until).toISOString(), decision_id: decisionId, withdrawn_drafts: withdrawn };
  },
});
