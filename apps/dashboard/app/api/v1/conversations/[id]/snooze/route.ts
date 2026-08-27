import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { loadConversation, recordDecision } from "@/server/verbs";
import { schedule } from "@/server/service";

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

  const { error } = await ctx.supabase
    .from("conversations")
    .update({ state: "snoozed", snooze_until: until.toISOString() })
    .eq("id", conv.id);
  if (error) throw new Error(error.message);

  await schedule(conv.tenant_id, "snooze_wake", until, { conversation_id: conv.id });
  const decisionId = await recordDecision(ctx, conv.tenant_id, "conversation", conv.id, "snooze", {
    until: until.toISOString(),
  });
  return { state: "snoozed", snooze_until: until.toISOString(), decision_id: decisionId };
});
