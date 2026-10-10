// src/schedule.ts
import { hasNewerCopy, readJobToRequeue } from "../../db/dist/index.js";
import { JOB_KINDS } from "../../contracts/dist/index.js";
import { logger, requestId } from "../../channels/dist/index.js";

// src/ledger.ts
import { DAY_MS, MIN_MS, jittered } from "../../contracts/dist/index.js";
import { DEADLINE_MARGIN_MS } from "../../core/dist/index.js";
import { TWILIO_TIMEOUT_MS, WHATSAPP_SEND_TIMEOUT_MS } from "../../channels/dist/index.js";
var LEASE_SECONDS = 90;
var CLAIM_FOR_MS = 2e4;
var CLAIM_SLOTS = 3;
var YIELD_AT_MS = 45e3;
var FUNCTION_CEILING_MS = MIN_MS;
var SEND_SETTLE_MS = 5e3;
var sendByAt = (deadline) => deadline + (FUNCTION_CEILING_MS - YIELD_AT_MS) - SEND_SETTLE_MS;
var startByAt = (deadline) => ({
  whatsapp: sendByAt(deadline) - WHATSAPP_SEND_TIMEOUT_MS,
  sms: sendByAt(deadline) - TWILIO_TIMEOUT_MS
});
var LEAD_YIELD_AT_MS = FUNCTION_CEILING_MS - DEADLINE_MARGIN_MS;
var REPLY_LATE_PAGE_MS = MIN_MS;
var MAX_ATTEMPTS = 3;
var MAX_RESUMES = 5;
var RELAY_LIMIT = 500;
var SPEAKS_TO_A_PERSON = /* @__PURE__ */ new Set(["outbound_send", "broadcast_send"]);
var TOLD_ELSEWHERE = /* @__PURE__ */ new Set(["inbound_answer", "event_deliver"]);
var PAGES_THE_PLATFORM = /* @__PURE__ */ new Set(["event_deliver"]);
var RUN_INTERRUPTED = "the run did not finish; its outcome is unknown";
function verdictFor(job) {
  if (job.attempts <= 1) return "run";
  if (SPEAKS_TO_A_PERSON.has(job.kind) || job.spoke_at) return "give_up";
  return job.attempts > MAX_ATTEMPTS ? "give_up" : "run";
}
var RETRY_WAITS_MS = {
  email_ingest: [5 * MIN_MS, 30 * MIN_MS],
  // The lead finder's three (00140). Each is written to be run again: a start
  // claims its run row before it calls the provider, a collect commits a page
  // by compare-and-set on the offset, a check commits by lead id. A
  // provider's 429 or 5xx throws and lands here: two minutes covers a bad
  // minute, ten a short outage; the third claim fails the row and the round
  // ends "the source failed". Every wait outlasts the lease (jobs-ledger.test.mjs).
  lead_round_start: [2 * MIN_MS, 10 * MIN_MS],
  lead_collect: [2 * MIN_MS, 10 * MIN_MS],
  lead_check: [2 * MIN_MS, 10 * MIN_MS],
  // A phone told from a kept row (00162): the push service's bad minute, then
  // its short outage, each wait outlasting the lease like the three above. The
  // row is read again on each try, and a phone the service answered for is
  // answered for once.
  push_send: [2 * MIN_MS, 10 * MIN_MS],
  // The receipts of a send (00189): Expo keeps them a day, so a bad minute and
  // then a short outage are affordable waits, each outlasting the lease.
  push_receipts: [5 * MIN_MS, 30 * MIN_MS],
  // A reply to a reach-out, read (Reach out Part 5, 00222). Every stage is written to be run again: the reading is kept
  // once per message and a re-read by compare-and-set, the notice is claimed before it is told and marked only after
  // (its claim goes stale with the lease, before either wait ends). A thrown read or write, or a notice whose mail
  // failed, lands here: two minutes, then ten, each outlasting the lease.
  reply_read: [2 * MIN_MS, 10 * MIN_MS],
  // A booking tool's notice, read (00345). Written to be run again: the ledger's row is kept last and a visit is found
  // by its key, so a try that died after the write restates the row it wrote. A model's bad minute or a failed write
  // throws and lands here: two minutes, then ten, each outlasting the lease. The third try holds the notice for a
  // person before it fails (booking-read.ts), so the delivery is never only a failed job.
  booking_read: [2 * MIN_MS, 10 * MIN_MS],
  // One event's delivery to one subscriber (00334): the delivery row takes each verdict, and every subscriber may run
  // twice, so a throw is a provider's or the database's bad minute: two minutes, then ten, each outlasting the lease.
  event_deliver: [2 * MIN_MS, 10 * MIN_MS],
  // A text answered after its acknowledgement (00347): a thrown read or write is the database's bad minute. One more
  // try, after a wait that outlasts the lease; a second throw fails it, and the deadman sweep then hands the message to
  // a person (lib/receptionist/unfinished.ts), as it would a turn that died in the door.
  inbound_answer: [2 * MIN_MS]
};
function retryWait(job, random = Math.random) {
  if (SPEAKS_TO_A_PERSON.has(job.kind) || job.spoke_at || job.attempts >= MAX_ATTEMPTS) return null;
  const wait = RETRY_WAITS_MS[job.kind]?.[job.attempts - 1];
  return wait === void 0 ? null : jittered(wait, random);
}
var UNKNOWN_KIND_WAIT_MS = 5 * MIN_MS;
var UNKNOWN_KIND_GIVE_UP_MS = DAY_MS;
async function claimNext(db, leaseSeconds) {
  const { data, error } = await db.rpc("claim_due_jobs", { p_limit: 1, p_lease_seconds: leaseSeconds });
  if (error) throw new Error(`claim_due_jobs: ${error.message}`);
  const rows = data ?? [];
  return rows[0] ?? null;
}
var NO_SUCH_COLUMN = "PGRST204";
async function markSpoke(db, job) {
  if (job.spoke_at) return;
  const at = (/* @__PURE__ */ new Date()).toISOString();
  let write = db.from("jobs").update({ spoke_at: at }).eq("id", job.id).eq("state", "fired");
  if (job.attempts !== void 0) write = write.eq("attempts", job.attempts);
  const { data, error } = await write.select("id");
  if (error && error.code !== NO_SUCH_COLUMN) throw new Error(`mark_spoke: ${error.message}`);
  if (!error && (data?.length ?? 0) === 0) throw new Error("mark_spoke: this run no longer holds the job");
  job.spoke_at = at;
}
async function completeJob(db, job) {
  const { data, error } = await db.from("jobs").update({ state: "done", lease_until: null }).eq("id", job.id).eq("state", "fired").eq("attempts", job.attempts).select("id");
  if (error) throw new Error(`complete_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
async function failJob(db, job, reason) {
  const { data, error } = await db.from("jobs").update({ state: "failed", last_error: reason.slice(0, 500), lease_until: null }).eq("id", job.id).eq("state", "fired").eq("attempts", job.attempts).select("id");
  if (error) throw new Error(`fail_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
async function deferJob(db, job, untilIso, reason, giveBackClaim = false) {
  const { data, error } = await db.from("jobs").update({
    lease_until: untilIso,
    last_error: reason.slice(0, 500),
    ...giveBackClaim ? { attempts: Math.max(0, job.attempts - 1) } : {}
  }).eq("id", job.id).eq("state", "fired").eq("attempts", job.attempts).select("id");
  if (error) throw new Error(`defer_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// src/schedule.ts
function named(payload) {
  const id = requestId();
  if (!id || payload === null || typeof payload !== "object" || Array.isArray(payload) || "request_id" in payload)
    return payload;
  return { ...payload, request_id: id };
}
function dedupeKeyOf({ tenantId, kind, payload }) {
  const p = payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const field = (name) => typeof p[name] === "string" ? p[name] : null;
  switch (kind) {
    case "email_ingest":
      return field("mailbox_id") && field("received_id") ? `email_ingest:${field("mailbox_id")}:${field("received_id")}` : null;
    case "lead_collect":
      return field("run_id") && field("seq") ? `lead_collect:${field("run_id")}:${field("seq")}` : null;
    case "reply_read":
      return field("message_id") ? `reply_read:${field("message_id")}:${field("stage") ?? "read"}` : null;
    // One read per delivery in each workspace (docs/plans/2026-10-07-bookings-arrive-by-email.md): the intake run again,
    // or the provider's webhook replayed, finds the read already on the ledger. One delivery addressed to two
    // workspaces' mailboxes is an intake for each (edge resend-event.ts), and each reads it into its own appointments:
    // keyed by the delivery alone, the second workspace's read was already_scheduled, and its booking never read.
    case "booking_read":
      return field("received_id") ? `booking_read:${tenantId}:${field("received_id")}` : null;
    case "inbound_answer":
      return field("message_id") ? `inbound_answer:${field("message_id")}` : null;
    default:
      return null;
  }
}
function rowToInsert(p, key) {
  return {
    tenant_id: p.tenantId,
    kind: p.kind,
    due_at: p.dueAt.toISOString(),
    payload: named(p.payload),
    ...key ? { dedupe_key: key } : {}
  };
}
async function scheduleJob(db, p) {
  const { data, error } = await db.from("jobs").insert({ tenant_id: p.tenantId, kind: p.kind, due_at: p.dueAt.toISOString(), payload: named(p.payload) }).select("id").single();
  if (error || !data) throw new Error(`schedule_job: ${error?.message ?? "no row"}`);
  return { jobId: data.id };
}
async function scheduleJobOnce(db, p) {
  const key = dedupeKeyOf(p);
  const insert = (dedupeKey) => db.from("jobs").insert(rowToInsert(p, dedupeKey));
  let { error } = await insert(key);
  if (error?.code === "PGRST204" && key) ({ error } = await insert(null));
  if (!error) return "scheduled";
  if (error.code === "23505") return "already_scheduled";
  throw Object.assign(new Error(`schedule_job: ${error.message}`), { code: error.code });
}
async function cancelJobsFor(db, tenantId, kind, payloadKey, payloadValue) {
  if (!/^[a-z][a-z0-9_]*$/.test(payloadKey)) throw new Error(`cancel_jobs_for: ${payloadKey} is not a payload key`);
  const { data, error } = await db.from("jobs").update({ state: "canceled" }).eq("tenant_id", tenantId).eq("kind", kind).eq("state", "scheduled").eq(`payload->>${payloadKey}`, payloadValue).select("id");
  if (error) {
    logger().error("cancel_jobs_failed", { tenant_id: tenantId, kind, error: error.message });
    return 0;
  }
  return data?.length ?? 0;
}
async function requeueFailedJob(db, tenantId, jobId, record) {
  const row = await readJobToRequeue(db, tenantId, jobId);
  if (!row) return { outcome: "not_found" };
  if (row.state !== "failed") return { outcome: "not_failed", state: row.state };
  if (row.kind === "event_deliver") {
    const subscriber = row.payload?.subscriber;
    return { outcome: "redrive", subscriber: typeof subscriber === "string" ? subscriber : "" };
  }
  if (SPEAKS_TO_A_PERSON.has(row.kind) || row.spoke_at) return { outcome: "speaks_to_a_person", kind: row.kind };
  if (await hasNewerCopy(db, tenantId, row)) return { outcome: "already_scheduled" };
  const kind = JOB_KINDS.find((k) => k === row.kind);
  if (!kind) return { outcome: "unknown_kind", kind: row.kind };
  await record(kind);
  const again = await scheduleJobOnce(db, { tenantId, kind, dueAt: /* @__PURE__ */ new Date(), payload: row.payload });
  return again === "scheduled" ? { outcome: "requeued", kind } : { outcome: "already_scheduled" };
}

// src/handlers.ts
import {
  pushFor,
  isForReader,
  unreadFor,
  PUSH_RECEIPTS_AFTER_MS,
  BELL_WINDOW_DAYS,
  REACH_OUT_REPLY_DAYS as REACH_OUT_REPLY_DAYS2,
  EVENT_SUBSCRIBERS,
  isBookingTool
} from "../../contracts/dist/index.js";
import {
  classifyReceived,
  senderAuthenticated,
  emailPlainText as emailPlainText2,
  isEmailRequest,
  logger as logger6,
  messageIdsIn,
  requestIdShaped,
  withRequestId
} from "../../channels/dist/index.js";
import {
  deliver as deliver2,
  ingestEmail,
  provisionLine,
  sendQueued,
  templatePurpose,
  SUBSCRIBERS
} from "../../core/dist/index.js";
import {
  ingestInboundEmail,
  mailboxById,
  markProcessed,
  reachOutReplyOf as reachOutReplyOf2,
  sentEmailWithMessageId,
  stampMailboxReceived,
  eventOfDelivery,
  subscriptionPaused,
  deliveryOf,
  settleDelivery,
  memberHasAddress,
  keepForwardingConfirmation,
  getTenantConfig,
  claimQueuedSend as claimQueuedSend2,
  releaseQueuedSend as releaseQueuedSend2,
  membersPushedFor,
  reachOutBookedFrom
} from "../../db/dist/index.js";

// src/escalate.ts
import { openEscalation } from "../../db/dist/index.js";
import { logger as logger2 } from "../../channels/dist/index.js";
async function upsertEscalation(db, tenantId, conversationId, reason, details) {
  try {
    return await openEscalation(db, { tenantId, conversationId, reason, details });
  } catch (e) {
    logger2().error("escalation_upsert_failed", {
      tenant_id: tenantId,
      conversation_id: conversationId,
      error: e instanceof Error ? e.message : String(e)
    });
    return "failed";
  }
}

// src/broadcast-send.ts
import {
  buildEmailRequest,
  campaignsIdentity,
  errField,
  hostedIdentity,
  logger as logger3,
  signUnsubscribeToken,
  unsubscribeUrl
} from "../../channels/dist/index.js";
import { CAMPAIGN_EMAIL_TAG, EMAIL_HOLDS, OUTCOME_UNKNOWN, parseTenantConfig } from "../../contracts/dist/index.js";
import {
  deliver,
  isWireUnavailable,
  sendBroadcastBatch
} from "../../core/dist/index.js";
import {
  appointmentStates,
  campaignMonthSent,
  claimQueuedSend,
  emitEvent,
  insertQueuedEmail,
  mailboxOfTenant,
  messageVersionRowsOf,
  queuedRecipients,
  recordEvent,
  releaseQueuedSend,
  resolveOutboundTarget,
  resolveOutboundTargetForContact,
  runGoesByOthers,
  withdrawEmail,
  workspacePaused,
  writtenEmail
} from "../../db/dist/index.js";

// src/context.ts
function must(what, r) {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

// src/broadcast-send.ts
var sendLog = logger3();
async function countRecipients(db, tenantId, broadcastId, state, reason) {
  let q = db.from("broadcast_recipients").select("contact_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("broadcast_id", broadcastId);
  if (state) q = q.eq("state", state);
  if (reason) q = q.eq("reason", reason);
  const { count, error } = await q;
  if (error) throw new Error(`broadcast_send: cannot count ${state ?? "all"} recipients: ${error.message}`);
  return count ?? 0;
}
function withTemplate(row) {
  if (!row) return null;
  const { template_name, template_language } = row;
  return template_name && template_language ? { ...row, template_name, template_language } : null;
}
function wireUnbound(ctx, channel) {
  const wire = ctx.wire[channel];
  return isWireUnavailable(wire) ? wire.error : null;
}
function wirePorts(ctx) {
  return {
    wireUnavailable: async (channel) => wireUnbound(ctx, channel),
    offersClosed: () => Promise.resolve(ctx.email?.campaignsClosed ?? null),
    offersUnread: () => Promise.resolve(ctx.email?.campaignsUnread ?? null),
    ...ctx.page ? { page: ctx.page } : {}
  };
}
function emailRequestPort(ctx, tenantId) {
  let mailbox;
  let said = false;
  return async (i) => {
    const domain = ctx.email?.domain;
    if (!domain) return null;
    const campaigns = ctx.email?.campaigns;
    if (i.offer && !campaigns) return null;
    mailbox ??= await mailboxOfTenant(ctx.db, tenantId);
    if (!mailbox) return null;
    try {
      const request = buildEmailRequest({
        identity: i.offer && campaigns ? campaignsIdentity(mailbox, campaigns.domain, domain) : hostedIdentity(mailbox, domain),
        to: i.to,
        parent: null,
        subject: i.subject,
        body: i.body,
        // The foot, where a signature goes: after the words, in the text and in the HTML. An offer's is a campaign's:
        // the one-click unsubscribe rides in its headers and its link in the foot (never the same words twice).
        signature: i.offer ? null : i.footer,
        ...i.offer ? { campaign: { unsubscribeUrl: i.offer.unsubscribeUrl, footer: i.footer, footerHtml: i.offer.footerHtml } } : {},
        // A program's email, sent on its own schedule: marked auto-generated, so an out-of-office does not answer it.
        actor: "ai",
        messageId: i.messageId,
        tenantId
      });
      return { ...request, tags: [...request.tags, { name: CAMPAIGN_EMAIL_TAG, value: "broadcast" }] };
    } catch (e) {
      if (!said) {
        said = true;
        sendLog.error("broadcast_email_request_failed", { tenant_id: tenantId, offer: !!i.offer, error: errField(e) });
      }
      return null;
    }
  };
}
function unsubscribeUrlPort(ctx, tenantId) {
  let said = false;
  return ({ messageId, contactId }) => {
    const c = ctx.email?.campaigns;
    if (!c) return Promise.resolve(null);
    try {
      const token = signUnsubscribeToken(c.unsubscribeSecret, { tenantId, contactId, messageId });
      return Promise.resolve(unsubscribeUrl(c.unsubscribeOrigin, token));
    } catch (e) {
      if (!said) {
        said = true;
        sendLog.error("broadcast_unsubscribe_unsigned", { tenant_id: tenantId, error: errField(e) });
      }
      return Promise.resolve(null);
    }
  };
}
function frozen(r) {
  return {
    ...r,
    to: [...r.to],
    reply_to: [...r.reply_to],
    headers: { ...r.headers },
    tags: r.tags.map((t) => ({ ...t }))
  };
}
function peoplePorts(ctx, tenantId) {
  const db = ctx.db;
  return {
    // On a database 00298 has not reached, a recipient has no channel and everyone goes by WhatsApp, as every run did
    // (packages/db queuedRecipients): code that ships before its migration must keep its broadcasts going.
    batch: (id, limit) => queuedRecipients(db, { tenantId, broadcastId: id, limit }),
    // The batch's people in one read, not one read per person.
    contacts: async (ids) => {
      const { data, error } = await db.from("contacts").select(
        "id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name, email, email_marketing"
      ).in("id", ids).eq("tenant_id", tenantId);
      if (error) throw new Error(`broadcast_send: cannot read the people: ${error.message}`);
      return new Map((data ?? []).map((c) => [c.id, c]));
    },
    // The appointments a visit run's reminders were drawn for, by the calendar's key (00348, decision 0002).
    appointments: (keys) => appointmentStates(db, tenantId, keys),
    // create: false — a broadcast never opens a contact. touch: false — the
    // door below still has to refuse some of these people, and a thread they
    // were not messaged in has nothing new in it.
    target: (phoneE164) => resolveOutboundTarget(db, { tenantId, phoneE164, create: false, touch: false }),
    // An email reaches the person by their address, so its thread is found by the person.
    targetOfContact: (contactId) => resolveOutboundTargetForContact(db, { tenantId, contactId, touch: false }),
    emailRequest: emailRequestPort(ctx, tenantId),
    unsubscribeUrl: unsubscribeUrlPort(ctx, tenantId),
    // The email, written queued under the id its request was frozen with, before it leaves (the door asks for the
    // row). Its row keeps the request as meta.email, as every email's does. A row already there is a resumed run's.
    // Written CLAIMED (sending_at, 00352), as sendQueued claims a reply's row before the wire: the batch holds this
    // person and puts the words on the wire next, and a call-back that asks `sending_at is null` (a member's
    // cancel-send, the clock's withdrawal) would otherwise win the row while the provider answers, and the person
    // would get the email under a row that said canceled for ever. A resumed run's row still queued is this run's (the
    // person's claim is the batch's one door), and takes the claim before it is read, unless it holds one already.
    queueEmail: async (row) => {
      const wrote = await insertQueuedEmail(db, {
        id: row.id,
        tenant_id: tenantId,
        conversation_id: row.conversationId,
        contact_id: row.contactId,
        channel: "email",
        direction: "outbound",
        sender: "human",
        type: "text",
        body: row.body,
        status: "queued",
        sending_at: (/* @__PURE__ */ new Date()).toISOString(),
        meta: {
          ...row.meta,
          email: { subject: row.request.subject, to: [...row.request.to], request: frozen(row.request) }
        }
      });
      if (wrote === "written") return { status: "queued" };
      await claimQueuedSend(db, tenantId, row.id);
      const there = await writtenEmail(db, { tenantId, id: row.id });
      if (!there) throw new Error(`broadcast_send: the email ${row.id} is taken and cannot be read`);
      return { status: there.status };
    },
    // The batch's own row, which it wrote claimed: the claim given back first (the provider did not take the email, or
    // the door threw before the wire), so the withdrawal that follows, which takes only a row no run holds, takes it.
    withdrawEmail: async (messageId) => {
      await releaseQueuedSend(db, tenantId, messageId);
      await withdrawEmail(db, { tenantId, id: messageId, reason: "not_taken" });
    },
    monthSent: (channel) => campaignMonthSent(db, tenantId, channel),
    // The messages a dying run left these people: written by deliver after the
    // wire accepted them, with this broadcast's id in their meta, read once for
    // the batch. It is the one check standing between a resumed run and a
    // second WhatsApp template to the same person, so a read that FAILED must
    // never come back as "no, they have not been messaged".
    alreadySent: async (id, contactIds) => {
      const rows = must(
        "broadcast_send: cannot check what the batch was already sent",
        await db.from("messages").select("id, contact_id, created_at").eq("tenant_id", tenantId).in("contact_id", contactIds).filter("meta->>broadcast_id", "eq", id).in("status", ["sent", "delivered", "read"])
      );
      const prior = /* @__PURE__ */ new Map();
      for (const m of rows ?? [])
        if (m.contact_id && !prior.has(m.contact_id)) prior.set(m.contact_id, { id: m.id, sentAt: m.created_at });
      return prior;
    },
    // Whether anyone on the run goes by email or text: what WhatsApp's template not being approved asks (core sendBroadcastBatch).
    byOtherChannels: (id, than) => runGoesByOthers(db, tenantId, id, than),
    mark: markPort(db, tenantId)
  };
}
function markPort(db, tenantId) {
  return async (id, contactId, patch) => {
    const sentAt = patch.sent_at ?? (patch.state === "sent" ? (/* @__PURE__ */ new Date()).toISOString() : null);
    const write = db.from("broadcast_recipients").update({ ...patch, sent_at: sentAt }).eq("tenant_id", tenantId).eq("broadcast_id", id).eq("contact_id", contactId);
    if (patch.state !== "failed" || patch.reason !== OUTCOME_UNKNOWN) {
      must("broadcast_send: cannot record how this person's send went", await write);
      return true;
    }
    const took = must(
      "broadcast_send: cannot claim this person",
      await write.eq("state", "queued").select("contact_id")
    );
    return (took ?? []).length > 0;
  };
}
async function broadcastSend(ctx, job) {
  const p = job.payload;
  const db = ctx.db;
  await sendBroadcastBatch(
    {
      broadcast: async (id) => {
        const { data, error } = await db.from("broadcasts").select("id, state, name, template_name, template_language, params, recipient_count, playbook_id, audience").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(`broadcast_send: cannot read broadcast ${id}: ${error.message}`);
        return withTemplate(data);
      },
      // The billing gate, so it fails CLOSED: a tenants row that cannot be read
      // is not a workspace that is paying. The one reading of it (packages/db workspacePaused), as the composers and the
      // approval ask.
      workspacePaused: () => workspacePaused(db, job.tenant_id),
      fail: async (id, failure) => {
        const moved = must(
          "broadcast_send: cannot mark the broadcast failed",
          await db.from("broadcasts").update({ state: "failed", failure, finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id).neq("state", "failed").select("id")
        );
        if (!moved?.length) return;
        const sent = await countRecipients(db, job.tenant_id, id, "sent").catch(() => null);
        await emitEvent(db, job.tenant_id, "broadcast.stopped", "broadcast", id, { failure, sent });
      },
      startSending: async (id) => {
        const rows = must(
          "broadcast_send: cannot start the broadcast",
          await db.from("broadcasts").update({ state: "sending", started_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id).eq("state", "scheduled").select("id")
        );
        return !!rows && rows.length > 0;
      },
      // The message is its rows of that name and language on every channel: WhatsApp's `category` is Meta's verdict on
      // what kind of message this is, and it decides which consent the send needs. A message that cannot be READ is not
      // one Meta withdrew: the read throws, where none would fail the whole broadcast and email the owner that WhatsApp
      // no longer approves it, which would be a lie about their Meta account told over a statement timeout.
      message: (name, language) => messageVersionRowsOf(db, job.tenant_id, { name, language }),
      facts: () => workspaceFacts(db, job.tenant_id),
      ...peoplePorts(ctx, job.tenant_id),
      // Offers by email go only where this runtime holds a verified campaigns domain (the edge binds it for this job). An
      // email is sent by the time this tick can still wait for it (ledger sendByAt), so one started late is bounded by
      // what is left of the function rather than by the wire's own, longer deadline.
      deliver: (d) => deliver({ db, wire: ctx.wire, emailOffers: !!ctx.email?.campaigns }, { ...d, sendBy: sendByAt(ctx.deadline) }),
      ...wirePorts(ctx),
      remaining: (id) => countRecipients(db, job.tenant_id, id, "queued"),
      // Read by the verb as "is this broadcast still wanted"; null is how a
      // cancel reads, so a failed read here would abandon a half-sent broadcast
      // with nothing scheduled, nothing failed and nobody told.
      state: async (id) => {
        const row = must(
          "broadcast_send: cannot read whether the broadcast is still wanted",
          await db.from("broadcasts").select("state").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle()
        );
        return row?.state ?? null;
      },
      scheduleNext: (id, dueAt, carry) => ctx.schedule("broadcast_send", dueAt ?? /* @__PURE__ */ new Date(), nextBatch(id, carry)),
      // This tally is written to the permanent record and read out to the owner,
      // so it is counted rather than tallied from a page of rows.
      tally: async (id) => {
        const [all, sent] = await Promise.all([
          countRecipients(db, job.tenant_id, id),
          countRecipients(db, job.tenant_id, id, "sent")
        ]);
        return { sent, held: all - sent };
      },
      // Counted, as the tally is: which of the workspace's holds on email the run skipped anyone for.
      heldForEmail: async (id) => {
        const counts = await Promise.all(
          EMAIL_HOLDS.map((reason) => countRecipients(db, job.tenant_id, id, "skipped", reason))
        );
        return EMAIL_HOLDS.filter((_, i) => (counts[i] ?? 0) > 0);
      },
      finish: async (id, tally) => {
        must(
          "broadcast_send: cannot close the broadcast",
          await db.from("broadcasts").update({ state: "sent", finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id).eq("state", "sending")
        );
        const told = await recordEvent(db, job.tenant_id, "broadcast.sent", "broadcast", id, tally);
        if (told.error) throw new Error(`broadcast_send: cannot record the broadcast's tally: ${told.error}`);
      },
      alert: ctx.alert,
      now: Date.now,
      sleep: (ms) => new Promise((res) => setTimeout(res, ms))
    },
    // A WhatsApp send or a text runs its wire's own timeout whole, so the batch starts one only while that still ends
    // inside the function (ledger startByAt); the people after it are the next batch's.
    {
      tenantId: job.tenant_id,
      broadcastId: p.broadcast_id,
      deadline: ctx.deadline,
      startBy: startByAt(ctx.deadline),
      ...carriedBy(p)
    }
  );
}
function nextBatch(id, carry) {
  return {
    broadcast_id: id,
    ...carry?.waits ? { waits: carry.waits } : {},
    ...carry?.stalls ? { stalls: carry.stalls } : {}
  };
}
function carriedBy(payload) {
  const p = payload !== null && typeof payload === "object" ? payload : {};
  const count = (n) => typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
  return { waits: count(p.waits), stalls: count(p.stalls) };
}
async function workspaceFacts(db, tenantId) {
  const [tenantRes, cfgRes] = await Promise.all([
    db.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle()
  ]);
  const tenantRow = must("broadcast_send: cannot read the workspace", tenantRes);
  const cfgRow = must("broadcast_send: cannot read the workspace's settings", cfgRes);
  const parsedCfg = parseTenantConfig(cfgRow?.config ?? null);
  const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";
  return {
    businessName,
    bookingLink: parsedCfg?.brain?.booking_link ?? null,
    timezone: tenantRow?.timezone || "UTC",
    // The postal address an email's foot gives, as the Business record keeps it; none, none.
    address: parsedCfg?.brain?.profile?.address?.trim() || null
  };
}

