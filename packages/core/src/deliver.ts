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
  sendText,
  sendTemplate,
  sendEmail,
  requestLeavesAs,
  resendLimitOf,
  addressOf,
  type SendResult,
  type WaConfig,
  type EmailRequest,
  type EmailSendsAs,
  type ResendConfig,
  type ResendLimit,
} from "@chanlytics/channels";
import {
  domainDailyCap,
  mayMessageFor,
  purposeOfTemplate,
  type DeliveryRefusal,
  type SendPurpose,
  type EventKind,
} from "@chanlytics/contracts";
import { emitEvent, outreachFactsOf, recordOutbound, type Database, type Json } from "@chanlytics/db";

export type { DeliveryRefusal };

export type Db = SupabaseClient<Database>;
type MessagePatch = Database["public"]["Tables"]["messages"]["Update"];

export type Channel = "whatsapp" | "sms" | "email";

/**
 * What a send IS, for the door's rules -- never read off `sender`, which is a
 * fact about who wrote the words and is recorded as such.
 *  - "reply": a person's own words in a conversation; every pause exists for
 *    them, so none holds it.
 *  - "draft": the receptionist's held reply, queued; a person speaking since
 *    retires it, and the pause it now meets does not.
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
   * queued (channels email.ts). Present on the email wire and nowhere else.
   */
  email?: EmailRequest;
  /** The send's purpose, on the email wire: only outreach may take an own domain's route (emailSender). */
  purpose?: SendPurpose;
}

/** How to put words on one channel's wire. Owns its own address format. */
export type Sender = (to: string, p: WirePayload) => Promise<SendResult>;

/**
 * The wires one workspace has. `undefined`: this runtime has no such
 * channel at all. `null`: the channel exists but this workspace holds no
 * credentials or line for it -- refused here, never guessed from the
 * environment, which is how one business's message left on another's line.
 */
export type Wire = Partial<Record<Channel, Sender | null>>;

/**
 * WhatsApp's wire from a workspace's credentials. Graph wants bare digits,
 * so the "+" is stripped here rather than by a caller who should not know.
 */
export function whatsappSender(cfg: WaConfig | null): Sender | null {
  if (!cfg) return null;
  return (to, p) => {
    const digits = to.replace(/^\+/, "");
    return p.template ? sendTemplate(cfg, digits, p.template) : sendText(cfg, digits, p.body);
  };
}

/**
 * One address a workspace's email may leave as, and the provider account it leaves through. "hosted" is the mailbox
 * on the platform's account, for everything but a cold email; "own" is one of the workspace's own verified domains on
 * the cold account, for outreach and nothing else.
 */
export interface EmailRoute {
  lane: "hosted" | "own";
  cfg: ResendConfig;
  as: EmailSendsAs;
}

/**
 * Email's wire, bound to ONE workspace's addresses. It sends the frozen request
 * and nothing it assembled itself: a delivery without one, one addressed to
 * somebody other than `to`, or one that would leave as another workspace, is a
 * failure the caller hears about, never a send. The provider keys are the
 * deployment's; the routes are what make the wire this workspace's: the hosted
 * mailbox on the platform's account, and each of its own verified domains on
 * the cold account (Reach out), so a cold email never spends the reputation
 * every workspace's replies share. The route is chosen by the request's From,
 * within the send's lane: an own domain carries outreach only, so a reply
 * frozen with an own domain's From never leaves around outreach's rules, and a
 * cold email never leaves as the hosted mailbox. That route's own Reply-To rule
 * still applies. No routes, no email line (null, like a number with no
 * credentials).
 */
export function emailSender(routes: EmailRoute[]): Sender | null {
  if (routes.length === 0) return null;
  const refuse = (errorBody: string): Promise<SendResult> =>
    Promise.resolve({ ok: false, wamid: null, status: 0, errorBody });
  return (to, p) => {
    if (!p.email) return refuse("no_frozen_request");
    if (p.email.to.length !== 1 || p.email.to[0] !== to) return refuse("request_names_another_recipient");
    const from = addressOf(p.email.from)?.address;
    const lane = p.purpose === "outreach" ? "own" : "hosted";
    const route = routes.find((r) => r.lane === lane && r.as.address === from);
    if (!route || !requestLeavesAs(p.email, route.as)) return refuse("request_leaves_as_another_sender");
    return sendEmail(route.cfg, p.email);
  };
}

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
  body: string;
  template?: TemplateSend;
  /** The frozen request, on the email wire (WirePayload.email). */
  email?: EmailRequest;
  /**
   * An outbox row already written as `queued` (the honest undo): finalized
   * in place rather than inserted, and only while it is still queued, so a
   * cancel that wins the row is never overwritten.
   */
  messageId?: string | null;
  /** What this send is, for the rules (SendKind). Absent, the door derives it the way it always read `sender`: see kindOf. */
  kind?: SendKind;
  /** Recorded on a row this call writes. */
  meta?: Record<string, Json>;
}

