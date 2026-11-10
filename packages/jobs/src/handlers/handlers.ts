/** Handlers: handlers. */

import {
  noticeRoute,
  pushFor,
  type JobKind,
  PUSH_RECEIPTS_AFTER_MS,
  BELL_WINDOW_DAYS,
  DAY_MS,
  EVENT_SUBSCRIBERS,
  type EventSubscriber,
  entryOf,
  recordOrEmpty,
  textOrEmpty,
  payloadFieldsOff,
  eventFieldsOff,
} from "@chanlytics/contracts";
import { requestIdShaped } from "@chanlytics/channels/tokens";
import { logger, withRequestId, logAndGoOn } from "@chanlytics/log";
import { CertainFailure, SUBSCRIBERS, type SubscriberPorts } from "@chanlytics/core";
import { findFreedTimeFacts } from "@chanlytics/db/campaigns";
import { findEventOfDelivery, isSubscriptionPaused, findDelivery, settleDelivery } from "@chanlytics/db/events";
import { recordReachOutBookedFrom } from "@chanlytics/db/calendar";
import {
  listMembersPushed,
  pushNamesFor,
  holdFactsOf,
  holdTold,
  findPersonFacts,
  wasOptOutTold,
  wasEventTold,
  listBookedVisits,
  listFeedAdditionsWith,
  wasTwinTold,
  findMemberJoined,
  findMemberEmail,
  wasNoticeKept,
  getUnreadOfReaders,
  forgetGoneWebPush,
  listWebPushOf,
} from "@chanlytics/db/notices";
import { findConversationOfEscalation } from "@chanlytics/db/ask";
import { payloadRefusal } from "../runner/schedule";
import type { DispatchOutcome } from "../runner/tick";
import { broadcastSend } from "./broadcast-send";
import { finishErasure } from "./erasure";
import { askReplyDraftOf, replyDraft } from "./reply-draft";
import { replyRead } from "./reply-read";
import { runBookingRead } from "./booking-read";
import { deliveryPage, deliveryPageKey } from "../runner/delivery-page";
import { type ClaimedJob, type JobContext, must, type PushTicket } from "../runner/context";
import { emailIngest, lineProvision, outboundSend } from "./incoming-email";

export type { PushReceipt, PushPort, WebPushPort, JobContext, ClaimedJob } from "../runner/context";

/** A job's adapter: it does its work, or comes back saying why there was none to do (DispatchOutcome `skipped`). */
type Handler = (ctx: JobContext, job: ClaimedJob) => Promise<void | { skipped: string }>;

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
/**
 * The browsers of the people a notification is for. With no keys on this deployment (`ctx.webPush` absent), or a database before
 * the table, it does nothing. A browser that has forgotten its subscription is forgotten here too.
 */
/** Far more than a business's owners have browsers: what one alert may ask of the push services at once. */
const BROWSERS_TOLD_MAX = 50;

async function tellBrowsers(
  ctx: JobContext,
  readers: readonly string[],
  note: { id: string; tenant_id: string; title: string; body: string; route: string | null },
): Promise<void> {
  if (!ctx.webPush) return;
  try {
    const browsers = await listWebPushOf(ctx.db, readers, BROWSERS_TOLD_MAX);
    if (!browsers.length) return;
    const gone = await ctx.webPush.send(browsers, {
      title: note.title,
      body: note.body.split("\n").find((l) => l.trim()) ?? "",
      route: note.route,
      tenant_id: note.tenant_id,
      notification_id: note.id,
    });
    if (gone.length) await forgetGoneWebPush(ctx.db, gone);
  } catch {
    // A browser not told is a miss the bell and the phone still cover: this job's retry would tell the phones twice.
  }
}

