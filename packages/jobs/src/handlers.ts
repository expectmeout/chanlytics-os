/**
 * Job handlers — dispatched by the edge's api/jobs/tick.ts once
 * claim_due_jobs() has made the job this run's (00098). The rules live in
 * packages/core/src/messages as verbs over ports; each handler here is the
 * adapter that builds the ports from the job's context (no env reads here).
 */
import {
  pushFor,
  type JobKind,
  unreadFor,
  PUSH_RECEIPTS_AFTER_MS,
  BELL_WINDOW_DAYS,
  REACH_OUT_REPLY_DAYS,
} from "@chanlytics/contracts";
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
  reachOutReplyOf,
  sentEmailWithMessageId,
  stampMailboxReceived,
  type Json,
} from "@chanlytics/db";
import { upsertEscalation, type EscalationOutcome } from "./escalate";
import { broadcastSend } from "./broadcast-send";
import { replyRead } from "./reply-read";
import { type ClaimedJob, type JobContext, must, type PushTicket } from "./context";
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
        const meta = data.meta as {
          email?: { request?: unknown; own_request?: unknown };
          reach_out?: { lead_id?: unknown };
        } | null;
        const request = meta?.email?.request;
        // A person's reply to a reach-out, frozen again on the chain's own domain (G15): the door may send it instead.
        const own = meta?.email?.own_request;
        // A reach-out's email names the lead it was written for, so the door asks that lead's facts and no other's.
        const leadId = meta?.reach_out?.lead_id;
        return {
          status: data.status,
          body: data.body,
          channel: data.channel,
          sender: data.sender,
          email: isEmailRequest(request) ? request : null,
          ownEmail: isEmailRequest(own) ? own : undefined,
          leadId: typeof leadId === "string" && leadId ? leadId : null,
        };
      },
      purposeOf: (template) => templatePurpose(ctx.db, job.tenant_id, template),
      deliver: (d) => deliver({ db: ctx.db, wire: ctx.wire }, d),
      escalate: (conversationId, reason, details) =>
        upsertEscalation(ctx.db, job.tenant_id, conversationId, reason, details),
      alert: ctx.alert,
      ...(ctx.page ? { page: ctx.page } : {}),
      // The same send as a fresh row, through the same door a broadcast's next batch takes: this job completes, and
      // the ledger claims the new one when it is due. Said on the console, since the tick sees only a job done.
      retry: async (dueAt, payload) => {
        await ctx.schedule("outbound_send", dueAt, payload as Json);
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "outbound_send_rescheduled",
            tenant: job.tenant_id,
            job: job.id,
            message_id: payload.message_id,
            resumes: payload.resumes ?? null,
            due_at: dueAt.toISOString(),
          }),
        );
      },
      now: Date.now,
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
      // A reach-out's reply is read for what it means (Reach out Part 5): one reply_read per message, however often
      // this intake runs (jobs_reply_read_once), as this job's own tenant.
      reachOutReply: async (tenantId, messageId) =>
        (await reachOutReplyOf(db, { tenantId, messageId, days: REACH_OUT_REPLY_DAYS })) !== null,
      readReply: async (_tenantId, messageId) => {
        await ctx.scheduleOnce("reply_read", new Date(), { message_id: messageId });
      },
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
      await ctx.db.from("push_devices").select("token, user_id").in("user_id", readers),
    ) ?? [];
  if (!devices.length) return;
  const badges = await badgesFor(ctx, job.tenant_id, [...new Set(devices.map((d) => d.user_id))]);
  const receipts = await ctx.push.send(
    pushFor(
      n,
      devices.map((d) => ({ token: d.token, badge: badges.get(d.user_id) ?? 0 })),
    ),
  );
  // From here nothing throws: the alert has left, and a throw would have the ledger send it to every phone again.
  const gone = receipts.filter((r) => r.status === "error" && r.error === "DeviceNotRegistered").map((r) => r.to);
  if (gone.length) {
    try {
      await ctx.db.from("push_devices").delete().in("token", gone);
    } catch {
      // A dead phone not forgotten now is forgotten a send later, by its receipt or its next ticket.
    }
  }
  // A ticket says the service took the message; whether the phone did arrives in its receipt, a quarter of an hour
  // on (00189). One job carries every ticket of this send.
  const tickets: PushTicket[] = receipts.flatMap((r) => (r.status === "ok" && r.id ? [{ id: r.id, to: r.to }] : []));
  if (tickets.length) {
    try {
      await ctx.schedule("push_receipts", new Date(Date.now() + PUSH_RECEIPTS_AFTER_MS), {
        tickets: tickets.map((t) => ({ id: t.id, to: t.to })),
      });
    } catch {
      // The alert has left; a receipts job that cannot be written (a ledger whose CHECK predates 00189, in the
      // window between the edge's deploy and the migration) is a dead phone forgotten a send later, not a reason
      // to throw and have the ledger send the alert again.
    }
  }
}

