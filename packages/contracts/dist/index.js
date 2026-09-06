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
  /** The transactional email provider refused or failed. */
  "upstream_email",
  /** Supabase Auth could not be reached — distinct from "not signed in". */
  "upstream_auth",
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
  upstream_email: 502,
  upstream_auth: 503,
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
function formatPhoneDisplay(e164) {
  if (!e164) return null;
  const digits = String(e164).replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length < 7) return `+${digits}`;
  return `+${digits.replace(/(\d{1,3})(?=(\d{3})+$)/g, "$1 ").trim()}`;
}

// src/enums.ts
var TENANT_STATUSES = ["active", "paused", "test"];
var MEMBERSHIP_ROLES = ["owner", "operator", "viewer"];
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
  "broadcast_send",
  /**
   * Erase one customer's stored Blob thread. The DASHBOARD orchestrates
   * erasure and cannot reach Blob; the EDGE holds BLOB_READ_WRITE_TOKEN and
   * cannot publish QStash jobs. This kind is the seam.
   */
  "blob_thread_erase"
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
  "ingest.pg_failed",
  "message.send_failed",
  "message.send_blocked",
  "message.send_raced_cancel",
  "conversation.reopened",
  "conversation.pause_expired",
  "contact.erased",
  "contact.blob_erased"
];
var OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;
var OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta|yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;
var OFFERS_OPT_IN_PHRASES = { en: "YES OFFERS", es: "SI OFERTAS" };
function optInLink(numberE164, phrase = OFFERS_OPT_IN_PHRASES.en) {
  const digits = String(numberE164 ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(phrase)}`;
}
var ESCALATION_REASONS = [
  "human_token",
  "non_text",
  "refusal",
  "rate_cap",
  "policy_block",
  "send_failed",
  "deadman",
  "brain_error",
  "manual",
  "opt_out",
  "state_unavailable",
  /** Delivered so late that an automated reply would arrive out of nowhere. */
  "stale",
  /** The owner set the receptionist to Ask or Never for THIS person; the
   *  thread is theirs to answer. A choice about one customer, never a
   *  workspace setting. */
  "person_hold",
  /** The workspace's day of model tokens is spent (limits.max_llm_tokens_day). */
  "budget"
];
var ESCALATION_STATES = ["open", "resolved"];
var DECISION_VERBS = [
  "approve",
  "edit",
  "decline",
  "snooze",
  "wake",
  "take_over",
  "hand_back",
  "resolve",
  "archive",
  "reply",
  "cancel_send",
  "pause_agent",
  "resume_agent",
  /**
   * What one member can do to another.
   *
   * The ledger recorded every conversation verb and nothing about the team —
   * the one table where "who did this" is hardest to reconstruct afterwards
   * and matters most. Promoting someone to owner hands them billing, the
   * ability to remove everyone else, and the receptionist's voice.
   *
   * These must stay in step with decisions_verb_check (migration 00023): the
   * database rejects a verb this list allows, and a verb the database allows
   * but this omits cannot be written by any typed caller.
   */
  "invite",
  "revoke_invite",
  "change_role",
  "remove_member",
  /**
   * The only irreversible verb. privacy.html promises deletion on verified
   * request; this is the record that it happened, on subject_type 'contact',
   * and it survives the data it destroyed. Written twice per erasure: once by
   * the owner (actor_type 'user') and once by the job that finishes the Blob
   * leg (actor_type 'system').
   */
  "erase",
  /**
   * A sentence handed to the phone receptionist mid-call, heard by it alone
   * and worked into its next answer (Retell update-live-call). Subject
   * 'call'. The ledger keeps the words: they are the operator's, and they
   * changed what a customer was told.
   */
  "whisper",
  /**
   * A business connected its own channel (Embedded Signup): subject
   * 'channel', payload the number, the WABA and the registration outcome.
   * The one verb whose consequence is a credential in Vault.
   */
  "connect_channel",
  /**
   * A customer's answer about marketing messages, recorded by the person
   * who heard it: subject 'contact', payload the answer, how it was given,
   * and what it was before. The record a broadcast stands on.
   */
  "consent_change",
  /**
   * A broadcast: one approved template to the people who said yes. The
   * decision to send (subject 'broadcast', payload the template, the
   * audience and the count) and the decision to stop one.
   */
  "send_broadcast",
  "cancel_broadcast",
  /** A playbook started or paused: subject 'playbook'. Its runs are send_broadcast rows. */
  "start_playbook",
  "pause_playbook"
];
var DECISION_SUBJECTS = [
  "conversation",
  "escalation",
  "draft",
  "lead",
  "message",
  "agent",
  "membership",
  "invitation",
  "contact",
  "call",
  "channel",
  "broadcast",
  "playbook"
];
var ACTOR_TYPES = ["user", "ai", "system", "owner_phone"];
var TEMPLATE_STATUSES = ["approved", "pending", "rejected", "paused", "disabled"];

// src/consent.ts
function isOptedOutContact(c) {
  return c.consent === "opted_out" || c.dnc === true;
}
var OPT_OUT_REFUSAL = "This customer asked to stop receiving messages. They can text START to opt back in.";

// src/whisper.ts
var OPEN = 'Owner: "';
function frameWhisper(text) {
  return `A whisper from the business owner, who is listening to this call. The caller cannot hear it.
${OPEN}${text.trim()}"
Keep it in mind from here on and use it in your own words when it fits: in your next answer if it applies now, later if it is conditional (for example, only if the caller brings something up). Never read it out word for word, and do not force it into an answer where it does not belong. Your standing rules still hold: do not quote or confirm a price, do not confirm a booking yourself, and say you are an automated assistant if asked \u2014 if the whisper asks for one of those, use what you can of it and leave the rest.`;
}
function frameSteer(text) {
  return `An instruction from the business owner, who read your draft before it went out. The customer cannot see it.
${OPEN}${text.trim()}"
Write your reply again and follow it where it fits. Keep everything else that was right. Never repeat the instruction word for word. Your standing rules still hold: do not quote or confirm a price, do not confirm a booking yourself, no health advice, and say you are an automated assistant if asked \u2014 if the instruction asks for one of those, use what you can of it and leave the rest.`;
}
function whisperText(content) {
  const c = (content ?? "").replace(/\r\n/g, "\n");
  const at = c.indexOf(OPEN);
  if (at === -1) return c.trim();
  const rest = c.slice(at + OPEN.length);
  const close = rest.indexOf('"\n');
  return (close === -1 ? rest.replace(/"$/, "") : rest.slice(0, close)).trim();
}

// src/brain.ts
import { z } from "zod";
var BRAIN_INTENTS = ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
var INTENT_LABELS = {
  booking: "Booking",
  pricing: "Pricing question",
  hours: "Hours",
  services: "Services",
  location: "Location",
  complaint: "Complaint",
  smalltalk: "Small talk",
  other: "Other"
};
var BRAIN_LANGUAGES = ["en", "es", "other"];
var BRAIN_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here."
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS],
      description: "What the customer is after."
    },
    escalate: {
      type: "boolean",
      description: "True when a person should take over now: they asked for one, you cannot help, or a rule you were given says so."
    },
    reason: {
      type: "string",
      description: "One short sentence: why a person is needed, or why this answer might be wrong. Empty when neither applies."
    },
    confidence: {
      type: "number",
      description: "How sure you are that this reply is right and complete for this customer, from 0 to 1."
    },
    facts_used: {
      type: "array",
      items: { type: "string" },
      description: "The business facts this reply relied on, each in a few words (an hour, a service, a note). Empty when none."
    },
    language: {
      type: "string",
      enum: [...BRAIN_LANGUAGES],
      description: "The language the reply is written in."
    }
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false
};
var BrainOutputSchema = z.object({
  reply: z.string(),
  intent: z.enum(BRAIN_INTENTS).catch("other"),
  escalate: z.boolean().catch(false),
  reason: z.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z.array(z.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: z.enum(BRAIN_LANGUAGES).catch("other")
});
function parseBrainOutput(raw) {
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const r = BrainOutputSchema.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  if (!r.data.reply.trim()) return { ok: false, error: "empty reply" };
  return { ok: true, value: r.data };
}
function brainMetaOf(out, model) {
  return {
    intent: out.intent,
    confidence: Math.round(out.confidence * 100) / 100,
    reason: out.reason,
    facts_used: out.facts_used,
    language: out.language,
    model
  };
}
function replyWhy(meta) {
  if (!meta || typeof meta !== "object") return null;
  const intent = BRAIN_INTENTS.includes(String(meta.intent)) ? meta.intent : null;
  const conf = typeof meta.confidence === "number" && Number.isFinite(meta.confidence) ? Math.round(Math.min(1, Math.max(0, meta.confidence)) * 100) : null;
  if (intent === null && conf === null) return null;
  const facts = Array.isArray(meta.facts_used) ? meta.facts_used.filter((f) => typeof f === "string" && !!f.trim()) : [];
  const reason = typeof meta.reason === "string" && meta.reason.trim() ? meta.reason.trim() : null;
  const source = typeof meta.source === "string" ? meta.source : null;
  const heldFor = source === "low_confidence" ? "low_confidence" : source === "veto_window" ? "veto_window" : null;
  const label = intent ? INTENT_LABELS[intent] : "Reply";
  return {
    intent: intent ?? "other",
    intentLabel: label,
    confidence: conf,
    reason,
    facts,
    heldFor,
    summary: conf === null ? label : `${label} \xB7 ${conf}% sure`
  };
}
var CONFIDENCE_STEPS = [0, 0.6, 0.75, 0.9];

// src/policy.ts
var PRICE_PATTERNS = [
  /\$\s?\d/,
  /\b\d+(?:[.,]\d{2})?\s?(?:dollars?|usd|bucks?)\b/i,
  /\b\d+(?:[.,]\d{2})?\s?(?:d[oó]lares?|pesos?)\b/i
];
function violatesNoPrices(text) {
  return PRICE_PATTERNS.some((p) => p.test(text));
}
var WA_WINDOW_MS = 24 * 3600 * 1e3;
function waWindow(lastWaInboundAtIso, now = /* @__PURE__ */ new Date()) {
  if (!lastWaInboundAtIso) return { open: false, closesAtIso: null };
  const closes = new Date(lastWaInboundAtIso).getTime() + WA_WINDOW_MS;
  return { open: closes > now.getTime(), closesAtIso: new Date(closes).toISOString() };
}
var CALL_HEARTBEAT_MS = 10 * 60 * 1e3;
function isLiveCall(call, now = /* @__PURE__ */ new Date()) {
  if (call.status !== "ongoing") return false;
  const beat = call.updated_at ?? call.started_at;
  if (!beat) return false;
  const at = new Date(beat).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < CALL_HEARTBEAT_MS;
}
var REPLY_DELAY_DEFAULT_MS = 3e4;
var REPLY_DELAY_MIN_MS = 5e3;
var REPLY_DELAY_MAX_MS = 6e5;
function replyDelayMs(mode, limits) {
  if (mode !== "veto") return 0;
  const raw = limits?.reply_delay_ms;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return REPLY_DELAY_DEFAULT_MS;
  return Math.min(REPLY_DELAY_MAX_MS, Math.max(REPLY_DELAY_MIN_MS, Math.round(raw)));
}

// src/viewmodels.ts
function messageAt(m) {
  return m.channel_ts ?? m.created_at;
}
function isOptedOut(dto) {
  return isOptedOutContact(dto.contact);
}
function messageStatusLabel(status) {
  switch (status) {
    case "queued":
      return "Sending\u2026";
    case "failed":
      return "Didn't send";
    case "canceled":
      return "Canceled before sending";
    case "read":
      return "Read";
    case "delivered":
      return "Delivered";
    default:
      return void 0;
  }
}
function reachedCustomer(status) {
  return status !== "queued" && status !== "failed" && status !== "canceled";
}
var AGENT = { glyph: "W", name: "WhatsApp Receptionist" };
var CALL_NOTE_PREFIX = /^\[voice call note [^\]]*\]\s*(Caller phoned the salon line\.\s*)?(Summary:\s*)?/;
var TIME_FMT = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
var DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var sameDayKey = null;
var sameDayValue = "";
function dayKey(now) {
  if (sameDayKey !== now) {
    sameDayKey = now;
    sameDayValue = now.toDateString();
  }
  return sameDayValue;
}
function shortTime(iso, now) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === dayKey(now) ? TIME_FMT.format(d) : DATE_FMT.format(d);
}
function bubbleTime(iso, now) {
  const d = new Date(iso);
  const time = TIME_FMT.format(d);
  if (d.toDateString() === dayKey(now)) return time;
  return `${DATE_FMT.format(d)} \xB7 ${time}`;
}
function contactName(dto) {
  return dto.contact.display_name || dto.contact.wa_profile_name || formatPhoneDisplay(dto.contact.phone_e164) || "Unknown";
}
function contactMeta(dto) {
  const phone = formatPhoneDisplay(dto.contact.phone_e164);
  return contactName(dto) === phone ? "WhatsApp \xB7 no name saved" : `WhatsApp \xB7 ${phone ?? "no phone"}`;
}
function initialsOf(name) {
  const digits = name.replace(/[^\d]/g, "");
  if (digits.length >= 7 && /^[+\d\s()-]+$/.test(name)) return digits.slice(-2);
  const parts2 = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  if (parts2.length >= 2 && parts2[0] && parts2[1]) return (parts2[0][0] + parts2[1][0]).toUpperCase();
  const p = parts2[0] || "?";
  return p.slice(0, 2).toUpperCase();
}
function isHeldDraft(m) {
  return m.status === "queued" && m.sender === "ai";
}
function draftSendsAtMs(m) {
  const delay = typeof m.meta?.delay_ms === "number" ? m.meta.delay_ms : 0;
  return new Date(m.created_at).getTime() + delay;
}
var MEDIA_LABEL = {
  image: "Photo",
  audio: "Voice note",
  video: "Video",
  document: "Document",
  other: "Attachment"
};
function mediaKind(mime, raw) {
  const t = (mime ?? "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("application/") || t.startsWith("text/")) return "document";
  switch (raw) {
    case "image":
    case "sticker":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "document":
      return "document";
    default:
      return "other";
  }
}
function mediaVM(m) {
  if (m.type !== "media" || !m.media) return null;
  const mime = m.media.mime_type ?? null;
  return {
    messageId: m.id,
    kind: mediaKind(mime, m.meta && m.meta.raw_type || null),
    mime,
    filename: m.media.filename ?? null,
    caption: m.media.caption ?? null,
    available: m.media.fetch_state === "stored"
  };
}
function messageText(m) {
  if (m.type === "call_summary" && m.body) {
    return m.body.replace(CALL_NOTE_PREFIX, "").trim();
  }
  if (m.body) return m.body;
  if (m.type === "media") {
    const label = MEDIA_LABEL[mediaKind(m.media?.mime_type, m.meta && m.meta.raw_type || null)];
    const caption = m.media?.caption?.trim();
    return caption ? `${label}: ${caption}` : label;
  }
  return `[${m.type}]`;
}
var ESCALATION_REASON_LABELS = {
  human_token: "Customer asked for a person",
  refusal: "Assistant declined to answer",
  brain_error: "The receptionist hit an error \u2014 a holding message went out",
  non_text: "Sent a voice note / photo",
  send_failed: "Reply failed to deliver",
  policy_block: "Held by your reply setting \u2014 nothing was sent",
  person_hold: "You handle this person \u2014 the receptionist stays out",
  rate_cap: "Too many replies too fast \u2014 the receptionist paused itself",
  deadman: "Nobody picked this up \u2014 flagged after silence",
  manual: "Flagged manually",
  opt_out: "Asked to stop receiving messages",
  state_unavailable: "The receptionist could not read this thread \u2014 needs a human",
  stale: "Arrived hours late \u2014 too old to answer automatically",
  budget: "The day's model budget is used up \u2014 the receptionist paused itself"
};
var ESCALATION_SUMMARIES = {
  human_token: "They asked for a person. A holding message went out \u2014 they're waiting on you.",
  refusal: "The receptionist wouldn't answer this one. A holding message went out.",
  brain_error: "The receptionist errored and sent a holding message. They're waiting on a real answer.",
  non_text: "They sent a voice note or photo the receptionist can't read. Open it and reply yourself.",
  send_failed: "The reply never reached them \u2014 as far as the customer knows, nobody answered.",
  policy_block: "Your reply setting holds every message for a person. Nothing was sent \u2014 answer them yourself.",
  person_hold: "You set the receptionist to stay out of this person's thread. Nothing was sent \u2014 answer them yourself.",
  rate_cap: "The receptionist hit its daily reply limit and stopped. NOTHING was sent \u2014 they're waiting in silence.",
  deadman: "This sat unanswered long enough to flag. Nobody has replied.",
  manual: "Flagged by hand for a human.",
  opt_out: "They asked to stop receiving messages. Nothing was sent, and nothing may be.",
  state_unavailable: "The receptionist couldn't read this thread, so it stayed quiet. No reply went out.",
  stale: "This reached us hours after they sent it, too late to answer automatically. NOTHING was sent \u2014 they have been waiting since."
};
function formatWaited(ms) {
  const min = Math.max(1, Math.round(ms / 6e4));
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}
function threadStanding(dto, escalation, now = /* @__PURE__ */ new Date()) {
  const paused = !!dto.paused_until && new Date(dto.paused_until) > now;
  const needsHuman = dto.state === "needs_human" || paused;
  const state = dto.state === "snoozed" ? "snoozed" : escalation || needsHuman ? "escalated" : "done";
  const claimedByOther = !!dto.assignee_user_id && dto.assignee_is_me === false;
  const takenOver = state === "escalated" && !claimedByOther && (!!dto.assignee_user_id || !escalation && needsHuman);
  return { state, takenOver, needsYou: state === "escalated" && !takenOver };
}
function toInboxThreadVM(dto, escalation, now = /* @__PURE__ */ new Date()) {
  const who = contactName(dto);
  const paused = !!dto.paused_until && new Date(dto.paused_until) > now;
  const needsHuman = dto.state === "needs_human" || paused;
  const { state, takenOver, needsYou } = threadStanding(dto, escalation, now);
  let draftMsg = null;
  for (let i = dto.messages.length - 1; i >= 0; i--) {
    if (isHeldDraft(dto.messages[i])) {
      draftMsg = dto.messages[i];
      break;
    }
  }
  const heldDraft = draftMsg ? { messageId: draftMsg.id, body: messageText(draftMsg), sendsAtMs: draftSendsAtMs(draftMsg) } : null;
  const claimedByOther = !!dto.assignee_user_id && dto.assignee_is_me === false;
  const reasonLabel = escalation ? ESCALATION_REASON_LABELS[escalation.reason] ?? escalation.reason : null;
  const last = [...dto.messages].reverse().find((m) => m.direction === "inbound" || reachedCustomer(m.status));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  const win = waWindow(dto.last_wa_inbound_at, now).open;
  const timeline = dto.messages.map((m) => {
    const onPhone = m.type === "call_summary";
    const media = mediaVM(m);
    const why = m.sender === "ai" ? replyWhy(m.meta) : null;
    return {
      type: "msg",
      from: m.sender === "customer" ? "client" : "agent",
      channel: onPhone ? "phone" : "whatsapp",
      at: bubbleTime(messageAt(m), now),
      body: messageText(m),
      ...media ? { media } : {},
      ...why ? { why } : {},
      // Who said it, per BUBBLE. The thread carries one agent identity, and the
      // pane rendered that under every agent row — so a phone call summary was
      // signed "by WhatsApp Receptionist", crediting the wrong assistant with
      // work it did not do. The bubble already knows its own channel.
      ...m.sender !== "customer" ? { agentName: onPhone ? "Phone Receptionist" : AGENT.name, agentGlyph: onPhone ? "P" : AGENT.glyph } : {},
      ...m.sender === "human" ? { byYou: true } : {},
      ...m.meta?.source === "broadcast" ? { via: m.meta.playbook_name ? { kind: "playbook", name: String(m.meta.playbook_name) } : { kind: "broadcast", name: String(m.meta.broadcast_name ?? "broadcast") } } : {},
      ...m.sender !== "customer" && m.status ? {
        status: m.status,
        messageId: m.id,
        // The words themselves live in messageStatusLabel, so this pane and
        // the Conversations pane cannot describe the same message
        // differently — which is exactly what they were doing.
        ...messageStatusLabel(m.status) ? { statusLabel: messageStatusLabel(m.status) } : {}
      } : {},
      // A held draft is not a sent message and must not read as one.
      ...isHeldDraft(m) ? { pending: true, sendsAtMs: draftSendsAtMs(m) } : {}
    };
  });
  if (escalation) {
    const idx = dto.messages.findIndex((m) => m.created_at > escalation.created_at);
    const entry = {
      type: "event",
      kind: "flag",
      at: shortTime(escalation.created_at, now),
      body: `Flagged for a human \u2014 ${reasonLabel}${escalation.details ? ` \xB7 \u201C${escalation.details.slice(0, 120)}\u201D` : ""}`
    };
    if (idx === -1) timeline.push(entry);
    else timeline.splice(idx, 0, entry);
  }
  const waitingMin = escalation ? Math.max(1, Math.round((now.getTime() - new Date(escalation.created_at).getTime()) / 6e4)) : void 0;
  return {
    id: `th-${dto.id}`,
    real: true,
    conversationId: dto.id,
    clientId: dto.contact.id || null,
    escalationId: escalation?.id ?? null,
    windowOpen: win,
    optedOut: isOptedOut(dto),
    who,
    whoMeta: contactMeta(dto),
    avatar: initialsOf(who),
    state,
    takenOver,
    needsYou,
    heldDraft,
    ...heldDraft ? {
      veto: {
        window: Math.max(1, Math.round((heldDraft.sendsAtMs - new Date(draftMsg.created_at).getTime()) / 1e3)),
        draft: heldDraft.body,
        endsAtMs: heldDraft.sendsAtMs,
        messageId: heldDraft.messageId,
        ...replyWhy(draftMsg.meta) ? { why: replyWhy(draftMsg.meta) } : {}
      }
    } : {},
    channels: ["whatsapp"],
    primaryChannel: "whatsapp",
    agent: { name: "WhatsApp Receptionist", glyph: "W", autonomy: "Pauses on handoff", tone: "Warm \xB7 bilingual (EN/ES)" },
    subject: (claimedByOther ? "A teammate is answering this" : null) ?? reasonLabel ?? (takenOver ? "You're answering this one" : lastInbound ? messageText(lastInbound).slice(0, 80) : last ? messageText(last).slice(0, 80) : "No messages yet"),
    preview: last ? messageText(last).slice(0, 110) : "",
    summary: escalation ? ESCALATION_SUMMARIES[escalation.reason] ?? `${reasonLabel}. Needs a human.` : takenOver ? "You're answering this one. The receptionist stays quiet until you hand it back." : "The receptionist answered this on its own. Nothing is owed.",
    contextStrip: [
      ...reasonLabel ? [{ label: "Why you", value: reasonLabel }] : [],
      { label: "Waiting", value: waitingMin ? formatWaited(waitingMin * 6e4) : "\u2014", ...waitingMin && waitingMin > 30 ? { warn: true } : {} },
      { label: "Receptionist", value: needsHuman ? "Paused \u2014 you have it" : "Answering" },
      { label: "Reply window", value: win ? "Open \u2014 you can write freely" : "Closed \u2014 template only" }
    ],
    lastAt: shortTime(dto.last_message_at, now),
    lastAtFull: shortTime(dto.last_message_at, now),
    lastAtMs: dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    ...escalation ? { escalatedAtMs: new Date(escalation.created_at).getTime() } : {},
    unread: state === "escalated" && !takenOver,
    pinned: false,
    tags: [],
    priority: "P2",
    ...waitingMin !== void 0 ? { waitingMin } : {},
    ...state === "snoozed" && dto.snooze_until ? { wake: shortTime(dto.snooze_until, now) } : {},
    timeline
  };
}
function toConversationVM(dto, now = /* @__PURE__ */ new Date()) {
  const who = contactName(dto);
  const whoShort = /^[+\d(]/.test(who) ? who : who.split(" ")[0] || who;
  const msgs = dto.messages.map((m) => ({
    from: m.sender === "customer" ? "client" : "agent",
    channel: m.type === "call_summary" ? "phone" : "whatsapp",
    at: bubbleTime(messageAt(m), now),
    text: messageText(m),
    ...mediaVM(m) ? { media: mediaVM(m) } : {},
    ...m.sender === "ai" && replyWhy(m.meta) ? { why: replyWhy(m.meta) } : {},
    // Only for OUR messages. A customer's inbound message has no send status,
    // and labelling it would be inventing one.
    ...m.sender !== "customer" ? {
      ...messageStatusLabel(m.status) ? { statusLabel: messageStatusLabel(m.status) } : {},
      reachedCustomer: reachedCustomer(m.status)
    } : {}
  }));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  const chat = dto.messages.filter((m) => m.type !== "call_summary");
  const callNotes = dto.messages.length - chat.length;
  const last = [...chat].reverse().find((m) => m.direction === "inbound" || reachedCustomer(m.status));
  const paused = !!dto.paused_until && new Date(dto.paused_until) > now;
  const needsHuman = dto.state === "needs_human" || paused;
  const outcome = needsHuman ? "escalated" : last?.direction === "inbound" || dto.state === "snoozed" ? "open" : "handled";
  return {
    id: dto.id,
    who,
    whoShort,
    initials: initialsOf(who),
    clientId: dto.contact.id || null,
    channel: "whatsapp",
    agent: AGENT,
    // The row's time and its preview must come from the SAME message —
    // last_message_at ignored call notes, so a row read "3:22 AM" beside a
    // preview imported at 2:15 PM.
    at: shortTime(last ? messageAt(last) : dto.last_message_at, now),
    outcome,
    snippet: last ? messageText(last).slice(0, 110) : "",
    hasChat: chat.length > 0,
    ts: last ? new Date(messageAt(last)).getTime() : dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    summary: {
      headline: lastInbound ? messageText(lastInbound).slice(0, 110) : "No customer messages yet.",
      bullets: [
        `${chat.length} message${chat.length === 1 ? "" : "s"}${callNotes ? ` \xB7 ${callNotes} call${callNotes === 1 ? "" : "s"}` : ""}${dto.messages[0] ? ` \xB7 started ${shortTime(messageAt(dto.messages[0]), now)}` : ""}`,
        needsHuman ? "Receptionist paused \u2014 a human has this thread" : "Answered by the receptionist"
      ]
    },
    messages: msgs
  };
}
var DISCONNECTION_LABELS = {
  user_hangup: "Customer hung up",
  agent_hangup: "Receptionist ended the call",
  call_transfer: "Transferred to a person",
  voicemail_reached: "Reached voicemail",
  dial_no_answer: "No answer",
  dial_busy: "Line was busy",
  dial_failed: "Call couldn't connect",
  inactivity: "Ended after silence",
  max_duration_reached: "Hit the call length limit",
  concurrency_limit_reached: "Line was busy \u2014 all agents in use",
  user_declined: "Customer declined the call",
  marked_as_spam: "Flagged as spam by the carrier"
};
function mmss(ms) {
  if (!ms || ms < 0) return void 0;
  const total = Math.round(ms / 1e3);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
function spokenDuration(ms) {
  if (!ms) return "Duration not recorded";
  const total = Math.round(ms / 1e3);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m ? `${m} min ${sec} sec` : `${sec} sec`;
}
function toCallVM(dto, now = /* @__PURE__ */ new Date()) {
  const withheld = !dto.from_e164 && !dto.from_raw;
  const phone = formatPhoneDisplay(dto.from_e164);
  const name = dto.contact?.display_name || dto.contact?.wa_profile_name || null;
  const who = withheld ? "Caller ID withheld" : name || phone || dto.from_raw || "Unknown caller";
  const whoShort = name ? /^[+\d(]/.test(name) ? name : name.split(" ")[0] : "Caller";
  const dur = mmss(dto.duration_ms);
  const live = isLiveCall(dto, now);
  const missed = dto.status === "not_connected";
  const headSummary = (dto.summary || "").trim();
  const firstSentence = headSummary ? headSummary.split(/(?<=[.!?])\s/)[0] ?? headSummary : "";
  const bullets = [
    `${dto.direction === "inbound" ? "Inbound" : "Outbound"} \xB7 ${missed ? "never connected" : spokenDuration(dto.duration_ms)}`
  ];
  if (dto.disconnection_reason) {
    bullets.push(`Ended: ${DISCONNECTION_LABELS[dto.disconnection_reason] ?? dto.disconnection_reason.replace(/_/g, " ")}`);
  }
  if (dto.sentiment) {
    bullets.push(`Caller sentiment: ${dto.sentiment} \u2014 the voice provider's own read`);
  }
  const recState = dto.recording?.fetch_state === "stored" ? "ready" : dto.recording?.fetch_state === "failed" ? "failed" : dto.recording ? "pending" : "none";
  if (!missed) {
    bullets.push(
      recState === "ready" ? "Recording saved" : recState === "pending" ? "Recording still processing" : recState === "failed" ? "Recording couldn't be saved from the voice provider" : "No recording for this call"
    );
  }
  if (dto.message_id && !withheld) bullets.push(`Noted on ${whoShort}'s WhatsApp thread`);
  const transcript = (dto.transcript_object ?? []).map((turn) => {
    const start = turn.start ?? turn.words?.[0]?.start;
    if (turn.role === "injected") {
      return { t: "\u2014", speaker: "whisper", text: whisperText(turn.content) };
    }
    return {
      t: typeof start === "number" ? `${Math.floor(start / 60)}:${String(Math.floor(start % 60)).padStart(2, "0")}` : "\u2014",
      speaker: turn.role === "agent" ? "agent" : "client",
      text: turn.content ?? ""
    };
  });
  const snippetBody = missed ? "The call never connected." : firstSentence || (dto.in_voicemail ? "Reached voicemail." : "No summary from this call.");
  return {
    id: `cv-${dto.id}`,
    real: true,
    callId: dto.id,
    who,
    whoShort,
    initials: withheld ? "\u2013" : initialsOf(who),
    clientId: dto.contact_id,
    channel: "phone",
    agent: { glyph: "P", name: "Phone Receptionist" },
    at: shortTime(dto.started_at, now),
    ts: dto.started_at ? new Date(dto.started_at).getTime() : 0,
    ...dur ? { duration: dur } : {},
    outcome: live ? "live" : missed ? "missed" : "handled",
    ...live ? { live: true } : {},
    snippet: withheld ? `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` \xB7 ${dur}` : ""} \u2014 caller ID withheld, so this call isn't linked to a customer.` : `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` \xB7 ${dur}` : ""} \u2014 ${snippetBody}`,
    summary: { headline: firstSentence || snippetBody, bullets },
    transcript,
    recordingState: recState,
    ...recState === "ready" ? { recordingUrl: `/api/v1/calls/${dto.id}/recording` } : {},
    ...dto.conversation_id ? { threadId: `th-${dto.conversation_id}` } : {}
  };
}

