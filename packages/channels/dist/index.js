// ../contracts/dist/index.js
var OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;

// src/whatsapp.ts
var GRAPH = "https://graph.facebook.com/v25.0";
function normalizeInbound(m, value) {
  const contact = (value.contacts || []).find((c) => c.wa_id === m.from) || (value.contacts || [])[0];
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
export {
  fetchMediaBytes,
  normalizeInbound,
  sendText
};
//# sourceMappingURL=index.js.map