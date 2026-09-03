/**
 * Ingestion repositories — the edge's write surface (service-role client).
 * ingest_inbound is the atomic concurrency gate (RPC); everything else is
 * plain row work. All writes are ADDITIVE to the Blob path during dual-write.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@chanlytics/contracts";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;

export interface IngestInboundParams {
  tenantId: string;
  channel: "whatsapp";
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
  return data as unknown as IngestResult;
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
  },
): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .insert({
      tenant_id: p.tenantId,
      conversation_id: p.conversationId,
      contact_id: p.contactId,
      channel: "whatsapp",
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
  await Promise.all([
    db.from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", p.conversationId),
    emitEvent(db, p.tenantId, "message.sent", "message", "message", data.id, { sender: p.sender }),
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
): Promise<{ id: string; consent: string; dnc: boolean }> {
  const { data, error } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: phoneE164, last_seen_at: new Date().toISOString() })
    .select("id, consent, dnc")
    .single();
  if (!error && data) return data;
  if (error && error.code !== "23505") throw new Error(`get_or_create_contact: ${error.message}`);

  const { data: raced, error: reErr } = await db
    .from("contacts")
    .select("id, consent, dnc")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .single();
  if (reErr || !raced) throw new Error(`get_or_create_contact reselect: ${reErr?.message}`);
  return raced;
}

export interface OutboundTarget {
  contactId: string;
  conversationId: string;
  /** 'unknown' | 'opted_in' | 'opted_out' — carried so no caller can send
   *  without having been handed the consent state. */
  consent: string | null;
  dnc: boolean;
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
  p: { tenantId: string; phoneE164: string; create?: boolean },
): Promise<OutboundTarget | null> {
  // normalizePhone, not a hand-rolled "+" prefix: contacts are keyed on FULL
  // international digits, and a caller that hands us a national-format number
  // would otherwise miss the existing row and (on the create path) open a
  // duplicate contact carrying none of the original's consent history.
  const phone = normalizePhone(p.phoneE164);
  if (!phone) return null;
  const { data: existing, error: selErr } = await db
    .from("contacts")
    .select("id, consent, dnc")
    .eq("tenant_id", p.tenantId)
    .eq("phone_e164", phone)
    .maybeSingle();
  if (selErr) throw new Error(`resolve_outbound_target: ${selErr.message}`);

  let contact = existing;
  if (!contact) {
    if (!p.create) return null;
    contact = await getOrCreateContact(db, p.tenantId, phone);
  }

  const { data: conv, error: cErr } = await db
    .from("conversations")
    .upsert(
      {
        tenant_id: p.tenantId,
        contact_id: contact.id,
        last_message_at: new Date().toISOString(),
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
  const { error } = await db
    .from("messages")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("external_id", externalId);
  // Unknown wamid (pre-dual-write history) or monotone/terminal rejection: log-and-continue.
  if (error && !/monotone|terminal/.test(error.message)) {
    console.error("record_status_failed", externalId, error.message);
  }
}

/** Owner replied from the WhatsApp Business app: persist the echo + pause the bot.
 *  Upserts the contact/conversation — an owner-INITIATED thread (customer never
 *  messaged yet) must still record the message and the pause, or PG diverges
 *  from the Blob pause forever. */
export async function recordEchoAndPause(
  db: Db,
  p: { tenantId: string; customerPhoneDigits: string; body: string | null; externalId: string | null; pausedUntilIso: string },
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
  const { data: conv, error: verr } = await db
    .from("conversations")
    .upsert(
      {
        tenant_id: p.tenantId,
        contact_id: contact.id,
        state: "needs_human",
        paused_until: p.pausedUntilIso,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,contact_id" },
    )
    .select("id")
    .single();
  if (verr || !conv) { console.error("record_echo_conv_failed", verr?.message); return; }
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
}

/**
 * Mirror of the Blob pausedUntil semantics for AI-side pauses (non-text / escalation).
 *
 * Returns whether the pause actually landed, and the caller must care.
 *
 * This used to discard the result entirely, which under PG_READS makes it the
 * quietest way to break the product: `paused_until` on this row IS the answer
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
  return true;
}

export async function emitEvent(
  db: Db,
  tenantId: string,
  kind: string,
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
