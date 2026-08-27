// src/envelope.ts
var ok = (data) => ({ ok: true, data });
var err = (code, message, details) => ({
  ok: false,
  error: details === void 0 ? { code, message } : { code, message, details }
});

// src/errors.ts
var ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  "conflict",
  "rate_limited",
  "window_closed",
  "upstream_meta",
  "upstream_retell",
  "upstream_anthropic",
  "internal"
];
var AppError = class extends Error {
  code;
  status;
  details;
  constructor(code, message, status, details) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status ?? DEFAULT_STATUS[code];
    this.details = details;
  }
};
var DEFAULT_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  conflict: 409,
  rate_limited: 429,
  window_closed: 409,
  upstream_meta: 502,
  upstream_retell: 502,
  upstream_anthropic: 502,
  internal: 500
};

// src/phone.ts
function normalizePhone(raw) {
  if (raw == null) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

// src/enums.ts
var TENANT_STATUSES = ["active", "paused", "test"];
var MEMBERSHIP_ROLES = ["owner", "staff"];
var CHANNEL_KINDS = ["whatsapp", "voice", "sms", "email", "instagram"];
var CONVERSATION_STATES = ["open", "needs_human", "snoozed", "archived"];
var MESSAGE_CHANNELS = ["whatsapp", "voice", "sms", "email", "system"];
var MESSAGE_DIRECTIONS = ["inbound", "outbound"];
var MESSAGE_SENDERS = ["customer", "ai", "human", "system"];
var MESSAGE_TYPES = ["text", "template", "media", "call_summary", "note"];
var MESSAGE_STATUSES = ["received", "queued", "sent", "delivered", "read", "failed", "canceled"];
var CONSENT_STATES = ["unknown", "opted_in", "opted_out"];
var JOB_KINDS = [
  "outbound_send",
  "veto_fire",
  "snooze_wake",
  "pause_expire",
  "media_fetch",
  "rollup_daily",
  "deadman",
  "report_weekly",
  "broadcast_send"
];
var JOB_STATES = ["scheduled", "fired", "canceled", "failed"];
var EVENT_KINDS = [
  "message.received",
  "message.sent",
  "message.status",
  "escalation.opened",
  "contact.consent_changed",
  "usage.llm_tokens",
  "usage.wa_conversation",
  "ingest.allowlist_skip",
  "ingest.pg_failed"
];
var OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;

// src/viewmodels.ts
var AGENT = { glyph: "W", name: "WhatsApp Receptionist" };
function shortTime(iso, now) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function initialsOf(name) {
  const parts = name.replace(/[^\p{L}\p{N} +]/gu, "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const p = parts[0] || "?";
  return p.slice(0, 2).toUpperCase();
}
function messageText(m) {
  if (m.body) return m.body;
  if (m.type === "media") {
    const kind = m.meta && m.meta.raw_type || "media";
    return `[${kind} attachment]`;
  }
  return `[${m.type}]`;
}
function toConversationVM(dto, now = /* @__PURE__ */ new Date()) {
  const who = dto.contact.display_name || dto.contact.wa_profile_name || dto.contact.phone_e164 || "Unknown";
  const msgs = dto.messages.map((m) => ({
    from: m.sender === "customer" ? "client" : "agent",
    at: shortTime(m.created_at, now),
    text: messageText(m)
  }));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  const last = dto.messages[dto.messages.length - 1];
  const paused = !!dto.paused_until && new Date(dto.paused_until) > now;
  const needsHuman = dto.state === "needs_human" || paused;
  return {
    id: dto.id,
    who,
    initials: initialsOf(who),
    clientId: null,
    channel: "whatsapp",
    agent: AGENT,
    at: shortTime(dto.last_message_at, now),
    outcome: needsHuman ? "escalated" : dto.state === "snoozed" ? "open" : "handled",
    snippet: last ? messageText(last).slice(0, 110) : "",
    summary: {
      headline: lastInbound ? messageText(lastInbound).slice(0, 110) : "No customer messages yet.",
      bullets: [
        `${dto.messages.length} message${dto.messages.length === 1 ? "" : "s"} \xB7 WhatsApp`,
        needsHuman ? "Bot paused \u2014 a human is handling this thread" : "AI receptionist active"
      ]
    },
    messages: msgs
  };
}
export {
  AppError,
  CHANNEL_KINDS,
  CONSENT_STATES,
  CONVERSATION_STATES,
  ERROR_CODES,
  EVENT_KINDS,
  JOB_KINDS,
  JOB_STATES,
  MEMBERSHIP_ROLES,
  MESSAGE_CHANNELS,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDERS,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  OPT_OUT_PATTERN,
  TENANT_STATUSES,
  err,
  normalizePhone,
  ok,
  toConversationVM
};
//# sourceMappingURL=index.js.map