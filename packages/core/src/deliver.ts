/**
 * deliver(): the one door a message leaves through.
 *
 * Four sequences used to put words on a wire, each assembled by hand: the
 * outbox job asked "opted out?" and nothing about the thread, the broadcast
 * asked the one predicate with the template's purpose and then checked the
 * pause, the voice booking link asked a gate of its own, and the webhook's
 * reply is the statement order of a 300-line function. They disagreed about
 * the pause and about marketing consent, and the disagreements were the
 * defects: a promotional template reaching someone who had said yes to
 * appointments and no to offers; a held draft firing under the owner's own
 * words.
 *
 * This is the door for the first three, and the shape the fourth grows into.
 * It RE-READS the facts at the wire -- the person's consent, the thread's
 * pause, the workspace's status -- because the moment before the send is the
 * one place a stale answer cannot be taken back. It knows nothing about who
 * should be told when a send fails: it returns what happened, and the caller
 * (a job with an owner to alert, a broadcast with a recipient to mark, a
 * voice agent with a caller waiting) says so in its own words.
 *
 * Every send NAMES ITS PURPOSE. A template's purpose is what Meta says it is
 * (purposeOfTemplate fails closed to marketing); words in a conversation are
 * conversational. A send is PROACTIVE when it starts a conversation rather
 * than answering one, and that decides whether a recorded yes is needed for
 * conversational words at all.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  smsRefusalOf,
  addressOf,
  logger,
  errField,
  type SendResult,
  type EmailRequest,
  type ResendLimit,
} from "@chanlytics/channels";
import {
  CARRIER_CONSENT_SOURCE,
  mailboxDailyCap,
  mailboxSendsNow,
  isAutomatedSend,
  isEmailStopped,
  isOfferByEmail,
  mayMessageFor,
  outreachRefusalOf,
  purposeOfTemplate,
  type DeliveryRefusal,
  type MessageAbout,
  type SendPurpose,
} from "@chanlytics/contracts";
import {
  emailOffersPause,
  emitEvent,
  outreachFactsOf,
  stampEmailFromMailbox,
  stampEmailLeftAs,
  recordCarrierOptOut,
  recordOutbound,
  replyAnswersAt,
  textLineFacts,
  wireRowOf,
  type Database,
  type EventData,
  type Json,
} from "@chanlytics/db";
import { assertFrozenFor, offerFacts, offerRefusal, type OfferFacts } from "./deliver-email";
import { heldByThread, lateDraft } from "./deliver-hold";
import { textRefusal } from "./deliver-text";
import { namedFailure, putOnWire, type WireUnavailable } from "./wire-senders";

export type { DeliveryRefusal };

/** The send door's own lines: what it could not write after a send, by name, in the request (or job) it ran for. */
const deliverLog = logger();

export type Db = SupabaseClient<Database>;
type MessagePatch = Database["public"]["Tables"]["messages"]["Update"];

export type Channel = "whatsapp" | "sms" | "email";

/**
 * What a send IS, for the door's rules -- never read off `sender`, which is a
 * fact about who wrote the words and is recorded as such.
 *  - "reply": a person's own words in a conversation; every pause exists for
 *    them, so none holds it.
 *  - "draft": the receptionist's held reply, queued; a person speaking since
 *    retires it, as does the reply horizon passing; the pause it now meets does not.
 *  - "broadcast": proactive and automated; it respects every pause like the
 *    machine it is.
 *  - "system": words the rules require of us -- an opt-in confirmation naming
 *    the program, HELP and STOP; a held thread does not hold them, a paused
 *    workspace does.
 *  - "answer": the receptionist answering now; every pause holds it.
 */
export type SendKind = "reply" | "draft" | "broadcast" | "system" | "answer";

export interface TemplateSend {
  name: string;
  language: string;
  params: string[];
}

