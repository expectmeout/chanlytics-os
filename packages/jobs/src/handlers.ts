/**
 * Job handlers — dispatched by the edge's /api/jobs/fire AFTER the claim_job
 * gate (exactly-once scheduled->fired). Handlers are idempotent against
 * re-dispatch and receive their environment injected (no env reads here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText, sendTemplate, type WaConfig } from "@chanlytics/channels";
import { isOptedOutContact } from "@chanlytics/contracts";
import type { Database } from "@chanlytics/db";

export interface JobContext {
  db: SupabaseClient<Database>;
  waCfg: WaConfig;
  alert: (subject: string, body: string) => Promise<void>;
  /**
   * Delete one customer's stored Blob thread.
   *
   * INJECTED, not imported. The store is apps/edge/lib/store.ts because the
   * edge is the runtime that holds BLOB_READ_WRITE_TOKEN, and a package must
   * not reach into an app. Optional because the type is shared with any future
   * runner; a runner that cannot do it must FAIL, never succeed quietly —
   * see blobThreadErase.
   */
  eraseThread?: (namespace: string, threadId: string) => Promise<boolean>;
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
/**
 * How to put a message on a given channel's wire.
 *
 * Adding SMS or email is an entry here plus an inbound adapter — every gate
 * above this line (consent, role, pause, the cancel window, the audit row) is
 * already channel-agnostic and is inherited unchanged. Each sender owns its own
 * address format: WhatsApp's Graph API wants bare digits, so the "+" is
 * stripped HERE rather than by the caller, who should not know that.
 */
type ChannelSend = (
  ctx: JobContext,
  to: string,
  payload: { body: string; template?: { name: string; language: string; params: string[] } },
) => Promise<{ ok: boolean; wamid: string | null; status: number; errorBody?: string }>;

const SENDERS: Record<string, ChannelSend> = {
  whatsapp: (ctx, to, p) => {
    const digits = to.replace(/^\+/, "");
    return p.template
      ? sendTemplate(ctx.waCfg, digits, p.template)
      : sendText(ctx.waCfg, digits, p.body);
  },
};

