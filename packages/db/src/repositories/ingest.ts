/**
 * Ingestion repositories — the edge's write surface (service-role client).
 * ingest_inbound is the atomic concurrency gate (RPC) and the receptionist's
 * dedupe; everything else is plain row work.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePerson } from "./people";
import {
  CARRIER_CONSENT_SOURCE,
  conversationPatch,
  normalizePhone,
  type BrainIntent,
  type Handled,
  type PurposeBearing,
  HOUR_MS,
} from "@chanlytics/contracts";
import type { Database, Json } from "../database.types";
import { emitEvent } from "../events";
import { dbLog } from "../observe";
import { noChannelColumns, noRelationshipColumn } from "./campaigns/campaign-channels";

type Db = SupabaseClient<Database>;

export interface IngestInboundParams {
  tenantId: string;
  channel: "whatsapp" | "sms" | "email";
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
   * The customer texted the OFFERS keyword specifically.
   *
   * A second, separate answer -- see contracts/consent.ts. It is recorded after
   * the ingest rather than inside it: `ingest_inbound` is the hot path for every
   * inbound message in the product, and adding a parameter to it means
   * recreating a hundred-and-sixty-line function to write one column.
   */
  optInMarketing?: boolean;
}

export interface IngestResult {
  message_id: string;
  conversation_id: string;
  contact_id: string;
  is_new: boolean;
  processed: boolean;
  state: string;
  paused_until: string | null;
  /** The contact's consent AFTER this message was applied, so a STOP earlier in
   *  the same webhook batch is already reflected. Optional because a database
   *  still on a pre-00013 schema omits both — readers must treat absence as
   *  "nothing on record", never as a block. */
  consent?: string | null;
  dnc?: boolean | null;
}

/**
 * They have said stop, and it stands: a yes to offers that arrives now is not recorded (stoppedNow, read from the
 * ingest's own answer, which is the row after this message was applied). The way back in from a STOP is START, never
 * YES OFFERS (one word opening both programs is what the carriers refuse, 30913), and a yes stored under a stop would
 * be a yes nobody confirmed and no later stop could end (00323 ends a yes when the stop is RECORDED, and a second STOP
 * from a person already stopped records nothing). After START, the confirmation on WhatsApp says how to get offers.
 */
export function stoppedNow(r: Pick<IngestResult, "consent" | "dnc"> | null | undefined): boolean {
  return r?.consent === "opted_out" || r?.dnc === true;
}

/**
 * A START is a yes on the channel it came on, and ingest_inbound writes its consent event only when the answer
 * changes: a START by text from someone already opted in on WhatsApp left no event and covered no text. This door
 * (00297) writes the event when their list lacks the channel, and the database adds it to the list. Best-effort, for the
 * reason the offers write in ingestInbound is: the customer has been received, and a channel that has to be repaired is
 * logged, never a reason to fail their message.
 */
async function noteYesOnChannel(db: Db, p: IngestInboundParams, contactId: string): Promise<void> {
  const failed = (error: string) =>
    dbLog().error("consent_channel_write_failed", { tenant_id: p.tenantId, contact_id: contactId, error });
  try {
    const { error } = await db.rpc("note_yes_on_channel", {
      p_tenant_id: p.tenantId,
      p_contact_id: contactId,
      p_channel: p.channel,
      p_message_external_id: p.messageExternalId,
      p_words: (p.body ?? "").slice(0, 80),
    });
    // A database that has not been given 00297 has no such function, and PostgREST refuses the call by naming it:
    // nothing is kept per channel there yet, so there is nothing to repair.
    const missing =
      error?.code === "PGRST202" ||
      /Could not find the function public\.note_yes_on_channel/.test(error?.message ?? "");
    if (error && !missing) failed(error.message);
  } catch (e) {
    failed(e instanceof Error ? e.message : String(e));
  }
}

