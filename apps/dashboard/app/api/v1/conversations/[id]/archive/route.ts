import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { conversationScope, recordDecision, resolveOpenEscalation } from "@/server/verbs";
import { mirrorBlobPause } from "@/server/service";

/** Archive: close the thread (a state, never a deletion — P3). */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: async ({ ctx, row: conv }) => {
    // closing a thread releases it completely — a later inbound reopens it
    // (ingest_inbound), and the receptionist must not stay muted meanwhile.
    if (conv.paused_until && conv.phone_e164) await mirrorBlobPause(conv.tenant_id, conv.phone_e164, 0);
    // Row count, not just the error: an UPDATE that RLS or a vanished row
    // excludes reports success while changing nothing, and everything below
    // would then describe a change that never happened.
    const { data: archived, error } = await ctx.supabase
      .from("conversations")
      .update({ state: "archived", paused_until: null, assignee_user_id: null })
      .eq("id", conv.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!archived || archived.length === 0) {
      throw new AppError("conflict", "Could not archive this thread — reload and try again.", 409);
    }
    const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "archive");
    await resolveOpenEscalation(ctx, conv.id, decisionId);
    return { state: "archived", decision_id: decisionId };
  },
});
