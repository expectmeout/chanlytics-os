/**
 * The broadcast_send job: one chunk of a run's recipients, counted and sent. Moved whole from handlers.ts (Reach out
 * Part 2.5), which re-exports its public names.
 */
import {
  buildEmailRequest,
  campaignsIdentity,
  errField,
  hostedIdentity,
  logger,
  signUnsubscribeToken,
  unsubscribeUrl,
  type EmailRequest,
} from "@chanlytics/channels";
import { CAMPAIGN_EMAIL_TAG, EMAIL_HOLDS, OUTCOME_UNKNOWN, parseTenantConfig } from "@chanlytics/contracts";
import {
  deliver,
  isWireUnavailable,
  sendBroadcastBatch,
  type BatchCarry,
  type BroadcastBatchPorts,
  type Channel,
} from "@chanlytics/core";
import {
  type Database,
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
  writtenEmail,
} from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ClaimedJob, type JobContext, must } from "./context";
import { sendByAt, startByAt } from "./ledger";

/** The broadcast_send job's own lines, by name: an email it could not build or sign for a person. */
const sendLog = logger();

/**
 * How many of a broadcast's people are in one state, or in any state at all.
 *
 * A COUNT, never a page of rows: PostgREST caps a plain select at `max_rows`
 * (1000, supabase/config.toml) and a broadcast may carry BROADCAST_MAX_RECIPIENTS
 * of them, so counting by reading the rows silently undercounts exactly the
 * broadcasts big enough for the number to matter.
 */
async function countRecipients(
  db: SupabaseClient<Database>,
  tenantId: string,
  broadcastId: string,
  state?: string,
  reason?: string,
): Promise<number> {
  let q = db
    .from("broadcast_recipients")
    .select("contact_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("broadcast_id", broadcastId);
  if (state) q = q.eq("state", state);
  if (reason) q = q.eq("reason", reason);
  const { count, error } = await q;
  if (error) throw new Error(`broadcast_send: cannot count ${state ?? "all"} recipients: ${error.message}`);
  return count ?? 0;
}

/**
 * A run as the batch sends it: with its template, or not at all. Only a reach-out's hand step's run has none (00228),
 * and it sends nothing, so it is never this job's.
 */
function withTemplate<T extends { template_name: string | null; template_language: string | null }>(
  row: T | null,
): (T & { template_name: string; template_language: string }) | null {
  if (!row) return null;
  const { template_name, template_language } = row;
  return template_name && template_language ? { ...row, template_name, template_language } : null;
}

/**
 * Why the tick could not bind this channel's wire for this tenant (the credentials read failed on the edge), or null. A
 * wire that is null is a number that carries none, and the door's to refuse.
 */
function wireUnbound(ctx: JobContext, channel: Channel): string | null {
  const wire = ctx.wire[channel];
  return isWireUnavailable(wire) ? wire.error : null;
}

/**
 * The wire's ports: why a channel's wire could not be bound, whether offers by email are closed on this runtime (the edge
 * says so when the deployment names a campaigns domain the provider does not verify), and the platform's pager when this
 * runtime holds one.
 */
function wirePorts(
  ctx: JobContext,
): Pick<BroadcastBatchPorts, "wireUnavailable" | "offersClosed" | "offersUnread" | "page"> {
  return {
    wireUnavailable: async (channel) => wireUnbound(ctx, channel),
    offersClosed: () => Promise.resolve(ctx.email?.campaignsClosed ?? null),
    offersUnread: () => Promise.resolve(ctx.email?.campaignsUnread ?? null),
    ...(ctx.page ? { page: ctx.page } : {}),
  };
}

/**
 * The hosted mailbox's email as one person's frozen request (channels buildEmailRequest): From the workspace's address
 * on the deployment's mail domain, Reply-To its reply route, so a reply lands in the Inbox, with the foot after the
 * body. Null with no mailbox or no mail domain, and for words no email may carry (a first email posing as a reply). An
 * appointment message carries no unsubscribe. An OFFER (`offer`) leaves from the same mailbox on the campaigns domain, with
 * the same Reply-To, the one-click unsubscribe headers and its foot (which carries the link) in HTML; with no campaigns domain
 * bound to this runtime it is null, and the person is held, never sent from the domain replies use.
 */
function emailRequestPort(ctx: JobContext, tenantId: string): BroadcastBatchPorts["emailRequest"] {
  let mailbox: Awaited<ReturnType<typeof mailboxOfTenant>> | undefined;
  // The same words fail every person of a batch alike: said once for the batch, with the error, so the hold has its reason.
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
        identity:
          i.offer && campaigns ? campaignsIdentity(mailbox, campaigns.domain, domain) : hostedIdentity(mailbox, domain),
        to: i.to,
        parent: null,
        subject: i.subject,
        body: i.body,
        // The foot, where a signature goes: after the words, in the text and in the HTML. An offer's is a campaign's:
        // the one-click unsubscribe rides in its headers and its link in the foot (never the same words twice).
        signature: i.offer ? null : i.footer,
        ...(i.offer
          ? { campaign: { unsubscribeUrl: i.offer.unsubscribeUrl, footer: i.footer, footerHtml: i.offer.footerHtml } }
          : {}),
        // A program's email, sent on its own schedule: marked auto-generated, so an out-of-office does not answer it.
        actor: "ai",
        messageId: i.messageId,
        tenantId,
      });
      // A campaign's email, whether or not it carries an unsubscribe: its bounce or a run that died is the campaign's to
      // count, never a reply that failed (contracts isCampaignEmail).
      return { ...request, tags: [...request.tags, { name: CAMPAIGN_EMAIL_TAG, value: "broadcast" }] };
    } catch (e) {
      // Words no email may carry, or a request the builder refused: the person is held (no_channel), and the log says why.
      if (!said) {
        said = true;
        sendLog.error("broadcast_email_request_failed", { tenant_id: tenantId, offer: !!i.offer, error: errField(e) });
      }
      return null;
    }
  };
}