// src/live.ts
var LIVE_STALE_MS = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS = 10 * 60 * 1e3;
var RECENT_MAX = 8;
var mmss2 = (ms) => {
  const total = Math.max(0, Math.round(ms / 1e3));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
function fmtClock(seconds) {
  return mmss2(Math.max(0, seconds) * 1e3);
}
function turnsOf(dto) {
  return (dto.transcript_object ?? []).filter((turn) => turn.role === "agent" || turn.role === "user" || turn.role === "injected").map((turn) => {
    const start = turn.start ?? turn.words?.[0]?.start;
    if (turn.role === "injected") {
      return { speaker: "whisper", text: whisperText(turn.content), t: "\u2014" };
    }
    return {
      speaker: turn.role === "agent" ? "agent" : "client",
      text: turn.content ?? "",
      t: typeof start === "number" ? mmss2(start * 1e3) : "\u2014"
    };
  });
}
function toLiveCallVM(dto, now = /* @__PURE__ */ new Date()) {
  const nowMs = now.getTime();
  const withheld = !dto.from_e164 && !dto.from_raw;
  const phone = formatPhoneDisplay(dto.from_e164);
  const name = dto.contact?.display_name || dto.contact?.wa_profile_name || null;
  const who = withheld ? "Caller ID withheld" : name || phone || dto.from_raw || "Unknown caller";
  const whoShort = name ? /^[+\d(]/.test(name) ? name : name.split(" ")[0] : "the caller";
  const live = isLiveCall(dto, now);
  const missed = dto.status === "not_connected";
  const startedAtMs = dto.started_at ? new Date(dto.started_at).getTime() : null;
  const beat = dto.updated_at ?? dto.started_at;
  const heartbeatAtMs = beat ? new Date(beat).getTime() : null;
  let checking = false;
  let checkingWhy = null;
  if (live) {
    const sinceBeat = heartbeatAtMs === null ? 0 : nowMs - heartbeatAtMs;
    const sinceStart = startedAtMs === null ? 0 : nowMs - startedAtMs;
    if (sinceBeat > LIVE_STALE_MS) {
      checking = true;
      checkingWhy = `no word from the phone provider for ${Math.round(sinceBeat / 6e4)} minutes`;
    } else if (sinceStart > LIVE_OVERLONG_MS) {
      checking = true;
      checkingWhy = `live for over ${Math.floor(sinceStart / 6e4)} minutes`;
    }
  }
  const endedMs = dto.ended_at ? new Date(dto.ended_at).getTime() : null;
  const summary = (dto.summary ?? "").trim() || null;
  const summaryState = missed ? "missed" : summary ? "ready" : live || endedMs !== null && nowMs - endedMs < ANALYSIS_GRACE_MS ? "pending" : "none";
  const recordingState = dto.recording?.fetch_state === "stored" ? "ready" : dto.recording?.fetch_state === "failed" ? "failed" : dto.recording ? "pending" : "none";
  return {
    callId: dto.id,
    cvId: `cv-${dto.id}`,
    clientId: dto.contact_id,
    who,
    whoShort,
    initials: withheld ? "\u2013" : initialsOf(who),
    number: withheld ? null : phone ?? dto.from_raw,
    direction: dto.direction,
    status: dto.status,
    live,
    missed,
    stale: dto.status === "ongoing" && !live,
    checking,
    checkingWhy,
    startedAtMs,
    heartbeatAtMs,
    startedLabel: shortTime(dto.started_at, now),
    duration: live || missed || !dto.duration_ms ? null : mmss2(dto.duration_ms),
    summaryState,
    summary,
    sentiment: dto.sentiment,
    endedHow: dto.disconnection_reason ? DISCONNECTION_LABELS[dto.disconnection_reason] ?? dto.disconnection_reason.replace(/_/g, " ") : null,
    recordingState,
    transcript: turnsOf(dto)
  };
}
function toLiveVM(calls, channels, now = /* @__PURE__ */ new Date()) {
  const vms = calls.map((c) => toLiveCallVM(c, now));
  const nowList = vms.filter((c) => c.live).sort((a, b) => (a.startedAtMs ?? 0) - (b.startedAtMs ?? 0));
  const recent = vms.filter((c) => !c.live).sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0)).slice(0, RECENT_MAX);
  const voice = channels?.find((ch) => ch.kind === "voice") ?? null;
  const line = voice ? {
    number: formatPhoneDisplay(voice.number_e164),
    on: voice.status === "active",
    lastCallLabel: voice.last_inbound_at ? shortTime(voice.last_inbound_at, now) : null
  } : null;
  return { now: nowList, recent, line, heartbeatMs: CALL_HEARTBEAT_MS, fetchedAtMs: now.getTime() };
}

// src/today.ts
var CHANNEL_LABEL = { whatsapp: "WhatsApp", voice: "Phone line" };
function tzTime(iso, tz) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz
    }).format(new Date(iso));
  } catch {
    return null;
  }
}
function tzDayAndTime(iso, tz, now) {
  if (!iso) return null;
  const t = tzTime(iso, tz);
  if (!t) return null;
  const key = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const toUtc = (k) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  const days = Math.round((toUtc(key(now)) - toUtc(key(new Date(iso)))) / 864e5);
  if (days < 1) return t;
  if (days === 1) return `yesterday at ${t}`;
  try {
    const d = new Date(iso);
    if (days < 7) {
      const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: tz }).format(d);
      return `${day} at ${t}`;
    }
    const md = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: tz }).format(d);
    return `${md} at ${t}`;
  } catch {
    return t;
  }
}
function secondsPhrase(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}
var SENT = ["sent", "delivered", "read"];
function toTodayVM(m, conversations, escalations, calls, now = /* @__PURE__ */ new Date()) {
  const tz = m.workspace.timezone;
  const p = m.period;
  const live = m.now;
  const localNow = new Date(m.window.now_local);
  const valid = !Number.isNaN(localNow.getTime());
  const hour = valid ? localNow.getHours() : now.getHours();
  const clock = valid ? localNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const datePart = valid ? `${localNow.toLocaleDateString("en-US", { weekday: "long" })} \xB7 ${localNow.toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : "";
  const greeting = hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
  const chips = m.channels.map((c) => ({
    text: `${CHANNEL_LABEL[c.kind] ?? c.kind} ${c.status === "active" ? "connected" : "disconnected"}`,
    ok: c.status === "active"
  }));
  const down = m.channels.filter((c) => c.status !== "active");
  const alert = m.workspace.status === "paused" ? "This workspace is paused \u2014 the receptionist is not answering anything." : down.length ? `${down.map((c) => CHANNEL_LABEL[c.kind] ?? c.kind).join(" and ")} ${down.length > 1 ? "are" : "is"} disconnected \u2014 messages coming in are not being answered.` : null;
  const byConv = new Map(conversations.map((c) => [c.id, c]));
  const openEsc = escalations.filter((e) => e.state === "open").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const needsRows = openEsc.map((e) => {
    const conv = byConv.get(e.conversation_id);
    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : void 0;
    const waitedMs = now.getTime() - new Date(e.created_at).getTime();
    const win = conv ? waWindow(conv.last_wa_inbound_at, now) : null;
    const closes = win?.open ? tzTime(win.closesAtIso, tz) : null;
    return {
      id: `th-${e.conversation_id}`,
      conversationId: e.conversation_id,
      escalationId: e.id,
      who: conv ? contactName(conv) : "Unknown",
      reason: ESCALATION_REASON_LABELS[e.reason] ?? e.reason,
      waited: formatWaited(waitedMs),
      warn: waitedMs > 30 * 6e4,
      // her own words, never a generated characterization of them
      quote: lastCustomer ? messageText(lastCustomer).slice(0, 110) : "",
      meta: conv ? contactMeta(conv) : "WhatsApp",
      windowNote: closes ? `Reply window closes ${closes}` : null,
      to: `inbox/th-${e.conversation_id}`
    };
  });
  const escSet = new Set(openEsc.map((e) => e.conversation_id));
  const closingRows = conversations.filter((c) => {
    if (escSet.has(c.id)) return false;
    const last = c.messages[c.messages.length - 1];
    if (!last || last.sender !== "customer") return false;
    const w = waWindow(c.last_wa_inbound_at, now);
    return w.open && w.closesAtIso ? new Date(w.closesAtIso).getTime() - now.getTime() < 6 * 3600 * 1e3 : false;
  }).map((c) => {
    const w = waWindow(c.last_wa_inbound_at, now);
    const mins = w.closesAtIso ? Math.max(1, Math.round((new Date(w.closesAtIso).getTime() - now.getTime()) / 6e4)) : 0;
    return {
      id: `wc-${c.id}`,
      text: `${contactName(c)} \u2014 window closes ${tzTime(w.closesAtIso, tz) ?? "soon"} (in ${formatWaited(mins * 6e4)})`,
      to: `inbox/th-${c.id}`
    };
  });
  const sinceMs = new Date(m.window.since).getTime();
  const callsInWindow = calls.filter(
    (c) => c.started_at && new Date(c.started_at).getTime() >= sinceMs
  );
  const callMinutes = Math.round(p.call_seconds / 60);
  const traffic = p.messages_in + p.calls + p.messages_out_you;
  const isQuiet = traffic === 0 && live.escalations_open === 0 && !alert;
  const facts = [
    { label: "Messages in", value: String(p.messages_in) },
    { label: "Answered by the receptionist", value: `${p.answered_by_ai} of ${p.messages_in}` },
    p.median_reply_seconds_ai === null ? { label: "Typical reply time", value: "\u2014", hint: "Not enough replies yet" } : { label: "Typical reply time", value: secondsPhrase(p.median_reply_seconds_ai) },
    { label: "Calls", value: p.calls ? `${p.calls}${callMinutes ? ` \xB7 ${callMinutes} min` : ""}` : "0" }
  ];
  const pulse = p.messages_in > 0 ? { num: p.answered_by_ai, den: p.messages_in } : null;
  if (isQuiet) {
    const lastIn = tzDayAndTime(live.last_inbound_at, tz, now);
    const gap = live.last_outbound_at && live.last_inbound_at && new Date(live.last_outbound_at) > new Date(live.last_inbound_at) ? Math.round(
      (new Date(live.last_outbound_at).getTime() - new Date(live.last_inbound_at).getTime()) / 1e3
    ) : null;
    const names = m.channels.map((c) => CHANNEL_LABEL[c.kind] ?? c.kind).join(" and ");
    const plural2 = m.channels.length > 1 ? "are" : "is";
    const sub = m.channels.length === 0 ? "No phone line or WhatsApp number is connected yet, so nothing can come in." : lastIn ? `${names} ${plural2} connected. The last message arrived ${lastIn}${gap !== null && gap > 0 && gap < 3600 ? `, and the receptionist answered ${secondsPhrase(gap)} later.` : "."}` : `${names} ${plural2} connected. No messages have arrived yet.`;
    return {
      standing: {
        eyebrow: `${datePart} \xB7 ${clock} \xB7 ${m.workspace.name}`,
        chips,
        alert: null,
        greeting,
        headline: "Nothing has come in yet today.",
        detail: null,
        tone: "calm"
      },
      needsYou: null,
      windowClosing: null,
      recap: { label: "Today so far", sentences: [], facts, receipts: [] },
      pulse: null,
      calls: null,
      launchpad: [{ label: "Conversations", to: "conversations" }],
      updatedAt: clock,
      quiet: {
        headline: "Nothing has come in yet today.",
        sub,
        proof: [
          ...m.channels.length === 0 ? [{ label: "Channels", value: "none connected yet" }] : [],
          ...m.channels.map((c) => ({
            label: CHANNEL_LABEL[c.kind] ?? c.kind,
            // "on" / "off" in the owner's words, never the column's value.
            value: `${c.number ?? "connected"} \xB7 ${c.status === "active" ? "on" : "off"}`
          })),
          { label: "Checked", value: "just now" }
        ],
        launchpad: conversations.length ? {
          label: `Nothing waiting. ${conversations.length} earlier conversation${conversations.length === 1 ? "" : "s"} \u2192`,
          to: "conversations"
        } : null
      }
    };
  }
  const oldest = tzTime(live.oldest_open_escalation_at, tz);
  let headline;
  let detail = null;
  let tone = "calm";
  if (alert) {
    headline = "Check your connection before anything else.";
    tone = "alert";
  } else if (live.escalations_open > 1) {
    headline = `${live.escalations_open} conversations need you.`;
    if (oldest) detail = `The oldest has been waiting since ${oldest}.`;
    tone = "needs";
  } else if (live.escalations_open === 1) {
    headline = "One conversation needs you";
    const who = needsRows[0]?.who;
    if (who && oldest) detail = `${who} has been waiting since ${oldest}.`;
    tone = "needs";
  } else {
    const bits = [];
    if (p.messages_in) {
      bits.push(
        `${p.messages_in} message${p.messages_in === 1 ? "" : "s"}${p.conversations_active ? ` from ${p.conversations_active} ${p.conversations_active === 1 ? "person" : "people"}` : ""}`
      );
    }
    if (p.calls) bits.push(`${p.calls} call${p.calls === 1 ? "" : "s"}`);
    const allByReceptionist = p.unanswered_in_window === 0 && p.messages_out_you === 0;
    headline = bits.length ? allByReceptionist ? `The receptionist handled everything \u2014 ${bits.join(" and ")} today. Nothing needs you.` : `${bits.join(" and ")} today. Nothing needs you right now.` : "Nothing needs you.";
    if (p.median_reply_seconds_ai !== null && p.messages_in > 0) {
      detail = `It answered ${p.answered_by_ai} of the ${p.messages_in} on its own, typically in about ${secondsPhrase(
        p.median_reply_seconds_ai
      )}.`;
    }
  }
  const sentences = [];
  const headlineCoversTraffic = tone === "calm" && !alert;
  if (p.answered_by_ai && !headlineCoversTraffic) {
    sentences.push({
      text: `The WhatsApp receptionist answered ${p.answered_by_ai} message${p.answered_by_ai === 1 ? "" : "s"}${p.conversations_active ? ` from ${p.conversations_active} ${p.conversations_active === 1 ? "person" : "people"}` : ""}.`
    });
  }
  if (p.calls && !headlineCoversTraffic) {
    sentences.push({
      text: `${p.calls} caller${p.calls === 1 ? "" : "s"} reached the phone line${callMinutes ? ` \u2014 ${callMinutes} minute${callMinutes === 1 ? "" : "s"} total` : ""}.`
    });
  }
  if (p.messages_out_you) {
    sentences.push({ text: `You sent ${p.messages_out_you} repl${p.messages_out_you === 1 ? "y" : "ies"} yourself.` });
  }
  if (p.send_failures) {
    sentences.push({
      text: `${p.send_failures} repl${p.send_failures === 1 ? "y" : "ies"} failed to deliver \u2014 the customer got no answer.`,
      warn: true
    });
  }
  const receipts = conversations.flatMap(
    (c) => c.messages.filter(
      (x) => x.direction === "outbound" && SENT.includes(String(x.status)) && x.meta?.backfill !== true && new Date(x.created_at).getTime() >= sinceMs
    ).map((x) => ({ conv: c, msg: x }))
  ).sort((a, b) => b.msg.created_at.localeCompare(a.msg.created_at)).slice(0, 3).map(({ conv, msg }) => ({
    at: tzTime(msg.created_at, tz) ?? "",
    text: `replied to ${contactName(conv)}: \u201C${messageText(msg).slice(0, 90)}\u201D`,
    to: `inbox/th-${conv.id}`
  }));
  const NEEDS_EAR = ["dial_no_answer", "inactivity", "concurrency_limit_reached", "marked_as_spam"];
  const callRows = callsInWindow.filter((c) => c.status !== "not_connected").map((c) => ({ c, vm: toCallVM(c, now) })).filter(
    ({ c, vm }) => vm.live || c.in_voicemail || c.sentiment === "Negative" || !c.summary || (c.disconnection_reason ? NEEDS_EAR.includes(c.disconnection_reason) : false)
  ).map(({ c, vm }) => {
    const endedMs = c.ended_at ? new Date(c.ended_at).getTime() : NaN;
    const analysisDue = !c.summary && Number.isFinite(endedMs) && now.getTime() - endedMs < ANALYSIS_GRACE_MS;
    return {
      id: c.id,
      who: vm.who,
      at: tzTime(c.started_at, tz) ?? "",
      duration: vm.duration ?? "",
      note: vm.live ? "In progress right now" : c.in_voicemail ? "Reached voicemail" : c.sentiment === "Negative" ? "Caller sentiment: Negative \u2014 the voice provider's own read" : analysisDue ? "Summary on its way from the voice provider" : !c.summary ? "No summary from the voice provider" : DISCONNECTION_LABELS[c.disconnection_reason ?? ""] ?? "Ended early",
      to: vm.live ? "live" : `conversations/cv-${c.id}`
    };
  });
  return {
    standing: {
      eyebrow: `${datePart} \xB7 ${clock} \xB7 ${m.workspace.name}`,
      chips,
      alert,
      greeting,
      headline,
      detail,
      tone
    },
    needsYou: {
      count: live.escalations_open,
      hint: "The receptionist stopped and asked for a human.",
      rows: needsRows,
      empty: needsRows.length ? null : p.unanswered_in_window === 0 && p.messages_out_you === 0 ? "Nothing is waiting on you. The receptionist answered every message that came in, and nobody asked for a person." : "Nothing is waiting on you right now \u2014 nobody asked for a person."
    },
    windowClosing: closingRows.length ? {
      label: "Reply window closing",
      hint: "WhatsApp only lets you write freely for 24 hours after someone messages you. After that it's an approved template.",
      rows: closingRows
    } : null,
    recap: { label: "Today so far", sentences, facts, receipts },
    pulse,
    calls: p.calls ? {
      line: `${p.calls} call${p.calls === 1 ? "" : "s"} today${callMinutes ? ` \xB7 ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""}.`,
      rows: callRows
    } : null,
    launchpad: [
      { label: `Inbox \u2014 ${live.escalations_open} need you`, to: "inbox" },
      { label: "Conversations", to: "conversations" },
      ...p.calls ? [{ label: `Calls \u2014 ${p.calls} today`, to: "conversations/phone" }] : []
    ],
    updatedAt: clock,
    quiet: null
  };
}

