/**
 * The adapter between the core verbs and this runtime: the only file that
 * knows both a port's meaning and the table it touches. A verb never sees a
 * client, a service module or an environment; it sees these. Every UPDATE
 * here names its columns in full, so hygiene.test.mjs can hold them to the
 * session role's grants.
 */
import crypto from "node:crypto";
import {
  claimIdempotencyKey,
  keepIdempotencyReceipt,
  lastInboundEmail,
  releaseIdempotencyKey,
  takeIdempotencyKey,
  type Json,
} from "@chanlytics/db";
import type { CancelSendPorts, EscalationPorts, ReplyPorts, ReplyReceipt, ThreadPorts } from "@chanlytics/core";
import type { RouteContext } from "../with-route";
import { cancelPendingAiReply, pauseMsFor, recordDecision, replyChannelOf, resolveOpenEscalation } from "../verbs";
import { cancelKindFor, schedule } from "../jobs";
import { letThreadControlGo, takeThreadControl } from "../conversations/thread-control";
import { freezeReply } from "../connections/email";
import { log } from "@/server/log";

/**
 * True iff a row changed. An UPDATE that RLS or a vanished row excludes
 * reports success while changing nothing, and everything a verb does after
 * it would then describe a change that never happened.
 */
export async function changed(
  q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<boolean> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return !!data && data.length > 0;
}