export interface WirePayload {
  body: string;
  template?: TemplateSend;
  /**
   * The request an email leaves as, built and frozen when the message was
   * queued (channels email/request.ts). Present on the email wire and nowhere else.
   */
  email?: EmailRequest;
  /** The send's purpose, on the email wire: only outreach may take a connected mailbox's route (emailSender). */
  purpose?: SendPurpose;
  /** A person's reply (the door's kindOf), the one other send that may leave by a connected mailbox: by its twin below. */
  reply?: boolean;
  /**
   * A person's reply to a reach-out, frozen a second time on the connected mailbox the chain wrote from (G15): it
   * leaves by that mailbox's route when the route still holds it, and as `email` on the hosted mailbox otherwise (N5).
   */
  ownEmail?: EmailRequest;
  /**
   * The most the wire may take to answer, in ms, from the moment the send is put on it (Delivery.sendBy, worked out at the
   * wire). The email wire bounds its tries by it (channels sendEmail); absent, by its own deadline alone.
   */
  deadlineMs?: number;
  /**
   * The thread the words are for (Delivery.conversationId). A wire that holds more than one number reads which of them
   * the person last wrote to by it (the job runner's WhatsApp wire); every other ignores it.
   */
  conversationId?: string;
}

/** How to put words on one channel's wire. Owns its own address format. */
export type Sender = (to: string, p: WirePayload) => Promise<SendResult>;

/**
 * The wires one workspace has. `undefined`: this runtime has no such
 * channel at all. `null`: the channel exists but this workspace holds no
 * credentials or line for it -- refused here, never guessed from the
 * environment, which is how one business's message left on another's line.
 * A WireUnavailable: the channel may well be this workspace's, but its
 * credentials could not be read just now -- nothing is sent, nothing is
 * failed, and the caller tries again later.
 */
export type Wire = Partial<Record<Channel, Sender | null | WireUnavailable>>;

export interface Delivery {
  tenantId: string;
  conversationId: string;
  contactId: string | null;
  /** Where it goes: E.164 (with or without the "+") on a phone's wire, the person's stored address on email's. Each wire shapes it. */
  to: string;
  channel: Channel;
  sender: "ai" | "human" | "system";
  purpose: SendPurpose;
  /** True when this send starts a conversation rather than answering one. */
  proactive: boolean;
  /**
   * What the message is about (contracts MessageAbout, decision D1): theirs (a visit they booked, their proposal, the
   * call they are on, a thread they wrote in) or ours (a broadcast, a moment's news). By email, ours asks for a yes
   * covering email or a relationship on record; theirs asks no yes. Required: a sender says which.
   */
  about: MessageAbout;
  /**
   * The playbook moment a broadcast's run was made for (contracts audienceTrigger), null for any other send: only the
   * day-before reminder passes the thread's 24-hour pause (contracts passesHandoverPause, decision D4). Required, as
   * `about` is: a sender says which, so a new one cannot forget the moment and have its reminder held.
   */
  trigger: string | null;
  body: string;
  template?: TemplateSend;
  /** The frozen request, on the email wire (WirePayload.email). */
  email?: EmailRequest;
  /**
   * A person's reply to a reach-out, frozen again on the connected mailbox the chain wrote from (WirePayload.ownEmail):
   * it may leave by that mailbox only as a reply (kindOf), and under the same row's id as `email`.
   */
  ownEmail?: EmailRequest;
  /**
   * The lead a cold email was written for (a reach-out's always names one): outreach's facts are that lead's, so a
   * business closed or archived is refused even when its person has another lead still being written to.
   */
  leadId?: string | null;
  /**
   * An outbox row already written as `queued` (the honest undo): finalized
   * in place rather than inserted, and only while it is still queued, so a
   * cancel that wins the row is never overwritten.
   */
  messageId?: string | null;
  /** What this send is, for the rules (SendKind). Absent, the door derives it the way it always read `sender`: see kindOf. */
  kind?: SendKind;
  /**
   * The call this send is made on, by the provider's id for it (the hold's control_ref, as the inbound door took it):
   * that call's own hold on the thread does not refuse it (deliver-hold.ts). Absent for every send not made mid-call.
   */
  onCall?: string | null;
  /** Recorded on a row this call writes. */
  meta?: Record<string, Json>;
  /**
   * A caller that will try again (sendQueued): a send the provider provably did not take (outcome `retryable`) throws
   * NotTakenError before anything is written, and the row stays queued. Without it, it fails as any refusal does.
   */
  holdIfNotTaken?: boolean;
  /**
   * Epoch ms: the latest moment the provider's answer may still be waited for. A caller that runs inside a function with
   * a ceiling (a broadcast's batch: jobs sendByAt) says when the send must be over by, so one started late is bounded by
   * what is left rather than by the wire's own deadline, which is longer than the time a late start has. An email that
   * runs out of it settles as `failed` with an unknown outcome (the provider may have taken it), as any timeout does.
   */
  sendBy?: number;
}

