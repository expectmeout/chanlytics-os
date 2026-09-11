/**
 * The adapter between the core verbs and this runtime: the only file that
 * knows both a port's meaning and the table it touches. A verb never sees a
 * client, a service module or an environment; it sees these. Every UPDATE
 * here names its columns in full, so hygiene.test.mjs can hold them to the
 * session role's grants.
 */
import crypto from "node:crypto";
import type { Json } from "@chanlytics/db";
import type { CancelSendPorts, EscalationPorts, ReplyPorts, ReplyReceipt, ThreadPorts } from "@chanlytics/core";
import type { RouteContext } from "./with-route";
import { cancelPendingAiReply, pauseMsFor, recordDecision, replyChannelOf, resolveOpenEscalation } from "./verbs";
import { cancelKindFor, mirrorBlobPause, schedule } from "./service";

/**
 * True iff a row changed. An UPDATE that RLS or a vanished row excludes
 * reports success while changing nothing, and everything a verb does after
 * it would then describe a change that never happened.
 */
export async function changed(q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<boolean> {
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

export function replyPorts(ctx: RouteContext): ReplyPorts {
  const { pauseMs, pauseBot, withdrawDrafts, record, resolveEscalation, now } = threadPorts(ctx);
  return {
    pauseMs, pauseBot, withdrawDrafts, record, resolveEscalation, now,
    replyChannel: (conv) => replyChannelOf(ctx, conv),
    priorReceipt: async (tenantId, key) => {
      const { data, error } = await ctx.supabase
        .from("idempotency_keys")
        .select("response, created_at, request_hash")
        .eq("tenant_id", tenantId)
        .eq("key", key)
        .maybeSingle();
      if (error) throw new Error(`idempotency lookup: ${error.message}`);
      if (!data?.response) return null;
      return { response: data.response as unknown as ReplyReceipt, created_at: data.created_at, request_hash: data.request_hash ?? null };
    },
    template: async (tenantId, name, language) => {
      const { data } = await ctx.supabase
        .from("templates")
        .select("name, language, body_preview, meta_status, category")
        .eq("tenant_id", tenantId)
        .eq("channel", "whatsapp")
        .eq("name", name)
        .eq("language", language)
        .maybeSingle();
      return data ?? null;
    },
    templateFacts: async (tenantId) => {
      const { data } = await ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();
      const brain = (data?.config as { brain?: { business_name?: string; booking_link?: string } } | null)?.brain;
      return brain?.business_name && brain.booking_link ? { business_name: brain.business_name, booking_link: brain.booking_link } : null;
    },
    // Under PG_READS this row IS the receptionist's answer to "may I speak?", so a
    // write that failed for any reason is "nothing was queued": the verb refuses
    // and the operator retries, instead of a text going out under a failure.
    claimForReply: async (id, until, userId, nowIso) => {
      try {
        return await changed(ctx.supabase.from("conversations").update({ state: "needs_human", paused_until: until, snooze_until: null, assignee_user_id: userId, last_message_at: nowIso }).eq("id", id).select("id"));
      } catch (e) {
        console.error("reply_claim_failed", id, e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    queue: async (row) => {
      const { data, error } = await ctx.supabase
        .from("messages")
        .insert({ ...row, direction: "outbound", sender: "human", status: "queued" })
        .select("id")
        .single();
      if (error) throw new Error(`reply insert: ${error.message}`);
      return data.id;
    },
    schedule: async (tenantId, dueAt, payload) => {
      await schedule(tenantId, "outbound_send", dueAt, payload as unknown as Json);
    },
    cancelOrphan: async (id) => {
      await ctx.supabase.from("messages").update({ status: "canceled" }).eq("id", id);
    },
    storeReceipt: async (tenantId, key, requestHash, response) => {
      // Upsert, not insert: an expired key for the same intent already exists.
      // created_at is refreshed so the window runs from THIS send. Discarding
      // this error is how a replay protection silently stops protecting: the
      // send already happened, so it is logged rather than failed.
      const { error } = await ctx.supabase.from("idempotency_keys").upsert(
        { tenant_id: tenantId, key, route: "reply", request_hash: requestHash, response: response as unknown as Json, created_at: new Date().toISOString() },
        { onConflict: "tenant_id,key" },
      );
      if (error) console.error("idempotency_record_failed", tenantId, error.message);
    },
    hash: (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 32),
  };
}
