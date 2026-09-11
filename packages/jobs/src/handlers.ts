/**
 * Job handlers — dispatched by the edge's api/jobs/tick.ts once
 * claim_due_jobs() has made the job this run's (00098). Handlers are
 * idempotent against a second run and receive their environment injected
 * (no env reads here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BROADCAST_CHUNK, BROADCAST_GAP_MS, firstNameOf, purposeOfTemplate, parseParamSpec, parseTenantConfig, renderTemplate, resolveParams, type JobKind, type ParamSpec } from "@chanlytics/contracts";
import { deliver, templatePurpose, type Channel, type Wire } from "@chanlytics/core";
import { resolveOutboundTarget, type Database, type Json } from "@chanlytics/db";

export interface JobContext {
  db: SupabaseClient<Database>;
  /**
   * The job's own tenant's wires, bound by the edge where the credentials
   * are: WhatsApp on the tenant's credentials, the texting line when the
   * workspace has one. A null wire is a refusal at the door, never a guess
   * from the environment.
   */
  wire: Wire;
  alert: (subject: string, body: string) => Promise<void>;
  /**
   * The platform's own pager, for a condition that is the platform's: a
   * provider refusing sends with 401 or 403 is credentials, not content.
   * Optional so a test context need not supply one.
   */
  page?: (key: string, subject: string, body: string) => Promise<unknown>;
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
 *
 * The send is deliver()'s, the one door every message leaves through
 * (packages/core): it re-reads the person's consent with this message's
 * purpose, the thread's pause and the workspace's status at the wire, puts
 * the words on the channel's own wire, and finalizes the row -- sent,
 * canceled with its reason, or failed. What is left here is the outbox's
 * own business: whether the row is still there to send, which yes its
 * template needs, and who is told when the wire could not carry it.
 */
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
    .select("id, status, body, template_name, channel, sender")
    .eq("id", p.message_id)
    .eq("tenant_id", job.tenant_id)
    .maybeSingle();
  if (readErr) {
    // Throw: the tick fails the job, settles the message and tells the
    // tenant, so it is visibly stuck rather than invisibly lost.
    throw new Error(`outbound_send: cannot read message ${p.message_id}: ${readErr.message}`);
  }
  if (!msg || msg.status !== "queued") return; // canceled or already handled — no-op

  // Which yes this send needs. A template's purpose is what Meta says it is
  // (failing closed to marketing when the row is missing or unreadable is
  // not an option: unreadable throws); words in a conversation are
  // conversational. Never proactive: everything on this queue answers a
  // thread that exists.
  const purpose = await templatePurpose(ctx.db, job.tenant_id, p.template);

  // `messages.channel` has allowed 'whatsapp' | 'voice' | 'sms' | 'email'
  // since the first migration. A channel this runtime has no wire for finds
  // none at the door and fails loudly, leaving the customer un-messaged
  // rather than delivering their words over the wrong wire.
  const channel = (msg.channel ?? "whatsapp") as Channel;
  const out = await deliver(
    { db: ctx.db, wire: ctx.wire },
    {
      tenantId: job.tenant_id,
      conversationId: p.conversation_id,
      contactId: null,
      to: p.to_phone,
      channel,
      // Read from the ROW, not hardcoded. This queue used to carry only human
      // replies; under a veto window the receptionist's own reply travels the
      // same path, and stamping every send as "human" would make the metrics
      // report a bot's words as a person's.
      sender: (msg.sender ?? "human") as "ai" | "human" | "system",
      purpose,
      proactive: false,
      body: p.body ?? msg.body ?? "",
      template: p.template,
      messageId: p.message_id,
    },
  );

  if (out.outcome === "failed") {
    // A 401 or 403 from the provider is the platform's problem, not this
    // thread's: the credentials are wrong for every send on this wire.
    if (out.reason === "provider" && (out.status === 401 || out.status === 403)) {
      await ctx.page?.(`provider_auth:${channel}`, `${channel} rejected a send with ${out.status}`, `Tenant ${job.tenant_id}, message ${p.message_id}. Credentials, not content.`);
    }
    // The wire could not carry it: the thread is flagged for a person and
    // the owner told. A refusal needs neither -- the row says why.
    await upsertEscalation(ctx.db, job.tenant_id, p.conversation_id, "send_failed",
      `Dashboard reply could not be delivered (HTTP ${out.status}).`);
    await ctx.alert(
      `Reply delivery failed: ${p.to_phone}`,
      `A reply queued from the dashboard could not be sent (HTTP ${out.status}). The thread is flagged in the Inbox.`,
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
    // The thread this send belongs to. Which yes this message needs, the
    // pause, and the workspace's status are the door's to re-read at the
    // wire, below -- the one place a stale answer cannot be taken back.
    const target = await resolveOutboundTarget(ctx.db, { tenantId: job.tenant_id, phoneE164: c.phone_e164, create: false });
    if (!target) { await mark(r.contact_id, { state: "skipped", reason: "no_phone" }); continue; }

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
    // The door. It asks the one predicate with this template's purpose --
    // a promotional send needs the yes to offers, an appointment reminder
    // the yes to conversation -- and it asks at the wire, whatever the route
    // found when it enrolled them; then the pause, the workspace's status,
    // the send on the tenant's credentials, and the row either way. A
    // refusal leaves no row: the person's own line says why they were held.
    const out = await deliver(
      { db: ctx.db, wire: ctx.wire },
      {
        tenantId: job.tenant_id,
        conversationId: target.conversationId,
        contactId: c.id,
        to: c.phone_e164,
        channel: "whatsapp",
        sender: "human",
        purpose,
        proactive: true,
        body: words,
        template: { name: b.template_name, language: b.template_language, params },
        // A run's message names its playbook, so a thread reads "by the Win-back playbook".
        meta: {
          source: "broadcast", broadcast_id: b.id, broadcast_name: b.name,
          ...(b.playbook_id ? { playbook_id: b.playbook_id, playbook_name: String((b.audience as { label?: unknown } | null)?.label ?? b.name) } : {}),
        },
      },
    );
    if (out.outcome === "sent") await mark(r.contact_id, { state: "sent", message_id: out.messageId });
    else if (out.outcome === "refused") await mark(r.contact_id, { state: "skipped", reason: out.reason });
    else await mark(r.contact_id, { state: "failed", reason: "send_failed", message_id: out.messageId });
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

type Handler = (ctx: JobContext, job: ClaimedJob) => Promise<void>;

/**
 * Every declared kind, and only those. `Record<JobKind, Handler>` is the
 * compiler's promise that a kind added to JOB_KINDS without a handler does
 * not build, rather than sitting on the ledger until a row of it is claimed
 * and comes back "unknown_kind" in production.
 */
const HANDLERS: Record<JobKind, Handler> = {
  outbound_send: outboundSend,
  broadcast_send: broadcastSend,
  blob_thread_erase: blobThreadErase,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind"> {
  // The row's kind is text; a kind this build does not declare is unknown,
  // and the tick fails the job loudly rather than guessing.
  const handler = (HANDLERS as Record<string, Handler | undefined>)[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