/** PostgREST's answer to one read is a thousand rows at most; a bigger set is read a page at a time. */
const READ_PAGE = 1000;
/** How many uuids one `in` list carries: measured, about two hundred is where the URL becomes too long. */
const IN_BATCH = 100;

/**
 * The bell's number for each reader (contracts unreadFor): the workspace's kept rows of the bell's window, each
 * reader's seen moment and their own marks. Read once per send, for every reader at once.
 */
async function badgesFor(ctx: JobContext, tenantId: string, readers: readonly string[]): Promise<Map<string, number>> {
  const since = new Date(Date.now() - BELL_WINDOW_DAYS * 86_400_000).toISOString();
  // The window's rows, a page at a time: PostgREST answers at most a thousand rows to one read and says nothing
  // about the rest, so a busy month's bell was counted short.
  const rows: { id: string; created_at: string }[] = [];
  for (let from = 0; ; from += READ_PAGE) {
    const page =
      must(
        "push_send: cannot read the bell",
        await ctx.db
          .from("notifications")
          .select("id, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .range(from, from + READ_PAGE - 1),
      ) ?? [];
    rows.push(...page);
    if (page.length < READ_PAGE) break;
  }
  const seen =
    must(
      "push_send: cannot read when the bell was opened",
      await ctx.db
        .from("notification_reads")
        .select("user_id, seen_at")
        .eq("tenant_id", tenantId)
        .in("user_id", readers),
    ) ?? [];
  // The marks, by the rows' ids in batches: an `in` list of uuids is a URL, and a URL of about two hundred of them
  // is longer than PostgREST takes (414). Every mark of the window went in one list.
  const marks: { notification_id: string; user_id: string; read_at: string | null; dismissed_at: string | null }[] = [];
  for (let i = 0; i < rows.length; i += IN_BATCH) {
    marks.push(
      ...(must(
        "push_send: cannot read the bell's marks",
        await ctx.db
          .from("notification_marks")
          .select("notification_id, user_id, read_at, dismissed_at")
          .in("user_id", readers)
          .in(
            "notification_id",
            rows.slice(i, i + IN_BATCH).map((r) => r.id),
          ),
      ) ?? []),
    );
  }
  const out = new Map<string, number>();
  for (const u of readers) {
    const mine = seen.find((s) => s.user_id === u);
    out.set(
      u,
      unreadFor(
        rows,
        mine?.seen_at ?? null,
        marks.filter((m) => m.user_id === u),
      ),
    );
  }
  return out;
}

/**
 * push_receipts: the receipts of one send, asked for by the tickets it kept (00189). payload: { tickets: [{id, to}] }.
 * A phone the receipt says is gone is forgotten; any other error is the provider's to explain and this job's to
 * leave alone: a receipt is read once, never a reason to send again. A transport failure throws, so the ledger asks
 * again while the receipts still exist.
 */
async function pushReceipts(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.push) throw new Error("push_receipts: this runtime holds no push transport");
  const raw = job.payload.tickets;
  const tickets: PushTicket[] = Array.isArray(raw)
    ? raw.flatMap((t) =>
        t &&
        typeof t === "object" &&
        typeof (t as PushTicket).id === "string" &&
        typeof (t as PushTicket).to === "string"
          ? [{ id: (t as PushTicket).id, to: (t as PushTicket).to }]
          : [],
      )
    : [];
  if (!tickets.length) return;
  const receipts = await ctx.push.receipts(tickets.map((t) => t.id));
  const gone = tickets.filter((t) => receipts[t.id]?.error === "DeviceNotRegistered").map((t) => t.to);
  if (gone.length) {
    must(
      "push_receipts: cannot forget a phone that is gone",
      await ctx.db
        .from("push_devices")
        .delete()
        .in("token", [...new Set(gone)]),
    );
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
  push_receipts: pushReceipts,
  reply_read: replyRead,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind"> {
  // The row's kind is text; a kind this build does not declare is unknown,
  // and the tick fails the job loudly rather than guessing.
  const handler = (HANDLERS as Record<string, Handler | undefined>)[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
