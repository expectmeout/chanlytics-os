/**
 * Job handlers — dispatched by the edge's api/jobs/tick.ts once
 * claim_due_jobs() has made the job this run's (00098). The rules live in
 * packages/core/src/messages as verbs over ports; each handler here is the
 * adapter that builds the ports from the job's context (no env reads here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTenantConfig, type JobKind } from "@chanlytics/contracts";
import { classifyReceived, emailPlainText, isEmailRequest, messageIdsIn, type ReceivedEmail } from "@chanlytics/channels";
import { deliver, eraseBlobThread, ingestEmail, provisionLine, type EmailIngestPorts, type IncomingEmail, sendBroadcastBatch, sendQueued, templatePurpose, type EraseThreadCommand, type SendQueuedCommand, type Wire } from "@chanlytics/core";
import { ingestInboundEmail, mailboxById, markProcessed, resolveOutboundTarget, sentEmailWithMessageId, stampMailboxReceived, type Database, type Json } from "@chanlytics/db";
import { upsertEscalation, type EscalationOutcome } from "./escalate";

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
   * Run a line's provisioning saga, or resume it. INJECTED like eraseThread:
   * the provider and the receptionist's credentials live on the edge. The
   * saga reads its own receipts, so a second run repeats nothing. Optional
   * so a test context need not supply one; a job of this kind in a runtime
   * without it fails loudly rather than guessing.
   */
  provisionLine?: (lineId: string, by: "owner" | "support" | "sweep") => Promise<{ ok: boolean; step?: string; error?: string; did?: string }>;
  /**
   * Email's intake, as the edge holds it. INJECTED like the two above: the
   * provider's key and the deployment's mail domain live on the edge, and so
   * does the read of who asked to be forgotten. Optional so a test context
   * need not supply one; an email_ingest job in a runtime without it fails
   * loudly rather than guessing.
   */
  email?: {
    /** The deployment's mail domain: what a mailbox's local part is an address on. */
    domain: string;
    /** One received email by the provider's id; null when the provider has none such. Throws when it cannot be asked. */
    fetch: (receivedId: string) => Promise<ReceivedEmail | null>;
    /** Was this email received before a person with this address asked to be forgotten (00125's digest)? */
    erasedBefore: (tenantId: string, address: string, receivedAtIso: string) => Promise<boolean>;
    /** Tell the workspace's people an email is waiting: the edge's notify, addressed from that workspace. Never throws. */
    tell: (tenantId: string, note: Parameters<EmailIngestPorts["tell"]>[1]) => Promise<void>;
  };
  /**
   * The lead finder's pipeline (00140), as the edge holds it. INJECTED like
   * the three above: the provider's token, the judge's client and the
   * webhook base live on the edge (release A2 binds them). Optional so a
   * test context need not supply one; a lead job in a runtime without it
   * fails loudly rather than guessing. Each takes the claimed job whole and
   * bounds itself to one page or one batch before ctx.deadline.
   */
  leads?: {
    roundStart: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
    collect: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
    check: (ctx: JobContext, job: ClaimedJob) => Promise<void>;
  };
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
 * A read or a write whose failure is not an answer.
 *
 * Every port below is a question the run then acts on — may I send, was this
 * person already reached, is this broadcast still wanted — and destructuring
 * `{ data }` alone turns a failed read into a confident wrong answer. Each of
 * those wrong answers points the same way: an unreadable `tenants` row reads as
 * "not paused", an unreadable `templates` row as "Meta withdrew it", an
 * unreadable `messages` row as "this person has not been messaged yet". They
 * fail OPEN, towards a real message to a real person, or towards a broadcast
 * terminally failed over a statement timeout. So a read that cannot be made
 * throws, the job fails, and settleJob says what it was in the middle of:
 * "we could not check" is not a yes.
 */
