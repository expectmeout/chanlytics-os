import { withRoute } from "@/server/with-route";
import { requireOperator, loadConversation, recordDecision, cancelPendingAiReply, PAUSE_MS } from "@/server/verbs";
import { schedule, cancelKindFor, mirrorBlobPause } from "@/server/service";
import { AppError } from "@chanlytics/contracts";

/** Take over: pause the AI, claim the thread. The open escalation stays open (§4). */
export const POST = withRoute(async (_req, ctx) => {
  const conv = await loadConversation(ctx, String(ctx.params.id ?? ""));
  await requireOperator(ctx, conv.tenant_id);
  const until = Date.now() + PAUSE_MS;

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
  await cancelKindFor(conv.tenant_id, "snooze_wake", "conversation_id", conv.id);
  await cancelKindFor(conv.tenant_id, "pause_expire", "conversation_id", conv.id); // supersede, don't accumulate
  await schedule(conv.tenant_id, "pause_expire", new Date(until), { conversation_id: conv.id });
  const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "take_over", {
    paused_until: new Date(until).toISOString(),
  });
  return { state: "needs_human", paused_until: new Date(until).toISOString(), decision_id: decisionId, withdrawn_drafts: withdrawn };
});