// src/config.ts
import { z as z2 } from "zod";
var ROLES = MEMBERSHIP_ROLES;
var ROLE_PERMS = {
  // `settings` is the business details and who is alerted: PUT /settings is
  // owner-only, and the form used to open on the autonomy gate, which let an
  // operator fill it in and be refused at Save.
  // `export` is the whole customer list as a file: a member sees these
  // people a screen at a time, the owner may take them all at once.
  owner: { approve: true, autonomy: true, disconnect: true, billing: true, team: true, settings: true, export: true },
  operator: { approve: true, autonomy: true, disconnect: false, billing: false, team: false, settings: false, export: false },
  viewer: { approve: false, autonomy: false, disconnect: false, billing: false, team: false, settings: false, export: false }
};
var POLICY_CLASSES = ["reply", "booking", "faq", "reengage", "campaign", "money"];
var POLICY_MODES = ["auto", "veto", "ask", "never"];
var PolicyLimitsSchema = z2.object({
  max_replies_day: z2.number().int().min(1).max(200).optional(),
  pause_hours: z2.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: z2.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: z2.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: z2.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME = z2.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema = z2.object({ open: TIME, close: TIME });
var HoursSchema = z2.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME.nullable().optional(),
  close: TIME.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: z2.array(IntervalSchema).optional()
}).strict();
var DATE = z2.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema = z2.object({
  date: DATE,
  until: DATE.optional(),
  note: z2.string().max(200).optional()
});
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema = z2.object({
  name: z2.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: z2.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: z2.string().max(120).optional()
}).strict();
var GuardrailsSchema = z2.object({
  never_quote_prices: z2.boolean().optional(),
  never_confirm_booking: z2.boolean().optional(),
  disclose_ai: z2.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: z2.boolean().optional()
}).strict();
var NoteSchema = z2.object({
  title: z2.string().min(1).max(80),
  text: z2.string().min(1).max(1200)
}).strict();
var BookingRulesSchema = z2.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: z2.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: z2.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: z2.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: z2.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: z2.array(z2.string().min(1).max(80)).max(20).optional(),
  party_max: z2.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: z2.array(z2.string().min(1).max(200)).max(10).optional()
}).strict();
var E164 = /^\+[1-9]\d{6,14}$/;
var BusinessProfileSchema = z2.object({
  address: z2.string().max(300).optional(),
  hours: z2.record(z2.enum(DAYS), HoursSchema).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: z2.array(ClosureSchema).optional(),
  services: z2.array(ServiceSchema).max(60).optional(),
  languages: z2.array(z2.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: z2.array(z2.string().min(1).max(200)).max(20).optional(),
  tone: z2.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: z2.string().regex(E164, "E.164, like +16469325775").optional(),
  website: z2.string().url().max(500).optional(),
  notes: z2.array(NoteSchema).max(10).optional(),
  booking_rules: BookingRulesSchema.optional(),
  /**
   * Anything the owner wants said that no field covers.
   *
   * The escape hatch that keeps this model honest — without it, structuring
   * the facts would mean losing whatever did not fit, and the first migration
   * would be a downgrade.
   */
  extra_instructions: z2.string().max(8e3).optional()
}).strict();
var BrainConfigSchema = z2.object({
  business_name: z2.string().min(1).max(120),
  phone_display: z2.string().min(3).max(40),
  booking_link: z2.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: z2.string().min(40).max(2e4),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema.optional(),
  fallbacks: z2.object({
    /** Sent when no model key is configured. */
    greeting: z2.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: z2.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: z2.string().min(1).max(2e3)
  }).strict()
}).strict();
function newReceptionistDefaults(businessName, phoneDisplay, bookingLink) {
  return {
    system_prompt: `You are the assistant for ${businessName}, answering inbound customer messages. You are warm, concise and professional \u2014 a great front-desk person, in text form. If you do not know something, say so plainly and offer to have a person follow up.`,
    // What a customer reads when the model cannot be reached. Built from what
    // the owner just typed, so they are the business's own details.
    fallbacks: {
      greeting: `Hi! Thanks for reaching out to ${businessName}.

Book anytime: ${bookingLink}

Or reply here with any question.`,
      error: `Thanks for reaching out to ${businessName}! Book anytime: ${bookingLink} \u2014 or a member of our team will reply here soon.`,
      non_text: `Thanks for your message! A member of our team will take a look and reply here soon. For anything urgent, call us at ${phoneDisplay}.`
    }
  };
}
var NotificationsConfigSchema = z2.object({
  escalation_emails: z2.array(z2.string().email()).min(1).max(10),
  from: z2.string().max(200).optional()
}).strict();
var CalendarConfigSchema = z2.object({
  ical_url: z2.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema = z2.object({ vision: z2.boolean().optional() }).strict();
var TenantConfigSchema = z2.object({
  brain: BrainConfigSchema.optional(),
  notifications: NotificationsConfigSchema.optional(),
  calendar: CalendarConfigSchema.optional(),
  features: FeaturesConfigSchema.optional()
});
var MAX_INTERVALS_PER_DAY = 4;
var MAX_CLOSURES = 60;
function isRealDate(key) {
  const at = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === key;
}
var DAY_NAME = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function checkDay(h, day, ctx) {
  const name = DAY_NAME[day] ?? day;
  const at = (...rest) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z2.ZodIssueCode.custom,
        path: at("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z2.ZodIssueCode.custom,
        path: at("intervals", n, "open"),
        message: `${name}: two shifts overlap.`
      });
    }
  }
}
function checkClosure(c, n, ctx) {
  const at = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate(c.date)) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate(c.until)) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema = TenantConfigSchema.superRefine((cfg, ctx) => {
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure(c, n, ctx));
});
function parseTenantConfigResult(raw) {
  const r = TenantConfigSchema.safeParse(raw ?? {});
  if (r.success) return { ok: true, config: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
  };
}
function parseTenantConfig(raw) {
  const r = parseTenantConfigResult(raw);
  return r.ok ? r.config : null;
}
var DAY_LABEL = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function dayIntervals(h) {
  const raw = [];
  if (h?.open && h?.close) raw.push({ open: h.open, close: h.close });
  for (const iv of h?.intervals ?? []) if (iv?.open && iv?.close) raw.push(iv);
  const usable = raw.filter((x) => x.close > x.open).sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  const merged = [];
  for (const iv of usable) {
    const last = merged[merged.length - 1];
    if (last && iv.open <= last.close) {
      if (iv.close > last.close) last.close = iv.close;
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}
function joinList(parts2) {
  if (parts2.length < 3) return parts2.join(" and ");
  return `${parts2.slice(0, -1).join(", ")} and ${parts2[parts2.length - 1]}`;
}
function dayText(h) {
  const spans = dayIntervals(h);
  if (spans.length) {
    const open = joinList(spans.map((x) => `${x.open}\u2013${x.close}`));
    const gaps = spans.slice(1).map((x, i) => `${spans[i].close}\u2013${x.open}`);
    return gaps.length ? `${open} (closed ${joinList(gaps)})` : open;
  }
  const saidSomething = !!(h?.open || h?.close || h?.intervals?.length);
  return saidSomething ? "Hours not confirmed \u2014 ask them to call" : "Closed";
}
function hoursRuns(hours) {
  if (!hours) return [];
  const spans = DAYS.map((d) => ({ day: d, text: dayText(hours[d]) }));
  const out = [];
  let i = 0;
  while (i < spans.length) {
    let j = i;
    while (j + 1 < spans.length && spans[j + 1].text === spans[i].text) j++;
    out.push({ from: spans[i].day, to: spans[j].day, text: spans[i].text });
    i = j + 1;
  }
  return out;
}
function hoursLines(hours) {
  return hoursRuns(hours).map((r) => {
    const label = r.from === r.to ? DAY_LABEL[r.from] : `${DAY_LABEL[r.from]}\u2013${DAY_LABEL[r.to]}`;
    return `${label}: ${r.text}`;
  });
}
function hasProfile(p) {
  if (!p) return false;
  const statedHours = !!p.hours && Object.values(p.hours).some((h) => h?.open && h?.close || h?.intervals?.length);
  return !!(p.address || p.tone || p.extra_instructions || statedHours || p.services?.length || p.languages?.length || p.escalate_when?.length || p.website || p.notes?.length);
}
function dateKeyInZone(tz, at) {
  try {
    const parts2 = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(at);
    const get = (t) => parts2.find((p) => p.type === t)?.value ?? "";
    const y = get("year"), m = get("month"), d = get("day");
    return y && m && d ? `${y}-${m}-${d}` : null;
  } catch {
    return null;
  }
}
function labelDate(key, withWeekday) {
  const at = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(at.getTime()) || dateKeyInZone("UTC", at) !== key) return key;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...withWeekday ? { weekday: "long" } : {},
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(at);
}
function upcomingClosures(closures, tz, at) {
  if (!closures?.length) return [];
  const today = tz && dateKeyInZone(tz, at) || dateKeyInZone("UTC", new Date(at.getTime() - 864e5));
  if (!today) return closures;
  return closures.filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= today).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
function closureLines(closures) {
  return closures.map((c) => {
    const when = c.until && c.until !== c.date && c.until > c.date ? `${labelDate(c.date, false)} \u2013 ${labelDate(c.until, false)}` : labelDate(c.date, true);
    return c.note ? `${when} \u2014 ${c.note}` : when;
  });
}
function closedToday(closures, tz, at) {
  if (!closures?.length || !tz) return null;
  const today = dateKeyInZone(tz, at);
  if (!today) return null;
  return closures.find((c) => {
    const end = c.until && c.until >= c.date ? c.until : c.date;
    return c.date <= today && today <= end;
  }) ?? null;
}
var NO_CLOCK = "You do not know today's date or the current time. If a customer asks whether the business is open right now, or about today or tomorrow, state the opening hours and let them compare \u2014 never guess which day it is.";
function describeNow(tz, now = /* @__PURE__ */ new Date(), closures) {
  if (!tz) return NO_CLOCK;
  try {
    const stamp = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz
    }).format(now);
    const shut = closedToday(closures, tz, now);
    const today = shut ? ` The business is CLOSED today${shut.note ? ` \u2014 ${shut.note}` : ""}, whatever the weekly hours say. Do not offer today; offer the next day it is open.` : "";
    return `Right now it is ${stamp} (${tz}).${today} Use this for anything about today, tomorrow, or whether the business is open at this moment \u2014 compare it against the opening hours and the closed dates, and treat a closed date as final.`;
  } catch {
    return NO_CLOCK;
  }
}
function composeSystemPrompt(base, profile, channel = "whatsapp", tz, now = /* @__PURE__ */ new Date()) {
  const s = [];
  const medium = channel === "voice" ? "on the phone" : "over WhatsApp";
  s.push(`You are the assistant for ${base.business_name}, answering customers ${medium}.`);
  if (profile.tone) s.push(`Tone: ${profile.tone}`);
  if (profile.languages?.length) {
    s.push(
      `You speak: ${profile.languages.join(", ")}.` + // A caller picks the language by speaking it; nobody asks a phone
      // agent to "reply in Spanish".
      (channel === "voice" ? " Answer in whichever of these the caller uses, and switch if they do." : "")
    );
  }
  if (profile.address) s.push(`
Address: ${profile.address}`);
  s.push(`Phone: ${base.phone_display}`);
  s.push(`Booking link: ${base.booking_link}`);
  if (profile.website) s.push(`Website: ${profile.website}`);
  const hrs = hoursLines(profile.hours);
  if (hrs.length) {
    const where = tz ? ` (all times ${tz})` : "";
    s.push(`
Opening hours${where}:
${hrs.map((l) => `- ${l}`).join("\n")}`);
  }
  const closed = closureLines(upcomingClosures(profile.closures, tz, now));
  if (closed.length) {
    s.push(
      `
Closed on these dates, whatever the opening hours above say:
${closed.map((l) => `- ${l}`).join("\n")}
If someone asks about one of these dates, say the business is closed that day and offer the next day it is open.`
    );
  }
  if (profile.services?.length) {
    const lines = profile.services.map((sv) => {
      const bits = [sv.name];
      if (sv.duration_min) bits.push(`about ${sv.duration_min} minutes`);
      if (sv.price_note) bits.push(sv.price_note);
      return `- ${bits.join(" \u2014 ")}`;
    });
    s.push(`
Services:
${lines.join("\n")}`);
  }
  if (profile.notes?.length) {
    s.push(`
Other things to know:
${profile.notes.map((n) => `- ${n.title}: ${n.text}`).join("\n")}`);
  }
  const br = profile.booking_rules;
  if (br && (br.lead_hours !== void 0 || br.consult_first?.length || br.party_max || br.notes?.length)) {
    const lines = [];
    if (br.lead_hours !== void 0) {
      lines.push(
        br.lead_hours === 0 ? "Same-day bookings are fine, right up to the time." : `At least ${br.lead_hours} hour${br.lead_hours === 1 ? "" : "s"}' notice for any appointment.`
      );
    }
    if (br.consult_first?.length) lines.push(`These need a consultation before they can be booked: ${br.consult_first.join(", ")}.`);
    if (br.party_max) lines.push(`Up to ${br.party_max} ${br.party_max === 1 ? "person" : "people"} per booking; larger groups go to a person.`);
    for (const n of br.notes ?? []) lines.push(n);
    s.push(`
Booking rules:
${lines.map((l) => `- ${l}`).join("\n")}`);
  }
  if (channel === "whatsapp") {
    const when = profile.escalate_when?.length ? `
${profile.escalate_when.map((e) => `- ${e}`).join("\n")}` : "";
    s.push(
      `
Handing the conversation to a person:
Put the exact token [[HUMAN]] at the very end of your reply. It is removed before the customer sees it, and it is the only thing that alerts a human \u2014 saying you will fetch someone does nothing on its own. Write the reply you would normally send, then add the token.
Do this whenever the customer asks for a person, is upset, or asks something these instructions do not cover${when ? ", and whenever:" : "."}${when}`
    );
  } else {
    const when = profile.escalate_when?.length ? `
${profile.escalate_when.map((e) => `- ${e}`).join("\n")}` : "";
    const staffed = profile.handoff_number ? "Use transfer_to_staff during opening hours \u2014 it rings the line a person answers, and you stay on until they pick up. Outside opening hours, or if the transfer does not connect, take the caller's name and a short message and say the team will follow up." : "There is no line to transfer to. Take the caller's name and a short message and say the team will follow up.";
    s.push(
      `
Handing the caller to a person:
${staffed}
Do this whenever the caller asks for a person, is upset, or asks something these instructions do not cover${when ? ", and whenever:" : "."}${when}`
    );
    s.push(
      "\nOpen times: use check_availability before offering a time \u2014 it reads the calendar as it is at that moment (a list at the end of these instructions, if any, is from the start of the call). Ask which service first when you can, so only windows long enough are offered.\nBooking: when the caller wants to book, use send_booking_link \u2014 it texts the booking link to the number they are calling from, so do not ask them for a number unless they want it sent somewhere else. Then confirm it was sent. If it fails, give the phone number above and offer to have someone follow up.\nEnding: once the caller has said goodbye, use end_call."
    );
  }
  if (profile.extra_instructions?.trim()) {
    const above = [
      profile.address ? "address" : "",
      hrs.length ? "hours" : "",
      closed.length ? "closed dates" : "",
      profile.services?.length ? "services" : ""
    ].filter(Boolean);
    const stated = above.length > 0;
    const text = profile.extra_instructions.trim();
    const header = [
      stated ? `Further instructions from the business. Where these disagree with the ${joinList(above)} above, the details above are current and correct.` : "",
      channel === "voice" ? "Some of it was written for text conversations; you are on a phone call." : ""
    ].filter(Boolean).join(" ");
    s.push(header ? `
${header}
${text}` : `
${text}`);
  }
  s.push(
    channel === "voice" ? "\nYou are speaking aloud. Keep answers to one or two sentences, never read a URL out character by character, and offer to text the booking link instead." : "\nKeep replies short enough to read on a phone. Send the booking link rather than describing how to book."
  );
  s.push(
    "\nIf open times are listed after these instructions, offer up to three that fit what the customer wants, then send the booking link \u2014 the calendar decides, never you. If none are listed, do not guess at open times; send the link."
  );
  const g = profile.guardrails ?? {};
  const rules = [];
  if (g.never_quote_prices !== false) {
    rules.push("Never quote or confirm a price. Say it is quoted in person or at a consult, and offer the booking link.");
  }
  if (g.never_confirm_booking !== false) {
    rules.push("Never promise or confirm an appointment yourself. Booking happens on the booking link or with staff.");
  }
  if (g.disclose_ai !== false) {
    rules.push("If asked whether you are a bot, a person, or AI, say plainly that you are the business's automated assistant and offer to bring in a person.");
  }
  rules.push("If a message is only the words YES OFFERS or SI OFERTAS, the customer is saying yes to offers and news by WhatsApp: thank them in one short line, say they can reply STOP at any time, and ask nothing else.");
  if (g.no_health_advice === true) {
    rules.push("Never give medical or health advice \u2014 for anything about skin reactions, allergies, pregnancy or medication, say a professional will advise at the appointment and offer the booking link.");
  }
  if (rules.length) s.push(`
Rules you must follow:
${rules.map((r) => `- ${r}`).join("\n")}`);
  return s.join("\n");
}
function resolveSystemPrompt(brain, channel = "whatsapp", tz, now = /* @__PURE__ */ new Date()) {
  if (!hasProfile(brain.profile)) return brain.system_prompt;
  const profile = brain.profile;
  const carried = profile.extra_instructions?.trim() ? profile : { ...profile, extra_instructions: brain.system_prompt };
  return composeSystemPrompt(brain, carried, channel, tz, now);
}