/** The policy a send goes under: as declared, or as the door always derived it from who wrote the words. */
function kindOf(d: Delivery): SendKind {
  if (d.kind) return d.kind;
  // A cold email is a broadcast whoever wrote its words: the workspace's pause, the thread's and a live hold all stop
  // it. Read from `sender`, a row a person had edited would pass as their reply and skip every pause.
  if (d.purpose === "outreach") return "broadcast";
  if (d.sender === "human") return d.proactive ? "broadcast" : "reply";
  return d.messageId ? "draft" : "answer";
}

/** Why the door stayed shut: contracts' closed list (consent.ts DELIVERY_REFUSALS), re-exported above. */

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
    };

export interface DeliverPorts {
  db: Db;
  wire: Wire;
  /** Epoch ms; injected so the pause is testable. */
  now?: () => number;
}

interface WireFacts {
  pausedUntil: string | null;
  /**
   * Who is SPEAKING on this thread right now, and until when (00132).
   *
   * Not `assignee_user_id`, which says who is responsible and may outlive the
   * exchange -- reading that as a live hold is how a thread taken over and
   * never handed back refused the receptionist's drafts for ever. A hold
   * expires; responsibility does not, and neither does the escalation that
   * keeps the thread in somebody's queue.
   */
  control: { kind: string; until: string } | null;
  /** The person this thread is with, as the thread says: what outreach asks the leads about. */
  contactId: string | null;
  contact: {
    consent: string | null;
    dnc: boolean | null;
    marketing_consent: string | null;
    /** Email's own answer (00174): opted_out once they pressed Unsubscribe. */
    email_marketing: string | null;
    erased_at: string | null;
    erasing_since: string | null;
    /** The address on file now, and whether it has stopped being sent to (00125, 00126). */
    email: string | null;
    email_suppressed_at: string | null;
  };
  tenantStatus: string | null;
}

/**
 * The facts the wire re-reads, in one query: the thread's pause, the person's
 * consent row, and the workspace's status. A read that fails throws, because
 * "we could not check" is not "yes" -- the outbox retries, the broadcast
 * leaves the person queued, and the voice agent says it could not send.
 */
async function wireFacts(db: Db, d: Delivery): Promise<WireFacts> {
  const { data, error } = await db
    .from("conversations")
    .select(
      "paused_until, control_kind, control_until, contact_id, contacts (consent, dnc, marketing_consent, email_marketing, erased_at, erasing_since, email, email_suppressed_at), tenants (status)",
    )
    .eq("id", d.conversationId)
    .eq("tenant_id", d.tenantId)
    .maybeSingle();
  if (error) throw new Error(`deliver: cannot read the wire for conversation ${d.conversationId}: ${error.message}`);
  if (!data) throw new Error(`deliver: no conversation ${d.conversationId} in workspace ${d.tenantId}`);
  const row = data as unknown as {
    paused_until: string | null;
    control_kind?: string | null;
    control_until?: string | null;
    contact_id?: string | null;
    contacts: WireFacts["contact"] | null;
    tenants: { status: string | null } | null;
  };
  return {
    pausedUntil: row.paused_until ?? null,
    control: row.control_kind && row.control_until ? { kind: row.control_kind, until: row.control_until } : null,
    contactId: row.contact_id ?? null,
    contact: row.contacts ?? {
      consent: null,
      dnc: null,
      marketing_consent: null,
      email_marketing: null,
      erased_at: null,
      erasing_since: null,
      email: null,
      email_suppressed_at: null,
    },
    tenantStatus: row.tenants?.status ?? null,
  };
}

