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
      scrub: async (tenantId, by, scrubbed) => {
        const q = ctx.db.from("jobs").update({ payload: scrubbed });
        if ("contactId" in by) await q.eq("tenant_id", tenantId).eq("kind", "blob_thread_erase").eq("payload->>contact_id", by.contactId);
        else await q.eq("id", by.jobId);
      },
      // actor_type 'system' with a null actor_user_id is what decisions_check
      // requires; the service role is not subject to RLS here.
      recordErased: async (tenantId, contactId, threads, jobId) => {
        await ctx.db.from("decisions").insert({ tenant_id: tenantId, subject_type: "contact", subject_id: contactId, verb: "erase", actor_type: "system", payload: { leg: "blob", threads, job_id: jobId } });
        await ctx.db.from("events").insert({ tenant_id: tenantId, kind: "contact.blob_erased", category: "contact", subject_type: "contact", subject_id: contactId, data: { threads } });
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
      workspacePaused: async () => {
        const { data } = await db.from("tenants").select("status").eq("id", job.tenant_id).maybeSingle();
        return data?.status === "paused";
      },
      fail: async (id, failure) => {
        await db.from("broadcasts").update({ state: "failed", failure, finished_at: new Date().toISOString() }).eq("id", id);
      },
      startSending: async (id) => {
        await db.from("broadcasts").update({ state: "sending", started_at: new Date().toISOString() }).eq("id", id).eq("state", "scheduled");
      },
      // `category` is Meta's verdict on what kind of message this is, and it
      // decides which consent the send needs.
      template: async (name, language) => {
        const { data } = await db.from("templates").select("meta_status, body_preview, category").eq("tenant_id", job.tenant_id).eq("channel", "whatsapp").eq("name", name).eq("language", language).maybeSingle();
        return data ?? null;
      },
      facts: async () => {
        const [{ data: tenantRow }, { data: cfgRow }] = await Promise.all([
          db.from("tenants").select("name").eq("id", job.tenant_id).maybeSingle(),
          db.from("tenant_config").select("config").eq("tenant_id", job.tenant_id).maybeSingle(),
        ]);
        const parsedCfg = parseTenantConfig(cfgRow?.config ?? null);
        const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";
        return { businessName, bookingLink: parsedCfg?.brain?.booking_link ?? null };
      },
      batch: async (id, limit) => {
        const { data, error } = await db.from("broadcast_recipients").select("contact_id, facts").eq("broadcast_id", id).eq("state", "queued").limit(limit);
        if (error) throw new Error(`broadcast_send: cannot read recipients: ${error.message}`);
        return data ?? [];
      },
      contact: async (contactId) => {
        const { data, error } = await db.from("contacts").select("id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name").eq("id", contactId).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      },
      target: (phoneE164) => resolveOutboundTarget(db, { tenantId: job.tenant_id, phoneE164, create: false }),
      // The message a dying run left this person: written by deliver after the
      // wire accepted it, with this broadcast's id in its meta.
      alreadySent: async (id, contactId) => {
        const { data } = await db
          .from("messages")
          .select("id")
          .eq("tenant_id", job.tenant_id)
          .eq("contact_id", contactId)
          .filter("meta->>broadcast_id", "eq", id)
          .in("status", ["sent", "delivered", "read"])
          .limit(1)
          .maybeSingle();
        return data?.id ?? null;
      },
      mark: async (id, contactId, patch) => {
        await db.from("broadcast_recipients").update({ ...patch, sent_at: patch.state === "sent" ? new Date().toISOString() : null }).eq("broadcast_id", id).eq("contact_id", contactId);
      },
      deliver: (d) => deliver({ db, wire: ctx.wire }, d),
      remaining: async (id) => {
        const { count, error } = await db.from("broadcast_recipients").select("contact_id", { count: "exact", head: true }).eq("broadcast_id", id).eq("state", "queued");
        if (error) throw new Error(`broadcast_send: cannot count the rest: ${error.message}`);
        return count ?? 0;
      },
      state: async (id) => {
        const { data } = await db.from("broadcasts").select("state").eq("id", id).maybeSingle();
        return data?.state ?? null;
      },
      scheduleNext: async (id) => {
        await ctx.schedule("broadcast_send", new Date(), { broadcast_id: id });
      },
      tally: async (id) => {
        const { data } = await db.from("broadcast_recipients").select("state").eq("broadcast_id", id);
        const sent = (data ?? []).filter((t) => t.state === "sent").length;
        return { sent, held: (data ?? []).length - sent };
      },
      finish: async (id, tally) => {
        await db.from("broadcasts").update({ state: "sent", finished_at: new Date().toISOString() }).eq("id", id).eq("state", "sending");
        await db.from("events").insert({ tenant_id: job.tenant_id, kind: "broadcast.sent", category: "message", subject_type: "broadcast", subject_id: id, data: tally });
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