// src/notifications.ts
var DAY_MS = 24 * 3600 * 1e3;
function buildNotificationFeed(input) {
  const { now } = input;
  const items = [];
  for (const t of input.threads ?? []) {
    if (!t.real) continue;
    if (t.needsYou) {
      const at = t.escalatedAtMs ?? (typeof t.waitingMin === "number" ? now - t.waitingMin * 6e4 : t.lastAtMs ?? now);
      items.push({
        key: `needs:${t.id}`,
        kind: "needs_you",
        at,
        title: `${t.who} needs you`,
        message: t.preview ? `They wrote: \u201C${t.preview}\u201D` : "Flagged for a person.",
        to: `inbox/${t.id}`,
        icon: "inbox",
        tone: "warn",
        action: "Open in Inbox"
      });
    }
    if (t.veto && t.veto.endsAtMs > now) {
      const held = t.veto.why?.heldFor === "low_confidence" ? "Not sure enough to send alone" : "Waiting in the hold window";
      items.push({
        key: `draft:${t.veto.messageId}`,
        kind: "held_draft",
        at: t.veto.endsAtMs - t.veto.window * 1e3,
        title: `A reply to ${t.who} is waiting for you`,
        message: `${held} \xB7 \u201C${t.veto.draft.slice(0, 90)}${t.veto.draft.length > 90 ? "\u2026" : ""}\u201D`,
        to: `inbox/${t.id}`,
        icon: "clock",
        tone: "",
        action: "Review"
      });
    }
  }
  for (const c of input.calls ?? []) {
    if (!c.missed || c.live || typeof c.startedAtMs !== "number") continue;
    if (now - c.startedAtMs > DAY_MS) continue;
    items.push({
      key: `call:${c.callId}`,
      kind: "missed_call",
      at: c.startedAtMs,
      title: `Missed call \xB7 ${c.who}`,
      message: c.number ? `${c.number} \u2014 the call never connected.` : "The call never connected.",
      to: `conversations/${c.cvId}`,
      icon: "phone",
      tone: "warn",
      action: "See the call"
    });
  }
  for (const i of input.invites ?? []) {
    const at = Date.parse(i.created_at);
    items.push({
      key: `invite:${i.id}`,
      kind: "invite",
      at: Number.isNaN(at) ? now : at,
      title: `Invitation pending \xB7 ${i.email}`,
      message: "They have not accepted yet.",
      to: "admin/workspace",
      icon: "users",
      tone: "",
      action: "Team"
    });
  }
  return items.sort((a, b) => b.at - a.at);
}
var EMPTY_READ_STATE = { seenAt: 0, read: [], dismissed: [], alerts: false };
function applyReadState(items, state) {
  const read = new Set(state.read);
  const gone = new Set(state.dismissed);
  return items.filter((i) => !gone.has(i.key)).map((i) => ({ ...i, unread: i.at > state.seenAt && !read.has(i.key) }));
}
function agoLabel(atMs, now) {
  const s = Math.max(0, Math.round((now - atMs) / 1e3));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
var ALERT_KINDS = ["needs_you", "held_draft", "missed_call"];

// src/ask.ts
import { z as z3 } from "zod";
var ASK_MAX_CHARS = 1e3;
var ASK_MAX_ROUNDS = 4;
var ASK_TURN_BUDGET_MS = 45e3;
var ASK_TOKENS_DAY = 15e5;
var ASK_RETENTION_DAYS = 90;
var ASK_CAPS = {
  threads: 20,
  messages: 30,
  messagesMore: 80,
  calls: 20,
  transcript: 40,
  people: 12,
  citations: 6,
  followups: 3,
  needsRows: 10
};
var ASK_CITATION_KINDS = ["thread", "conversation", "call", "person", "page"];
var ASK_LANGUAGES = ["en", "es", "other"];
var ASK_FINISH_JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "The answer, in the person's language: two or three short sentences, under sixty words, unless they asked for detail (a transcript, a list). Plain text only: no markdown, no headings, and never a tag such as <answer> or <parameter> inside this string. More than two items go one per line, separated by newlines. Say what you found; if a read returned nothing, say so plainly."
    },
    citations: {
      type: "array",
      description: "The rows the answer rests on, taken ONLY from what the tools returned this turn. Each needs the kind, the exact id the tool gave you, and a short label (a name, a day, a call time).",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...ASK_CITATION_KINDS] },
          id: { type: "string" },
          label: { type: "string" }
        },
        required: ["kind", "id", "label"],
        additionalProperties: false
      }
    },
    followups: {
      type: "array",
      description: "Up to three short questions the person might ask next, in their language. Empty when nothing natural follows.",
      items: { type: "string" }
    },
    navigate: {
      type: "object",
      description: "When the best answer is a page, the route to open and a label. to: the exact `route` field a tool returned for a row (a call, a thread, a person), or a page route (today, inbox, clients, conversations, live, reports, admin/workspace). Empty strings when there is nothing to open. now: true when the person asked to open, show or see that thing; the app goes there as soon as the answer is read, so keep the answer to one line.",
      properties: { to: { type: "string" }, label: { type: "string" }, now: { type: "boolean" } },
      required: ["to", "label", "now"],
      additionalProperties: false
    },
    language: { type: "string", enum: [...ASK_LANGUAGES] }
  },
  required: ["answer", "citations", "followups", "navigate", "language"],
  additionalProperties: false
};
var clip = (n) => (s) => s.trim().slice(0, n);
var TAG_CUT = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
function cleanAnswer(raw) {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}
function recoverCitations(raw) {
  const at = raw.search(/name=["']citations["']/i);
  if (at < 0) return [];
  const start = raw.indexOf("[", at);
  if (start < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "[") depth++;
    else if (raw[i] === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.filter((c) => !!c && typeof c === "object" && typeof c.id === "string" && typeof c.label === "string").map((c) => ({ kind: ASK_CITATION_KINDS.includes(String(c.kind)) ? c.kind : "page", id: c.id.slice(0, 200), label: c.label.slice(0, 80) })).slice(0, ASK_CAPS.citations);
  } catch {
    return [];
  }
}
var AskFinishSchema = z3.object({
  answer: z3.string().catch("").transform((s) => clip(1500)(cleanAnswer(s))),
  citations: z3.array(
    z3.object({
      kind: z3.enum(ASK_CITATION_KINDS).catch("page"),
      id: z3.string().catch("").transform(clip(200)),
      label: z3.string().catch("").transform(clip(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS.citations)),
  followups: z3.array(z3.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS.followups).map((s) => s.slice(0, 90))),
  navigate: z3.object({ to: z3.string().catch(""), label: z3.string().catch(""), now: z3.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: z3.enum(ASK_LANGUAGES).catch("other")
});
function parseAskFinish(raw) {
  let json = raw;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const r = AskFinishSchema.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  if (!r.data.answer) return { ok: false, error: "empty answer" };
  if (!r.data.citations.length && json && typeof json === "object" && typeof json.answer === "string") {
    const leaked = recoverCitations(json.answer);
    if (leaked.length) return { ok: true, value: { ...r.data, citations: leaked } };
  }
  return { ok: true, value: r.data };
}
function emptyReadSet() {
  return { thread: /* @__PURE__ */ new Set(), conversation: /* @__PURE__ */ new Set(), call: /* @__PURE__ */ new Set(), person: /* @__PURE__ */ new Set() };
}
var ASK_PAGE_ROUTES = [
  "today",
  "inbox",
  "clients",
  "conversations",
  "live",
  "reports",
  "admin/workspace",
  "admin/autonomy",
  "admin/notifications",
  "admin/integrations",
  "admin/memory"
];
var PAGE_PREFIX = /^(today|inbox|clients|conversations|live|reports|admin)(\/[A-Za-z0-9:_-]+)?$/;
function groundCitations(citations, read) {
  const kept = [];
  let dropped = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const c of citations) {
    const ok2 = c.kind === "page" ? PAGE_PREFIX.test(c.id) : read[c.kind].has(c.id);
    const key = `${c.kind}:${c.id}`;
    if (!ok2 || seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    kept.push(c);
  }
  return { kept, dropped };
}
function citationRoute(c) {
  switch (c.kind) {
    case "thread":
      return `inbox/th-${c.id}`;
    case "conversation":
      return `conversations/${c.id}`;
    case "call":
      return `conversations/cv-${c.id}`;
    case "person":
      return `clients/${c.id}`;
    default:
      return c.id;
  }
}
var UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function normalizeNavigate(to, read) {
  const s = (to ?? "").trim().replace(/^#?\/+/, "");
  if (!s) return null;
  const id = (UUID_RE.exec(s) ?? [])[0]?.toLowerCase();
  if (id) {
    const head = s.toLowerCase();
    const isCall = /call|cv-|live/.test(head);
    const isPerson = /client|people|person|contact|profile/.test(head);
    const isThread = /inbox|thread|th-|conversation/.test(head);
    if (isCall && read.call.has(id)) return `conversations/cv-${id}`;
    if (isPerson && read.person.has(id)) return `clients/${id}`;
    if (isThread && (read.thread.has(id) || read.conversation.has(id))) return `inbox/th-${id}`;
    if (read.call.has(id)) return `conversations/cv-${id}`;
    if (read.thread.has(id) || read.conversation.has(id)) return `inbox/th-${id}`;
    if (read.person.has(id)) return `clients/${id}`;
    return null;
  }
  return PAGE_PREFIX.test(s) ? s : null;
}
function safeNavigate(to, read) {
  if (!to) return false;
  if (PAGE_PREFIX.test(to)) {
    const m = /^inbox\/th-(.+)$/.exec(to);
    if (m) return read.thread.has(m[1]) || read.conversation.has(m[1]);
    const cv = /^conversations\/cv-(.+)$/.exec(to);
    if (cv) return read.call.has(cv[1]);
    const conv = /^conversations\/([0-9a-f-]{36})$/.exec(to);
    if (conv) return read.conversation.has(conv[1]);
    const person = /^clients\/([0-9a-f-]{36})$/.exec(to);
    if (person) return read.person.has(person[1]);
    return true;
  }
  return false;
}
function isUngrounded(answer, reads) {
  return reads === 0 && /\d/.test(answer);
}
function partialAnswer(prefix) {
  const key = prefix.indexOf('"answer"');
  if (key < 0) return "";
  const raw = partialString(prefix, key);
  const cut = raw.search(TAG_CUT);
  return (cut >= 0 ? raw.slice(0, cut) : raw).replace(/^\s*<answer>\s*/i, "");
}
function partialString(prefix, key) {
  let i = prefix.indexOf('"', prefix.indexOf(":", key) + 1);
  if (i < 0) return "";
  i++;
  let out = "";
  while (i < prefix.length) {
    const c = prefix[i];
    if (c === '"') break;
    if (c === "\\") {
      const n = prefix[i + 1];
      if (n === void 0) break;
      if (n === "n") out += "\n";
      else if (n === "t") out += "	";
      else if (n === "u") {
        const hex = prefix.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16) || 32);
        i += 4;
      } else out += n;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
var PROPOSAL_GATE = {
  reply: "approve",
  steer: "approve",
  thread_verb: "approve",
  whisper: "approve",
  policy: "autonomy",
  person_mode: "settings",
  settings: "settings",
  invite: "team",
  broadcast: "approve",
  playbook: "approve"
};
var AskProposalOutcomeSchema = z3.object({
  state: z3.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z3.string().max(300).catch(""),
  atMs: z3.number().catch(0),
  undo: z3.record(z3.unknown()).nullable().optional()
});
function scopeFromRoute(page, param, label) {
  if (!param) return null;
  if (page === "inbox" && param.startsWith("th-")) return { kind: "thread", id: param.slice(3), label: label || "this thread" };
  if (page === "conversations" && param.startsWith("cv-")) return { kind: "call", id: param.slice(3), label: label || "this call" };
  if (page === "conversations" && /^[0-9a-f-]{36}$/.test(param)) return { kind: "conversation", id: param, label: label || "this conversation" };
  if (page === "clients" && /^[0-9a-f-]{36}$/.test(param)) return { kind: "person", id: param, label: label || "this person" };
  return null;
}
var ES_HINT = /[áéíóúñ¿¡]|\b(qué|que|quién|quien|cómo|como|cuándo|cuando|dónde|donde|hoy|mañana|hola|gracias|abierto|libre|cita|cliente|llam[oó]|llamaron|necesita|espera|por favor|el|la|los|las|una?|est[aá]n?)\b/i;
var EN_HINT = /\b(what|who|when|where|how|did|does|is|are|open|today|tomorrow|call|called|needs|waiting|the|a|an|please|tell)\b/i;
function detectLanguage(text) {
  const es = (text.match(ES_HINT) || []).length;
  const en = (text.match(EN_HINT) || []).length;
  if (!es && !en) return "other";
  return es > en ? "es" : "en";
}
var ASK_PAGES = [
  { label: "Today", to: "today", kind: "page" },
  { label: "Inbox", to: "inbox", kind: "page" },
  { label: "People", to: "clients", kind: "page" },
  { label: "Conversations", to: "conversations", kind: "page" },
  { label: "Calls", to: "live", kind: "page", sub: "live and recent" },
  { label: "Reports", to: "reports", kind: "page" },
  { label: "Settings", to: "admin/workspace", kind: "page" },
  { label: "Autonomy", to: "admin/autonomy", kind: "page", sub: "what the receptionist may do alone" },
  { label: "Team", to: "admin/workspace", kind: "page", sub: "members and invitations" },
  { label: "Notifications", to: "admin/notifications", kind: "page" },
  { label: "Integrations", to: "admin/integrations", kind: "page", sub: "WhatsApp, phone line, calendar" },
  { label: "Receptionist memory", to: "admin/memory", kind: "page", sub: "hours, services, notes" }
];
function askJump(query, index, limit = 6) {
  const s = query.trim().toLowerCase();
  if (s.length < 2 || s.split(/\s+/).length > 3 || /[?¿]$/.test(s)) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (e) => {
    if (seen.has(e.to)) return;
    seen.add(e.to);
    out.push(e);
  };
  for (const p of index) if (p.kind === "page" && p.label.toLowerCase().startsWith(s)) push(p);
  for (const p of index) if (p.kind === "page" && p.label.toLowerCase().includes(s)) push(p);
  for (const p of index) if (p.kind !== "page" && p.label.toLowerCase().includes(s)) push(p);
  return out.slice(0, limit);
}
var T = {
  en: {
    needs: "Who needs me right now?",
    held: "What is the receptionist holding for me?",
    calls: "Did anyone call while I was busy?",
    live: "What is the call on the line about?",
    openSat: "What's open Saturday?",
    openTomorrow: "What's open tomorrow?",
    week: "How did the week go?",
    said: "What did the receptionist tell {name}?",
    why: "Why was this reply held?",
    who: "Who wrote today?",
    rules: "What can the receptionist do on its own?",
    hours: "What are our hours this week?",
    brief: "Brief me on today",
    actLate: "Tell {name} we're running late",
    actLateQ: "Tell {name} we're running about 15 minutes late today",
    actDraft: "Draft a reply to {name}",
    actDraftQ: "Draft a reply to {name}: ",
    actRemember: "Remember something for the receptionist",
    actRememberQ: "Remember that ",
    actClose: "Close the salon on a day",
    actCloseQ: "Close the salon on ",
    actHours: "Change a day's hours",
    actHoursQ: "Change Saturday's hours to ",
    actInvite: "Invite a teammate",
    actInviteQ: "Invite ",
    actOffer: "Send an offer to a list",
    actOfferQ: "Send the ",
    actPlaybook: "Start a win-back playbook",
    actPlaybookQ: "Start a win-back playbook for the quiet clients",
    actHold: "Hold every reply for my review",
    actHoldQ: "Hold every reply for my review before it sends"
  },
  es: {
    needs: "\xBFQui\xE9n me necesita ahora?",
    held: "\xBFQu\xE9 tiene retenido la recepcionista para m\xED?",
    calls: "\xBFLlam\xF3 alguien mientras estaba ocupada?",
    live: "\xBFDe qu\xE9 trata la llamada en curso?",
    openSat: "\xBFQu\xE9 hay libre el s\xE1bado?",
    openTomorrow: "\xBFQu\xE9 hay libre ma\xF1ana?",
    week: "\xBFC\xF3mo fue la semana?",
    said: "\xBFQu\xE9 le dijo la recepcionista a {name}?",
    why: "\xBFPor qu\xE9 se retuvo esta respuesta?",
    who: "\xBFQui\xE9n escribi\xF3 hoy?",
    rules: "\xBFQu\xE9 puede hacer la recepcionista sola?",
    hours: "\xBFCu\xE1l es nuestro horario esta semana?",
    brief: "Res\xFAmeme el d\xEDa",
    actLate: "Dile a {name} que vamos con retraso",
    actLateQ: "Dile a {name} que vamos con unos 15 minutos de retraso hoy",
    actDraft: "Redacta una respuesta a {name}",
    actDraftQ: "Redacta una respuesta a {name}: ",
    actRemember: "Recu\xE9rdale algo a la recepcionista",
    actRememberQ: "Recuerda que ",
    actClose: "Cerrar el sal\xF3n un d\xEDa",
    actCloseQ: "Cierra el sal\xF3n el ",
    actHours: "Cambiar el horario de un d\xEDa",
    actHoursQ: "Cambia el horario del s\xE1bado a ",
    actInvite: "Invitar a alguien del equipo",
    actInviteQ: "Invita a ",
    actOffer: "Enviar una oferta a una lista",
    actOfferQ: "Env\xEDa la ",
    actPlaybook: "Iniciar un playbook de recuperaci\xF3n",
    actPlaybookQ: "Inicia un playbook de recuperaci\xF3n para los clientes inactivos",
    actHold: "Retener cada respuesta para revisarla",
    actHoldQ: "Ret\xE9n cada respuesta para mi revisi\xF3n antes de enviarla"
  }
};
function buildAskSuggestions(input) {
  const t = T[input.language === "es" ? "es" : "en"];
  const out = [];
  const add = (q, kind, icon, fast = false) => {
    if (!out.some((s2) => s2.q === q)) out.push({ q, kind, icon, fast });
  };
  const s = input.scope;
  if (s && (s.kind === "thread" || s.kind === "conversation" || s.kind === "person")) {
    add(t.said.replace("{name}", s.label), "ask", "chat");
    if (s.kind === "thread") add(t.why, "ask", "sparkle");
  }
  if (s && s.kind === "call") add(t.live, "ask", "phone");
  if (input.needsYou > 0) add(t.needs, "ask", "inbox", true);
  if (input.heldDrafts > 0) add(t.held, "ask", "clock");
  if (input.liveNow > 0) add(t.live, "ask", "phone");
  if (input.missedToday > 0) add(t.calls, "ask", "phone", true);
  if (input.hasCalendar) add(input.surface === "today" ? t.openTomorrow : t.openSat, "ask", "calendar", true);
  switch (input.surface) {
    case "today":
      add(t.brief, "ask", "sparkle");
      add(t.who, "ask", "users");
      break;
    case "inbox":
      add(t.who, "ask", "users");
      add(t.rules, "ask", "shield");
      break;
    case "people":
      add(t.who, "ask", "users");
      break;
    case "reports":
      add(t.week, "ask", "trending-up");
      break;
    case "settings":
      add(t.rules, "ask", "shield");
      add(t.hours, "ask", "clock");
      break;
    case "live":
    case "conversations":
      add(t.calls, "ask", "phone", input.missedToday > 0);
      break;
    default:
      break;
  }
  if (input.needsYou === 0) add(t.needs, "ask", "inbox", true);
  add(t.week, "ask", "trending-up");
  add(t.rules, "ask", "shield");
  const asks = out.slice(0, 7);
  if (!input.canAct) return asks;
  const acts = [];
  const act = (label, q, icon, compose = false) => {
    if (!acts.some((a) => a.q === q)) acts.push({ q, kind: "act", icon, label, compose });
  };
  if (s && (s.kind === "thread" || s.kind === "conversation" || s.kind === "person")) {
    act(t.actLate.replace("{name}", s.label), t.actLateQ.replace("{name}", s.label), "chat");
    act(t.actDraft.replace("{name}", s.label), t.actDraftQ.replace("{name}", s.label), "edit", true);
  }
  act(t.actRemember, t.actRememberQ, "sparkle", true);
  if (input.surface === "settings" || input.surface === "today") act(t.actClose, t.actCloseQ, "calendar", true);
  if (input.surface === "settings") act(t.actHours, t.actHoursQ, "clock", true);
  if (input.surface === "settings") act(t.actInvite, t.actInviteQ, "users", true);
  if (input.surface === "inbox" || input.heldDrafts > 0) act(t.actHold, t.actHoldQ, "shield");
  if (input.surface === "people" || input.surface === "other") act(t.actOffer, t.actOfferQ, "wave", true);
  if (input.surface === "people" || input.surface === "other") act(t.actPlaybook, t.actPlaybookQ, "bolt");
  return [...asks, ...acts.slice(0, 4)];
}
var NEEDS_RE = /\b(who needs me|who needs my|needs? (my|me)\b|what('s| is| do i have)? waiting|waiting (on|for) me|anyone waiting|qui[eé]n me necesita|qu[eé] (me )?espera|qu[eé] (hay )?pendiente|pendientes?)\b/i;
var CALLS_RE = /\b((did|has|have) (anyone|someone|anybody|somebody) (call|called|rang|phoned)|missed calls?|who called|any calls?|llam[oó] alguien|llamaron|llamadas? perdidas?|qui[eé]n llam[oó]|alguna llamada)\b/i;
var OPEN_RE = /\b(what('s| is) open|what('s| is) free|openings?|availab|free (slot|slots|time)|any (slots?|room|space|time)|qu[eé] (hay|tengo) (libre|disponible)|disponibilidad|disponibles?|huecos?|espacios? libres?|cu[aá]ndo (hay|tienen) (libre|espacio))\b/i;
var DAY_WORDS = [
  [/\b(mon|monday|lunes)\b/i, "mon"],
  [/\b(tue|tues|tuesday|martes)\b/i, "tue"],
  [/\b(wed|wednesday|mi[eé]rcoles)\b/i, "wed"],
  [/\b(thu|thur|thursday|jueves)\b/i, "thu"],
  [/\b(fri|friday|viernes)\b/i, "fri"],
  [/\b(sat|saturday|s[aá]bado)\b/i, "sat"],
  [/\b(sun|sunday|domingo)\b/i, "sun"]
];
function dayKey2(atMs, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || void 0, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(atMs));
  } catch {
    return new Date(atMs).toISOString().slice(0, 10);
  }
}
function dayFromQuestion(q, now, tz) {
  if (/\b(tomorrow|mañana)\b/i.test(q)) return dayKey2(now + 864e5, tz);
  if (/\b(today|hoy)\b/i.test(q)) return dayKey2(now, tz);
  for (const [re, key] of DAY_WORDS) if (re.test(q)) return key;
  return null;
}
function fastPath(question, ctx) {
  const q = question.trim();
  if (!q || q.length > 160) return null;
  const es = ctx.language === "es";
  if (NEEDS_RE.test(q)) {
    const rows = ctx.feed.filter((i) => i.kind === "needs_you" || i.kind === "held_draft");
    if (!rows.length) {
      return {
        kind: "needs",
        answer: es ? "Nadie te espera ahora mismo. La recepcionista est\xE1 respondiendo sola." : "Nobody is waiting on you right now. The receptionist is answering on its own.",
        links: [{ label: es ? "Abrir Inbox" : "Open Inbox", to: "inbox" }]
      };
    }
    const names = rows.slice(0, 4).map((r) => r.title.replace(/ needs you$/, "").replace(/ is waiting for you$/, ""));
    const more = rows.length - names.length;
    const answer = es ? `${rows.length === 1 ? "Una persona" : `${rows.length} personas`} te esperan: ${names.join(", ")}${more > 0 ? ` y ${more} m\xE1s` : ""}.` : `${rows.length === 1 ? "One person needs" : `${rows.length} people need`} you: ${names.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`;
    return { kind: "needs", answer, links: rows.slice(0, 4).map((r) => ({ label: r.title, to: r.to })) };
  }
  if (CALLS_RE.test(q)) {
    const today = dayKey2(ctx.now, ctx.timezone);
    const missed = ctx.calls.filter((c) => c.missed && c.startedAtMs && dayKey2(c.startedAtMs, ctx.timezone) === today);
    const live = ctx.calls.filter((c) => c.live);
    if (!missed.length) {
      const answer2 = live.length ? es ? `Ninguna llamada perdida hoy. Hay ${live.length === 1 ? "una llamada" : `${live.length} llamadas`} en curso.` : `No missed calls today. ${live.length === 1 ? "One call is" : `${live.length} calls are`} on the line now.` : es ? "Ninguna llamada perdida hoy." : "No missed calls today.";
      return { kind: "calls", answer: answer2, links: [{ label: es ? "Ver llamadas" : "See calls", to: "live" }] };
    }
    const names = missed.slice(0, 4).map((c) => c.who);
    const answer = es ? `${missed.length === 1 ? "Una llamada perdida" : `${missed.length} llamadas perdidas`} hoy: ${names.join(", ")}.` : `${missed.length === 1 ? "One missed call" : `${missed.length} missed calls`} today: ${names.join(", ")}.`;
    return { kind: "calls", answer, links: missed.slice(0, 4).map((c) => ({ label: c.who, to: `conversations/cv-${c.callId}` })) };
  }
  if (OPEN_RE.test(q)) {
    return { kind: "openings", day: dayFromQuestion(q, ctx.now, ctx.timezone), service: q };
  }
  return null;
}
var AskSettingsChangeSchema = z3.discriminatedUnion("op", [
  z3.object({ op: z3.literal("add_closure"), date: z3.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z3.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z3.string().max(200).optional() }),
  z3.object({ op: z3.literal("set_hours"), day: z3.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z3.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z3.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z3.object({ op: z3.literal("add_note"), title: z3.string().min(1).max(80), text: z3.string().min(1).max(1200) }),
  z3.object({ op: z3.literal("add_service"), name: z3.string().min(1).max(80), duration_min: z3.number().int().min(1).max(1440).optional() })
]);
function applySettingsChange(config, change) {
  const brain = { ...config.brain ?? {} };
  const profile = { ...brain.profile ?? {} };
  switch (change.op) {
    case "add_closure": {
      const closures = [...profile.closures ?? []];
      closures.push({ date: change.date, ...change.until ? { until: change.until } : {}, ...change.note ? { note: change.note } : {} });
      profile.closures = closures;
      break;
    }
    case "set_hours": {
      const hours = { ...profile.hours ?? {} };
      hours[change.day] = change.open && change.close ? { open: change.open, close: change.close } : { open: null, close: null };
      profile.hours = hours;
      break;
    }
    case "add_note": {
      const notes = [...profile.notes ?? []];
      notes.push({ title: change.title, text: change.text });
      profile.notes = notes;
      break;
    }
    case "add_service": {
      const services = [...profile.services ?? []];
      services.push({ name: change.name, ...change.duration_min ? { duration_min: change.duration_min } : {} });
      profile.services = services;
      break;
    }
  }
  brain.profile = profile;
  return { ...config, brain };
}
function describeSettingsChange(change) {
  switch (change.op) {
    case "add_closure":
      return change.until ? `Closed ${change.date} to ${change.until}${change.note ? ` (${change.note})` : ""}` : `Closed on ${change.date}${change.note ? ` (${change.note})` : ""}`;
    case "set_hours":
      return change.open && change.close ? `${change.day}: ${change.open}\u2013${change.close}` : `${change.day}: closed`;
    case "add_note":
      return `Note for the receptionist: \u201C${change.title}\u201D`;
    case "add_service":
      return `New service: ${change.name}${change.duration_min ? ` (${change.duration_min} min)` : ""}`;
  }
}
function sameQuestion(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}
function navigateLabel(nav, language) {
  if (!nav || !nav.to) return null;
  const es = language === "es";
  if (/^conversations\/cv-/.test(nav.to)) return es ? "Abrir la llamada" : "Open the call";
  if (/^inbox\/th-/.test(nav.to)) return es ? "Abrir el hilo" : "Open the thread";
  if (/^clients\/[0-9a-f-]{36}$/.test(nav.to)) return es ? "Abrir el perfil" : "Open the profile";
  return nav.label || (es ? "Abrir" : "Open");
}
function citationsToShow(citations, nav) {
  const seen = new Set(nav && nav.to ? [nav.to] : []);
  return citations.filter((c) => {
    if (!c || !c.to || seen.has(c.to)) return false;
    seen.add(c.to);
    return true;
  });
}
var FOLLOWUP_ECHO = [
  [/profile|perfil/i, /^clients\//],
  [/transcript|recording|grabaci|transcripci|the call|la llamada/i, /^conversations\/cv-/],
  [/thread|hilo|conversation/i, /^inbox\/th-/]
];
function followupsToShow(followups, citations, nav) {
  const places = [...citations.map((c) => c.to), ...nav && nav.to ? [nav.to] : []];
  return followups.filter((f) => !FOLLOWUP_ECHO.some(([words, route]) => words.test(f) && places.some((p) => route.test(p)))).slice(0, ASK_CAPS.followups);
}

// src/availability.ts
function zoneParts(tz, at) {
  const parts2 = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(at);
  const get = (t) => parts2.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hh: Number(get("hour")) % 24,
    mm: Number(get("minute")),
    ss: Number(get("second")),
    weekday: get("weekday").toLowerCase().slice(0, 3)
  };
}
function zoneOffsetMs(tz, atMs) {
  const p = zoneParts(tz, new Date(atMs));
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(atMs / 1e3) * 1e3;
}
function localToUtcMs(tz, y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - zoneOffsetMs(tz, guess);
  const second = guess - zoneOffsetMs(tz, first);
  return second;
}
function dayInZone(tz, atMs) {
  const p = zoneParts(tz, new Date(atMs));
  const pad = (n) => String(n).padStart(2, "0");
  return { key: `${p.y}-${pad(p.m)}-${pad(p.d)}`, weekday: p.weekday, y: p.y, m: p.m, d: p.d };
}
function unfold(text) {
  const out = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("	")) && out.length) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}
function splitLine(line) {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rest] = head.split(";");
  const params = {};
  for (const p of rest) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}
function toMs(value, params, fallbackTz) {
  const v = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || params.VALUE === "DATE") {
    const m2 = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m2) return null;
    return localToUtcMs(fallbackTz, Number(m2[1]), Number(m2[2]), Number(m2[3]), 0, 0);
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z4] = m;
  if (z4) return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0));
  const tz = params.TZID ?? fallbackTz;
  try {
    return localToUtcMs(tz, Number(y), Number(mo), Number(d), Number(hh), Number(mm)) + Number(ss ?? 0) * 1e3;
  } catch {
    return localToUtcMs(fallbackTz, Number(y), Number(mo), Number(d), Number(hh), Number(mm));
  }
}
function localPartsOf(value, params, fallbackTz) {
  const v = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || params.VALUE === "DATE") {
    const m2 = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m2) return null;
    return { tz: fallbackTz, y: Number(m2[1]), m: Number(m2[2]), d: Number(m2[3]), hh: 0, mm: 0, allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  if (m[7]) {
    const p = zoneParts(fallbackTz, new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))));
    return { tz: fallbackTz, y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm, allDay: false };
  }
  return { tz: params.TZID ?? fallbackTz, y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), hh: Number(m[4]), mm: Number(m[5]), allDay: false };
}
var WEEKDAYS = ["su", "mo", "tu", "we", "th", "fr", "sa"];
function parseRule(value, fallbackTz) {
  const parts2 = {};
  for (const kv of value.split(";")) {
    const eq = kv.indexOf("=");
    if (eq > 0) parts2[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
  }
  const freq = parts2.FREQ;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  for (const k of Object.keys(parts2)) if (!["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "WKST"].includes(k)) return null;
  const interval = Math.max(1, Number(parts2.INTERVAL ?? 1) || 1);
  const count = parts2.COUNT ? Number(parts2.COUNT) : null;
  let until = null;
  if (parts2.UNTIL) {
    until = toMs(parts2.UNTIL, {}, fallbackTz);
    if (until !== null && /^\d{8}$/.test(parts2.UNTIL)) until += 864e5 - 1;
  }
  let byday = null;
  if (parts2.BYDAY) {
    byday = [];
    for (const d of parts2.BYDAY.split(",")) {
      const i = WEEKDAYS.indexOf(d.trim().toLowerCase());
      if (i === -1) return null;
      byday.push(i);
    }
    if (freq !== "WEEKLY") return null;
  }
  let bymonthday = null;
  if (parts2.BYMONTHDAY) {
    if (freq !== "MONTHLY" || parts2.BYMONTHDAY.includes(",")) return null;
    bymonthday = Number(parts2.BYMONTHDAY);
    if (!Number.isInteger(bymonthday) || bymonthday < 1 || bymonthday > 31) return null;
  }
  return { freq, interval, count: count && count > 0 ? count : null, until, byday, bymonthday };
}
var dayNumber = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);
function occurrences(start, durMs, rule, exdates, horizon) {
  const out = [];
  const first = dayNumber(start.y, start.m, start.d);
  const firstDate = new Date(first * 864e5);
  const firstWeek = Math.floor((first - (firstDate.getUTCDay() + 6) % 7) / 7);
  const wanted = rule.byday ?? [firstDate.getUTCDay()];
  let produced = 0;
  for (let n = 0; n < 2e4; n++) {
    const day = first + n;
    const at = new Date(day * 864e5);
    const y = at.getUTCFullYear(), m = at.getUTCMonth() + 1, d = at.getUTCDate();
    let hit = false;
    if (rule.freq === "DAILY") hit = n % rule.interval === 0;
    else if (rule.freq === "WEEKLY") {
      const week = Math.floor((day - (at.getUTCDay() + 6) % 7) / 7);
      hit = wanted.includes(at.getUTCDay()) && (week - firstWeek) % rule.interval === 0;
    } else if (rule.freq === "MONTHLY") {
      const months = (y - start.y) * 12 + (m - start.m);
      hit = d === (rule.bymonthday ?? start.d) && months % rule.interval === 0;
    } else if (rule.freq === "YEARLY") {
      hit = m === start.m && d === start.d && (y - start.y) % rule.interval === 0;
    }
    if (!hit) continue;
    const s = localToUtcMs(start.tz, y, m, d, start.hh, start.mm);
    if (rule.until !== null && s > rule.until) break;
    produced++;
    if (rule.count !== null && produced > rule.count) break;
    if (s > horizon.to) break;
    if (exdates.has(s)) continue;
    if (s + durMs >= horizon.from) out.push({ start: s, end: s + durMs });
  }
  return out;
}
function durationMs(v) {
  const m = /^([+-])?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * ((Number(m[2] ?? 0) * 86400 + Number(m[3] ?? 0) * 3600 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)) * 1e3);
}
function parseIcs(text, fallbackTz, opts = {}) {
  const horizon = opts.horizon ?? { from: Date.now() - 864e5, to: Date.now() + 90 * 864e5 };
  const busy = [];
  let events = 0;
  let recurringExpanded = 0;
  let skippedRecurring = 0;
  let cur = null;
  const exdatesOf = [];
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      exdatesOf.length = 0;
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) {
        events++;
        const status = cur.STATUS?.value.toUpperCase();
        const transp = cur.TRANSP?.value.toUpperCase();
        if (status !== "CANCELLED" && transp !== "TRANSPARENT" && cur.DTSTART) {
          const start = toMs(cur.DTSTART.value, cur.DTSTART.params, fallbackTz);
          let end = null;
          if (cur.DTEND) end = toMs(cur.DTEND.value, cur.DTEND.params, fallbackTz);
          else if (cur.DURATION && start !== null) {
            const d = durationMs(cur.DURATION.value);
            end = d === null ? null : start + d;
          } else if (start !== null) {
            end = cur.DTSTART.params.VALUE === "DATE" || /^\d{8}$/.test(cur.DTSTART.value.trim()) ? start + 864e5 : start;
          }
          if (start !== null && end !== null && end > start) {
            const rule = cur.RRULE ? parseRule(cur.RRULE.value, fallbackTz) : null;
            const local = cur.RRULE ? localPartsOf(cur.DTSTART.value, cur.DTSTART.params, fallbackTz) : null;
            if (cur.RRULE && rule && local) {
              const ex = /* @__PURE__ */ new Set();
              for (const e of exdatesOf) for (const v of e.value.split(",")) {
                const ms = toMs(v, e.params, fallbackTz);
                if (ms !== null) ex.add(ms);
              }
              busy.push(...occurrences(local, end - start, rule, ex, horizon));
              recurringExpanded++;
            } else {
              if (cur.RRULE || cur.RDATE) skippedRecurring++;
              busy.push({ start, end });
            }
          }
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const s = splitLine(line);
    if (!s) continue;
    if (s.name === "EXDATE") {
      exdatesOf.push({ params: s.params, value: s.value });
      continue;
    }
    cur[s.name] = { params: s.params, value: s.value };
  }
  busy.sort((a, b) => a.start - b.start);
  return { busy, events, recurringExpanded, skippedRecurring };
}
var DEFAULTS = { lead_hours: 2, buffer_min: 0, max_days_ahead: 14, slot_min: 30 };
function hhmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function dayIntervals2(h) {
  if (!h) return [];
  if (h.intervals?.length) return h.intervals.filter((i) => i.open && i.close).map((i) => [i.open, i.close]);
  return h.open && h.close ? [[h.open, h.close]] : [];
}
function closedOn(closures, key) {
  return !!closures?.some((c) => c.date <= key && key <= (c.until && c.until >= c.date ? c.until : c.date));
}
function freeWindows(input) {
  const rules = { ...DEFAULTS, ...input.rules ?? {} };
  const leadMs = rules.lead_hours * 36e5;
  const bufferMs = rules.buffer_min * 6e4;
  const slotMs = rules.slot_min * 6e4;
  const earliest = input.now.getTime() + leadMs;
  const busy = input.busy.map((b) => ({ start: b.start - bufferMs, end: b.end + bufferMs })).sort((a, b) => a.start - b.start);
  const out = [];
  for (let offset = 0; offset < rules.max_days_ahead; offset++) {
    const at = input.now.getTime() + offset * 864e5;
    const day = dayInZone(input.tz, at);
    if (closedOn(input.closures, day.key)) continue;
    const ranges = dayIntervals2(input.hours?.[day.weekday]);
    const windows = [];
    for (const [open, close] of ranges) {
      const o = hhmm(open), c = hhmm(close);
      if (!o || !c) continue;
      let start = Math.max(localToUtcMs(input.tz, day.y, day.m, day.d, o[0], o[1]), earliest);
      const end = localToUtcMs(input.tz, day.y, day.m, day.d, c[0], c[1]);
      for (const b of busy) {
        if (b.end <= start) continue;
        if (b.start >= end) break;
        if (b.start > start && b.start - start >= slotMs) windows.push({ start, end: b.start });
        start = Math.max(start, b.end);
      }
      if (end - start >= slotMs) windows.push({ start, end });
    }
    if (windows.length) {
      out.push({
        key: day.key,
        weekday: day.weekday,
        label: new Intl.DateTimeFormat("en-US", { timeZone: input.tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(at)),
        windows
      });
    }
  }
  return out;
}
var DAY_NAMES = {
  mon: "mon",
  monday: "mon",
  tue: "tue",
  tues: "tue",
  tuesday: "tue",
  wed: "wed",
  wednesday: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  thursday: "thu",
  fri: "fri",
  friday: "fri",
  sat: "sat",
  saturday: "sat",
  sun: "sun",
  sunday: "sun"
};
function filterOpenings(openings, by) {
  const day = (by.day ?? "").trim().toLowerCase();
  const weekday = day ? DAY_NAMES[day] : void 0;
  const key = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : void 0;
  const minMs = by.minMinutes && by.minMinutes > 0 ? by.minMinutes * 6e4 : 0;
  const picked = openings.filter((o) => key ? o.key === key : weekday ? o.weekday === weekday : true);
  const first = weekday && !key ? picked.slice(0, 1) : picked;
  return first.map((o) => ({ ...o, windows: o.windows.filter((w) => w.end - w.start >= minMs) })).filter((o) => o.windows.length > 0);
}
function span(tz, start, end) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  return `${f.format(new Date(start))} \u2013 ${f.format(new Date(end))}`;
}
function describeOpenings(openings, tz, opts = {}) {
  const maxDays = opts.maxDays ?? 5;
  const ahead = opts.daysAhead ?? DEFAULTS.max_days_ahead;
  if (!openings.length) {
    return `Open times (from the calendar): nothing is open in the next ${ahead} days. Offer to have someone call back, and send the booking link so they are told when a slot frees up.`;
  }
  const lines = openings.slice(0, maxDays).map((o) => `- ${o.label}: ${o.windows.map((w) => span(tz, w.start, w.end)).join(", ")}`);
  return `Open times (from the calendar, checked just now \u2014 these change as bookings come in):
${lines.join("\n")}
Offer up to three of these that fit what they want, then send the booking link to lock one in. Never confirm a slot yourself; the calendar decides.`;
}

// src/people.ts
var PERSON_MODES = ["auto", "ask", "never"];
var PERSON_MODE_LABELS = { auto: "Answer", ask: "Ask me first", never: "Never" };
function asPersonMode(s) {
  return s && PERSON_MODES.includes(s) ? s : null;
}
var PERSON_STATE_LABELS = {
  needs_you: "Needs you",
  waiting_on_you: "Waiting on you",
  opted_out: "Opted out",
  new: "New",
  quiet: "Quiet",
  active: "Active"
};
var PEOPLE_TABS = [
  { id: "all", label: "All" },
  { id: "needs_you", label: "Needs you" },
  { id: "waiting_on_you", label: "Waiting on you" },
  { id: "new", label: "New" },
  { id: "quiet", label: "Quiet" },
  { id: "active", label: "Active" }
];
var DAY_MS2 = 864e5;
var WEEK_MS = 7 * DAY_MS2;
var MONTH_MS = 30 * DAY_MS2;
var NEW_WINDOW_MS = 7 * DAY_MS2;
var QUIET_AFTER_MS = 30 * DAY_MS2;
var REASON_SHORT = {
  human_token: "asked for a person",
  non_text: "sent something the receptionist can't read",
  refusal: "the receptionist declined to answer",
  rate_cap: "reply limit reached",
  policy_block: "held by your reply setting",
  person_hold: "held for you",
  send_failed: "a reply failed to send",
  deadman: "no answer in time",
  brain_error: "the receptionist hit an error",
  manual: "flagged by you",
  opt_out: "asked to stop",
  state_unavailable: "memory was unavailable",
  stale: "message arrived late"
};
function reasonShort(reason) {
  if (!reason) return "";
  return REASON_SHORT[reason] ?? reason.replace(/_/g, " ");
}
var ts = (iso) => iso ? new Date(iso).getTime() : null;
var DATE_FMT2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DATE_YEAR_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric", year: "numeric" });
var TIME_FMT2 = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
function fmtDate(ms, nowMs) {
  const d = new Date(ms);
  return d.getFullYear() === new Date(nowMs).getFullYear() ? DATE_FMT2.format(d) : DATE_YEAR_FMT.format(d);
}
function ago(ms, nowMs) {
  const diff = Math.max(0, nowMs - ms);
  if (diff < 6e4) return "just now";
  if (diff < 36e5) return `${Math.round(diff / 6e4)}m ago`;
  if (diff < DAY_MS2) return `${Math.round(diff / 36e5)}h ago`;
  if (diff < WEEK_MS) return `${Math.round(diff / DAY_MS2)}d ago`;
  return fmtDate(ms, nowMs);
}
function dayLabel(ms, nowMs) {
  const d = new Date(ms);
  const now = new Date(nowMs);
  const key = d.toDateString();
  if (key === now.toDateString()) return `Today \xB7 ${DATE_FMT2.format(d)}`;
  if (key === new Date(nowMs - DAY_MS2).toDateString()) return `Yesterday \xB7 ${DATE_FMT2.format(d)}`;
  return fmtDate(ms, nowMs);
}
function mmss3(ms) {
  if (ms == null || ms <= 0) return void 0;
  const s = Math.round(ms / 1e3);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
var capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
function personName(r) {
  return r.display_name || r.wa_profile_name || formatPhoneDisplay(r.phone_e164) || "Unknown";
}
function channelsOf(r) {
  const set = new Set(r.channels ?? []);
  if (r.has_chat) set.add("whatsapp");
  if ((r.call_count ?? 0) > 0) set.add("voice");
  const order = ["whatsapp", "voice"];
  return order.filter((c) => set.has(c));
}
function isOwned(r, nowMs) {
  const paused = ts(r.latest_paused_until);
  return !!r.latest_assignee_user_id || paused !== null && paused > nowMs;
}
function personStateFor(r, nowMs) {
  const flagged = !!(r.needs_human || r.open_escalation_reason);
  const owned = isOwned(r, nowMs);
  if (flagged && !owned && r.latest_state !== "snoozed") return "needs_you";
  if (owned && (flagged || r.last_message_direction === "inbound")) return "waiting_on_you";
  if (r.consent === "opted_out" || r.dnc) return "opted_out";
  const first = ts(r.first_contact_at);
  if (!r.has_backfill && first !== null && nowMs - first <= NEW_WINDOW_MS) return "new";
  const last = lastContactOf(r, nowMs).ts;
  if (last === null || nowMs - last > QUIET_AFTER_MS) return "quiet";
  return "active";
}
function lastContactOf(r, nowMs) {
  const m = ts(r.last_message_at);
  const k = ts(r.last_call_at);
  if (m === null && k === null) return { ts: null, at: null, kind: null, who: null, label: "No contact recorded" };
  if (k !== null && (m === null || k > m)) {
    return { ts: k, at: r.last_call_at, kind: "call", who: "they", label: `Phoned \xB7 ${ago(k, nowMs)}` };
  }
  const who = r.last_message_direction === "inbound" ? "they" : r.last_message_sender === "human" ? "you" : r.last_message_sender === "ai" ? "receptionist" : "system";
  const verb = who === "they" ? "They wrote" : who === "you" ? "You replied" : who === "receptionist" ? "Receptionist replied" : "We sent";
  return { ts: m, at: r.last_message_at, kind: "message", who, label: `${verb} \xB7 ${ago(m, nowMs)}` };
}
function firstContactOf(r, nowMs) {
  const f = ts(r.first_contact_at);
  if (f !== null) return { ts: f, label: fmtDate(f, nowMs), estimate: false, evidence: !r.has_backfill };
  const e = ts(r.earliest_row_at);
  if (e !== null && r.has_backfill) return { ts: e, label: `Before ${fmtDate(e, nowMs)}`, estimate: true, evidence: false };
  if (e !== null) return { ts: e, label: fmtDate(e, nowMs), estimate: false, evidence: !r.has_backfill };
  return { ts: null, label: "\u2014", estimate: true, evidence: false };
}
var CONSENT_SOURCES = [
  { id: "in_person", label: "In person" },
  { id: "phone", label: "On the phone" },
  { id: "form", label: "Sign-up form" },
  { id: "customer_message", label: "Their own message" }
];
var CONSENT_RESET_SOURCE = "operator";
function consentSourceLabel(source) {
  if (!source) return null;
  const known = CONSENT_SOURCES.find((s) => s.id === source);
  if (known) return known.label;
  return source === CONSENT_RESET_SOURCE ? null : source;
}
function consentOf(r, nowMs) {
  const dnc = !!r.dnc;
  const state = r.consent === "opted_out" || dnc ? "opted_out" : r.consent === "opted_in" ? "opted_in" : "unknown";
  const when = ts(r.consent_updated_at);
  const date = when !== null ? fmtDate(when, nowMs) : "recorded";
  const how = consentSourceLabel(r.consent_source);
  const sub = state === "opted_out" ? r.consent_source === "customer_message" ? `STOP received${when !== null ? ` ${fmtDate(when, nowMs)}` : ""}` : `${how ? `${how} \xB7 ` : ""}${date}` : state === "opted_in" ? `${how ? `${how} \xB7 ` : ""}${date}` : "no opt-in recorded";
  return {
    state,
    dnc,
    label: state === "opted_out" ? "Opted out" : state === "opted_in" ? "Opted in" : "Unknown",
    sub,
    source: r.consent_source ?? null
  };
}
function receptionistOf(r, nowMs) {
  if (isOwned(r, nowMs)) return { tone: "paused", label: "Paused, a person owns the thread" };
  if (r.open_escalation_reason) return { tone: "escalated", label: `Escalated, ${reasonShort(r.open_escalation_reason)}` };
  if (r.needs_human) return { tone: "escalated", label: "Waiting for a person" };
  if (r.queued_reply_at) return { tone: "queued", label: "Reply queued" };
  const snooze = ts(r.latest_snooze_until);
  if (r.latest_state === "snoozed" && snooze !== null && snooze > nowMs) {
    return { tone: "snoozed", label: `Snoozed until ${shortTime(r.latest_snooze_until, new Date(nowMs))}` };
  }
  if (r.consent === "opted_out" || r.dnc) return { tone: "silent", label: "Silent, they opted out" };
  if (r.effective_reply_mode === "never") return { tone: "paused", label: "Held for you, set to Never" };
  if (r.effective_reply_mode === "ask") return { tone: "paused", label: "Held for you, set to Ask" };
  return { tone: "answering", label: "Answering" };
}
function toPersonRowVM(r, now = /* @__PURE__ */ new Date()) {
  const nowMs = now.getTime();
  const name = personName(r);
  const state = personStateFor(r, nowMs);
  const last = lastContactOf(r, nowMs);
  const first = firstContactOf(r, nowMs);
  const consent = consentOf(r, nowMs);
  const stateDetail = state === "needs_you" ? r.open_escalation_reason ? reasonShort(r.open_escalation_reason) : "waiting for a person" : state === "waiting_on_you" ? "you own the thread and they wrote last" : state === "opted_out" ? consent.sub : state === "new" ? `first contact ${first.label}` : state === "quiet" ? last.ts === null ? "no contact recorded" : `last contact ${ago(last.ts, nowMs)}` : "";
  return {
    id: r.id,
    real: true,
    name,
    initials: initialsOf(name),
    phone: formatPhoneDisplay(r.phone_e164),
    waName: r.wa_profile_name,
    channels: channelsOf(r),
    hasChat: !!r.has_chat,
    state,
    stateLabel: PERSON_STATE_LABELS[state],
    stateDetail,
    lastContact: last,
    receptionist: receptionistOf(r, nowMs),
    firstContact: first,
    consent,
    quote: r.last_inbound_text?.trim() || null,
    threads: r.conversation_count ?? 0,
    calls: r.call_count ?? 0,
    escalations: r.escalation_count ?? 0,
    callSeconds: r.call_seconds ?? 0,
    threadId: r.has_chat && r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    needsYouSinceMs: ts(r.open_escalation_since)
  };
}
var PEOPLE_LISTS = [
  { id: "needs_you", label: "Needs you", test: (v) => v.state === "needs_you" },
  { id: "waiting_on_you", label: "Waiting on you", test: (v) => v.state === "waiting_on_you" },
  { id: "new_week", label: "New this week", test: (v) => v.state === "new" },
  { id: "quiet", label: "Quiet 30+ days", test: (v) => v.state === "quiet" },
  { id: "phoned_only", label: "Phoned only", test: (v) => !v.hasChat && v.calls > 0 },
  // A fact, not the state: someone who opted out AND needs you is in both lists.
  // The only people a broadcast may reach: they said yes, and it is on record.
  { id: "opted_in", label: "Can receive offers", test: (v) => v.consent.state === "opted_in" },
  { id: "opted_out", label: "Opted out", test: (v) => v.consent.state === "opted_out" }
];
function peopleAggregates(rows, nowMs) {
  let needsYou = 0;
  let oldest = null;
  let newThisMonth = 0;
  let reachedWeek = 0;
  let reachedWeekNew = 0;
  for (const v of rows) {
    if (v.state === "needs_you") {
      needsYou++;
      if (v.needsYouSinceMs !== null && (oldest === null || v.needsYouSinceMs < oldest)) oldest = v.needsYouSinceMs;
    }
    if (v.firstContact.evidence && v.firstContact.ts !== null && nowMs - v.firstContact.ts <= MONTH_MS) newThisMonth++;
    if (v.lastContact.ts !== null && nowMs - v.lastContact.ts <= WEEK_MS) {
      reachedWeek++;
      if (v.state === "new") reachedWeekNew++;
    }
  }
  return { total: rows.length, needsYou, needsYouOldestMs: oldest, newThisMonth, reachedWeek, reachedWeekNew };
}
var RECENCY_BUCKETS = [
  { label: "today", max: 1 },
  { label: "3d", max: 3 },
  { label: "1w", max: 7 },
  { label: "2w", max: 14 },
  { label: "1m", max: 30 },
  { label: "2m", max: 60 },
  { label: "3m", max: 90 },
  { label: "older", max: Infinity }
];
function recencyCells(rows, nowMs) {
  const cells = RECENCY_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const v of rows) {
    const days = v.lastContact.ts === null ? Infinity : (nowMs - v.lastContact.ts) / DAY_MS2;
    let i = RECENCY_BUCKETS.findIndex((b) => days < b.max);
    if (i === -1) i = cells.length - 1;
    cells[i].count++;
  }
  return cells;
}
var DECISION_LABELS = {
  take_over: { who: "Took over", text: "You paused the receptionist on this thread" },
  hand_back: { who: "Handed back", text: "You returned the thread to the receptionist" },
  snooze: { who: "Snoozed", text: "You snoozed the thread" },
  wake: { who: "Woke", text: "You brought the thread back" },
  resolve: { who: "Resolved", text: "You marked the escalation resolved" },
  archive: { who: "Archived", text: "You archived the thread" },
  cancel_send: { who: "Canceled a reply", text: "You stopped a reply before it sent" },
  pause_agent: { who: "Paused the receptionist", text: "You paused automatic replies" },
  resume_agent: { who: "Resumed the receptionist", text: "You resumed automatic replies" }
};
function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
function toPersonVM(d, now = /* @__PURE__ */ new Date()) {
  const nowMs = now.getTime();
  const openEsc = d.escalations.filter((e) => e.state === "open").sort((a, b) => (ts(b.created_at) ?? 0) - (ts(a.created_at) ?? 0))[0];
  const row = {
    ...d.row,
    open_escalation_reason: openEsc?.reason ?? d.row.open_escalation_reason,
    open_escalation_since: openEsc?.created_at ?? d.row.open_escalation_since,
    conversation_count: d.conversations.length || d.row.conversation_count,
    // A dial that never connected is not a call; people_list agrees, and the
    // profile used to count one more than the list.
    call_count: d.calls.length ? d.calls.filter((k) => k.status !== "not_connected").length : d.row.call_count,
    call_seconds: d.calls.length ? Math.round(d.calls.filter((k) => k.status !== "not_connected").reduce((a, k) => a + (k.duration_ms ?? 0), 0) / 1e3) : d.row.call_seconds,
    escalation_count: d.escalations.length || d.row.escalation_count
  };
  const base = toPersonRowVM(row, now);
  const first = /^[+\d(]/.test(base.name) ? base.name : base.name.split(" ")[0] || base.name;
  const stamp = (t) => ({ time: TIME_FMT2.format(new Date(t)), day: dayLabel(t, nowMs) });
  const items = [];
  const convIds = new Set(d.conversations.map((c) => c.id));
  for (const c of d.conversations) {
    for (const m of c.messages) {
      if (m.type === "call_summary") continue;
      if (m.status === "canceled") continue;
      const t = ts(messageAt(m));
      if (t === null) continue;
      const kind = m.sender === "customer" ? "customer" : m.sender === "human" ? "you" : m.sender === "ai" ? "receptionist" : "system";
      const who = kind === "customer" ? first : kind === "you" ? "You" : kind === "receptionist" ? "Receptionist" : "System";
      const sub = m.status === "failed" ? "Not delivered" : m.status === "queued" ? "Sending" : void 0;
      items.push({ id: `m-${m.id}`, ts: t, ...stamp(t), kind, who, text: messageText(m), ...sub ? { sub } : {} });
    }
  }
  for (const k of d.calls) {
    const t = ts(k.started_at);
    if (t === null) continue;
    const dur = mmss3(k.duration_ms);
    const summary = (k.summary || "").trim();
    const missed = k.status === "not_connected";
    const sentence = missed ? "The call never connected." : summary ? summary.split(/(?<=[.!?])\s/)[0] ?? summary : k.in_voicemail ? "Reached voicemail." : "No summary from this call.";
    items.push({
      id: `k-${k.id}`,
      ts: t,
      ...stamp(t),
      kind: "call",
      who: missed ? "Missed call" : `${k.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` \xB7 ${dur}` : ""}`,
      text: sentence,
      sub: missed ? "Never connected" : k.recording?.fetch_state === "stored" ? "Recording and transcript in Conversations" : "Transcript in Conversations",
      link: { label: "Open", to: `conversations/cv-${k.id}` }
    });
  }
  for (const e of d.escalations) {
    const t = ts(e.created_at);
    if (t === null) continue;
    items.push({
      id: `e-${e.id}`,
      ts: t,
      ...stamp(t),
      kind: "escalation",
      who: "Escalated",
      text: capitalize(reasonShort(e.reason)) || "The receptionist stopped",
      sub: e.state === "resolved" ? "Resolved" : "Open"
    });
  }
  for (const dec of d.decisions) {
    const label = DECISION_LABELS[dec.verb];
    if (!label) continue;
    const mine = dec.subject_type === "conversation" && convIds.has(dec.subject_id) || dec.subject_type === "contact" && dec.subject_id === row.id;
    if (!mine) continue;
    const t = ts(dec.created_at);
    if (t === null) continue;
    items.push({ id: `d-${dec.id}`, ts: t, ...stamp(t), kind: "decision", who: label.who, text: label.text });
  }
  items.sort((a, b) => b.ts - a.ts);
  const latestConv = [...d.conversations].sort((a, b) => (ts(b.last_message_at) ?? 0) - (ts(a.last_message_at) ?? 0))[0];
  let customer = null;
  let reply = null;
  if (latestConv) {
    for (let i = latestConv.messages.length - 1; i >= 0; i--) {
      const m = latestConv.messages[i];
      if (m.type === "call_summary") continue;
      const t = ts(messageAt(m));
      if (t === null) continue;
      if (!customer && m.direction === "inbound" && m.body) customer = { text: m.body, at: `${stamp(t).time} ${stamp(t).day}` };
      if (!reply && m.direction === "outbound" && m.status !== "canceled" && (m.sender === "ai" || m.sender === "human")) {
        reply = { text: messageText(m), at: `${stamp(t).time} ${stamp(t).day}`, who: m.sender === "ai" ? "Receptionist" : "You" };
      }
      if (customer && reply) break;
    }
  }
  const threadTo = row.latest_conversation_id ? `inbox/th-${row.latest_conversation_id}` : null;
  const openInbox = threadTo ? { label: "Open in Inbox", to: threadTo } : null;
  const r = row;
  let rightNow;
  if (r.open_escalation_reason) {
    const since = r.open_escalation_since ? shortTime(r.open_escalation_since, now) : null;
    rightNow = {
      tone: "escalated",
      title: `Escalated \xB7 ${reasonShort(r.open_escalation_reason)}`,
      detail: `${since ? `Since ${since} \xB7 ` : ""}the receptionist is paused on this thread until someone answers`,
      cta: openInbox
    };
  } else if (r.needs_human) {
    rightNow = { tone: "escalated", title: "Waiting for a person", detail: "The receptionist stopped and nobody has taken the thread yet", cta: openInbox };
  } else if (r.queued_reply_at) {
    const q = ts(r.queued_reply_at);
    rightNow = { tone: "queued", title: "Reply sending", detail: `Queued ${q !== null ? ago(q, nowMs) : ""} \xB7 it can still be stopped from the Inbox`.replace("  ", " "), cta: openInbox };
  } else if (base.receptionist.tone === "snoozed") {
    rightNow = { tone: "snoozed", title: "Snoozed", detail: `Wakes ${shortTime(r.latest_snooze_until ?? null, now)}`, cta: openInbox };
  } else if (isOwned(r, nowMs)) {
    rightNow = { tone: "paused", title: "Paused, a person owns this thread", detail: "The receptionist will not answer until the thread is handed back", cta: openInbox };
  } else if (base.consent.state === "opted_out") {
    rightNow = { tone: "silent", title: "Silent, they opted out", detail: base.consent.sub, cta: null };
  } else if (["never", "ask"].includes(d.receptionist_mode ?? "") || ["never", "ask"].includes(d.workspace_reply_mode ?? "")) {
    const theirs = ["never", "ask"].includes(d.receptionist_mode ?? "");
    const mode = theirs ? d.receptionist_mode : d.workspace_reply_mode;
    rightNow = {
      tone: "paused",
      title: `Held for you, set to ${mode === "never" ? "Never" : "Ask"}`,
      detail: theirs ? "You set the receptionist to stay out of this person's thread \u2014 their messages come straight to you" : "Your workspace reply setting holds every message for a person",
      cta: openInbox
    };
  } else {
    rightNow = { tone: "answering", title: "Answering", detail: "New messages are answered automatically", cta: base.threadId ? { label: "Open thread", to: `inbox/${base.threadId}` } : null };
  }
  const firstIsCall = d.calls.some((k) => k.started_at && ts(k.started_at) === base.firstContact.ts);
  const firstChannel = base.firstContact.estimate ? "imported history" : firstIsCall || !base.hasChat ? "Phone" : "WhatsApp";
  const lc = base.lastContact;
  const lastMeta = lc.who === "they" ? lc.kind === "call" ? "they phoned" : "they wrote" : lc.who === "you" ? "you replied" : lc.who === "receptionist" ? "receptionist replied" : lc.who === "system" ? "we sent" : "";
  const toneWord = { answering: "Answering", escalated: "Waiting", queued: "Queued", snoozed: "Snoozed", paused: "Paused", silent: "Silent" };
  const facts = [
    { label: "First contact", value: base.firstContact.label, meta: firstChannel },
    { label: "Last contact", value: lc.ts !== null ? ago(lc.ts, nowMs) : "\u2014", meta: lastMeta },
    { label: "Conversations", value: base.threads, meta: base.escalations ? `${base.escalations} needed you` : "none needed you" },
    { label: "Calls", value: base.calls, meta: base.calls ? `${Math.max(1, Math.round(base.callSeconds / 60))} min total` : "no calls" },
    { label: "Consent", value: base.consent.label, meta: base.consent.sub, tone: base.consent.state === "opted_out" ? "neg" : "" },
    { label: "Receptionist", value: toneWord[base.receptionist.tone], meta: base.receptionist.tone === "escalated" ? "for you" : base.receptionist.label.toLowerCase() }
  ];
  const about = [];
  if (base.phone) about.push({ k: "Phone", v: base.phone });
  if (base.waName) about.push({ k: "WhatsApp name", v: base.waName });
  about.push({
    k: "First contact",
    v: base.firstContact.ts !== null ? `${base.firstContact.estimate ? "Before " : ""}${DATE_YEAR_FMT.format(new Date(base.firstContact.ts))} \xB7 ${firstChannel}` : "\u2014"
  });
  about.push({ k: "Channels", v: base.channels.map((c) => c === "whatsapp" ? "WhatsApp" : "Phone").join(" \xB7 ") || "\u2014" });
  about.push({ k: "Consent", v: `${base.consent.label} \xB7 ${base.consent.sub}` });
  if (base.hasChat) {
    const w = waWindow(r.latest_wa_inbound_at, now);
    const hours = w.closesAtIso ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - nowMs) / 36e5)) : 0;
    about.push({ k: "Reply window", v: w.open ? `Open \xB7 ${hours}h left` : "Closed \xB7 template only" });
  }
  return {
    ...base,
    since: base.firstContact.label === "\u2014" ? "" : base.firstContact.estimate ? `Since ${base.firstContact.label.charAt(0).toLowerCase()}${base.firstContact.label.slice(1)}` : `Since ${base.firstContact.label}`,
    metaLine: `${plural(base.threads, "conversation")} \xB7 ${plural(base.calls, "call")}`,
    lastExchange: { customer, reply },
    facts,
    rightNow,
    timeline: items,
    about,
    openThread: base.threadId ? `inbox/${base.threadId}` : null,
    receptionistMode: {
      person: asPersonMode(d.receptionist_mode),
      workspace: d.workspace_reply_mode === "veto" ? "auto" : asPersonMode(d.workspace_reply_mode)
    }
  };
}

