// ../contracts/dist/index.js
var OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;
var WA_WINDOW_MS = 24 * 3600 * 1e3;

// src/whatsapp.ts
var GRAPH = "https://graph.facebook.com/v25.0";
function normalizeInbound(m, value) {
  const list = value.contacts || [];
  const contact = list.find((c) => c.wa_id === m.from) ?? (list.length === 1 ? list[0] : void 0);
  const mediaSrc = m.image || m.audio || m.video || m.document || m.sticker || null;
  const isText = m.type === "text" && !!m.text?.body;
  const body = isText ? m.text.body : null;
  return {
    waId: contact?.wa_id || m.from,
    phoneDigits: m.from,
    profileName: contact?.profile?.name || null,
    messageId: m.id,
    type: isText ? "text" : "media",
    rawType: m.type,
    body,
    channelTsIso: m.timestamp ? new Date(Number(m.timestamp) * 1e3).toISOString() : null,
    media: mediaSrc?.id ? (() => {
      const loose = mediaSrc;
      return {
        provider_media_id: mediaSrc.id,
        mime_type: loose.mime_type ?? null,
        caption: loose.caption ?? null,
        filename: loose.filename ?? null,
        fetch_state: "pending"
      };
    })() : null,
    optOut: isText ? OPT_OUT_PATTERN.test(body || "") : false
  };
}
async function sendText(cfg, to, body) {
  const r = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } })
  });
  const out = await r.json().catch(() => ({}));
  return {
    ok: r.ok,
    wamid: out.messages?.[0]?.id ?? null,
    status: r.status,
    errorBody: r.ok ? void 0 : JSON.stringify(out).slice(0, 200)
  };
}
async function sendTemplate(cfg, to, template) {
  const r = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        components: template.params.length ? [{ type: "body", parameters: template.params.map((t) => ({ type: "text", text: t })) }] : []
      }
    })
  });
  const out = await r.json().catch(() => ({}));
  return {
    ok: r.ok,
    wamid: out.messages?.[0]?.id ?? null,
    status: r.status,
    errorBody: r.ok ? void 0 : JSON.stringify(out).slice(0, 200)
  };
}
async function fetchMediaBytes(cfg, providerMediaId) {
  const metaRes = await fetch(`${GRAPH}/${providerMediaId}`, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` }
  });
  if (!metaRes.ok) return null;
  const meta = await metaRes.json().catch(() => ({}));
  if (!meta.url) return null;
  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
  if (!binRes.ok) return null;
  return { bytes: await binRes.arrayBuffer(), mime: meta.mime_type ?? binRes.headers.get("content-type") };
}

// src/voice-retell.ts
import crypto from "crypto";
var API = "https://api.retellai.com";
var E164 = /^\+[1-9]\d{6,14}$/;
function toStatus(s) {
  switch (s) {
    case "registered":
      return "registered";
    case "ongoing":
      return "ongoing";
    case "error":
      return "error";
    default:
      return "ended";
  }
}
function normalizeCall(c) {
  const analysis = c.call_analysis ?? {};
  const from = c.from_number ?? null;
  const computedDuration = c.duration_ms ?? (c.start_timestamp && c.end_timestamp ? c.end_timestamp - c.start_timestamp : null);
  return {
    retellCallId: c.call_id,
    agentId: c.agent_id ?? null,
    direction: c.direction === "outbound" ? "outbound" : "inbound",
    callType: c.call_type ?? null,
    fromE164: from && E164.test(from) ? from : null,
    fromRaw: from,
    toE164: c.to_number && E164.test(c.to_number) ? c.to_number : null,
    status: toStatus(c.call_status),
    startedAtIso: c.start_timestamp ? new Date(c.start_timestamp).toISOString() : null,
    endedAtIso: c.end_timestamp ? new Date(c.end_timestamp).toISOString() : null,
    durationMs: computedDuration ?? null,
    disconnectionReason: c.disconnection_reason ?? null,
    sentiment: analysis.user_sentiment ?? null,
    callSuccessful: analysis.call_successful ?? null,
    inVoicemail: analysis.in_voicemail ?? null,
    summary: analysis.call_summary ?? null,
    transcript: c.transcript ?? null,
    transcriptObject: c.transcript_object ?? null,
    recordingUrl: c.recording_url ?? null,
    publicLogUrl: c.public_log_url ?? null,
    cost: c.call_cost ?? null,
    latency: c.latency ?? null
  };
}
function callSummaryLine(n) {
  const mins = n.durationMs ? Math.max(1, Math.round(n.durationMs / 6e4)) : null;
  const head = n.direction === "inbound" ? "Inbound call" : "Outbound call";
  const dur = mins ? ` \xB7 ${mins} min` : "";
  const body = n.summary?.trim() || (n.inVoicemail ? "Reached voicemail." : "No summary available.");
  return `${head}${dur} \u2014 ${body}`;
}
async function listCalls(cfg, opts) {
  const limit = Math.min(opts.limit ?? 100, 1e3);
  const filter = { agent_id: [opts.agentId] };
  if (opts.afterStartMs) filter.start_timestamp = { lower_threshold: opts.afterStartMs };
  const body = {
    limit,
    sort_order: "descending",
    filter_criteria: filter,
    ...opts.paginationKey ? { pagination_key: opts.paginationKey } : {}
  };
  const r = await fetch(`${API}/v2/list-calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`list-calls ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const out = await r.json();
  const calls = Array.isArray(out) ? out : out.calls ?? [];
  return {
    calls,
    nextKey: calls.length === limit ? calls[calls.length - 1]?.call_id ?? null : null
  };
}
async function getCall(cfg, callId) {
  const r = await fetch(`${API}/v2/get-call/${callId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` }
  });
  if (!r.ok) return null;
  return await r.json();
}
async function fetchRecording(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return { bytes: await r.arrayBuffer(), mime: r.headers.get("content-type") };
}
function verifyRetellSignature(rawBody, header, apiKey) {
  if (!header || !apiKey) return false;
  const m = /v=(\d+),d=([0-9a-f]+)/i.exec(String(header));
  if (!m) return false;
  const [, ts, digest] = m;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1e3) return false;
  const expected = crypto.createHmac("sha256", apiKey).update(rawBody + ts).digest("hex");
  const a = Buffer.from(digest.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export {
  callSummaryLine,
  fetchMediaBytes,
  fetchRecording,
  getCall,
  listCalls,
  normalizeCall,
  normalizeInbound,
  sendTemplate,
  sendText,
  verifyRetellSignature
};
