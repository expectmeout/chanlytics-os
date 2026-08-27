import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { loadConversation, recordDecision, resolveOpenEscalation } from "@/server/verbs";
import { schedule, cancelKindFor, mirrorBlobPause } from "@/server/service";

const MAX_SNOOZE_MS = 30 * 24 * 3600 * 1000;

/** Snooze: hide from the queue until a wake time. The bot stays active. */
export const POST = withRoute(async (req, ctx) => {
  const conv = await loadConversation(ctx, String(ctx.params.id ?? ""));
  const body = (await req.json().catch(() => ({}))) as { until?: string };
  const until = body.until ? new Date(body.until) : null;
  if (!until || Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
    throw new AppError("validation", "snooze needs a future `until` timestamp.");
  }
  if (until.getTime() - Date.now() > MAX_SNOOZE_MS) {
    throw new AppError("validation", "snooze is capped at 30 days.");
  }

  // snooze hides the thread from the queue; it does NOT keep the receptionist
  // muted (that is take-over's job) — release any pause first.
  if (conv.paused_until && conv.phone_e164) await mirrorBlobPause(conv.phone_e164, 0);
  const { error } = await ctx.supabase
    .from("conversations")
    .update({ state: "snoozed", snooze_until: until.toISOString(), paused_until: null, assignee_user_id: null })
    .eq("id", conv.id);
  if (error) throw new Error(error.message);

  await cancelKindFor(conv.tenant_id, "pause_expire", "conversation_id", conv.id);
  await schedule(conv.tenant_id, "snooze_wake", until, { conversation_id: conv.id });
  const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "snooze", {
    until: until.toISOString(),
  });
  await resolveOpenEscalation(ctx, conv.id, decisionId);
  return { state: "snoozed", snooze_until: until.toISOString(), decision_id: decisionId };
});