async function pushSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.push) throw new Error("push_send: this runtime holds no push transport");
  const id = textOrEmpty(job.payload.notification_id);
  if (!id) throw new Error("push_send: no notification named");
  const result = must(
    "push_send: cannot read the notification",
    await ctx.db
      .from("notifications")
      .select("id, tenant_id, kind, title, body, route, recipient_user_id, closed_at")
      .eq("id", id)
      .eq("tenant_id", job.tenant_id)
      .maybeSingle(),
  );
  // Gone, or closed before this ran (a hold answered within the minute, 00421): nothing to push, quietly.
  if (!result || result.closed_at) return;
  // A note's one reader, or everyone in the workspace; less whoever turned this kind off for their phones.
  const readers = await listMembersPushed(ctx.db, {
    tenantId: job.tenant_id,
    userIds: result.recipient_user_id ? [result.recipient_user_id] : null,
    kind: result.kind,
  });
  if (!readers.length) return;
  // This reader's browsers, where they said yes (D12 of the answers canvas): told beside the phones, and never failing them.
  await tellBrowsers(ctx, readers, { ...result, route: noticeRoute(result.kind, result.route) });
  const devices =
    must(
      "push_send: cannot read the phones",
      await ctx.db.from("push_devices").select("token, user_id").in("user_id", readers),
    ) ?? [];
  if (!devices.length) return;
  // Each reader's bell, counted as the page counts it (packages/db getUnreadOfReaders, by contracts unreadFor); and who of
  // them is in more than one workspace, whose phone is told which business, and keeps its icon's number (R11 S8-7).
  const userIds = [...new Set(devices.map((d) => d.user_id))];
  const [badges, names] = await Promise.all([
    getUnreadOfReaders(ctx.db, {
      tenantId: job.tenant_id,
      readers: userIds,
      fromIso: new Date(Date.now() - BELL_WINDOW_DAYS * DAY_MS).toISOString(),
    }),
    pushNamesFor(ctx.db, { tenantId: job.tenant_id, userIds: userIds }),
  ]);
  const receipts = await ctx.push.send(
    pushFor(
      // The phone opens the place the bell does (contracts noticeRoute): a row kept with no route opens its kind's list.
      { ...result, route: noticeRoute(result.kind, result.route) },
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
    } catch (error) {
      // The alert has left; a receipts job that cannot be written (a ledger whose CHECK predates 00189, in the
      // window between the edge's deploy and the migration) is a dead phone forgotten a send later, not a reason
      // to throw and have the ledger send the alert again. Said, so it is not forgotten in silence.
      logger().error("push_receipts_schedule_failed", {
        tenant_id: job.tenant_id,
        job: job.id,
        tickets: tickets.length,
        error: error instanceof Error ? error.message : String(error),
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
    ? raw.flatMap((t: unknown) => {
        const { id, to } = recordOrEmpty(t);
        return typeof id === "string" && typeof to === "string" ? [{ id, to }] : [];
      })
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
/** The edge's reminder of a late booking as the subscriber asks it; a runtime that holds none fails loudly. */
const remindThrough =
  (ctx: JobContext): SubscriberPorts["remindBooking"] =>
  (tenantId, appointmentId) => {
    if (!ctx.reminders) throw new Error("visit_reminder: this runtime holds no reminder of a late booking");
    return ctx.reminders.remind(tenantId, appointmentId);
  };

/** The edge's thank-you for a late Kept as the subscriber asks it; a runtime that holds none fails loudly. */
const thankThrough =
  (ctx: JobContext): SubscriberPorts["thankKept"] =>
  (tenantId, appointmentId) => {
    if (!ctx.reminders) throw new Error("visit_reminder: this runtime holds no thank-you for a late Kept");
    return ctx.reminders.thank(tenantId, appointmentId);
  };

/** The edge's enrolment for an occasion as the subscriber asks it; a runtime that holds none fails loudly. */
const enrolThrough =
  (ctx: JobContext): SubscriberPorts["enrolOccasions"] =>
  (tenantId, event) => {
    if (!ctx.occasions) throw new Error("occasion_enrol: this runtime holds no enrolment for an occasion");
    return ctx.occasions.enrol(tenantId, event);
  };

async function eventDeliver(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const named = deliveryNamed(job.payload);
  if (!named) throw new Error("event_deliver: the payload names no event, subscriber and kind");
  const row = await findDelivery(ctx.db, job.tenant_id, named.eventId, named.subscriber);
  if (!row) throw new Error("event_deliver: the relay wrote no delivery for this job");
  const settle = (state: "done" | "failed" | "paused", error: string | null) =>
    settleDelivery(ctx.db, { tenantId: job.tenant_id, ...named, state, attempts: row.attempts + 1, error });
  if (await isSubscriptionPaused(ctx.db, named.kind, named.subscriber)) {
    await settle("paused", null);
    return;
  }
  const event = await findEventOfDelivery(ctx.db, job.tenant_id, named.eventId);
  if (!event) {
    // Purged before its delivery ran (the evidence kinds, 00115): the delivery fails with why and the job is done,
    // since no try could change it. Nobody's bell: the miss is the platform's, said under its own name and paged on
    // the same condition a delivery that fails for good is (tick.ts), with the job named, so it is counted and read
    // where the rest are.
    const reason = "the ledger no longer holds the event";
    await settle("failed", reason);
    logger().error("event_deliver_event_gone", {
      tenant_id: job.tenant_id,
      job: job.id,
      event_id: named.eventId,
      subscriber: named.subscriber,
      kind: named.kind,
    });
    if (ctx.page) {
      try {
        const page = deliveryPage(job, reason);
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
  // What the event holds that its subscribers do not read as it says (contracts SUBSCRIBED_EVENTS): names only, and only said.
  const off = eventFieldsOff(event.kind, event.data);
  if (off.length > 0)
    logger({ tenant_id: job.tenant_id }).warn("event_data_unexpected", {
      event_id: event.id,
      kind: event.kind,
      subscriber: named.subscriber,
      fields: off,
    });
  // dispatchJob let the job through only for a subscriber this build knows.
  if (!subscriberNamed(named.subscriber)) throw new Error(`event_deliver: no subscriber named ${named.subscriber}`);
  const subscriber = SUBSCRIBERS[named.subscriber];
  // What a subscriber acts through: this job's database, behind the verbs it needs.
  const ports: SubscriberPorts = {
    bookedFromAppointment: (tenantId, appointmentId) => recordReachOutBookedFrom(ctx.db, tenantId, appointmentId),
    holdFacts: (tenantId, ref) => holdFactsOf(ctx.db, tenantId, ref, Date.now()),
    holdTold: (tenantId, p) => holdTold(ctx.db, { tenantId, ...p }),
    optOutPerson: (tenantId, contactId) => findPersonFacts(ctx.db, tenantId, contactId),
    optOutTold: (tenantId, p) => wasOptOutTold(ctx.db, { tenantId, ...p }),
    eventTold: (tenantId, eventId) => wasEventTold(ctx.db, { tenantId, eventId }),
    bookedVisits: (tenantId, ids, nowMs, status) => listBookedVisits(ctx.db, tenantId, ids, nowMs, status),
    feedAdditionsWith: (tenantId, event) => listFeedAdditionsWith(ctx.db, tenantId, event),
    twinTold: (tenantId, appointmentId) => wasTwinTold(ctx.db, tenantId, appointmentId),
    memberJoined: (tenantId, invitationId) => findMemberJoined(ctx.db, tenantId, invitationId),
    memberTold: (tenantId, invitationId) =>
      wasNoticeKept(ctx.db, { tenantId, kind: "member_joined", subjectType: "invitation", subjectId: invitationId }),
    memberEmail: (userId) => findMemberEmail(ctx.db, userId),
    freedTimeFacts: (tenantId, appointmentId, nowMs) => findFreedTimeFacts(ctx.db, tenantId, appointmentId, nowMs),
    // The edge's offer (decision 0082): the run lives with the edge's run context, injected like the website reader.
    offerFreedTime: (tenantId, freed) => {
      if (!ctx.freedTimes) throw new Error("freed_time_offer: this runtime holds no offer of a freed time");
      return ctx.freedTimes.offer(tenantId, freed);
    },
    // The edge's reminder of a late booking (decision 0118): its run lives with the edge's run context too.
    remindBooking: remindThrough(ctx),
    // The edge's thank-you for a visit marked kept after the day's look (decision 0122): the same run, the same context.
    thankKept: thankThrough(ctx),
    // The edge's enrolment for an occasion (decision 0119): the record and the sequences it starts live there too.
    enrolOccasions: enrolThrough(ctx),
    // A thread's draft asked for: the row claimed and the job scheduled here, so a runtime with no writer can still ask.
    askReplyDraft: async (tenantId, ref) => {
      const conversationId =
        "conversationId" in ref
          ? ref.conversationId
          : await findConversationOfEscalation(ctx.db, tenantId, ref.escalationId);
      if (conversationId) await askReplyDraftOf(ctx.db, tenantId, conversationId);
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
 * inbound_answer: a customer's message its door recorded and acknowledged (a WhatsApp message, a text, a DM), answered
 * through the receptionist the edge injects (decision 0031), its turn bounded by the job's deadline. payload: what its
 * wire's door kept (`wa`, `ig` or `text`) and { message_id, conversation_id, contact_id }. Run again after a runner
 * died mid-turn, it answers only while the message is unprocessed and no reply names it (core inbound/ingest.ts).
 */
async function inboundAnswer(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.inbound) throw new Error("inbound_answer: this runtime holds no receptionist");
  await ctx.inbound.answer(job, ctx.deadline);
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

/** file_look: one file read by the small model (00551, decision 0099), through what the edge injects. payload: { file_id, edition } */
async function fileLook(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.files) throw new Error("file_look: this runtime holds no file reader");
  await ctx.files.look(job, ctx.deadline);
}

/** file_fetch: pictures an import found, fetched and kept once each (00551). payload: { source, batch, items } */
async function fileFetch(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.files) throw new Error("file_fetch: this runtime holds no file reader");
  await ctx.files.fetch(job, ctx.deadline);
}

/** file_purge: a removed file's bytes and Anthropic's copy of it let go (00551). payload: { file_id } */
async function filePurge(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.files) throw new Error("file_purge: this runtime holds no file reader");
  await ctx.files.purge(job);
}

/** video_digest: one step of a video made ready (00556), through what the edge injects. payload: { file_id, step, edition } */
async function videoDigest(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.files) throw new Error("video_digest: this runtime holds no file reader");
  await ctx.files.digest(job, ctx.deadline);
}

/** post_prepare: a post made ready on Instagram (00611, decision 0121), through what the edge injects. payload: { post_id, attempt } */
async function postPrepare(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts) throw new Error("post_prepare: this runtime holds no poster");
  return ctx.posts.prepare(job, ctx.deadline);
}

/** post_publish: a post sent, once, after the recheck (00611). payload: { post_id, attempt } */
async function postPublish(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts) throw new Error("post_publish: this runtime holds no poster");
  return ctx.posts.publish(job, ctx.deadline);
}

/** post_reconcile: Instagram asked what it has after a send with no answer (00611). payload: { post_id, attempt } */
async function postReconcile(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts) throw new Error("post_reconcile: this runtime holds no poster");
  return ctx.posts.reconcile(job, ctx.deadline);
}

/** website_read: the business's website read for Check (00479, decision 0073), through what the edge injects. payload: { url }. */
async function websiteRead(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.website) throw new Error("website_read: this runtime holds no website reader");
  await ctx.website.read(job, ctx.deadline);
}

/** preview_build: a lead's own receptionist built (00497, decision 0079), through what the edge injects. payload: { preview_id }. */
async function previewBuild(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.previews) throw new Error("preview_build: this runtime holds no preview builder");
  return ctx.previews.build(job, ctx.deadline);
}

/** campaign_moments: a workspace's due moments, through what the edge injects (00569, decision 0115). payload {}. */
async function campaignMoments(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.campaigns) throw new Error("campaign_moments: this runtime holds no campaign runner");
  await ctx.campaigns.moments(job, ctx.deadline);
}

