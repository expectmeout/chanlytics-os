/**
 * The adapter between the core verbs and this runtime: the only file that
 * knows both a port's meaning and the table it touches. A verb never sees a
 * client, a service module or an environment; it sees these. A thread's
 * UPDATE is its move's patch from contracts (conversation-moves.ts), whose
 * columns are the session role's grants; every other UPDATE here names its
 * columns in full, so hygiene.test.mjs can hold them to the grants.
 */
import crypto from "node:crypto";
import {
  claimIdempotencyKey,
  handBackThread,
  keepIdempotencyReceipt,
  lastInboundEmail,
  lastOutboundEmailSubject,
  releaseIdempotencyKey,
  takeIdempotencyKey,
  takeOverThread,
  callBackMessage,
  sendQueuedNow,
  memberWithdrawMessage,
  type Json,
} from "@chanlytics/db";
import type {
  CancelSendPorts,
  EscalationPorts,
  ReplyPorts,
  ReplyReceipt,
  SendNowPorts,
  ThreadPorts,
} from "@chanlytics/core";
import { conversationPatch } from "@chanlytics/contracts";
import { dbRefusal, type RouteContext } from "../with-route";
import { cancelPendingAiReply, pauseMsFor, recordDecision, replyChannelOf, resolveOpenEscalation } from "../verbs";
import { schedule } from "../jobs";
import { takeThreadControl } from "../conversations/thread-control";
import { freezeFirst, freezeReply } from "../connections/email";
import { storedConfigOf } from "../workspace/config-row";
import { log } from "@/server/log";

/**
 * True iff a row changed. An UPDATE that RLS or a vanished row excludes
 * reports success while changing nothing, and everything a verb does after
 * it would then describe a change that never happened.
 */
async function changed(
  q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<boolean> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return !!data && data.length > 0;
}

export function threadPorts(ctx: RouteContext): ThreadPorts {
  return {
    pauseMs: (tenantId) => pauseMsFor(ctx, tenantId),
    // A take-over and a hand-back are each one door on the member's own session (00386): the session's claim, the
    // service role's hold, the drafts and the ledger were four writes on two clients, and the ones after the first
    // could stand while a later one failed. The door's refusal (not a member who may act here) is answered as a door's
    // is; the undo link it dropped is logged as recordDecision logs it.
    takeOver: async (tenantId, id, until) => {
      const done = await takeOverThread(ctx.supabase, {
        tenantId,
        conversationId: id,
        pausedUntil: until,
        via: ctx.via ?? null,
        undoOf: ctx.undoOf ?? null,
      }).catch((e: { code?: string | null; message: string }) => {
        throw dbRefusal(e);
      });
      if (!done) return null;
      if (done.undoDropped)
        log.error("decision_undo_of_unknown", { undo_of: ctx.undoOf, verb: "take_over", subject: "conversation" });
      return { withdrawn_drafts: done.withdrawnDrafts, decision_id: done.decisionId };
    },
    handBack: async (tenantId, id) => {
      const done = await handBackThread(ctx.supabase, {
        tenantId,
        conversationId: id,
        via: ctx.via ?? null,
        undoOf: ctx.undoOf ?? null,
      }).catch((e: { code?: string | null; message: string }) => {
        throw dbRefusal(e);
      });
      if (!done) return null;
      if (done.undoDropped)
        log.error("decision_undo_of_unknown", { undo_of: ctx.undoOf, verb: "hand_back", subject: "conversation" });
      // Nothing was open to resolve: said, as resolveOpenEscalation says it, so a thread that sits in Needs You after
      // a hand-back is not read as one the person cleared.
      if (done.resolvedEscalations === 0) log.info("resolve_escalation_noop", { conversation: id });
      return { decision_id: done.decisionId };
    },
    snooze: (id, until) =>
      changed(
        ctx.supabase.from("conversations").update(conversationPatch("snooze", { until })).eq("id", id).select("id"),
      ),
    wake: (id) =>
      changed(
        ctx.supabase
          .from("conversations")
          .update(conversationPatch("wake"))
          .eq("id", id)
          .eq("state", "snoozed")
          .select("id"),
      ),
    archive: (id) =>
      changed(ctx.supabase.from("conversations").update(conversationPatch("archive")).eq("id", id).select("id")),
    // Control is written by the service role -- the column grant fences these
    // columns off from a member's own session (00132), exactly as it fences the
    // ledger -- so it goes the way scheduling a job goes.
    takeControl: (tenantId, id, userId, seconds) => takeThreadControl(tenantId, id, userId, seconds),
    withdrawDrafts: (tenantId, id) => cancelPendingAiReply(ctx, { id, tenant_id: tenantId }),
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
    // One door on the member's own session (00387 message_call_back): the row, its send job and the cancel_send line,
    // only while the row is queued and no run has claimed it (sending_at, 00352): a claimed row is on its way to the
    // person, and stays queued only until the provider answers. Null is the verb's "too late". The undo link it
    // dropped is logged as recordDecision logs it.
    callBack: async (tenantId, id) => {
      const done = await callBackMessage(ctx.supabase, {
        tenantId,
        messageId: id,
        via: ctx.via ?? null,
        undoOf: ctx.undoOf ?? null,
      }).catch((e: { code?: string | null; message: string }) => {
        throw dbRefusal(e);
      });
      if (!done) return null;
      if (done.undoDropped)
        log.error("decision_undo_of_unknown", { undo_of: ctx.undoOf, verb: "cancel_send", subject: "message" });
      return { decision_id: done.decisionId };
    },
  };
}

export function sendNowPorts(ctx: RouteContext): SendNowPorts {
  return {
    // One door on the member's own session (00503 message_send_now): the send job brought to now and the approve line,
    // only while the row is queued and no run has claimed it. Null is the verb's "already on its way". The undo link it
    // dropped is logged as recordDecision logs it.
    sendNow: async (tenantId, id) => {
      const done = await sendQueuedNow(ctx.supabase, {
        tenantId,
        messageId: id,
        via: ctx.via ?? null,
        undoOf: ctx.undoOf ?? null,
      }).catch((e: { code?: string | null; message: string }) => {
        throw dbRefusal(e);
      });
      if (!done) return null;
      if (done.undoDropped)
        log.error("decision_undo_of_unknown", { undo_of: ctx.undoOf, verb: "approve", subject: "message" });
      return { decision_id: done.decisionId };
    },
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
      first: (input) => freezeFirst(ctx, input),
      lastSubject: (conv) => lastOutboundEmailSubject(ctx.supabase, conv.tenant_id, conv.id),
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
        log.error("idempotency_release_failed", { tenant_id: tenantId, error: e });
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
      // A read that fails is no facts, as it always was: the verb refuses a template that needs them.
      const config = await storedConfigOf(ctx.supabase, tenantId).catch(() => null);
      const brain = (config as { brain?: { business_name?: string; booking_link?: string } } | null)?.brain;
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
            .update(conversationPatch("reply_claim", { until, user: userId, now: nowIso }))
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
    // Through the one door (00387), on the member's own session: the row, and a job that did get written with it. The
    // reply is already failing, and that failure is the caller's: a withdrawal that fails too is logged, never thrown
    // over it.
    cancelOrphan: async (tenantId, id) => {
      try {
        await memberWithdrawMessage(ctx.supabase, { tenantId, messageId: id, reason: null });
      } catch (e) {
        log.error("reply_orphan_withdraw_failed", { tenant_id: tenantId, message_id: id, error: e });
      }
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
