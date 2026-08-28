/**
 * Ingestion repositories — the edge's write surface (service-role client).
 * ingest_inbound is the atomic concurrency gate (RPC); everything else is
 * plain row work. All writes are ADDITIVE to the Blob path during dual-write.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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
    status?: "sent" | "failed";
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

export interface OutboundTarget {
  contactId: string;
  conversationId: string;
  /** 'unknown' | 'opted_in' | 'opted_out' — carried so no caller can send
   *  without having been handed the consent state. */
  consent: string | null;
  dnc: boolean;
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
  const phone = `+${p.phoneE164.replace(/^\+/, "")}`;
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
    const { data: made, error } = await db
      .from("contacts")
      .upsert(
        { tenant_id: p.tenantId, phone_e164: phone, last_seen_at: new Date().toISOString() },
        { onConflict: "tenant_id,phone_e164" },
      )
      .select("id, consent, dnc")
      .single();
    if (error || !made) throw new Error(`resolve_outbound_target contact: ${error?.message}`);
    contact = made;
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
    .select("id")
    .single();
  if (cErr || !conv) throw new Error(`resolve_outbound_target conversation: ${cErr?.message}`);

  return {
    contactId: contact.id,
    conversationId: conv.id,
    consent: contact.consent ?? null,
    dnc: contact.dnc ?? false,
  };
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
  const { data: contact, error: cerr } = await db
    .from("contacts")
    .upsert(
      { tenant_id: p.tenantId, phone_e164: phone, last_seen_at: new Date().toISOString() },
      { onConflict: "tenant_id,phone_e164" },
    )
    .select("id")
    .single();
  if (cerr || !contact) { console.error("record_echo_contact_failed", cerr?.message); return; }
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

/** Mirror of the Blob pausedUntil semantics for AI-side pauses (non-text / escalation). */
export async function pauseConversation(
  db: Db,
  tenantId: string,
  conversationId: string,
  pausedUntilIso: string,
): Promise<void> {
  await db
    .from("conversations")
    .update({ state: "needs_human", paused_until: pausedUntilIso })
    .eq("id", conversationId)
    .eq("tenant_id", tenantId);
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