/** What a cold email's own rules ask, read only for one (Reach out). */
interface OutreachFacts {
  /** The stage of the lead that points at this person, the one still being written to first; null when none does. */
  leadStage: string | null;
  /** The address is on the workspace's never-again list: unsubscribed, complained, or erased. */
  suppressed: boolean;
  /** The request carries RFC 8058's one-click unsubscribe, both headers. */
  unsubscribable: boolean;
  /**
   * The state of the workspace's own domain the request's From is, as Connections set it up (its host and its
   * from_local); null when the From is no such address.
   */
  domainState: string | null;
  /** The ramp's clock for that domain: its day's share is domainDailyCap of it. */
  cleanSince: string | null;
  /** What left from that domain in the last day. */
  sentSince: number;
}

/** The window a domain's day's share is counted over: a rolling day, so there is no midnight to argue about. */
const SHARE_WINDOW_MS = 24 * 3_600_000;

/**
 * The facts outreach adds, in one question to the database (00177 outreach_facts), and only for an outreach email: a
 * conversational send never pays for it. A read that fails throws, as wireFacts does: "we could not check" is not
 * "yes".
 */
async function outreachFacts(db: Db, d: Delivery, f: WireFacts, nowMs: number): Promise<OutreachFacts> {
  const headers = d.email?.headers ?? {};
  const unsubscribable =
    !!headers["List-Unsubscribe"] && headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click";
  const from = addressOf(d.email?.from)?.address ?? null;
  const host = from ? from.slice(from.lastIndexOf("@") + 1) : null;
  if (!f.contactId)
    return { leadStage: null, suppressed: false, unsubscribable, domainState: null, cleanSince: null, sentSince: 0 };
  let facts;
  try {
    facts = await outreachFactsOf(db, {
      tenantId: d.tenantId,
      contactId: f.contactId,
      to: d.to,
      // A From that cannot be read names no domain: the lead is still asked, and the door refuses the domain.
      host: host ?? "",
      since: new Date(nowMs - SHARE_WINDOW_MS).toISOString(),
    });
  } catch (e) {
    throw new Error(`deliver: ${e instanceof Error ? e.message : String(e)} (conversation ${d.conversationId})`, {
      cause: e,
    });
  }
  // The whole address, as the wire will hold it (emailSender): another name on an own domain is not the address the
  // workspace set up, and would only fail at the wire rather than be refused here with its reason.
  const own = host && facts.domain && `${facts.domain.from_local}@${host}` === from ? facts.domain : null;
  return {
    leadStage: facts.lead_stage,
    suppressed: facts.suppressed,
    unsubscribable,
    domainState: own?.state ?? null,
    cleanSince: own?.clean_since ?? null,
    sentSince: facts.sent_since,
  };
}

