/** Handlers: incoming email. */

import { REACH_OUT_REPLY_DAYS, isBookingTool, senderVerdictOf } from "@chanlytics/contracts";
import {
  classifyReceived,
  senderAuthenticated,
  emailPlainText,
  isEmailRequest,
  messageIdsIn,
  type ReceivedEmail,
} from "@chanlytics/channels/email";
import { logger } from "@chanlytics/log";
import {
  deliver,
  ingestEmail,
  provisionLine,
  type IncomingEmail,
  sendQueued,
  getTemplatePurpose,
  type SendQueuedCommand,
} from "@chanlytics/core";
import {
  ingestInboundEmail,
  findMailboxById,
  findLiveMailboxByAddress,
  findMailboxConnection,
  getMailboxSenderVerdicts,
  getSentEmailWithMessageId,
  stampMailboxReceived,
  keepForwardingConfirmation,
} from "@chanlytics/db/email";
import { findOutboxMessage, markProcessed } from "@chanlytics/db/channels";
import { findReachOutReply } from "@chanlytics/db/campaigns";
import type { Json } from "@chanlytics/db/types";
import { hasMemberAddress } from "@chanlytics/db/calendar";
import { getTenantConfig } from "@chanlytics/db/workspace";
import { claimQueuedSend, releaseQueuedSend } from "@chanlytics/db/jobs";
import { findThreadDraftFacts } from "@chanlytics/db/ask";
import { upsertEscalation } from "../runner/escalate";
import { senderLeftAt } from "./reply-draft";
import type { ClaimedJob, JobContext } from "../runner/context";
import { jsonCopyOf } from "@chanlytics/db/shared";

/** outbound_send: core's sendQueued, over this runtime's ports. payload: { message_id, conversation_id, to_phone | to_email | to_instagram, body?, template?, purpose? (marketing, or outreach: a cold email), proactive? } */
export async function outboundSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await sendQueued(
    {
      // maybeSingle() reports an absent row as `data: null` without an error,
      // so a read that failed and a message that is gone stay separable; the
      // verb turns the error into the job's loud failure.
      queued: async (id) => {
        const { data, error } = await findOutboxMessage(ctx.db, job.tenant_id, id);
        if (error) throw new Error(error.message);
        if (!data) return null;
        // The request an email was queued with (core reply.ts). meta is JSON, so its shape is checked, not assumed:
        // a row without a sendable one reaches the wire with none and fails there by name.
        const meta = data.meta as {
          email?: { request?: unknown; own_request?: unknown };
          reach_out?: { lead_id?: unknown };
          to?: unknown;
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
          // Where it goes, frozen on the row when it was queued (00527 queue_send): the ledger keeps no copy.
          to: typeof meta?.to === "string" && meta.to ? meta.to : null,
        };
      },
      purposeOf: (template) => getTemplatePurpose(ctx.db, job.tenant_id, template),
      claim: (id) => claimQueuedSend(ctx.db, job.tenant_id, id),
      release: (id) => releaseQueuedSend(ctx.db, job.tenant_id, id),
      deliver: (d) => deliver({ db: ctx.db, wire: ctx.wire }, d),
      escalate: (conversationId, reason, details) =>
        upsertEscalation(ctx.db, job.tenant_id, conversationId, reason, details),
      // The thread's open hold (db findThreadDraftFacts).
      openHold: async (conversationId) => (await findThreadDraftFacts(ctx.db, job.tenant_id, conversationId)).reason,
      alert: ctx.alert,
      ...(ctx.page ? { page: ctx.page } : {}),
      // The same send as a fresh row, through the same door a broadcast's next batch takes: this job completes, and
      // the ledger claims the new one when it is due. Said in the log, since the tick sees only a job done.
      retry: async (dueAt, payload) => {
        await ctx.schedule("outbound_send", dueAt, payload);
        logger().warn("outbound_send_rescheduled", {
          tenant_id: job.tenant_id,
          job: job.id,
          message_id: payload.message_id,
          resumes: payload.resumes ?? null,
          due_at: dueAt.toISOString(),
        });
      },
      now: Date.now,
    },
    { tenantId: job.tenant_id, payload: job.payload as SendQueuedCommand["payload"] },
  );
}

/** line_provision: core's provisionLine, over the saga the edge injects. */
export async function lineProvision(ctx: JobContext, job: ClaimedJob): Promise<void> {
  await provisionLine(
    {
      ...(ctx.provisionLine ? { provision: ctx.provisionLine } : {}),
      // The saga stops between two provider calls at the job's deadline, and the rest is one more job of this kind.
      next: (payload) => ctx.schedule("line_provision", new Date(), jsonCopyOf(payload)),
      deadline: ctx.deadline,
    },
    { payload: job.payload },
  );
}

