import { withRoute } from "@/server/with-route";
import { loadConversation, recordDecision, PAUSE_MS } from "@/server/verbs";
import { schedule, mirrorBlobPause } from "@/server/service";
import { AppError } from "@chanlytics/contracts";

/** Take over: pause the AI, claim the thread. The open escalation stays open (§4). */
export const POST = withRoute(async (_req, ctx) => {
  const conv = await loadConversation(ctx, String(ctx.params.id ?? ""));
  const until = Date.now() + PAUSE_MS;

  // the live bot reads Blob until Gate 1b — mirror FIRST, fail loud (D10)
  if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
  await mirrorBlobPause(conv.phone_e164, until);

  const { error } = await ctx.supabase
    .from("conversations")
    .update({ state: "needs_human", paused_until: new Date(until).toISOString(), assignee_user_id: ctx.userId })
    .eq("id", conv.id);
  if (error) throw new Error(error.message);

  await schedule(conv.tenant_id, "pause_expire", new Date(until), { conversation_id: conv.id });
  const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "take_over", {
    paused_until: new Date(until).toISOString(),
  });
  return { state: "needs_human", paused_until: new Date(until).toISOString(), decision_id: decisionId };
});