export async function ingestInbound(db: Db, p: IngestInboundParams): Promise<IngestResult> {
  const { data, error } = await db.rpc("ingest_inbound", {
    p_tenant_id: p.tenantId,
    p_channel: p.channel,
    p_identity_external_id: p.identityExternalId,
    p_phone_e164: p.phoneE164,
    p_wa_profile_name: p.waProfileName,
    p_message_external_id: p.messageExternalId,
    p_type: p.type,
    p_body: p.body,
    p_channel_ts: p.channelTs,
    p_media: p.media ?? null,
    p_meta: p.meta ?? {},
    p_opt_out: p.optOut ?? false,
    p_opt_in: p.optIn ?? false,
  } as never);
  if (error) throw new Error(`ingest_inbound: ${error.message}`);
  const out = data as unknown as IngestResult;

  // A START is a yes on the channel it came on (contracts consent-channels.ts): see noteYesOnChannel. After the ingest,
  // using the contact it returned.
  if (p.optIn && out?.contact_id) await noteYesOnChannel(db, p, out.contact_id);

  // The OTHER answer, if that is what arrived. Separate call, separate column,
  // separate ledger entry -- which is the whole point: the carriers refused a
  // campaign because one message gave one yes that covered both (error 30913).
  //
  // Best-effort on purpose. A customer who texts YES OFFERS has been received
  // and answered by the time this runs; failing their message because a second
  // write did not land would be a worse outcome than a consent record that has
  // to be repaired. It is logged loudly instead.
  if (p.optInMarketing && out?.contact_id && stoppedNow(out)) {
    dbLog().warn("offers_yes_while_stopped", { tenant_id: p.tenantId, contact_id: out.contact_id, channel: p.channel });
  } else if (p.optInMarketing && out?.contact_id) {
    const args = {
      p_tenant_id: p.tenantId,
      p_contact_id: out.contact_id,
      p_consent: "opted_in",
      p_source: "customer_message",
      p_note: null,
    };
    // The proof (00110): where it came from, which message, what they wrote.
    const evidence = {
      channel: p.channel,
      message_external_id: p.messageExternalId,
      words: (p.body ?? "").slice(0, 80) || null,
    };
    let { error: mErr } = await db.rpc("set_marketing_consent", { ...args, p_evidence: evidence } as never);
    // A database that has not been given 00110 yet has no p_evidence, and
    // PostgREST refuses the call by naming the parameters it could not match.
    // The answer is recorded without its proof rather than not at all; any
    // other refusal is reported below as before.
    if (mErr && /p_evidence/.test(mErr.message))
      ({ error: mErr } = await db.rpc("set_marketing_consent", args as never));
    if (mErr) {
      dbLog().error("marketing_consent_write_failed", {
        tenant_id: p.tenantId,
        contact_id: out.contact_id,
        error: mErr.message,
      });
    }
  }
  return out;
}

/**
 * A no the carrier reported instead of relaying: a text refused with Twilio
 * 21610, the person having replied STOP to the number before we heard (the
 * STOP went to the carrier, or came before the line's webhook pointed here).
 * The number is unreachable whatever our row says (contracts enums.ts, the
 * carriers' words), so the row is brought to agree with the carrier THE WAY
 * ingest_inbound records a STOP it did hear: the three consent columns
 * together, dnc with them, and one contact.consent_changed row -- the carrier
 * as its source, since there is no message of theirs to name. A person
 * already opted out is left as they are, with no second ledger row: the
 * update is guarded and counted, and the event written only for a row that
 * changed. A write that fails THROWS, as ingestInbound's does: the door
 * reports the send as it reports any wire it could not write, rather than a
 * no going unrecorded under a refusal that says it was.
 */
export async function recordCarrierOptOut(
  db: Db,
  p: { tenantId: string; contactId: string; channel: "sms"; previous: string | null },
): Promise<boolean> {
  const { data, error } = await db
    .from("contacts")
    .update({
      consent: "opted_out",
      dnc: true,
      consent_source: CARRIER_CONSENT_SOURCE,
      consent_updated_at: new Date().toISOString(),
    })
    .eq("id", p.contactId)
    .eq("tenant_id", p.tenantId)
    .neq("consent", "opted_out")
    .select("id");
  if (error) throw new Error(`recording the carrier's opt-out for contact ${p.contactId}: ${error.message}`);
  if (!data || data.length === 0) return false;
  const change = { consent: "opted_out", previous: p.previous, source: CARRIER_CONSENT_SOURCE, channel: p.channel };
  await emitEvent(db, p.tenantId, "contact.consent_changed", "contact", p.contactId, change);
  return true;
}

