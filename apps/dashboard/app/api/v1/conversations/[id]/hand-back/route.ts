import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { conversationScope, recordDecision, resolveOpenEscalation } from "@/server/verbs";
import { mirrorBlobPause } from "@/server/service";

/** Hand back: the AI resumes; the open escalation resolves (§4). */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: async ({ ctx, row: conv }) => {
    if (!conv.phone_e164) throw new AppError("conflict", "Conversation has no phone identity.");
    await mirrorBlobPause(conv.tenant_id, conv.phone_e164, 0);

    // Row count, not just the error: an UPDATE that RLS or a vanished row
    // excludes reports success while changing nothing, and everything below
    // would then describe a change that never happened.
    const { data: handed, error } = await ctx.supabase
      .from("conversations")
      .update({ state: "open", paused_until: null, snooze_until: null, assignee_user_id: null })
      .eq("id", conv.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!handed || handed.length === 0) {
      throw new AppError("conflict", "Could not hand this thread back — reload and try again.", 409);
    }

    const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "hand_back");
    await resolveOpenEscalation(ctx, conv.id, decisionId);
    return { state: "open", decision_id: decisionId };
  },
});