/** The policy a send goes under: as declared, or as the door always derived it from who wrote the words. */
function kindOf(d: Delivery): SendKind {
  // A cold email is a broadcast whoever wrote its words and whatever its caller names it: the workspace's pause, the
  // thread's and a live hold all stop it. Read from `sender`, a row a person had edited would pass as their reply; read
  // from a caller's `kind`, "reply" or "system" would skip the pauses (Part 2.6).
  if (d.purpose === "outreach") return "broadcast";
  if (d.kind) return d.kind;
  if (d.sender === "human") return d.proactive ? "broadcast" : "reply";
  return d.messageId ? "draft" : "answer";
}

export type Delivered =
  | { outcome: "sent"; messageId: string | null; externalId: string | null }
  | { outcome: "refused"; reason: DeliveryRefusal; messageId: string | null }
  | {
      outcome: "failed";
      /** Ours: no wire for the channel, no credentials for it, the provider said no, or the facts could not be read. */
      reason: "no_sender_for_channel" | "no_credentials" | "provider" | "wire_unreadable";
      status: number;
      errorBody: string | null;
      messageId: string | null;
      /** A mail provider's refusal for a limit of its own (channels resendLimitOf), named at the wire; email only. */
      limit?: ResendLimit;
      /**
       * WhatsApp said "not now" before it took the message (channels graphThrottled), named at the wire. Nothing left,
       * so the caller may try this person again later; a failure without it may have been taken all the same.
       */
      throttled?: true;
      /** The provider may have taken it all the same (provider-fetch outcome unknown): nobody sends it again blind. */
      mayHaveGone?: true;
    };

export interface DeliverPorts {
  db: Db;
  wire: Wire;
  /** Whether this deployment can send an OFFER by email now (its campaigns domain is verified: the edge says it). Absent: no. */
  emailOffers?: boolean;
  /** Epoch ms; injected so the pause is testable. */
  now?: () => number;
}

interface WireFacts {
  pausedUntil: string | null;
  /**
   * Who is SPEAKING on this thread right now, and until when (00132); for a call, which one (`ref`, its control_ref).
   *
   * Not `assignee_user_id`, which says who is responsible and may outlive the
   * exchange -- reading that as a live hold is how a thread taken over and
   * never handed back refused the receptionist's drafts for ever. A hold
   * expires; responsibility does not, and neither does the escalation that
   * keeps the thread in somebody's queue.
   */
  control: { kind: string; ref: string | null; until: string } | null;
  /** The person this thread is with, as the thread says: what outreach asks the leads about. */
  contactId: string | null;
  contact: {
    consent: string | null;
    dnc: boolean | null;
    marketing_consent: string | null;
    /**
     * The channels each yes covers (consent-channels.ts; the database keeps them by each consent event). Null, or absent
     * from the answer of a database 00297 has not reached (wireRowOf): WhatsApp alone.
     */
    consent_channels?: string[] | null;
    marketing_channels?: string[] | null;
    /** Email's own answer (00174): opted_out once they pressed Unsubscribe. */
    email_marketing: string | null;
    has_relationship?: boolean | null; // wrote, called or has a deal (00299): the way into an offer by email; absent: none
    erased_at: string | null;
    erasing_since: string | null;
    /** The address on file now, and whether it has stopped being sent to (00125, 00126). */
    email: string | null;
    email_suppressed_at: string | null;
  };
  tenantStatus: string | null;
  /** The texting line a text leaves on (db textLineFacts); read for a text alone, null for every other send. */
  smsLine: Awaited<ReturnType<typeof textLineFacts>>;
  offers: OfferFacts; // what an offer by email asks of the deployment and the workspace (deliver-email.ts)
}

/**
 * The facts the wire re-reads, in one query: the thread's pause, the person's
 * consent row, and the workspace's status. A read that fails throws, because
 * "we could not check" is not "yes" -- the outbox retries, the broadcast
 * leaves the person queued, and the voice agent says it could not send.
 */