// src/reply-read.ts
import {
  DEFAULT_TIMEZONE,
  REACH_OUT_REPLY_DAYS,
  isReplyIntent,
  isUnread
} from "../../contracts/dist/index.js";
import { readReply } from "../../core/dist/index.js";
import {
  applyReplyReading,
  archiveConversation,
  claimReplyTell,
  markReplyDraft,
  markReplyTold,
  reachOutReplyOf,
  replyReadingOf,
  resolveEscalationByReason
} from "../../db/dist/index.js";
import { logger as logger4 } from "../../channels/dist/index.js";
function planJson(plan) {
  return { ...plan, step: plan.step ? { ...plan.step } : null };
}
function replyFactsOf(r) {
  return {
    conversationId: r.conversation_id,
    claim: r.claim,
    text: r.text,
    subject: r.subject,
    // The intake's bare from.address, as it kept it: a display-name form would suppress nothing (normalizeEmail).
    from: r.from,
    receivedAt: Date.parse(r.received_at),
    answered: r.answered_text,
    business: r.business,
    leadAddress: r.lead_email,
    leadWebsite: r.lead_website,
    leadWebsiteRoot: r.lead_website_root,
    signedBy: r.signed_by,
    tz: r.tz ?? DEFAULT_TIMEZONE
  };
}
function keptReadingOf(row) {
  if (!isReplyIntent(row.intent)) throw new Error(`reply_read: a reading says ${row.intent}`);
  if (row.unread !== null && !isUnread(row.unread))
    throw new Error(`reply_read: a reading was not read for ${row.unread}`);
  const plan = row.plan && typeof row.plan === "object" && !Array.isArray(row.plan) ? row.plan : {};
  if (!DRAFT_STATES.includes(row.draft_state))
    throw new Error(`reply_read: a draft is ${row.draft_state}`);
  return {
    intent: row.intent,
    summary: row.summary,
    unread: isUnread(row.unread) ? row.unread : null,
    // null is read; any other value refused above
    rereads: row.rereads,
    tell: plan.tell === true,
    told: row.told_at !== null,
    undone: row.undone_at !== null,
    draft: plan.draft === "answer" || plan.draft === "thanks" ? plan.draft : null,
    draftState: row.draft_state,
    // one of DRAFT_STATES, checked above
    draftText: row.draft
  };
}
var DRAFT_STATES = ["none", "waiting", "written", "not_written"];
function draftMarkOf(m) {
  if (m.state === "written") return { state: m.state, draft: m.draft, why: null };
  if (m.state === "not_written") return { state: m.state, draft: null, why: m.why };
  return { state: m.state, draft: null, why: null };
}
async function replyRead(ctx, job) {
  const replies = ctx.replies;
  if (!replies) throw new Error("reply_read: this runtime holds no reader");
  const messageId = typeof job.payload.message_id === "string" ? job.payload.message_id : "";
  if (!messageId) throw new Error("reply_read: payload.message_id is required");
  const { db } = ctx;
  const where = (tenantId, id) => ({ tenantId, messageId: id });
  const outcome = await readReply(
    {
      reply: async (tenantId, id) => {
        const r = await reachOutReplyOf(db, { ...where(tenantId, id), days: REACH_OUT_REPLY_DAYS });
        return r ? replyFactsOf(r) : null;
      },
      reading: async (tenantId, id) => {
        const row = await replyReadingOf(db, where(tenantId, id));
        return row ? keptReadingOf(row) : null;
      },
      mayRead: (tenantId, at) => replies.mayRead(tenantId, new Date(at)),
      ask: (system, user) => replies.ask(system, user, ctx.deadline, { tenantId: job.tenant_id, subjectId: messageId }),
      apply: (tenantId, id, p) => applyReplyReading(db, {
        ...where(tenantId, id),
        reading: {
          intent: p.reading.intent,
          summary: p.reading.summary,
          day: p.reading.day,
          refer_to: p.reading.referTo,
          unread: p.unread
        },
        plan: planJson(p.plan),
        reread: p.reread,
        days: REACH_OUT_REPLY_DAYS
      }),
      claimTell: (tenantId, id, staleBefore) => claimReplyTell(db, { ...where(tenantId, id), staleBefore: new Date(staleBefore) }),
      tell: (tenantId, notice) => replies.tell(tenantId, notice),
      draft: (tenantId, ask) => replies.draft(tenantId, ask),
      markDraft: (tenantId, id, mark) => markReplyDraft(db, { ...where(tenantId, id), ...draftMarkOf(mark) }),
      told: (tenantId, id, claim) => markReplyTold(db, { ...where(tenantId, id), claim }),
      scheduleOnce: (at, payload) => ctx.scheduleOnce("reply_read", new Date(at), payload),
      // What the intake opened, the reading closes: the flag by its reason, the thread whole, on the service role (the
      // platform's own close, so the rows are counted there rather than trusted).
      resolveEscalation: (tenantId, conversationId, reason) => resolveEscalationByReason(db, { tenantId, conversationId, reason }),
      archiveConversation: (tenantId, conversationId) => archiveConversation(db, { tenantId, conversationId }),
      now: Date.now
    },
    // A claim on the notice is stale once no run that could hold it is still alive: the lease less the function's
    // ceiling. A run is killed by the ceiling and the ledger takes its job back at the lease, so the try that follows a
    // run that died telling finds that run's claim stale, and a retry after a throw (two minutes, then ten) always does.
    {
      tenantId: job.tenant_id,
      messageId,
      stage: job.payload.stage,
      tellStaleMs: LEASE_SECONDS * 1e3 - FUNCTION_CEILING_MS,
      deadline: ctx.deadline
    }
  );
  logger4().info("reply_read", { tenant_id: job.tenant_id, job: job.id, outcome });
}

