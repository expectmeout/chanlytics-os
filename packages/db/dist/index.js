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
    p_opt_out: p.optOut ?? false,
    p_opt_in: p.optIn ?? false
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
async function getOrCreateContact(db, tenantId, phoneE164) {
  const { data, error } = await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: phoneE164, last_seen_at: (/* @__PURE__ */ new Date()).toISOString() }).select("id, consent, dnc").single();
  if (!error && data) return data;
  if (error && error.code !== "23505") throw new Error(`get_or_create_contact: ${error.message}`);
  const { data: raced, error: reErr } = await db.from("contacts").select("id, consent, dnc").eq("tenant_id", tenantId).eq("phone_e164", phoneE164).single();
  if (reErr || !raced) throw new Error(`get_or_create_contact reselect: ${reErr?.message}`);
  return raced;
}
async function resolveOutboundTarget(db, p) {
  const phone = `+${p.phoneE164.replace(/^\+/, "")}`;
  const { data: existing, error: selErr } = await db.from("contacts").select("id, consent, dnc").eq("tenant_id", p.tenantId).eq("phone_e164", phone).maybeSingle();
  if (selErr) throw new Error(`resolve_outbound_target: ${selErr.message}`);
  let contact = existing;
  if (!contact) {
    if (!p.create) return null;
    contact = await getOrCreateContact(db, p.tenantId, phone);
  }
  const { data: conv, error: cErr } = await db.from("conversations").upsert(
    {
      tenant_id: p.tenantId,
      contact_id: contact.id,
      last_message_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "tenant_id,contact_id" }
  ).select("id").single();
  if (cErr || !conv) throw new Error(`resolve_outbound_target conversation: ${cErr?.message}`);
  return {
    contactId: contact.id,
    conversationId: conv.id,
    consent: contact.consent ?? null,
    dnc: contact.dnc ?? false
  };
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
  let contact;
  try {
    contact = await getOrCreateContact(db, p.tenantId, phone);
  } catch (e) {
    console.error("record_echo_contact_failed", e instanceof Error ? e.message : e);
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

// src/repositories/calls.ts
async function ingestCall(db, tenantId, n, raw) {
  const { data, error } = await db.rpc("ingest_call", {
    p_tenant_id: tenantId,
    p_retell_call_id: n.retellCallId,
    p_agent_id: n.agentId,
    p_from_e164: n.fromE164,
    p_from_raw: n.fromRaw,
    p_to_e164: n.toE164,
    p_direction: n.direction,
    p_call_type: n.callType,
    p_status: n.status,
    p_started_at: n.startedAtIso,
    p_ended_at: n.endedAtIso,
    p_duration_ms: n.durationMs,
    p_disconnection: n.disconnectionReason,
    p_sentiment: n.sentiment,
    p_successful: n.callSuccessful,
    p_in_voicemail: n.inVoicemail,
    p_summary: n.summary,
    p_transcript: n.transcript,
    p_transcript_obj: n.transcriptObject ?? null,
    p_recording: n.recordingUrl ? { provider_url: n.recordingUrl, fetch_state: "pending" } : null,
    p_public_log_url: n.publicLogUrl,
    p_cost: n.cost ?? null,
    p_latency: n.latency ?? null,
    p_raw: raw ?? {}
  });
  if (error) throw new Error(`ingest_call: ${error.message}`);
  return data;
}
async function linkCallMessage(db, tenantId, callId, messageId) {
  const { error } = await db.from("calls").update({ message_id: messageId }).eq("id", callId).eq("tenant_id", tenantId);
  if (error) console.error("link_call_message_failed", error.message);
}
async function setCallRecording(db, tenantId, callId, recording) {
  const { error } = await db.from("calls").update({ recording }).eq("id", callId).eq("tenant_id", tenantId);
  if (error) console.error("set_call_recording_failed", error.message);
}
async function recordCallNote(db, p) {
  const { data, error } = await db.from("messages").insert({
    tenant_id: p.tenantId,
    conversation_id: p.conversationId,
    contact_id: p.contactId,
    channel: "voice",
    direction: "inbound",
    sender: "system",
    type: "call_summary",
    body: p.body,
    external_id: p.externalId,
    channel_ts: p.channelTsIso,
    status: "received"
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return null;
    console.error("record_call_note_failed", error.message);
    return null;
  }
  return data.id;
}

// src/repositories/thread.ts
var DELIVERED = ["sent", "delivered", "read"];
var DAY_MS = 24 * 3600 * 1e3;
var BLOB_CALL_NOTE = /^\[voice call note /;
var isBackfill = (m) => !!m.meta && typeof m.meta === "object" && m.meta.backfill === true;
var effectiveAt = (m) => new Date(m.channel_ts ?? m.created_at).getTime();
async function readThreadState(db, tenantId, conversationId, pausedUntilIso, historyLimit = 16) {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [recent, replies] = await Promise.all([
    db.from("messages").select("body, sender, direction, type, status, created_at, channel_ts, meta").eq("tenant_id", tenantId).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(historyLimit * 3),
    // headroom: duplicates and blanks drop out below
    db.from("messages").select("created_at, meta").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("sender", "ai").eq("direction", "outbound").in("status", DELIVERED).gte("created_at", since)
  ]);
  if (recent.error) throw new Error(`readThreadState/history: ${recent.error.message}`);
  if (replies.error) throw new Error(`readThreadState/replies: ${replies.error.message}`);
  const kept = (recent.data ?? []).filter((m) => {
    const body = (m.body ?? "").trim();
    if (!body) return false;
    if (m.direction === "outbound" && !DELIVERED.includes(String(m.status))) return false;
    if (isBackfill(m) && BLOB_CALL_NOTE.test(body)) return false;
    return true;
  });
  kept.sort((a, b) => effectiveAt(a) - effectiveAt(b));
  const history = kept.map((m) => ({
    // A call note is the customer's own history on another channel — the
    // receptionist should know the call happened, same as it did on Blob.
    role: m.sender === "customer" ? "user" : "assistant",
    content: (m.body ?? "").trim()
  }));
  return {
    history: history.slice(-historyLimit),
    seen: [],
    pausedUntil: pausedUntilIso ? new Date(pausedUntilIso).getTime() : 0,
    // Imported rows carry the timestamp of the IMPORT, not of a send. Counting
    // them would let a backfill silence the bot for a day against a cap it
    // never actually spent.
    replies: (replies.data ?? []).filter((r) => !isBackfill(r)).map((r) => new Date(r.created_at).getTime())
  };
}

// src/repositories/control-plane.ts
async function getTenantConfig(db, tenantId) {
  const { data, error } = await db.from("tenant_config").select("tenant_id, config, version, updated_at").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`getTenantConfig: ${error.message}`);
  return data;
}
async function putTenantConfig(db, tenantId, config, expectedVersion) {
  const { data, error } = await db.from("tenant_config").update({ config, version: expectedVersion + 1 }).eq("tenant_id", tenantId).eq("version", expectedVersion).select("tenant_id, config, version, updated_at").maybeSingle();
  if (error) throw new Error(`putTenantConfig: ${error.message}`);
  return data;
}
async function listPolicies(db, tenantId) {
  const { data, error } = await db.from("policies").select("id, class, mode, subject_type, subject_id, limits, updated_at").eq("tenant_id", tenantId).is("subject_type", null).order("class");
  if (error) throw new Error(`listPolicies: ${error.message}`);
  return data ?? [];
}
async function setPolicyMode(db, tenantId, policyClass, mode) {
  const { data, error } = await db.from("policies").update({ mode }).eq("tenant_id", tenantId).eq("class", policyClass).is("subject_type", null).select("id, class, mode, subject_type, subject_id, limits, updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// src/realtime.ts
var WATCHED = [
  { table: "messages", event: "INSERT" },
  { table: "conversations", event: "*" },
  // pause_expire, snooze_wake, other tabs
  { table: "escalations", event: "*" }
  // opened by the edge, resolved elsewhere
];
function subscribeMessagesInserts(client, onInsert, opts = {}) {
  const topic = `db-changes:${opts.topic ?? "bridge"}`;
  let removed = false;
  let channel = null;
  void (async () => {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token) client.realtime.setAuth(token);
    if (removed) return;
    channel = client.channel(topic);
    for (const w of WATCHED) {
      channel = channel.on(
        "postgres_changes",
        {
          event: w.event,
          schema: "public",
          table: w.table,
          ...opts.tenantId ? { filter: `tenant_id=eq.${opts.tenantId}` } : {}
        },
        (payload) => onInsert(payload.new ?? payload.old ?? {})
      );
    }
    channel = channel.subscribe((status) => {
      if (opts.onStatus) opts.onStatus(status);
      else if (status !== "SUBSCRIBED") console.warn("realtime_status", topic, status);
    });
  })();
  return () => {
    removed = true;
    if (channel) void client.removeChannel(channel);
  };
}
export {
  createServiceClient,
  emitEvent,
  getTenantConfig,
  ingestCall,
  ingestInbound,
  linkCallMessage,
  listPolicies,
  markProcessed,
  pauseConversation,
  putTenantConfig,
  readThreadState,
  recordCallNote,
  recordEchoAndPause,
  recordOutbound,
  recordStatusByExternalId,
  resolveChannel,
  resolveOutboundTarget,
  setCallRecording,
  setPolicyMode,
  subscribeMessagesInserts
};
