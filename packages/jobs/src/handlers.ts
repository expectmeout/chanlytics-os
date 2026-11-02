/**
 * Job handlers — dispatched by the edge's api/jobs/tick.ts once
 * claim_due_jobs() has made the job this run's (00098). The rules live in
 * packages/core/src/messages as verbs over ports; each handler here is the
 * adapter that builds the ports from the job's context (no env reads here).
 */
import {
  noticeRoute,
  pushFor,
  type JobKind,
  PUSH_RECEIPTS_AFTER_MS,
  BELL_WINDOW_DAYS,
  DAY_MS,
  REACH_OUT_REPLY_DAYS,
  EVENT_SUBSCRIBERS,
  type EventSubscriber,
  isBookingTool,
  senderVerdictOf,
} from "@chanlytics/contracts";
import {
  classifyReceived,
  senderAuthenticated,
  emailPlainText,
  isEmailRequest,
  logger,
  messageIdsIn,
  requestIdShaped,
  withRequestId,
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
  SUBSCRIBERS,
  type SubscriberPorts,
} from "@chanlytics/core";
import {
  ingestInboundEmail,
  mailboxById,
  liveMailboxByAddress,
  mailboxConnectionOf,
  mailboxSenderVerdicts,
  markProcessed,
  reachOutReplyOf,
  sentEmailWithMessageId,
  stampMailboxReceived,
  type Json,
  eventOfDelivery,
  subscriptionPaused,
  deliveryOf,
  settleDelivery,
  memberHasAddress,
  keepForwardingConfirmation,
  getTenantConfig,
  claimQueuedSend,
  releaseQueuedSend,
  membersPushedFor,
  pushNamesFor,
  reachOutBookedFrom,
  holdFactsOf,
  holdTold,
  personFactsOf,
  optOutTold,
  eventTold,
  bookedVisitsOf,
  feedAdditionsWith,
  twinTold,
  memberJoinedOf,
  memberEmailOf,
  freedTimeFactsOf,
  noticeKept,
  unreadOfReaders,
  threadDraftFacts,
} from "@chanlytics/db";
import { upsertEscalation, type EscalationOutcome } from "./escalate";
import { broadcastSend } from "./broadcast-send";
import { erasureFinish } from "./erasure";
import { replyRead } from "./reply-read";
import { bookingRead } from "./booking-read";
import { deliveryPage, deliveryPageKey } from "./delivery-page";
import { type ClaimedJob, type JobContext, must, type PushTicket } from "./context";
export type { PushReceipt, PushPort, JobContext, ClaimedJob } from "./context";

