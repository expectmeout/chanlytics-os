import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { requireOperator, loadConversation, recordDecision } from "@/server/verbs";
import { schedule, cancelKindFor, mirrorBlobPause } from "@/server/service";

const MAX_SNOOZE_MS = 30 * 24 * 3600 * 1000;

/** Snooze: hide from the queue until a wake time. The bot stays active. */
export const POST = withRoute(async (req, ctx) => {
  const conv = await loadConversation(ctx, String(ctx.params.id ?? ""));
  await requireOperator(ctx, conv.tenant_id);
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
  if (conv.paused_until && conv.phone_e164) await mirrorBlobPause(conv.tenant_id, conv.phone_e164, 0);
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
});
