/**
 * Job handlers — dispatched by the edge's api/jobs/tick.ts once
 * claim_due_jobs() has made the job this run's (00098). The rules live in
 * packages/core/src/messages as verbs over ports; each handler here is the
 * adapter that builds the ports from the job's context (no env reads here).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTenantConfig, type JobKind } from "@chanlytics/contracts";
import { deliver, eraseBlobThread, provisionLine, sendBroadcastBatch, sendQueued, templatePurpose, type EraseThreadCommand, type SendQueuedCommand, type Wire } from "@chanlytics/core";
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
   * Run a line's provisioning saga, or resume it. INJECTED like eraseThread:
   * the provider and the receptionist's credentials live on the edge. The
   * saga reads its own receipts, so a second run repeats nothing. Optional
   * so a test context need not supply one; a job of this kind in a runtime
   * without it fails loudly rather than guessing.
   */
  provisionLine?: (lineId: string, by: "owner" | "support" | "sweep") => Promise<{ ok: boolean; step?: string; error?: string; did?: string }>;
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

/** outbound_send: core's sendQueued, over this runtime's ports. payload: { message_id, conversation_id, to_phone, body?, template? } */
async function outboundSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await sendQueued(
    {
      // maybeSingle() reports an absent row as `data: null` without an error,
      // so a read that failed and a message that is gone stay separable; the
      // verb turns the error into the job's loud failure.
      queued: async (id) => {
        const { data, error } = await ctx.db.from("messages").select("id, status, body, template_name, channel, sender").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
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
    // one open escalation per conversation: repeat triggers refresh details.
    // A refresh that did not land must not come back as "refreshed": the caller
    // reads that as "the hold is already open and now says why" and stays quiet,
    // which is how a hold ends up open with a stale reason and nobody paged.
    const { error: refreshErr } = await db.from("escalations")
      .update({ details, reason })
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("state", "open");
    if (refreshErr) {
      console.error("escalation_refresh_failed", refreshErr.message);
      return "failed";
    }
    return "refreshed";
  }
  console.error("escalation_upsert_failed", error.message);
  return "failed";
}

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
        must("broadcast_send: cannot start the broadcast", await db.from("broadcasts").update({ state: "sending", started_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id).eq("state", "scheduled"));
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
      contact: async (contactId) => {
        const { data, error } = await db.from("contacts").select("id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name").eq("id", contactId).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      },
      // create: false — a broadcast never opens a contact. touch: false — the
      // door below still has to refuse some of these people, and a thread they
      // were not messaged in has nothing new in it.
      target: (phoneE164) => resolveOutboundTarget(db, { tenantId: job.tenant_id, phoneE164, create: false, touch: false }),
      // The message a dying run left this person: written by deliver after the
      // wire accepted it, with this broadcast's id in its meta. It is the one
      // check standing between a resumed run and a second WhatsApp template to
      // the same person, so a read that FAILED must never come back as "no,
      // they have not been messaged".
      alreadySent: async (id, contactId) => {
        const row = must("broadcast_send: cannot check what this person was already sent", await db
          .from("messages")
          .select("id, created_at")
          .eq("tenant_id", job.tenant_id)
          .eq("contact_id", contactId)
          .filter("meta->>broadcast_id", "eq", id)
          .in("status", ["sent", "delivered", "read"])
          .limit(1)
          .maybeSingle());
        // created_at is written by the same statement that records the send, so
        // it is when the message left, which is what the recipient's row wants.
        return row ? { id: row.id, sentAt: row.created_at } : null;
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
      scheduleNext: async (id) => {
        await ctx.schedule("broadcast_send", new Date(), { broadcast_id: id });
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
  line_provision: lineProvision,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind"> {
  // The row's kind is text; a kind this build does not declare is unknown,
  // and the tick fails the job loudly rather than guessing.
  const handler = (HANDLERS as Record<string, Handler | undefined>)[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
