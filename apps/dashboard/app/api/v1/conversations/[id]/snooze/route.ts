import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { conversationScope, recordDecision } from "@/server/verbs";
import { mirrorBlobPause } from "@/server/service";

const MAX_SNOOZE_MS = 30 * 24 * 3600 * 1000;
const NEEDS_UNTIL = "snooze needs a future `until` timestamp.";

/** Snooze: hide from the queue until a wake time. The bot stays active. */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  input: z.object({ until: z.string({ required_error: NEEDS_UNTIL, invalid_type_error: NEEDS_UNTIL }) }),
  handle: async ({ ctx, row: conv, input }) => {
    const until = new Date(input.until);
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      throw new AppError("validation", NEEDS_UNTIL);
    }
    if (until.getTime() - Date.now() > MAX_SNOOZE_MS) {
      throw new AppError("validation", "snooze is capped at 30 days.");
    }

    // snooze hides the thread from the queue; it does NOT keep the receptionist
    // muted (that is take-over's job) — release any pause first.
    if (conv.paused_until && conv.phone_e164) await mirrorBlobPause(conv.tenant_id, conv.phone_e164, 0);
    // Row count, not just the error: an UPDATE that RLS or a vanished row
    // excludes reports success while changing nothing, and everything below
    // would then describe a change that never happened.
    const { data: snoozed, error } = await ctx.supabase
      .from("conversations")
      .update({ state: "snoozed", snooze_until: until.toISOString(), paused_until: null, assignee_user_id: null })
      .eq("id", conv.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!snoozed || snoozed.length === 0) {
      throw new AppError("conflict", "Could not snooze this thread — reload and try again.", 409);
    }

    // No timer to set: wake_stale_snoozes() reopens the thread from snooze_until (00098).
    const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "snooze", {
      until: until.toISOString(),
    });
    // The escalation deliberately stays OPEN.
    //
    // This used to resolve it, because an open escalation outranked "snoozed" in
    // threadStanding and the thread would not have hidden. The cost was the
    // thing the operator was postponing: at wake the thread came back as
    // "Handled", under the banner "Answered by the receptionist — no one asked
    // for you", while the customer who had asked for a person was still waiting
    // and no longer in anyone's queue. Snoozed now wins that ordering instead,
    // so hiding a thread hides it without discarding what it was about.
    return { state: "snoozed", snooze_until: until.toISOString(), decision_id: decisionId };
  },
});