/** Why the door is shut for this send, or null when it may go. */
function refusalFor(d: Delivery, f: WireFacts, nowMs: number, o: OutreachFacts | null): DeliveryRefusal | null {
  // A person who asked to be forgotten is never messaged, whatever the row
  // that survived says -- from the moment they asked (erasing_since, written
  // before anything is destroyed), not only once the erasure finished.
  if (f.contact.erased_at || f.contact.erasing_since) return "erased";
  // The texting line is registered with the carriers for replies and
  // appointment messages, and nothing else: an informational campaign, filed
  // that way after the fourth refusal (30896). A promotion by text would go out
  // under a consent the carriers were never told about, whatever the person
  // said to us -- so it does not, whoever asks. Offers and news go by WhatsApp.
  if (d.channel === "sms" && d.purpose === "marketing") return "sms_carries_no_promotions";
  // A cold message goes by email and nothing else: a phone's lines are registered, and consented, for people who
  // wrote to the business, never for businesses it found.
  if (d.purpose === "outreach" && d.channel !== "email") return "outreach_is_email_only";
  if (d.channel === "email") {
    // Email carries replies and nothing promotional until a release of its own
    // brings the unsubscribe a promotion owes (the plan's §11): refused here,
    // at the door, rather than hidden in a menu.
    if (d.purpose === "marketing") return "email_marketing_disabled";
    // A permanent bounce, a complaint or the provider's own list: a fact about
    // the address, kept apart from any one message's delivery (00126).
    if (f.contact.email_suppressed_at) return "email_suppressed";
    // The request was frozen for one address. If the person's address on file
    // is no longer that one -- corrected, removed -- these words were approved
    // for somewhere they should no longer go: canceled, and written again.
    if (f.contact.email !== d.to) return "recipient_changed";
  }
  // Consent outranks everything, asked with this message's own purpose.
  const may = mayMessageFor(f.contact, d.purpose, { proactive: d.proactive });
  if (!may.ok) return may.reason;
  // Outreach's own rules, after the person's no and before any pause: only to a business the finder found, only with
  // the one-click unsubscribe the large mailbox providers require, only from a domain the workspace owns and has
  // verified, never from the hosted address every workspace's replies share.
  if (d.purpose === "outreach") {
    if (!o) throw new Error(`deliver: an outreach email is judged with its facts (conversation ${d.conversationId})`);
    if (!o.leadStage) return "outreach_not_a_lead";
    // Only a business still being written to: a lead that said no, became a customer or was set aside is not.
    if (o.leadStage !== "ready" && o.leadStage !== "nurture") return "outreach_lead_closed";
    if (o.suppressed) return "outreach_suppressed";
    if (!o.unsubscribable) return "outreach_without_unsubscribe";
    if (!o.domainState) return "outreach_needs_own_domain";
    if (o.domainState !== "verified") return "sending_domain_not_ready";
    // The day's share is the ramp's (contracts domainDailyCap). The batch writer claims within it (Part 3); this is
    // the backstop, so a run that miscounts cannot spend a domain's reputation past its share.
    if (o.sentSince >= domainDailyCap(o.cleanSince, nowMs)) return "sending_domain_at_cap";
  }
  const kind = kindOf(d);
  // A person's own reply goes out even when the machine is told to stop: the
  // pause exists for them, and a paused workspace may still answer by hand.
  // A broadcast is a person's words too, but it is proactive and automated,
  // and it respects the pause like the machine it is.
  if (kind === "reply") return null;
  if (f.tenantStatus === "paused") return "paused";
  // Is somebody speaking on this thread right now (00132)? A person who took it
  // over, or a call in progress. It is asked as a LIVE fact with an expiry,
  // never as "does a column name somebody": the assignee it used to read is
  // never cleared, so a thread taken over one Tuesday refused every draft
  // after it for the life of the workspace.
  const held = !!f.control && nowMs < new Date(f.control.until).getTime();
  // A thread somebody holds does not take the receptionist's draft. Taking
  // over withdraws the drafts written before it; this is the same promise
  // kept at the wire, for the withdrawal that failed or the draft written in
  // the same second. Only the draft: an answer meets the hold below, a
  // system message is owed whoever holds the thread.
  if (kind === "draft" && held) return "human_has_it";
  // The thread's pause holds the receptionist answering now, and a broadcast.
  // It does not hold a queued draft, written before the pause it now meets --
  // the receptionist's own escalation pauses the thread and queues its holding
  // message in the same breath -- so for a draft the question is not "is the
  // thread paused" but "did a person speak since", which overtakenByHuman
  // answers below; and every pause writer withdraws the drafts that came
  // before it (pauseConversation, withdrawDrafts) besides. Nor does it hold a
  // system message: an opt-in confirmation is owed the moment the yes was
  // given, whoever holds the thread.
  //
  // A live hold stops them too, and that is what keeps two of our own agents
  // off one person: while a call is in progress the thread is held, so the
  // text receptionist stores what the customer writes and answers none of it,
  // rather than talking over the call the same customer is on.
  if (kind !== "draft" && kind !== "system" && (held || (f.pausedUntil && nowMs < new Date(f.pausedUntil).getTime())))
    return "human_has_it";
  return null;
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
  const spoke = (newer ?? []).find((m) => (m.meta as { source?: unknown } | null)?.source !== "broadcast");
  return spoke ? spoke.id : null;
}

/** The same writer every other event goes through: a failed insert is logged there, never dropped. */
function event(
  db: Db,
  d: Delivery,
  kind: EventKind,
  messageId: string | null,
  data: Record<string, Json>,
): Promise<void> {
  return emitEvent(db, d.tenantId, kind, "message", "message", messageId, data);
}

/** The thread stamped with the send, as recordOutbound stamps it on the row it writes. */
async function stampThread(db: Db, d: Delivery, nowMs: number): Promise<void> {
  const { error } = await db
    .from("conversations")
    .update({ last_message_at: new Date(nowMs).toISOString() })
    .eq("id", d.conversationId)
    .eq("tenant_id", d.tenantId);
  if (error)
    console.error(
      "deliver_stamp_failed",
      JSON.stringify({ tenant: d.tenantId, conversation: d.conversationId, error: error.message }),
    );
}