/** sequence_occasions: a workspace's occasions whose time has come, through what the edge injects (00598, decision 0119). payload {}. */
async function sequenceOccasions(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.campaigns) throw new Error("sequence_occasions: this runtime holds no campaign runner");
  await ctx.campaigns.occasions(job, ctx.deadline);
}

/** reach_out_steps: a workspace's due reach-out steps, through what the edge injects (00569, decision 0115). payload {}. */
async function reachOutSteps(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.campaigns) throw new Error("reach_out_steps: this runtime holds no campaign runner");
  await ctx.campaigns.steps(job, ctx.deadline);
}

/** calendar_read: a workspace's calendar read, through what the edge injects (00569, decision 0115). payload {}. */
async function calendarRead(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.calendar?.read) throw new Error("calendar_read: this runtime holds no calendar reader");
  const answer = await ctx.calendar.read(job);
  return "skipped" in answer ? answer : undefined;
}

/** google_read: a workspace's Google listings and profile read, through what the edge injects (00569, decision 0115). */
async function googleRead(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.google) throw new Error("google_read: this runtime holds no Google reader");
  const answer = await ctx.google.read(job, ctx.deadline);
  return "skipped" in answer ? answer : undefined;
}

/** texts_read: a workspace's lines' texts taken in where the door missed them, through what the edge injects (00605). */
async function textsRead(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.texts) throw new Error("texts_read: this runtime holds no texts reader");
  const answer = await ctx.texts.read(job, ctx.deadline);
  return "skipped" in answer ? answer : undefined;
}