async function wireFacts({ db, emailOffers }: DeliverPorts, d: Delivery): Promise<WireFacts> {
  // Read again without the channel arrays on a database 00297 has not reached (wireRowOf): a yes then covers WhatsApp alone.
  // The sends that may rest on a relationship with the business: an offer by email, which is also the business's news (D1, D2).
  const { data, error } = await wireRowOf(db, {
    tenantId: d.tenantId,
    conversationId: d.conversationId,
    relationship: isOfferByEmail(d),
  });
  if (error) throw new Error(`deliver: cannot read the wire for conversation ${d.conversationId}: ${error.message}`);
  if (!data) throw new Error(`deliver: no conversation ${d.conversationId} in workspace ${d.tenantId}`);
  const row = data as unknown as {
    paused_until: string | null;
    control_kind?: string | null;
    control_ref?: string | null;
    control_until?: string | null;
    contact_id?: string | null;
    contacts: WireFacts["contact"] | null;
    tenants: { status: string | null } | null;
  };
  return {
    pausedUntil: row.paused_until ?? null,
    control:
      row.control_kind && row.control_until
        ? { kind: row.control_kind, ref: row.control_ref ?? null, until: row.control_until }
        : null,
    contactId: row.contact_id ?? null,
    contact: row.contacts ?? {
      consent: null,
      dnc: null,
      marketing_consent: null,
      consent_channels: null,
      marketing_channels: null,
      email_marketing: null,
      erased_at: null,
      erasing_since: null,
      email: null,
      email_suppressed_at: null,
    },
    tenantStatus: row.tenants?.status ?? null,
    smsLine: d.channel === "sms" ? await textLineFacts(db, d.tenantId) : null,
    offers: await offerFacts(d, emailOffers, () => emailOffersPause(db, d.tenantId)),
  };
}

/** What a cold email's own rules ask, read only for one (Reach out). */
interface OutreachFacts {
  /** The stage of the lead that points at this person, the one still being written to first; null when none does. */
  leadStage: string | null;
  /** The address is on the workspace's never-again list: unsubscribed, complained, or erased. */
  suppressed: boolean;
  /**
   * The person wrote to the business in words of their own, on any channel or from another address in answer to an
   * email sent to them, or phoned it: a conversation now, never cold again (00181).
   */
  wroteBack: boolean;
  /** An automatic out-of-office whose day is still ahead (00226): the chain waits for it. */
  away: boolean;
  /** Its owner stopped writing to this lead (00241): the email is skipped. */
  stopped: boolean;
  /** The request carries RFC 8058's one-click unsubscribe, both headers. */
  unsubscribable: boolean;
  /**
   * The workspace's connected mailbox the request's From is (decision 0056), with its day: its state, its provider's
   * rest, its owner's cap, its customer domain, the days it has sent (D15) and what left from it in the rolling day.
   * Null when the From is none of its mailboxes.
   */
  mailbox: {
    state: string;
    resting_until: string | null;
    daily_cap: number;
    customer_domain: boolean;
    sent_days: number;
    sent_today: number;
  } | null;
}

/**
 * The facts outreach adds, in one question to the database (00424 outreach_mailbox_facts), and only for an outreach
 * email: a conversational send never pays for it. A read that fails throws, as wireFacts does: "we could not check" is
 * not "yes".
 */
async function outreachFacts(db: Db, d: Delivery, f: WireFacts): Promise<OutreachFacts> {
  const headers = d.email?.headers ?? {};
  const unsubscribable =
    !!headers["List-Unsubscribe"] && headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click";
  const from = addressOf(d.email?.from)?.address ?? null;
  if (!f.contactId)
    return {
      leadStage: null,
      suppressed: false,
      wroteBack: false,
      away: false,
      stopped: false,
      unsubscribable,
      mailbox: null,
    };
  let facts;
  try {
    facts = await outreachFactsOf(db, {
      tenantId: d.tenantId,
      contactId: f.contactId,
      to: d.to,
      // A From that cannot be read names no mailbox: the lead is still asked, and the door refuses the mailbox.
      from: from ?? "",
      leadId: d.leadId ?? null,
    });
  } catch (e) {
    throw new Error(`deliver: ${e instanceof Error ? e.message : String(e)} (conversation ${d.conversationId})`, {
      cause: e,
    });
  }
  // The whole address, as the wire will hold it (emailSender): the database found the mailbox by it.
  const own = facts.mailbox && facts.mailbox.address === from ? facts.mailbox : null;
  return {
    leadStage: facts.lead_stage,
    suppressed: facts.suppressed,
    wroteBack: facts.wrote_back,
    away: facts.away,
    stopped: facts.stopped,
    unsubscribable,
    mailbox: own,
  };
}