/**
 * The link that unsubscribes one person from one offer, sealed under the secret the edge bound with the campaigns domain
 * (channels signUnsubscribeToken: the workspace, the person and the email): the page every offer's foot and List-Unsubscribe
 * carry, made the way a reach-out's is. Null where this runtime holds none.
 */
function unsubscribeUrlPort(ctx: JobContext, tenantId: string): BroadcastBatchPorts["unsubscribeUrl"] {
  let said = false;
  return ({ messageId, contactId }) => {
    const c = ctx.email?.campaigns;
    if (!c) return Promise.resolve(null);
    try {
      const token = signUnsubscribeToken(c.unsubscribeSecret, { tenantId, contactId, messageId });
      return Promise.resolve(unsubscribeUrl(c.unsubscribeOrigin, token));
    } catch (e) {
      // An offer with no link out is never sent, so the person is held (no_channel): said once for the batch, with the
      // error, never hidden (a secret the edge cannot seal with is the first suspect).
      if (!said) {
        said = true;
        sendLog.error("broadcast_unsubscribe_unsigned", { tenant_id: tenantId, error: errField(e) });
      }
      return Promise.resolve(null);
    }
  };
}

/**
 * A request as the row's JSON: the request is data all the way down (channels isEmailRequest reads it back from the
 * row), copied so what the row keeps is what was frozen.
 */
function frozen(r: EmailRequest) {
  return {
    ...r,
    to: [...r.to],
    reply_to: [...r.reply_to],
    headers: { ...r.headers },
    tags: r.tags.map((t) => ({ ...t })),
  };
}

/**
 * The people a batch sends to, and what is written for each: who is still queued, the people themselves, their thread (by
 * their number, or for an email by the person), the email's frozen request and its queued row, what a dying run already
 * sent them, the month's allowance spent, and how each one's send went. One workspace's, over this runtime's database.
 */
function peoplePorts(
  ctx: JobContext,
  tenantId: string,
): Pick<
  BroadcastBatchPorts,
  | "batch"
  | "contacts"
  | "appointments"
  | "feed"
  | "target"
  | "targetOfContact"
  | "emailRequest"
  | "unsubscribeUrl"
  | "queueEmail"
  | "withdrawEmail"
  | "monthSent"
  | "alreadySent"
  | "byOtherChannels"
  | "mark"