/**
 * canary: the ledger's own proof that it runs (00526, decision 0089). It does nothing: that a row scheduled by pg_cron was
 * claimed, run and completed is the whole of what it proves, and sweep_status judges it by its newest done row, so
 * /api/health says so from outside.
 */
async function canary(): Promise<void> {
  // Nothing: that it was claimed, run and completed is the proof.
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
  reply_draft: replyDraft,
  event_deliver: eventDeliver,
  booking_read: runBookingRead,
  inbound_answer: inboundAnswer,
  history_import: historyImport,
  website_read: websiteRead,
  preview_build: previewBuild,
  erasure_finish: finishErasure,
  file_look: fileLook,
  file_fetch: fileFetch,
  file_purge: filePurge,
  video_digest: videoDigest,
  post_prepare: postPrepare,
  post_publish: postPublish,
  post_reconcile: postReconcile,
  campaign_moments: campaignMoments,
  reach_out_steps: reachOutSteps,
  calendar_read: calendarRead,
  google_read: googleRead,
  texts_read: textsRead,
  sequence_occasions: sequenceOccasions,
  canary,
};

export async function dispatchJob(ctx: JobContext, job: ClaimedJob): Promise<DispatchOutcome> {
  // The row's kind is text; a kind this build does not declare is unknown, and the tick keeps it for the runner that
  // knows it (ledger UNKNOWN_KIND_WAIT_MS), failing it as never run only once it has been due a day.
  const handler = entryOf(HANDLERS, job.kind);
  if (!handler) return "unknown_kind";
  // A delivery to a subscriber this build does not know is a row a newer deploy wrote (00334): kept, as a kind is.
  if (job.kind === "event_deliver" && !subscriberNamed(job.payload.subscriber)) return "unknown_kind";
  // A payload its kind cannot run on (kinds.ts `ids`) is never half-run: it fails as never run, certain, in those words,
  // and the platform hears of it, since a writer of ours wrote it (schedule.ts refuses one at the write).
  const refused = payloadRefusal(job.kind, job.payload);
  if (refused) {
    await ctx
      .page?.(
        `job_payload_refused:${job.kind}`,
        `${job.kind}: a job could not run`,
        `Job ${job.id}: ${refused}.`,
        job.tenant_id,
      )
      ?.catch(logAndGoOn("paging the platform"));
    throw new CertainFailure(`${job.kind}: ${refused}`, `it was never run: ${refused}`);
  }
  // What the payload holds that its kind does not say (contracts JOB_PAYLOADS): names only, and only said for now.
  const off = payloadFieldsOff(job.kind, job.payload);
  if (off.length > 0)
    logger({ tenant_id: job.tenant_id }).warn("job_payload_unexpected", {
      job_id: job.id,
      kind: job.kind,
      fields: off,
    });
  // The job runs as the request that scheduled it (schedule.ts stamped its name into the payload), so a click's reply,
  // the send it queued and the send's own lines are one search in the log; a job the database scheduled (a clock)
  // has none and runs as itself, named by its row.
  const out = await withRequestId(requestIdShaped(job.payload.request_id) ?? job.id, () => handler(ctx, job));
  return out && typeof out === "object" ? out : "done";
}

export { upsertEscalation } from "../runner/escalate";

export type { EscalationOutcome } from "../runner/escalate";