// src/template-library.ts
var STARTER_LANGUAGES = [
  { id: "en_US", label: "English" },
  { id: "es", label: "Spanish" }
];
var FIRST = { kind: "first_name", label: "First name", example: "Dani" };
var BUSINESS = { kind: "business_name", label: "Business name", example: "Luna Studio" };
var LINK = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
var FIRST_ES = { ...FIRST, label: "Nombre" };
var BUSINESS_ES = { ...BUSINESS, label: "Nombre del negocio" };
var LINK_ES = { ...LINK, label: "Enlace de reservas" };
var STOP_EN = "Reply STOP to opt out";
var STOP_ES = "Responde STOP para darte de baja";
var STARTER_TEMPLATES = [
  {
    key: "winback_offer",
    name: "winback_offer",
    title: "Win-back",
    purpose: "for anyone quiet 30 days",
    category: "marketing",
    trigger: "quiet_30",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's been a while since we last saw you at {{2}}. We'd love to have you back \u2014 pick a time that suits you here: {{3}} and we'll take care of the rest.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, hace tiempo que no te vemos en {{2}}. Nos encantar\xEDa volver a atenderte \u2014 elige la hora que mejor te venga aqu\xED: {{3}} y nosotros nos ocupamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
  },
  {
    key: "welcome_new",
    name: "welcome_new",
    title: "Welcome",
    purpose: "for anyone new this week",
    category: "marketing",
    trigger: "new_week",
    texts: {
      en_US: {
        body: "Hi {{1}}, welcome to {{2}}! This is our WhatsApp \u2014 message us here any time to book, move or ask about an appointment. Book whenever you're ready: {{3}} and we'll take it from there.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, \xA1bienvenido/a a {{2}}! Este es nuestro WhatsApp \u2014 escr\xEDbenos aqu\xED cuando quieras para reservar, cambiar o preguntar por una cita. Reserva cuando quieras: {{3}} y nosotros nos encargamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
  },
  {
    key: "save_our_number",
    name: "save_our_number",
    title: "Save our number",
    purpose: "for anyone who only ever phoned",
    category: "marketing",
    trigger: "phoned_only",
    texts: {
      en_US: {
        body: "Hi {{1}}, thanks for calling {{2}}. Save this number \u2014 on WhatsApp you can book, reschedule or ask us anything in a message, and we answer fast. Book any time: {{3}} or just write to us here.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, gracias por llamar a {{2}}. Guarda este n\xFAmero \u2014 por WhatsApp puedes reservar, cambiar tu cita o preguntarnos lo que quieras, y respondemos r\xE1pido. Reserva cuando quieras: {{3}} o escr\xEDbenos aqu\xED.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
  },
  {
    key: "monthly_offer",
    name: "monthly_offer",
    title: "This month's offer",
    purpose: "for everyone who said yes, once a month",
    category: "marketing",
    trigger: "everyone_monthly",
    texts: {
      en_US: {
        body: "Hi {{1}}, this month at {{2}}: {{3}} Book here: {{4}} \u2014 spaces are limited.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, { kind: "text", label: "The offer", example: "20% off balayage for regulars, book by Friday." }, LINK]
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aqu\xED: {{4}} \u2014 las plazas son limitadas.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, { kind: "text", label: "La oferta", example: "20% de descuento en balayage para clientas habituales, reserva antes del viernes." }, LINK_ES]
      }
    }
  },
  {
    key: "quick_note",
    name: "quick_note",
    title: "A quick note",
    purpose: "for any broadcast: news, hours, a heads-up",
    category: "marketing",
    trigger: null,
    texts: {
      en_US: {
        body: "Hi {{1}}, a quick note from {{2}}: {{3}} Write back here if you have any questions.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, { kind: "text", label: "The note", example: "we're open late on Thursdays this month." }]
      },
      es: {
        body: "Hola {{1}}, una nota r\xE1pida de {{2}}: {{3}} Escr\xEDbenos aqu\xED si tienes alguna pregunta.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, { kind: "text", label: "La nota", example: "este mes abrimos hasta tarde los jueves." }]
      }
    }
  }
];
function starterByName(name) {
  return STARTER_TEMPLATES.find((s) => s.name === name) ?? null;
}
function starterByKey(key) {
  return STARTER_TEMPLATES.find((s) => s.key === key) ?? null;
}
function starterForTrigger(trigger) {
  if (!trigger) return null;
  return STARTER_TEMPLATES.find((s) => s.trigger === trigger) ?? null;
}
function starterText(s, language) {
  return s.texts[language] ?? s.texts.en_US;
}
function starterDraft(s, language) {
  const t = starterText(s, language);
  return { name: s.name, language, category: s.category, body: t.body, footer: t.footer, examples: t.slots.map((x) => x.example) };
}
function fill(body, values) {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n) => values[Number(n) - 1] ?? m);
}
function starterPreview(s, language, businessName) {
  const t = starterText(s, language);
  return fill(t.body, t.slots.map((x) => x.kind === "business_name" && businessName ? businessName : x.example));
}
var TEMPLATE_TITLE_MAX = 60;
function templateTitle(name, title) {
  const given = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  if (given) return given.slice(0, TEMPLATE_TITLE_MAX);
  const s = starterByName(name);
  if (s) return s.title;
  const words = String(name ?? "").replace(/_v\d+$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : String(name ?? "");
}
function guessSlotKind(label, example) {
  const l = String(label ?? "").toLowerCase();
  const e = String(example ?? "").toLowerCase();
  if (/link|url|book/.test(l) || /^https?:\/\//.test(e) || /booksy|calendly|square|fresha|\.com\//.test(e)) return "booking_link";
  if (/business|salon|company|shop|studio|clinic|brand|negocio/.test(l)) return "business_name";
  if (/first name|^name$|nombre|customer|client/.test(l)) return "first_name";
  return "text";
}
function defaultSlotKinds(t) {
  const vars = Array.isArray(t.variables) ? t.variables : [];
  const s = starterByName(t.name);
  if (s) {
    const kinds = starterText(s, "en_US").slots.map((x) => x.kind);
    return vars.length === kinds.length || vars.length === 0 ? kinds : vars.map((_, i) => kinds[i] ?? "text");
  }
  return vars.map((v) => guessSlotKind(typeof v?.label === "string" ? v.label : null, typeof v?.example === "string" ? v.example : null));
}
function defaultParamSpecs(t) {
  return defaultSlotKinds(t).map((k) => k === "text" ? { kind: "text", value: "" } : { kind: k });
}
function starterIndex(name) {
  const i = STARTER_TEMPLATES.findIndex((s) => s.name === name);
  return i === -1 ? STARTER_TEMPLATES.length : i;
}
function compareTemplates(a, b) {
  const ai = starterIndex(a.name);
  const bi = starterIndex(b.name);
  if (ai !== bi) return ai - bi;
  const rank = (t) => (t.source === "chanlytics" ? 0 : 2) + (t.category === "utility" ? 1 : 0);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}
function defaultTemplate(list, trigger) {
  const s = trigger ? starterForTrigger(trigger) : starterByKey("quick_note");
  return (s ? list.find((t) => t.name === s.name) : void 0) ?? list.slice().sort(compareTemplates)[0] ?? null;
}
function slotLabels(t) {
  const vars = Array.isArray(t.variables) ? t.variables : [];
  const s = starterByName(t.name);
  if (s) {
    const labels = starterText(s, t.language ?? "en_US").slots.map((x) => x.label);
    if (vars.length === 0 || vars.length === labels.length) return labels;
  }
  return vars.map((v, i) => {
    const label = typeof v?.label === "string" ? v.label.trim() : "";
    const n = typeof v?.position === "number" ? v.position : i + 1;
    return label && !/^Value \d+$/.test(label) ? label : `Value ${n}`;
  });
}

// src/broadcasts.ts
var BROADCAST_STATES = ["pending_approval", "scheduled", "sending", "sent", "canceled", "failed"];
var RECIPIENT_STATES = ["queued", "sent", "skipped", "failed"];
var BROADCAST_STATE_LABELS = {
  pending_approval: "Needs you",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  canceled: "Canceled",
  failed: "Failed"
};
var BROADCAST_CHUNK = 25;
var BROADCAST_GAP_MS = 300;
var BROADCAST_MAX_RECIPIENTS = 2e3;
var BROADCAST_PARAM_MAX = 1024;
var BROADCAST_SCHEDULE_MAX_DAYS = 30;
var BROADCAST_NAME_MAX = 80;
var AUDIENCE_KINDS = ["everyone", "list", "saved"];
var EVERYONE_LABEL = "Everyone who said yes";
function mayReceiveOffers(r) {
  return r.consent.state === "opted_in" && !r.consent.dnc && !!r.phone;
}
function eligibleFor(rows, kind, id, savedIds) {
  let pool = rows;
  if (kind === "list") {
    const l = PEOPLE_LISTS.find((x) => x.id === id);
    if (!l) return [];
    pool = rows.filter(l.test);
  } else if (kind === "saved") {
    if (!savedIds) return [];
    pool = rows.filter((r) => savedIds.has(r.id));
  }
  return pool.filter(mayReceiveOffers);
}
function renderTemplate(body, params) {
  return String(body ?? "").replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const v = params[Number(n) - 1];
    return typeof v === "string" && v !== "" ? v : m;
  });
}
function cleanParam(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > BROADCAST_PARAM_MAX) return null;
  if (/[\n\r\t]/.test(v) || /\s{4,}/.test(v)) return null;
  return v;
}
function broadcastName(templateName, now = /* @__PURE__ */ new Date(), title) {
  const day = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${templateTitle(templateName, title)} \xB7 ${day}`.slice(0, BROADCAST_NAME_MAX);
}
function whenLabel(iso, now = /* @__PURE__ */ new Date()) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `today ${time}`;
  const tomorrow = new Date(now.getTime() + 864e5);
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} \xB7 ${time}`;
}
function toBroadcastVM(d, now = /* @__PURE__ */ new Date()) {
  const c = d.counts;
  const attempted = c.sent + c.skipped + c.failed;
  return {
    ...d,
    stateLabel: BROADCAST_STATE_LABELS[d.state] ?? d.state,
    when: whenLabel(d.finished_at ?? d.started_at ?? d.scheduled_for, now),
    deliveredPct: c.sent > 0 ? Math.round(c.delivered / c.sent * 100) : null,
    readPct: c.sent > 0 ? Math.round(c.read / c.sent * 100) : null,
    open: d.state === "scheduled" || d.state === "sending" || d.state === "pending_approval",
    progress: d.recipient_count > 0 ? Math.min(1, attempted / d.recipient_count) : 0
  };
}
var HELD_REASONS = {
  opted_out: "asked to stop",
  not_opted_in: "no recorded yes",
  no_phone: "no number",
  human_has_it: "a person had the thread",
  erased: "deleted",
  send_failed: "WhatsApp refused",
  missing_value: "a value was missing"
};
var LIMIT_TIERS = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
function dailyLimit(tier) {
  if (!tier) return null;
  const n = LIMIT_TIERS[String(tier).toUpperCase()];
  return typeof n === "number" ? n : null;
}
function numberHealth(n) {
  const q = String(n.quality ?? "").toUpperCase();
  const ev = String(n.event ?? "").toUpperCase();
  const limit = dailyLimit(n.limit);
  const limitWords = limit === null ? "daily limit not reported yet" : limit === Number.POSITIVE_INFINITY ? "no daily limit" : `up to ${limit.toLocaleString("en-US")} new conversations a day`;
  if (q === "RED" || ev === "FLAGGED") {
    return { canSend: false, tone: "danger", limitPerDay: limit, label: `WhatsApp flagged this number's quality \xB7 ${limitWords}`, refusal: "WhatsApp flagged this number's quality. Sending more marketing now risks the number; wait for it to recover." };
  }
  if (q === "YELLOW" || ev === "DOWNGRADE") return { canSend: true, tone: "warn", limitPerDay: limit, label: `Number quality: medium \xB7 ${limitWords}`, refusal: null };
  if (q === "GREEN" || ev === "UNFLAGGED" || ev === "UPGRADE") return { canSend: true, tone: "ok", limitPerDay: limit, label: `Number quality: good \xB7 ${limitWords}`, refusal: null };
  return { canSend: true, tone: "unknown", limitPerDay: limit, label: `Number quality not reported yet \xB7 ${limitWords}`, refusal: null };
}
function overLimitRefusal(h, audience) {
  if (h.limitPerDay === null || audience <= h.limitPerDay) return null;
  return `This number can start up to ${h.limitPerDay.toLocaleString("en-US")} new conversations a day; this audience is ${audience.toLocaleString("en-US")}. Send to a smaller list or split it.`;
}

