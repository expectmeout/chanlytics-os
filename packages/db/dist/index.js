// src/service-client.ts
import { createClient } from "@supabase/supabase-js";
function createServiceClient(cfg) {
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// src/repositories/ingest.ts
async function ingestInbound(db, p) {
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
    p_opt_out: p.optOut ?? false
  });
  if (error) throw new Error(`ingest_inbound: ${error.message}`);
  return data;
}
async function markProcessed(db, tenantId, messageId) {
  const { data } = await db.from("messages").select("meta").eq("id", messageId).single();
  const meta = { ...data?.meta ?? {}, processed_at: (/* @__PURE__ */ new Date()).toISOString() };
  const { error } = await db.from("messages").update({ meta }).eq("id", messageId).eq("tenant_id", tenantId);
  if (error) throw new Error(`mark_processed: ${error.message}`);
}
async function recordOutbound(db, p) {
  const { data, error } = await db.from("messages").insert({
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
    meta: p.meta ?? {}
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`record_outbound: ${error.message}`);
  }
  await db.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.conversationId);
  await emitEvent(db, p.tenantId, "message.sent", "message", "message", data.id, { sender: p.sender });
  return data.id;
}
async function recordStatusByExternalId(db, tenantId, externalId, status, errorDetail) {
  const patch = { status };
  if (errorDetail) patch.error = errorDetail;
  const { error } = await db.from("messages").update(patch).eq("tenant_id", tenantId).eq("external_id", externalId);
  if (error && !/monotone/.test(error.message)) {
    console.error("record_status_failed", externalId, error.message);
  }
}
async function recordEchoAndPause(db, p) {
  const phone = `+${p.customerPhoneDigits.replace(/^\+/, "")}`;
  const { data: contact } = await db.from("contacts").select("id").eq("tenant_id", p.tenantId).eq("phone_e164", phone).maybeSingle();
  if (!contact) return;
  const { data: conv } = await db.from("conversations").select("id").eq("tenant_id", p.tenantId).eq("contact_id", contact.id).maybeSingle();
  if (!conv) return;
  await db.from("conversations").update({ state: "needs_human", paused_until: p.pausedUntilIso, last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", conv.id);
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
    meta: { echo: true }
  });
  if (error && error.code !== "23505") console.error("record_echo_failed", error.message);
}
async function pauseConversation(db, tenantId, conversationId, pausedUntilIso) {
  await db.from("conversations").update({ state: "needs_human", paused_until: pausedUntilIso }).eq("id", conversationId).eq("tenant_id", tenantId);
}
async function emitEvent(db, tenantId, kind, category, subjectType, subjectId, data = {}) {
  const { error } = await db.from("events").insert({
    tenant_id: tenantId,
    kind,
    category,
    subject_type: subjectType,
    subject_id: subjectId,
    data
  });
  if (error) console.error("emit_event_failed", kind, error.message);
}

// src/repositories/routing.ts
var cache = /* @__PURE__ */ new Map();
async function resolveChannel(db, kind, externalId) {
  const key = `${kind}:${externalId}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const { data, error } = await db.from("tenant_channels").select("id, tenant_id, kind, status").eq("kind", kind).eq("external_id", externalId).maybeSingle();
  if (error) {
    console.error("resolve_channel_failed", error.message);
    return null;
  }
  const routed = data && data.status === "active" ? { channelId: data.id, tenantId: data.tenant_id, kind: data.kind } : null;
  cache.set(key, routed);
  return routed;
}
export {
  createServiceClient,
  emitEvent,
  ingestInbound,
  markProcessed,
  pauseConversation,
  recordEchoAndPause,
  recordOutbound,
  recordStatusByExternalId,
  resolveChannel
};
//# sourceMappingURL=index.js.map