/** outbound_send: core's sendQueued, over this runtime's ports. payload: { message_id, conversation_id, to_phone | to_email | to_instagram, body?, template?, purpose? (marketing, or outreach: a cold email), proactive? } */
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
      claim: (id) => claimQueuedSend(ctx.db, job.tenant_id, id),
      release: (id) => releaseQueuedSend(ctx.db, job.tenant_id, id),
      deliver: (d) => deliver({ db: ctx.db, wire: ctx.wire }, d),
      escalate: (conversationId, reason, details) =>
        upsertEscalation(ctx.db, job.tenant_id, conversationId, reason, details),
      // The thread's open hold, read as the dashboard's draft for a person reads it (db threadDraftFacts).
      openHold: async (conversationId) => (await threadDraftFacts(ctx.db, job.tenant_id, conversationId)).reason,
      alert: ctx.alert,
      ...(ctx.page ? { page: ctx.page } : {}),
      // The same send as a fresh row, through the same door a broadcast's next batch takes: this job completes, and
      // the ledger claims the new one when it is due. Said in the log, since the tick sees only a job done.
      retry: async (dueAt, payload) => {
        await ctx.schedule("outbound_send", dueAt, payload as Json);
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
 * here, in the adapter, so the verb knows no provider (hygiene.test.mjs). Whether its sender is proved is the provider's
 * own verdict on it (channels senderAuthenticated), which nothing in the message can write.
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
    senderAuthenticated: senderAuthenticated(e),
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
        const m = await mailboxConnectionOf(db, job.tenant_id, id);
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
      ours: (tenantId, rfcMessageId) => sentEmailWithMessageId(db, tenantId, rfcMessageId),
      record: (p) => ingestInboundEmail(db, { ...p, meta: mailboxStamped(p.meta, mailboxId) }),
      escalate: (tenantId, conversationId, reason, details) =>
        upsertEscalation(db, tenantId, conversationId, reason, details),
      tell: intake.tell,
      reachOutReply: async (tenantId, messageId) =>
        (await reachOutReplyOf(db, { tenantId, messageId, days: REACH_OUT_REPLY_DAYS })) !== null,
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
async function emailIngest(ctx: JobContext, job: ClaimedJob): Promise<void> {
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
        const m = await mailboxById(db, id);
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
      memberAddress: (tenantId, address) => memberHasAddress(db, tenantId, address),
      // Gmail's confirmation of a forward here, kept on the mailbox for Settings to show (00345).
      keepForwarding: (mailboxId, p) => keepForwardingConfirmation(db, mailboxId, p),
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
      // A copy a mailbox the workspace connected holds too, whose sync reads it (one signed out is not read): Gmail
      // forwarding the business's mail here, or an email to both. That mailbox's read takes it in.
      readByMailbox: async (tenantId, addresses) => {
        for (const a of new Set(addresses.map((x) => x.trim().toLowerCase()).filter(Boolean))) {
          const m = await liveMailboxByAddress(db, a);
          if (m && m.tenant_id === tenantId && m.state !== "reconnect") return true;
        }
        return false;
      },
      // What the workspace said of the sender (00483), as a connected mailbox's sorting reads it: "Not a person" holds
      // on this road too.
      senderSaid: async (tenantId, address) => senderVerdictOf(await mailboxSenderVerdicts(db, tenantId), address),
      now: Date.now,
    },
    { payload: job.payload },
  );
  logger().info("email_ingested", { tenant_id: job.tenant_id, job: job.id, outcome, sender_checks: senderChecks });
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
 * push_send: one kept notification to every phone of the people it is for,
 * less those who turned its kind off for their phones (memberships.push_off,
 * 00372; decision 0040). payload: { notification_id }. The row it names may be
 * gone (purged, or the workspace erased): that is a job done, not a failure. A
 * phone the service says is gone is forgotten here, where the answer is.
 */