function must<T>(what: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

/**
 * How many of a broadcast's people are in one state, or in any state at all.
 *
 * A COUNT, never a page of rows: PostgREST caps a plain select at `max_rows`
 * (1000, supabase/config.toml) and a broadcast may carry BROADCAST_MAX_RECIPIENTS
 * of them, so counting by reading the rows silently undercounts exactly the
 * broadcasts big enough for the number to matter.
 */
async function countRecipients(db: SupabaseClient<Database>, tenantId: string, broadcastId: string, state?: string): Promise<number> {
  let q = db.from("broadcast_recipients").select("contact_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("broadcast_id", broadcastId);
  if (state) q = q.eq("state", state);
  const { count, error } = await q;
  if (error) throw new Error(`broadcast_send: cannot count ${state ?? "all"} recipients: ${error.message}`);
  return count ?? 0;
}

/** outbound_send: core's sendQueued, over this runtime's ports. payload: { message_id, conversation_id, to_phone | to_email, body?, template? } */
async function outboundSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await sendQueued(
    {
      // maybeSingle() reports an absent row as `data: null` without an error,
      // so a read that failed and a message that is gone stay separable; the
      // verb turns the error into the job's loud failure.
      queued: async (id) => {
        const { data, error } = await ctx.db.from("messages").select("id, status, body, template_name, channel, sender, meta").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return null;
        // The request an email was queued with (core reply.ts). meta is JSON, so its shape is checked, not assumed:
        // a row without a sendable one reaches the wire with none and fails there by name.
        const request = (data.meta as { email?: { request?: unknown } } | null)?.email?.request;
        return { status: data.status, body: data.body, channel: data.channel, sender: data.sender, email: isEmailRequest(request) ? request : null };
      },
      purposeOf: (template) => templatePurpose(ctx.db, job.tenant_id, template),
      deliver: (d) => deliver({ db: ctx.db, wire: ctx.wire }, d),
      escalate: (conversationId, reason, details) => upsertEscalation(ctx.db, job.tenant_id, conversationId, reason, details),
      alert: ctx.alert,
      ...(ctx.page ? { page: ctx.page } : {}),
    },
    { tenantId: job.tenant_id, payload: job.payload as SendQueuedCommand["payload"] },
  );
}
/** blob_thread_erase: core's eraseBlobThread, over the store the edge injects. payload: { contact_id, namespace, thread_ids } */
async function blobThreadErase(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await eraseBlobThread(
    {
      eraseThread: ctx.eraseThread,
      // A scrub that failed silently is the worst of both: the ledger row above
      // says the erasure is done while the payload still holds the digits we
      // were asked to erase, in a table whose rows are never deleted. It throws,
      // so the job fails and the unscrubbed payload — the only handle that can
      // retry this leg — is tried again.
      scrub: async (tenantId, by, scrubbed) => {
        const q = ctx.db.from("jobs").update({ payload: scrubbed });
        must("blob_thread_erase: the erased number is still on the job", "contactId" in by
          ? await q.eq("tenant_id", tenantId).eq("kind", "blob_thread_erase").eq("payload->>contact_id", by.contactId)
          : await q.eq("id", by.jobId));
      },
      // actor_type 'system' with a null actor_user_id is what decisions_check
      // requires; the service role is not subject to RLS here. An erasure whose
      // ledger row was refused is an erasure nobody can prove, so it throws too.
      recordErased: async (tenantId, contactId, threads, jobId) => {
        const [decided, evented] = await Promise.all([
          ctx.db.from("decisions").insert({ tenant_id: tenantId, subject_type: "contact", subject_id: contactId, verb: "erase", actor_type: "system", payload: { leg: "blob", threads, job_id: jobId } }),
          ctx.db.from("events").insert({ tenant_id: tenantId, kind: "contact.blob_erased", category: "contact", subject_type: "contact", subject_id: contactId, data: { threads } }),
        ]);
        must("blob_thread_erase: the erasure is not on the decisions ledger", decided);
        must("blob_thread_erase: the erasure is not in the events", evented);
      },
    },
    { tenantId: job.tenant_id, jobId: job.id, payload: job.payload as EraseThreadCommand["payload"] },
  );
}
// Flagging a thread for a person lives in escalate.ts, where the ledger's settle reaches it without loading the core.
export { upsertEscalation };
export type { EscalationOutcome };

/** broadcast_send: core's sendBroadcastBatch, over this runtime's ports. payload: { broadcast_id } */
async function broadcastSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const p = job.payload as { broadcast_id: string };
  const db = ctx.db;
  await sendBroadcastBatch(
    {
      broadcast: async (id) => {
        const { data, error } = await db.from("broadcasts").select("id, state, name, template_name, template_language, params, recipient_count, playbook_id, audience").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(`broadcast_send: cannot read broadcast ${id}: ${error.message}`);
        return data;
      },
      // The billing gate, so it fails CLOSED: a tenants row that cannot be read
      // is not a workspace that is paying.
      workspacePaused: async () => {
        const row = must("broadcast_send: cannot read the workspace's status", await db.from("tenants").select("status").eq("id", job.tenant_id).maybeSingle());
        return row?.status === "paused";
      },
      fail: async (id, failure) => {
        must("broadcast_send: cannot mark the broadcast failed", await db.from("broadcasts").update({ state: "failed", failure, finished_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id));
      },
      startSending: async (id) => {
        const rows = must("broadcast_send: cannot start the broadcast", await db.from("broadcasts").update({ state: "sending", started_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id).eq("state", "scheduled").select("id"));
        return !!rows && rows.length > 0;
      },
      // `category` is Meta's verdict on what kind of message this is, and it
      // decides which consent the send needs. A template that cannot be READ is
      // not a template Meta withdrew: null here fails the whole broadcast and
      // emails the owner that WhatsApp rejected it, which would be a lie about
      // their Meta account told over a statement timeout.
      template: async (name, language) => {
        return must(`broadcast_send: cannot read template ${name}`, await db.from("templates").select("meta_status, body_preview, category").eq("tenant_id", job.tenant_id).eq("channel", "whatsapp").eq("name", name).eq("language", language).maybeSingle());
      },
      // An empty business name is not a fallback: it resolves to an empty slot,
      // and the verb marks everyone in the batch permanently "missing_value".
      facts: async () => {
        const [tenantRes, cfgRes] = await Promise.all([
          db.from("tenants").select("name").eq("id", job.tenant_id).maybeSingle(),
          db.from("tenant_config").select("config").eq("tenant_id", job.tenant_id).maybeSingle(),
        ]);
        const tenantRow = must("broadcast_send: cannot read the workspace", tenantRes);
        const cfgRow = must("broadcast_send: cannot read the workspace's settings", cfgRes);
        const parsedCfg = parseTenantConfig(cfgRow?.config ?? null);
        const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";
        return { businessName, bookingLink: parsedCfg?.brain?.booking_link ?? null };
      },
      batch: async (id, limit) => {
        const { data, error } = await db.from("broadcast_recipients").select("contact_id, facts").eq("tenant_id", job.tenant_id).eq("broadcast_id", id).eq("state", "queued").limit(limit);
        if (error) throw new Error(`broadcast_send: cannot read recipients: ${error.message}`);
        return data ?? [];
      },
      // The batch's people in one read, not one read per person.
      contacts: async (ids) => {
        const { data, error } = await db.from("contacts").select("id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name").in("id", ids).eq("tenant_id", job.tenant_id);
        if (error) throw new Error(`broadcast_send: cannot read the people: ${error.message}`);
        return new Map((data ?? []).map((c) => [c.id, c]));
      },
      // create: false — a broadcast never opens a contact. touch: false — the
      // door below still has to refuse some of these people, and a thread they
      // were not messaged in has nothing new in it.
      target: (phoneE164) => resolveOutboundTarget(db, { tenantId: job.tenant_id, phoneE164, create: false, touch: false }),
      // The messages a dying run left these people: written by deliver after the
      // wire accepted them, with this broadcast's id in their meta, read once for
      // the batch. It is the one check standing between a resumed run and a
      // second WhatsApp template to the same person, so a read that FAILED must
      // never come back as "no, they have not been messaged".
      alreadySent: async (id, contactIds) => {
        const rows = must("broadcast_send: cannot check what the batch was already sent", await db
          .from("messages")
          .select("id, contact_id, created_at")
          .eq("tenant_id", job.tenant_id)
          .in("contact_id", contactIds)
          .filter("meta->>broadcast_id", "eq", id)
          .in("status", ["sent", "delivered", "read"]));
        // created_at is written by the same statement that records the send, so
        // it is when the message left, which is what the recipient's row wants.
        const prior = new Map<string, { id: string; sentAt: string | null }>();
        for (const m of rows ?? []) if (m.contact_id && !prior.has(m.contact_id)) prior.set(m.contact_id, { id: m.id, sentAt: m.created_at });
        return prior;
      },
      // `sent_at` comes from the patch when the caller knows it — a resumed run
      // reading the message a dying run left knows when it actually went out,
      // and stamping "now" instead would reorder the broadcast's own page.
      mark: async (id, contactId, patch) => {
        const sentAt = patch.sent_at ?? (patch.state === "sent" ? new Date().toISOString() : null);
        must("broadcast_send: cannot record how this person's send went", await db.from("broadcast_recipients").update({ ...patch, sent_at: sentAt }).eq("tenant_id", job.tenant_id).eq("broadcast_id", id).eq("contact_id", contactId));
      },
      deliver: (d) => deliver({ db, wire: ctx.wire }, d),
      remaining: (id) => countRecipients(db, job.tenant_id, id, "queued"),
      // Read by the verb as "is this broadcast still wanted"; null is how a
      // cancel reads, so a failed read here would abandon a half-sent broadcast
      // with nothing scheduled, nothing failed and nobody told.
      state: async (id) => {
        const row = must("broadcast_send: cannot read whether the broadcast is still wanted", await db.from("broadcasts").select("state").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle());
        return row?.state ?? null;
      },
      scheduleNext: async (id, dueAt) => {
        await ctx.schedule("broadcast_send", dueAt ?? new Date(), { broadcast_id: id });
      },
      // This tally is written to the permanent record and read out to the owner,
      // so it is counted rather than tallied from a page of rows.
      tally: async (id) => {
        const [all, sent] = await Promise.all([
          countRecipients(db, job.tenant_id, id),
          countRecipients(db, job.tenant_id, id, "sent"),
        ]);
        return { sent, held: all - sent };
      },
      finish: async (id, tally) => {
        must("broadcast_send: cannot close the broadcast", await db.from("broadcasts").update({ state: "sent", finished_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id).eq("state", "sending"));
        must("broadcast_send: cannot record the broadcast's tally", await db.from("events").insert({ tenant_id: job.tenant_id, kind: "broadcast.sent", category: "message", subject_type: "broadcast", subject_id: id, data: tally }));
      },
      alert: ctx.alert,
      now: Date.now,
      sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
    },
    { tenantId: job.tenant_id, broadcastId: p.broadcast_id, deadline: ctx.deadline },
  );
}
/** line_provision: core's provisionLine, over the saga the edge injects. */
async function lineProvision(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await provisionLine({ ...(ctx.provisionLine ? { provision: ctx.provisionLine } : {}) }, { payload: job.payload });
}
/**
 * The provider's email, as the verb takes it: what it claims to be, its words
 * as plain text, and its thread ids read out of its headers. The parsing is
 * here, in the adapter, so the verb knows no provider (hygiene.test.mjs).
 */
export function incomingEmailOf(e: ReceivedEmail): IncomingEmail {
  return {
    id: e.id, from: e.from, to: e.to, cc: e.cc, subject: e.subject,
    text: emailPlainText(e),
    messageId: e.messageId,
    inReplyTo: messageIdsIn(e.headers["in-reply-to"])[0] ?? null,
    references: messageIdsIn(e.headers.references),
    receivedAt: e.createdAt,
    claim: classifyReceived(e),
    attachments: e.attachments,
  };
}

/** email_ingest: core's ingestEmail, over the rows and the provider fetch the edge injects. */
async function emailIngest(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const email = ctx.email;
  if (!email) throw new Error("email_ingest: this runtime holds no email provider");
  const { db } = ctx;
  const outcome = await ingestEmail(
    {
      mailbox: async (id) => {
        const m = await mailboxById(db, id);
        // The job's own tenant, not the payload's word for it: a mailbox that is not this workspace's is not found.
        return m && m.tenant_id === job.tenant_id ? { id: m.id, tenant_id: m.tenant_id, address: `${m.local_part}@${email.domain}` } : null;
      },
      fetch: async (receivedId) => { const e = await email.fetch(receivedId); return e ? incomingEmailOf(e) : null; },
      erasedBefore: email.erasedBefore,
      ours: (tenantId, rfcMessageId) => sentEmailWithMessageId(db, tenantId, rfcMessageId),
      record: (p) => ingestInboundEmail(db, p),
      escalate: (tenantId, conversationId, reason, details) => upsertEscalation(db, tenantId, conversationId, reason, details),
      tell: email.tell,
      markProcessed: (tenantId, messageId) => markProcessed(db, tenantId, messageId),
      received: (mailboxId, at) => stampMailboxReceived(db, mailboxId, at),
      now: Date.now,
    },
    { payload: job.payload },
  );
  console.log(JSON.stringify({ level: "info", event: "email_ingested", tenant: job.tenant_id, job: job.id, outcome }));
}

type Handler = (ctx: JobContext, job: ClaimedJob) => Promise<void>;

/**
 * The lead finder's three, over the pipeline the edge injects (A2). Each is
 * written to be run again (RETRY_WAITS_MS): a start claims its run row before
 * the provider is called, a collect commits one page by compare-and-set, a
 * check commits by lead id.
 */
async function leadRoundStart(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.leads) throw new Error("lead_round_start: this runtime holds no lead pipeline");
  await ctx.leads.roundStart(ctx, job);
}
async function leadCollect(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.leads) throw new Error("lead_collect: this runtime holds no lead pipeline");
  await ctx.leads.collect(ctx, job);
}
async function leadCheck(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.leads) throw new Error("lead_check: this runtime holds no lead pipeline");
  await ctx.leads.check(ctx, job);
}

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
  line_provision: lineProvision,
  email_ingest: emailIngest,
  lead_round_start: leadRoundStart,
  lead_collect: leadCollect,
  lead_check: leadCheck,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind"> {
  // The row's kind is text; a kind this build does not declare is unknown,
  // and the tick fails the job loudly rather than guessing.
  const handler = (HANDLERS as Record<string, Handler | undefined>)[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