/**
 * The provider's email, as the verb takes it: what it claims to be, its words
 * as plain text, and its thread ids read out of its headers. The parsing is
 * here, in the adapter, so the verb knows no provider (hygiene.test.mjs). Whether its sender is proved is the provider's
 * own verdict on it (channels senderAuthenticated), which nothing in the message can write.
 */
export function incomingEmailOf(receivedEmail: ReceivedEmail): IncomingEmail {
  return {
    id: receivedEmail.id,
    from: receivedEmail.from,
    to: receivedEmail.to,
    cc: receivedEmail.cc,
    subject: receivedEmail.subject,
    text: emailPlainText(receivedEmail),
    messageId: receivedEmail.messageId,
    inReplyTo: messageIdsIn(receivedEmail.headers["in-reply-to"])[0] ?? null,
    references: messageIdsIn(receivedEmail.headers.references),
    receivedAt: receivedEmail.createdAt,
    claim: classifyReceived(receivedEmail),
    attachments: receivedEmail.attachments,
    senderAuthenticated: senderAuthenticated(receivedEmail),
  };
}

/**
 * A mailbox's email as its row keeps it: stamped with the mailbox it came through, as its import's are (the edge's
 * mailboxEmailMeta), so Connections counts who wrote to each mailbox.
 */
function mailboxStamped(meta: Json, mailboxId: string): Json {
  const own = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  return { ...own, source: "mailbox", mailbox_id: mailboxId };
}

/**
 * email_ingest from a mailbox the business connected (decision 0056): the same verb, over the mailbox's row and its
 * own provider. The sync schedules one only for a message in a thread a reach-out started, so what it reads is a reply
 * (or a report about one of its emails, which the sync applies itself and never schedules). A booking notice, a
 * forwarding confirmation and a member's forward are the hosted address's alone.
 */
async function mailboxIngest(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const intake = ctx.mailboxIntake;
  if (!intake) throw new Error("email_ingest: this runtime holds no mailbox intake");
  const { db } = ctx;
  const mailboxId = typeof job.payload.mailbox_id === "string" ? job.payload.mailbox_id : "";
  const outcome = await ingestEmail(
    {
      mailbox: async (id) => {
        const m = await findMailboxConnection(db, job.tenant_id, id);
        return m && m.state !== "removed" ? { id: m.id, tenant_id: m.tenant_id, address: m.address } : null;
      },
      fetch: async (providerId) => {
        const e = await intake.fetch(mailboxId, providerId);
        return e ? incomingEmailOf(e) : null;
      },
      readBooking: () => Promise.resolve(undefined),
      bookingTool: () => Promise.resolve(null),
      memberAddress: () => Promise.resolve(false),
      keepForwarding: () => Promise.resolve(undefined),
      erasedBefore: intake.erasedBefore,
      ours: (tenantId, rfcMessageId) => getSentEmailWithMessageId(db, tenantId, rfcMessageId),
      record: (p) => ingestInboundEmail(db, { ...p, meta: mailboxStamped(p.meta, mailboxId) }),
      escalate: (tenantId, conversationId, reason, details) =>
        upsertEscalation(db, tenantId, conversationId, reason, details),
      tell: intake.tell,
      reachOutReply: async (tenantId, messageId) =>
        (await findReachOutReply(db, { tenantId, messageId, days: REACH_OUT_REPLY_DAYS })) !== null,
      readReply: async (_tenantId, messageId) => {
        await ctx.scheduleOnce("reply_read", new Date(), { message_id: messageId });
      },
      markProcessed: (tenantId, messageId) => markProcessed(db, tenantId, messageId),
      // The mailbox's own clock says when it was read (its sync); a taken email stamps nothing more.
      received: () => Promise.resolve(undefined),
      // This is the connected mailbox's own read.
      readByMailbox: () => Promise.resolve(false),
      now: Date.now,
    },
    { payload: job.payload },
  );
  logger().info("email_ingested", { tenant_id: job.tenant_id, job: job.id, outcome, source: "mailbox" });
}

