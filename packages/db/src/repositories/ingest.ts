/**
 * Ingestion repositories — the edge's write surface (service-role client).
 * ingest_inbound is the atomic concurrency gate (RPC) and the receptionist's
 * dedupe; everything else is plain row work.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventKind } from "@chanlytics/contracts";
import { normalizePhone, type PurposeBearing } from "@chanlytics/contracts";
import type { Database, Json } from "../database.types";

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

  // The OTHER answer, if that is what arrived. Separate call, separate column,
  // separate ledger entry -- which is the whole point: the carriers refused a
  // campaign because one message gave one yes that covered both (error 30913).
  //
  // Best-effort on purpose. A customer who texts YES OFFERS has been received
  // and answered by the time this runs; failing their message because a second
  // write did not land would be a worse outcome than a consent record that has
  // to be repaired. It is logged loudly instead.
  if (p.optInMarketing && out?.contact_id) {
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
      console.error(
        JSON.stringify({
          level: "error",
          event: "marketing_consent_write_failed",
          tenant_id: p.tenantId,
          contact_id: out.contact_id,
          error: mErr.message,
        }),
      );
    }
  }
  return out;
}

/** Stamp a message handled (replied / deliberately skipped) — retry no-ops after this.
 *  One server-side jsonb merge (no read-modify-write, no lost-update race). */
export async function markProcessed(db: Db, tenantId: string, messageId: string): Promise<void> {
  const { error } = await db.rpc("mark_processed", {
    p_tenant_id: tenantId,
    p_message_id: messageId,
  } as never);
  if (error) throw new Error(`mark_processed: ${error.message}`);
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
      ? emitEvent(db, p.tenantId, "message.sent", "message", "message", data.id, { sender: p.sender })
      : Promise.resolve(),
  ]);
  return data.id;
}

/**
 * Get-or-create a contact by phone.
 *
 * NOT an upsert: `contacts_tenant_phone_uq` is a PARTIAL unique index
 * (`... where phone_e164 is not null`), and PostgREST's `on_conflict=` cannot
 * target a partial index — it fails with "no unique or exclusion constraint
 * matching the ON CONFLICT specification". Every `.upsert(..., { onConflict:
 * "tenant_id,phone_e164" })` in this file was therefore a silent no-op for any
 * contact that did not already exist. Raw SQL can target it (by repeating the
 * WHERE clause) which is why ingest_inbound and ingest_call are unaffected.
 *
 * Insert-then-reselect handles the concurrent case: 23505 means someone else
 * won the race, and their row is the one we want.
 */
async function getOrCreateContact(
  db: Db,
  tenantId: string,
  phoneE164: string,
): Promise<{ id: string; consent: string; dnc: boolean; marketing_consent: string }> {
  const { data, error } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: phoneE164, last_seen_at: new Date().toISOString() })
    // `marketing_consent` rides along so every caller holding this row can answer
    // BOTH consent questions without a second read. On the insert path it is the
    // column default, 'unknown' -- which is the honest answer for somebody who has
    // never been asked, and the one that fails closed on a promotion.
    .select("id, consent, dnc, marketing_consent")
    .single();
  if (!error && data) return data;
  if (error && error.code !== "23505") throw new Error(`get_or_create_contact: ${error.message}`);

  const { data: raced, error: reErr } = await db
    .from("contacts")
    .select("id, consent, dnc, marketing_consent")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .single();
  if (reErr || !raced) throw new Error(`get_or_create_contact reselect: ${reErr?.message}`);
  return raced;
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
  const { data: existing, error: selErr } = await db
    .from("contacts")
    .select("id, consent, dnc, marketing_consent")
    .eq("tenant_id", p.tenantId)
    .eq("phone_e164", phone)
    .maybeSingle();
  if (selErr) throw new Error(`resolve_outbound_target: ${selErr.message}`);

  let contact = existing;
  if (!contact) {
    if (!p.create) return null;
    contact = await getOrCreateContact(db, p.tenantId, phone);
  }

  // `touch` because resolving a thread is not the same as writing to it. A
  // broadcast resolves one per recipient BEFORE the door decides whether they
  // may be messaged, and stamping last_message_at there sends every refused
  // person's thread to the top of the Inbox as if something had happened in it.
  // The stamp belongs to the message: recordOutbound writes it when one lands.
  const { data: conv, error: cErr } = await db
    .from("conversations")
    .upsert(
      {
        tenant_id: p.tenantId,
        contact_id: contact.id,
        ...(p.touch === false ? {} : { last_message_at: new Date().toISOString() }),
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
  };
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
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
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
    console.error("record_status_failed", externalId, error.message);
  }
}

/** Owner replied from the WhatsApp Business app: persist the echo + pause the bot.
 *  Upserts the contact/conversation — an owner-INITIATED thread (customer never
 *  messaged yet) must still record the message and the pause, or the
 *  receptionist answers over the person who just replied. */
export async function recordEchoAndPause(
  db: Db,
  p: {
    tenantId: string;
    customerPhoneDigits: string;
    body: string | null;
    externalId: string | null;
    pausedUntilIso: string;
  },
): Promise<void> {
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
    console.error("record_echo_contact_failed", e instanceof Error ? e.message : e);
    return;
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
    console.error("record_echo_conv_failed", verr?.message);
    return;
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
  if (error && error.code !== "23505") console.error("record_echo_failed", error.message);
  // An echo we have already stored changes nothing else: the owner spoke once.
  // An echo carrying no id of its own cannot be told apart from its own replay,
  // so it still pauses -- a receptionist talking over the owner is the worse of
  // the two failures, and it is what this function exists to prevent.
  if (error?.code === "23505" && p.externalId) return;
  const { error: perr } = await db
    .from("conversations")
    .update({ state: "needs_human", paused_until: p.pausedUntilIso, last_message_at: new Date().toISOString() })
    .eq("id", conv.id)
    .eq("tenant_id", p.tenantId);
  if (perr) console.error("record_echo_pause_failed", perr.message);
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
    .update({ state: "needs_human", paused_until: pausedUntilIso })
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) {
    console.error("pause_conversation_failed", conversationId, error.message);
    return false;
  }
  if (!data || data.length === 0) {
    console.error("pause_conversation_noop", conversationId);
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
  if (wErr) console.error("pause_withdraw_drafts_failed", conversationId, wErr.message);
  return true;
}

export async function emitEvent(
  db: Db,
  tenantId: string,
  kind: EventKind,
  category: string,
  subjectType: string | null,
  subjectId: string | null,
  data: Json = {},
): Promise<void> {
  const { error } = await db.from("events").insert({
    tenant_id: tenantId,
    kind,
    category,
    subject_type: subjectType,
    subject_id: subjectId,
    data,
  });
  if (error) console.error("emit_event_failed", kind, error.message);
}
