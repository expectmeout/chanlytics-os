import { withRoute } from "@/server/with-route";
import { loadConversation, recordDecision, resolveOpenEscalation } from "@/server/verbs";
import { cancelKindFor, mirrorBlobPause } from "@/server/service";

/** Archive: close the thread (a state, never a deletion — P3). */
export const POST = withRoute(async (_req, ctx) => {
  const conv = await loadConversation(ctx, String(ctx.params.id ?? ""));
  // closing a thread releases it completely — a later inbound reopens it
  // (ingest_inbound), and the receptionist must not stay muted meanwhile.
  if (conv.paused_until && conv.phone_e164) await mirrorBlobPause(conv.phone_e164, 0);
  const { error } = await ctx.supabase
    .from("conversations")
    .update({ state: "archived", paused_until: null, assignee_user_id: null })
    .eq("id", conv.id);
  if (error) throw new Error(error.message);
  await cancelKindFor(conv.tenant_id, "pause_expire", "conversation_id", conv.id);
  const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "archive");
  await resolveOpenEscalation(ctx, conv.id, decisionId);
  return { state: "archived", decision_id: decisionId };
});