// src/booking-read.ts
import {
  DEFAULT_TIMEZONE as DEFAULT_TIMEZONE2,
  NOTICE_HOLD_WORDS,
  bookingNoticeOf,
  bookingToolName,
  isNoticeHold
} from "../../contracts/dist/index.js";
import {
  readBookingNotice
} from "../../core/dist/index.js";
import { emailPlainText, logger as logger5 } from "../../channels/dist/index.js";
import {
  appointmentByClientStart,
  appointmentByKey,
  appointmentNoticeOf,
  insertAppointment,
  keepAppointmentNotice,
  tenantZoneOf,
  updateAppointment,
  clearForwardingConfirmation,
  emitEvent as emitEvent2
} from "../../db/dist/index.js";
var STATUSES = ["proposed", "booked", "kept", "missed", "cancelled"];
var OUTCOMES = ["booked", "changed", "cancelled", "held", "dismissed"];
var isStatus = (v) => STATUSES.includes(v);
var isOutcome = (v) => OUTCOMES.includes(v);
async function sayBooking(db, p) {
  if (!p.appointmentId) return;
  const data = { source: "booking_email", tool: p.tool };
  if (p.outcome === "booked")
    await emitEvent2(db, p.tenantId, "appointment.booked", "appointment", p.appointmentId, data);
  if (p.outcome === "changed")
    await emitEvent2(db, p.tenantId, "appointment.moved", "appointment", p.appointmentId, data);
  if (p.outcome === "cancelled")
    await emitEvent2(db, p.tenantId, "appointment.cancelled", "appointment", p.appointmentId, data);
}
function stored(r) {
  if (!isStatus(r.status)) throw new Error(`booking_read: an appointment is ${r.status}`);
  return {
    id: r.id,
    status: r.status,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    external_id: r.external_id,
    contact_id: r.contact_id
  };
}
function ledgerOf(row) {
  if (!isOutcome(row.outcome)) throw new Error(`booking_read: a notice became ${row.outcome}`);
  if (row.hold_reason !== null && !isNoticeHold(row.hold_reason))
    throw new Error(`booking_read: a notice is held for ${row.hold_reason}`);
  return { outcome: row.outcome, holdReason: row.hold_reason, appointmentId: row.appointment_id };
}
function appointmentRowOf(a) {
  return {
    tenant_id: a.tenantId,
    source: "booking_email",
    tool: a.tool,
    external_id: a.externalId,
    status: a.status,
    starts_at: a.startsAt,
    ends_at: a.endsAt,
    service: a.service,
    staff: a.staff,
    price: a.price,
    note: a.note,
    client_name: a.client.name,
    client_phone: a.client.phone,
    client_email: a.client.email,
    contact_id: a.contactId,
    timezone: a.timezone
  };
}
function patchOf(p) {
  return {
    ...p.externalId !== void 0 ? { external_id: p.externalId } : {},
    ...p.status !== void 0 ? { status: p.status } : {},
    ...p.startsAt !== void 0 ? { starts_at: p.startsAt } : {},
    ...p.endsAt !== void 0 ? { ends_at: p.endsAt } : {},
    ...p.service !== void 0 ? { service: p.service } : {},
    ...p.staff !== void 0 ? { staff: p.staff } : {},
    ...p.price !== void 0 ? { price: p.price } : {},
    ...p.note !== void 0 ? { note: p.note } : {},
    ...p.client !== void 0 ? { client_name: p.client.name, client_phone: p.client.phone, client_email: p.client.email } : {},
    ...p.contactId !== void 0 ? { contact_id: p.contactId } : {}
  };
}
async function bookingRead(ctx, job) {
  const bookings = ctx.bookings;
  if (!bookings) throw new Error("booking_read: this runtime holds no reader");
  const email = ctx.email;
  if (!email) throw new Error("booking_read: this runtime holds no email provider");
  const receivedId = typeof job.payload.received_id === "string" ? job.payload.received_id : "";
  if (!receivedId) throw new Error("booking_read: payload.received_id is required");
  const { db } = ctx;
  const log = logger5({ tenant_id: job.tenant_id });
  const e = await email.fetch(receivedId);
  if (!e) {
    const tool = typeof job.payload.tool === "string" ? job.payload.tool : null;
    if (tool)
      await keepAppointmentNotice(db, {
        tenant_id: job.tenant_id,
        notice_id: receivedId,
        tool,
        from_address: null,
        subject: null,
        received_at: (/* @__PURE__ */ new Date()).toISOString(),
        outcome: "held",
        hold_reason: "gone",
        appointment_id: null
      });
    log.warn("booking_notice_held", { job: job.id, received_id: receivedId, tool, outcome: "gone" });
    return;
  }
  const text = emailPlainText(e);
  const notice = bookingNoticeOf({ from: e.from, subject: e.subject, text });
  if (!notice) {
    log.warn("booking_notice_held", { job: job.id, received_id: receivedId, outcome: "not_a_notice" });
    return;
  }
  const tz = await tenantZoneOf(db, job.tenant_id) ?? DEFAULT_TIMEZONE2;
  const outcome = await readBookingNotice(
    {
      mayRead: (tenantId, at) => bookings.mayRead(tenantId, new Date(at)),
      ask: (system, user) => bookings.ask(system, user, ctx.deadline, { tenantId: job.tenant_id, subjectId: receivedId }),
      noticeOf: async (tenantId, noticeId) => {
        const row = await appointmentNoticeOf(db, tenantId, noticeId);
        return row ? ledgerOf(row) : null;
      },
      keepNotice: async (p) => {
        await keepAppointmentNotice(db, {
          tenant_id: p.tenantId,
          notice_id: p.noticeId,
          tool: p.tool,
          from_address: p.fromAddress,
          subject: p.subject,
          received_at: p.receivedAt,
          outcome: p.outcome,
          hold_reason: p.holdReason,
          appointment_id: p.appointmentId
        });
        await sayBooking(db, p);
      },
      byKey: async (tenantId, key) => {
        const r = await appointmentByKey(db, tenantId, "booking_email", key);
        return r ? stored(r) : null;
      },
      byClientStart: async (tenantId, client, startMs, withinMs) => {
        const r = await appointmentByClientStart(db, tenantId, client, startMs, withinMs);
        return r ? stored(r) : null;
      },
      insert: (a) => insertAppointment(db, appointmentRowOf(a)),
      update: (tenantId, id, patch) => updateAppointment(db, tenantId, id, patchOf(patch)),
      personFor: bookings.personFor,
      now: Date.now
    },
    {
      tenantId: job.tenant_id,
      tz,
      tool: notice.tool,
      email: { id: e.id, from: e.from, subject: e.subject, text, receivedAt: e.createdAt }
    }
  ).catch(async (err) => {
    const refused = err?.code === "23514";
    if (!refused && (job.attempts ?? 1) < MAX_ATTEMPTS) throw err;
    const reason = refused ? "unreadable" : "no_model";
    await keepAppointmentNotice(db, {
      tenant_id: job.tenant_id,
      notice_id: receivedId,
      tool: notice.tool,
      from_address: e.from?.address ?? null,
      subject: e.subject,
      received_at: e.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      outcome: "held",
      hold_reason: reason,
      appointment_id: null
    });
    log.error("booking_notice_held", {
      job: job.id,
      received_id: receivedId,
      tool: notice.tool,
      outcome: refused ? "refused" : "failed",
      attempts: job.attempts ?? 1,
      error: err instanceof Error ? err.message : String(err)
    });
    return `held:${reason}`;
  });
  log.info(outcome.startsWith("held:") ? "booking_notice_held" : "booking_notice_read", {
    job: job.id,
    received_id: receivedId,
    tool: notice.tool,
    forwarded: notice.forwarded,
    outcome
  });
  if (outcome.startsWith("held:")) {
    const reason = outcome.slice("held:".length);
    if (reason !== "no_model" && reason !== "may_not_spend")
      await bookings.tell(job.tenant_id, {
        noticeId: receivedId,
        // The tool as the product says it ("Booksy"), the words the bell shows.
        tool: bookingToolName(notice.tool) ?? notice.tool,
        subject: e.subject,
        reason: NOTICE_HOLD_WORDS[isNoticeHold(reason) ? reason : "unreadable"]
      });
  } else if (outcome !== "already") {
    const mailboxId = typeof job.payload.mailbox_id === "string" ? job.payload.mailbox_id : null;
    if (mailboxId) await clearForwardingConfirmation(db, mailboxId).catch(() => void 0);
  }
}