async function pushSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.push) throw new Error("push_send: this runtime holds no push transport");
  const id = String(job.payload.notification_id ?? "");
  if (!id) throw new Error("push_send: no notification named");
  const n = must(
    "push_send: cannot read the notification",
    await ctx.db
      .from("notifications")
      .select("id, tenant_id, kind, title, body, route, recipient_user_id, closed_at")
      .eq("id", id)
      .eq("tenant_id", job.tenant_id)
      .maybeSingle(),
  );
  // Gone, or closed before this ran (a hold answered within the minute, 00421): nothing to push, quietly.
  if (!n || n.closed_at) return;
  // A note's one reader, or everyone in the workspace; less whoever turned this kind off for their phones.
  const readers = await membersPushedFor(ctx.db, {
    tenantId: job.tenant_id,
    userIds: n.recipient_user_id ? [n.recipient_user_id] : null,
    kind: n.kind,
  });
  if (!readers.length) return;
  const devices =
    must(
      "push_send: cannot read the phones",
      await ctx.db.from("push_devices").select("token, user_id").in("user_id", readers),
    ) ?? [];
  if (!devices.length) return;
  // Each reader's bell, counted as the page counts it (packages/db unreadOfReaders, by contracts unreadFor); and who of
  // them is in more than one workspace, whose phone is told which business, and keeps its icon's number (R11 S8-7).
  const told = [...new Set(devices.map((d) => d.user_id))];
  const [badges, names] = await Promise.all([
    unreadOfReaders(ctx.db, {
      tenantId: job.tenant_id,
      readers: told,
      fromIso: new Date(Date.now() - BELL_WINDOW_DAYS * DAY_MS).toISOString(),
    }),
    pushNamesFor(ctx.db, { tenantId: job.tenant_id, userIds: told }),
  ]);
  const receipts = await ctx.push.send(
    pushFor(
      // The phone opens the place the bell does (contracts noticeRoute): a row kept with no route opens its kind's list.
      { ...n, route: noticeRoute(n.kind, n.route) },
      devices.map((d) =>
        names.inMany.has(d.user_id)
          ? { token: d.token, badge: null, business: names.business }
          : { token: d.token, badge: badges.get(d.user_id) ?? 0 },
      ),
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
    } catch (e) {
      // The alert has left; a receipts job that cannot be written (a ledger whose CHECK predates 00189, in the
      // window between the edge's deploy and the migration) is a dead phone forgotten a send later, not a reason
      // to throw and have the ledger send the alert again. Said, so it is not forgotten in silence.
      logger().error("push_receipts_schedule_failed", {
        tenant_id: job.tenant_id,
        job: job.id,
        tickets: tickets.length,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
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

/** What an event_deliver job names, read from its payload as the relay wrote it (00334). */
function deliveryNamed(payload: Record<string, unknown>): { eventId: string; subscriber: string; kind: string } | null {
  const { event_id, subscriber, kind } = payload;
  return typeof event_id === "string" && typeof subscriber === "string" && typeof kind === "string"
    ? { eventId: event_id, subscriber, kind }
    : null;
}

/** Whether a name is a subscriber this build knows (contracts EVENT_SUBSCRIBERS); one it does not is kept as an unknown kind. */
function subscriberNamed(s: unknown): s is EventSubscriber {
  return typeof s === "string" && EVENT_SUBSCRIBERS.some((known) => known === s);
}

/**
 * One event's delivery to one subscriber (00334, decision 0032). The relay wrote the delivery row and this job; the
 * subscriber runs over the event as the ledger holds it, and the row takes the verdict: done, paused when the
 * subscription was paused as it ran (a re-drive brings it back), failed with why when the subscriber threw or the
 * ledger no longer holds the event. A throw is thrown on, so the ledger tries again (RETRY_WAITS_MS) and the last try
 * fails the job and pages the operator (ledger PAGES_THE_PLATFORM: the fault is the platform's, never an owner's);
 * every subscriber may run twice on one delivery and leaves the same rows.
 */
async function eventDeliver(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const named = deliveryNamed(job.payload);
  if (!named) throw new Error("event_deliver: the payload names no event, subscriber and kind");
  const row = await deliveryOf(ctx.db, job.tenant_id, named.eventId, named.subscriber);
  if (!row) throw new Error("event_deliver: the relay wrote no delivery for this job");
  const settle = (state: "done" | "failed" | "paused", error: string | null) =>
    settleDelivery(ctx.db, { tenantId: job.tenant_id, ...named, state, attempts: row.attempts + 1, error });
  if (await subscriptionPaused(ctx.db, named.kind, named.subscriber)) {
    await settle("paused", null);
    return;
  }
  const event = await eventOfDelivery(ctx.db, job.tenant_id, named.eventId);
  if (!event) {
    // Purged before its delivery ran (the evidence kinds, 00115): the delivery fails with why and the job is done,
    // since no try could change it. Nobody's bell: the miss is the platform's, said under its own name and paged on
    // the same condition a delivery that fails for good is (tick.ts), with the job named, so it is counted and read
    // where the rest are.
    const why = "the ledger no longer holds the event";
    await settle("failed", why);
    logger().error("event_deliver_event_gone", {
      tenant_id: job.tenant_id,
      job: job.id,
      event_id: named.eventId,
      subscriber: named.subscriber,
      kind: named.kind,
    });
    if (ctx.page) {
      try {
        const page = deliveryPage(job, why);
        await ctx.page(deliveryPageKey(job), page.subject, page.body, job.tenant_id);
      } catch (e) {
        logger().error("job_page_failed", {
          tenant_id: job.tenant_id,
          job: job.id,
          kind: job.kind,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return;
  }
  // dispatchJob let the job through only for a subscriber this build knows.
  if (!subscriberNamed(named.subscriber)) throw new Error(`event_deliver: no subscriber named ${named.subscriber}`);
  const subscriber = SUBSCRIBERS[named.subscriber];
  // What a subscriber acts through: this job's database, behind the verbs it needs.
  const ports: SubscriberPorts = {
    bookedFromAppointment: (tenantId, appointmentId) => reachOutBookedFrom(ctx.db, tenantId, appointmentId),
    holdFacts: (tenantId, ref) => holdFactsOf(ctx.db, tenantId, ref, Date.now()),
    holdTold: (tenantId, p) => holdTold(ctx.db, { tenantId, ...p }),
    optOutPerson: (tenantId, contactId) => personFactsOf(ctx.db, tenantId, contactId),
    optOutTold: (tenantId, p) => optOutTold(ctx.db, { tenantId, ...p }),
    eventTold: (tenantId, eventId) => eventTold(ctx.db, { tenantId, eventId }),
    bookedVisits: (tenantId, ids, nowMs, status) => bookedVisitsOf(ctx.db, tenantId, ids, nowMs, status),
    feedAdditionsWith: (tenantId, event) => feedAdditionsWith(ctx.db, tenantId, event),
    twinTold: (tenantId, appointmentId) => twinTold(ctx.db, tenantId, appointmentId),
    memberJoined: (tenantId, invitationId) => memberJoinedOf(ctx.db, tenantId, invitationId),
    memberTold: (tenantId, invitationId) =>
      noticeKept(ctx.db, { tenantId, kind: "member_joined", subjectType: "invitation", subjectId: invitationId }),
    memberEmail: (userId) => memberEmailOf(ctx.db, userId),
    freedTimeFacts: (tenantId, appointmentId, nowMs) => freedTimeFactsOf(ctx.db, tenantId, appointmentId, nowMs),
    // The edge's offer (decision 0082): the run lives with the edge's run context, injected like the website reader.
    offerFreedTime: (tenantId, freed) => {
      if (!ctx.freedTimes) throw new Error("freed_time_offer: this runtime holds no offer of a freed time");
      return ctx.freedTimes.offer(tenantId, freed);
    },
    // The delivery is the event's workspace's job, so the runtime addresses the notice to it (job-alert.ts).
    tell: (news) => ctx.alert(news),
  };
  try {
    await subscriber(event, ports);
  } catch (e) {
    await settle("failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
  await settle("done", null);
}

/**
 * Every declared kind, and only those. `Record<JobKind, Handler>` is the
 * compiler's promise that a kind added to JOB_KINDS without a handler does
 * not build, rather than sitting on the ledger until a row of it is claimed
 * and comes back "unknown_kind" in production.
 */
/**
 * inbound_answer: a text the SMS door recorded and acknowledged, answered through the receptionist the edge injects
 * (decision 0031, Phase 2). payload: { text, received_at, message_id, conversation_id, contact_id }. Run again after a
 * runner died mid-turn, it answers only while the message is unprocessed and no reply names it (core inbound/ingest.ts).
 */
async function inboundAnswer(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.inbound) throw new Error("inbound_answer: this runtime holds no receptionist");
  await ctx.inbound.answer(job);
}

/**
 * history_import: one part of a connection's history brought in (00478, decision 0073), through what the edge injects.
 * payload: { source, seq, connection_id? }. Every write it makes is once by the provider's id, so a part claimed again
 * keeps nothing twice.
 */
async function historyImport(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.imports) throw new Error("history_import: this runtime holds no importer");
  await ctx.imports.part(job, ctx.deadline);
}

/** website_read: the business's website read for Check (00479, decision 0073), through what the edge injects. payload: { url }. */
async function websiteRead(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.website) throw new Error("website_read: this runtime holds no website reader");
  await ctx.website.read(job, ctx.deadline);
}

/** preview_build: a lead's own receptionist built (00497, decision 0079), through what the edge injects. payload: { preview_id }. */
async function previewBuild(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.previews) throw new Error("preview_build: this runtime holds no preview builder");
  await ctx.previews.build(job, ctx.deadline);
}

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
  event_deliver: eventDeliver,
  booking_read: bookingRead,
  inbound_answer: inboundAnswer,
  history_import: historyImport,
  website_read: websiteRead,
  preview_build: previewBuild,
  erasure_finish: erasureFinish,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<"done" | "unknown_kind"> {
  // The row's kind is text; a kind this build does not declare is unknown,
  // and the tick fails the job loudly rather than guessing.
  const handler = (HANDLERS as Record<string, Handler | undefined>)[job.kind];
  if (!handler) return "unknown_kind";
  // A delivery to a subscriber this build does not know is a row a newer deploy wrote (00334): kept, as a kind is.
  if (job.kind === "event_deliver" && !subscriberNamed(job.payload.subscriber)) return "unknown_kind";
  // The job runs as the request that scheduled it (schedule.ts stamped its name into the payload), so a click's reply,
  // the send it queued and the send's own lines are one search in the log; a job the database scheduled (a clock)
  // has none and runs as itself, named by its row.
  await withRequestId(requestIdShaped(job.payload.request_id) ?? job.id, () => handler(ctx, job));
  return "done";
}
