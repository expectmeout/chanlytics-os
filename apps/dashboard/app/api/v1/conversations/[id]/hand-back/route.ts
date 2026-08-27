import { withRoute } from "@/server/with-route";
import { loadConversation, recordDecision, resolveOpenEscalation } from "@/server/verbs";
import { cancelKindFor, mirrorBlobPause } from "@/server/service";
import { AppError } from "@chanlytics/contracts";

/** Hand back: the AI resumes; the open escalation resolves (§4). */
export const POST = withRoute(async (_req, ctx) => {
  const conv = await loadConversation(ctx, String(ctx.params.id ?? ""));
  if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
  await mirrorBlobPause(conv.phone_e164, 0);

  const { error } = await ctx.supabase
    .from("conversations")
    .update({ state: "open", paused_until: null, snooze_until: null, assignee_user_id: null })
    .eq("id", conv.id);
  if (error) throw new Error(error.message);

  await cancelKindFor(conv.tenant_id, "pause_expire", "conversation_id", conv.id);
  await cancelKindFor(conv.tenant_id, "snooze_wake", "conversation_id", conv.id);
  const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "hand_back");
  await resolveOpenEscalation(ctx, conv.id, decisionId);
  return { state: "open", decision_id: decisionId };
});