/** Why the door is shut for this send, or null when it may go. */
function refusalFor(d: Delivery, f: WireFacts, nowMs: number, o: OutreachFacts | null): DeliveryRefusal | null {
  // A person who asked to be forgotten is never messaged, whatever the row
  // that survived says -- from the moment they asked (erasing_since, written
  // before anything is destroyed), not only once the erasure finished.
  if (f.contact.erased_at || f.contact.erasing_since) return "erased";
  // A cold message goes by email and nothing else: a phone's lines are registered, and consented, for people who
  // wrote to the business, never for businesses it found.
  if (d.purpose === "outreach" && d.channel !== "email") return "outreach_is_email_only";
  // What a text carries and leaves on: no promotion, and only a line the carriers approved (deliver-text.ts).
  const text = d.channel === "sms" ? textRefusal(d.purpose, f.smsLine) : null;
  if (text) return text;
  if (d.channel === "email") {
    // An offer by email goes only where the deployment, the workspace and the email allow it (deliver-email.ts).
    const offer = offerRefusal(d, f.offers);
    if (offer) return offer;
    // A permanent bounce, a complaint or the provider's own list: a fact about
    // the address, kept apart from any one message's delivery (00126).
    if (isEmailStopped(f.contact)) return "email_suppressed";
    // The request was frozen for one address. If the person's address on file
    // is no longer that one -- corrected, removed -- these words were approved
    // for somewhere they should no longer go: canceled, and written again.
    if (f.contact.email !== d.to) return "recipient_changed";
  }
  // Consent outranks everything, asked with this message's own purpose.
  // A yes covers the channels it was given for: asked on the channel this message goes out on (consent-channels.ts).
  const begins = d.kind === "reply" && d.proactive; // a person's own message that is a start (messages/send.ts)
  const asked = { proactive: d.proactive, channel: d.channel, about: d.about, begins };
  const may = mayMessageFor(f.contact, d.purpose, asked);
  if (!may.ok) return may.reason;
  // Outreach's own rules, after the person's no and before any pause: only to a business the finder found, only with
  // the one-click unsubscribe the large mailbox providers require, only from a mailbox the business connected and
  // that sends now (decision 0056), never from the hosted address every workspace's replies share.
  if (d.purpose === "outreach") {
    if (!o) throw new Error(`deliver: an outreach email is judged with its facts (conversation ${d.conversationId})`);
    // The lead's own facts, in the one mapping the reach-out clock also asks before it claims a send.
    const lead = outreachRefusalOf({
      leadStage: o.leadStage,
      suppressed: o.suppressed,
      wroteBack: o.wroteBack,
      away: o.away,
      stopped: o.stopped,
    });
    if (lead) return lead;
    if (!o.unsubscribable) return "outreach_without_unsubscribe";
    if (!o.mailbox) return "outreach_needs_own_mailbox";
    if (!mailboxSendsNow(o.mailbox, nowMs)) return "sending_mailbox_not_ready";
    // The day's share is the mailbox's (contracts mailboxDailyCap). The writer claims within it; this is the backstop,
    // so a run that miscounts cannot spend a mailbox's reputation past its share.
    if (o.mailbox.sent_today >= mailboxDailyCap(o.mailbox)) return "sending_mailbox_at_cap";
  }
  const kind = kindOf(d);
  // A person's own reply goes out even when the machine is told to stop: the
  // pause exists for them, and a paused workspace may still answer by hand.
  // A broadcast is a person's words too, but it is proactive and automated,
  // and it respects the pause like the machine it is.
  if (kind === "reply") return null;
  if (f.tenantStatus === "paused") return "paused";
  return heldByThread(d, f, nowMs, kind);
}

/**
 * A person spoke after this draft was written. A held reply exists so a
 * human can get there first; the fact is a newer human message on the
 * thread, and the draft is retired, never sent. Asked only of a draft that
 * sits in the outbox, which is the only kind that can be overtaken. A
 * broadcast's row is a person's words too, but not a person speaking on this
 * thread: it retires nothing.
 */
