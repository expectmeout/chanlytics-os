/**
 * Job handlers — dispatched by the edge's api/jobs/tick.ts once
 * claim_due_jobs() has made the job this run's (00098). Handlers are
 * idempotent against a second run and receive their environment injected
 * (no env reads here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText, sendTemplate, type WaConfig } from "@chanlytics/channels";
import { BROADCAST_CHUNK, BROADCAST_GAP_MS, firstNameOf, mayMessageFor, purposeOfTemplate, parseParamSpec, parseTenantConfig, renderTemplate, resolveParams, type JobKind, type ParamSpec, type SendPurpose } from "@chanlytics/contracts";
import { recordOutbound, resolveOutboundTarget, type Database, type Json } from "@chanlytics/db";

export interface JobContext {
  db: SupabaseClient<Database>;
  /** The job's own tenant's WhatsApp credentials; null = none, and every WhatsApp send is refused. */
  waCfg: WaConfig | null;
  /** The workspace's texting line, when it has one — injected by the edge like waCfg; null = no line. */
  sms?: { send(to: string, body: string): Promise<{ ok: boolean; wamid: string | null; status: number; errorBody?: string }> } | null;
  alert: (subject: string, body: string) => Promise<void>;
  /**
   * Delete one customer's stored Blob thread.
   *
   * INJECTED, not imported. The store is apps/edge/lib/store.ts because the
   * edge is the runtime that holds BLOB_READ_WRITE_TOKEN, and a package must
   * not reach into an app.
   */
  eraseThread: (namespace: string, threadId: string) => Promise<boolean>;
  /**
   * Schedule a job of this tenant — how a broadcast continues itself, one
   * batch after another, through the same door the dashboard uses.
   */
  schedule: (kind: JobKind, dueAt: Date, payload: Json) => Promise<void>;
  /**
   * Epoch ms. A handler that loops over outward work starts no new send after
   * this and leaves the rest to a follow-up job through `schedule`. The runner
   * is killed at a fixed ceiling, and a send cut off mid-flight is a send
   * whose outcome nobody knows.
   */
  deadline: number;
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
    // No credentials, no send: refused here rather than guessed from the
    // environment, which is how one business's message left on another's line.
    if (!ctx.waCfg) return Promise.resolve({ ok: false, wamid: null, status: 503, errorBody: "no_whatsapp_credentials" });
    const digits = to.replace(/^\+/, "");
    return p.template
      ? sendTemplate(ctx.waCfg, digits, p.template)
      : sendText(ctx.waCfg, digits, p.body);
  },
  // A text has no templates: the words go as they are, through the line's
  // Messaging Service. No line = a loud failure, never the other wire.
  sms: (ctx, to, p) =>
    ctx.sms
      ? ctx.sms.send(to.startsWith("+") ? to : `+${to}`, p.body)
      : Promise.resolve({ ok: false, wamid: null, status: 503, errorBody: "no texting line" }),
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
  // "already canceled", the handler returned success, the job had already
  // been claimed, and the row sat `queued` forever with nothing left to
  // send it and nobody told. maybeSingle() reports the absent row as
  // `data: null` without an error, so the two cases stay separable.
  const { data: msg, error: readErr } = await ctx.db
    .from("messages")
    .select("id, status, body, template_name, channel, sender, created_at")
    .eq("id", p.message_id)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  if (readErr) {
    // Throw: the tick fails the job, settles the message and tells the
    // tenant, so it is visibly stuck rather than invisibly lost.
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
    .select("contacts (consent, dnc, marketing_consent)")
    .eq("id", p.conversation_id)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  if (consentErr || !convRow) {
    const why = consentErr?.message ?? "conversation not found";
    console.error(JSON.stringify({
      level: "error", event: "outbound_consent_unreadable",
      tenant_id: job.tenant_id, message_id: p.message_id, error: why,
    }));
    // THROW, do not return. Failing closed is right and is not the question;
    // the question is who finds out. Returning consumed the claim, and since
    // 00080 a handler that returns moves the job to 'done' — so the message sat
    // 'queued' for ever with the job recorded as a success and no sweep left
    // that would ever look at it again. Before 'done' existed it at least
    // stayed 'fired' until the stale-jobs sweep reaped it and told the owner;
    // making success visible accidentally made this failure invisible.
    //
    // Throwing reaches the tick's failure path: the job is failed, the message
    // is taken out of "Sending…" (nothing will send it now), and the owner is
    // told why, which is the part they can act on.
    throw new Error(`outbound_send: cannot read consent for conversation ${p.conversation_id}: ${why}`);
  }
  const contact = convRow.contacts ?? {};

  // THE ONE PREDICATE, ASKED WITH THIS MESSAGE'S PURPOSE. This gate asked only
  // "have they opted out?", while the broadcast wire asked mayMessageFor with
  // the template's purpose -- so a promotional template queued from the Inbox
  // reached a person who had said yes to their appointments and no to offers.
  // A template's purpose is what Meta says it is (purposeOfTemplate fails
  // closed to marketing when the row is missing or its category unknown);
  // words in a conversation are conversational. Never proactive: everything
  // on this queue answers a thread that exists.
  let purpose: SendPurpose = "conversational";
  if (p.template) {
    const { data: tpl, error: tplErr } = await ctx.db
      .from("templates")
      .select("category")
      .eq("tenant_id", job.tenant_id)
      .eq("channel", "whatsapp")
      .eq("name", p.template.name)
      .eq("language", p.template.language)
      .maybeSingle();
    // Fail closed, and loudly: a purpose that cannot be read is not "utility".
    if (tplErr) throw new Error(`outbound_send: cannot read template ${p.template.name}: ${tplErr.message}`);
    purpose = purposeOfTemplate(tpl?.category);
  }
  const may = mayMessageFor(contact, purpose, { proactive: false });
  if (!may.ok) {
    const reason = may.reason ?? "opted_out";
    await ctx.db.from("messages")
      .update({ status: "canceled", error: { reason } })
      .eq("id", p.message_id)
      .eq("status", "queued");
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id, kind: "message.send_blocked", category: "message",
      subject_type: "message", subject_id: p.message_id,
      data: { reason, purpose, consent: contact.consent ?? null, dnc: contact.dnc ?? null, marketing_consent: contact.marketing_consent ?? null },
    });
    return;
  }

  // A PERSON SPOKE AFTER THIS DRAFT WAS WRITTEN. A held reply exists so a human
  // can get there first. From the Inbox, the reply route withdraws the draft
  // itself; from the WhatsApp Business app, the echo only paused the thread,
  // and the draft then fired underneath the owner's own words, so the customer
  // received both. The fact is a newer human message on the thread; the draft
  // is retired, never sent.
  if (msg.sender === "ai") {
    const { data: newer, error: newerErr } = await ctx.db
      .from("messages")
      .select("id")
      .eq("conversation_id", p.conversation_id)
      .eq("tenant_id", job.tenant_id)
      .eq("direction", "outbound")
      .eq("sender", "human")
      .gt("created_at", msg.created_at)
      .limit(1);
    if (newerErr) throw new Error(`outbound_send: cannot read the thread for ${p.message_id}: ${newerErr.message}`);
    if (newer && newer.length > 0) {
      await ctx.db.from("messages")
        .update({ status: "canceled", error: { reason: "superseded_by_human" } })
        .eq("id", p.message_id)
        .eq("status", "queued");
      await ctx.db.from("events").insert({
        tenant_id: job.tenant_id, kind: "message.send_blocked", category: "message",
        subject_type: "message", subject_id: p.message_id,
        data: { reason: "human_has_it", after: newer[0].id },
      });
      return;
    }
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

/**
 * broadcast_send: one batch of a broadcast, then the next.
 * payload: { broadcast_id }
 *
 * The route enrolled the recipients; this sends to up to BROADCAST_CHUNK of
 * them, re-checking each person at the wire — the one place a miss is
 * unrecoverable — and records why anyone was held back. Then it schedules
 * itself again for the rest, or closes the broadcast and tells the
 * workspace. A canceled broadcast stops at the next batch; a template that
 * is no longer approved fails it before a single send.
 */
async function broadcastSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const p = job.payload as { broadcast_id: string };
  const { data: b, error: bErr } = await ctx.db
    .from("broadcasts")
    .select("id, state, name, template_name, template_language, params, recipient_count, playbook_id, audience")
    .eq("id", p.broadcast_id)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  if (bErr) throw new Error(`broadcast_send: cannot read broadcast ${p.broadcast_id}: ${bErr.message}`);
  if (!b) return;
  // Only a scheduled or sending broadcast goes out: a run waiting for a
  // person (pending_approval) has no job, and one that ended stays ended.
  if (b.state !== "scheduled" && b.state !== "sending") return;
  // A paused workspace (tenants.status, written by billing) sends nothing:
  // the run fails with its reason and the owner is told, rather than a
  // template going out under a subscription that stopped.
  const { data: tenantState } = await ctx.db.from("tenants").select("status").eq("id", job.tenant_id).maybeSingle();
  if (tenantState?.status === "paused") {
    await ctx.db.from("broadcasts").update({ state: "failed", failure: "paused", finished_at: new Date().toISOString() }).eq("id", b.id);
    await ctx.alert(`Broadcast “${b.name}” not sent`, "The workspace is paused until billing resumes, so nothing went out. Resume from Settings › Billing and send it again.");
    return;
  }
  const startedAt = new Date().toISOString();
  if (b.state === "scheduled") {
    await ctx.db.from("broadcasts").update({ state: "sending", started_at: startedAt }).eq("id", b.id).eq("state", "scheduled");
  }

  // The template must still be what Meta approved.
  const { data: tpl } = await ctx.db
    .from("templates")
    // `category` is Meta's verdict on what kind of message this is, and it
    // decides which consent the send needs. It was selected nowhere and read
    // nowhere; the column has existed since 00045.
    .select("meta_status, body_preview, category")
    .eq("tenant_id", job.tenant_id)
    .eq("channel", "whatsapp")
    .eq("name", b.template_name)
    .eq("language", b.template_language)
    .maybeSingle();
  if (!tpl || tpl.meta_status !== "approved") {
    await ctx.db.from("broadcasts").update({ state: "failed", failure: "template_not_approved", finished_at: new Date().toISOString() }).eq("id", b.id);
    await ctx.alert(`Broadcast “${b.name}” stopped`, `The template “${b.template_name}” is no longer approved by WhatsApp, so nothing was sent.`);
    return;
  }
  // WHICH yes this send needs. Meta's category is the authority -- it can
  // recategorise a live template -- and `purposeOfTemplate` fails closed, so a
  // template whose category we do not have reads as marketing and needs the
  // stronger consent rather than the weaker one.
  const purpose = purposeOfTemplate(tpl.category);

  // What fills each slot: typed text once, the rest per person. The
  // workspace's own words for the slots that name it are read once.
  const specs: ParamSpec[] = Array.isArray(b.params)
    ? (b.params as unknown[]).map((p) => parseParamSpec(p) ?? { kind: "text" as const, value: String(p) })
    : [];
  const [{ data: tenantRow }, { data: cfgRow }] = await Promise.all([
    ctx.db.from("tenants").select("name").eq("id", job.tenant_id).maybeSingle(),
    ctx.db.from("tenant_config").select("config").eq("tenant_id", job.tenant_id).maybeSingle(),
  ]);
  const parsedCfg = parseTenantConfig(cfgRow?.config ?? null);
  const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";
  const bookingLink = parsedCfg?.brain?.booking_link ?? null;

  const { data: batch, error: qErr } = await ctx.db
    .from("broadcast_recipients")
    .select("contact_id, facts")
    .eq("broadcast_id", b.id)
    .eq("state", "queued")
    .limit(BROADCAST_CHUNK);
  if (qErr) throw new Error(`broadcast_send: cannot read recipients: ${qErr.message}`);

  const mark = (contactId: string, patch: { state: "sent" | "skipped" | "failed"; reason?: string | null; message_id?: string | null }) =>
    ctx.db
      .from("broadcast_recipients")
      .update({ ...patch, sent_at: patch.state === "sent" ? new Date().toISOString() : null })
      .eq("broadcast_id", b.id)
      .eq("contact_id", contactId);

  let begun = 0;
  for (const r of batch ?? []) {
    // Yield before the runner's ceiling rather than be killed mid-send: no new
    // send starts after the deadline, and the follow-up job below carries the
    // rest. One person at least, so a batch that starts late still moves on.
    if (begun > 0 && Date.now() >= ctx.deadline) break;
    begun += 1;
    // FAIL CLOSED per person: a read that fails leaves them queued for the
    // next batch rather than guessing; "we could not check" is not "yes".
    const { data: c, error: cErr } = await ctx.db
      .from("contacts")
      .select("id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name")
      .eq("id", r.contact_id)
      .eq("tenant_id", job.tenant_id)
      .maybeSingle();
    if (cErr) { console.error("broadcast_contact_unreadable", r.contact_id, cErr.message); continue; }
    if (!c || c.erased_at) { await mark(r.contact_id, { state: "skipped", reason: "erased" }); continue; }
    if (!c.phone_e164) { await mark(r.contact_id, { state: "skipped", reason: "no_phone" }); continue; }
    // The wire's own check, asking the question this particular message raises.
    // It used to demand `consent === "opted_in"` whatever the template was --
    // which both let a promotional send reach somebody who had only agreed to
    // hear about their appointments, and skipped an appointment reminder for
    // somebody who had. The skip reason now says which yes was missing.
    const allowed = mayMessageFor(c, purpose, { proactive: true });
    if (!allowed.ok) { await mark(r.contact_id, { state: "skipped", reason: allowed.reason ?? "not_opted_in" }); continue; }
    const target = await resolveOutboundTarget(ctx.db, { tenantId: job.tenant_id, phoneE164: c.phone_e164, create: false });
    if (!target) { await mark(r.contact_id, { state: "skipped", reason: "no_phone" }); continue; }
    if (target.pausedUntil && Date.now() < new Date(target.pausedUntil).getTime()) {
      await mark(r.contact_id, { state: "skipped", reason: "human_has_it" });
      continue;
    }

    // Their own words in the slots: a first name nobody has on file reads
    // "there"; a slot nothing can fill holds the person, never a blank send.
    // A visit run's words for this person, resolved when the run was made.
    const facts = (r.facts !== null && typeof r.facts === "object" && !Array.isArray(r.facts) ? r.facts : {}) as Record<string, unknown>;
    const params = resolveParams(specs, {
      firstName: firstNameOf(c.display_name, c.wa_profile_name), businessName, bookingLink,
      visitWhen: typeof facts.visit_when === "string" ? facts.visit_when : null,
      visitService: typeof facts.visit_service === "string" ? facts.visit_service : null,
    });
    if (params.some((v) => !v)) { await mark(r.contact_id, { state: "skipped", reason: "missing_value" }); continue; }
    const words = renderTemplate(tpl.body_preview, params);
    const sent = await SENDERS.whatsapp(ctx, c.phone_e164, { body: words, template: { name: b.template_name, language: b.template_language, params } });
    const messageId = await recordOutbound(ctx.db, {
      tenantId: job.tenant_id,
      conversationId: target.conversationId,
      contactId: c.id,
      sender: "human",
      type: "template",
      body: words,
      externalId: sent.ok ? sent.wamid : null,
      status: sent.ok ? "sent" : "failed",
      // A run's message names its playbook, so a thread reads "by the Win-back playbook".
      meta: {
        source: "broadcast", broadcast_id: b.id, broadcast_name: b.name,
        ...(b.playbook_id ? { playbook_id: b.playbook_id, playbook_name: String((b.audience as { label?: unknown } | null)?.label ?? b.name) } : {}),
        ...(sent.ok ? {} : { http_status: sent.status }),
      },
    }).catch((e: unknown) => {
      console.error("broadcast_record_failed", e instanceof Error ? e.message : e);
      return null;
    });
    if (sent.ok) {
      await mark(r.contact_id, { state: "sent", message_id: messageId });
      await ctx.db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", target.conversationId);
    } else {
      await mark(r.contact_id, { state: "failed", reason: "send_failed", message_id: messageId });
    }
    if (BROADCAST_GAP_MS > 0) await new Promise((res) => setTimeout(res, BROADCAST_GAP_MS));
  }

  const { count: remaining, error: rErr } = await ctx.db
    .from("broadcast_recipients")
    .select("contact_id", { count: "exact", head: true })
    .eq("broadcast_id", b.id)
    .eq("state", "queued");
  if (rErr) throw new Error(`broadcast_send: cannot count the rest: ${rErr.message}`);
  if ((remaining ?? 0) > 0) {
    // Still wanted? A cancel during this batch stops here.
    const { data: still } = await ctx.db.from("broadcasts").select("state").eq("id", b.id).maybeSingle();
    if (still?.state !== "sending") return;
    await ctx.schedule("broadcast_send", new Date(), { broadcast_id: b.id });
    return;
  }

  const { data: tally } = await ctx.db.from("broadcast_recipients").select("state").eq("broadcast_id", b.id);
  const sentN = (tally ?? []).filter((t) => t.state === "sent").length;
  const held = (tally ?? []).length - sentN;
  await ctx.db.from("broadcasts").update({ state: "sent", finished_at: new Date().toISOString() }).eq("id", b.id).eq("state", "sending");
  await ctx.db.from("events").insert({
    tenant_id: job.tenant_id, kind: "broadcast.sent", category: "message",
    subject_type: "broadcast", subject_id: b.id, data: { sent: sentN, held },
  });
  await ctx.alert(
    `Broadcast “${b.name}” sent`,
    `${sentN} ${sentN === 1 ? "person" : "people"} got it${held ? `; ${held} held back (no recorded yes, asked to stop, no number, or a person had the thread)` : ""}. Replies land in the Inbox.`,
  );
}

const HANDLERS: Record<string, (ctx: JobContext, job: ClaimedJob) => Promise<void>> = {
  outbound_send: outboundSend,
  broadcast_send: broadcastSend,
  blob_thread_erase: blobThreadErase,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind"> {
  const handler = HANDLERS[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