> {
  const db = ctx.db;
  const calendar = ctx.calendar;
  return {
    // On a database 00298 has not reached, a recipient has no channel and everyone goes by WhatsApp, as every run did
    // (packages/db queuedRecipients): code that ships before its migration must keep its broadcasts going.
    batch: (id, limit) => queuedRecipients(db, { tenantId, broadcastId: id, limit }),
    // The batch's people in one read, not one read per person.
    contacts: async (ids) => {
      const { data, error } = await db
        .from("contacts")
        .select(
          "id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name, email, email_marketing",
        )
        .in("id", ids)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(`broadcast_send: cannot read the people: ${error.message}`);
      return new Map((data ?? []).map((c) => [c.id, c]));
    },
    // The appointments a visit run's reminders were drawn for, by the calendar's key (00348, decision 0002).
    appointments: (keys) => appointmentStates(db, tenantId, keys),
    // And the owner's calendar feed beside it, which is newer than the record by up to the hourly sweep (S1-05): the edge
    // reads it (kept five minutes); a runtime without one sends on the record alone.
    ...(calendar ? { feed: () => calendar.feedNames(tenantId, new Date()) } : {}),
    // create: false — a broadcast never opens a contact. touch: false — the
    // door below still has to refuse some of these people, and a thread they
    // were not messaged in has nothing new in it.
    target: (phoneE164) => resolveOutboundTarget(db, { tenantId: tenantId, phoneE164, create: false, touch: false }),
    // An email reaches the person by their address, so its thread is found by the person.
    targetOfContact: (contactId) =>
      resolveOutboundTargetForContact(db, { tenantId: tenantId, contactId, touch: false }),
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
        sending_at: new Date().toISOString(),
        meta: {
          ...row.meta,
          email: { subject: row.request.subject, to: [...row.request.to], request: frozen(row.request) },
        },
      });
      if (wrote === "written") return { status: "queued" };
      await claimQueuedSend(db, tenantId, row.id);
      const there = await writtenEmail(db, { tenantId: tenantId, id: row.id });
      if (!there) throw new Error(`broadcast_send: the email ${row.id} is taken and cannot be read`);
      return { status: there.status };
    },
    // The batch's own row, which it wrote claimed: the claim given back first (the provider did not take the email, or
    // the door threw before the wire), so the withdrawal that follows, which takes only a row no run holds, takes it.
    withdrawEmail: async (messageId) => {
      await releaseQueuedSend(db, tenantId, messageId);
      await withdrawEmail(db, { tenantId: tenantId, id: messageId, reason: "not_taken" });
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
        await db
          .from("messages")
          .select("id, contact_id, created_at")
          .eq("tenant_id", tenantId)
          .in("contact_id", contactIds)
          .filter("meta->>broadcast_id", "eq", id)
          .in("status", ["sent", "delivered", "read"]),
      );
      // created_at is written by the same statement that records the send, so
      // it is when the message left, which is what the recipient's row wants.
      const prior = new Map<string, { id: string; sentAt: string | null }>();
      for (const m of rows ?? [])
        if (m.contact_id && !prior.has(m.contact_id)) prior.set(m.contact_id, { id: m.id, sentAt: m.created_at });
      return prior;
    },
    // Whether anyone on the run goes by email or text: what WhatsApp's template not being approved asks (core sendBroadcastBatch).
    byOtherChannels: (id, than) => runGoesByOthers(db, tenantId, id, than),
    mark: markPort(db, tenantId),
  };
}

/**
 * One person's row, written. `sent_at` comes from the patch when the caller knows it — a resumed run reading the message
 * a dying run left knows when it actually went out, and stamping "now" instead would reorder the broadcast's own page.
 *
 * The CLAIM (failed, outcome_unknown: the row the guard 00182 treats as one) is a compare-and-set: it takes the person
 * only while they are still queued, and answers whether it did. Two runs that overlap cannot both claim, and so both
 * send, the same person; the one that lost leaves them to the other. Every other write answers true.
 */
function markPort(db: SupabaseClient<Database>, tenantId: string): BroadcastBatchPorts["mark"] {
  return async (id, contactId, patch) => {
    const sentAt = patch.sent_at ?? (patch.state === "sent" ? new Date().toISOString() : null);
    const write = db
      .from("broadcast_recipients")
      .update({ ...patch, sent_at: sentAt })
      .eq("tenant_id", tenantId)
      .eq("broadcast_id", id)
      .eq("contact_id", contactId);
    if (patch.state !== "failed" || patch.reason !== OUTCOME_UNKNOWN) {
      must("broadcast_send: cannot record how this person's send went", await write);
      return true;
    }
    const took = must(
      "broadcast_send: cannot claim this person",
      await write.eq("state", "queued").select("contact_id"),
    );
    return (took ?? []).length > 0;
  };
}

/** broadcast_send: core's sendBroadcastBatch, over this runtime's ports. payload: { broadcast_id } */

