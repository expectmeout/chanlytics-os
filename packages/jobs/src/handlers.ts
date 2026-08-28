/**
 * Job handlers — dispatched by the edge's /api/jobs/fire AFTER the claim_job
 * gate (exactly-once scheduled->fired). Handlers are idempotent against
 * re-dispatch and receive their environment injected (no env reads here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText, sendTemplate, type WaConfig } from "@chanlytics/channels";
import type { Database } from "@chanlytics/db";

export interface JobContext {
  db: SupabaseClient<Database>;
  waCfg: WaConfig;
  alert: (subject: string, body: string) => Promise<void>;
}

export interface ClaimedJob {
  id: string;
  tenant_id: string;
  kind: string;
  payload: Record<string, unknown>;
}

/**
 * outbound_send: the honest undo — the message sat status='queued' through its
 * cancel window; if it is STILL queued, send it and finalize.
 * payload: { message_id, conversation_id, to_phone, body?, template? }
 */
async function outboundSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const p = job.payload as {
    message_id: string;
    conversation_id: string;
    to_phone: string;
    body?: string;
    template?: { name: string; language: string; params: string[] };
  };
  const { data: msg } = await ctx.db
    .from("messages")
    .select("id, status, body, template_name")
    .eq("id", p.message_id)
    .eq("tenant_id", job.tenant_id)
    .single();
  if (!msg || msg.status !== "queued") return; // canceled or already handled — no-op

  // The LAST gate before the wire. The reply route already refuses an
  // opted-out contact, but this runs up to SEND_GRACE_MS later and is the only
  // check that covers the gap: a customer can text STOP during the cancel
  // window, and every future queueing path (campaigns, reminders, a retry of
  // an older row) arrives here too. Cheap, and the one place a miss is
  // unrecoverable — the message is on its way to a real person.
  // Resolved through the conversation rather than messages.contact_id, which
  // is nullable — the conversation always has the contact.
  const { data: convRow } = await ctx.db
    .from("conversations")
    .select("contacts (consent, dnc)")
    .eq("id", p.conversation_id)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  const contact = convRow?.contacts;
  if (contact && (contact.consent === "opted_out" || contact.dnc)) {
    await ctx.db.from("messages")
      .update({ status: "canceled", error: { reason: "opted_out" } })
      .eq("id", p.message_id);
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id, kind: "message.send_blocked", category: "message",
      subject_type: "message", subject_id: p.message_id,
      data: { reason: "opted_out", consent: contact.consent, dnc: contact.dnc },
    });
    return;
  }

  const to = p.to_phone.replace(/^\+/, "");
  const sent = p.template
    ? await sendTemplate(ctx.waCfg, to, p.template)
    : await sendText(ctx.waCfg, to, p.body ?? msg.body ?? "");

  if (sent.ok) {
    // Still `.eq("status","queued")`: the operator can cancel between the send
    // and this write. The text is already gone, so the row must say `sent` —
    // but if the cancel won the row first, this update matching zero rows is
    // the signal, not something to overwrite silently.
    const { data: marked } = await ctx.db
      .from("messages")
      .update({ status: "sent", ...(sent.wamid ? { external_id: sent.wamid } : {}) })
      .eq("id", p.message_id)
      .eq("status", "queued")
      .select("id");
    if (!marked || marked.length === 0) {
      console.error("outbound_sent_but_row_not_queued", p.message_id, sent.wamid);
      await ctx.db.from("events").insert({
        tenant_id: job.tenant_id, kind: "message.send_raced_cancel", category: "message",
        subject_type: "message", subject_id: p.message_id, data: { wamid: sent.wamid },
      });
    }
    await ctx.db
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", p.conversation_id);
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id, kind: "message.sent", category: "message",
      subject_type: "message", subject_id: p.message_id, data: { sender: "human" },
    });
  } else {
    await ctx.db.from("messages")
      .update({ status: "failed", error: { http_status: sent.status, body: sent.errorBody ?? null } })
      .eq("id", p.message_id);
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id, kind: "message.send_failed", category: "message",
      subject_type: "message", subject_id: p.message_id, data: { http_status: sent.status },
    });
    await upsertEscalation(ctx.db, job.tenant_id, p.conversation_id, "send_failed",
      `Dashboard reply could not be delivered (HTTP ${sent.status}).`);
    await ctx.alert(
      `Reply delivery failed: +${to}`,
      `A reply queued from the dashboard could not be sent (HTTP ${sent.status}). The thread is flagged in the Inbox.`,
    );
  }
}

/** pause_expire: the state machine's timed edge needs_human -> open (P4). */
async function pauseExpire(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const p = job.payload as { conversation_id: string };
  const { data: conv } = await ctx.db
    .from("conversations")
    .select("id, state, paused_until")
    .eq("id", p.conversation_id)
    .single();
  if (!conv || conv.state !== "needs_human") return;
  // a later pause supersedes this job — only clear when the clock really ran out
  if (conv.paused_until && new Date(conv.paused_until).getTime() > Date.now() + 1000) return;
  await ctx.db.from("conversations")
    .update({ state: "open", paused_until: null })
    .eq("id", p.conversation_id);
}

/** snooze_wake: snoozed -> open when the timer lands. */
async function snoozeWake(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const p = job.payload as { conversation_id: string };
  const { data: conv } = await ctx.db
    .from("conversations")
    .select("id, state, snooze_until")
    .eq("id", p.conversation_id)
    .single();
  if (!conv || conv.state !== "snoozed") return;
  if (conv.snooze_until && new Date(conv.snooze_until).getTime() > Date.now() + 1000) return;
  await ctx.db.from("conversations")
    .update({ state: "open", snooze_until: null })
    .eq("id", p.conversation_id);
}

export async function upsertEscalation(
  db: SupabaseClient<Database>,
  tenantId: string,
  conversationId: string,
  reason: string,
  details: string,
): Promise<void> {
  const { error } = await db.from("escalations").insert({
    tenant_id: tenantId, conversation_id: conversationId, reason, details,
  });
  if (error?.code === "23505") {
    // one open escalation per conversation: repeat triggers refresh details
    await db.from("escalations")
      .update({ details, reason })
      .eq("conversation_id", conversationId)
      .eq("state", "open");
  } else if (error) {
    console.error("escalation_upsert_failed", error.message);
  }
}

const HANDLERS: Record<string, (ctx: JobContext, job: ClaimedJob) => Promise<void>> = {
  outbound_send: outboundSend,
  pause_expire: pauseExpire,
  snooze_wake: snoozeWake,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind"> {
  const handler = HANDLERS[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