// src/delivery-page.ts
function carried(payload, key) {
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const v = p[key];
  return typeof v === "string" && v ? v : "unknown";
}
function deliveryPageKey(job) {
  return `event_deliver_failed:${carried(job.payload, "subscriber")}`;
}
function deliveryPage(job, reason, wreckage = null) {
  const named2 = (key) => carried(job.payload, key);
  return {
    subject: "A change was not passed on to what reads it",
    body: [
      `The delivery of event ${named2("event_id")} (${named2("kind")}) to the ${named2("subscriber")} subscriber failed for good in workspace ${job.tenant_id}: ${reason}.`,
      wreckage,
      "The delivery row says what the subscriber was handed and why it stopped. The owner was not told: the fault is the platform's, not theirs. Newest first:\n\n  select event_id, subscriber, kind, state, attempts, last_error, updated_at from event_deliveries where state = 'failed' order by updated_at desc limit 20;",
      "Once the subscriber is mended, event_deliveries_redrive('<subscriber>') schedules every failed delivery of it again; an event the ledger no longer holds cannot be delivered, and its row stays failed as the record.",
      `Reference: job ${job.id} (event_deliver).`
    ].filter(Boolean).join("\n\n")
  };
}

// src/handlers.ts
async function outboundSend(ctx, job) {
  await sendQueued(
    {
      // maybeSingle() reports an absent row as `data: null` without an error,
      // so a read that failed and a message that is gone stay separable; the
      // verb turns the error into the job's loud failure.
      queued: async (id) => {
        const { data, error } = await ctx.db.from("messages").select("id, status, body, template_name, channel, sender, meta").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return null;
        const meta = data.meta;
        const request = meta?.email?.request;
        const own = meta?.email?.own_request;
        const leadId = meta?.reach_out?.lead_id;
        return {
          status: data.status,
          body: data.body,
          channel: data.channel,
          sender: data.sender,
          email: isEmailRequest(request) ? request : null,
          ownEmail: isEmailRequest(own) ? own : void 0,
          leadId: typeof leadId === "string" && leadId ? leadId : null
        };
      },
      purposeOf: (template) => templatePurpose(ctx.db, job.tenant_id, template),
      claim: (id) => claimQueuedSend2(ctx.db, job.tenant_id, id),
      release: (id) => releaseQueuedSend2(ctx.db, job.tenant_id, id),
      deliver: (d) => deliver2({ db: ctx.db, wire: ctx.wire }, d),
      escalate: (conversationId, reason, details) => upsertEscalation(ctx.db, job.tenant_id, conversationId, reason, details),
      alert: ctx.alert,
      ...ctx.page ? { page: ctx.page } : {},
      // The same send as a fresh row, through the same door a broadcast's next batch takes: this job completes, and
      // the ledger claims the new one when it is due. Said in the log, since the tick sees only a job done.
      retry: async (dueAt, payload) => {
        await ctx.schedule("outbound_send", dueAt, payload);
        logger6().warn("outbound_send_rescheduled", {
          tenant_id: job.tenant_id,
          job: job.id,
          message_id: payload.message_id,
          resumes: payload.resumes ?? null,
          due_at: dueAt.toISOString()
        });
      },
      now: Date.now
    },
    { tenantId: job.tenant_id, payload: job.payload }
  );
}
async function lineProvision(ctx, job) {
  await provisionLine(
    {
      ...ctx.provisionLine ? { provision: ctx.provisionLine } : {},
      // The saga stops between two provider calls at the job's deadline, and the rest is one more job of this kind.
      next: (payload) => ctx.schedule("line_provision", /* @__PURE__ */ new Date(), payload),
      deadline: ctx.deadline
    },
    { payload: job.payload }
  );
}
function incomingEmailOf(e) {
  return {
    id: e.id,
    from: e.from,
    to: e.to,
    cc: e.cc,
    subject: e.subject,
    text: emailPlainText2(e),
    messageId: e.messageId,
    inReplyTo: messageIdsIn(e.headers["in-reply-to"])[0] ?? null,
    references: messageIdsIn(e.headers.references),
    receivedAt: e.createdAt,
    claim: classifyReceived(e),
    attachments: e.attachments,
    senderAuthenticated: senderAuthenticated(e)
  };
}
async function emailIngest(ctx, job) {
  const email = ctx.email;
  if (!email) throw new Error("email_ingest: this runtime holds no email provider");
  const { db } = ctx;
  let senderChecks = null;
  const outcome = await ingestEmail(
    {
      mailbox: async (id) => {
        const m = await mailboxById(db, id);
        return m && m.tenant_id === job.tenant_id ? { id: m.id, tenant_id: m.tenant_id, address: `${m.local_part}@${email.domain}` } : null;
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
        await ctx.scheduleOnce("booking_read", /* @__PURE__ */ new Date(), { received_id: receivedId, mailbox_id: mailboxId, tool });
      },
      // Only the tool the workspace named is read as its bookings (config bookings.tool), read off what is stored: a
      // workspace that named none reads none, and a value the list does not know is none.
      bookingTool: async (tenantId) => {
        const stored2 = (await getTenantConfig(db, tenantId))?.config;
        const named2 = stored2?.bookings?.tool;
        return isBookingTool(named2) ? named2 : null;
      },
      // A forward by hand is trusted from a member of the workspace, once its sender is proved (member_has_address, 00345).
      memberAddress: (tenantId, address) => memberHasAddress(db, tenantId, address),
      // Gmail's confirmation of a forward here, kept on the mailbox for Settings to show (00345).
      keepForwarding: (mailboxId, p) => keepForwardingConfirmation(db, mailboxId, p),
      erasedBefore: email.erasedBefore,
      ours: (tenantId, rfcMessageId) => sentEmailWithMessageId(db, tenantId, rfcMessageId),
      record: (p) => ingestInboundEmail(db, p),
      escalate: (tenantId, conversationId, reason, details) => upsertEscalation(db, tenantId, conversationId, reason, details),
      tell: email.tell,
      // A reach-out's reply is read for what it means (Reach out Part 5): one reply_read per message, however often
      // this intake runs (jobs_reply_read_once), as this job's own tenant.
      reachOutReply: async (tenantId, messageId) => await reachOutReplyOf2(db, { tenantId, messageId, days: REACH_OUT_REPLY_DAYS2 }) !== null,
      readReply: async (_tenantId, messageId) => {
        await ctx.scheduleOnce("reply_read", /* @__PURE__ */ new Date(), { message_id: messageId });
      },
      markProcessed: (tenantId, messageId) => markProcessed(db, tenantId, messageId),
      received: (mailboxId, at) => stampMailboxReceived(db, mailboxId, at),
      now: Date.now
    },
    { payload: job.payload }
  );
  logger6().info("email_ingested", { tenant_id: job.tenant_id, job: job.id, outcome, sender_checks: senderChecks });
}
async function leadRoundStart(ctx, job) {
  if (!ctx.leads) throw new Error("lead_round_start: this runtime holds no lead pipeline");
  await ctx.leads.roundStart(ctx, job);
}
async function leadCollect(ctx, job) {
  if (!ctx.leads) throw new Error("lead_collect: this runtime holds no lead pipeline");
  await ctx.leads.collect(ctx, job);
}
async function leadCheck(ctx, job) {
  if (!ctx.leads) throw new Error("lead_check: this runtime holds no lead pipeline");
  await ctx.leads.check(ctx, job);
}
async function pushSend(ctx, job) {
  if (!ctx.push) throw new Error("push_send: this runtime holds no push transport");
  const id = String(job.payload.notification_id ?? "");
  if (!id) throw new Error("push_send: no notification named");
  const n = must(
    "push_send: cannot read the notification",
    await ctx.db.from("notifications").select("id, tenant_id, kind, title, body, route, recipient_user_id").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle()
  );
  if (!n) return;
  const readers = await membersPushedFor(ctx.db, {
    tenantId: job.tenant_id,
    userIds: n.recipient_user_id ? [n.recipient_user_id] : null,
    kind: n.kind
  });
  if (!readers.length) return;
  const devices = must(
    "push_send: cannot read the phones",
    await ctx.db.from("push_devices").select("token, user_id").in("user_id", readers)
  ) ?? [];
  if (!devices.length) return;
  const badges = await badgesFor(ctx, job.tenant_id, [...new Set(devices.map((d) => d.user_id))]);
  const receipts = await ctx.push.send(
    pushFor(
      n,
      devices.map((d) => ({ token: d.token, badge: badges.get(d.user_id) ?? 0 }))
    )
  );
  const gone = receipts.filter((r) => r.status === "error" && r.error === "DeviceNotRegistered").map((r) => r.to);
  if (gone.length) {
    try {
      await ctx.db.from("push_devices").delete().in("token", gone);
    } catch {
    }
  }
  const tickets = receipts.flatMap((r) => r.status === "ok" && r.id ? [{ id: r.id, to: r.to }] : []);
  if (tickets.length) {
    try {
      await ctx.schedule("push_receipts", new Date(Date.now() + PUSH_RECEIPTS_AFTER_MS), {
        tickets: tickets.map((t) => ({ id: t.id, to: t.to }))
      });
    } catch (e) {
      logger6().error("push_receipts_schedule_failed", {
        tenant_id: job.tenant_id,
        job: job.id,
        tickets: tickets.length,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
}
var READ_PAGE = 1e3;
var IN_BATCH = 100;
async function badgesFor(ctx, tenantId, readers) {
  const since = new Date(Date.now() - BELL_WINDOW_DAYS * 864e5).toISOString();
  const rows = [];
  for (let from = 0; ; from += READ_PAGE) {
    const page = must(
      "push_send: cannot read the bell",
      await ctx.db.from("notifications").select("id, created_at, recipient_user_id").eq("tenant_id", tenantId).gte("created_at", since).order("created_at", { ascending: true }).range(from, from + READ_PAGE - 1)
    ) ?? [];
    rows.push(...page);
    if (page.length < READ_PAGE) break;
  }
  const seen = must(
    "push_send: cannot read when the bell was opened",
    await ctx.db.from("notification_reads").select("user_id, seen_at").eq("tenant_id", tenantId).in("user_id", readers)
  ) ?? [];
  const marks = [];
  for (let i = 0; i < rows.length; i += IN_BATCH) {
    marks.push(
      ...must(
        "push_send: cannot read the bell's marks",
        await ctx.db.from("notification_marks").select("notification_id, user_id, read_at, dismissed_at").in("user_id", readers).in(
          "notification_id",
          rows.slice(i, i + IN_BATCH).map((r) => r.id)
        )
      ) ?? []
    );
  }
  const out = /* @__PURE__ */ new Map();
  for (const u of readers) {
    const mine = seen.find((s) => s.user_id === u);
    out.set(
      u,
      unreadFor(
        rows.filter((r) => isForReader(r, u)),
        mine?.seen_at ?? null,
        marks.filter((m) => m.user_id === u)
      )
    );
  }
  return out;
}
async function pushReceipts(ctx, job) {
  if (!ctx.push) throw new Error("push_receipts: this runtime holds no push transport");
  const raw = job.payload.tickets;
  const tickets = Array.isArray(raw) ? raw.flatMap(
    (t) => t && typeof t === "object" && typeof t.id === "string" && typeof t.to === "string" ? [{ id: t.id, to: t.to }] : []
  ) : [];
  if (!tickets.length) return;
  const receipts = await ctx.push.receipts(tickets.map((t) => t.id));
  const gone = tickets.filter((t) => receipts[t.id]?.error === "DeviceNotRegistered").map((t) => t.to);
  if (gone.length) {
    must(
      "push_receipts: cannot forget a phone that is gone",
      await ctx.db.from("push_devices").delete().in("token", [...new Set(gone)])
    );
  }
}
function deliveryNamed(payload) {
  const { event_id, subscriber, kind } = payload;
  return typeof event_id === "string" && typeof subscriber === "string" && typeof kind === "string" ? { eventId: event_id, subscriber, kind } : null;
}
function subscriberNamed(s) {
  return typeof s === "string" && EVENT_SUBSCRIBERS.some((known) => known === s);
}
async function eventDeliver(ctx, job) {
  const named2 = deliveryNamed(job.payload);
  if (!named2) throw new Error("event_deliver: the payload names no event, subscriber and kind");
  const row = await deliveryOf(ctx.db, job.tenant_id, named2.eventId, named2.subscriber);
  if (!row) throw new Error("event_deliver: the relay wrote no delivery for this job");
  const settle = (state, error) => settleDelivery(ctx.db, { tenantId: job.tenant_id, ...named2, state, attempts: row.attempts + 1, error });
  if (await subscriptionPaused(ctx.db, named2.kind, named2.subscriber)) {
    await settle("paused", null);
    return;
  }
  const event = await eventOfDelivery(ctx.db, job.tenant_id, named2.eventId);
  if (!event) {
    const why = "the ledger no longer holds the event";
    await settle("failed", why);
    logger6().error("event_deliver_event_gone", {
      tenant_id: job.tenant_id,
      job: job.id,
      event_id: named2.eventId,
      subscriber: named2.subscriber,
      kind: named2.kind
    });
    if (ctx.page) {
      try {
        const page = deliveryPage(job, why);
        await ctx.page(deliveryPageKey(job), page.subject, page.body);
      } catch (e) {
        logger6().error("job_page_failed", {
          tenant_id: job.tenant_id,
          job: job.id,
          kind: job.kind,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    return;
  }
  if (!subscriberNamed(named2.subscriber)) throw new Error(`event_deliver: no subscriber named ${named2.subscriber}`);
  const subscriber = SUBSCRIBERS[named2.subscriber];
  const ports = {
    bookedFromAppointment: (tenantId, appointmentId) => reachOutBookedFrom(ctx.db, tenantId, appointmentId)
  };
  try {
    await subscriber(event, ports);
  } catch (e) {
    await settle("failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
  await settle("done", null);
}
async function inboundAnswer(ctx, job) {
  if (!ctx.inbound) throw new Error("inbound_answer: this runtime holds no receptionist");
  await ctx.inbound.answer(job);
}
var HANDLERS = {
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
  inbound_answer: inboundAnswer
};
async function dispatchJob(ctx, job) {
  const handler = HANDLERS[job.kind];
  if (!handler) return "unknown_kind";
  if (job.kind === "event_deliver" && !subscriberNamed(job.payload.subscriber)) return "unknown_kind";
  await withRequestId(requestIdShaped(job.payload.request_id) ?? job.id, () => handler(ctx, job));
  return "done";
}

// src/settle.ts
import { isCampaignEmail } from "../../contracts/dist/index.js";
import { logger as logger7 } from "../../channels/dist/index.js";
import { emitEvent as emitEvent3, failQueuedSend } from "../../db/dist/index.js";
var NEVER_SENT = "the job that would have sent this never ran";
var EMAIL_UNFINISHED = "An email arrived and could not be taken in \u2014 the receptionist does not answer email, and this one did not finish being filed either. Read it here and reply from the Inbox.";
var MAY_HAVE_SENT = "the run that was sending this did not finish";
var MAILBOX_INTAKE_FAILED = "An email could not be taken in. Anything since then is in your Inbox as usual.";
function idFrom(payload, key) {
  if (typeof payload !== "object" || payload === null) return null;
  const v = payload[key];
  return typeof v === "string" ? v : null;
}
async function noteMailboxTrouble(db, tenantId, mailboxId) {
  if (!mailboxId) return {};
  const { data, error } = await db.from("mailboxes").update({ last_error: MAILBOX_INTAKE_FAILED }).eq("id", mailboxId).eq("tenant_id", tenantId).select("id");
  if (error) {
    logger7().error("mailbox_trouble_not_marked", { tenant_id: tenantId, mailbox_id: mailboxId, error: error.message });
    return { mailbox: "failed" };
  }
  return { mailbox: data && data.length > 0 ? "marked" : "gone" };
}
function resumesOf(payload) {
  if (typeof payload !== "object" || payload === null) return 0;
  const v = payload.resumes;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
async function howFar(db, tenantId, broadcastId) {
  const of = (state) => db.from("broadcast_recipients").select("contact_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("broadcast_id", broadcastId).eq("state", state);
  const [sent, queued] = await Promise.all([of("sent"), of("queued")]);
  const error = sent.error?.message ?? queued.error?.message;
  return { reached: sent.count ?? 0, remaining: queued.count ?? 0, ...error ? { error } : {} };
}
async function failBroadcast(db, job, broadcastId, why, far) {
  const { data, error } = await db.from("broadcasts").update({ state: "failed", failure: "run_interrupted", finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", broadcastId).eq("tenant_id", job.tenant_id).in("state", ["scheduled", "sending"]).select("id");
  if (error) return [{ what: "broadcast", changed: false, ...far, error: `${why}; then ${error.message}` }];
  if (!data?.length) return [{ what: "broadcast", changed: false, ...far }];
  await emitEvent3(db, job.tenant_id, "broadcast.stopped", "broadcast", broadcastId, {
    failure: "run_interrupted",
    sent: far.reached
  });
  return [{ what: "broadcast", changed: true, notResumed: why, ...far }];
}
async function settleJob(db, job, certain) {
  const reason = certain ? "never_delivered" : "run_interrupted";
  if (job.kind === "outbound_send") {
    const messageId = idFrom(job.payload, "message_id");
    if (!messageId) return [{ what: "message", changed: false, error: "no message_id on the job" }];
    const { row, error } = await failQueuedSend(db, {
      tenantId: job.tenant_id,
      messageId,
      error: { reason, note: certain ? NEVER_SENT : MAY_HAVE_SENT, ...certain ? {} : { outcome: "unknown" } }
    });
    const campaign = row?.channel === "email" && isCampaignEmail(row.meta?.email?.request);
    const flagged = !error && row?.conversation_id && !campaign ? await upsertEscalation(
      db,
      job.tenant_id,
      row.conversation_id,
      "send_failed",
      `${row.sender === "ai" ? "The receptionist's reply" : "A reply"} never left: ${certain ? NEVER_SENT : MAY_HAVE_SENT}.`
    ) : null;
    return [
      {
        what: "message",
        changed: !!row,
        ...flagged ? { flagged } : {},
        ...error ? { error } : {}
      }
    ];
  }
  if (job.kind === "email_ingest") {
    const receivedId = idFrom(job.payload, "received_id");
    if (!receivedId) return [{ what: "email", changed: false, error: "no received_id on the job" }];
    const mailbox = await noteMailboxTrouble(db, job.tenant_id, idFrom(job.payload, "mailbox_id"));
    const { data, error } = await db.from("messages").select("conversation_id").eq("tenant_id", job.tenant_id).eq("channel", "email").eq("external_id", receivedId).maybeSingle();
    if (error) return [{ what: "email", changed: false, ...mailbox, error: error.message }];
    const conversationId = data?.conversation_id ?? null;
    if (!conversationId) return [{ what: "email", changed: false, ...mailbox }];
    const flagged = await upsertEscalation(db, job.tenant_id, conversationId, "email_review", EMAIL_UNFINISHED);
    return [{ what: "email", changed: true, flagged, ...mailbox }];
  }
  if (job.kind === "broadcast_send") {
    const broadcastId = idFrom(job.payload, "broadcast_id");
    if (!broadcastId) return [{ what: "broadcast", changed: false, error: "no broadcast_id on the job" }];
    const { data: row, error: readErr } = await db.from("broadcasts").select("id, state").eq("id", broadcastId).eq("tenant_id", job.tenant_id).maybeSingle();
    if (readErr) return [{ what: "broadcast", changed: false, error: readErr.message }];
    if (!row || row.state !== "sending" && row.state !== "scheduled") return [{ what: "broadcast", changed: false }];
    const far = await howFar(db, job.tenant_id, broadcastId);
    if (far.error) return [{ what: "broadcast", changed: false, error: far.error }];
    const { reached, remaining } = far;
    const live = await db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", job.tenant_id).eq("kind", "broadcast_send").eq("payload->>broadcast_id", broadcastId).in("state", ["scheduled", "fired"]).neq("id", job.id);
    if (live.error) return [{ what: "broadcast", changed: false, reached, remaining, error: live.error.message }];
    if ((live.count ?? 0) > 0) return [{ what: "broadcast", changed: false, resumed: true, reached, remaining }];
    const resumes = resumesOf(job.payload);
    if (resumes >= MAX_RESUMES)
      return failBroadcast(db, job, broadcastId, `${resumes} fresh runs in a row did not finish`, {
        reached,
        remaining
      });
    try {
      await scheduleJob(db, {
        tenantId: job.tenant_id,
        kind: "broadcast_send",
        dueAt: /* @__PURE__ */ new Date(),
        payload: { ...nextBatch(broadcastId, carriedBy(job.payload)), resumes: resumes + 1 }
      });
      return [{ what: "broadcast", changed: true, resumed: true, reached, remaining }];
    } catch (e) {
      return failBroadcast(db, job, broadcastId, e instanceof Error ? e.message : String(e), { reached, remaining });
    }
  }
  return [];
}
function saySettled(results) {
  const lines = [];
  for (const r of results) {
    if (r.error) {
      lines.push(
        r.what === "message" ? `The message it was sending could not be updated (${r.error}), so it may still show as sending.` : r.what === "email" ? `The email it was taking in could not be flagged for a person (${r.error}), so look for it in the Inbox.` : `The broadcast could not be updated (${r.error}), so it may still show as sending.`
      );
    } else if (r.resumed) {
      lines.push(
        `The broadcast carries on in a fresh run: ${r.reached ?? 0} reached so far, ${r.remaining ?? 0} still to go. Anyone it already recorded as sent is skipped, not sent again.`
      );
    } else if (r.changed && r.notResumed) {
      lines.push(
        `The broadcast could not be handed to a fresh run (${r.notResumed}), so it has been marked failed; the ${r.reached ?? "people"} it had already reached still got it${typeof r.remaining === "number" ? `, and ${r.remaining} did not` : ""}.`
      );
    } else if (r.changed && r.what === "email") {
      lines.push("The email it was taking in is in the Inbox and flagged for a person, so nobody has to find it.");
    } else if (r.what === "email") {
      lines.push(
        r.mailbox === "marked" ? "The email it was taking in was never stored, so there is no thread to flag; the workspace's mailbox now says an email could not be taken in." : "The email it was taking in was never stored, so there is nothing to flag for a person."
      );
    } else if (r.changed) {
      lines.push(
        r.what === "message" ? "The message has been marked failed, so it is no longer shown as on its way." : `The broadcast has been marked failed; the ${r.reached ?? "people"} it had already reached still got it${typeof r.remaining === "number" ? `, and ${r.remaining} did not` : ""}.`
      );
    }
  }
  return lines.length ? lines.join(" ") : null;
}

// src/tick.ts
import { jittered as jittered2, jobNewsWords } from "../../contracts/dist/index.js";
var errText = (e) => e instanceof Error ? e.message : String(e);
function noteLate(c, job, now) {
  if (job.attempts !== 1) return;
  const late = Math.max(0, now - Date.parse(job.due_at));
  if (Number.isNaN(late)) return;
  c.lateMs[job.kind] = Math.max(c.lateMs[job.kind] ?? 0, late);
  if (job.lane === 0) c.replyLateMs = Math.max(c.replyLateMs, late);
}
function lateFields(lateMs) {
  return Object.fromEntries(Object.entries(lateMs).map(([kind, ms]) => [`late_ms_${kind}`, ms]));
}
async function runTick(ports, opts) {
  const started = opts.startedAt ?? ports.now();
  const deadlineFor = (kind) => started + (opts.yieldAtFor?.(kind) ?? opts.yieldAtMs);
  const c = { claimed: 0, done: 0, failed: 0, gaveUp: 0, deferred: 0, lateMs: {}, replyLateMs: 0 };
  const slots = Math.max(1, Math.floor(opts.slots ?? 1));
  const running = [];
  const halt = { stopped: false, error: null };
  const stop = (e) => {
    if (!halt.stopped) Object.assign(halt, { stopped: true, error: e });
  };
  const slot = async () => {
    for (let now = ports.now(); now - started < opts.claimForMs && !halt.stopped; now = ports.now()) {
      let job;
      try {
        job = await ports.claim(opts.leaseSeconds);
      } catch (e) {
        stop(e);
        return;
      }
      if (!job) return;
      try {
        c.claimed += 1;
        noteLate(c, job, now);
        const run = runOne(ports, job, deadlineFor(job.kind), c);
        if (running.length < slots) running.push(slot());
        await run;
      } catch (e) {
        stop(e);
        return;
      }
    }
  };
  running.push(slot());
  for (let i = 0; i < running.length; i += 1) await running[i];
  if (halt.stopped) throw halt.error;
  return c;
}
async function runOne(ports, job, deadline, c) {
  if (verdictFor(job) === "give_up") {
    await conclude(ports, job, RUN_INTERRUPTED, false, "unfinished");
    c.gaveUp += 1;
    return;
  }
  let outcome;
  try {
    outcome = await ports.dispatch(job, deadline);
  } catch (e) {
    const msg = errText(e);
    const wait = retryWait(job, ports.random);
    if (wait !== null) {
      const until = await keepForLater(ports, job, wait, (untilIso) => ports.defer(job, untilIso, msg));
      if (until) ports.log.warn("job_deferred", keptFields(job, until, msg));
      c.deferred += 1;
      return;
    }
    await conclude(ports, job, msg, false, "failed");
    c.failed += 1;
    return;
  }
  if (outcome === "unknown_kind") {
    const reason = `unknown job kind ${job.kind}`;
    if (!(ports.now() - Date.parse(job.due_at) >= UNKNOWN_KIND_GIVE_UP_MS)) {
      const wait = jittered2(UNKNOWN_KIND_WAIT_MS, ports.random);
      const until = await keepForLater(ports, job, wait, (untilIso) => ports.deferUnknown(job, untilIso, reason));
      if (until) ports.log.warn("job_kind_unknown_deferred", keptFields(job, until, reason));
      c.deferred += 1;
      return;
    }
    await conclude(ports, job, reason, true, "unknown_kind");
    c.failed += 1;
    return;
  }
  try {
    if (await ports.complete(job)) c.done += 1;
    else ports.log.warn("job_complete_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
  } catch (e) {
    ports.log.error("job_complete_write_failed", { job_id: job.id, kind: job.kind, error: errText(e) });
  }
}
async function keepForLater(ports, job, wait, write) {
  const untilIso = new Date(ports.now() + wait).toISOString();
  try {
    if (await write(untilIso)) return untilIso;
    ports.log.warn("job_defer_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
  } catch (d) {
    ports.log.error("job_defer_write_failed", { job_id: job.id, kind: job.kind, error: errText(d) });
  }
  return null;
}
var keptFields = (job, until, why) => ({
  job_id: job.id,
  tenant_id: job.tenant_id,
  kind: job.kind,
  attempts: job.attempts,
  until,
  error: why
});
async function conclude(ports, job, reason, certain, end) {
  let failed;
  try {
    failed = await ports.fail(job, reason);
  } catch (e) {
    ports.log.error("job_fail_write_failed", { job_id: job.id, kind: job.kind, error: errText(e) });
    return;
  }
  if (!failed) {
    ports.log.warn("job_fail_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
    return;
  }
  let wreckage;
  let resumed;
  try {
    const settled = await ports.settle(job, certain);
    resumed = settled.some((s) => s.resumed === true && !s.error);
    for (const s of settled) {
      if (s.error) ports.log.error("job_settle_failed", { job_id: job.id, what: s.what, error: s.error });
      else if (s.notResumed)
        ports.log.warn("broadcast_not_resumed", { job_id: job.id, tenant_id: job.tenant_id, reason: s.notResumed });
    }
    wreckage = saySettled(settled);
  } catch (e) {
    ports.log.error("job_settle_failed", { job_id: job.id, error: errText(e) });
    resumed = null;
    wreckage = "What it was in the middle of could not be checked, so a message or broadcast may still show as sending.";
  }
  ports.log.info("job_failed", {
    job_id: job.id,
    tenant_id: job.tenant_id,
    kind: job.kind,
    attempts: job.attempts,
    reason
  });
  if (PAGES_THE_PLATFORM.has(job.kind)) {
    try {
      const page = deliveryPage(job, reason, wreckage);
      await ports.page(deliveryPageKey(job), page.subject, page.body);
    } catch (e) {
      ports.log.error("job_page_failed", { job_id: job.id, kind: job.kind, error: errText(e) });
    }
  }
  if (TOLD_ELSEWHERE.has(job.kind)) return;
  try {
    const words = jobNewsWords(job.kind, end, { attempts: job.attempts, resumed });
    const reference = `Reference: job ${job.id} (${job.kind}): ${reason}.`;
    await ports.alert(job, {
      kind: "job_failed",
      route: words.to,
      subject: words.title,
      body: [words.lead, wreckage, reference].filter(Boolean).join("\n\n")
    });
  } catch (e) {
    ports.log.error("job_alert_failed", { job_id: job.id, error: errText(e) });
  }
}
export {
  CLAIM_FOR_MS,
  CLAIM_SLOTS,
  FUNCTION_CEILING_MS,
  LEAD_YIELD_AT_MS,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  MAX_RESUMES,
  RELAY_LIMIT,
  REPLY_LATE_PAGE_MS,
  RETRY_WAITS_MS,
  RUN_INTERRUPTED,
  SPEAKS_TO_A_PERSON,
  YIELD_AT_MS,
  cancelJobsFor,
  claimNext,
  completeJob,
  deferJob,
  dispatchJob,
  failJob,
  incomingEmailOf,
  lateFields,
  markSpoke,
  requeueFailedJob,
  retryWait,
  runTick,
  saySettled,
  scheduleJob,
  scheduleJobOnce,
  settleJob,
  upsertEscalation,
  verdictFor
};