export async function broadcastSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const p = job.payload as { broadcast_id: string; waits?: unknown; stalls?: unknown };
  const db = ctx.db;
  await sendBroadcastBatch(
    {
      broadcast: async (id) => {
        const { data, error } = await db
          .from("broadcasts")
          .select("id, state, name, template_name, template_language, params, recipient_count, playbook_id, audience")
          .eq("id", id)
          .eq("tenant_id", job.tenant_id)
          .maybeSingle();
        if (error) throw new Error(`broadcast_send: cannot read broadcast ${id}: ${error.message}`);
        return withTemplate(data);
      },
      // The billing gate, so it fails CLOSED: a tenants row that cannot be read
      // is not a workspace that is paying. The one reading of it (packages/db workspacePaused), as the composers and the
      // approval ask.
      workspacePaused: () => workspacePaused(db, job.tenant_id),
      fail: async (id, failure) => {
        // Not over a run already failed: two chains of one run (settle.ts names the case) each meeting a stop would write
        // its reason twice and its event twice. The first stop is the run's.
        const moved = must(
          "broadcast_send: cannot mark the broadcast failed",
          await db
            .from("broadcasts")
            .update({ state: "failed", failure, finished_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", job.tenant_id)
            .neq("state", "failed")
            .select("id"),
        );
        if (!moved?.length) return;
        // On the ledger beside the finished runs (broadcast.sent), best effort: the owner's alert comes next, and a count
        // that cannot be read is said as none rather than stop the run from saying why it stopped.
        const sent = await countRecipients(db, job.tenant_id, id, "sent").catch(() => null);
        await emitEvent(db, job.tenant_id, "broadcast.stopped", "broadcast", id, { failure, sent });
      },
      startSending: async (id) => {
        const rows = must(
          "broadcast_send: cannot start the broadcast",
          await db
            .from("broadcasts")
            .update({ state: "sending", started_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", job.tenant_id)
            .eq("state", "scheduled")
            .select("id"),
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
      deliver: (d) =>
        deliver({ db, wire: ctx.wire, emailOffers: !!ctx.email?.campaigns }, { ...d, sendBy: sendByAt(ctx.deadline) }),
      ...wirePorts(ctx),
      remaining: (id) => countRecipients(db, job.tenant_id, id, "queued"),
      // Read by the verb as "is this broadcast still wanted"; null is how a
      // cancel reads, so a failed read here would abandon a half-sent broadcast
      // with nothing scheduled, nothing failed and nobody told.
      state: async (id) => {
        const row = must(
          "broadcast_send: cannot read whether the broadcast is still wanted",
          await db.from("broadcasts").select("state").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle(),
        );
        return row?.state ?? null;
      },
      scheduleNext: (id, dueAt, carry) => ctx.schedule("broadcast_send", dueAt ?? new Date(), nextBatch(id, carry)),
      // This tally is written to the permanent record and read out to the owner,
      // so it is counted rather than tallied from a page of rows.
      tally: async (id) => {
        const [all, sent] = await Promise.all([
          countRecipients(db, job.tenant_id, id),
          countRecipients(db, job.tenant_id, id, "sent"),
        ]);
        return { sent, held: all - sent };
      },
      // Counted, as the tally is: which of the workspace's holds on email the run skipped anyone for.
      heldForEmail: async (id) => {
        const counts = await Promise.all(
          EMAIL_HOLDS.map((reason) => countRecipients(db, job.tenant_id, id, "skipped", reason)),
        );
        return EMAIL_HOLDS.filter((_, i) => (counts[i] ?? 0) > 0);
      },
      finish: async (id, tally) => {
        must(
          "broadcast_send: cannot close the broadcast",
          await db
            .from("broadcasts")
            .update({ state: "sent", finished_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", job.tenant_id)
            .eq("state", "sending"),
        );
        const told = await recordEvent(db, job.tenant_id, "broadcast.sent", "broadcast", id, tally);
        if (told.error) throw new Error(`broadcast_send: cannot record the broadcast's tally: ${told.error}`);
      },
      alert: ctx.alert,
      now: Date.now,
      sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
    },
    // A WhatsApp send or a text runs its wire's own timeout whole, so the batch starts one only while that still ends
    // inside the function (ledger startByAt); the people after it are the next batch's.
    {
      tenantId: job.tenant_id,
      broadcastId: p.broadcast_id,
      deadline: ctx.deadline,
      startBy: startByAt(ctx.deadline),
      ...carriedBy(p),
    },
  );
}

/** What the run has waited through rides in the payload to the next batch, and only while it is running. */
export function nextBatch(id: string, carry: BatchCarry | undefined): Record<string, string | number> {
  return {
    broadcast_id: id,
    ...(carry?.waits ? { waits: carry.waits } : {}),
    ...(carry?.stalls ? { stalls: carry.stalls } : {}),
  };
}

/** What this batch's job carries of the run so far: how many waits, how many stalls; anything but a count is none. */
export function carriedBy(payload: unknown): Required<BatchCarry> {
  const p: { waits?: unknown; stalls?: unknown } = payload !== null && typeof payload === "object" ? payload : {};
  const count = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0);
  return { waits: count(p.waits), stalls: count(p.stalls) };
}

/**
 * The workspace's own words for the slots that name it, and the zone its sending hours are kept by. An empty business
 * name is not a fallback: it resolves to an empty slot, and the verb marks everyone in the batch permanently
 * "missing_value". An unreadable zone reads as UTC where the hours are judged (contracts playbook-schedule).
 */
async function workspaceFacts(
  db: JobContext["db"],
  tenantId: string,
): Promise<{ businessName: string; bookingLink: string | null; timezone: string; address: string | null }> {
  const [tenantRes, cfgRes] = await Promise.all([
    db.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
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
    address: parsedCfg?.brain?.profile?.address?.trim() || null,
  };
}
