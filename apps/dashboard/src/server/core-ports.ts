/**
 * The adapter between the core verbs and this runtime: the only file that
 * knows both a port's meaning and the table it touches. A verb never sees a
 * client, a service module or an environment; it sees these. Every UPDATE
 * here names its columns in full, so hygiene.test.mjs can hold them to the
 * session role's grants.
 */
import type { CancelSendPorts, EscalationPorts, ThreadPorts } from "@chanlytics/core";
import type { RouteContext } from "./with-route";
import { cancelPendingAiReply, pauseMsFor, recordDecision, resolveOpenEscalation } from "./verbs";
import { cancelKindFor, mirrorBlobPause } from "./service";

/**
 * True iff a row changed. An UPDATE that RLS or a vanished row excludes
 * reports success while changing nothing, and everything a verb does after
 * it would then describe a change that never happened.
 */
async function changed(q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<boolean> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return !!data && data.length > 0;
}

export function threadPorts(ctx: RouteContext): ThreadPorts {
  return {
    pauseMs: (tenantId) => pauseMsFor(ctx, tenantId),
    pauseBot: (tenantId, phone, untilMs) => mirrorBlobPause(tenantId, phone, untilMs),
    claim: (id, until, userId) => changed(ctx.supabase.from("conversations").update({ state: "needs_human", paused_until: until, snooze_until: null, assignee_user_id: userId }).eq("id", id).select("id")),
    release: (id) => changed(ctx.supabase.from("conversations").update({ state: "open", paused_until: null, snooze_until: null, assignee_user_id: null }).eq("id", id).select("id")),
    snooze: (id, until) => changed(ctx.supabase.from("conversations").update({ state: "snoozed", snooze_until: until, paused_until: null, assignee_user_id: null }).eq("id", id).select("id")),
    wake: (id) => changed(ctx.supabase.from("conversations").update({ state: "open", snooze_until: null }).eq("id", id).eq("state", "snoozed").select("id")),
    archive: (id) => changed(ctx.supabase.from("conversations").update({ state: "archived", paused_until: null, assignee_user_id: null }).eq("id", id).select("id")),
    withdrawDrafts: (tenantId, id) => cancelPendingAiReply(ctx, { id, tenant_id: tenantId }, (tid, k, v) => cancelKindFor(tid, "outbound_send", k, v)),
    resolveEscalation: (id, decisionId) => resolveOpenEscalation(ctx, id, decisionId),
    record: (tenantId, subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
    now: Date.now,
  };
}

export function escalationPorts(ctx: RouteContext): EscalationPorts {
  return {
    resolve: (id) => changed(ctx.supabase.from("escalations").update({ state: "resolved", resolved_by_user_id: ctx.userId }).eq("id", id).eq("state", "open").select("id")),
    link: async (id, decisionId) => {
      const { error } = await ctx.supabase.from("escalations").update({ decision_id: decisionId }).eq("id", id);
      if (error) console.error("resolve_link_decision_failed", id, error.message);
    },
    record: (tenantId, subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}

export function cancelSendPorts(ctx: RouteContext): CancelSendPorts {
  return {
    cancelQueued: (id) => changed(ctx.supabase.from("messages").update({ status: "canceled" }).eq("id", id).eq("status", "queued").select("id")),
    cancelJob: (tenantId, id) => cancelKindFor(tenantId, "outbound_send", "message_id", id),
    record: (tenantId, subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}