/** email_ingest: core's ingestEmail, over the rows and the provider fetch the edge injects. */
export async function emailIngest(ctx: JobContext, job: ClaimedJob): Promise<void> {
  // A reply read from a mailbox the business connected has its own intake (decision 0056).
  if (job.payload.source === "mailbox") return mailboxIngest(ctx, job);
  const email = ctx.email;
  if (!email) throw new Error("email_ingest: this runtime holds no email provider");
  const { db } = ctx;
  // What the provider said of the sender, for the line below: it is how a deployment sees that a verdict is handed over
  // at all, and why an email that says yes was, or was not, believed.
  let senderChecks: ReceivedEmail["authentication"] = null;
  const outcome = await ingestEmail(
    {
      mailbox: async (id) => {
        const m = await findMailboxById(db, id);
        // The job's own tenant, not the payload's word for it: a mailbox that is not this workspace's is not found.
        return m && m.tenant_id === job.tenant_id
          ? { id: m.id, tenant_id: m.tenant_id, address: `${m.local_part}@${email.domain}` }
          : null;
      },
      fetch: async (receivedId) => {
        const e = await email.fetch(receivedId);
        senderChecks = e?.authentication ?? null;
        return e ? incomingEmailOf(e) : null;
      },
      // A booking tool's notice is read into an appointment by its own job, once per delivery and workspace
      // (dedupe_key), as this job's own tenant: the intake run again finds it already on the ledger. The tool rides
      // along, so a delivery the provider no longer has when the read runs is still kept on the ledger as the tool's.
      readBooking: async (_tenantId, mailboxId, receivedId, tool) => {
        await ctx.scheduleOnce("booking_read", new Date(), { received_id: receivedId, mailbox_id: mailboxId, tool });
      },
      // Only the tool the workspace named is read as its bookings (config bookings.tool), read off what is stored: a
      // workspace that named none reads none, and a value the list does not know is none.
      bookingTool: async (tenantId) => {
        const stored = (await getTenantConfig(db, tenantId))?.config;
        const named = (stored as { bookings?: { tool?: unknown } | null } | null | undefined)?.bookings?.tool;
        return isBookingTool(named) ? named : null;
      },
      // A forward by hand is trusted from a member of the workspace, once its sender is proved (member_has_address, 00345).
      memberAddress: (tenantId, address) => hasMemberAddress(db, tenantId, address),
      // Gmail's confirmation of a forward here, kept on the mailbox for Settings to show (00345).
      keepForwarding: (mailboxId, p) => keepForwardingConfirmation(db, mailboxId, p),
      erasedBefore: email.erasedBefore,
      ours: (tenantId, rfcMessageId) => getSentEmailWithMessageId(db, tenantId, rfcMessageId),
      record: (p) => ingestInboundEmail(db, p),
      escalate: (tenantId, conversationId, reason, details) =>
        upsertEscalation(db, tenantId, conversationId, reason, details),
      tell: email.tell,
      // A reach-out's reply is read for what it means (Reach out Part 5): one reply_read per message, however often
      // this intake runs (jobs_reply_read_once), as this job's own tenant.
      reachOutReply: async (tenantId, messageId) =>
        (await findReachOutReply(db, { tenantId, messageId, days: REACH_OUT_REPLY_DAYS })) !== null,
      readReply: async (_tenantId, messageId) => {
        await ctx.scheduleOnce("reply_read", new Date(), { message_id: messageId });
      },
      markProcessed: (tenantId, messageId) => markProcessed(db, tenantId, messageId),
      received: (mailboxId, at) => stampMailboxReceived(db, mailboxId, at),
      // A copy a mailbox the workspace connected holds too, whose sync reads it (one signed out is not read): Gmail
      // forwarding the business's mail here, or an email to both. That mailbox's read takes it in.
      readByMailbox: async (tenantId, addresses) => {
        for (const a of new Set(addresses.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
          const m = await findLiveMailboxByAddress(db, a);
          if (m && m.tenant_id === tenantId && m.state !== "reconnect") return true;
        }
        return false;
      },
      // What the workspace said of the sender (00483), as a connected mailbox's sorting reads it: "Not a person" holds
      // on this road too.
      senderSaid: async (tenantId, address) => senderVerdictOf(await getMailboxSenderVerdicts(db, tenantId), address),
      // And what they were read to be (decision 0093, one judge), where this runtime holds the reader.
      ...(ctx.drafts ? { senderLeft: senderLeftAt(db, ctx.drafts, ctx.deadline) } : {}),
      now: Date.now,
    },
    { payload: job.payload },
  );
  logger().info("email_ingested", { tenant_id: job.tenant_id, job: job.id, outcome, sender_checks: senderChecks });
}