// src/templates.ts
var TEMPLATE_LANGUAGES = [
  { id: "en_US", label: "English (US)" },
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "es_MX", label: "Spanish (Mexico)" },
  { id: "es_ES", label: "Spanish (Spain)" },
  { id: "pt_BR", label: "Portuguese (Brazil)" }
];
var TEMPLATE_CATEGORIES = ["marketing", "utility"];
var TEMPLATE_BODY_MAX = 1024;
var TEMPLATE_FOOTER_MAX = 60;
var TEMPLATE_EXAMPLE_MAX = 100;
var TEMPLATE_NAME_MAX = 60;
var NAME = /^[a-z0-9_]{1,512}$/;
function templateNameOk(name) {
  return NAME.test(name);
}
function slugTemplateName(raw) {
  return String(raw ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, TEMPLATE_NAME_MAX).replace(/_+$/g, "");
}
function placeholdersOf(body) {
  const set = /* @__PURE__ */ new Set();
  for (const m of String(body ?? "").matchAll(/\{\{(\d+)\}\}/g)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}
function placeholdersSequential(positions) {
  return positions.every((n, i) => n === i + 1);
}
function validateTemplateDraft(d) {
  const name = slugTemplateName(d.name);
  if (!name || !templateNameOk(name)) return { ok: false, error: "The name needs letters, digits or underscores." };
  if (!TEMPLATE_LANGUAGES.some((l) => l.id === d.language)) return { ok: false, error: "Pick a language from the list." };
  if (!TEMPLATE_CATEGORIES.includes(d.category)) return { ok: false, error: "A template is marketing or utility." };
  const body = String(d.body ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) return { ok: false, error: "Write the message." };
  if (body.length > TEMPLATE_BODY_MAX) return { ok: false, error: `The message must be under ${TEMPLATE_BODY_MAX} characters.` };
  const slots = placeholdersOf(body);
  if (!placeholdersSequential(slots)) return { ok: false, error: "Number the values {{1}}, {{2}}, {{3}} in order, with no gaps." };
  const examples = (d.examples ?? []).map((e) => String(e ?? "").trim());
  if (examples.length !== slots.length) return { ok: false, error: slots.length === 0 ? "This message takes no values, so it needs no examples." : `Give one example for each of the ${slots.length} value${slots.length === 1 ? "" : "s"} \u2014 WhatsApp's reviewers read them.` };
  if (examples.some((e) => !e || e.length > TEMPLATE_EXAMPLE_MAX)) return { ok: false, error: `Every example needs words, under ${TEMPLATE_EXAMPLE_MAX} characters.` };
  const footer = d.footer ? String(d.footer).trim() : "";
  if (footer.length > TEMPLATE_FOOTER_MAX) return { ok: false, error: `The footer must be under ${TEMPLATE_FOOTER_MAX} characters.` };
  if (/\{\{/.test(footer)) return { ok: false, error: "The footer cannot take a value." };
  const warnings = [];
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body)) warnings.push("WhatsApp often rejects a message that starts or ends with a value; put words around it.");
  if (d.category === "marketing" && !/stop/i.test(body + " " + footer)) warnings.push("A marketing message should say how to opt out, such as \u201CReply STOP to opt out\u201D.");
  if (/\n{3,}/.test(body)) warnings.push("More than one blank line in a row is usually rejected.");
  return { ok: true, value: { name, language: d.language, category: d.category, body, footer: footer || null, examples }, warnings };
}
function templateComponents(v) {
  const body = { type: "BODY", text: v.body };
  if (v.examples.length) body.example = { body_text: [v.examples] };
  const out = [body];
  if (v.footer) out.push({ type: "FOOTER", text: v.footer });
  return out;
}
var PARAM_SOURCES = ["text", "first_name", "business_name", "booking_link"];
var PARAM_SOURCE_LABELS = {
  text: "Type it",
  first_name: "Their first name",
  business_name: "The business name",
  booking_link: "The booking link"
};
function parseParamSpec(raw) {
  if (typeof raw === "string") {
    const m = /^@(first_name|business_name|booking_link)$/.exec(raw.trim());
    if (m) return { kind: m[1] };
    return { kind: "text", value: raw };
  }
  if (raw && typeof raw === "object") {
    const o = raw;
    if (o.kind === "text") return typeof o.value === "string" ? { kind: "text", value: o.value } : null;
    if (o.kind === "first_name" || o.kind === "business_name" || o.kind === "booking_link") return { kind: o.kind };
  }
  return null;
}
function paramLabel(spec) {
  return spec.kind === "text" ? spec.value : PARAM_SOURCE_LABELS[spec.kind].toLowerCase();
}
function firstNameOf(displayName, waProfileName) {
  const raw = (displayName || waProfileName || "").trim();
  if (!raw || /^[+\d(]/.test(raw)) return null;
  const first = raw.split(/\s+/)[0].replace(/[^\p{L}\p{M}'’-]/gu, "");
  return first ? first.slice(0, 30) : null;
}
function resolveParams(specs, f) {
  return specs.map((s) => {
    switch (s.kind) {
      case "text":
        return s.value;
      case "first_name":
        return f.firstName || "there";
      case "business_name":
        return f.businessName;
      case "booking_link":
        return f.bookingLink ?? "";
    }
  });
}
function exampleParams(specs, businessName) {
  return resolveParams(specs, { firstName: "Dani", businessName, bookingLink: "your booking link" });
}

// src/playbooks.ts
var DAY_MS3 = 864e5;
var PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", hint: "Nothing heard in 30 days" },
  { id: "new_week", label: "Welcome", list: "new_week", cls: "campaign", hint: "First contact in the last 7 days" },
  { id: "phoned_only", label: "Save our number", list: "phoned_only", cls: "reengage", hint: "Only ever phoned, never texted" },
  { id: "everyone_monthly", label: "The month's offer", list: null, cls: "campaign", hint: "Everyone who said yes, on a cadence" }
];
var PLAYBOOK_STATES = ["running", "paused"];
var PLAYBOOK_DEFAULTS = { runHour: 10, capPerRun: 25, gapDays: 90, cadenceDays: 30 };
var PLAYBOOK_HOURS = { min: 9, max: 20 };
var PLAYBOOK_BREATH_MS = 7 * DAY_MS3;
var PLAYBOOK_VETO_DELAY_MS = 30 * 6e4;
var PLAYBOOK_NAME_MAX = 80;
function triggerOf(id) {
  return PLAYBOOK_TRIGGERS.find((t) => t.id === id) ?? null;
}
function eligibleForPlaybook(rows, p, touches, nowMs) {
  const t = triggerOf(p.trigger);
  if (!t) return [];
  const pool = t.list ? eligibleFor(rows, "list", t.list, null) : eligibleFor(rows, "everyone", null, null);
  const gapMs = (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) * DAY_MS3;
  const picked = pool.filter((r) => {
    const mine = touches.byThis.get(r.id);
    if (mine !== void 0 && nowMs - mine < gapMs) return false;
    const any = touches.byAny.get(r.id);
    if (any !== void 0 && nowMs - any < PLAYBOOK_BREATH_MS) return false;
    return true;
  });
  picked.sort((a, b) => (a.lastContact.ts ?? 0) - (b.lastContact.ts ?? 0));
  return picked.slice(0, Math.max(1, p.cap_per_run));
}
function planRun(mode, now) {
  switch (mode) {
    case "auto":
      return { kind: "send", state: "scheduled", at: now };
    case "veto":
      return { kind: "send", state: "scheduled", at: new Date(now.getTime() + PLAYBOOK_VETO_DELAY_MS) };
    case "ask":
      return { kind: "hold", state: "pending_approval" };
    default:
      return { kind: "off" };
  }
}
function parts(tz, now) {
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
    const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
    const hour = Number(p.hour) % 24;
    return { date: `${p.year}-${p.month}-${p.day}`, hour };
  } catch {
    return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  }
}
function localDate(tz, now) {
  return parts(tz, now).date;
}
function localHour(tz, now) {
  return parts(tz, now).hour;
}
function runDueNow(p, tz, now) {
  if (p.state !== "running") return false;
  const { date, hour } = parts(tz, now);
  return hour >= p.run_hour && hour <= PLAYBOOK_HOURS.max && p.last_run_for !== date;
}
var two = (n) => String(n).padStart(2, "0");
function scheduleLine(p) {
  const at = `${two(p.run_hour)}:00`;
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days at ${at} \xB7 up to ${p.cap_per_run} a day`;
  return `Daily ${at} \xB7 up to ${p.cap_per_run} \xB7 once per person, again after ${p.gap_days} days`;
}
function nextRunLabel(p, tz, now) {
  if (p.state !== "running") return "paused";
  const { date, hour } = parts(tz, now);
  const at = `${two(p.run_hour)}:00`;
  if (p.last_run_for !== date) {
    if (hour < p.run_hour) return `today ${at}`;
    if (hour <= PLAYBOOK_HOURS.max) return "today, within the hour";
  }
  return `tomorrow ${at}`;
}
var PLAYBOOK_CLASS_LABEL = { reengage: "Re-engage", campaign: "Campaigns" };

// src/reports.ts
var REPORT_RANGES = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" }
];
var DATE_FMT3 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
function dayDate(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function fmtDay(day) {
  return DATE_FMT3.format(dayDate(day));
}
function fmtSeconds(s) {
  if (s == null || !Number.isFinite(s)) return "\u2014";
  const v = Math.max(0, Math.round(s));
  if (v < 60) return `${v}s`;
  if (v < 600) return `${Math.floor(v / 60)}m ${String(v % 60).padStart(2, "0")}s`;
  if (v < 3600) return `${Math.round(v / 60)}m`;
  return `${Math.floor(v / 3600)}h ${String(Math.round(v % 3600 / 60)).padStart(2, "0")}m`;
}
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function deltaOf(current, previous, upIsGood, noun) {
  if (!previous) return null;
  const pct2 = Math.round((current - previous) / previous * 100);
  if (pct2 === 0) return { text: `same as the prior ${noun}`, tone: "" };
  const up = pct2 > 0;
  return { text: `${up ? "+" : ""}${pct2}% vs prior ${noun}`, tone: up === upIsGood ? "pos" : "neg" };
}
function pointsDelta(current, previous, noun) {
  if (current === null || previous === null) return null;
  const pts = current - previous;
  if (pts === 0) return { text: `same share as the prior ${noun}`, tone: "" };
  return { text: `${pts > 0 ? "+" : ""}${pts} pts vs prior ${noun}`, tone: pts > 0 ? "pos" : "neg" };
}
var REPLY_BUCKETS = [
  { id: "lt15", label: "under 15s", max: 15 },
  { id: "lt60", label: "15s \u2013 1m", max: 60 },
  { id: "lt300", label: "1 \u2013 5m", max: 300 },
  { id: "lt1800", label: "5 \u2013 30m", max: 1800 },
  { id: "gte1800", label: "over 30m", max: Infinity }
];
function bars(entries) {
  const max = Math.max(1, ...entries.map((e) => e[2]));
  return entries.map(([id, label, value]) => ({ id, label, value, share: value / max }));
}
var sum = (xs) => xs.reduce((a, b) => a + b, 0);
var capitalize2 = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
function toReportVM(dto) {
  const days = dto.days;
  const series = dto.series ?? [];
  const current = series.slice(-days);
  const previous = series.slice(0, Math.max(0, series.length - days));
  const points = current.map((d) => ({
    day: d.day,
    label: fmtDay(d.day),
    short: String(dayDate(d.day).getDate()),
    in: d.messages_in,
    ai: d.answered_ai,
    you: d.answered_you,
    none: d.unanswered,
    calls: d.calls,
    callSeconds: d.call_seconds,
    escalations: d.escalations,
    newPeople: d.new_contacts
  }));
  const tot = {
    in: sum(current.map((d) => d.messages_in)),
    ai: sum(current.map((d) => d.answered_ai)),
    you: sum(current.map((d) => d.answered_you)),
    none: sum(current.map((d) => d.unanswered)),
    escalations: sum(current.map((d) => d.escalations)),
    calls: sum(current.map((d) => d.calls)),
    callSeconds: sum(current.map((d) => d.call_seconds)),
    newPeople: sum(current.map((d) => d.new_contacts))
  };
  const prev = {
    in: sum(previous.map((d) => d.messages_in)),
    ai: sum(previous.map((d) => d.answered_ai)),
    you: sum(previous.map((d) => d.answered_you)),
    none: sum(previous.map((d) => d.unanswered)),
    escalations: sum(previous.map((d) => d.escalations)),
    calls: sum(previous.map((d) => d.calls)),
    newPeople: sum(previous.map((d) => d.new_contacts))
  };
  const noun = `${days} days`;
  const answeredTotal = tot.ai + tot.you + tot.none;
  const aiShare = answeredTotal ? Math.round(tot.ai / answeredTotal * 100) : null;
  const prevAnsweredTotal = prev.ai + prev.you + prev.none;
  const prevShare = prevAnsweredTotal ? Math.round(prev.ai / prevAnsweredTotal * 100) : null;
  const sortedReply = [...dto.reply_seconds ?? []].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const median = quantile(sortedReply, 0.5);
  const p90 = quantile(sortedReply, 0.9);
  const bucketCounts = REPLY_BUCKETS.map((b, i) => {
    const lo = i === 0 ? -Infinity : REPLY_BUCKETS[i - 1].max;
    return [b.id, b.label, sortedReply.filter((s) => s >= lo && s < b.max).length];
  });
  const tiles = [
    {
      id: "messages",
      label: "Customer messages",
      value: String(tot.in),
      meta: tot.in ? `on ${current.filter((d) => d.messages_in > 0).length} of ${days} days` : "none in this period",
      delta: deltaOf(tot.in, prev.in, true, noun),
      spark: points.map((p) => p.in)
    },
    {
      id: "answered",
      label: "Receptionist answered",
      value: aiShare === null ? "\u2014" : `${aiShare}%`,
      meta: answeredTotal ? `${tot.ai} of ${answeredTotal} \xB7 ${tot.you} by you \xB7 ${tot.none} unanswered` : "nothing to answer",
      // A share compares in POINTS. Against counts, the share could fall from
      // 100% to 60% while the delta read +20% in green.
      delta: pointsDelta(aiShare, prevShare, noun),
      spark: points.map((p) => p.ai)
    },
    {
      id: "reply",
      label: "Median reply time",
      value: fmtSeconds(median),
      meta: sortedReply.length ? `slowest tenth ${fmtSeconds(p90)} \xB7 ${sortedReply.length} replies` : "no receptionist replies yet",
      delta: null,
      spark: []
    },
    {
      id: "needed",
      label: "Needed you",
      value: String(tot.escalations),
      meta: tot.escalations ? "times the receptionist stopped" : "the receptionist never stopped",
      delta: deltaOf(tot.escalations, prev.escalations, false, noun),
      spark: points.map((p) => p.escalations)
    },
    {
      id: "calls",
      label: "Calls",
      value: String(tot.calls),
      meta: tot.calls ? `${Math.max(1, Math.round(tot.callSeconds / 60))} min on the phone \xB7 ${dto.voicemail ?? 0} to voicemail` : "no calls",
      delta: deltaOf(tot.calls, prev.calls, true, noun),
      spark: points.map((p) => p.calls)
    },
    {
      id: "people",
      label: "New people",
      value: String(tot.newPeople),
      meta: tot.newPeople ? "first contact in this period, by evidence" : "nobody new",
      delta: deltaOf(tot.newPeople, prev.newPeople, true, noun),
      spark: points.map((p) => p.newPeople)
    }
  ];
  const reasons = bars(
    Object.entries(dto.reasons ?? {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => [r, capitalize2(reasonShort(r)) || r, n])
  );
  const sentiments = bars(
    Object.entries(dto.sentiments ?? {}).sort((a, b) => b[1] - a[1]).map(([s, n]) => [s, s, n])
  );
  const first = current[0]?.day;
  const last = current[current.length - 1]?.day;
  return {
    days,
    rangeLabel: REPORT_RANGES.find((r) => r.days === days)?.label ?? `${days} days`,
    since: first ? fmtDay(first) : "",
    until: last ? fmtDay(last) : "",
    timezone: dto.timezone,
    empty: tot.in === 0 && tot.calls === 0,
    tiles,
    answered: { points, totals: { in: tot.in, ai: tot.ai, you: tot.you, none: tot.none }, max: Math.max(1, ...points.map((p) => p.ai + p.you + p.none)) },
    reasons,
    replyTime: {
      count: sortedReply.length,
      median,
      p90,
      medianLabel: fmtSeconds(median),
      p90Label: fmtSeconds(p90),
      buckets: bars(bucketCounts)
    },
    calls: { points, total: tot.calls, minutes: Math.round(tot.callSeconds / 60), voicemail: dto.voicemail ?? 0, sentiments, max: Math.max(1, ...points.map((p) => p.calls)) },
    people: { points, total: tot.newPeople, max: Math.max(1, ...points.map((p) => p.newPeople)) },
    table: {
      columns: ["Day", "Customer messages", "Answered by receptionist", "Answered by you", "Unanswered", "Calls", "Needed you", "New people"],
      rows: points.map((p) => [p.label, p.in, p.ai, p.you, p.none, p.calls, p.escalations, p.newPeople])
    }
  };
}

// src/campaign-report.ts
var sum2 = (xs) => xs.reduce((a, b) => a + b, 0);
var pct = (n, d) => d ? Math.round(n / d * 100) : null;
var WHEN = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
function toCampaignReportVM(dto) {
  const days = dto.days;
  const series = dto.series ?? [];
  const current = series.slice(-days);
  const previous = series.slice(0, Math.max(0, series.length - days));
  const points = current.map((d) => ({
    day: d.day,
    label: fmtDay(d.day),
    short: String(dayDate(d.day).getDate()),
    sent: d.sent,
    delivered: d.delivered,
    replied: d.replied,
    optIns: d.opt_ins,
    optOuts: d.opt_outs
  }));
  const tot = {
    sent: sum2(current.map((d) => d.sent)),
    delivered: sum2(current.map((d) => d.delivered)),
    replied: sum2(current.map((d) => d.replied)),
    optIns: sum2(current.map((d) => d.opt_ins)),
    optOuts: sum2(current.map((d) => d.opt_outs))
  };
  const prev = {
    sent: sum2(previous.map((d) => d.sent)),
    delivered: sum2(previous.map((d) => d.delivered)),
    replied: sum2(previous.map((d) => d.replied)),
    optIns: sum2(previous.map((d) => d.opt_ins)),
    optOuts: sum2(previous.map((d) => d.opt_outs))
  };
  const noun = `${days} days`;
  const rawSources = dto.sources ?? [];
  const sends = sum2(rawSources.map((s) => s.runs));
  const maxSent = Math.max(1, ...rawSources.map((s) => s.sent));
  const sources = rawSources.map((s) => ({
    id: s.id,
    kind: s.kind,
    kindLabel: s.kind === "playbook" ? "Playbook" : "Broadcast",
    name: s.name,
    templateName: s.template_name,
    template: s.template_name ? templateTitle(s.template_name) : "",
    runs: s.runs,
    sent: s.sent,
    delivered: s.delivered,
    read: s.read,
    replied: s.replied,
    deliveredPct: pct(s.delivered, s.sent),
    readPct: pct(s.read, s.sent),
    repliedPct: pct(s.replied, s.sent),
    lastLabel: s.last_at ? WHEN.format(new Date(s.last_at)) : "",
    share: s.sent / maxSent
  }));
  const tiles = [
    {
      id: "sent",
      label: "Messages sent",
      value: String(tot.sent),
      meta: tot.sent ? `over ${sends} ${sends === 1 ? "send" : "sends"}` : "none in this period",
      delta: deltaOf(tot.sent, prev.sent, true, noun),
      spark: points.map((p) => p.sent)
    },
    {
      id: "delivered",
      label: "Delivered",
      value: pct(tot.delivered, tot.sent) === null ? "\u2014" : `${pct(tot.delivered, tot.sent)}%`,
      meta: tot.sent ? `${tot.delivered} of ${tot.sent} \xB7 WhatsApp's receipts` : "nothing sent",
      delta: pointsDelta(pct(tot.delivered, tot.sent), pct(prev.delivered, prev.sent), noun),
      spark: points.map((p) => p.delivered)
    },
    {
      id: "replied",
      label: "Replied",
      value: pct(tot.replied, tot.sent) === null ? "\u2014" : `${pct(tot.replied, tot.sent)}%`,
      meta: tot.sent ? `${tot.replied} wrote back` : "nothing sent",
      delta: pointsDelta(pct(tot.replied, tot.sent), pct(prev.replied, prev.sent), noun),
      spark: points.map((p) => p.replied)
    },
    {
      id: "optins",
      label: "Said yes",
      value: String(tot.optIns),
      meta: tot.optIns ? "at the desk, or in their own words" : "nobody in this period",
      delta: deltaOf(tot.optIns, prev.optIns, true, noun),
      spark: points.map((p) => p.optIns)
    },
    {
      id: "optouts",
      label: "Asked to stop",
      value: String(tot.optOuts),
      meta: tot.optOuts ? "STOP, or recorded at the desk" : "nobody in this period",
      delta: deltaOf(tot.optOuts, prev.optOuts, false, noun),
      spark: points.map((p) => p.optOuts)
    }
  ];
  return {
    days,
    tiles,
    points,
    totals: { ...tot, sends },
    sources,
    empty: tot.sent === 0 && tot.optIns === 0 && tot.optOuts === 0,
    max: Math.max(1, ...points.map((p) => p.sent)),
    table: {
      columns: ["Day", "Sent", "Delivered", "Replied", "Said yes", "Asked to stop"],
      rows: points.map((p) => [p.label, p.sent, p.delivered, p.replied, p.optIns, p.optOuts])
    }
  };
}
var CAMPAIGN_REPORT_RANGES = REPORT_RANGES;

