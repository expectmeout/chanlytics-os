/**
 * Job handlers — dispatched by the edge's api/jobs/tick.ts once
 * claim_due_jobs() has made the job this run's (00098). The rules live in
 * packages/core/src/messages as verbs over ports; each handler here is the
 * adapter that builds the ports from the job's context (no env reads here).
 */
import { pushFor, type JobKind } from "@chanlytics/contracts";
import {
  classifyReceived,
  emailPlainText,
  isEmailRequest,
  messageIdsIn,
  type ReceivedEmail,
} from "@chanlytics/channels";
import {
  deliver,
  ingestEmail,
  provisionLine,
  type IncomingEmail,
  sendQueued,
  templatePurpose,
  type SendQueuedCommand,
} from "@chanlytics/core";
import {
  ingestInboundEmail,
  mailboxById,
  markProcessed,
  sentEmailWithMessageId,
  stampMailboxReceived,
  type Json,
} from "@chanlytics/db";
import { upsertEscalation, type EscalationOutcome } from "./escalate";
import { broadcastSend } from "./broadcast-send";
import { type ClaimedJob, type JobContext, must } from "./context";
export type { PushReceipt, PushPort, JobContext, ClaimedJob } from "./context";

/** outbound_send: core's sendQueued, over this runtime's ports. payload: { message_id, conversation_id, to_phone | to_email, body?, template?, purpose? (marketing, or outreach: a cold email), proactive? } */
async function outboundSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await sendQueued(
    {
      // maybeSingle() reports an absent row as `data: null` without an error,
      // so a read that failed and a message that is gone stay separable; the
      // verb turns the error into the job's loud failure.
      queued: async (id) => {
        const { data, error } = await ctx.db
          .from("messages")
          .select("id, status, body, template_name, channel, sender, meta")
          .eq("id", id)
          .eq("tenant_id", job.tenant_id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return null;
        // The request an email was queued with (core reply.ts). meta is JSON, so its shape is checked, not assumed:
        // a row without a sendable one reaches the wire with none and fails there by name.
        const meta = data.meta as { email?: { request?: unknown }; reach_out?: { lead_id?: unknown } } | null;
        const request = meta?.email?.request;
        // A reach-out's email names the lead it was written for, so the door asks that lead's facts and no other's.
        const leadId = meta?.reach_out?.lead_id;
        return {
          status: data.status,
          body: data.body,
          channel: data.channel,
          sender: data.sender,
          email: isEmailRequest(request) ? request : null,
          leadId: typeof leadId === "string" && leadId ? leadId : null,
        };
      },
      purposeOf: (template) => templatePurpose(ctx.db, job.tenant_id, template),
      deliver: (d) => deliver({ db: ctx.db, wire: ctx.wire }, d),
      escalate: (conversationId, reason, details) =>
        upsertEscalation(ctx.db, job.tenant_id, conversationId, reason, details),
      alert: ctx.alert,
      ...(ctx.page ? { page: ctx.page } : {}),
    },
    { tenantId: job.tenant_id, payload: job.payload as SendQueuedCommand["payload"] },
  );
}
// Flagging a thread for a person lives in escalate.ts, where the ledger's settle reaches it without loading the core.
export { upsertEscalation };
export type { EscalationOutcome };
/** line_provision: core's provisionLine, over the saga the edge injects. */
async function lineProvision(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await provisionLine(
    {
      ...(ctx.provisionLine ? { provision: ctx.provisionLine } : {}),
      // The saga stops between two provider calls at the job's deadline, and the rest is one more job of this kind.
      next: (payload) => ctx.schedule("line_provision", new Date(), payload as Json),
      deadline: ctx.deadline,
    },
    { payload: job.payload },
  );
}
/**
 * The provider's email, as the verb takes it: what it claims to be, its words
 * as plain text, and its thread ids read out of its headers. The parsing is
 * here, in the adapter, so the verb knows no provider (hygiene.test.mjs).
 */
export function incomingEmailOf(e: ReceivedEmail): IncomingEmail {
  return {
    id: e.id,
    from: e.from,
    to: e.to,
    cc: e.cc,
    subject: e.subject,
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
        return m && m.tenant_id === job.tenant_id
          ? { id: m.id, tenant_id: m.tenant_id, address: `${m.local_part}@${email.domain}` }
          : null;
      },
      fetch: async (receivedId) => {
        const e = await email.fetch(receivedId);
        return e ? incomingEmailOf(e) : null;
      },
      erasedBefore: email.erasedBefore,
      ours: (tenantId, rfcMessageId) => sentEmailWithMessageId(db, tenantId, rfcMessageId),
      record: (p) => ingestInboundEmail(db, p),
      escalate: (tenantId, conversationId, reason, details) =>
        upsertEscalation(db, tenantId, conversationId, reason, details),
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
 * push_send: one kept notification to every phone of the people it is for.
 * payload: { notification_id }. The row it names may be gone (purged, or the
 * workspace erased): that is a job done, not a failure. A phone the service
 * says is gone is forgotten here, where the answer is.
 */
async function pushSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.push) throw new Error("push_send: this runtime holds no push transport");
  const id = String(job.payload.notification_id ?? "");
  if (!id) throw new Error("push_send: no notification named");
  const n = must(
    "push_send: cannot read the notification",
    await ctx.db
      .from("notifications")
      .select("id, tenant_id, title, body, route, recipient_user_id")
      .eq("id", id)
      .eq("tenant_id", job.tenant_id)
      .maybeSingle(),
  );
  if (!n) return;
  const readers = n.recipient_user_id
    ? [n.recipient_user_id]
    : (
        must(
          "push_send: cannot read who is in the workspace",
          await ctx.db.from("memberships").select("user_id").eq("tenant_id", job.tenant_id),
        ) ?? []
      ).map((m) => m.user_id);
  if (!readers.length) return;
  const devices =
    must(
      "push_send: cannot read the phones",
      await ctx.db.from("push_devices").select("token").in("user_id", readers),
    ) ?? [];
  if (!devices.length) return;
  const receipts = await ctx.push.send(
    pushFor(
      n,
      devices.map((d) => d.token),
    ),
  );
  const gone = receipts.filter((r) => r.status === "error" && r.error === "DeviceNotRegistered").map((r) => r.to);
  if (gone.length) {
    must("push_send: cannot forget a phone that is gone", await ctx.db.from("push_devices").delete().in("token", gone));
  }
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
  line_provision: lineProvision,
  email_ingest: emailIngest,
  lead_round_start: leadRoundStart,
  lead_collect: leadCollect,
  lead_check: leadCheck,
  push_send: pushSend,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind"> {
  // The row's kind is text; a kind this build does not declare is unknown,
  // and the tick fails the job loudly rather than guessing.
  const handler = (HANDLERS as Record<string, Handler | undefined>)[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
