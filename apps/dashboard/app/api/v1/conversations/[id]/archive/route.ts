import { withRoute } from "@/server/with-route";
import { loadConversation, recordDecision, resolveOpenEscalation } from "@/server/verbs";

/** Archive: close the thread (a state, never a deletion — P3). */
export const POST = withRoute(async (_req, ctx) => {
  const conv = await loadConversation(ctx, String(ctx.params.id ?? ""));
  const { error } = await ctx.supabase
    .from("conversations")
    .update({ state: "archived" })
    .eq("id", conv.id);
  if (error) throw new Error(error.message);
  const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "archive");
  await resolveOpenEscalation(ctx, conv.id, decisionId);
  return { state: "archived", decision_id: decisionId };
});