// src/channels.ts
var DAY_MS4 = 864e5;
var QUIET_AFTER_MS2 = 7 * DAY_MS4;
var DATE_FMT4 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
function ago2(ms, nowMs) {
  const diff = Math.max(0, nowMs - ms);
  if (diff < 6e4) return "just now";
  if (diff < 36e5) return `${Math.round(diff / 6e4)}m ago`;
  if (diff < DAY_MS4) return `${Math.round(diff / 36e5)}h ago`;
  if (diff < QUIET_AFTER_MS2) return `${Math.round(diff / DAY_MS4)}d ago`;
  return DATE_FMT4.format(new Date(ms));
}
var KIND_META = {
  whatsapp: { name: "WhatsApp Business", what: "Customers text this number; the receptionist answers", icon: "chat", noun: "message" },
  voice: { name: "Phone line", what: "Customers call this number; the receptionist picks up", icon: "phone", noun: "call" },
  sms: { name: "SMS", what: "Text messages", icon: "chat", noun: "message" },
  email: { name: "Email", what: "Email", icon: "mail", noun: "email" },
  instagram: { name: "Instagram", what: "Direct messages", icon: "instagram", noun: "message" }
};
function toChannelVM(dto, now = /* @__PURE__ */ new Date()) {
  const nowMs = now.getTime();
  const meta = KIND_META[dto.kind] ?? { name: dto.kind.charAt(0).toUpperCase() + dto.kind.slice(1), what: "", icon: "chat", noun: "message" };
  const last = dto.last_inbound_at ? new Date(dto.last_inbound_at).getTime() : null;
  const on = dto.status === "active";
  let health;
  let healthLabel;
  if (!on) {
    health = "off";
    healthLabel = "Switched off \u2014 messages are recorded and you are emailed; the receptionist stays silent";
  } else if (last === null) {
    health = "unused";
    healthLabel = `On \u2014 no ${meta.noun} has arrived yet`;
  } else if (nowMs - last <= QUIET_AFTER_MS2) {
    health = "receiving";
    healthLabel = `Receiving \xB7 last ${meta.noun} ${ago2(last, nowMs)}`;
  } else {
    health = "quiet";
    healthLabel = `Quiet \xB7 last ${meta.noun} ${ago2(last, nowMs)}`;
  }
  return {
    id: dto.id,
    kind: dto.kind,
    name: meta.name,
    what: meta.what,
    icon: meta.icon,
    number: formatPhoneDisplay(dto.number_e164),
    on,
    health,
    healthLabel,
    lastInboundMs: last
  };
}
export {
  ACTOR_TYPES,
  ALERT_KINDS,
  ANALYSIS_GRACE_MS,
  ASK_CAPS,
  ASK_CITATION_KINDS,
  ASK_FINISH_JSON_SCHEMA,
  ASK_LANGUAGES,
  ASK_MAX_CHARS,
  ASK_MAX_ROUNDS,
  ASK_PAGES,
  ASK_PAGE_ROUTES,
  ASK_RETENTION_DAYS,
  ASK_TOKENS_DAY,
  ASK_TURN_BUDGET_MS,
  AUDIENCE_KINDS,
  AppError,
  AskFinishSchema,
  AskProposalOutcomeSchema,
  AskSettingsChangeSchema,
  BRAIN_INTENTS,
  BRAIN_LANGUAGES,
  BRAIN_OUTPUT_JSON_SCHEMA,
  BROADCAST_CHUNK,
  BROADCAST_GAP_MS,
  BROADCAST_MAX_RECIPIENTS,
  BROADCAST_NAME_MAX,
  BROADCAST_PARAM_MAX,
  BROADCAST_SCHEDULE_MAX_DAYS,
  BROADCAST_STATES,
  BROADCAST_STATE_LABELS,
  BookingRulesSchema,
  BrainConfigSchema,
  BrainOutputSchema,
  BusinessProfileSchema,
  CALL_HEARTBEAT_MS,
  CAMPAIGN_REPORT_RANGES,
  CHANNEL_KINDS,
  CONFIDENCE_STEPS,
  CONSENT_RESET_SOURCE,
  CONSENT_SOURCES,
  CONSENT_STATES,
  CONVERSATION_STATES,
  CalendarConfigSchema,
  ClosureSchema,
  DAYS,
  DECISION_SUBJECTS,
  DECISION_VERBS,
  DISCONNECTION_LABELS,
  E164,
  EMPTY_READ_STATE,
  ERROR_CODES,
  ESCALATION_REASONS,
  ESCALATION_REASON_LABELS,
  ESCALATION_STATES,
  EVENT_KINDS,
  EVERYONE_LABEL,
  FeaturesConfigSchema,
  GuardrailsSchema,
  HELD_REASONS,
  HoursSchema,
  INTENT_LABELS,
  IntervalSchema,
  JOB_KINDS,
  JOB_STATES,
  LIMIT_TIERS,
  LIVE_OVERLONG_MS,
  LIVE_STALE_MS,
  MAX_CLOSURES,
  MAX_INTERVALS_PER_DAY,
  MEMBERSHIP_ROLES,
  MESSAGE_CHANNELS,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDERS,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  NEW_WINDOW_MS,
  NoteSchema,
  NotificationsConfigSchema,
  OFFERS_OPT_IN_PHRASES,
  OPT_IN_PATTERN,
  OPT_OUT_PATTERN,
  OPT_OUT_REFUSAL,
  PARAM_SOURCES,
  PARAM_SOURCE_LABELS,
  PEOPLE_LISTS,
  PEOPLE_TABS,
  PERSON_MODES,
  PERSON_MODE_LABELS,
  PERSON_STATE_LABELS,
  PLAYBOOK_BREATH_MS,
  PLAYBOOK_CLASS_LABEL,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_STATES,
  PLAYBOOK_TRIGGERS,
  PLAYBOOK_VETO_DELAY_MS,
  POLICY_CLASSES,
  POLICY_MODES,
  PROPOSAL_GATE,
  PolicyLimitsSchema,
  QUIET_AFTER_MS,
  RECENT_MAX,
  RECIPIENT_STATES,
  REPLY_DELAY_DEFAULT_MS,
  REPLY_DELAY_MAX_MS,
  REPLY_DELAY_MIN_MS,
  REPORT_RANGES,
  ROLES,
  ROLE_PERMS,
  STARTER_LANGUAGES,
  STARTER_TEMPLATES,
  ServiceSchema,
  TEMPLATE_BODY_MAX,
  TEMPLATE_CATEGORIES,
  TEMPLATE_EXAMPLE_MAX,
  TEMPLATE_FOOTER_MAX,
  TEMPLATE_LANGUAGES,
  TEMPLATE_NAME_MAX,
  TEMPLATE_STATUSES,
  TEMPLATE_TITLE_MAX,
  TENANT_STATUSES,
  TenantConfigSchema,
  TenantConfigWriteSchema,
  WA_WINDOW_MS,
  ago,
  agoLabel,
  applyReadState,
  applySettingsChange,
  asPersonMode,
  askJump,
  brainMetaOf,
  broadcastName,
  buildAskSuggestions,
  buildNotificationFeed,
  citationRoute,
  citationsToShow,
  cleanAnswer,
  cleanParam,
  compareTemplates,
  composeSystemPrompt,
  consentSourceLabel,
  contactMeta,
  contactName,
  dailyLimit,
  dayDate,
  dayFromQuestion,
  dayInZone,
  defaultParamSpecs,
  defaultSlotKinds,
  defaultTemplate,
  deltaOf,
  describeNow,
  describeOpenings,
  describeSettingsChange,
  detectLanguage,
  draftSendsAtMs,
  eligibleFor,
  eligibleForPlaybook,
  emptyReadSet,
  err,
  exampleParams,
  fastPath,
  filterOpenings,
  firstNameOf,
  fmtClock,
  fmtDay,
  fmtSeconds,
  followupsToShow,
  formatPhoneDisplay,
  formatWaited,
  frameSteer,
  frameWhisper,
  freeWindows,
  groundCitations,
  guessSlotKind,
  hasProfile,
  hoursRuns,
  initialsOf,
  isHeldDraft,
  isLiveCall,
  isOptedOut,
  isOptedOutContact,
  isOwned,
  isRealDate,
  isUngrounded,
  localDate,
  localHour,
  localToUtcMs,
  mayReceiveOffers,
  mediaKind,
  mediaVM,
  messageAt,
  messageStatusLabel,
  messageText,
  navigateLabel,
  newReceptionistDefaults,
  nextRunLabel,
  normalizeNavigate,
  normalizePhone,
  numberHealth,
  ok,
  optInLink,
  overLimitRefusal,
  paramLabel,
  parseAskFinish,
  parseBrainOutput,
  parseIcs,
  parseParamSpec,
  parseTenantConfig,
  parseTenantConfigResult,
  partialAnswer,
  peopleAggregates,
  personName,
  personStateFor,
  placeholdersOf,
  placeholdersSequential,
  planRun,
  pointsDelta,
  quantile,
  reachedCustomer,
  reasonShort,
  recencyCells,
  recoverCitations,
  renderTemplate,
  replyDelayMs,
  replyWhy,
  resolveParams,
  resolveSystemPrompt,
  runDueNow,
  safeNavigate,
  sameQuestion,
  scheduleLine,
  scopeFromRoute,
  shortTime,
  slotLabels,
  slugTemplateName,
  starterByKey,
  starterByName,
  starterDraft,
  starterForTrigger,
  starterIndex,
  starterPreview,
  starterText,
  templateComponents,
  templateNameOk,
  templateTitle,
  threadStanding,
  toBroadcastVM,
  toCallVM,
  toCampaignReportVM,
  toChannelVM,
  toConversationVM,
  toInboxThreadVM,
  toLiveCallVM,
  toLiveVM,
  toPersonRowVM,
  toPersonVM,
  toReportVM,
  toTodayVM,
  triggerOf,
  validateTemplateDraft,
  violatesNoPrices,
  waWindow,
  whenLabel,
  whisperText,
  zoneOffsetMs
};