async function overtakenByHuman(db: Db, d: Delivery): Promise<string | null> {
  const { data: mine, error: mineErr } = await db
    .from("messages")
    .select("created_at")
    .eq("id", d.messageId!)
    .eq("tenant_id", d.tenantId)
    .maybeSingle();
  if (mineErr) throw new Error(`deliver: cannot read message ${d.messageId}: ${mineErr.message}`);
  if (!mine) return null;
  const { data: newer, error } = await db
    .from("messages")
    .select("id, meta")
    .eq("conversation_id", d.conversationId)
    .eq("tenant_id", d.tenantId)
    .eq("direction", "outbound")
    .eq("sender", "human")
    .gt("created_at", mine.created_at)
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error(`deliver: cannot read the thread for ${d.messageId}: ${error.message}`);
  // A campaign's email is no person speaking on this thread, whatever its row says wrote the words: a broadcast's, and
  // a reach-out's (written queued, and perhaps refused at this door, in a thread the receptionist is drafting in).
  // Which sends those are is said once (contracts isAutomatedSend, with its SQL twin).
  const spoke = (newer ?? []).find((m) => !isAutomatedSend(m.meta));
  return spoke ? spoke.id : null;
}

/** Asked last (deliver): how late a draft would be, the message it answers read only then (db replyAnswersAt). */
async function draftTooLate(db: Db, d: Delivery, nowMs: number): Promise<DeliveryRefusal | null> {
  return kindOf(d) === "draft" ? lateDraft(d, await replyAnswersAt(db, d), nowMs, kindOf(d)) : null;
}

/** The message kinds the send door writes. */
type MessageKind = "message.send_blocked" | "message.send_raced_cancel" | "message.sent" | "message.send_failed";

/** The same writer every other event goes through: a failed insert is logged there, never dropped. */
function event<K extends MessageKind>(
  db: Db,
  d: Delivery,
  kind: K,
  messageId: string | null,
  data: EventData[K],
): Promise<void> {
  return emitEvent(db, d.tenantId, kind, "message", messageId, data);
}

/** The thread stamped with the send, as recordOutbound stamps it on the row it writes. */
async function stampThread(db: Db, d: Delivery, nowMs: number): Promise<void> {
  const { error } = await db
    .from("conversations")
    .update({ last_message_at: new Date(nowMs).toISOString() })
    .eq("id", d.conversationId)
    .eq("tenant_id", d.tenantId);
  if (error)
    deliverLog.error("deliver_stamp_failed", {
      tenant_id: d.tenantId,
      conversation_id: d.conversationId,
      error: error.message,
    });
}

/**
 * Finalize an outbox row that is still queued. Zero rows means a cancel won
 * it first; a write that FAILED throws, because "the row did not change" and
 * "the row could not be changed" are different facts, and reading the second
 * as the first left a sent message queued for ever under a false race event.
 */
/**
 * What a mailbox kept of an email it sent (decision 0056), on its row: the Message-ID a reply will cite and the thread
 * the sync reads by, which no receipt brings later. The words already left, so a write that fails is logged, never
 * thrown.
 */
async function fromMailbox(db: Db, d: Delivery, sent: SendResult): Promise<void> {
  if (!sent.email || !d.messageId) return;
  await stampEmailFromMailbox(db, {
    tenantId: d.tenantId,
    messageId: d.messageId,
    providerId: sent.wamid,
    rfcMessageId: sent.email.messageId,
    threadId: sent.email.threadId,
    mailboxId: sent.email.mailboxId,
  }).catch((e: unknown) => {
    deliverLog.error("deliver_mailbox_stamp_failed", {
      tenant_id: d.tenantId,
      message_id: d.messageId,
      error: errField(e),
    });
  });
}

/**
 * How a person's reply left (G15, N5), on its row: the words already left, so a write that fails is logged, never
 * thrown, the way a failed finalize is.
 */
async function leftAs(db: Db, d: Delivery, sent: SendResult): Promise<void> {
  if (!sent.leftAs) return;
  const why = sent.leftAsWhy ?? null;
  await stampEmailLeftAs(db, { tenantId: d.tenantId, messageId: d.messageId!, leftAs: sent.leftAs, why }).catch(
    (e: unknown) => {
      deliverLog.error("deliver_left_as_failed", {
        tenant_id: d.tenantId,
        message_id: d.messageId,
        error: errField(e),
      });
    },
  );
}

