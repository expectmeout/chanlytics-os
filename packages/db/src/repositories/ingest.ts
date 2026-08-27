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
}

export interface IngestResult {
  message_id: string;
  conversation_id: string;
  contact_id: string;
  is_new: boolean;
  processed: boolean;
  state: string;
  paused_until: string | null;
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
  } as never);
  if (error) throw new Error(`ingest_inbound: ${error.message}`);
  return data as unknown as IngestResult;
}

/** Stamp a message handled (replied / deliberately skipped) — retry no-ops after this. */
export async function markProcessed(db: Db, tenantId: string, messageId: string): Promise<void> {
  const { data } = await db.from("messages").select("meta").eq("id", messageId).single();
  const meta = { ...((data?.meta as Record<string, unknown>) ?? {}), processed_at: new Date().toISOString() };
  const { error } = await db.from("messages").update({ meta }).eq("id", messageId).eq("tenant_id", tenantId);
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
  await db
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", p.conversationId);
  await emitEvent(db, p.tenantId, "message.sent", "message", "message", data.id, { sender: p.sender });
  return data.id;
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
  // Unknown wamid (pre-dual-write history) or monotone rejection: log-and-continue.
  if (error && !/monotone/.test(error.message)) {
    console.error("record_status_failed", externalId, error.message);
  }
}

/** Owner replied from the WhatsApp Business app: persist the echo + pause the bot. */
export async function recordEchoAndPause(
  db: Db,
  p: { tenantId: string; customerPhoneDigits: string; body: string | null; externalId: string | null; pausedUntilIso: string },
): Promise<void> {
  const phone = `+${p.customerPhoneDigits.replace(/^\+/, "")}`;
  const { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("phone_e164", phone)
    .maybeSingle();
  if (!contact) return; // echo for a thread that predates dual-write — nothing to attach to
  const { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("tenant_id", p.tenantId)
    .eq("contact_id", contact.id)
    .maybeSingle();
  if (!conv) return;
  await db.from("conversations")
    .update({ state: "needs_human", paused_until: p.pausedUntilIso, last_message_at: new Date().toISOString() })
    .eq("id", conv.id);
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