/** Stamp a message handled (replied / deliberately skipped) — retry no-ops after this.
 *  One server-side jsonb merge (no read-modify-write, no lost-update race). */
export async function markProcessed(db: Db, tenantId: string, messageId: string): Promise<void> {
  const { error } = await db.rpc("mark_processed", {
    p_tenant_id: tenantId,
    p_message_id: messageId,
  });
  if (error) throw new Error(`mark_processed: ${error.message}`);
}

/**
 * Say what a customer's message became (the Reports lenses spec, K1): `meta.handled` and, where the model read it,
 * `meta.intent`, merged into the row by message_stamp_handled beside processed_at, never over it, the first answer
 * standing. A door of its own, apart from markProcessed: processed_at is what the deadman sweep reads, so the two are
 * written together and fail alone. A failure throws, and the sink that calls it guards it (pgSafe), as it guards every
 * write of a message's bookkeeping.
 */
export async function stampHandled(
  db: Db,
  tenantId: string,
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
  if (error) throw new Error(`message_stamp_handled: ${error.message}`);
}

export async function recordOutbound(
  db: Db,
  p: {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    sender: "ai" | "human" | "system";
    type?: "text" | "template" | "note";
    body: string;
    externalId: string | null; // wamid from the send response
    meta?: Json;
    /** "queued" is a DRAFT awaiting its veto window — written by the bot,
     *  fired later by outbound_send, cancellable until then. */
    status?: "sent" | "failed" | "queued";
    /** The wire it goes out on: where the person last wrote. WhatsApp unless said. */
    channel?: "whatsapp" | "sms" | "email";
  },
): Promise<string | null> {
  // An email's row is written before its words leave, under the id its request is frozen with (core deliver.ts): an
  // id minted here, after the send, is one no receipt can name.
  if (p.channel === "email")
    throw new Error("record_outbound: an email's row is written before it is sent, never after");
  const { data, error } = await db
    .from("messages")
    .insert({
      tenant_id: p.tenantId,
      conversation_id: p.conversationId,
      contact_id: p.contactId,
      channel: p.channel ?? "whatsapp",
      direction: "outbound",
      sender: p.sender,
      type: p.type ?? "text",
      body: p.body,
      external_id: p.externalId,
      status: p.status ?? "sent",
      meta: p.meta ?? {},
    })
    .select("id")
    .single();
  if (error) {
    // duplicate wamid (retry) is benign
    if (error.code === "23505") return null;
    throw new Error(`record_outbound: ${error.message}`);
  }
  // A queued draft or a failed row has not gone out. The event that says a
  // message did is the send moment first_replies reads (00035) and the line the
  // owner's Activity shows as "A message went out", so it is written only for a
  // row that was sent: a draft gets its one event from deliver() when it
  // actually leaves, and a failure is message.send_failed there. The thread is
  // stamped either way.
  const status = p.status ?? "sent";
  await Promise.all([
    db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", p.conversationId),
    status === "sent"
      ? emitEvent(db, p.tenantId, "message.sent", "message", data.id, { sender: p.sender })
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
async function getOrCreateContact(
  db: Db,
  tenantId: string,
  phoneE164: string,
): Promise<{ id: string; consent: string; dnc: boolean; marketing_consent: string }> {
  const made = await resolvePerson(db, {
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
    .eq("id", made.contact_id)
    .single();
  if (error || !data) throw new Error(`get_or_create_contact reselect: ${error?.message}`);
  return data;
}

/**
 * `extends PurposeBearing` so the claim below is the compiler's and not only the
 * comment's: this row can be handed to `mayMessageFor` whole.
 */
export interface OutboundTarget extends PurposeBearing {
  contactId: string;
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
  /** The channels each yes covers, as the database keeps them (contracts consent-channels.ts); null: WhatsApp alone. */
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
  p: { tenantId: string; phoneE164: string; create?: boolean; touch?: boolean },
): Promise<OutboundTarget | null> {
  // normalizePhone, not a hand-rolled "+" prefix: contacts are keyed on FULL
  // international digits, and a caller that hands us a national-format number
  // would otherwise miss the existing row and (on the create path) open a
  // duplicate contact carrying none of the original's consent history.
  const phone = normalizePhone(p.phoneE164);
  if (!phone) return null;
  const first = await db
    .from("contacts")
    .select("id, consent, dnc, marketing_consent, consent_channels, marketing_channels")
    .eq("tenant_id", p.tenantId)
    .eq("phone_e164", phone)
    .maybeSingle();
  // A database 00297 has not reached has no channel arrays: read again without them, and WhatsApp alone is what a yes covers.
  const { data: existing, error: selErr } = noChannelColumns(first.error)
    ? await db
        .from("contacts")
        .select("id, consent, dnc, marketing_consent")
        .eq("tenant_id", p.tenantId)
        .eq("phone_e164", phone)
        .maybeSingle()
    : first;
  if (selErr) throw new Error(`resolve_outbound_target: ${selErr.message}`);

  // A contact made here has said no yes on any channel yet: its channels are none kept.
  let contact: OutboundContact | null = existing;
  if (!contact) {
    if (!p.create) return null;
    contact = await getOrCreateContact(db, p.tenantId, phone);
  }
  return threadOf(db, p.tenantId, contact, p.touch);
}

/** The contact row an outbound target is made from: who they are to the consent predicate. */
type OutboundContact = { id: string; consent: string; dnc: boolean; marketing_consent: string } & {
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
  tenantId: string,
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
  p: { tenantId: string; contactId: string; touch?: boolean },
): Promise<OutboundTarget | null> {
  const first = await db
    .from("contacts")
    .select(
      "id, consent, dnc, marketing_consent, consent_channels, marketing_channels, erased_at, merged_into_contact_id",
    )
    .eq("tenant_id", p.tenantId)
    .eq("id", p.contactId)
    .maybeSingle();
  // The same answer on a database 00297 has not reached: without the channel arrays, a yes covers WhatsApp alone.
  const { data, error } = noChannelColumns(first.error)
    ? await db
        .from("contacts")
        .select("id, consent, dnc, marketing_consent, erased_at, merged_into_contact_id")
        .eq("tenant_id", p.tenantId)
        .eq("id", p.contactId)
        .maybeSingle()
    : first;
  if (error) throw new Error(`resolve_outbound_target_for_contact: ${error.message}`);
  if (!data || data.erased_at || data.merged_into_contact_id) return null;
  return threadOf(db, p.tenantId, data, p.touch);
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
export async function wireRowOf(db: Db, p: { tenantId: string; conversationId: string; relationship: boolean }) {
  const head = "paused_until, control_kind, control_until, contact_id, contacts (consent, dnc, marketing_consent, ";
  const tail = "email_marketing, erased_at, erasing_since, email, email_suppressed_at), tenants (status)";
  const read = (columns: string) =>
    db
      .from("conversations")
      .select(`${head}${columns}${tail}`)
      .eq("id", p.conversationId)
      .eq("tenant_id", p.tenantId)
      .maybeSingle();
  const full = await read(`consent_channels, marketing_channels, ${p.relationship ? "has_relationship, " : ""}`);
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
  p: { tenantId: string; conversationId: string; source: string },
): Promise<number> {
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();
  const { count, error } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", p.tenantId)
    .eq("conversation_id", p.conversationId)
    .eq("direction", "outbound")
    .gte("created_at", since)
    .contains("meta", { source: p.source });
  if (error) throw new Error(`count_sent_today: ${error.message}`);
  return count ?? 0;
}

/** Delivery receipts: update by wamid; monotone rank enforced by trigger. */
export async function recordStatusByExternalId(
  db: Db,
  tenantId: string,
  externalId: string,
  status: "sent" | "delivered" | "read" | "failed",
  errorDetail?: Json,
): Promise<void> {
  const patch: { status: typeof status; error?: Json } = { status };
  if (errorDetail) patch.error = errorDetail;
  const { error } = await db.from("messages").update(patch).eq("tenant_id", tenantId).eq("external_id", externalId);
  // Unknown wamid (pre-dual-write history) or monotone/terminal rejection: log-and-continue.
  if (error && !/monotone|terminal/.test(error.message)) {
    dbLog().error("record_status_failed", { tenant_id: tenantId, external_id: externalId, error: error.message });
  }
}

/**
 * The message of this workspace a provider's id names (Meta's wamid, Twilio's sid), as it stands, and where it went:
 * what a receipt that reports a failure needs to know before it moves the row (core raiseLateFailure). Null when none
 * carries the id: a receipt for history we never wrote. `to` is the number a text or a WhatsApp message went to, or the
 * address an email did, as the person's row has it now. A read that fails THROWS.
 */
export async function messageByExternalId(db: Db, tenantId: string, externalId: string) {
  const { data, error } = await db
    .from("messages")
    .select("id, conversation_id, direction, sender, channel, status, meta, contacts (phone_e164, email)")
    .eq("tenant_id", tenantId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(`messageByExternalId: ${error.message}`);
  if (!data) return null;
  return {
    messageId: data.id,
    conversationId: data.conversation_id,
    direction: data.direction,
    sender: data.sender,
    status: data.status,
    meta: data.meta,
    to: (data.channel === "email" ? data.contacts?.email : data.contacts?.phone_e164) ?? null,
  };
}

/**
 * What it cost to send a message, as Meta's receipt said it, kept once on its outbound row (message_keep_cost, 00319):
 * the `pricing` object (billable, pricing_model, category, type; no amount), checked key by key by the door, the first
 * answer standing. A refusal throws with the database's words; the receipt door that calls it catches that and logs it,
 * so a cost never costs a receipt. Answers whether a row was written.
 */
export async function keepMessageCost(db: Db, tenantId: string, externalId: string, pricing: Json): Promise<boolean> {
  const { data, error } = await db.rpc("message_keep_cost", {
    p_tenant_id: tenantId,
    p_external_id: externalId,
    p_pricing: pricing,
  });
  if (error) throw new Error(`message_keep_cost: ${error.message}`);
  return data === true;
}

/** Owner replied from the WhatsApp Business app: persist the echo + pause the bot.
 *  Upserts the contact/conversation — an owner-INITIATED thread (customer never
 *  messaged yet) must still record the message and the pause, or the
 *  receptionist answers over the person who just replied.
 *
 *  True when the echo is kept with its pause, or was already (a redelivery); false when a write the database refused
 *  left either undone, which the door answers with a 503 so Meta sends it again (this answered nothing, and the door
 *  acknowledged echoes it had not kept). A pause that fails takes the kept words back out, so the redelivery pauses. */
export async function recordEchoAndPause(
  db: Db,
  p: {
    tenantId: string;
    customerPhoneDigits: string;
    body: string | null;
    externalId: string | null;
    pausedUntilIso: string;
  },
): Promise<boolean> {
  const phone = `+${p.customerPhoneDigits.replace(/^\+/, "")}`;
  // Was an .upsert on the PARTIAL unique index, which PostgREST cannot target —
  // so for any customer without an existing contact row this failed, logged,
  // and returned. The owner's reply from the WhatsApp Business app was never
  // recorded and the AI pause never reached Postgres, which is precisely the
  // divergence this function exists to prevent.
  let contact: { id: string };
  try {
    contact = await getOrCreateContact(db, p.tenantId, phone);
  } catch (e) {
    dbLog().error("record_echo_contact_failed", {
      tenant_id: p.tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
  // The thread, without moving anything on it yet. Meta redelivers a webhook it
  // could not deliver for up to seven days, and this used to pause the thread
  // BEFORE the message insert told it whether the echo was new -- so every
  // redelivery slid `paused_until` forward by another full pause window, muting
  // the receptionist for longer than the owner's setting says, with nothing on
  // any page to explain it. The message is written first now, and its own
  // uniqueness on (tenant_id, external_id) is what says "seen this already".
  const { data: conv, error: verr } = await db
    .from("conversations")
    .upsert({ tenant_id: p.tenantId, contact_id: contact.id }, { onConflict: "tenant_id,contact_id" })
    .select("id")
    .single();
  if (verr || !conv) {
    dbLog().error("record_echo_conv_failed", { tenant_id: p.tenantId, error: verr?.message ?? "no row" });
    return false;
  }
  const { error } = await db.from("messages").insert({
    tenant_id: p.tenantId,
    conversation_id: conv.id,
    contact_id: contact.id,
    channel: "whatsapp",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: p.body,
    external_id: p.externalId,
    status: "sent",
    meta: { echo: true },
  });
  if (error && error.code !== "23505")
    dbLog().error("record_echo_failed", { tenant_id: p.tenantId, conversation_id: conv.id, error: error.message });
  // An echo we have already stored changes nothing else: the owner spoke once.
  // An echo carrying no id of its own cannot be told apart from its own replay,
  // so it still pauses -- a receptionist talking over the owner is the worse of
  // the two failures, and it is what this function exists to prevent.
  if (error?.code === "23505" && p.externalId) return true;
  const { error: perr } = await db
    .from("conversations")
    .update(conversationPatch("owner_echo", { until: p.pausedUntilIso, now: new Date().toISOString() }))
    .eq("id", conv.id)
    .eq("tenant_id", p.tenantId);
  if (perr) {
    // The words kept without their pause would be found by the redelivery and taken for a replay, which pauses
    // nothing: so they are taken back out, and the echo comes again whole. Said with whether that worked.
    const unwound =
      !error && p.externalId
        ? !(await db.from("messages").delete().eq("tenant_id", p.tenantId).eq("external_id", p.externalId)).error
        : null;
    dbLog().error("record_echo_pause_failed", {
      tenant_id: p.tenantId,
      conversation_id: conv.id,
      error: perr.message,
      unwound,
    });
    return false;
  }
  // The receptionist is quiet on this thread because its owner spoke: on the ledger, since nothing on any page said why
  // it stopped answering. Once per echo: a redelivery returned above.
  await emitEvent(db, p.tenantId, "conversation.owner_replied", "conversation", conv.id, { until: p.pausedUntilIso });
  // The pause landed. The words did only when their insert did: one the database refused comes again, and its
  // redelivery writes them (and the pause once more, from its own moment).
  return !error;
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
  tenantId: string,
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
  // waives the pause for a queued row on exactly this promise. The job that
  // would send a withdrawn row finds it canceled and does nothing. A failure
  // here is logged, never fatal: the pause itself landed.
  let withdraw = db
    .from("messages")
    .update({ status: "canceled", error: { reason: "superseded_by_human" } })
    .eq("conversation_id", conversationId)
    .eq("tenant_id", tenantId)
    .eq("sender", "ai")
    .eq("status", "queued");
  if (opts.keepMessageId) withdraw = withdraw.neq("id", opts.keepMessageId);
  const { error: wErr } = await withdraw;
  if (wErr)
    dbLog().error("pause_withdraw_drafts_failed", {
      tenant_id: tenantId,
      conversation_id: conversationId,
      error: wErr.message,
    });
  return true;
}

/**
 * The thread's reply turn (00284; the verb's rule is core inbound/turn.ts): claimed for a message before the model is
 * asked, so a newer message of the thread holds it. False only when a newer message has the turn. A call that fails
 * throws, and the verb reads that as a turn held: a reply is never lost to this bookkeeping.
 */
export async function claimReplyTurn(
  db: Db,
  tenantId: string,
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("claim_reply_turn", {
    p_tenant: tenantId,
    p_conversation: conversationId,
    p_message: messageId,
  });
  if (error) throw new Error(`claim_reply_turn: ${error.message}`);
  return data !== false;
}

/** Whether this message still holds its thread's turn once the model has answered: false only when a newer message took it. */
export async function holdsReplyTurn(db: Db, conversationId: string, messageId: string): Promise<boolean> {
  const { data, error } = await db.rpc("holds_reply_turn", { p_conversation: conversationId, p_message: messageId });
  if (error) throw new Error(`holds_reply_turn: ${error.message}`);
  return data !== false;
}
