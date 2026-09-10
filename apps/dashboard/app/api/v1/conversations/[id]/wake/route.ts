import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { requireOperator, loadConversation, recordDecision } from "@/server/verbs";

/**
 * Wake now: end a snooze early and put the thread back exactly as it was.
 *
 * "Wake now" used to call hand-back, which does two things this does not mean:
 * it resolves the open escalation and it gives the conversation back to the
 * receptionist. So the gesture that says "actually, deal with this now"
 * discarded the request it was pulling forward, and the thread returned to the
 * queue reading "Handled — no one asked for you" while the customer who had
 * asked for a person was still waiting.
 *
 * Waking touches only the snooze. Whatever the thread was — escalated, taken
 * over, or simply open — is what it goes back to being, because that state was
 * never thrown away when it was hidden.
 */
export const POST = withRoute(async (_req, ctx) => {
  const conv = await loadConversation(ctx, String(ctx.params.id ?? ""));
  await requireOperator(ctx, conv.tenant_id);
  if (conv.state !== "snoozed") {
    throw new AppError("conflict", "This thread is not snoozed.", 409);
  }

  // Row count, not just the error: an UPDATE that RLS or a stale id excludes
  // reports success while changing nothing, and the operator would be told the
  // thread is back when it is still hidden.
  const { data, error } = await ctx.supabase
    .from("conversations")
    .update({ state: "open", snooze_until: null })
    .eq("id", conv.id)
    .eq("state", "snoozed")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new AppError("conflict", "Could not wake this thread — reload and try again.", 409);
  }

  const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "wake", {});
  return { state: "open", decision_id: decisionId };
});