export function threadPorts(ctx: RouteContext): ThreadPorts {
  return {
    pauseMs: (tenantId) => pauseMsFor(ctx, tenantId),
    claim: (id, until, userId) =>
      changed(
        ctx.supabase
          .from("conversations")
          .update({ state: "needs_human", paused_until: until, snooze_until: null, assignee_user_id: userId })
          .eq("id", id)
          .select("id"),
      ),
    release: (id) =>
      changed(
        ctx.supabase
          .from("conversations")
          .update({ state: "open", paused_until: null, snooze_until: null, assignee_user_id: null })
          .eq("id", id)
          .select("id"),
      ),
    snooze: (id, until) =>
      changed(
        ctx.supabase
          .from("conversations")
          .update({ state: "snoozed", snooze_until: until, paused_until: null, assignee_user_id: null })
          .eq("id", id)
          .select("id"),
      ),
    wake: (id) =>
      changed(
        ctx.supabase
          .from("conversations")
          .update({ state: "open", snooze_until: null })
          .eq("id", id)
          .eq("state", "snoozed")
          .select("id"),
      ),
    archive: (id) =>
      changed(
        ctx.supabase
          .from("conversations")
          .update({ state: "archived", paused_until: null, assignee_user_id: null })
          .eq("id", id)
          .select("id"),
      ),
    // Control is written by the service role -- the column grant fences these
    // columns off from a member's own session (00132), exactly as it fences the
    // ledger -- so it goes the way scheduling a job goes.
    takeControl: (tenantId, id, userId, seconds) => takeThreadControl(tenantId, id, userId, seconds),
    letControlGo: (tenantId, id, userId) => letThreadControlGo(tenantId, id, userId),
    withdrawDrafts: (tenantId, id) =>
      cancelPendingAiReply(ctx, { id, tenant_id: tenantId }, (tid, k, v) => cancelKindFor(tid, "outbound_send", k, v)),
    resolveEscalation: (id, decisionId) => resolveOpenEscalation(ctx, id, decisionId),
    record: (tenantId, subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
    now: Date.now,
  };
}

export function escalationPorts(ctx: RouteContext): EscalationPorts {
  return {
    resolve: (id) =>
      changed(
        ctx.supabase
          .from("escalations")
          .update({ state: "resolved", resolved_by_user_id: ctx.userId })
          .eq("id", id)
          .eq("state", "open")
          .select("id"),
      ),
    link: async (id, decisionId) => {
      const { error } = await ctx.supabase.from("escalations").update({ decision_id: decisionId }).eq("id", id);
      if (error) log.error("resolve_link_decision_failed", { id, error: error.message });
    },
    record: (tenantId, subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}

export function cancelSendPorts(ctx: RouteContext): CancelSendPorts {
  return {
    cancelQueued: (id) =>
      changed(
        ctx.supabase.from("messages").update({ status: "canceled" }).eq("id", id).eq("status", "queued").select("id"),
      ),
    cancelJob: (tenantId, id) => cancelKindFor(tenantId, "outbound_send", "message_id", id),
    record: (tenantId, subject, id, verb, payload) => recordDecision(ctx, tenantId, subject, id, verb, payload),
  };
}

/** The `idempotency_keys.route` a reply's key is kept under. */
const REPLY_KEY_ROUTE = "reply";

export function replyPorts(ctx: RouteContext): ReplyPorts {
  const { pauseMs, takeControl, withdrawDrafts, record, resolveEscalation, now } = threadPorts(ctx);
  return {
    pauseMs,
    takeControl,
    withdrawDrafts,
    record,
    resolveEscalation,
    now,
    replyChannel: (conv) => replyChannelOf(ctx, conv),
    email: {
      parent: (conv) => lastInboundEmail(ctx.supabase, conv.tenant_id, conv.id),
      freeze: (input) => freezeReply(ctx, input),
      newId: () => crypto.randomUUID(),
    },
    claimKey: async (tenantId, key, requestHash, nowIso) => {
      const claim = await claimIdempotencyKey(ctx.supabase, {
        tenantId,
        key,
        route: REPLY_KEY_ROUTE,
        requestHash,
        nowIso,
      });
      if (claim.won) return claim;
      const held = claim.held;
      return {
        won: false,
        held: held && {
          response: held.response as unknown as ReplyReceipt | null,
          created_at: held.created_at,
          request_hash: held.request_hash,
        },
      };
    },
    takeKey: (tenantId, key, requestHash, nowIso, from) =>
      takeIdempotencyKey(ctx.supabase, { tenantId, key, requestHash, nowIso, from }),
    releaseKey: async (tenantId, key, nowIso) => {
      // The reply is already failing, and that failure is the caller's. A
      // release that fails too is logged; the hold expires with the window.
      try {
        await releaseIdempotencyKey(ctx.supabase, { tenantId, key, nowIso });
      } catch (e) {
        log.error("idempotency_release_failed", { tenant: tenantId, error: e });
      }
    },
    template: async (tenantId, name, language) => {
      const { data } = await ctx.supabase
        .from("templates")
        .select("name, language, body_preview, meta_status, category, variables")
        .eq("tenant_id", tenantId)
        .eq("channel", "whatsapp")
        .eq("name", name)
        .eq("language", language)
        .maybeSingle();
      return data ?? null;
    },
    templateFacts: async (tenantId) => {
      const { data } = await ctx.supabase
        .from("tenant_config")
        .select("config")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const brain = (data?.config as { brain?: { business_name?: string; booking_link?: string } } | null)?.brain;
      // The name is enough: a template that sends no link needs none, and the verb refuses one that does (reply.ts).
      return brain?.business_name
        ? { business_name: brain.business_name, booking_link: brain.booking_link || null }
        : null;
    },
    // This row IS the receptionist's answer to "may I speak?", so a
    // write that failed for any reason is "nothing was queued": the verb refuses
    // and the operator retries, instead of a text going out under a failure.
    claimForReply: async (id, until, userId, nowIso) => {
      try {
        return await changed(
          ctx.supabase
            .from("conversations")
            .update({
              state: "needs_human",
              paused_until: until,
              snooze_until: null,
              assignee_user_id: userId,
              last_message_at: nowIso,
            })
            .eq("id", id)
            .select("id"),
        );
      } catch (e) {
        log.error("reply_claim_failed", { id, error: e });
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
      await schedule(tenantId, "outbound_send", dueAt, payload);
    },
    cancelOrphan: async (id) => {
      await ctx.supabase.from("messages").update({ status: "canceled" }).eq("id", id);
    },
    // A write that fails throws, like every other port here: before the job the
    // verb fails the reply on it (nothing was sent); after, it lets it go.
    storeReceipt: (tenantId, key, requestHash, response, stamp) =>
      keepIdempotencyReceipt(ctx.supabase, {
        tenantId,
        key,
        requestHash,
        response: response as unknown as Json,
        stamp,
      }),
    hash: (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 32),
  };
}