async function outboundSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const p = job.payload as {
    message_id: string;
    conversation_id: string;
    to_phone: string;
    body?: string;
    template?: { name: string; language: string; params: string[] };
  };
  // A read that FAILED and a message that is genuinely gone are different
  // facts, and collapsing them is how an operator's reply disappears: the
  // error was discarded, a transient PostgREST blip looked exactly like
  // "already canceled", the handler returned success, claim_job had already
  // consumed the job, and the row sat `queued` forever with nothing left to
  // send it and nobody told. maybeSingle() reports the absent row as
  // `data: null` without an error, so the two cases stay separable.
  const { data: msg, error: readErr } = await ctx.db
    .from("messages")
    .select("id, status, body, template_name, channel, sender")
    .eq("id", p.message_id)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  if (readErr) {
    // Throw: the fire callback records fail_job and alerts the tenant, so the
    // message is visibly stuck rather than invisibly lost.
    throw new Error(`outbound_send: cannot read message ${p.message_id}: ${readErr.message}`);
  }
  if (!msg || msg.status !== "queued") return; // canceled or already handled — no-op

  // The LAST gate before the wire. The reply route already refuses an
  // opted-out contact, but this runs up to SEND_GRACE_MS later and is the only
  // check that covers the gap: a customer can text STOP during the cancel
  // window, and every future queueing path (campaigns, reminders, a retry of
  // an older row) arrives here too. Cheap, and the one place a miss is
  // unrecoverable — the message is on its way to a real person.
  // Resolved through the conversation rather than messages.contact_id, which
  // is nullable — the conversation always has the contact.
  //
  // FAIL CLOSED. This discarded the error and guarded on `if (contact && ...)`,
  // so a transient read failure produced contact === undefined and the message
  // went out — to someone who may have asked to be left alone. This is the LAST
  // gate before the wire, the one place a miss is unrecoverable, and "we could
  // not check" is not "they consented". A send deferred to the next attempt
  // costs a delay; a send that should not have happened cannot be taken back.
  const { data: convRow, error: consentErr } = await ctx.db
    .from("conversations")
    .select("contacts (consent, dnc)")
    .eq("id", p.conversation_id)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  if (consentErr || !convRow) {
    console.error(JSON.stringify({
      level: "error", event: "outbound_consent_unreadable",
      tenant_id: job.tenant_id, message_id: p.message_id,
      error: consentErr?.message ?? "conversation not found",
    }));
    // Leave the row queued: claim_job is exactly-once per job, but the message
    // stays visible and unsent rather than being marked failed on our own
    // inability to check.
    return;
  }
  const contact = convRow.contacts;
  if (contact && isOptedOutContact(contact)) {
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

  // The ONE channel-specific step in an otherwise channel-agnostic pipeline.
  //
  // This used to call the WhatsApp sender directly, which made it not merely
  // WhatsApp-only but WhatsApp-ASSUMING: `messages.channel` has allowed
  // 'whatsapp' | 'voice' | 'sms' | 'email' since the first migration, and a row
  // queued on any of them would have been sent over WhatsApp to `to_phone`
  // without anything noticing. Nothing queues those today — which is exactly
  // when this is cheap to fix rather than a rewrite under deadline.
  const channel = msg.channel ?? "whatsapp";
  const send = SENDERS[channel];
  if (!send) {
    // Fail LOUDLY and leave the customer un-messaged rather than delivering
    // their message over the wrong wire to a number that may not be theirs.
    console.error(JSON.stringify({
      level: "error", event: "outbound_no_sender_for_channel",
      tenant_id: job.tenant_id, message_id: p.message_id, channel,
    }));
    await ctx.db.from("messages")
      .update({ status: "failed", error: { reason: "no_sender_for_channel", channel } })
      .eq("id", p.message_id)
      .eq("status", "queued");
    return;
  }
  const sent = await send(ctx, p.to_phone, { body: p.body ?? msg.body ?? "", template: p.template });

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
      // Read from the ROW, not hardcoded. This queue used to carry only human
      // replies; under a veto window the receptionist's own reply travels the
      // same path, and stamping every send as "human" would make the metrics
      // report a bot's words as a person's.
      subject_type: "message", subject_id: p.message_id, data: { sender: msg.sender ?? "human" },
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
      `Reply delivery failed: ${p.to_phone}`,
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

/**
 * blob_thread_erase: the copy Postgres cannot reach.
 *
 * The Vercel Blob thread holds the verbatim conversation, outside RLS and
 * outside the database, so deleting the rows is not deleting the data. The
 * dashboard queues this job BEFORE it destroys anything, so a crash mid-
 * erasure leaves a retryable request rather than an orphaned transcript whose
 * key nobody can reconstruct.
 *
 * payload: { contact_id, namespace, thread_ids: string[] }
 */
async function blobThreadErase(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const p = job.payload as {
    contact_id?: string; namespace?: string; thread_ids?: string[]; scrubbed?: boolean;
  };
  // A sibling job (a retry that raced this one) already finished this
  // contact's Blob leg and scrubbed every payload for it. Nothing to do, and
  // no second ledger row.
  if (p.scrubbed) return;
  if (!p.namespace) throw new Error("blob_thread_erase: payload has no namespace");
  const ids = (Array.isArray(p.thread_ids) ? p.thread_ids : [])
    .filter((t): t is string => typeof t === "string" && t.length > 0);

  // THROW, never return. A handler that reported "done" without a store would
  // tell the owner the customer's conversation was deleted while it sat in
  // Blob — the exact lie this whole change exists to remove. Throwing makes
  // fire.ts record fail_job and alert the workspace.
  if (!ctx.eraseThread) throw new Error("blob_thread_erase: no thread store on this runner");

  const failed: string[] = [];
  for (const id of ids) {
    if (!(await ctx.eraseThread(p.namespace, id))) failed.push(id);
  }
  if (failed.length) throw new Error(`blob_thread_erase: ${failed.length} thread(s) not deleted`);

  // The payload carried the customer's phone digits, because that IS the Blob
  // key. Once the objects are gone it is a durable copy of the identifier we
  // were asked to erase, in a table whose rows are never deleted. Scrub it —
  // but only on success: while the leg is outstanding, this payload is the
  // only thing that can retry it (see rescheduleBlobErase). EVERY job row for
  // this contact is scrubbed, not just this one, so an earlier crashed attempt
  // does not keep the digits forever.
  const scrubbed = {
    contact_id: p.contact_id ?? null, namespace: p.namespace,
    threads: ids.length, scrubbed: true,
  };
  if (p.contact_id) {
    await ctx.db.from("jobs").update({ payload: scrubbed })
      .eq("tenant_id", job.tenant_id)
      .eq("kind", "blob_thread_erase")
      .eq("payload->>contact_id", p.contact_id);
  } else {
    await ctx.db.from("jobs").update({ payload: scrubbed }).eq("id", job.id);
  }

  if (p.contact_id) {
    // Same ledger as the owner's own erase decision, so one query tells the
    // whole story. actor_type 'system' with a null actor_user_id is what
    // decisions_check requires; the service role is not subject to RLS here.
    await ctx.db.from("decisions").insert({
      tenant_id: job.tenant_id, subject_type: "contact", subject_id: p.contact_id,
      verb: "erase", actor_type: "system",
      payload: { leg: "blob", threads: ids.length, job_id: job.id },
    });
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id, kind: "contact.blob_erased", category: "contact",
      subject_type: "contact", subject_id: p.contact_id, data: { threads: ids.length },
    });
  }
}

/** How an escalation landed: a new open row, a refresh of the one already
 *  open on that thread, or nothing (the insert failed for another reason).
 *  Callers that alert a human use it to alert once per hold, not once per
 *  message. */
export type EscalationOutcome = "opened" | "refreshed" | "failed";

export async function upsertEscalation(
  db: SupabaseClient<Database>,
  tenantId: string,
  conversationId: string,
  reason: string,
  details: string,
): Promise<EscalationOutcome> {
  const { error } = await db.from("escalations").insert({
    tenant_id: tenantId, conversation_id: conversationId, reason, details,
  });
  if (!error) return "opened";
  if (error.code === "23505") {
    // one open escalation per conversation: repeat triggers refresh details
    await db.from("escalations")
      .update({ details, reason })
      .eq("conversation_id", conversationId)
      .eq("state", "open");
    return "refreshed";
  }
  console.error("escalation_upsert_failed", error.message);
  return "failed";
}

const HANDLERS: Record<string, (ctx: JobContext, job: ClaimedJob) => Promise<void>> = {
  outbound_send: outboundSend,
  pause_expire: pauseExpire,
  snooze_wake: snoozeWake,
blob_thread_erase: blobThreadErase,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind"> {
  const handler = HANDLERS[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
