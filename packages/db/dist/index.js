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
  const { error } = await db.rpc("mark_processed", {
    p_tenant_id: tenantId,
    p_message_id: messageId
  });
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
  await Promise.all([
    db.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.conversationId),
    emitEvent(db, p.tenantId, "message.sent", "message", "message", data.id, { sender: p.sender })
  ]);
  return data.id;
}
async function recordStatusByExternalId(db, tenantId, externalId, status, errorDetail) {
  const patch = { status };
  if (errorDetail) patch.error = errorDetail;
  const { error } = await db.from("messages").update(patch).eq("tenant_id", tenantId).eq("external_id", externalId);
  if (error && !/monotone|terminal/.test(error.message)) {
    console.error("record_status_failed", externalId, error.message);
  }
}
async function recordEchoAndPause(db, p) {
  const phone = `+${p.customerPhoneDigits.replace(/^\+/, "")}`;
  const { data: contact, error: cerr } = await db.from("contacts").upsert(
    { tenant_id: p.tenantId, phone_e164: phone, last_seen_at: (/* @__PURE__ */ new Date()).toISOString() },
    { onConflict: "tenant_id,phone_e164" }
  ).select("id").single();
  if (cerr || !contact) {
    console.error("record_echo_contact_failed", cerr?.message);
    return;
  }
  const { data: conv, error: verr } = await db.from("conversations").upsert(
    {
      tenant_id: p.tenantId,
      contact_id: contact.id,
      state: "needs_human",
      paused_until: p.pausedUntilIso,
      last_message_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "tenant_id,contact_id" }
  ).select("id").single();
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
var POS_TTL_MS = 5 * 60 * 1e3;
var NEG_TTL_MS = 60 * 1e3;
var cache = /* @__PURE__ */ new Map();
async function resolveChannel(db, kind, externalId) {
  const key = `${kind}:${externalId}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v;
  const { data, error } = await db.from("tenant_channels").select("id, tenant_id, kind, status, number_e164, credentials_ref, config").eq("kind", kind).eq("external_id", externalId).maybeSingle();
  if (error) {
    console.error("resolve_channel_failed", error.message);
    return hit?.v ?? null;
  }
  const routed = data && data.status === "active" ? {
    channelId: data.id,
    tenantId: data.tenant_id,
    kind: data.kind,
    numberE164: data.number_e164,
    credentialsRef: data.credentials_ref,
    config: data.config
  } : null;
  cache.set(key, { v: routed, exp: Date.now() + (routed ? POS_TTL_MS : NEG_TTL_MS) });
  return routed;
}

// src/realtime.ts
function subscribeMessagesInserts(client, onInsert, opts = {}) {
  const topic = `db-messages-inserts:${opts.topic ?? "bridge"}`;
  const channel = client.channel(topic).on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
      ...opts.tenantId ? { filter: `tenant_id=eq.${opts.tenantId}` } : {}
    },
    (payload) => onInsert(payload.new)
  ).subscribe((status) => {
    if (opts.onStatus) opts.onStatus(status);
    else if (status !== "SUBSCRIBED") console.warn("realtime_status", topic, status);
  });
  return () => {
    void client.removeChannel(channel);
  };
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
  resolveChannel,
  subscribeMessagesInserts
};
//# sourceMappingURL=index.js.map