/**
 * Finalize an outbox row that is still queued. Zero rows means a cancel won
 * it first; a write that FAILED throws, because "the row did not change" and
 * "the row could not be changed" are different facts, and reading the second
 * as the first left a sent message queued for ever under a false race event.
 */
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
  // An email is written before it is sent, under the id its request was frozen with: every receipt names that row by
  // the request's tag, so a row written after the send (recordOutbound's, below) is one no receipt can find, and its
  // bounce suppresses nothing. A delivery that breaks this is a caller's mistake, said as one before anything is read.
  if (d.channel === "email" && (!d.messageId || (d.email && d.email.idempotency_key !== d.messageId)))
    throw new Error(
      `deliver: an email leaves only from the queued row its request was frozen for (conversation ${d.conversationId})`,
    );
  const nowMs = (ports.now ?? Date.now)();
  const facts = await wireFacts(ports.db, d);
  const outreach =
    d.purpose === "outreach" && d.channel === "email" ? await outreachFacts(ports.db, d, facts, nowMs) : null;

  const refusal = refusalFor(d, facts, nowMs, outreach);
  const overtakenBy = !refusal && kindOf(d) === "draft" ? await overtakenByHuman(ports.db, d) : null;
  const reason = refusal ?? (overtakenBy ? "superseded_by_human" : null);
  if (reason) {
    // A queued row is canceled with its reason, so the thread shows why the
    // words never left; a send with no row yet leaves none, and the caller
    // records the refusal where it lives (a recipient's row, a spoken reply).
    if (d.messageId) {
      await finalizeQueued(ports.db, d, { status: "canceled", error: { reason } });
      await event(ports.db, d, "message.send_blocked", d.messageId, {
        reason,
        purpose: d.purpose,
        consent: facts.contact.consent,
        dnc: facts.contact.dnc,
        marketing_consent: facts.contact.marketing_consent,
        ...(d.purpose === "outreach" ? { email_marketing: facts.contact.email_marketing } : {}),
        ...(overtakenBy ? { after: overtakenBy } : {}),
      });
    }
    return { outcome: "refused", reason, messageId: d.messageId ?? null };
  }

  const send = ports.wire[d.channel];
  const sent: SendResult & { reason?: "no_sender_for_channel" | "no_credentials" } =
    send === undefined
      ? { ok: false, wamid: null, status: 0, errorBody: "no_sender_for_channel", reason: "no_sender_for_channel" }
      : send === null
        ? { ok: false, wamid: null, status: 503, errorBody: "no_credentials", reason: "no_credentials" }
        : await send(d.to, {
            body: d.body,
            template: d.template,
            ...(d.email ? { email: d.email, purpose: d.purpose } : {}),
          });

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
        console.error(
          "deliver_finalize_failed",
          JSON.stringify({
            tenant: d.tenantId,
            message: d.messageId,
            wamid: sent.wamid,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
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
      console.error(
        "deliver_record_failed",
        JSON.stringify({
          tenant: d.tenantId,
          conversation: d.conversationId,
          wamid: sent.wamid,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      return null;
    });
    return { outcome: "sent", messageId, externalId: sent.wamid };
  }

  // A send that timed out may have been taken by the provider all the same: its outcome is unknown, and its receipt
  // may still settle it (00177's guard lets exactly this row move on).
  const failure = {
    http_status: sent.status,
    body: sent.errorBody ?? null,
    ...(d.channel === "email" && sent.status === 0 && sent.errorBody === "timeout" ? { outcome: "unknown" } : {}),
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
  // A refusal the mail provider gave for a limit of its own -- too fast, or the day's sending used up -- is named here,
  // at the wire, so a caller says it in words without reading the provider's answer itself.
  const limit = d.channel === "email" && !sent.reason ? resendLimitOf(sent) : null;
  return {
    outcome: "failed",
    reason: sent.reason ?? "provider",
    status: sent.status,
    errorBody: sent.errorBody ?? null,
    messageId,
    ...(limit ? { limit } : {}),
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
    console.error(
      "deliver_threw",
      JSON.stringify({ tenant: d.tenantId, conversation: d.conversationId, error: errorBody }),
    );
    return { outcome: "failed", reason: "wire_unreadable", status: 0, errorBody, messageId: d.messageId ?? null };
  }
}
