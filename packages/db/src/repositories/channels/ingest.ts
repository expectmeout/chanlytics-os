/**
 * Ingestion repositories — the edge's write surface (service-role client).
 * ingest_inbound is the atomic concurrency gate (RPC) and the receptionist's
 * dedupe; everything else is plain row work.
 */
import { heldContactId, DbFailure } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolvePerson } from "../people/people";
import { readAnswer } from "../../shared/read-json";
import { withdrawAiDrafts } from "../conversations/control";
import {
  conversationPatch,
  normalizePhone,
  type BrainIntent,
  type Handled,
  type PurposeBearing,
  HOUR_MS,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../types";
import { emitEvent } from "../events/events";
import { dbLog } from "../../shared/observe";
import { noChannelColumns, noRelationshipColumn } from "../campaigns/channels";
import type { TenantId, ContactId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

export interface IngestInboundParams {
  tenantId: TenantId;
  channel: "whatsapp" | "sms" | "email" | "instagram";
  identityExternalId: string;
  phoneE164: string | null;
  waProfileName: string | null;
  messageExternalId: string;
  type: "text" | "media";
  body: string | null;
  channelTs: string | null; // ISO
  media?: Json | null;
  meta?: Json;
  optOut?: boolean;
  optIn?: boolean;
  /**
   * The customer texted the OFFERS keyword specifically: a second, separate answer (contracts consent.ts), kept by
   * ingest_inbound with the message, in its transaction (00581), and never under a stop that stands after it.
   */
  optInMarketing?: boolean;
}

export interface IngestResult {
  message_id: string;
  conversation_id: string;
  contact_id: ContactId;
  is_new: boolean;
  processed: boolean;
  state: string;
  paused_until: string | null;
  /** The contact's consent AFTER this message was applied, so a STOP earlier in the same webhook batch is already
   *  reflected. */
  consent: string | null;
  dnc: boolean | null;
}

/** What ingest_inbound answers, as IngestResult says it. */
const IngestAnswer: z.ZodType<IngestResult> = z.object({
  message_id: z.string(),
  conversation_id: z.string(),
  contact_id: z.string().transform(heldContactId),
  is_new: z.boolean(),
  processed: z.boolean(),
  state: z.string(),
  paused_until: z.string().nullable(),
  consent: z.string().nullable(),
  dnc: z.boolean().nullable(),
});

/**
 * They have said stop, and it stands: a yes to offers that arrives now is not recorded (stoppedNow, read from the
 * ingest's own answer, which is the row after this message was applied). The way back in from a STOP is START, never
 * YES OFFERS (one word opening both programs is what the carriers refuse, 30913), and a yes stored under a stop would
 * be a yes nobody confirmed and no later stop could end (00323 ends a yes when the stop is RECORDED, and a second STOP
 * from a person already stopped records nothing). After START, the confirmation on WhatsApp says how to get offers.
 */
export function stoppedNow(ingest: Pick<IngestResult, "consent" | "dnc"> | null | undefined): boolean {
  return ingest?.consent === "opted_out" || ingest?.dnc === true;
}

export async function ingestInbound(db: Db, inboundParams: IngestInboundParams): Promise<IngestResult> {
  const { data, error } = await db.rpc("ingest_inbound", {
    p_tenant_id: inboundParams.tenantId,
    p_channel: inboundParams.channel,
    p_identity_external_id: inboundParams.identityExternalId,
    p_phone_e164: inboundParams.phoneE164,
    p_wa_profile_name: inboundParams.waProfileName,
    p_message_external_id: inboundParams.messageExternalId,
    p_type: inboundParams.type,
    p_body: inboundParams.body,
    p_channel_ts: inboundParams.channelTs,
    p_media: inboundParams.media ?? null,
    p_meta: inboundParams.meta ?? {},
    p_opt_out: inboundParams.optOut ?? false,
    p_opt_in: inboundParams.optIn ?? false,
    p_opt_in_marketing: inboundParams.optInMarketing ?? false,
  });
  if (error) throw new DbFailure(error, "ingest_inbound");
  const out = readAnswer("ingest_inbound", IngestAnswer, data);
  // The yes a message carries is kept with it (00581), and a yes to offers under a stop is not: said, once, by the visit
  // that kept the message, so "I wrote YES OFFERS and nothing happened" has an answer.
  if (inboundParams.optInMarketing && out.is_new && stoppedNow(out))
    dbLog().warn("offers_yes_while_stopped", {
      tenant_id: inboundParams.tenantId,
      contact_id: out.contact_id,
      channel: inboundParams.channel,
    });
  return out;
}

/**
 * What became of one inbound message, by its provider's id: whether a message holds it, and the status of the newest reply
 * that names it (meta.reply_to), or null when none does. The daily canary's check (apps/edge/lib/sms/canary.ts). A read
 * that fails throws.
 */
export async function answerOfMessage(db: Db, externalId: string): Promise<{ kept: boolean; reply: string | null }> {
  const { data: message, error } = await db
    .from("messages")
    .select("id, tenant_id")
    .eq("external_id", externalId)
    .eq("direction", "inbound")
    .maybeSingle();
  if (error) throw new DbFailure(error, "answer_of_message");
  if (!message) return { kept: false, reply: null };
  const { data: reply, error: unread } = await db
    .from("messages")
    .select("status")
    .eq("tenant_id", message.tenant_id)
    .eq("direction", "outbound")
    .eq("meta->>reply_to", message.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (unread) throw new DbFailure(unread, "answer_of_message");
  return { kept: true, reply: reply?.status ?? null };
}

/** Stamp a message handled (replied / deliberately skipped) — retry no-ops after this.
 *  One server-side jsonb merge (no read-modify-write, no lost-update race). */
export async function markProcessed(db: Db, tenantId: TenantId, messageId: string): Promise<void> {
  const { error } = await db.rpc("mark_processed", {
    p_tenant_id: tenantId,
    p_message_id: messageId,
  });
  if (error) throw new DbFailure(error, "mark_processed");
}

/**
 * Say what a customer's message became (the Reports lenses spec, K1): `meta.handled` and, where the model read it,
 * `meta.intent`, merged into the row by message_stamp_handled beside processed_at, never over it, the first answer
 * standing. A door of its own, apart from markProcessed: processed_at is what the deadman sweep reads, so the two are
 * written together and fail alone. A failure throws, and the sink that calls it guards it (runPgSafe), as it guards every
 * write of a message's bookkeeping.
 */
export async function stampHandled(
  db: Db,
  tenantId: TenantId,
  messageId: string,
  handled: Handled,
  intent: BrainIntent | null,
): Promise<void> {
  const { error } = await db.rpc("message_stamp_handled", {
    p_tenant_id: tenantId,
    p_message_id: messageId,
    p_handled: handled,
    ...(intent ? { p_intent: intent } : {}),
  });
  if (error) throw new DbFailure(error, "message_stamp_handled");
}

export async function recordOutbound(
  db: Db,
  params: {
    tenantId: TenantId;
    conversationId: string;
    contactId: ContactId | null;
    sender: "ai" | "human" | "system";
    type?: "text" | "template" | "note";
    body: string;
    externalId: string | null; // wamid from the send response
    meta?: Json;
    /** "queued" is a DRAFT awaiting its veto window — written by the bot,
     *  fired later by outbound_send, cancellable until then. */
    status?: "sent" | "failed" | "queued";
    /** The wire it goes out on: where the person last wrote. WhatsApp unless said. */
    channel?: "whatsapp" | "sms" | "email" | "instagram";
  },
): Promise<string | null> {
  // An email's row is written before its words leave, under the id its request is frozen with (core deliver.ts): an
  // id minted here, after the send, is one no receipt can name.
  if (params.channel === "email")
    throw new Error("record_outbound: an email's row is written before it is sent, never after");
  const { data, error } = await db
    .from("messages")
    .insert({
      tenant_id: params.tenantId,
      conversation_id: params.conversationId,
      contact_id: params.contactId,
      channel: params.channel ?? "whatsapp",
      direction: "outbound",
      sender: params.sender,
      type: params.type ?? "text",
      body: params.body,
      external_id: params.externalId,
      status: params.status ?? "sent",
      meta: params.meta ?? {},
    })
    .select("id")
    .single();
  if (error) {
    // duplicate wamid (retry) is benign
    if (error.code === "23505") return null;
    throw new DbFailure(error, "record_outbound");
  }
  // A queued draft or a failed row has not gone out. The event that says a
  // message did is the send moment first_replies reads (00035) and the line the
  // owner's Activity shows as "A message went out", so it is written only for a
  // row that was sent: a draft gets its one event from deliver() when it
  // actually leaves, and a failure is message.send_failed there. The thread is
  // stamped either way.
  const status = params.status ?? "sent";
  await Promise.all([
    db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", params.conversationId),
    status === "sent"
      ? emitEvent(db, params.tenantId, "message.sent", "message", data.id, { sender: params.sender })
      : Promise.resolve(),
  ]);
  return data.id;
}

/**
 * A first-time caller's row, through the one door a person is resolved by (resolve_person, decision 0034: 00342,
 * 00344): the number as their voice identity, observed, seen now. The door makes nobody twice (a caller who texted
 * first is the same person) and keeps the identity the call's own ingest will find. The row is then read for what the
 * consent predicate asks of it.
 */
export async function getOrCreateContact(
  db: Db,
  tenantId: TenantId,
  phoneE164: string,
): Promise<{ id: ContactId; consent: string; dnc: boolean; marketing_consent: string }> {
  const created = await resolvePerson(db, {
    tenantId,
    channel: "voice",
    external: phoneE164,
    phone: phoneE164,
    assurance: "observed",
    source: "call",
  });
  const { data, error } = await db
    .from("contacts")
    .select("id, consent, dnc, marketing_consent")
    .eq("tenant_id", tenantId)
    .eq("id", created.contact_id)
    .single();
  if (error || !data) throw new DbFailure(error ?? { message: "no answer" }, "get_or_create_contact reselect");
  return data;
}

/**
 * `extends PurposeBearing` so the claim below is the compiler's and not only the
 * comment's: this row can be handed to `mayMessageFor` whole.
 */
export interface OutboundTarget extends PurposeBearing {
  contactId: ContactId;
  conversationId: string;
  /** 'unknown' | 'opted_in' | 'opted_out' — carried so no caller can send
   *  without having been handed the consent state. */
  consent: string | null;
  dnc: boolean;
  /**
   * The OTHER answer: offers, specifically (00095).
   *
   * Carried for exactly the reason the two above are — a sender that is not
   * handed the fact cannot honour it — and its absence is why the voice path
   * could only ever ask half the question. The shape is now a `PurposeBearing`,
   * so `mayMessageFor` can be asked about either purpose without a second read.
   */
  //
  // Named as the column and `PurposeBearing` name it. It was `marketingConsent`,
  // under a comment saying the row "is now a PurposeBearing" -- so handing it over
  // whole compiled, read `marketing_consent` as absent, and failed CLOSED: every
  // promotion silently refused, with no error anywhere to say why.
  marketing_consent: string | null;
  /** The channels each yes covers, as the database keeps them (contracts consent/channels.ts); null: WhatsApp alone. */
  consent_channels: string[] | null;
  marketing_channels: string[] | null;
  /** A human has this thread until then. Carried for the same reason consent
   *  is: a sender that is not handed the fact cannot honour it. */
  pausedUntil: string | null;
}

/**
 * The contact + conversation an outbound message belongs to, with consent.
 *
 * Every send path needs the same four facts, and until now each one found them
 * its own way (or, in the voice function's case, not at all — it texted a raw
 * phone number with no row behind it). Consent is returned rather than checked
 * here on purpose: the repository's job is to report state, and each caller
 * has its own honest refusal to give.
 *
 * `create: false` means "only an existing contact will do" — the guard for a
 * number somebody supplied rather than one that called us.
 */
export async function resolveOutboundTarget(
  db: Db,
  params: { tenantId: TenantId; phoneE164: string; create?: boolean; touch?: boolean },
): Promise<OutboundTarget | null> {
  // normalizePhone, not a hand-rolled "+" prefix: contacts are keyed on FULL
  // international digits, and a caller that hands us a national-format number
  // would otherwise miss the existing row and (on the create path) open a
  // duplicate contact carrying none of the original's consent history.
  const phone = normalizePhone(params.phoneE164);
  if (!phone) return null;
  const first = await db
    .from("contacts")
    .select("id, consent, dnc, marketing_consent, consent_channels, marketing_channels")
    .eq("tenant_id", params.tenantId)
    .eq("phone_e164", phone)
    .maybeSingle();
  // A database 00297 has not reached has no channel arrays: read again without them, and WhatsApp alone is what a yes covers.
  const { data: existing, error: selErr } = noChannelColumns(first.error)
    ? await db
        .from("contacts")
        .select("id, consent, dnc, marketing_consent")
        .eq("tenant_id", params.tenantId)
        .eq("phone_e164", phone)
        .maybeSingle()
    : first;
  if (selErr) throw new Error(`resolve_outbound_target: ${selErr.message}`);

  // A contact made here has said no yes on any channel yet: its channels are none kept.
  let contact: OutboundContact | null = existing;
  if (!contact) {
    if (!params.create) return null;
    contact = await getOrCreateContact(db, params.tenantId, phone);
  }
  return threadOf(db, params.tenantId, contact, params.touch);
}

/** The contact row an outbound target is made from: who they are to the consent predicate. */
type OutboundContact = { id: ContactId; consent: string; dnc: boolean; marketing_consent: string } & {
  consent_channels?: string[] | null;
  marketing_channels?: string[] | null;
};

/**
 * The person's one thread (opened when they have none) and the target a send is judged by, from the contact row.
 *
 * `touch` because resolving a thread is not the same as writing to it. A
 * broadcast resolves one per recipient BEFORE the door decides whether they
 * may be messaged, and stamping last_message_at there sends every refused
 * person's thread to the top of the Inbox as if something had happened in it.
 * The stamp belongs to the message: recordOutbound writes it when one lands.
 */
async function threadOf(
  db: Db,
  tenantId: TenantId,
  contact: OutboundContact,
  touch: boolean | undefined,
): Promise<OutboundTarget> {
  const { data: conv, error: cErr } = await db
    .from("conversations")
    .upsert(
      {
        tenant_id: tenantId,
        contact_id: contact.id,
        ...(touch === false ? {} : { last_message_at: new Date().toISOString() }),
      },
      { onConflict: "tenant_id,contact_id" },
    )
    // paused_until rides along because every caller has to answer "may I send"
    // and the answer is not consent alone: a human who took this thread over is
    // mid-conversation, and an automated message landing underneath them is
    // indistinguishable, to the customer, from the person they are talking to.
    .select("id, paused_until")
    .single();
  if (cErr || !conv) throw new Error(`resolve_outbound_target conversation: ${cErr?.message}`);

  return {
    contactId: contact.id,
    conversationId: conv.id,
    pausedUntil: conv.paused_until ?? null,
    consent: contact.consent ?? null,
    dnc: contact.dnc ?? false,
    marketing_consent: contact.marketing_consent ?? null,
    consent_channels: contact.consent_channels ?? null,
    marketing_channels: contact.marketing_channels ?? null,
  };
}

/**
 * The same target by the person's id, for a send that reaches them by something other than a number (an email): their
 * one thread, opened when they have none, with the consent they are judged by. Never creates a contact; null for one
 * that is gone, erased or merged into another, whose thread is the other's. Carried like resolveOutboundTarget's, so
 * no caller can send without having been handed the consent state.
 */
export async function resolveOutboundTargetForContact(
  db: Db,
  params: { tenantId: TenantId; contactId: ContactId; touch?: boolean },
): Promise<OutboundTarget | null> {
  const first = await db
    .from("contacts")
    .select(
      "id, consent, dnc, marketing_consent, consent_channels, marketing_channels, erased_at, merged_into_contact_id",
    )
    .eq("tenant_id", params.tenantId)
    .eq("id", params.contactId)
    .maybeSingle();
  // The same answer on a database 00297 has not reached: without the channel arrays, a yes covers WhatsApp alone.
  const { data, error } = noChannelColumns(first.error)
    ? await db
        .from("contacts")
        .select("id, consent, dnc, marketing_consent, erased_at, merged_into_contact_id")
        .eq("tenant_id", params.tenantId)
        .eq("id", params.contactId)
        .maybeSingle()
    : first;
  if (error) throw new DbFailure(error, "resolve_outbound_target_for_contact");
  if (!data || data.erased_at || data.merged_into_contact_id) return null;
  return threadOf(db, params.tenantId, data, params.touch);
}

/**
 * What the send door re-reads at the wire for one thread, in one query: its pause and who holds it, the person's consent
 * row (with the channels each yes covers) and email, and the workspace's status; and, when `relationship` is asked,
 * whether they have a relationship with the business (`has_relationship`, the other way into an offer by email). The
 * relationship is asked only by a send that needs it, an email OFFER: it is a function of the person's row that reads their
 * messages, calls and deals, so a WhatsApp reply or a reminder never pays for it. The answer as the database gives it,
 * `{ data, error }`: the door words a failed read itself, because "we could not check" is not "yes". A database 00299
 * has not reached has no `has_relationship`, and one 00297 has not reached has no channel arrays either: it is read
 * again without them, a yes then covers WhatsApp alone and no relationship is on record, as before them: code that ships
 * before its migration must keep every reply, answer and booking link going.
 */
export async function findWireRow(
  db: Db,
  params: { tenantId: TenantId; conversationId: string; relationship: boolean },
) {
  const head =
    "paused_until, control_kind, control_ref, control_until, contact_id, contacts (consent, dnc, marketing_consent, ";
  const tail = "email_marketing, erased_at, erasing_since, email, email_suppressed_at), tenants (status)";
  const read = (columns: string) =>
    db
      .from("conversations")
      .select(`${head}${columns}${tail}`)
      .eq("id", params.conversationId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();
  const full = await read(`consent_channels, marketing_channels, ${params.relationship ? "has_relationship, " : ""}`);
  if (!noRelationshipColumn(full.error) && !noChannelColumns(full.error)) return full;
  const withChannels = noRelationshipColumn(full.error) ? await read("consent_channels, marketing_channels, ") : full;
  return noChannelColumns(withChannels.error) ? read("") : withChannels;
}

/**
 * Automated sends already made to this thread today, by source.
 *
 * The conversational path caps bot replies per thread per day from the thread
 * state it already holds. A voice-initiated send has no thread state, and so had
 * no cap at all — a caller who phoned repeatedly, or an agent that called its
 * own tool twice, produced one billable template per attempt.
 */
export async function countSentToday(
  db: Db,
  params: { tenantId: TenantId; conversationId: string; source: string },
): Promise<number> {
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();
  const { count, error } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", params.tenantId)
    .eq("conversation_id", params.conversationId)
    .eq("direction", "outbound")
    .gte("created_at", since)
    .contains("meta", { source: params.source });
  if (error) throw new DbFailure(error, "count_sent_today");
  return count ?? 0;
}

/**
 * Whether the booking link already left on this call to this thread and was not refused at the wire (decision 0092): a
 * tool call the provider asks again, or a caller who asks twice in a minute, is told it is on its way rather than sent
 * a second one. A link that failed does not count: asking again is how a caller gets it by text. A read that fails
 * throws.
 */
export async function linkSentOnCall(
  db: Db,
  params: { tenantId: TenantId; conversationId: string; source: string; callId: string },
): Promise<boolean> {
  const { count, error } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", params.tenantId)
    .eq("conversation_id", params.conversationId)
    .eq("direction", "outbound")
    .neq("status", "failed")
    .contains("meta", { source: params.source, call_id: params.callId });
  if (error) throw new DbFailure(error, "link_sent_on_call");
  return (count ?? 0) > 0;
}

/**
 * Delivery receipts: the message the provider's id names moves to the status; the monotone rank is enforced by trigger.
 * Whether a row carries the id: false for a receipt about history we never wrote, or about a send whose row has not been
 * given the provider's id yet (its receipt can beat our own write). A move the guard refuses (a receipt arriving after a
 * later one: monotone, terminal) is a receipt already applied, and true. Any other failure THROWS, so the door does not
 * acknowledge a status it did not keep: logged, until 3 Nov 2026, and the receipt acknowledged, which left an Inbox row
 * at "sent" for good.
 */
export async function recordStatusByExternalId(
  db: Db,
  tenantId: TenantId,
  externalId: string,
  status: "sent" | "delivered" | "read" | "failed",
  errorDetail?: Json,
): Promise<boolean> {
  const patch: { status: typeof status; error?: Json } = { status };
  if (errorDetail) patch.error = errorDetail;
  const { data, error } = await db
    .from("messages")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("external_id", externalId)
    .select("id");
  if (error && /monotone|terminal/.test(error.message)) return true;
  if (error) {
    dbLog().error("record_status_failed", { tenant_id: tenantId, external_id: externalId, error: error.message });
    throw new DbFailure(error, "record_status");
  }
  return (data ?? []).length > 0;
}

/**
 * The message of this workspace a provider's id names (Meta's wamid, Twilio's sid), as it stands: what a receipt that
 * reports a failure needs to know before it moves the row (core raiseLateFailure). Null when none carries the id: a
 * receipt for history we never wrote. A read that fails THROWS.
 */
export async function findMessageByExternalId(db: Db, tenantId: TenantId, externalId: string) {
  const { data, error } = await db
    .from("messages")
    .select("id, conversation_id, direction, sender, status, meta")
    .eq("tenant_id", tenantId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "findMessageByExternalId");
  if (!data) return null;
  return {
    messageId: data.id,
    conversationId: data.conversation_id,
    direction: data.direction,
    sender: data.sender,
    status: data.status,
    meta: data.meta,
  };
}

/**
 * What it cost to send a message, as Meta's receipt said it, kept once on its outbound row (message_keep_cost, 00319):
 * the `pricing` object (billable, pricing_model, category, type; no amount), checked key by key by the door, the first
 * answer standing. A refusal throws with the database's words; the receipt door that calls it catches that and logs it,
 * so a cost never costs a receipt. Answers whether a row was written.
 */
export async function keepMessageCost(db: Db, tenantId: TenantId, externalId: string, pricing: Json): Promise<boolean> {
  const { data, error } = await db.rpc("message_keep_cost", {
    p_tenant_id: tenantId,
    p_external_id: externalId,
    p_pricing: pricing,
  });
  if (error) throw new DbFailure(error, "message_keep_cost");
  return data === true;
}

/**
 * The AI-side pause (non-text / escalation): the receptionist steps out of
 * this thread until the given moment.
 *
 * Returns whether the pause actually landed, and the caller must care.
 *
 * This used to discard the result entirely, which is the quietest way to
 * break the product: `paused_until` on this row IS the answer
 * to "may I speak?", so a transient PostgREST failure here means the bot opens
 * an escalation, emails staff, and then keeps answering the thread it just
 * handed to a human. supabase-js does not throw, so the surrounding try/catch
 * never saw it either — the only evidence was a customer being talked over.
 *
 * `.select("id")` is not decoration: an UPDATE that RLS or a wrong tenant id
 * excludes matches zero rows and reports success, so the row count is the only
 * way to tell a write that happened from one that was silently skipped.
 */
export async function pauseConversation(
  db: Db,
  tenantId: TenantId,
  conversationId: string,
  pausedUntilIso: string,
  /** The holding message this same handoff queued, which the pause must not withdraw. */
  opts: { keepMessageId?: string | null } = {},
): Promise<boolean> {
  const { data, error } = await db
    .from("conversations")
    .update(conversationPatch("hand_off", { until: pausedUntilIso }))
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    dbLog().error("pause_conversation_failed", {
      tenant_id: tenantId,
      conversation_id: conversationId,
      error: error.message,
    });
    return false;
  }
  if (!data || data.length === 0) {
    dbLog().error("pause_conversation_noop", { tenant_id: tenantId, conversation_id: conversationId });
    return false;
  }
  // A person is taking the thread, so the receptionist's held drafts on it
  // are withdrawn with the pause -- all but the holding message the same
  // handoff queued in this breath, which the caller names. A draft written
  // before the pause must not land after it: the door (packages/core deliver)
  // waives the pause for a queued row on exactly this promise. The one door
  // (00387) takes each draft no run has claimed with the job that would send
  // it; a claimed one is on its way and is left to say what became of it. A
  // failure here is logged, never fatal: the pause itself landed.
  await withdrawAiDrafts(db, {
    tenantId,
    conversationId,
    reason: { reason: "superseded_by_human" },
    keepMessageId: opts.keepMessageId ?? null,
  }).catch((e: unknown) =>
    dbLog().error("pause_withdraw_drafts_failed", {
      tenant_id: tenantId,
      conversation_id: conversationId,
      error: e instanceof Error ? e.message : String(e),
    }),
  );
  return true;
}