async function finalizeQueued(db: Db, d: Delivery, patch: MessagePatch): Promise<boolean> {
  const { data, error } = await db
    .from("messages")
    .update(patch)
    .eq("id", d.messageId!)
    .eq("status", "queued")
    .select("id");
  if (error) throw new Error(`deliver: cannot finalize message ${d.messageId}: ${error.message}`);
  return !!data && data.length > 0;
}

export async function deliver(ports: DeliverPorts, d: Delivery): Promise<Delivered> {
  assertFrozenFor(d);
  const nowMs = (ports.now ?? Date.now)();
  const facts = await wireFacts(ports, d);
  const outreach = d.purpose === "outreach" && d.channel === "email" ? await outreachFacts(ports.db, d, facts) : null;

  const refusal = refusalFor(d, facts, nowMs, outreach);
  const overtakenBy = !refusal && kindOf(d) === "draft" ? await overtakenByHuman(ports.db, d) : null;
  const reason = refusal ?? (overtakenBy ? "superseded_by_human" : await draftTooLate(ports.db, d, nowMs));
  // A queued row is canceled with its reason, so the thread shows why the
  // words never left; a send with no row yet leaves none, and the caller
  // records the refusal where it lives (a recipient's row, a spoken reply).
  // The event says the person's consent as the door read it -- or, for a
  // refusal that changed it (the carrier's, below), as it is now.
  const refuse = async (
    why: DeliveryRefusal,
    now: Partial<WireFacts["contact"]> = {},
    said: Record<string, Json> = {},
  ): Promise<Delivered> => {
    if (d.messageId) {
      const contact = { ...facts.contact, ...now };
      await finalizeQueued(ports.db, d, { status: "canceled", error: { reason: why } });
      await event(ports.db, d, "message.send_blocked", d.messageId, {
        reason: why,
        purpose: d.purpose,
        consent: contact.consent,
        dnc: contact.dnc,
        marketing_consent: contact.marketing_consent,
        ...(d.purpose === "outreach" || d.purpose === "marketing" ? { email_marketing: contact.email_marketing } : {}),
        ...(overtakenBy ? { after: overtakenBy } : {}),
        ...said,
      });
    }
    return { outcome: "refused", reason: why, messageId: d.messageId ?? null };
  };
  if (reason) return refuse(reason);

  const sent = await putOnWire(ports.wire, d, kindOf(d) === "reply", ports.now);

  // The carrier's own no, on the person's behalf (channels smsRefusalOf:
  // Twilio 21610, the recipient replied STOP to this number before we heard --
  // the STOP went to the carrier, or came before the line's webhook pointed
  // here). The number is unreachable whatever our row says, so the row is
  // brought to agree with the carrier, the way ingest records a STOP it did
  // hear, and the send is the refusal a recorded no is: the row canceled with
  // its reason, nothing escalated, and the next send to this person refused by
  // the predicate before the provider is asked. It used to be a failure like
  // any other: the owner told a delivery failed, nothing recorded, and every
  // later send to that person failing and telling them again.
  if (!sent.ok && d.channel === "sms" && smsRefusalOf(sent) === "opted_out") {
    if (facts.contactId)
      await recordCarrierOptOut(ports.db, { tenantId: d.tenantId, contactId: facts.contactId, channel: d.channel });
    return refuse("opted_out", { consent: "opted_out", dnc: true }, { source: CARRIER_CONSENT_SOURCE });
  }

  if (sent.ok) {
    if (d.messageId) {
      // The text is already gone, so the row must say `sent` -- but a cancel
      // that won the row between the send and this write is the signal, not
      // something to overwrite silently. A write that failed is neither: the
      // words left, so it is logged with the wamid and the send still reported.
      const marked = await finalizeQueued(ports.db, d, {
        status: "sent",
        ...(sent.wamid ? { external_id: sent.wamid } : {}),
      }).catch((e: unknown) => {
        deliverLog.error("deliver_finalize_failed", {
          tenant_id: d.tenantId,
          message_id: d.messageId,
          wamid: sent.wamid,
          error: errField(e),
        });
        return null;
      });
      await Promise.all([
        marked === false
          ? event(ports.db, d, "message.send_raced_cancel", d.messageId, { wamid: sent.wamid })
          : Promise.resolve(),
        // A cold email leaves its thread where it was: the Inbox reads the latest hundred threads, and a run of cold
        // sends would push every customer off it. The thread rises when the business writes back.
        d.purpose === "outreach" ? Promise.resolve() : stampThread(ports.db, d, nowMs),
        event(ports.db, d, "message.sent", d.messageId, { sender: d.sender }),
        leftAs(ports.db, d, sent),
        fromMailbox(ports.db, d, sent),
      ]);
      return { outcome: "sent", messageId: d.messageId, externalId: sent.wamid };
    }
    // recordOutbound stamps the thread and writes message.sent itself. The
    // words are already gone, so a row that cannot be written is logged and
    // the send still reported: a caller that took "not recorded" for "not
    // sent" would send them again.
    const messageId = await recordOutbound(ports.db, {
      tenantId: d.tenantId,
      conversationId: d.conversationId,
      contactId: d.contactId,
      sender: d.sender,
      type: d.template ? "template" : "text",
      body: d.body,
      channel: d.channel,
      externalId: sent.wamid,
      status: "sent",
      meta: d.meta ?? {},
    }).catch((e: unknown) => {
      deliverLog.error("deliver_record_failed", {
        tenant_id: d.tenantId,
        conversation_id: d.conversationId,
        wamid: sent.wamid,
        error: errField(e),
      });
      return null;
    });
    return { outcome: "sent", messageId, externalId: sent.wamid };
  }

  // A send that timed out or dropped after it left may have been taken all the same, on any wire (provider-fetch): its
  // outcome is unknown: nobody sends it again blind, and an email's receipt may still settle it (00177's guard).
  const failure = {
    http_status: sent.status,
    body: sent.errorBody ?? null,
    ...(sent.outcome === "unknown" ? { outcome: "unknown" } : {}),
  };
  let messageId: string | null = d.messageId ?? null;
  if (d.messageId) {
    await finalizeQueued(ports.db, d, { status: "failed", error: failure });
  } else {
    // Recorded as a failed row rather than dropped: the business should see
    // that it tried and could not reach them.
    messageId = await recordOutbound(ports.db, {
      tenantId: d.tenantId,
      conversationId: d.conversationId,
      contactId: d.contactId,
      sender: d.sender,
      type: d.template ? "template" : "text",
      body: d.body,
      channel: d.channel,
      externalId: null,
      status: "failed",
      meta: { ...(d.meta ?? {}), ...failure },
    });
  }
  await event(ports.db, d, "message.send_failed", messageId, { ...failure, reason: sent.reason ?? "provider" });
  return {
    outcome: "failed",
    reason: sent.reason ?? "provider",
    status: sent.status,
    errorBody: sent.errorBody ?? null,
    messageId,
    ...namedFailure(d.channel, sent),
  };
}

/**
 * Which yes a queued template needs. Meta's category is the authority -- it
 * can recategorise a live template -- and purposeOfTemplate fails closed, so
 * a template whose category we do not have reads as marketing. A read that
 * fails throws: a purpose that cannot be read is not "utility".
 */
export async function templatePurpose(
  db: Db,
  tenantId: string,
  template: { name: string; language: string } | undefined | null,
): Promise<SendPurpose> {
  if (!template) return "conversational";
  const { data, error } = await db
    .from("templates")
    .select("category")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("name", template.name)
    .eq("language", template.language)
    .maybeSingle();
  if (error) throw new Error(`deliver: cannot read template ${template.name}: ${error.message}`);
  return purposeOfTemplate(data?.category);
}

/**
 * The door for a caller that must never see it throw: the webhook, whose
 * outer catch only logs, so a thrown read used to be a customer's reply lost
 * with nobody told. A wire that cannot be read is a failure with its own
 * name, and the caller alerts a person the way it does for a provider's no.
 */
export async function deliverSafely(ports: DeliverPorts, d: Delivery): Promise<Delivered> {
  try {
    return await deliver(ports, d);
  } catch (e) {
    const errorBody = e instanceof Error ? e.message : String(e);
    deliverLog.error("deliver_threw", { tenant_id: d.tenantId, conversation_id: d.conversationId, error: errorBody });
    return { outcome: "failed", reason: "wire_unreadable", status: 0, errorBody, messageId: d.messageId ?? null };
  }
}
