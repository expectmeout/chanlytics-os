// src/envelope.ts
var ok = (data) => ({ ok: true, data });
var err = (code2, message, details) => ({
  ok: false,
  error: details === void 0 ? { code: code2, message } : { code: code2, message, details }
});

// src/errors.ts
var ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  /**
   * The caller belongs to more than one workspace and the request did not say
   * which. Its own code, not `validation`, because the answer is a question to
   * the person ("which business?") rather than a field to fix, and a nightly
   * once read the generic 400 as a billing bug and a phone-number bug for a day.
   */
  "choose_workspace",
  "conflict",
  "rate_limited",
  /**
   * The workspace itself may not do this until it pays — not the caller, and
   * not their role. Its own code because the fix is a card rather than a
   * different account, and a client that shows "forbidden" for it sends the
   * owner to the wrong page.
   */
  "payment_required",
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
  constructor(code2, message, status, details) {
    super(message);
    this.name = "AppError";
    this.code = code2;
    this.status = status ?? DEFAULT_STATUS[code2];
    this.details = details;
  }
};
var DEFAULT_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  choose_workspace: 400,
  conflict: 409,
  rate_limited: 429,
  payment_required: 402,
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
  const digits2 = String(raw).replace(/[^\d]/g, "");
  if (!digits2) return null;
  if (digits2.length === 10) return `+1${digits2}`;
  if (digits2.length >= 8 && digits2.length <= 15) return `+${digits2}`;
  return null;
}
function shortCode(raw) {
  const digits2 = String(raw ?? "").replace(/[^\d]/g, "");
  return digits2.length >= 3 && digits2.length <= 6;
}
function whyNotAPhone(raw) {
  if (normalizePhone(raw)) return null;
  const digits2 = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits2) return "A phone number is needed to add a person.";
  if (shortCode(digits2)) {
    return "That is a short code, not a phone number \u2014 nobody can be reached on one.";
  }
  if (digits2.length === 7) return "That looks like a local number. Add the area code.";
  return "That is not a phone number anyone can be reached on.";
}
function whyNotAHandoff(raw, ownLine) {
  const typed = String(raw ?? "").trim();
  if (!typed) return null;
  const norm = "+" + typed.replace(/[^0-9]/g, "");
  if (!(/^\+/.test(typed) && /^\+[1-9][0-9]{6,14}$/.test(norm))) {
    return "The transfer number needs the country code, like +1 646 932 5775.";
  }
  if (ownLine && normalizePhone(norm) && normalizePhone(norm) === normalizePhone(ownLine)) {
    return "That is the receptionist's own line \u2014 it would ring itself. Use a line a person answers.";
  }
  return null;
}
function handoffE164(raw) {
  const typed = String(raw ?? "").trim();
  if (!typed) return null;
  return "+" + typed.replace(/[^0-9]/g, "");
}
function formatPhoneDisplay(e164) {
  if (!e164) return null;
  const digits2 = String(e164).replace(/[^\d]/g, "");
  if (digits2.length === 11 && digits2.startsWith("1")) {
    return `+1 (${digits2.slice(1, 4)}) ${digits2.slice(4, 7)}-${digits2.slice(7)}`;
  }
  if (digits2.length < 7) return `+${digits2}`;
  return `+${digits2.replace(/(\d{1,3})(?=(\d{3})+$)/g, "$1 ").trim()}`;
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
  "broadcast_send",
  /**
   * Erase one customer's stored Blob thread. The DASHBOARD orchestrates
   * erasure and cannot reach Blob; the EDGE holds BLOB_READ_WRITE_TOKEN and
   * runs the ledger. This kind is the seam.
   */
  "blob_thread_erase",
  /**
   * A line's provisioning saga, run under the ledger's lease and resumed by
   * the heartbeat if a worker dies (00109). The saga itself stays on the
   * edge with the provider's credentials and is injected into the tick.
   */
  "line_provision"
];
var JOB_STATES = ["scheduled", "fired", "done", "canceled", "failed"];
var EVENT_KINDS = [
  "message.received",
  "message.sent",
  "message.status",
  "escalation.opened",
  "contact.consent_changed",
  "usage.llm_tokens",
  "usage.wa_conversation",
  "ingest.allowlist_skip",
  /** The sender cannot receive a reply — a short code. Recorded, never answered. */
  "ingest.unreachable_sender",
  "ingest.pg_failed",
  "message.send_failed",
  "message.send_blocked",
  "message.send_raced_cancel",
  "conversation.reopened",
  "conversation.pause_expired",
  "contact.erased",
  "contact.blob_erased",
  "setup.requested",
  "voice.provisioned",
  "line.answering",
  "line.failed",
  "line.released",
  "line.forwarding_verified",
  /**
   * Somebody at Chanlytics acted on a workspace they are not a member of.
   *
   * The back office's write half. Recorded BEFORE the action, and the action is
   * refused if it cannot be recorded: a cross-tenant write that nobody can be
   * held to is worse than one that did not happen. What happened next is the
   * line's own event, written by the edge, immediately after this one.
   */
  "platform.acted",
  /** The carriers answered: texting is on, the business is through, or it came back. */
  "line.texting_on",
  "line.texting_approved",
  "line.texting_rejected",
  /** The business on record for the carriers, saved or changed. */
  "business.recorded",
  /** The workspace's listing on Google: linked, removed, and a read that found new reviews or ratings. */
  "google.linked",
  "google.unlinked",
  "google.reviews",
  /** The owner's Business Profile: connected, disconnected, and a review answered from here. */
  "google.connected",
  "google.disconnected",
  "google.replied",
  "workspace.created",
  "billing.updated",
  "billing.paused",
  "billing.resumed"
];
var OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;
var SMS_OPT_OUT_PATTERN = /^\s*(stop|stopall|end|cancel|quit|unsubscribe|revoke|optout|baja|alto)\s*[.!]?\s*$/i;
var OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta|yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;
var MARKETING_OPT_IN_PATTERN = /^\s*(yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;
var CONVERSATION_OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta)\s*[.!]?\s*$/i;
function optInPurposeOf(text) {
  if (MARKETING_OPT_IN_PATTERN.test(text)) return "marketing";
  if (CONVERSATION_OPT_IN_PATTERN.test(text)) return "conversational";
  return null;
}
var OFFERS_OPT_IN_PHRASES = { en: "YES OFFERS", es: "SI OFERTAS" };
function optInLink(numberE164, phrase = OFFERS_OPT_IN_PHRASES.en) {
  const digits2 = String(numberE164 ?? "").replace(/\D/g, "");
  if (digits2.length < 8) return null;
  return `https://wa.me/${digits2}?text=${encodeURIComponent(phrase)}`;
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
  "budget",
  /** A booking or a service/pricing question, with that class set to Ask me first on the Autonomy pane: a person answers. */
  "policy_ask",
  /** The phone receptionist could not finish the call: a person calls them back. What to do rides in the details. */
  "callback",
  /** The workspace is paused (billing): messages land, nothing is answered until it resumes. */
  "paused",
  /** A text arrived on a line the carriers have not approved for texting yet: kept, a person answers. */
  "carriers"
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
  "pause_playbook",
  /**
   * An answer to a review on Google, in the business's own words: subject
   * 'review' (the row's id), payload the words and when Google took them.
   * Replaces the previous answer; Google keeps one per review.
   */
  "reply_review"
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
  "playbook",
  "review"
];
var ACTOR_TYPES = ["user", "ai", "system", "owner_phone"];
var TEMPLATE_STATUSES = ["approved", "pending", "rejected", "paused", "disabled"];

// src/consent.ts
function isOptedOutContact(c) {
  return c.consent === "opted_out" || c.dnc === true;
}
var OPT_OUT_REFUSAL = "This customer asked to stop receiving messages. They can text START to opt back in.";
function mayMessageFor(c, purpose, opts = {}) {
  if (isOptedOutContact(c)) return { ok: false, reason: "opted_out" };
  if (purpose === "marketing") {
    return c.marketing_consent === "opted_in" ? { ok: true, reason: null } : { ok: false, reason: "no_marketing_consent" };
  }
  if (opts.proactive && c.consent !== "opted_in") return { ok: false, reason: "not_opted_in" };
  return { ok: true, reason: null };
}
var PURPOSE_REFUSALS = {
  opted_out: OPT_OUT_REFUSAL,
  not_opted_in: "This customer has not said yes to messages yet.",
  no_marketing_consent: "This customer has not said yes to OFFERS. Appointment messages are fine; promotions are not."
};
function purposeOfTemplate(category) {
  return category === "utility" || category === "authentication" ? "conversational" : "marketing";
}
function purposeOfPlaybook(policyClass) {
  return policyClass === "booking" ? "conversational" : "marketing";
}

// src/time.ts
var MIN_MS = 6e4;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
function spanUnits(ms2) {
  const gap = Math.max(0, ms2);
  if (gap < MIN_MS) return { n: Math.round(gap / 1e3), unit: "s" };
  const minutes = Math.round(gap / MIN_MS);
  if (minutes < 60) return { n: minutes, unit: "m" };
  const hours = Math.round(gap / HOUR_MS);
  if (hours < 24) return { n: hours, unit: "h" };
  return { n: Math.round(gap / DAY_MS), unit: "d" };
}
function spanLabel(ms2) {
  const u = spanUnits(ms2);
  return u.unit === "s" ? "now" : `${u.n}${u.unit}`;
}
function waitedLabel(ms2) {
  const u = spanUnits(ms2);
  return u.unit === "s" ? "1m" : `${u.n}${u.unit}`;
}
function agoShort(atMs, nowMs) {
  return spanLabel(nowMs - atMs);
}
function agoWords(atMs, nowMs, opts = {}) {
  const gap = Math.max(0, nowMs - atMs);
  const dateAfter = opts.dateAfterMs ?? WEEK_MS;
  if (gap >= dateAfter && opts.date) return opts.date(atMs);
  const u = spanUnits(gap);
  return u.unit === "s" ? "just now" : `${u.n}${u.unit} ago`;
}

// src/standing.ts
function standingOf(i, nowMs) {
  const paused = !!i.paused_until && new Date(i.paused_until).getTime() > nowMs;
  const flagged = i.open_escalation || i.state === "needs_human" || paused;
  const claimedByOther = !!i.assignee_user_id && i.assignee_is_me === false;
  const mine = !!i.assignee_user_id || paused && !i.open_escalation;
  const standing = i.state === "snoozed" ? "snoozed" : !flagged ? "quiet" : claimedByOther ? "theirs" : mine ? "yours" : "needs_you";
  return { standing, flagged, paused, takenOver: standing === "yours", claimedByOther };
}

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
  const at2 = c.indexOf(OPEN);
  if (at2 === -1) return c.trim();
  const rest = c.slice(at2 + OPEN.length);
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
function replyWindow(replyChannel, lastWaInboundAtIso, now = /* @__PURE__ */ new Date()) {
  return replyChannel === "sms" ? { open: true, closesAtIso: null } : waWindow(lastWaInboundAtIso, now);
}
var CALL_HEARTBEAT_MS = 10 * 60 * 1e3;
function isLiveCall(call, now = /* @__PURE__ */ new Date()) {
  if (call.status !== "ongoing") return false;
  const beat = call.updated_at ?? call.started_at;
  if (!beat) return false;
  const at2 = new Date(beat).getTime();
  if (Number.isNaN(at2)) return false;
  return now.getTime() - at2 < CALL_HEARTBEAT_MS;
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

// src/call-words.ts
var CALL_OUTCOMES = ["answered", "booking_link_sent", "callback_needed", "voicemail", "no_request", "other"];
var CALL_OUTCOME_WORDS = {
  answered: "Question answered",
  booking_link_sent: "Booking link sent",
  callback_needed: "Needs a call back",
  voicemail: "Reached voicemail",
  no_request: "No request made",
  other: "Handled"
};
function callOutcomeOf(v) {
  return typeof v === "string" && CALL_OUTCOMES.includes(v) ? v : null;
}
function callOutcomeWords(v) {
  const o = callOutcomeOf(v);
  return o ? CALL_OUTCOME_WORDS[o] : null;
}
function tidyCallSummary(text) {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const folded = t.replace(
    /^The (?:user|caller|customer) (?:called|phoned|contacted|reached out to) [^.,;]*? (to|and) /i,
    (_m, joiner) => joiner.toLowerCase() === "to" ? "Called to " : "Called and "
  );
  return folded.charAt(0).toUpperCase() + folded.slice(1);
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
var CALL_NOTE_PREFIX = /^\[voice call note [^\]]*\]\s*(Caller phoned the (?:salon|business) line\.\s*)?(Summary:\s*)?/;
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
function contactMeta(dto, channel = "WhatsApp") {
  const phone = formatPhoneDisplay(dto.contact.phone_e164);
  return contactName(dto) === phone ? `${channel} \xB7 no name saved` : `${channel} \xB7 ${phone ?? "no phone"}`;
}
function initialsOf(name) {
  const digits2 = name.replace(/[^\d]/g, "");
  if (digits2.length >= 7 && /^[+\d\s()-]+$/.test(name)) return digits2.slice(-2);
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
  policy_ask: "Set to Ask me first \u2014 a person answers this one",
  person_hold: "You handle this person \u2014 the receptionist stays out",
  rate_cap: "Too many replies too fast \u2014 the receptionist paused itself",
  deadman: "Nobody picked this up \u2014 flagged after silence",
  manual: "Flagged manually",
  opt_out: "Asked to stop receiving messages",
  state_unavailable: "The receptionist could not read this thread \u2014 needs a human",
  stale: "Arrived hours late \u2014 too old to answer automatically",
  budget: "The day's model budget is used up \u2014 the receptionist paused itself",
  callback: "Needs a call back \u2014 the phone receptionist could not finish it",
  paused: "Held \u2014 the workspace is paused until billing resumes",
  carriers: "Held \u2014 the carriers have not approved this line for texting yet"
};
var ESCALATION_SUMMARIES = {
  human_token: "They asked for a person. A holding message went out \u2014 they're waiting on you.",
  refusal: "The receptionist wouldn't answer this one. A holding message went out.",
  brain_error: "The receptionist errored and sent a holding message. They're waiting on a real answer.",
  non_text: "They sent a voice note or photo the receptionist can't read. Open it and reply yourself.",
  send_failed: "The reply never reached them \u2014 as far as the customer knows, nobody answered.",
  policy_block: "Your reply setting holds every message for a person. Nothing was sent \u2014 answer them yourself.",
  policy_ask: "Your Autonomy setting hands bookings or service questions to a person. The receptionist told them someone will follow up \u2014 that someone is you.",
  person_hold: "You set the receptionist to stay out of this person's thread. Nothing was sent \u2014 answer them yourself.",
  rate_cap: "The receptionist hit its daily reply limit and stopped. NOTHING was sent \u2014 they're waiting in silence.",
  deadman: "This sat unanswered long enough to flag. Nobody has replied.",
  manual: "Flagged by hand for a human.",
  opt_out: "They asked to stop receiving messages. Nothing was sent, and nothing may be.",
  state_unavailable: "The receptionist couldn't read this thread, so it stayed quiet. No reply went out.",
  stale: "This reached us hours after they sent it, too late to answer automatically. NOTHING was sent \u2014 they have been waiting since.",
  callback: "They phoned, and the receptionist could not finish it. Call them back \u2014 the details say what they wanted.",
  paused: "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings \u203A Billing, or answer this one yourself.",
  carriers: "This text arrived before the carriers approved your line for texting, so the receptionist did not answer. Answer it yourself, or wait for the approval on Setup."
};
function formatWaited(ms2) {
  return waitedLabel(ms2);
}
function threadStanding(dto, escalation, now = /* @__PURE__ */ new Date()) {
  const v = standingOf({
    state: dto.state,
    paused_until: dto.paused_until,
    assignee_user_id: dto.assignee_user_id,
    assignee_is_me: dto.assignee_is_me,
    open_escalation: !!escalation
  }, now.getTime());
  const state = v.standing === "snoozed" ? "snoozed" : v.flagged ? "escalated" : "done";
  return { state, takenOver: v.takenOver, needsYou: v.standing === "needs_you" };
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
  const win = replyWindow(lastInbound?.channel, dto.last_wa_inbound_at, now).open;
  const hasCalls = dto.messages.some((m) => m.type === "call_summary");
  const hasChat = !!dto.last_wa_inbound_at || dto.messages.some((m) => m.type !== "call_summary");
  const primaryChannel = hasChat || !hasCalls ? "whatsapp" : "phone";
  const channels = [...hasChat || !hasCalls ? ["whatsapp"] : [], ...hasCalls ? ["phone"] : []];
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
    whoMeta: contactMeta(dto, primaryChannel === "phone" ? "Phone" : "WhatsApp"),
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
    channels,
    primaryChannel,
    hasChat,
    phone: dto.contact.phone_e164 ?? null,
    ...waitingMin ? { waited: formatWaited(waitingMin * 6e4) } : {},
    agent: { name: "WhatsApp Receptionist", glyph: "W", autonomy: "Pauses on handoff", tone: "Warm \xB7 bilingual (EN/ES)" },
    subject: (claimedByOther ? "A teammate is answering this" : null) ?? reasonLabel ?? (takenOver ? "You're answering this one" : lastInbound ? messageText(lastInbound).slice(0, 80) : last ? messageText(last).slice(0, 80) : "No messages yet"),
    preview: last ? messageText(last).slice(0, 110) : "",
    summary: escalation ? ESCALATION_SUMMARIES[escalation.reason] ?? `${reasonLabel}. Needs a human.` : takenOver ? "You're answering this one. The receptionist stays quiet until you hand it back." : "The receptionist answered this on its own. Nothing is owed.",
    contextStrip: [
      ...reasonLabel ? [{ label: "Why you", value: reasonLabel }] : [],
      { label: "Waiting", value: waitingMin ? formatWaited(waitingMin * 6e4) : "\u2014", ...waitingMin && waitingMin > 30 ? { warn: true } : {} },
      { label: "Receptionist", value: needsHuman ? escalation?.reason === "callback" ? "Paused \u2014 call them back" : "Paused \u2014 you have it" : "Answering" },
      hasChat ? { label: "Reply window", value: win ? "Open \u2014 you can write freely" : "Closed \u2014 template only" } : { label: "WhatsApp", value: "No thread yet \u2014 they have only phoned" }
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
function mmss(ms2) {
  if (!ms2 || ms2 < 0) return void 0;
  const total = Math.round(ms2 / 1e3);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
function spokenDuration(ms2) {
  if (!ms2) return "Duration not recorded";
  const total = Math.round(ms2 / 1e3);
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
  const wanted = (dto.wanted || "").trim();
  const headSummary = tidyCallSummary(dto.summary) ?? "";
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
  const outcomeWords = callOutcomeWords(dto.outcome);
  if (outcomeWords) bullets.push(outcomeWords);
  if (dto.follow_up?.trim()) bullets.push(`To do: ${dto.follow_up.trim()}`);
  if (dto.caller_name?.trim()) bullets.push(`Gave their name as ${dto.caller_name.trim()}`);
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
  const snippetBody = missed ? "The call never connected." : wanted || firstSentence || (dto.in_voicemail ? "Reached voicemail." : "No summary from this call.");
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
    summary: { headline: wanted || firstSentence || snippetBody, bullets },
    transcript,
    recordingState: recState,
    ...recState === "ready" ? { recordingUrl: `/api/v1/calls/${dto.id}/recording` } : {},
    ...dto.conversation_id ? { threadId: `th-${dto.conversation_id}` } : {}
  };
}

// src/facts.ts
var trimmed = (v) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};
var activeChannel = (known, kind) => {
  const rows = known?.channels ?? [];
  const row2 = rows.find((c) => c.kind === kind && (c.status ?? "active") === "active");
  return trimmed(row2?.number_e164);
};
function samePhone(a, b) {
  const x = normalizePhone(a);
  const y = normalizePhone(b);
  return !!x && !!y && x === y;
}
function sameAddress(a, b) {
  const x = textKey(a).replace(/\b(usa|us|united states)\b/g, "").trim();
  const y = textKey(b).replace(/\b(usa|us|united states)\b/g, "").trim();
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}
function sameName(a, b) {
  const x = textKey(a);
  const y = textKey(b);
  return !!x && !!y && x === y;
}
function textKey(v) {
  return String(v ?? "").toLowerCase().replace(/[’'.]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function typedOverKnown(typed, known, knownSource, same) {
  if (typed && known) {
    return same(typed, known) ? { value: typed, source: "typed" } : { value: typed, source: "typed", disputed: { value: known, source: knownSource } };
  }
  if (typed) return { value: typed, source: "typed" };
  if (known) return { value: known, source: knownSource };
  return { value: null, source: "absent" };
}
function resolveFacts(typed, known) {
  const p = typed?.profile ?? null;
  const voice = activeChannel(known, "voice");
  const whatsapp = activeChannel(known, "whatsapp");
  const strEq = (a, b) => a === b;
  return {
    business_name: typedOverKnown(
      trimmed(typed?.business_name),
      trimmed(known?.listing?.name) ?? trimmed(known?.workspace?.name),
      known?.listing?.name ? "verified" : "workspace",
      sameName
    ),
    // The one that matters, and the one that should usually be absent.
    //
    // The fallback is FORMATTED, not raw E.164: this value is spoken and
    // written to customers -- "Phone: +13083368109" in a prompt becomes a
    // receptionist reading digits aloud -- so the provisioned line arrives as
    // "+1 (308) 336-8109", the way a person says a number.
    phone_display: typedOverKnown(
      trimmed(typed?.phone_display),
      voice ? formatPhoneDisplay(voice) : null,
      "provisioned",
      samePhone
    ),
    booking_link: typedOverKnown(trimmed(typed?.booking_link), null, "absent", strEq),
    address: typedOverKnown(trimmed(p?.address), trimmed(known?.listing?.address), "verified", sameAddress),
    website: typedOverKnown(trimmed(p?.website), null, "absent", strEq),
    // Human-only by nature: nothing provisions "the person to put a caller through to".
    handoff_number: p?.handoff_number ? { value: p.handoff_number, source: "typed" } : { value: null, source: "absent" },
    voice_line: voice ? { value: voice, source: "provisioned" } : { value: null, source: "absent" },
    whatsapp_line: whatsapp ? { value: whatsapp, source: "provisioned" } : { value: null, source: "absent" }
  };
}
function factConflicts(f) {
  const out = [];
  const phone = f.phone_display;
  if (phone.disputed && phone.value) {
    const isHandoff = samePhone(phone.value, f.handoff_number.value);
    out.push({
      fact: "phone_display",
      severity: "serious",
      used: phone.value,
      known: phone.disputed.value,
      knownSource: phone.disputed.source,
      sentence: isHandoff ? `Your receptionist tells customers to call ${phone.value}, which is the number it transfers to \u2014 so they reach a person directly and never the receptionist answering on ${phone.disputed.value}.` : `Your receptionist tells customers to call ${phone.value}, but it answers on ${phone.disputed.value}. Anyone who calls the published number does not reach it.`,
      to: "admin/workspace"
    });
  }
  if (f.address.disputed && f.address.value) {
    out.push({
      fact: "address",
      severity: "minor",
      used: f.address.value,
      known: f.address.disputed.value,
      knownSource: f.address.disputed.source,
      sentence: `Your receptionist gives ${f.address.value}; Google has you at ${f.address.disputed.value}.`,
      to: "admin/workspace"
    });
  }
  if (f.business_name.disputed && f.business_name.value) {
    out.push({
      fact: "business_name",
      severity: "minor",
      used: f.business_name.value,
      known: f.business_name.disputed.value,
      knownSource: f.business_name.disputed.source,
      sentence: `Your receptionist introduces the business as ${f.business_name.value}; ${f.business_name.disputed.source === "verified" ? "Google lists it" : "this workspace is named"} ${f.business_name.disputed.value}.`,
      to: "admin/workspace"
    });
  }
  return out.sort((a, b) => a.severity === b.severity ? 0 : a.severity === "serious" ? -1 : 1);
}
var SOURCE_WORDS = {
  provisioned: "your line",
  verified: "from Google",
  workspace: "this workspace",
  typed: "you set this",
  absent: "not set"
};
function changedConfigFields(before, after) {
  const top = (v) => {
    const brain = v?.brain ?? {};
    const { profile, ...rest } = brain;
    return { ...rest, ...profile ?? {} };
  };
  const a = top(before);
  const b = top(after);
  const keys = [.../* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
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
var POLICY_CLASSES = ["reply", "booking", "faq", "reengage", "campaign", "reviews", "money"];
var POLICY_CLASS_WORDS = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: { name: "Service & pricing questions", short: "Questions", note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone" },
  booking: { name: "Book \xB7 reschedule", short: "Bookings", note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone" },
  reengage: { name: "Re-engage quiet customers", short: "Re-engage", note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  campaign: { name: "Standing offers", short: "Offers", note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  reviews: { name: "Google reviews", short: "Reviews", note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you" },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" }
};
var POLICY_MODES = ["auto", "veto", "ask", "never"];
var POLICY_CLASS_MODES = {
  reply: ["auto", "veto", "ask", "never"],
  booking: ["auto", "ask"],
  faq: ["auto", "ask"],
  reengage: ["auto", "veto", "ask", "never"],
  campaign: ["auto", "veto", "ask", "never"],
  reviews: ["auto", "ask", "never"],
  money: ["never"]
};
function policyClassOfIntent(intent) {
  if (intent === "booking") return "booking";
  if (intent === "pricing" || intent === "services") return "faq";
  return null;
}
function policyAskClass(policy, intent) {
  const cls = policyClassOfIntent(intent);
  if (!cls) return null;
  const mode = policy?.[cls]?.mode ?? "auto";
  return mode === "auto" ? null : cls;
}
function policyRules(policy, channel) {
  const out = [];
  const modeOf = (cls) => policy?.[cls]?.mode ?? "auto";
  const voice = channel === "voice";
  if (modeOf("booking") !== "auto") {
    out.push(voice ? "Booking: when someone wants to book, reschedule or cancel, do not offer the booking link. Say a member of the team will call or text them to confirm, and take their name." : "Booking: when someone wants to book, reschedule or cancel, do not send the booking link. Say a member of the team will confirm with them shortly, and set escalate to true.");
  }
  if (modeOf("faq") !== "auto") {
    out.push(voice ? "Service and pricing questions: do not answer them yourself. Say a member of the team will call them back with the details, and take their name." : "Service and pricing questions: do not answer them yourself. Say a member of the team will get back to them with the details, and set escalate to true.");
  }
  return out;
}
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
  /**
   * The number the receptionist tells customers to call — an OVERRIDE, and
   * optional because it should almost never be set.
   *
   * It was required, free text, and named the same as the line the
   * receptionist answers, so every workspace typed something into it and
   * nothing checked what. On the first live salon that produced a
   * receptionist publishing the number it transfers to: customers who rang
   * it reached a person's mobile and never the receptionist standing by,
   * and the same string went to Google.
   *
   * Absent is now the right answer and the default: resolveFacts falls back
   * to the provisioned voice line, formatted for speech, so the number
   * published is the number answered by construction. A value here means a
   * business deliberately publishes something else — a tracking line, a
   * shopfront — and the pane says so in those words.
   */
  phone_display: z2.string().min(3).max(40).optional(),
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
  const at2 = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at2.getTime()) && at2.toISOString().slice(0, 10) === key;
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
  const at2 = (...rest) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z2.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z2.ZodIssueCode.custom,
        path: at2("intervals", n, "open"),
        message: `${name}: two shifts overlap.`
      });
    }
  }
}
function checkClosure(c, n, ctx) {
  const at2 = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate(c.date)) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate(c.until)) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: at2("until"),
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
function dateKeyInZone(tz, at2) {
  try {
    const parts2 = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(at2);
    const get = (t) => parts2.find((p) => p.type === t)?.value ?? "";
    const y = get("year"), m = get("month"), d = get("day");
    return y && m && d ? `${y}-${m}-${d}` : null;
  } catch {
    return null;
  }
}
function labelDate(key, withWeekday) {
  const at2 = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(at2.getTime()) || dateKeyInZone("UTC", at2) !== key) return key;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...withWeekday ? { weekday: "long" } : {},
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(at2);
}
function upcomingClosures(closures, tz, at2) {
  if (!closures?.length) return [];
  const today = tz && dateKeyInZone(tz, at2) || dateKeyInZone("UTC", new Date(at2.getTime() - 864e5));
  if (!today) return closures;
  return closures.filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= today).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
function closureLines(closures) {
  return closures.map((c) => {
    const when = c.until && c.until !== c.date && c.until > c.date ? `${labelDate(c.date, false)} \u2013 ${labelDate(c.until, false)}` : labelDate(c.date, true);
    return c.note ? `${when} \u2014 ${c.note}` : when;
  });
}
function closedToday(closures, tz, at2) {
  if (!closures?.length || !tz) return null;
  const today = dateKeyInZone(tz, at2);
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
function composeSystemPrompt(base, profile, channel = "whatsapp", tz, now = /* @__PURE__ */ new Date(), policy) {
  return composeSystemPromptWith(base, profile, channel, tz, now, policy);
}
function composeSystemPromptWith(base, profile, channel, tz, now, policy) {
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
  if (base.phone_display) s.push(`Phone: ${base.phone_display}`);
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
  rules.push(...policyRules(policy, channel));
  if (rules.length) s.push(`
Rules you must follow:
${rules.map((r) => `- ${r}`).join("\n")}`);
  return s.join("\n");
}
function resolveSystemPrompt(brain, channel = "whatsapp", tz, now = /* @__PURE__ */ new Date(), policy, known) {
  if (!hasProfile(brain.profile)) {
    const rules = policyRules(policy, channel);
    return rules.length ? `${brain.system_prompt}

Rules you must follow:
${rules.map((r) => `- ${r}`).join("\n")}` : brain.system_prompt;
  }
  const profile = brain.profile;
  const facts = resolveFacts(brain, known);
  const resolved = {
    business_name: facts.business_name.value ?? brain.business_name,
    phone_display: facts.phone_display.value,
    booking_link: facts.booking_link.value ?? brain.booking_link
  };
  const carried = profile.extra_instructions?.trim() ? profile : { ...profile, extra_instructions: brain.system_prompt };
  return composeSystemPrompt(resolved, carried, channel, tz, now, policy);
}

// src/availability.ts
function zoneParts(tz, at2) {
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
  }).formatToParts(at2);
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
function clockInZone(tz, atMs) {
  const p = zoneParts(tz, new Date(atMs));
  return { hh: p.hh, mm: p.mm, ss: p.ss };
}
function dayInZone(tz, atMs) {
  const p = zoneParts(tz, new Date(atMs));
  const pad = (n) => String(n).padStart(2, "0");
  return { key: `${p.y}-${pad(p.m)}-${pad(p.d)}`, weekday: p.weekday, y: p.y, m: p.m, d: p.d };
}
function unescapeText(v) {
  return v.replace(/\\([\\;,nN])/g, (_, c) => c === "n" || c === "N" ? "\n" : c).trim();
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
  let colon = -1;
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === ":" && !q) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts2 = [];
  let cur = "";
  q = false;
  for (const ch of head) {
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === ";" && !q) {
      parts2.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts2.push(cur);
  const [name, ...rest] = parts2;
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
  const [, y, mo, d, hh, mm, ss, z5] = m;
  if (z5) return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0));
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
    const at2 = new Date(day * 864e5);
    const y = at2.getUTCFullYear(), m = at2.getUTCMonth() + 1, d = at2.getUTCDate();
    let hit = false;
    if (rule.freq === "DAILY") hit = n % rule.interval === 0;
    else if (rule.freq === "WEEKLY") {
      const week = Math.floor((day - (at2.getUTCDay() + 6) % 7) / 7);
      hit = wanted.includes(at2.getUTCDay()) && (week - firstWeek) % rule.interval === 0;
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
  const items = [];
  let events = 0;
  let recurringExpanded = 0;
  let skippedRecurring = 0;
  let cur = null;
  const exdatesOf = [];
  const attendees = [];
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      exdatesOf.length = 0;
      attendees.length = 0;
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
            const title = unescapeText(cur.SUMMARY?.value ?? "");
            const description = unescapeText(cur.DESCRIPTION?.value ?? "") || null;
            const location = unescapeText(cur.LOCATION?.value ?? "") || null;
            const guests = attendees.slice();
            const allDay = cur.DTSTART.params.VALUE === "DATE" || /^\d{8}$/.test(cur.DTSTART.value.trim());
            const uid = cur.UID?.value.trim() || null;
            const rule = cur.RRULE ? parseRule(cur.RRULE.value, fallbackTz) : null;
            const local = cur.RRULE ? localPartsOf(cur.DTSTART.value, cur.DTSTART.params, fallbackTz) : null;
            if (cur.RRULE && rule && local) {
              const ex = /* @__PURE__ */ new Set();
              for (const e of exdatesOf) for (const v of e.value.split(",")) {
                const ms2 = toMs(v, e.params, fallbackTz);
                if (ms2 !== null) ex.add(ms2);
              }
              const occ = occurrences(local, end - start, rule, ex, horizon);
              busy.push(...occ);
              for (const o of occ) items.push({ ...o, title, allDay, uid, description, location, attendees: guests });
              recurringExpanded++;
            } else {
              if (cur.RRULE || cur.RDATE) skippedRecurring++;
              busy.push({ start, end });
              items.push({ start, end, title, allDay, uid, description, location, attendees: guests });
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
    if (s.name === "ATTENDEE") {
      const v = s.value.trim();
      attendees.push({ name: s.params.CN?.trim() || null, email: /^mailto:/i.test(v) ? v.slice(7).toLowerCase() : null });
      continue;
    }
    cur[s.name] = { params: s.params, value: s.value };
  }
  busy.sort((a, b) => a.start - b.start);
  items.sort((a, b) => a.start - b.start);
  return { busy, items, events, recurringExpanded, skippedRecurring };
}
var BOOKING_DEFAULTS = { lead_hours: 2, buffer_min: 0, max_days_ahead: 14, slot_min: 30 };
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
  const rules = { ...BOOKING_DEFAULTS, ...input.rules ?? {} };
  const leadMs = rules.lead_hours * 36e5;
  const bufferMs = rules.buffer_min * 6e4;
  const slotMs = rules.slot_min * 6e4;
  const earliest = input.now.getTime() + leadMs;
  const busy = input.busy.map((b) => ({ start: b.start - bufferMs, end: b.end + bufferMs })).sort((a, b) => a.start - b.start);
  const out = [];
  for (let offset = 0; offset < rules.max_days_ahead; offset++) {
    const at2 = input.now.getTime() + offset * 864e5;
    const day = dayInZone(input.tz, at2);
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
        label: new Intl.DateTimeFormat("en-US", { timeZone: input.tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(at2)),
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
  const ahead = opts.daysAhead ?? BOOKING_DEFAULTS.max_days_ahead;
  if (!openings.length) {
    return `Open times (from the calendar): nothing is open in the next ${ahead} days. Offer to have someone call back, and send the booking link so they are told when a slot frees up.`;
  }
  const lines = openings.slice(0, maxDays).map((o) => `- ${o.label}: ${o.windows.map((w) => span(tz, w.start, w.end)).join(", ")}`);
  return `Open times (from the calendar, checked just now \u2014 these change as bookings come in):
${lines.join("\n")}
Offer up to three of these that fit what they want, then send the booking link to lock one in. Never confirm a slot yourself; the calendar decides.`;
}
var foldName = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
var wordsOf = (s) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
function matchService(services, asked) {
  const q = typeof asked === "string" ? foldName(asked.trim()) : "";
  if (!q || !services?.length) return null;
  const named = services.map((s) => ({ s, n: foldName(s.name) }));
  const exact = named.find((x) => x.n === q);
  if (exact) return exact.s;
  const contains = named.find((x) => x.n && (x.n.includes(q) || q.includes(x.n)));
  if (contains) return contains.s;
  const asks = wordsOf(q).filter((w) => w.length >= 4);
  let best = null;
  let bestScore = 0;
  for (const { s, n } of named) {
    const own = wordsOf(n);
    const score = asks.filter((w) => own.includes(w)).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

// src/calendar.ts
var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var DAY_SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
function keyParts(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m ?? 1, d: d ?? 1 };
}
function shiftKey(key, n) {
  const { y, m, d } = keyParts(key);
  const at2 = new Date(Date.UTC(y, m - 1, d + n));
  return `${at2.getUTCFullYear()}-${String(at2.getUTCMonth() + 1).padStart(2, "0")}-${String(at2.getUTCDate()).padStart(2, "0")}`;
}
function mondayOf(key) {
  const { y, m, d } = keyParts(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shiftKey(key, -((dow + 6) % 7));
}
function isDayKey(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
function monthSpan(key) {
  return { from: mondayOf(`${key.slice(0, 7)}-01`), days: 42 };
}
function shiftMonth(key, n) {
  const { y, m } = keyParts(key);
  const at2 = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${at2.getUTCFullYear()}-${String(at2.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function monthLabelOf(key) {
  const { y, m } = keyParts(key);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1, 12)));
}
function clockLabel(t) {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  const ap = h >= 12 && h < 24 ? "PM" : "AM";
  const hh = (h + 11) % 12 + 1;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ap}`;
}
var SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
function shortDate(key) {
  const { y, m, d } = keyParts(key);
  return SHORT.format(new Date(Date.UTC(y, m - 1, d, 12)));
}
function longDate(key) {
  const { y, m, d } = keyParts(key);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
function readAgoLabel(iso, now) {
  if (!iso) return null;
  return agoWords(Date.parse(iso), now.getTime(), { dateAfterMs: Number.POSITIVE_INFINITY });
}
function rulesLine(rules) {
  const r = { ...BOOKING_DEFAULTS, ...rules ?? {} };
  const parts2 = [`at least ${r.lead_hours}h ahead`];
  if (r.buffer_min > 0) parts2.push(`${r.buffer_min} min between appointments`);
  parts2.push(`up to ${r.max_days_ahead} days out`, `${r.slot_min}-min slots`);
  return `Offers times ${parts2.join(" \xB7 ")}`;
}
function hoursLines2(hours) {
  if (!hours) return [];
  const clean = {};
  for (const d of DAYS) if (hours[d]) clean[d] = hours[d];
  return hoursRuns(clean).map((r) => `${DAY_SHORT[r.from] ?? r.from}${r.to !== r.from ? `\u2013${DAY_SHORT[r.to] ?? r.to}` : ""} ${r.text.toLowerCase() === "closed" ? "closed" : r.text}`);
}
function hoursOf(tz, ms2) {
  const c = clockInZone(tz, ms2);
  return c.hh + c.mm / 60;
}
function spanLabel2(t1, t2) {
  const a = clockLabel(t1);
  const b = clockLabel(t2);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a} \u2013 ${b}`;
}
function toBlock(item, tz, dayStartMs, dayEndMs) {
  const s = Math.max(Date.parse(item.start), dayStartMs);
  const e = Math.min(Date.parse(item.end), dayEndMs);
  const t = s === dayStartMs ? 0 : hoursOf(tz, s);
  const tEnd = e === dayEndMs ? 24 : hoursOf(tz, e);
  return {
    id: item.id,
    t,
    dur: Math.max(15, Math.round((tEnd - t) * 60)),
    title: item.title || "Busy",
    time: spanLabel2(t, tEnd),
    person: item.person ? { id: item.person.id, name: item.person.name, via: item.person.via ?? null } : null,
    description: item.description ?? null,
    location: item.location ?? null,
    contacts: { phones: (item.contacts?.phones ?? []).map((p) => formatPhoneDisplay(p) ?? p), e164: item.contacts?.phones ?? [], emails: item.contacts?.emails ?? [] },
    guess: item.guess ?? null,
    start: item.start,
    end: item.end
  };
}
function toCalendarVM(dto, now = /* @__PURE__ */ new Date()) {
  const tz = dto.timezone;
  const todayKey = dayInZone(tz, now.getTime()).key;
  const nowMs = now.getTime();
  let start = 24;
  let end = 0;
  for (const h of Object.values(dto.hours ?? {})) {
    for (const [o, c] of dayIntervals2(h)) {
      const oh = Number(o.split(":")[0]);
      const ch = Number(c.split(":")[0]) + (Number(c.split(":")[1]) > 0 ? 1 : 0);
      if (Number.isFinite(oh)) start = Math.min(start, oh);
      if (Number.isFinite(ch)) end = Math.max(end, ch);
    }
  }
  if (start >= end) {
    start = 8;
    end = 20;
  }
  start = Math.max(0, start - 1);
  end = Math.min(24, end + 1);
  const days = dto.days.map((d) => {
    const { y, m, d: dd } = keyParts(d.key);
    const weekday = DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()].toLowerCase();
    const closure = dto.closures.find((c) => c.date <= d.key && d.key <= (c.until && c.until >= c.date ? c.until : c.date)) ?? null;
    const intervals = dayIntervals2(dto.hours?.[weekday]);
    const closedDay = closedOn(dto.closures, d.key) || intervals.length === 0;
    const bands = [];
    if (closedDay) {
      bands.push({ from: start, to: end, label: closure?.note ? `Closed \xB7 ${closure.note}` : "Closed" });
    } else {
      let cursor = start;
      for (const [o, c] of intervals) {
        const oh = Number(o.split(":")[0]) + Number(o.split(":")[1]) / 60;
        const ch = Number(c.split(":")[0]) + Number(c.split(":")[1]) / 60;
        if (oh > cursor) bands.push({ from: cursor, to: oh, label: null });
        cursor = Math.max(cursor, ch);
      }
      if (cursor < end) bands.push({ from: cursor, to: end, label: null });
    }
    const zoneDayStart = zoneMidnight(tz, d.key);
    const zoneDayEnd = zoneMidnight(tz, shiftKey(d.key, 1));
    const timed = [];
    const allDay = [];
    for (const item of d.items) {
      const s = Date.parse(item.start);
      const e = Date.parse(item.end);
      if (!(e > zoneDayStart && s < zoneDayEnd)) continue;
      const block = toBlock(item, tz, zoneDayStart, zoneDayEnd);
      if (item.all_day || s <= zoneDayStart && e >= zoneDayEnd) allDay.push({ ...block, t: 0, dur: 24 * 60, time: "All day" });
      else timed.push(block);
    }
    timed.sort((a, b) => a.t - b.t);
    const windows = d.windows.map((w) => {
      const t = hoursOf(tz, Date.parse(w.start));
      const tEnd = hoursOf(tz, Date.parse(w.end));
      return { t, dur: Math.round((tEnd - t) * 60), label: spanLabel2(t, tEnd) };
    });
    return {
      key: d.key,
      dow: DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()],
      date: shortDate(d.key),
      long: longDate(d.key),
      dayNum: String(dd),
      today: d.key === todayKey,
      past: d.key < todayKey,
      closed: { yes: closedDay, note: closure?.note ?? null },
      bands,
      blocks: timed,
      allDay,
      windows
    };
  });
  const events = days.reduce((a, d) => a + d.blocks.length + d.allDay.length, 0);
  const windowCount = days.reduce((a, d) => a + d.windows.length, 0);
  let next = "\u2014";
  outer: for (const d of days) {
    for (const w of d.windows) {
      const at2 = zoneMidnight(tz, d.key) + w.t * 36e5;
      if (at2 >= nowMs) {
        next = `${d.today ? "today" : d.dow} ${clockLabel(w.t)}`;
        break outer;
      }
    }
  }
  const ago3 = readAgoLabel(dto.feed.read_at, now);
  const feedLine = dto.feed.state === "ok" ? `From ${dto.feed.source ?? "your calendar"} \xB7 read ${ago3 ?? "just now"} \xB7 ${dto.feed.events} event${dto.feed.events === 1 ? "" : "s"}${dto.feed.skipped_recurring ? ` \xB7 ${dto.feed.skipped_recurring} repeating rule${dto.feed.skipped_recurring === 1 ? "" : "s"} read once` : ""}` : dto.feed.state === "unavailable" ? `Your calendar could not be read${ago3 ? ` \xB7 last read ${ago3}` : ""}` : "No calendar connected";
  const nowIn = days.some((d) => d.today) ? hoursOf(tz, nowMs) : null;
  const last = dto.days[dto.days.length - 1]?.key ?? dto.from;
  const sameMonth = dto.from.slice(0, 7) === last.slice(0, 7);
  const closuresAhead = dto.closures.filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= todayKey).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6).map((c) => ({
    key: c.date,
    label: c.until && c.until > c.date ? `${shortDate(c.date)} \u2013 ${c.until.slice(0, 7) === c.date.slice(0, 7) ? c.until.slice(8).replace(/^0/, "") : shortDate(c.until)}` : shortDate(c.date),
    note: c.note ?? null
  }));
  const services = (dto.services ?? []).map((s) => ({
    name: s.name,
    duration: s.duration_min,
    consultFirst: s.consult_first,
    label: `${s.name}${s.duration_min ? ` \xB7 ${s.duration_min} min` : ""}${s.consult_first ? " \xB7 consult first" : ""}`
  }));
  return {
    timezone: tz,
    from: dto.from,
    to: last,
    rangeLabel: `${shortDate(dto.from)} \u2013 ${sameMonth ? shortDate(last).replace(/^[A-Za-z]+ /, "") : shortDate(last)}`,
    monthLabel: monthLabelOf(dto.days.length >= 28 ? shiftKey(dto.from, 7) : dto.from),
    hours: { start, end },
    days,
    today: todayKey,
    now: nowIn,
    feed: { present: dto.feed.present, state: dto.feed.state, line: feedLine, events: dto.feed.events, source: dto.feed.source ?? "your calendar" },
    stats: { events, windows: windowCount, next },
    rules: rulesLine(dto.rules),
    hoursLines: hoursLines2(dto.hours),
    closuresAhead,
    services,
    bookingLink: dto.booking_link
  };
}
function zoneMidnight(tz, key) {
  const { y, m, d } = keyParts(key);
  const guess = Date.UTC(y, m - 1, d);
  const off1 = zoneOffsetOf(tz, guess);
  const first = guess - off1;
  const off2 = zoneOffsetOf(tz, first);
  return guess - off2;
}
function zoneOffsetOf(tz, atMs) {
  const c = clockInZone(tz, atMs);
  const day = dayInZone(tz, atMs);
  return Date.UTC(day.y, day.m - 1, day.d, c.hh, c.mm, c.ss) - Math.floor(atMs / 1e3) * 1e3;
}
function spanForView(view, anchor) {
  if (view === "month") return monthSpan(anchor);
  if (view === "agenda") return { from: anchor, days: 14 };
  return { from: mondayOf(anchor), days: 7 };
}
function windowFor(anchor) {
  return { from: shiftKey(mondayOf(`${anchor.slice(0, 7)}-01`), -7), days: 63 };
}
function coversSpan(days, from, count) {
  if (!days.length || count < 1) return false;
  return days[0].key <= from && days[days.length - 1].key >= shiftKey(from, count - 1);
}
function frameOf(key, todayKey) {
  const { y, m, d } = keyParts(key);
  return {
    key,
    dow: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
    date: shortDate(key),
    long: longDate(key),
    dayNum: String(d),
    today: key === todayKey,
    past: key < todayKey
  };
}

// src/live.ts
var LIVE_STALE_MS = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS = 10 * 60 * 1e3;
var RECENT_MAX = 8;
var mmss2 = (ms2) => {
  const total = Math.max(0, Math.round(ms2 / 1e3));
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

// src/calendar-people.ts
var EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
var PHONE_RE = /\+?\(?\d{1,4}\)?(?:[\s.-]?\(?\d{2,4}\)?){2,5}/g;
var ISO_DATE_RE = /^\d{4}[-./]\d{2}[-./]\d{2}/;
function phoneFrom(raw) {
  const s = raw.trim();
  if (ISO_DATE_RE.test(s)) return null;
  const digits2 = s.replace(/\D/g, "");
  if (digits2.length < 10 || digits2.length > 15) return null;
  const bare = /^\+?\d+$/.test(s);
  if (bare && !s.startsWith("+") && !(digits2.length === 10 || digits2.length === 11 && digits2.startsWith("1"))) return null;
  return normalizePhone(s.startsWith("+") ? `+${digits2}` : digits2);
}
function extractContacts(item) {
  const text = [item.title, item.description ?? "", item.location ?? ""].join("\n");
  const emails = /* @__PURE__ */ new Set();
  for (const m of text.match(EMAIL_RE) ?? []) emails.add(m.toLowerCase());
  for (const a of item.attendees ?? []) if (a.email) emails.add(a.email.toLowerCase());
  const phones = /* @__PURE__ */ new Set();
  for (const m of text.replace(EMAIL_RE, " ").match(PHONE_RE) ?? []) {
    const p = phoneFrom(m);
    if (p) phones.add(p);
  }
  const names = /* @__PURE__ */ new Set();
  for (const a of item.attendees ?? []) {
    const n = (a.name ?? "").trim();
    if (n && !EMAIL_RE.test(n)) names.add(n);
    EMAIL_RE.lastIndex = 0;
  }
  return { phones: [...phones], emails: [...emails], names: [...names] };
}
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function nameMatcher(name) {
  const n = name.trim();
  if (n.length < 4 || /^[+\d(]/.test(n)) return null;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(n)}(?=$|[^\\p{L}\\p{N}])`, "iu");
}
function personInText(text, people) {
  let best = null;
  for (const p of people) {
    const re = nameMatcher(p.name);
    if (re && re.test(text) && (!best || p.name.trim().length > best.name.trim().length)) best = p;
  }
  return best;
}
var labelOf = (p) => p.name.trim() || formatPhoneDisplay(p.phone) || "Unknown";
function matchPerson(item, people) {
  const c = extractContacts(item);
  if (c.phones.length) {
    const byPhone = /* @__PURE__ */ new Map();
    for (const p2 of people) if (p2.phone) byPhone.set(p2.phone, p2);
    for (const ph of c.phones) {
      const p2 = byPhone.get(ph);
      if (p2) return { id: p2.id, name: labelOf(p2), via: "phone" };
    }
  }
  const p = personInText([item.title, ...c.names, item.description ?? ""].join("\n"), people);
  return p ? { id: p.id, name: labelOf(p), via: "name" } : null;
}
function indexFeed(items) {
  const byPhone = /* @__PURE__ */ new Map();
  const texts = [];
  for (const it of items) {
    const c = extractContacts(it);
    for (const ph of c.phones) byPhone.set(ph, [...byPhone.get(ph) ?? [], it]);
    texts.push({ item: it, text: [it.title, ...c.names, it.description ?? ""].join("\n") });
  }
  return { byPhone, texts };
}
function allVisitsIn(index, person) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const take = (it, via) => {
    if (seen.has(it)) return;
    seen.add(it);
    out.push({ id: it.uid ? `${it.uid}:${it.start}` : `ev:${it.start}`, start: it.start, end: it.end, title: it.title || "Busy", allDay: it.allDay, via });
  };
  if (person.phone) for (const it of index.byPhone.get(person.phone) ?? []) take(it, "phone");
  const re = nameMatcher(person.name);
  if (re) {
    for (const { item, text } of index.texts) if (!seen.has(item) && re.test(text)) take(item, "name");
  }
  return out.sort((a, b) => a.start - b.start);
}
function visitsIn(index, person, nowMs) {
  let next = null;
  let last = null;
  const seen = /* @__PURE__ */ new Set();
  const take = (it, via) => {
    if (seen.has(it)) return;
    seen.add(it);
    const v = { id: it.uid ? `${it.uid}:${it.start}` : `ev:${it.start}`, start: it.start, end: it.end, title: it.title || "Busy", allDay: it.allDay, via };
    if (it.end >= nowMs) {
      if (!next || v.start < next.start) next = v;
    } else if (!last || v.end > last.end) last = v;
  };
  if (person.phone) for (const it of index.byPhone.get(person.phone) ?? []) take(it, "phone");
  const re = nameMatcher(person.name);
  if (re) {
    for (const { item, text } of index.texts) if (!seen.has(item) && re.test(text)) take(item, "name");
  }
  return { next, last };
}
function visitsOf(items, person, nowMs) {
  return visitsIn(indexFeed(items), person, nowMs);
}
var ms = (t) => typeof t === "number" ? t : Date.parse(t);
function visitDay(start, tz, nowMs) {
  const key = dayInZone(tz, ms(start)).key;
  const today = dayInZone(tz, nowMs).key;
  const tomorrow = dayInZone(tz, nowMs + 864e5).key;
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(ms(start)));
}
function visitTime(v, tz) {
  if (v.allDay || v.all_day) return "all day";
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const a = f.format(new Date(ms(v.start)));
  const b = f.format(new Date(ms(v.end)));
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a} \u2013 ${b}`;
}
function visitDateKey(start, tz) {
  return dayInZone(tz, ms(start)).key;
}
function visitStartTime(v, tz) {
  if (v.allDay || v.all_day) return "all day";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms(v.start)));
}
function visitLine(v, tz, nowMs) {
  return `${visitDay(v.start, tz, nowMs)} \xB7 ${visitTime(v, tz)}`;
}
function describeVisits(visits, tz, nowMs) {
  const out = [];
  if (visits.next) {
    const n = visits.next;
    out.push(`Their next appointment on the calendar: ${visitLine(n, tz, nowMs)} (${n.title}).${n.via === "name" ? " Matched by name only \u2014 make sure it is them before confirming details." : ""} If they ask, confirm it; to change or cancel it, send the booking link \u2014 nothing is changed from here.`);
  }
  if (visits.last) {
    const l = visits.last;
    out.push(`Their last visit on the calendar: ${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(l.start))} (${l.title}).`);
  }
  return out.length ? out.join(" ") : null;
}
function feedSourceLabel(url) {
  if (!url) return "your calendar";
  let host = "";
  try {
    host = new URL(url.replace(/^webcal:\/\//i, "https://")).hostname.toLowerCase();
  } catch {
    return "your calendar";
  }
  if (host.includes("google")) return "Google Calendar";
  if (host.includes("icloud")) return "Apple Calendar";
  if (host.includes("office365") || host.includes("outlook") || host.includes("live.com")) return "Outlook";
  return "your calendar";
}
function eventText(raw, max = 1500) {
  if (!raw) return null;
  const text = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}\u2026` : text;
}
function toVisitDto(v) {
  return v ? { id: v.id, start: new Date(v.start).toISOString(), end: new Date(v.end).toISOString(), title: v.title, all_day: v.allDay, via: v.via } : null;
}
var NAME_WORD = /^[\p{L}][\p{L}'’.-]*$/u;
var CAPITAL = /^\p{Lu}/u;
function guessName(item, services = []) {
  const svc = new Set(services.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const guest = (item.attendees ?? []).map((a) => (a.name ?? "").trim()).find((n) => n && !n.includes("@"));
  if (guest) return guest.slice(0, 80);
  const title = item.title.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  const parts2 = title.split(/\s+(?:-|–|—|·|\||:|\/)\s+|\s+(?:with|for|w\/)\s+|:\s+/i).map((p) => p.trim()).filter(Boolean);
  for (const part of parts2) {
    if (svc.has(part.toLowerCase())) continue;
    const words = part.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => NAME_WORD.test(w) && CAPITAL.test(w))) continue;
    if (words.some((w) => svc.has(w.toLowerCase()))) continue;
    return part;
  }
  return null;
}
function peopleFromItems(items, services, nowMs, window = {}) {
  const from = nowMs - (window.backDays ?? 30) * 864e5;
  const to = nowMs + (window.aheadDays ?? 90) * 864e5;
  const byPhone = /* @__PURE__ */ new Map();
  const better = (a, b) => {
    const aUp = a.start >= nowMs;
    const bUp = b.start >= nowMs;
    if (aUp !== bUp) return aUp;
    return aUp ? a.start < b.start : a.start > b.start;
  };
  for (const it of items) {
    if (it.end < from || it.start > to) continue;
    const phones = extractContacts(it).phones;
    if (!phones.length) continue;
    const name = guessName(it, services);
    for (const phone of phones) {
      const row2 = { phone, name, title: it.title || "Busy", uid: it.uid, start: it.start };
      const have = byPhone.get(phone);
      if (!have) {
        byPhone.set(phone, row2);
        continue;
      }
      if (better(row2, have)) byPhone.set(phone, { ...row2, name: row2.name ?? have.name });
      else if (!have.name && row2.name) byPhone.set(phone, { ...have, name: row2.name });
    }
  }
  return [...byPhone.values()].sort((a, b) => a.start - b.start);
}
function afterPersonRefused(code2) {
  return code2 === "22023" ? "skip" : "stop";
}
function bookedAfterAsk(visits, askedMs) {
  if (!visits) return false;
  if (visits.next) return true;
  return !!visits.last && visits.last.start >= askedMs - 864e5;
}
function toBookingReportVM(dto) {
  if (!dto || dto.calendar === "none") return { present: false, headline: "\u2014", sub: "Connect your calendar under Settings \u203A Workspace to see who booked.", pct: null, asked: 0, booked: 0 };
  if (dto.calendar === "unavailable") return { present: false, headline: "\u2014", sub: "Your calendar could not be read.", pct: null, asked: dto.asked, booked: 0 };
  if (dto.asked === 0) return { present: true, headline: "Nobody asked", sub: `nobody wrote or called in the last ${dto.days} days`, pct: null, asked: 0, booked: 0 };
  const pct2 = Math.round(dto.booked / dto.asked * 100);
  return {
    present: true,
    headline: `${dto.booked} of ${dto.asked} booked`,
    sub: `${pct2}% of the people who wrote or called in the last ${dto.days} days have an appointment on the calendar`,
    pct: pct2,
    asked: dto.asked,
    booked: dto.booked
  };
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
var WEEK_MS2 = 7 * DAY_MS2;
var MONTH_MS = 30 * DAY_MS2;
var NEW_WINDOW_MS = 7 * DAY_MS2;
var QUIET_AFTER_MS = 30 * DAY_MS2;
var REASON_SHORT = {
  human_token: "asked for a person",
  non_text: "sent something the receptionist can't read",
  refusal: "the receptionist declined to answer",
  rate_cap: "reply limit reached",
  policy_block: "held by your reply setting",
  policy_ask: "a booking or a question set to Ask me first",
  person_hold: "held for you",
  carriers: "waiting on carriers",
  send_failed: "a reply failed to send",
  deadman: "no answer in time",
  brain_error: "the receptionist hit an error",
  manual: "flagged by you",
  opt_out: "asked to stop",
  state_unavailable: "memory was unavailable",
  stale: "message arrived late",
  callback: "needs a call back"
};
function reasonShort(reason) {
  if (!reason) return "";
  return REASON_SHORT[reason] ?? reason.replace(/_/g, " ");
}
var ts = (iso) => iso ? new Date(iso).getTime() : null;
var DATE_FMT2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DATE_YEAR_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric", year: "numeric" });
var TIME_FMT2 = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
function fmtDate(ms2, nowMs) {
  const d = new Date(ms2);
  return d.getFullYear() === new Date(nowMs).getFullYear() ? DATE_FMT2.format(d) : DATE_YEAR_FMT.format(d);
}
function ago(ms2, nowMs) {
  return agoWords(ms2, nowMs, { dateAfterMs: WEEK_MS2, date: (at2) => fmtDate(at2, nowMs) });
}
function dayLabel(ms2, nowMs) {
  const d = new Date(ms2);
  const now = new Date(nowMs);
  const key = d.toDateString();
  if (key === now.toDateString()) return `Today \xB7 ${DATE_FMT2.format(d)}`;
  if (key === new Date(nowMs - DAY_MS2).toDateString()) return `Yesterday \xB7 ${DATE_FMT2.format(d)}`;
  return fmtDate(ms2, nowMs);
}
function mmss3(ms2) {
  if (ms2 == null || ms2 <= 0) return void 0;
  const s = Math.round(ms2 / 1e3);
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
function personStanding(r, nowMs) {
  return standingOf({
    state: r.latest_state === "snoozed" ? "snoozed" : r.needs_human || r.latest_state === "needs_human" ? "needs_human" : r.latest_state ?? "open",
    paused_until: r.latest_paused_until,
    assignee_user_id: r.latest_assignee_user_id,
    open_escalation: !!r.open_escalation_reason
  }, nowMs);
}
function isOwned(r, nowMs) {
  return !!r.latest_assignee_user_id || personStanding(r, nowMs).takenOver;
}
function personStateFor(r, nowMs) {
  const v = personStanding(r, nowMs);
  const owned = !!r.latest_assignee_user_id || v.takenOver;
  if (v.standing === "needs_you") return "needs_you";
  if (owned && (v.flagged || r.last_message_direction === "inbound")) return "waiting_on_you";
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
var OFFERS_YES_SOURCES = ["form", "customer_message"];
function offersYesRefusal(source) {
  if (source && OFFERS_YES_SOURCES.includes(source)) return null;
  return "A yes to offers has to be in writing: a sign-up form they signed, or their own message. A spoken yes covers messages about their visit, not offers.";
}
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
  const marketing = dnc || r.consent === "opted_out" ? "opted_out" : r.marketing_consent === "opted_in" ? "opted_in" : r.marketing_consent === "opted_out" ? "opted_out" : "unknown";
  const mWhen = ts(r.marketing_consent_updated_at ?? null);
  const mHow = consentSourceLabel(r.marketing_consent_source ?? null);
  const marketingSub = marketing === "opted_in" ? `${mHow ? `${mHow} \xB7 ` : ""}${mWhen !== null ? fmtDate(mWhen, nowMs) : "recorded"}` : marketing === "opted_out" ? "no offers" : "never asked about offers";
  return {
    state,
    dnc,
    label: state === "opted_out" ? "Opted out" : state === "opted_in" ? "Opted in" : "Unknown",
    sub,
    source: r.consent_source ?? null,
    marketing,
    marketingSource: r.marketing_consent_source ?? null,
    marketingSub
  };
}
function mayReceive(r, purpose) {
  if (!r.phone) return false;
  return mayMessageFor(
    { consent: r.consent.state, dnc: r.consent.dnc, marketing_consent: r.consent.marketing },
    purpose,
    { proactive: true }
  ).ok;
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
  const v = r.visits ?? null;
  const calendar = v ? v.state : "none";
  const askedCandidates = [ts(r.last_inbound_at), ts(r.last_inbound_call_at ?? null)].filter((x) => x !== null);
  const askedMs = askedCandidates.length ? Math.max(...askedCandidates) : null;
  const booked = !!v?.next;
  const nextVisitMs = v?.next ? Date.parse(v.next.start) : null;
  const lastVisitMs = v?.last ? Date.parse(v.last.start) : null;
  const askedNotBooked = calendar === "ok" && askedMs !== null && nowMs - askedMs <= MONTH_MS && !v?.next && !v?.last;
  const stateDetail = state === "needs_you" ? r.open_escalation_reason ? reasonShort(r.open_escalation_reason) : "waiting for a person" : state === "waiting_on_you" ? "you own the thread and they wrote last" : state === "opted_out" ? consent.sub : state === "new" ? `first contact ${first.label}` : state === "quiet" ? last.ts === null ? "no contact recorded" : `last contact ${ago(last.ts, nowMs)}` : "";
  return {
    id: r.id,
    real: true,
    name,
    givenName: r.display_name?.trim() || null,
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
    callSummary: r.last_inbound_call_summary?.trim() || null,
    threads: r.conversation_count ?? 0,
    calls: r.call_count ?? 0,
    escalations: r.escalation_count ?? 0,
    callSeconds: r.call_seconds ?? 0,
    threadId: r.has_chat && r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    needsYouSinceMs: ts(r.open_escalation_since),
    calendar,
    booked,
    nextVisitDay: v?.next ? visitDay(v.next.start, v.timezone, nowMs) : null,
    nextVisit: v?.next ? `${visitLine(v.next, v.timezone, nowMs)} \xB7 ${v.next.title}` : null,
    lastVisit: v?.last ? `${visitLine(v.last, v.timezone, nowMs)} \xB7 ${v.last.title}` : null,
    lastVisitDay: v?.last ? visitDay(v.last.start, v.timezone, nowMs) : null,
    replyWindow: r.has_chat ? (() => {
      const w = waWindow(r.latest_wa_inbound_at, now);
      return { open: w.open, hoursLeft: w.closesAtIso ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - nowMs) / 36e5)) : 0 };
    })() : null,
    askedMs,
    askedNotBooked,
    nextVisitMs,
    lastVisitMs,
    nextVisitDays: nextVisitMs !== null ? Math.max(0, Math.ceil((nextVisitMs - nowMs) / DAY_MS2)) : null,
    lastVisitDays: lastVisitMs !== null ? Math.max(0, Math.floor((nowMs - lastVisitMs) / DAY_MS2)) : null,
    nextVisitDate: v?.next ? visitDateKey(v.next.start, v.timezone) : null,
    lastVisitDate: v?.last ? visitDateKey(v.last.start, v.timezone) : null,
    calendarTz: v?.timezone ?? null
  };
}
var PEOPLE_LIST_GROUPS = [
  { id: "attention", label: "Attention" },
  { id: "journey", label: "Journey" },
  { id: "reach", label: "Reach" }
];
var PEOPLE_LISTS = [
  { id: "needs_you", label: "Needs you", group: "attention", test: (v) => v.state === "needs_you" },
  { id: "waiting_on_you", label: "Waiting on you", group: "attention", test: (v) => v.state === "waiting_on_you" },
  { id: "new_week", label: "New this week", group: "journey", test: (v) => v.state === "new" },
  { id: "booked_week", label: "Booked this week", group: "journey", needsCalendar: true, test: (v) => v.nextVisitDays !== null && v.nextVisitDays <= 7 },
  { id: "booked", label: "Booked", group: "journey", needsCalendar: true, test: (v) => v.booked },
  { id: "asked_never_booked", label: "Asked, never booked", group: "journey", needsCalendar: true, test: (v) => v.askedNotBooked },
  // Forty-five days since the chair, nothing ahead: the win-back list, from visits rather than silence.
  { id: "lapsed", label: "Lapsed", group: "journey", needsCalendar: true, test: (v) => !v.booked && v.lastVisitDays !== null && v.lastVisitDays >= 45 },
  { id: "quiet", label: "Quiet 30+ days", group: "reach", test: (v) => v.state === "quiet" },
  { id: "phoned_only", label: "Phoned only", group: "reach", test: (v) => !v.hasChat && v.calls > 0 },
  // A fact, not the state: someone who opted out AND needs you is in both lists.
  //
  // TWO LISTS, BECAUSE THERE ARE TWO ANSWERS. This one was labelled "Can receive
  // offers" and tested the CONVERSATIONAL column, which after 00095 is the one
  // answer that says nothing about offers -- so the list a person opened to find
  // their promotional audience showed everybody who had ever texted START. The id
  // is unchanged on purpose: a saved broadcast's audience refers to it by id, and
  // renaming it would repoint filings that have already gone out.
  { id: "opted_in", label: "Said yes to messages", group: "reach", test: (v) => v.consent.state === "opted_in" },
  // The promotional audience, on its own column. The only people a MARKETING
  // broadcast may reach.
  // CAN receive, so it is the broadcast's own rule -- a yes to offers AND a number --
  // not the bare answer, which was the difference between this list and what the
  // route would actually enrol.
  { id: "offers_ok", label: "Can receive offers", group: "reach", test: (v) => mayReceive(v, "marketing") },
  { id: "opted_out", label: "Opted out", group: "reach", test: (v) => v.consent.state === "opted_out" }
];
var LIST_STEPS = {
  needs_you: { cta: "Open the Inbox", to: "inbox", text: "Each of them is waiting for a person." },
  waiting_on_you: { cta: "Open the Inbox", to: "inbox", text: "You own these threads, and they wrote last." },
  new_week: { cta: "Get their yes", to: "broadcasts", text: "Their yes to offers is the phrase and the QR on Broadcasts." },
  booked_week: { cta: "See the week", to: "calendar", text: "Their appointments are on the Calendar." },
  asked_never_booked: { cta: "Text the booking link", to: "broadcasts/asked_never_booked", broadcast: true },
  lapsed: { cta: "Win them back", to: "broadcasts/lapsed", broadcast: true },
  quiet: { cta: "Reach out", to: "broadcasts/quiet", broadcast: true },
  // The broadcast step belongs to the OFFERS list, not to this one: a person on
  // this list has said yes to hearing from the business, which is not a yes to a
  // promotion. Sending them here with "New broadcast" is what made the empty
  // audience feel like a bug in the composer rather than a missing answer.
  opted_in: { cta: "Get their yes to offers", to: "broadcasts", text: "They answer and hear about their own visits. Offers need a second, separate yes." },
  offers_ok: { cta: "New broadcast", to: "broadcasts", broadcast: true }
};
function peopleListAction(id, members) {
  const step = LIST_STEPS[id];
  if (!step) return null;
  if (!step.broadcast) return { text: step.text ?? "", cta: step.cta, to: step.to, enabled: members.length > 0 };
  const offersYes = members.filter((m) => mayReceive(m, "marketing")).length;
  if (offersYes === 0) {
    return {
      text: members.length ? "Nobody on this list has said yes to offers yet \u2014 a broadcast reaches only that answer. The phrase and the QR are on Broadcasts." : "Nobody here right now.",
      cta: step.cta,
      to: step.to,
      enabled: false
    };
  }
  return { text: `${offersYes} of ${members.length} on this list said yes to offers \u2014 a broadcast reaches them.`, cta: step.cta, to: step.to, enabled: true };
}
function peopleAggregates(rows, nowMs) {
  let needsYou = 0;
  let oldest = null;
  let newThisMonth = 0;
  let reachedWeek = 0;
  let reachedWeekNew = 0;
  let booked = 0;
  let askedNotBooked = 0;
  for (const v of rows) {
    if (v.booked) booked++;
    if (v.askedNotBooked) askedNotBooked++;
    if (v.state === "needs_you") {
      needsYou++;
      if (v.needsYouSinceMs !== null && (oldest === null || v.needsYouSinceMs < oldest)) oldest = v.needsYouSinceMs;
    }
    if (v.firstContact.evidence && v.firstContact.ts !== null && nowMs - v.firstContact.ts <= MONTH_MS) newThisMonth++;
    if (v.lastContact.ts !== null && nowMs - v.lastContact.ts <= WEEK_MS2) {
      reachedWeek++;
      if (v.state === "new") reachedWeekNew++;
    }
  }
  return { total: rows.length, needsYou, needsYouOldestMs: oldest, newThisMonth, reachedWeek, reachedWeekNew, booked, askedNotBooked };
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
function oneLine(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}\u2026` : t;
}
function clock(ms2, nowMs) {
  const time = new Date(ms2).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return nowMs - ms2 < DAY_MS2 ? time : `${fmtDate(ms2, nowMs)} ${time}`;
}
function attentionRow(p, nowMs) {
  const lc = p.lastContact;
  const channel = lc.kind === "call" ? "Phone" : lc.kind === "message" ? "WhatsApp" : null;
  const when = lc.ts === null ? "no contact yet" : ago(lc.ts, nowMs);
  let sentence;
  let quoted = false;
  if (p.quote) {
    sentence = oneLine(p.quote, 160);
    quoted = true;
  } else if (p.callSummary) sentence = oneLine(tidyCallSummary(p.callSummary) ?? p.callSummary, 160);
  else if (p.nextVisit) sentence = `Booked \xB7 ${p.nextVisit}`;
  else if (p.lastVisit) sentence = `Last visit \xB7 ${p.lastVisit}`;
  else if (p.calls > 0) sentence = p.calls === 1 ? "Phoned once; nothing in writing yet" : `Phoned ${p.calls} times; nothing in writing yet`;
  else sentence = "Nothing written yet";
  const r = p.receptionist;
  let status;
  if (p.state === "waiting_on_you") status = ["You own the thread", "they wrote last"];
  else if (r.tone === "answering") status = p.hasChat ? ["Receptionist", "answering on WhatsApp"] : ["Receptionist", "takes their calls"];
  else status = r.label.split(", ");
  if (p.state === "needs_you" && p.needsYouSinceMs !== null) status = [...status, `since ${clock(p.needsYouSinceMs, nowMs)}`];
  const cta = !p.threadId ? null : p.state === "needs_you" || p.state === "waiting_on_you" ? { label: "Open in Inbox", kind: "primary", to: `inbox/${p.threadId}` } : { label: "Open thread", kind: "ghost", to: `inbox/${p.threadId}` };
  return { channel, when, sentence, quoted, status, tone: r.tone, cta };
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
  const row2 = {
    ...d.row,
    open_escalation_reason: openEsc?.reason ?? d.row.open_escalation_reason,
    open_escalation_since: openEsc?.created_at ?? d.row.open_escalation_since,
    conversation_count: d.conversations.length || d.row.conversation_count,
    // A dial that never connected is not a call; people_list agrees, and the
    // profile used to count one more than the list.
    call_count: d.calls.length ? d.calls.filter((k) => k.status !== "not_connected").length : d.row.call_count,
    call_seconds: d.calls.length ? Math.round(d.calls.filter((k) => k.status !== "not_connected").reduce((a, k) => a + (k.duration_ms ?? 0), 0) / 1e3) : d.row.call_seconds,
    escalation_count: d.escalations.length || d.row.escalation_count,
    visits: d.visits ?? d.row.visits ?? null
  };
  const base = toPersonRowVM(row2, now);
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
    const wanted = (k.wanted || "").trim();
    const summary = tidyCallSummary(k.summary) ?? "";
    const missed = k.status === "not_connected";
    const sentence = missed ? "The call never connected." : wanted || (summary ? summary.split(/(?<=[.!?])\s/)[0] ?? summary : k.in_voicemail ? "Reached voicemail." : "No summary from this call.");
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
    const mine = dec.subject_type === "conversation" && convIds.has(dec.subject_id) || dec.subject_type === "contact" && dec.subject_id === row2.id;
    if (!mine) continue;
    const t = ts(dec.created_at);
    if (t === null) continue;
    items.push({ id: `d-${dec.id}`, ts: t, ...stamp(t), kind: "decision", who: label.who, text: label.text });
  }
  if (d.visits?.all?.length) {
    const tz = d.visits.timezone;
    for (const v of d.visits.all) {
      const t = Date.parse(v.start);
      if (!Number.isFinite(t)) continue;
      const ahead = Date.parse(v.end) >= nowMs;
      items.push({
        id: `v-${v.id}`,
        ts: t,
        ...stamp(t),
        kind: "visit",
        who: "Calendar",
        text: `${ahead ? "Booked" : "Visited"} \xB7 ${v.title}`,
        sub: `${visitTime(v, tz)} \xB7 from ${d.visits.source}${v.via === "name" ? " \xB7 matched by name" : ""}`
      });
    }
  }
  if (d.added) {
    const t = ts(d.added.at);
    if (t !== null) items.push({ id: "added", ts: t, ...stamp(t), kind: "system", who: "Calendar", text: d.added.source === "calendar" ? `Added from your calendar${d.added.title ? ` (${d.added.title})` : ""}` : "Added by hand" });
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
  const threadTo = row2.latest_conversation_id ? `inbox/th-${row2.latest_conversation_id}` : null;
  const openInbox = threadTo ? { label: "Open in Inbox", to: threadTo } : null;
  const r = row2;
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
  if (d.visits) {
    const v = d.visits;
    const nextLine = v.next ? `${visitLine(v.next, v.timezone, nowMs)} \xB7 ${v.next.title}` : v.state === "ok" ? "Nothing on the calendar" : "Calendar could not be read";
    facts.push({
      label: "Next visit",
      value: v.next ? visitDay(v.next.start, v.timezone, nowMs) : "\u2014",
      // The cell is narrow: the time here, the service in About.
      meta: v.next ? `${visitTime(v.next, v.timezone)}${v.next.via === "name" ? " \xB7 by name" : ""}` : v.state === "ok" ? "none booked" : "could not be read"
    });
    about.push({ k: "Next visit", v: nextLine });
    if (v.last) about.push({ k: "Last visit", v: `${visitLine(v.last, v.timezone, nowMs)} \xB7 ${v.last.title}` });
  }
  if (d.added) {
    const at2 = ts(d.added.at);
    about.push({ k: "Added", v: `${at2 !== null ? DATE_YEAR_FMT.format(new Date(at2)) : "\u2014"} \xB7 ${d.added.source === "calendar" ? `from your calendar${d.added.title ? ` (${d.added.title})` : ""}` : "by hand"}` });
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
    notes: d.notes?.trim() || null,
    bookingLink: d.booking_link?.trim() || null,
    openThread: base.threadId ? `inbox/${base.threadId}` : null,
    receptionistMode: {
      person: asPersonMode(d.receptionist_mode),
      workspace: d.workspace_reply_mode === "veto" ? "auto" : asPersonMode(d.workspace_reply_mode)
    }
  };
}

// src/today.ts
var TODAY_QUEUE_MAX = 6;
var CHANNEL_LABEL = { whatsapp: "WhatsApp", voice: "Phone line" };
function tzClock(iso, tz, now) {
  const t = tzTime(iso, tz);
  if (!iso || !t) return t;
  const key = (d) => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    } catch {
      return d.toDateString();
    }
  };
  const day = key(new Date(iso));
  if (day === key(now)) return t;
  if (day === key(new Date(now.getTime() + 864e5))) return `tomorrow ${t}`;
  try {
    return `${new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date(iso))} ${t}`;
  } catch {
    return t;
  }
}
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
  const clock2 = valid ? localNow.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const datePart = valid ? `${localNow.toLocaleDateString("en-US", { weekday: "long" })} \xB7 ${localNow.toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : "";
  const greeting = hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
  const chips = m.channels.map((c) => ({
    text: `${CHANNEL_LABEL[c.kind] ?? c.kind} ${c.status === "active" ? "connected" : "disconnected"}`,
    ok: c.status === "active"
  }));
  const down = m.channels.filter((c) => c.status !== "active");
  const alert = m.workspace.status === "paused" ? "This workspace is paused \u2014 the receptionist is not answering anything." : down.length ? `${down.map((c) => CHANNEL_LABEL[c.kind] ?? c.kind).join(" and ")} ${down.length > 1 ? "are" : "is"} disconnected \u2014 messages coming in are not being answered.` : null;
  const byConv = new Map(conversations.map((c) => [c.id, c]));
  const openEsc = escalations.filter((e) => e.state === "open").filter((e) => {
    const conv = byConv.get(e.conversation_id);
    if (!conv) return true;
    return standingOf({
      state: conv.state,
      paused_until: conv.paused_until,
      assignee_user_id: conv.assignee_user_id,
      assignee_is_me: conv.assignee_is_me,
      open_escalation: true
    }, now.getTime()).standing === "needs_you";
  }).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const needsYouCount = openEsc.length;
  const needsRows = openEsc.map((e) => {
    const conv = byConv.get(e.conversation_id);
    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : void 0;
    const waitedMs = now.getTime() - new Date(e.created_at).getTime();
    const win = conv ? waWindow(conv.last_wa_inbound_at, now) : null;
    const closes = win?.open ? tzClock(win.closesAtIso, tz, now) : null;
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
  const closingConvs = conversations.filter((c) => {
    if (escSet.has(c.id)) return false;
    const last = c.messages[c.messages.length - 1];
    if (!last || last.sender !== "customer") return false;
    const w = waWindow(c.last_wa_inbound_at, now);
    return w.open && w.closesAtIso ? new Date(w.closesAtIso).getTime() - now.getTime() < 6 * 3600 * 1e3 : false;
  });
  const closingRows = closingConvs.map((c) => {
    const w = waWindow(c.last_wa_inbound_at, now);
    const mins = w.closesAtIso ? Math.max(1, Math.round((new Date(w.closesAtIso).getTime() - now.getTime()) / 6e4)) : 0;
    return {
      id: `wc-${c.id}`,
      text: `${contactName(c)} \u2014 window closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} (in ${formatWaited(mins * 6e4)})`,
      to: `inbox/th-${c.id}`
    };
  });
  const sinceMs = new Date(m.window.since).getTime();
  const callsInWindow = calls.filter(
    (c) => c.started_at && new Date(c.started_at).getTime() >= sinceMs
  );
  const callMinutes = Math.round(p.call_seconds / 60);
  const traffic = p.messages_in + p.calls + p.messages_out_you;
  const isQuiet = traffic === 0 && needsYouCount === 0 && !alert;
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
    const plural4 = m.channels.length > 1 ? "are" : "is";
    const sub = m.channels.length === 0 ? "No phone line or WhatsApp number is connected yet, so nothing can come in." : lastIn ? `${names} ${plural4} connected. The last message arrived ${lastIn}${gap !== null && gap > 0 && gap < 3600 ? `, and the receptionist answered ${secondsPhrase(gap)} later.` : "."}` : `${names} ${plural4} connected. No messages have arrived yet.`;
    return {
      standing: {
        eyebrow: `${datePart} \xB7 ${clock2} \xB7 ${m.workspace.name}`,
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
      queue: { rows: [], more: 0, parts: [] },
      launchpad: [{ label: "Conversations", to: "conversations" }],
      updatedAt: clock2,
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
  } else if (needsYouCount > 1) {
    headline = `${needsYouCount} conversations need you.`;
    if (oldest) detail = `The oldest has been waiting since ${oldest}.`;
    tone = "needs";
  } else if (needsYouCount === 1) {
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
  const callByConv = /* @__PURE__ */ new Map();
  for (const c of calls) {
    if (!c.conversation_id) continue;
    const prev = callByConv.get(c.conversation_id);
    if (!prev || String(c.started_at ?? "") > String(prev.started_at ?? "")) callByConv.set(c.conversation_id, c);
  }
  const say = (v) => typeof v === "string" && v.trim() ? v.trim() : "";
  const queueAll = [];
  for (const e of openEsc) {
    const conv = byConv.get(e.conversation_id);
    const waitedMs = now.getTime() - new Date(e.created_at).getTime();
    const since = tzTime(e.created_at, tz) ?? "";
    const warn = waitedMs > 30 * 6e4;
    if (e.reason === "callback") {
      const call = callByConv.get(e.conversation_id) ?? null;
      const who2 = conv ? contactName(conv) : call ? toCallVM(call, now).who : "Unknown caller";
      queueAll.push({
        id: `q-${e.id}`,
        kind: "callback",
        who: who2,
        initials: initialsOf(who2),
        channel: "Phone",
        when: `waited ${formatWaited(waitedMs)}`,
        sentence: say(e.details) || "The caller needs a call back.",
        quoted: false,
        status: ["Needs a call back", `since ${since}`],
        tone: "escalated",
        warn,
        cta: { label: "Open the call", to: call ? `conversations/cv-${call.id}` : `inbox/th-${e.conversation_id}` },
        also: { label: "Done", verb: "resolve", conversationId: e.conversation_id, escalationId: e.id },
        waitedMs
      });
      continue;
    }
    const lastCustomer = conv ? [...conv.messages].reverse().find((x) => x.sender === "customer") : void 0;
    const quote = lastCustomer ? messageText(lastCustomer).slice(0, 110) : "";
    const who = conv ? contactName(conv) : "Unknown";
    const win = conv ? waWindow(conv.last_wa_inbound_at, now) : null;
    const closes = win?.open ? tzClock(win.closesAtIso, tz, now) : null;
    queueAll.push({
      id: `q-${e.id}`,
      kind: "handoff",
      who,
      initials: initialsOf(who),
      channel: "WhatsApp",
      when: `waited ${formatWaited(waitedMs)}`,
      sentence: quote || (ESCALATION_REASON_LABELS[e.reason] ?? e.reason),
      quoted: !!quote,
      status: ["Escalated", reasonShort(e.reason) || e.reason, `since ${since}`, ...closes ? [`reply window closes ${closes}`] : []],
      tone: "escalated",
      warn,
      cta: { label: "Open and reply", to: `inbox/th-${e.conversation_id}` },
      also: { label: "Snooze", verb: "snooze", conversationId: e.conversation_id, escalationId: e.id },
      waitedMs
    });
  }
  for (const c of closingConvs) {
    const w = waWindow(c.last_wa_inbound_at, now);
    const leftMs = w.closesAtIso ? Math.max(6e4, new Date(w.closesAtIso).getTime() - now.getTime()) : 0;
    const last = [...c.messages].reverse().find((x) => x.sender === "customer");
    const who = contactName(c);
    queueAll.push({
      id: `q-w-${c.id}`,
      kind: "window",
      who,
      initials: initialsOf(who),
      channel: "WhatsApp",
      when: `closes ${tzClock(w.closesAtIso, tz, now) ?? "soon"} \xB7 in ${formatWaited(leftMs)}`,
      sentence: last ? messageText(last).slice(0, 110) : "They wrote last, and the free reply window is closing.",
      quoted: !!last,
      status: ["Reply window closing", "they wrote last"],
      tone: "warn",
      warn: leftMs < 2 * 36e5,
      cta: { label: "Open thread", to: `inbox/th-${c.id}` },
      also: null,
      // After every escalation (which waited ≥ 0), the soonest to close first.
      waitedMs: -leftMs
    });
  }
  for (const r of callRows) {
    if (r.to === "live") continue;
    const c = callsInWindow.find((k) => k.id === r.id);
    const wanted = say(c?.wanted);
    queueAll.push({
      id: `q-c-${r.id}`,
      kind: "call",
      who: r.who,
      initials: initialsOf(r.who),
      channel: "Phone",
      when: `${r.at}${r.duration ? ` \xB7 ${r.duration}` : ""}`,
      sentence: wanted || r.note,
      quoted: false,
      status: [wanted ? r.note : "Worth a listen"],
      tone: "warn",
      warn: false,
      cta: { label: "Open the call", to: r.to },
      also: null,
      waitedMs: Number.NEGATIVE_INFINITY
    });
  }
  queueAll.sort((a, b) => b.waitedMs - a.waitedMs);
  const countOf = (...kinds) => queueAll.filter((r) => kinds.includes(r.kind)).length;
  const needN = countOf("handoff", "callback");
  const winN = countOf("window");
  const earN = countOf("call");
  const parts2 = [
    needN ? `${needN} need you` : "",
    winN ? `${winN} reply window${winN === 1 ? "" : "s"} closing` : "",
    earN ? `${earN} call${earN === 1 ? "" : "s"} worth a listen` : ""
  ].filter(Boolean);
  const queue = { rows: queueAll.slice(0, TODAY_QUEUE_MAX), more: Math.max(0, queueAll.length - TODAY_QUEUE_MAX), parts: parts2 };
  return {
    standing: {
      eyebrow: `${datePart} \xB7 ${clock2} \xB7 ${m.workspace.name}`,
      chips,
      alert,
      greeting,
      headline,
      detail,
      tone
    },
    needsYou: {
      count: needsYouCount,
      hint: "The receptionist stopped and asked for a human.",
      rows: needsRows,
      empty: needsRows.length ? null : p.unanswered_in_window === 0 && p.messages_out_you === 0 ? "Nothing needs you. The receptionist answered every message that came in, and nobody asked for a person." : "Nothing needs you right now \u2014 nobody asked for a person."
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
      { label: `Inbox \u2014 ${needsYouCount} need you`, to: "inbox" },
      { label: "Conversations", to: "conversations" },
      ...p.calls ? [{ label: `Calls \u2014 ${p.calls} today`, to: "conversations/phone" }] : []
    ],
    queue,
    updatedAt: clock2,
    quiet: null
  };
}
function durationLabel(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? m ? `${h}h ${m}m` : `${h}h` : `${m}m`;
}
var FLAG_WORDS = { needs_you: "Needs you \u2014 in Inbox", waiting_on_you: "Waiting on you \u2014 in Inbox" };
function todayDay(cal, playbooks, people = null) {
  if (!cal) return { feed: "none", frames: [], nextOpening: null, reminders: null };
  const feed = cal.feed.state;
  const idx = cal.days.findIndex((d) => d.today);
  const picked = idx >= 0 ? cal.days.slice(idx, idx + 2) : [];
  const stateOf = new Map((people?.rows ?? []).map((r) => [r.id, r.state]));
  const item = (b, allDay, phase) => ({
    id: b.id,
    start: allDay ? "All day" : clockLabel(b.t),
    time: b.time,
    dur: allDay ? "" : durationLabel(b.dur),
    title: b.title,
    person: b.person ? { id: b.person.id, name: b.person.name } : null,
    allDay,
    phase,
    flag: b.person ? FLAG_WORDS[stateOf.get(b.person.id) ?? ""] ?? null : null
  });
  const frames = picked.map((d) => {
    let nextTaken = false;
    const timed = [...d.blocks].sort((a, b) => a.t - b.t).map((b) => {
      let phase = "later";
      if (d.today) {
        const end = b.t + b.dur / 60;
        if (end <= cal.now) phase = "past";
        else if (b.t <= cal.now) phase = "now";
        else if (!nextTaken) {
          phase = "next";
          nextTaken = true;
        }
      }
      return item(b, false, phase);
    });
    const items = [...d.allDay.map((b) => item(b, true, "later")), ...timed];
    const flagged = items.filter((i) => i.flag).length;
    return {
      key: d.key,
      label: `${d.today ? "Today" : "Tomorrow"} \xB7 ${d.long}`,
      today: d.today,
      past: d.past,
      closed: d.closed,
      items,
      summary: items.length ? { booked: `${items.length} booked`, flagged: flagged ? `${flagged} need${flagged === 1 ? "s" : ""} you` : null } : null,
      open: d.closed.yes || d.past ? [] : d.windows.map((w) => w.label)
    };
  });
  let reminders = null;
  if (feed === "ok") {
    const visit = (playbooks ?? []).filter((p) => (p.trigger === "visit_tomorrow" || p.trigger === "visited") && p.state === "running");
    reminders = visit.length === 0 ? { text: "No visit reminders yet \u2014 a playbook can text the day before an appointment and the day after a visit.", to: "outbound" } : { text: visit.map((p) => `${p.trigger === "visit_tomorrow" ? "Visit reminder" : "After the visit"}: ${p.candidates} ${p.candidates === 1 ? "person" : "people"} \xB7 next run ${p.next}`).join(" \xB7 "), to: "outbound" };
  }
  return { feed, frames, nextOpening: feed === "ok" && cal.stats.next !== "\u2014" ? cal.stats.next : null, reminders };
}
function todayDayFacts(cal, agg) {
  if (!cal || cal.feed.state !== "ok") return [];
  const out = [];
  const today = cal.days.find((d) => d.today);
  if (today) {
    const n = today.blocks.length + today.allDay.length;
    const hint = today.closed.yes ? `closed today${today.closed.note ? ` \xB7 ${today.closed.note}` : ""}` : cal.stats.next !== "\u2014" ? `next opening ${cal.stats.next}` : void 0;
    out.push(hint ? { label: "Appointments today", value: String(n), hint } : { label: "Appointments today", value: String(n) });
  }
  if (agg) out.push({ label: "Booked ahead", value: String(agg.booked), hint: `${agg.reachedWeek} reached this week` });
  return out;
}
function todayWeek(r) {
  if (!r) return null;
  const find = (id) => r.campaigns.tiles.find((t) => t.id === id);
  const sent = find("sent");
  const yes = find("optins");
  const offers = r.campaigns.empty || !sent || sent.value === "0" ? "No offers went out." : `${sent.value} offer message${sent.value === "1" ? "" : "s"} sent \xB7 ${yes ? yes.value : "0"} said yes`;
  const b = r.booking;
  const booking = !b.present ? { text: b.sub, to: "calendar" } : b.pct === null ? { text: "Nobody wrote or called, so there was nothing to book.", to: "reports" } : { text: `Asked \u2192 booked: ${b.headline} \xB7 ${b.pct}%`, to: "reports" };
  return {
    label: `Last ${r.vm.rangeLabel}`,
    sub: `${r.vm.since} \u2013 ${r.vm.until} \xB7 against the ${r.vm.days} days before`,
    tiles: r.vm.tiles,
    lines: [{ id: "campaigns", text: offers, to: "reports" }, { id: "booking", ...booking }]
  };
}
function todayJourney(people) {
  if (!people) return null;
  const rows = people.lists.filter((l) => l.group === "journey").map((l) => ({ id: l.id, label: l.label, count: l.count, to: `clients/seg:${l.id}`, act: l.count > 0 && l.action && l.action.enabled ? { label: l.action.cta, to: l.action.to } : null }));
  return { rows, note: people.calendar.state === "ok" ? null : "Booked, asked-never-booked and lapsed appear once the calendar is connected." };
}
function todayAway(rows, max = 5) {
  const fresh = rows.filter((r) => r.unread);
  return { rows: fresh.slice(0, max), more: Math.max(0, fresh.length - max) };
}

// src/notifications.ts
var DAY_MS3 = 24 * 3600 * 1e3;
function buildNotificationFeed(input) {
  const { now } = input;
  const items = [];
  for (const t of input.threads ?? []) {
    if (!t.real) continue;
    if (t.needsYou) {
      const at2 = t.escalatedAtMs ?? (typeof t.waitingMin === "number" ? now - t.waitingMin * 6e4 : t.lastAtMs ?? now);
      items.push({
        key: `needs:${t.id}`,
        kind: "needs_you",
        at: at2,
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
    if (now - c.startedAtMs > DAY_MS3) continue;
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
    const at2 = Date.parse(i.created_at);
    items.push({
      key: `invite:${i.id}`,
      kind: "invite",
      at: Number.isNaN(at2) ? now : at2,
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
  return agoShort(atMs, now);
}
var ALERT_KINDS = ["needs_you", "held_draft", "missed_call"];
var SERVER_NOTIFICATION_KINDS = ["handoff", "deadman", "call", "number", "sweep", "job_failed", "playbook", "calendar_people", "alert", "review", "billing"];
var SERVER_LOOK = {
  handoff: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  deadman: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  call: { icon: "phone", tone: "", action: "Open the calls", to: "conversations/phone" },
  number: { icon: "shield", tone: "warn", action: "Open Connections", to: "admin/integrations" },
  sweep: { icon: "alert", tone: "warn", action: "Open Connections", to: "admin/integrations" },
  job_failed: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  playbook: { icon: "bolt", tone: "ok", action: "Open Playbooks", to: "outbound" },
  calendar_people: { icon: "users", tone: "ok", action: "Open People", to: "clients" },
  /** A review on Google: good news with somewhere to read it. */
  review: { icon: "star", tone: "ok", action: "Open Reports", to: "reports" },
  /** The subscription: a trial starting or ending, a card declined, the receptionist paused or back. */
  billing: { icon: "money", tone: "warn", action: "Open Billing", to: "admin/billing" },
  alert: { icon: "bell", tone: "", action: "Open Today", to: "today" }
};
var ROUTE_VERBS = [
  [/^admin\/setup/, "Open Setup"],
  [/^admin\/integrations/, "Open Connections"],
  [/^admin\/workspace/, "Open Workspace"],
  [/^admin\/notifications/, "Open Notifications"],
  [/^admin\/billing/, "Open Billing"],
  [/^inbox/, "Open the Inbox"],
  [/^conversations\/phone/, "Open the calls"],
  [/^live/, "Open Live"],
  [/^outbound/, "Open Playbooks"],
  [/^broadcasts/, "Open Broadcasts"],
  [/^calendar/, "Open Calendar"],
  [/^clients/, "Open People"],
  [/^reports/, "Open Reports"],
  [/^today/, "Open Today"]
];
function verbForRoute(route) {
  if (!route) return null;
  const hit = ROUTE_VERBS.find(([re]) => re.test(route));
  return hit ? hit[1] : null;
}
var SERVER_KEY_PREFIX = "n:";
function serverNotificationRows(dto) {
  if (!dto) return [];
  const seen = dto.seen_at ? Date.parse(dto.seen_at) : 0;
  return dto.notifications.filter((n) => !n.dismissed).map((n) => {
    const look = SERVER_LOOK[n.kind] ?? SERVER_LOOK.alert;
    const at2 = Date.parse(n.created_at);
    return {
      key: `${SERVER_KEY_PREFIX}${n.id}`,
      kind: SERVER_NOTIFICATION_KINDS.includes(n.kind) ? n.kind : "alert",
      at: at2,
      title: n.title,
      message: n.body.split("\n").find((l) => l.trim())?.trim().slice(0, 160) ?? "",
      to: n.route ?? look.to,
      icon: look.icon,
      tone: look.tone,
      action: verbForRoute(n.route) ?? look.action,
      unread: at2 > seen && !n.read,
      about: n.subject_type && n.subject_id ? { type: n.subject_type, id: n.subject_id } : null
    };
  });
}
function dedupeFeed(rows) {
  const covered = new Set(rows.filter((r) => r.kind === "needs_you" && r.key.startsWith("needs:th-")).map((r) => r.key.slice("needs:th-".length)));
  return rows.filter((r) => !(r.key.startsWith(SERVER_KEY_PREFIX) && r.about?.type === "conversation" && covered.has(r.about.id)));
}

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
      description: "The rows the answer rests on, taken ONLY from what the tools returned this turn, at most four \u2014 the ones the answer names. Each needs the kind, the exact id the tool gave you, and a short label (a name, a day, a call time).",
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
      description: "Up to two short questions the person might ask next, in their language. Empty when nothing natural follows.",
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
  const at2 = raw.search(/name=["']citations["']/i);
  if (at2 < 0) return [];
  const start = raw.indexOf("[", at2);
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
  { label: "Connections", to: "admin/integrations", kind: "page", sub: "WhatsApp, phone line, calendar" },
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
    actClose: "Close for a day",
    actCloseQ: "Close on ",
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
    actCloseQ: "Cierra el ",
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
var WHEN = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
var SERVICE = { kind: "visit_service", label: "Service", example: "a consultation" };
var WHEN_ES = { ...WHEN, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
var SERVICE_ES = { ...SERVICE, label: "Servicio", example: "una consulta" };
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
        slots: [FIRST, BUSINESS, { kind: "text", label: "The offer", example: "20% off any service booked before Friday." }, LINK]
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aqu\xED: {{4}} \u2014 las plazas son limitadas.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, { kind: "text", label: "La oferta", example: "20% de descuento en cualquier servicio reservado antes del viernes." }, LINK_ES]
      }
    }
  },
  {
    key: "visit_reminder",
    name: "visit_reminder",
    title: "Visit reminder",
    purpose: "for the day before an appointment",
    category: "utility",
    trigger: "visit_tomorrow",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. A reminder of your appointment {{3}} for {{4}}. If you need to change it, just reply here.",
        footer: null,
        slots: [FIRST, BUSINESS, WHEN, SERVICE]
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Te recordamos tu cita {{3}} para {{4}}. Si necesitas cambiarla, responde aqu\xED.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, WHEN_ES, SERVICE_ES]
      }
    }
  },
  {
    key: "after_visit",
    name: "after_visit",
    title: "After the visit",
    purpose: "for the day after a visit",
    category: "marketing",
    trigger: "visited",
    texts: {
      en_US: {
        body: "Hi {{1}}, thank you for coming to {{2}} yesterday \u2014 we hope you love the result. When you're ready for your next visit, pick a time here: {{3}}.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}} \u2014 esperamos que te encante el resultado. Cuando quieras tu pr\xF3xima cita, elige la hora aqu\xED: {{3}}.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
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
function eligibleFor(rows, kind, id, savedIds, purpose) {
  let pool = rows;
  if (kind === "list") {
    const l = PEOPLE_LISTS.find((x) => x.id === id);
    if (!l) return [];
    pool = rows.filter(l.test);
  } else if (kind === "saved") {
    if (!savedIds) return [];
    pool = rows.filter((r) => savedIds.has(r.id));
  }
  return pool.filter((r) => mayReceive(r, purpose));
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
  // The reason the send job writes when the OTHER yes is the missing one. It was
  // added to the wire (00095) and not to these words, so the owner read the raw
  // enum `no_marketing_consent` on the broadcast's own detail pane -- and the
  // distinction it draws is the entire point of the split, so it is the last one
  // that should have arrived untranslated.
  no_marketing_consent: "no yes to offers",
  no_phone: "no number",
  human_has_it: "a person had the thread",
  erased: "deleted",
  send_failed: "WhatsApp refused",
  missing_value: "a value was missing"
};
function emptyAudienceRefusal(purpose) {
  return purpose === "marketing" ? "Nobody there has said yes to offers yet \u2014 that is a separate answer from saying yes to messages, and only it puts somebody on a promotional broadcast. Record it under \u201COffers and news\u201D on a person's profile, or get their yes with the phrase and QR on this page." : "Nobody there has said yes to messages yet. Even a reminder about their own visit needs their recorded yes. Record it on a person's profile, or get their yes with the phrase and QR on this page.";
}
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
var PARAM_SOURCES = ["text", "first_name", "business_name", "booking_link", "visit_when", "visit_service"];
var PARAM_SOURCE_LABELS = {
  text: "Type it",
  first_name: "Their first name",
  business_name: "The business name",
  booking_link: "The booking link",
  visit_when: "Their visit's time",
  visit_service: "Their visit's service"
};
function parseParamSpec(raw) {
  if (typeof raw === "string") {
    const m = /^@(first_name|business_name|booking_link|visit_when|visit_service)$/.exec(raw.trim());
    if (m) return { kind: m[1] };
    return { kind: "text", value: raw };
  }
  if (raw && typeof raw === "object") {
    const o = raw;
    if (o.kind === "text") return typeof o.value === "string" ? { kind: "text", value: o.value } : null;
    if (o.kind === "first_name" || o.kind === "business_name" || o.kind === "booking_link" || o.kind === "visit_when" || o.kind === "visit_service") return { kind: o.kind };
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
      case "visit_when":
        return f.visitWhen ?? "";
      case "visit_service":
        return f.visitService ?? "";
    }
  });
}
function exampleParams(specs, businessName) {
  return resolveParams(specs, { firstName: "Dani", businessName, bookingLink: "your booking link", visitWhen: "tomorrow at 2:00 PM", visitService: "a consultation" });
}

// src/playbooks.ts
var DAY_MS4 = 864e5;
var PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", kind: "list", hint: "Nothing heard in 30 days" },
  { id: "new_week", label: "Welcome", list: "new_week", cls: "campaign", kind: "list", hint: "First contact in the last 7 days" },
  { id: "phoned_only", label: "Save our number", list: "phoned_only", cls: "reengage", kind: "list", hint: "Only ever phoned, never texted" },
  { id: "everyone_monthly", label: "The month's offer", list: null, cls: "campaign", kind: "cadence", hint: "Everyone who said yes, on a cadence" },
  { id: "visit_tomorrow", label: "Visit reminder", list: null, cls: "booking", kind: "visit", hint: "The day before an appointment on the calendar" },
  { id: "visited", label: "After the visit", list: null, cls: "reengage", kind: "visit", hint: "The day after a visit, when nothing is booked next" }
];
var PLAYBOOK_STATES = ["running", "paused"];
var PLAYBOOK_DEFAULTS = { runHour: 10, capPerRun: 25, gapDays: 90, cadenceDays: 30 };
var PLAYBOOK_HOURS = { min: 9, max: 20 };
var PLAYBOOK_BREATH_MS = 7 * DAY_MS4;
var PLAYBOOK_VETO_DELAY_MS = 30 * 6e4;
var PLAYBOOK_NAME_MAX = 80;
function triggerOf(id) {
  return PLAYBOOK_TRIGGERS.find((t) => t.id === id) ?? null;
}
function eligibleForPlaybook(rows, p, touches, nowMs) {
  const t = triggerOf(p.trigger);
  if (!t) return [];
  const purpose = purposeOfPlaybook(t.cls);
  if (t.kind === "visit") {
    const pool2 = eligibleFor(rows, "everyone", null, null, purpose).filter((r) => {
      if (!r.calendarTz) return false;
      if (p.trigger === "visit_tomorrow") return r.nextVisitDate !== null && r.nextVisitDate === localDate(r.calendarTz, new Date(nowMs + DAY_MS4));
      return r.lastVisitDate !== null && r.lastVisitDate === localDate(r.calendarTz, new Date(nowMs - DAY_MS4)) && !r.booked;
    });
    pool2.sort((a, b) => p.trigger === "visit_tomorrow" ? (a.nextVisitMs ?? 0) - (b.nextVisitMs ?? 0) : (a.lastVisitMs ?? 0) - (b.lastVisitMs ?? 0));
    return pool2.slice(0, Math.max(1, p.cap_per_run));
  }
  const pool = t.list ? eligibleFor(rows, "list", t.list, null, purpose) : eligibleFor(rows, "everyone", null, null, purpose);
  const gapMs = (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) * DAY_MS4;
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
  const at2 = `${two(p.run_hour)}:00`;
  if (triggerOf(p.trigger)?.kind === "visit") return `Daily ${at2} \xB7 ${p.trigger === "visit_tomorrow" ? "everyone with a visit tomorrow" : "everyone who visited yesterday"} \xB7 up to ${p.cap_per_run}`;
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days at ${at2} \xB7 up to ${p.cap_per_run} a day`;
  return `Daily ${at2} \xB7 up to ${p.cap_per_run} \xB7 once per person, again after ${p.gap_days} days`;
}
function nextRunLabel(p, tz, now) {
  if (p.state !== "running") return "paused";
  const { date, hour } = parts(tz, now);
  const at2 = `${two(p.run_hour)}:00`;
  if (p.last_run_for !== date) {
    if (hour < p.run_hour) return `today ${at2}`;
    if (hour <= PLAYBOOK_HOURS.max) return "today, within the hour";
  }
  return `tomorrow ${at2}`;
}
var PLAYBOOK_CLASS_LABEL = {
  reengage: POLICY_CLASS_WORDS.reengage.short,
  campaign: POLICY_CLASS_WORDS.campaign.short,
  booking: POLICY_CLASS_WORDS.booking.short
};
function visitFactsFor(trigger, visit, tz) {
  const t = triggerOf(trigger);
  if (!t || t.kind !== "visit" || !visit) return null;
  return {
    visit_when: trigger === "visit_tomorrow" ? `tomorrow at ${visitStartTime(visit, tz)}` : "yesterday",
    visit_service: visit.title.trim() || "your appointment"
  };
}

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
var WHEN2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
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
    lastLabel: s.last_at ? WHEN2.format(new Date(s.last_at)) : "",
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
      meta: tot.sent ? `${tot.replied} wrote back within 3 days` : "nothing sent",
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
var channelIsOn = (c) => typeof c.on === "boolean" ? c.on : (c.status ?? "active") === "active";
function channelFor(rows, kind) {
  const mine = rows.filter((c) => c.kind === kind);
  if (mine.length === 0) return null;
  const on = mine.filter(channelIsOn);
  const pool = on.length > 0 ? on : mine;
  return [...pool].sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))[0] ?? pool[0];
}
var DAY_MS5 = 864e5;
var QUIET_AFTER_MS2 = 7 * DAY_MS5;
var DATE_FMT4 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
function ago2(ms2, nowMs) {
  return agoWords(ms2, nowMs, { dateAfterMs: QUIET_AFTER_MS2, date: (at2) => DATE_FMT4.format(new Date(at2)) });
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
    lastInboundMs: last,
    created_at: dto.created_at
  };
}

// src/forwarding.ts
var CARRIERS = ["verizon", "att", "tmobile", "other"];
var FORWARDING_MODES = ["unanswered", "always"];
var CARRIER_WORDS = {
  verizon: "Verizon",
  att: "AT&T",
  tmobile: "T-Mobile",
  other: "Another carrier or a landline"
};
var MODE_WORDS = {
  unanswered: "Only calls you don't answer",
  always: "Every call"
};
var FORWARDING_TEST_WINDOW_MS = 30 * 6e4;
function telHref(code2) {
  return `tel:${code2.replace(/\+/g, "%2B").replace(/#/g, "%23")}`;
}
function national(e164) {
  const d = e164.replace(/[^\d]/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}
var code = (c) => ({ code: c, tel: telHref(c) });
var UNANSWERED_NOTE = "Your phone rings first. After your carrier's timer, usually 15 to 30 seconds, the call comes to the receptionist. If voicemail picks up first, calls never arrive: ask your carrier to lengthen the ring time, or forward every call.";
var DIAL_NOTE = "Dial it on the phone that has the number you keep, wait for the tone or the message, then hang up.";
function forwardingCodes(carrier, mode, destinationE164) {
  const n10 = national(destinationE164);
  const full = normalizePhone(destinationE164) ?? destinationE164;
  const conditional = mode === "unanswered";
  switch (carrier) {
    case "verizon":
      return {
        on: code(conditional ? `*71${n10}` : `*72${n10}`),
        off: code("*73"),
        notes: [DIAL_NOTE, ...conditional ? [UNANSWERED_NOTE] : [], "Verizon forwards calls only, never texts."]
      };
    case "att":
      return {
        on: code(conditional ? `*61*${n10}#` : `*21*${n10}#`),
        off: code(conditional ? "#61#" : "#21#"),
        notes: [
          DIAL_NOTE,
          ...conditional ? [UNANSWERED_NOTE, `Busy too: dial *67*${n10}#. If AT&T refuses these codes, dial *92 then the number for no answer and *90 then the number for busy, or ask AT&T for your plan's codes.`] : []
        ]
      };
    case "tmobile":
      return {
        on: code(conditional ? `**004*${full}#` : `**21*${full}#`),
        off: code(conditional ? "##004#" : "##21#"),
        notes: [DIAL_NOTE, ...conditional ? [UNANSWERED_NOTE] : [], "T-Mobile takes the number with +1 in front."]
      };
    default:
      return {
        on: code(conditional ? `*92${n10}` : `*72${n10}`),
        off: code(conditional ? "*93" : "*73"),
        notes: [
          DIAL_NOTE,
          ...conditional ? [UNANSWERED_NOTE] : [],
          "Codes vary by carrier. If these are refused, ask your carrier for its call-forwarding codes: most landlines use *72 for every call and *92 or *71 for calls you don't answer."
        ]
      };
  }
}
var isCarrier = (v) => typeof v === "string" && CARRIERS.includes(v);
var isForwardingMode = (v) => typeof v === "string" && FORWARDING_MODES.includes(v);
function forwardingMatch(facts, call, nowMs = Date.now()) {
  const started = call.startedAtIso ? Date.parse(call.startedAtIso) : nowMs;
  const from = typeof facts.test_started_at === "string" ? Date.parse(facts.test_started_at) : NaN;
  const until = typeof facts.test_until === "string" ? Date.parse(facts.test_until) : NaN;
  if (Number.isNaN(started) || Number.isNaN(from) || Number.isNaN(until)) return false;
  if (started < from - 6e4 || started > until) return false;
  const dest = typeof facts.destination_e164 === "string" ? normalizePhone(facts.destination_e164) : null;
  if (dest && call.toE164 && normalizePhone(call.toE164) !== dest) return false;
  const testFrom = typeof facts.test_from === "string" && facts.test_from ? normalizePhone(facts.test_from) : null;
  if (testFrom && (!call.fromE164 || normalizePhone(call.fromE164) !== testFrom)) return false;
  return true;
}
function forwardingTestOpen(facts, nowMs = Date.now()) {
  const until = typeof facts.test_until === "string" ? Date.parse(facts.test_until) : NaN;
  return !Number.isNaN(until) && until > nowMs;
}

// src/review-reply.ts
function reviewReplyModeOf(rows) {
  const m = rows?.find((r) => r.class === "reviews")?.mode;
  return m === "auto" || m === "never" ? m : "ask";
}
var REVIEW_REPLY_MAX_WORDS = 60;
var REVIEW_REPLY_MAX_CHARS = 1e3;
var REVIEW_AUTO_REPLIES_PER_SYNC = 3;
var REVIEW_AUTO_REPLY_MAX_AGE_MS = 14 * 864e5;
function firstName(author) {
  const a = (author ?? "").trim();
  if (!a || /^(a google user|anonymous)$/i.test(a)) return null;
  return a.split(/\s+/)[0];
}
function reviewReplyPrompt(facts, review) {
  const lang = facts.languages[0] ?? "English";
  const system = [
    "You write the public reply a business posts under a Google review, in the business's own name.",
    `Business: ${facts.name}.`,
    facts.tone ? `Tone, in the owner's words: ${facts.tone}` : null,
    facts.languages.length ? `Languages the business speaks: ${facts.languages.join(", ")}.` : null,
    facts.services.length ? `Services: ${facts.services.slice(0, 12).join(", ")}.` : null,
    facts.website ? `Website: ${facts.website}` : null,
    facts.phone ? `Phone: ${facts.phone}` : null,
    "",
    "Rules:",
    `- Reply in the language the review is written in. When the review has no words, reply in ${lang}.`,
    `- One to three sentences, at most ${REVIEW_REPLY_MAX_WORDS} words. Warm and specific to what they wrote, never a form letter.`,
    "- Address them by first name when one is given; no name when the review is anonymous.",
    "- Four or five stars: thank them and pick up one thing they praised.",
    `- Three stars or fewer: thank them for the feedback, apologise plainly for what went wrong, and invite them to get in touch so it can be put right${facts.phone ? ` (${facts.phone})` : ""}. Never argue, never dispute what they wrote, never blame them.`,
    "- Never mention refunds, discounts, prices or compensation \u2014 those decisions belong to the owner.",
    "- Never invent details about their visit, names of staff, or promises the business did not make.",
    "- No emojis, no hashtags, no sign-off, no quotation marks around the reply, and do not write the business name at the end.",
    "",
    "Answer with the reply text only."
  ].filter((l) => l !== null).join("\n");
  const name = firstName(review.author);
  const text = (review.text ?? "").replace(/\s+/g, " ").trim();
  const user = [
    `Rating: ${typeof review.rating === "number" ? `${review.rating} of 5` : "not given"}`,
    `From: ${name ? review.author.trim() : "a customer who did not give a name"}`,
    review.written_at ? `Written: ${review.written_at.slice(0, 10)}` : null,
    text ? `Review: "${text}"` : "The review has no words, only the stars."
  ].filter((l) => l !== null).join("\n");
  return { system, user };
}
function cleanDraft(raw) {
  if (typeof raw !== "string") return "";
  let t = raw.replace(/\r\n?/g, "\n").trim();
  t = t.replace(/^(reply|response|draft)\s*:\s*/i, "");
  t = t.replace(/^["“”'‘’«»]+|["“”'‘’«»]+$/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t.slice(0, REVIEW_REPLY_MAX_CHARS);
}
function autoReplyCandidates(rows, connectedAt, nowMs, cap = REVIEW_AUTO_REPLIES_PER_SYNC) {
  const connected = connectedAt ? Date.parse(connectedAt) : NaN;
  if (Number.isNaN(connected)) return [];
  return rows.filter((r) => r.origin === "profile" && !r.reply_text && r.published_at).map((r) => ({ r, at: Date.parse(r.published_at) })).filter(({ at: at2 }) => !Number.isNaN(at2) && at2 > connected && nowMs - at2 <= REVIEW_AUTO_REPLY_MAX_AGE_MS).sort((a, b) => b.at - a.at).slice(0, Math.max(0, cap)).map(({ r }) => r);
}
function autoReplyBell(answered) {
  if (!answered.length) return null;
  if (answered.length === 1) {
    const who = (answered[0].author ?? "").trim();
    return { title: who ? `Replied to ${who}'s review` : "Replied to a review on Google", body: answered[0].text };
  }
  const names = answered.map((a) => (a.author ?? "").trim()).filter(Boolean);
  return { title: `Replied to ${answered.length} reviews on Google`, body: names.length ? `Under the reviews from ${names.join(", ")}. Each reply is on Reports.` : "Each reply is on Reports." };
}
function reviewReplyWords(mode, canReply) {
  if (!canReply || !mode) return "";
  if (mode === "auto") return "new ones are answered by the receptionist within the hour";
  if (mode === "ask") return "the receptionist drafts, you send";
  return "";
}

// src/google.ts
var GOOGLE_SHOWN_REVIEWS = 5;
var REVIEW_NEWS_MS = 36 * 3600 * 1e3;
var REVIEW_NEWS_MAX_AGE_MS = 14 * 864e5;
var BOOTSTRAP_MS = 3600 * 1e3;
var plural2 = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function ratingWords(rating) {
  return typeof rating === "number" && Number.isFinite(rating) ? `${rating.toFixed(1)} \u2605` : "no rating yet";
}
function starsOf(rating) {
  const n = typeof rating === "number" && Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
  return "\u2605".repeat(n) + "\u2606".repeat(5 - n);
}
function reviewsWords(count) {
  return typeof count === "number" ? plural2(count, "review") : "reviews not counted yet";
}
function listingLine(l) {
  if (!l.review_count) return `${l.name} \xB7 no reviews on Google yet`;
  return `${l.name} \xB7 ${ratingWords(l.rating)} \xB7 ${reviewsWords(l.review_count)} on Google`;
}
function checkedWords(l, nowMs) {
  if (l.check_error && l.checked_at) return `Google could not be read since ${agoWords(Date.parse(l.checked_at), nowMs)} \u2014 tried again every hour`;
  if (l.check_error) return "Google could not be read yet \u2014 tried again every hour";
  if (l.checked_at) return `Checked ${agoWords(Date.parse(l.checked_at), nowMs)}`;
  return "Not read yet";
}
function connectionWords(c, nowMs) {
  const who = c.google_email ? `Connected as ${c.google_email}` : "Connected";
  if (!c.location_name) return `${who} \xB7 choose the location to finish`;
  if (c.sync_error && c.last_synced_at) return `${who} \xB7 could not sync since ${agoWords(Date.parse(c.last_synced_at), nowMs)} \u2014 tried again every hour`;
  if (c.sync_error) return `${who} \xB7 could not sync yet \u2014 tried again every hour`;
  if (c.last_synced_at) return `${who} \xB7 synced ${agoWords(Date.parse(c.last_synced_at), nowMs)}`;
  return `${who} \xB7 not synced yet`;
}
function reviewSnippet(body, max = 90) {
  const t = (body ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}\u2026` : t;
}
var DATE_FMT5 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS3 = 7 * 864e5;
function whenWords(iso, nowMs) {
  if (!iso) return "";
  const at2 = Date.parse(iso);
  if (Number.isNaN(at2)) return "";
  return agoWords(at2, nowMs, { dateAfterMs: WEEK_MS3, date: (ms2) => DATE_FMT5.format(new Date(ms2)) });
}
function shiftDay(day, n) {
  const d = dayDate(day);
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function reviewIsNew(r, linkedAt, nowMs) {
  const seen = Date.parse(r.first_seen_at);
  const linked = Date.parse(linkedAt);
  if (Number.isNaN(seen)) return false;
  if (nowMs - seen > REVIEW_NEWS_MS) return false;
  if (!Number.isNaN(linked) && seen - linked < BOOTSTRAP_MS) return false;
  const written = r.published_at ? Date.parse(r.published_at) : NaN;
  if (Number.isNaN(written)) return false;
  return nowMs - written <= REVIEW_NEWS_MAX_AGE_MS;
}
function toGoogleReviewVM(r, linkedAt, nowMs) {
  return {
    id: r.id,
    stars: starsOf(r.rating),
    rating: r.rating,
    author: r.author?.trim() || "A customer",
    when: whenWords(r.published_at, nowMs),
    text: (r.body ?? "").replace(/\s+/g, " ").trim(),
    replied: !!r.reply_text,
    replyText: (r.reply_text ?? "").replace(/\s+/g, " ").trim(),
    mapsUri: r.maps_uri,
    isNew: reviewIsNew(r, linkedAt, nowMs),
    fromProfile: r.origin === "profile"
  };
}
var EMPTY_GAINED = { points: [], max: 0, total: null, sinceLabel: null };
function gainedOver(days, periodDays) {
  const sorted = [...days].sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  if (sorted.length < 2) return { current: EMPTY_GAINED, previous: null };
  const last = sorted[sorted.length - 1];
  const since = shiftDay(last.day, -(periodDays - 1));
  const before = sorted.filter((d) => d.day < since);
  const inside = sorted.filter((d) => d.day >= since);
  const baseline = before.length ? before[before.length - 1] : inside[0];
  const total = last.review_count - baseline.review_count;
  const sinceLabel = before.length ? null : fmtDay(baseline.day);
  const byDay = new Map(sorted.map((d) => [d.day, d.review_count]));
  const points = [];
  let prev = before.length ? baseline.review_count : null;
  for (let day = since; day <= last.day; day = shiftDay(day, 1)) {
    const count = byDay.get(day);
    const gained = count !== void 0 && prev !== null ? Math.max(0, count - prev) : 0;
    if (count !== void 0) prev = count;
    points.push({ day, label: fmtDay(day), short: String(dayDate(day).getDate()), gained });
  }
  const max = Math.max(0, ...points.map((p) => p.gained));
  const prevSince = shiftDay(since, -periodDays);
  const prevBefore = sorted.filter((d) => d.day < prevSince);
  const prevInside = sorted.filter((d) => d.day >= prevSince && d.day < since);
  const previous = prevBefore.length && prevInside.length ? prevInside[prevInside.length - 1].review_count - prevBefore[prevBefore.length - 1].review_count : null;
  return { current: { points, max, total: before.length || inside.length >= 2 ? total : null, sinceLabel }, previous };
}
function toGoogleVM(dto, periodDays, nowMs = Date.now()) {
  const l = dto.listing;
  const c = dto.connection ?? null;
  const connection = c ? { email: c.google_email, location: c.location_title, words: connectionWords(c, nowMs), pending: !c.location_name, trouble: !!c.sync_error } : null;
  const canReply = !!c && !!c.location_name;
  const reply = { mode: dto.reply_mode, words: reviewReplyWords(dto.reply_mode, canReply) };
  const table = { columns: ["Reviewer", "Stars", "Written", "Words"], rows: [] };
  if (!l) return { listing: null, connection, canReply, reply, tiles: [], gained: EMPTY_GAINED, latest: [], source: "", table, todayLine: null };
  const latest = [...dto.reviews].sort((a, b) => (Date.parse(b.published_at ?? "") || 0) - (Date.parse(a.published_at ?? "") || 0)).map((r) => toGoogleReviewVM(r, l.linked_at, nowMs));
  table.rows = latest.map((r) => [r.author, r.rating ?? "\u2014", r.when || "\u2014", r.text || "\u2014"]);
  const source = canReply ? "every review, from your Business Profile" : `the ${latest.length === 1 ? "one" : latest.length} Google shows first`;
  const days = [...dto.days].sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
  const { current: gained, previous } = gainedOver(days, periodDays);
  const noun = `${periodDays} days`;
  const inPeriod = days.length ? days.filter((d) => d.day >= shiftDay(days[days.length - 1].day, -(periodDays - 1))) : [];
  const ratingSpark = inPeriod.map((d) => d.rating ?? 0);
  const countSpark = inPeriod.map((d) => d.review_count);
  const baselineRating = (() => {
    if (!days.length) return null;
    const since = shiftDay(days[days.length - 1].day, -(periodDays - 1));
    const before = days.filter((d) => d.day < since);
    return before.length ? before[before.length - 1].rating : null;
  })();
  const ratingDelta = typeof l.rating === "number" && typeof baselineRating === "number" ? Math.abs(l.rating - baselineRating) < 0.05 ? { text: `same as ${noun} ago`, tone: "" } : { text: `${l.rating - baselineRating > 0 ? "+" : ""}${(l.rating - baselineRating).toFixed(1)} vs ${noun} ago`, tone: l.rating > baselineRating ? "pos" : "neg" } : null;
  const newest = latest[0] ?? null;
  const checked = checkedWords(l, nowMs);
  const tiles = [
    {
      id: "rating",
      label: "Rating on Google",
      value: typeof l.rating === "number" ? l.rating.toFixed(1) : "\u2014",
      meta: `${reviewsWords(l.review_count)} \xB7 ${checked.toLowerCase()}`,
      delta: ratingDelta,
      spark: ratingSpark
    },
    {
      id: "reviews",
      label: "Reviews on Google",
      value: typeof l.review_count === "number" ? String(l.review_count) : "\u2014",
      meta: "as Google counts them, with or without words",
      delta: null,
      spark: countSpark
    },
    {
      id: "gained",
      label: `Gained in ${noun}`,
      value: gained.total === null ? "\u2014" : String(gained.total),
      meta: gained.total === null ? "needs a second day of reading" : gained.sinceLabel ? `since ${gained.sinceLabel}, the first day on record` : `new ratings, words or not`,
      delta: gained.total !== null && previous !== null ? deltaOf(gained.total, previous, true, noun) : null,
      spark: gained.points.map((p) => p.gained)
    },
    {
      id: "newest",
      label: "Newest review",
      value: newest?.when || "\u2014",
      meta: newest ? `${newest.stars} \xB7 ${newest.author}` : canReply ? "no review yet" : "none of the five Google shows has a date",
      delta: null,
      spark: []
    }
  ];
  const news = latest.find((r) => r.isNew) ?? null;
  const todayLine = news ? { text: `New on Google: ${news.stars} from ${news.author}${news.text ? ` \u2014 \u201C${reviewSnippet(news.text)}\u201D` : ""}`, to: "reports" } : null;
  return {
    listing: {
      name: l.name,
      address: l.address,
      ratingLabel: ratingWords(l.rating),
      count: l.review_count,
      checked,
      mapsUri: l.maps_uri,
      trouble: !!l.check_error
    },
    connection,
    canReply,
    reply,
    tiles,
    gained,
    latest,
    source,
    table,
    todayLine
  };
}

// src/billing.ts
var BILLING_MODES = ["stripe", "direct"];
var BILLING_STATUSES = ["none", "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"];
var BILLING_TRIAL_DAYS = 14;
function receptionistOn(status) {
  return status === "trialing" || status === "active" || status === "past_due" || status === "incomplete" || status === "none";
}
function billingDoorOpen(b) {
  return !!b && b.mode === "stripe" && b.ready;
}
function maySpend(mode, status) {
  if (mode !== "stripe") return true;
  return status === "trialing" || status === "active";
}
function whyCannotSpend(mode, status) {
  if (maySpend(mode, status)) return null;
  if (status === "none") return "Add a card before buying a number \u2014 nothing is charged until your trial ends.";
  if (status === "incomplete") return "Your card is not confirmed yet. Finish checkout in Billing, then try again.";
  if (status === "past_due") return "Your last payment did not go through. Update the card in Billing, then try again.";
  if (status === "paused" || status === "canceled" || status === "incomplete_expired") {
    return "This workspace is not subscribed. Start it again from Billing before buying a number.";
  }
  return "Billing needs attention before this workspace can buy a number. Open Billing to sort it out.";
}
function tenantStatusFor(mode, status) {
  if (mode !== "stripe") return null;
  return receptionistOn(status) ? "active" : "paused";
}
function planBilling(before, sub, nowMs) {
  const row2 = {
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: sub.price_id,
    current_period_end: sub.current_period_end,
    trial_end: sub.trial_end,
    cancel_at: sub.cancel_at,
    cancel_at_period_end: sub.cancel_at_period_end,
    card_brand: sub.card_brand,
    card_last4: sub.card_last4
  };
  const wanted = tenantStatusFor(before.mode, sub.status);
  const tenantStatus = wanted && wanted !== before.tenant_status ? wanted : null;
  const wasOn = receptionistOn(before.status);
  const isOn = receptionistOn(sub.status);
  const switched = before.mode === "stripe" && wasOn !== isOn ? isOn ? "resumed" : "paused" : null;
  let bell = null;
  if (switched === "paused") {
    bell = {
      title: "Your receptionist is paused",
      body: sub.status === "paused" ? "The trial ended without a card on file. Messages still land in the Inbox; nothing is answered until you resume from Billing." : "The subscription ended. Messages still land in the Inbox; nothing is answered until you resume from Billing."
    };
  } else if (switched === "resumed") {
    bell = { title: "Your receptionist is back", body: "Billing is in order; the receptionist answers again." };
  } else if (before.status !== "trialing" && sub.status === "trialing") {
    bell = { title: "Your trial has started", body: `${trialWords(sub.trial_end, nowMs)}. Cancel any time from Billing.` };
  }
  return { row: row2, tenantStatus, switched, bell };
}
var DATE_FMT6 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
function dayWords(iso) {
  if (!iso) return "";
  const ms2 = Date.parse(iso);
  return Number.isNaN(ms2) ? "" : DATE_FMT6.format(new Date(ms2));
}
function trialOffer(days, again = false) {
  if (!(days > 0)) {
    return again ? "Start again with a card; the first charge is today." : "Subscribe with a card; the first charge is today, and you can cancel from here any time.";
  }
  return again ? `Start again with a card; the ${days}-day trial applies once.` : `Start the ${days}-day trial with a card; nothing is charged until it ends, and you can cancel from here any time.`;
}
function trialWords(trialEnd, nowMs) {
  if (!trialEnd) return "";
  const end = Date.parse(trialEnd);
  if (Number.isNaN(end)) return "";
  const days = Math.ceil((end - nowMs) / 864e5);
  if (days <= 0) return "Trial ends today";
  return `${days} day${days === 1 ? "" : "s"} left on the trial, until ${dayWords(trialEnd)}`;
}
function priceWords(p) {
  if (!p || p.unit_amount === null) return "";
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency.toUpperCase() }).format(p.unit_amount / 100);
  const per = p.interval === "year" ? "a year" : p.interval === "week" ? "a week" : p.interval === "day" ? "a day" : "a month";
  return `${amount} ${per}`;
}
function toBillingVM(dto, nowMs = Date.now()) {
  const a = dto.account;
  const plan = priceWords(dto.price) ? `${dto.price?.product_name ? `${dto.price.product_name} \xB7 ` : ""}${priceWords(dto.price)}` : "";
  const card = a?.card_brand && a.card_last4 ? `${a.card_brand.charAt(0).toUpperCase()}${a.card_brand.slice(1)} ending ${a.card_last4}` : null;
  if (!a || a.mode === "direct") {
    return { mode: "direct", status: a?.status ?? "active", headline: "Direct arrangement", detail: "This workspace runs on an arrangement made with Chanlytics; nothing on this screen charges anything.", tone: "", plan, card: null, actions: { checkout: false, portal: false, resume: false }, paused: false };
  }
  const s = a.status;
  const base = { mode: "stripe", status: s, plan, card };
  switch (s) {
    case "none":
      return { ...base, headline: "No subscription yet", detail: dto.ready ? trialOffer(dto.trial_days) : "Billing is not available on this deployment yet.", tone: "warn", actions: { checkout: dto.ready, portal: false, resume: false }, paused: false };
    case "trialing":
      if (a.cancel_at || a.cancel_at_period_end) {
        return { ...base, headline: "On trial, ending", detail: `Cancelled: the receptionist answers until ${dayWords(a.cancel_at ?? a.trial_end) || "the trial ends"}, then stops, and nothing is charged. Undo it from Manage billing before then to keep it.`, tone: "warn", actions: { checkout: false, portal: true, resume: false }, paused: false };
      }
      return { ...base, headline: "On trial", detail: `${trialWords(a.trial_end, nowMs)}${card ? `, then ${plan || "the plan"} on ${card}` : ""}.`, tone: "ok", actions: { checkout: false, portal: true, resume: false }, paused: false };
    case "active":
      return { ...base, headline: a.cancel_at_period_end || a.cancel_at ? "Subscribed, ending" : "Subscribed", detail: a.cancel_at || a.cancel_at_period_end ? `Ends ${dayWords(a.cancel_at ?? a.current_period_end)}; the receptionist answers until then.` : `Next invoice ${dayWords(a.current_period_end) || "on the renewal date"}${card ? ` on ${card}` : ""}.`, tone: "ok", actions: { checkout: false, portal: true, resume: false }, paused: false };
    case "past_due":
      return { ...base, headline: "Payment failed", detail: `${a.last_payment_failed_at ? `The last charge failed ${agoWords(Date.parse(a.last_payment_failed_at), nowMs)}. ` : ""}Stripe retries for a few days; update the card in Manage billing to keep the receptionist answering.`, tone: "danger", actions: { checkout: false, portal: true, resume: false }, paused: false };
    case "incomplete":
      return { ...base, headline: "Finishing checkout", detail: "The first payment is still being confirmed. This page updates by itself.", tone: "warn", actions: { checkout: false, portal: true, resume: false }, paused: false };
    case "paused":
      return { ...base, headline: "Paused", detail: "The trial ended without a card on file. Add one in Manage billing, then resume; messages keep landing in the Inbox meanwhile.", tone: "danger", actions: { checkout: false, portal: true, resume: true }, paused: true };
    case "unpaid":
      return { ...base, headline: "Paused", detail: "Payment could not be collected after several tries. Update the card in Manage billing, then resume.", tone: "danger", actions: { checkout: false, portal: true, resume: true }, paused: true };
    case "canceled":
    case "incomplete_expired":
    default:
      return { ...base, headline: "Subscription ended", detail: dto.ready ? trialOffer(dto.trial_days, true) : "Billing is not available on this deployment yet.", tone: "danger", actions: { checkout: dto.ready, portal: !!a.card_brand, resume: false }, paused: true };
  }
}
var CHECKOUT_OUTCOME_WORDS = {
  success: "Your card is on file and the trial has started. This page updates as Stripe confirms it.",
  cancel: "Checkout was closed before finishing; nothing was charged.",
  portal: "Back from Stripe. Any change you made there shows here within a minute."
};
function moneyWords(amountCents, currency) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
function billingAccountDto(r) {
  return {
    mode: r.mode === "direct" ? "direct" : "stripe",
    status: BILLING_STATUSES.includes(r.status ?? "") ? r.status : "none",
    price_id: r.price_id ?? null,
    current_period_end: r.current_period_end ?? null,
    trial_end: r.trial_end ?? null,
    cancel_at: r.cancel_at ?? null,
    cancel_at_period_end: !!r.cancel_at_period_end,
    card_brand: r.card_brand ?? null,
    card_last4: r.card_last4 ?? null,
    last_payment_failed_at: r.last_payment_failed_at ?? null,
    last_paid_at: r.last_paid_at ?? null,
    updated_at: r.updated_at
  };
}
function pausedVoiceFacts(businessName) {
  const name = (businessName ?? "").trim() || "this business";
  return [
    `You are answering the phone for ${name}. Their automated receptionist is paused right now, so you cannot help with bookings, prices, hours or questions today.`,
    "Say so plainly and kindly, in the caller's language. Take the caller's name, their number and what they need, tell them someone from the business will call them back, and end the call politely.",
    "Do not quote a price, do not book or reschedule anything, do not transfer the call, and do not promise a time for the call back."
  ].join("\n");
}

// src/registration-path.ts
var REGISTRATION_PATHS = ["standard", "sole_proprietor"];
function registrationPathOf(saved) {
  if (!saved) return null;
  return String(saved.ein ?? "").trim() ? "standard" : "sole_proprietor";
}
var SOLE_PROP_LIMITS = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
function grouped(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function soleProprietorLimits() {
  const L = SOLE_PROP_LIMITS;
  return [
    `One number and one campaign: a second number cannot text on this registration.`,
    `About ${L.messagesPerSecond} message a second, so a hundred texts go out over a minute or two rather than at once.`,
    `T-Mobile takes ${grouped(L.perDayTMobile)} a day from you, AT&T ${L.perMinuteAtt} a minute.`,
    `The carriers text a code to your own mobile and you reply from that handset \u2014 there is no code to bring back here.`,
    `That mobile can be used on ${L.mobileUsesEver} of these registrations ever, across every provider; your email and address on ${L.emailUsesEver} each. Only the carriers can count what you have already spent.`,
    `It cannot be withdrawn once filed. If you get a tax id later, the standard registration is a new filing.`
  ];
}
var REGISTRATION_QUESTION = {
  title: "Does the business have a tax ID?",
  sub: "It decides which registration the carriers run, and the two are not the same. Asked once.",
  /** Said under the answers, because the narrow path is a real cost and the choice is permanent. */
  nudge: "If there is an EIN, use it \u2014 none of the limits below apply to that registration."
};
var REGISTRATION_PATH_WORDS = {
  standard: {
    choice: "Yes, it has an EIN",
    sub: "The usual registration. Nothing about your texting is capped.",
    filed: "Registered as a business"
  },
  sole_proprietor: {
    choice: "No, it is just me",
    sub: "The carriers' registration for a one-person business. It works, and it is narrower.",
    filed: "Registered as a sole proprietor"
  }
};
var REGISTRATION_COST_WORDS = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second.`
};

// src/capabilities.ts
var CAPABILITY_KINDS = ["voice", "whatsapp", "sms"];
function activationOf(i, kind) {
  const r = (i.activations ?? []).find((a) => a.capability === kind && !a.deactivated_at);
  return r ? { at: r.activated_at, by: r.activated_by } : null;
}
var factsMissing = (i) => !i.business.name || !i.business.hours ? { code: "no_business_facts", words: "The receptionist has no facts to answer with yet: the business name and hours first." } : null;
function capabilityStatus(kind, i, nowMs = Date.now()) {
  const blockers = [];
  let tested = null;
  if (kind === "voice") {
    const v = i.channels.voice;
    const own = i.lines?.rows.find((l) => l.provider !== "carrier") ?? null;
    if (v.present && v.active) {
      const f = factsMissing(i);
      if (f) blockers.push(f);
    } else if (v.present) {
      blockers.push({ code: "channel_off", words: "Your line is switched off." });
    } else if (own && own.voice_state === "provisioning") {
      blockers.push({ code: "line_provisioning", words: "Your line is being set up; it answers the moment it is." });
    } else if (own && own.voice_state === "failed") {
      blockers.push({ code: "line_failed", words: "Setting up your line stopped; a person at Chanlytics has it, and Retry is on the row." });
    } else {
      blockers.push({ code: "no_line", words: "No line yet: get a number, or keep the one you have." });
    }
    if (v.lastInboundAt) tested = { at: v.lastInboundAt, what: "a call was answered" };
  } else if (kind === "whatsapp") {
    const w = i.channels.whatsapp;
    if (w.present && w.active) {
      const t = i.templates;
      if (t.approved === 0 && t.pending > 0) blockers.push({ code: "meta_waiting", words: "Your first messages are with Meta for approval." });
      const f = factsMissing(i);
      if (f) blockers.push(f);
    } else if (w.present) {
      blockers.push({ code: "channel_off", words: "Your WhatsApp number is connected but switched off." });
    } else {
      blockers.push({ code: "not_connected", words: "Connect the WhatsApp number customers write to." });
    }
    if (w.lastInboundAt) tested = { at: w.lastInboundAt, what: "a message was answered" };
  } else {
    const line = i.lines?.rows.find((l) => l.sms_state === "active" && !l.reg_mock) ?? null;
    if (!line) blockers.push({ code: "texting_not_sold", words: "Texting is not part of what is sold yet: it arrives with a line the carriers have approved." });
  }
  const ready = blockers.length === 0;
  const activated = activationOf(i, kind);
  const live = ready && !!tested && !!activated;
  const words = live ? `Active since ${agoWords(Date.parse(activated.at), nowMs)}.` : activated && !ready ? `Activated, but not ready: ${blockers[0].words}` : ready && tested ? `Tested (${tested.what} ${agoWords(Date.parse(tested.at), nowMs)}). Activate it to say it is yours.` : ready ? "Ready. Try it from your own phone, then activate it." : blockers[0].words;
  return { kind, ready, blockers, tested, activated, live, words };
}

// src/setup.ts
var PROVISIONING_DEADLINE_MS = 5 * 6e4;
function lineStuckProvisioning(l, nowMs) {
  if (!l || l.voice_state !== "provisioning") return false;
  const since = Date.parse(l.state_since);
  return Number.isFinite(since) && nowMs - since > PROVISIONING_DEADLINE_MS;
}
function lineRetryRefusal(l, nowMs) {
  if (!l) return "no such line";
  if (l.voice_state === "failed") return null;
  if (lineStuckProvisioning(l, nowMs)) return null;
  return l.voice_state === "provisioning" ? "the line is still setting up \u2014 give it a few minutes, and it is retried automatically after that" : `the line is ${l.voice_state}, not failed`;
}
var LINE_STEP_WORDS = {
  subaccount: "opening your account with the carrier",
  number: "buying the number",
  trunk: "connecting the number to the receptionist",
  agent: "creating the receptionist",
  import: "handing the number to the receptionist",
  messaging: "setting up texting",
  channel: "recording the line"
};
var SETUP_STATE_WORDS = {
  not_started: "Not started",
  waiting_you: "Waiting on you",
  waiting_them: "Waiting on us",
  ready: "Ready"
};
var SOLE_PROP_CEILING_SENTENCE = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE}`;
var MOCK_TEXTING_SENTENCE = "Texting is filed against a test registry, so nothing is delivered \u2014 a person at Chanlytics is filing it with the carriers for real.";
function textingWords(l) {
  if (!l) return { sentence: "Texting is not available yet.", done: false };
  if (l.reg_mock) return { sentence: MOCK_TEXTING_SENTENCE, done: false };
  switch (l.sms_state) {
    // Working, and on the narrow registration: the ceiling belongs in the same
    // sentence as the good news, because the moment it bites is a broadcast
    // that trickles out over minutes with no explanation anywhere in the
    // product. `done` stays true -- it IS on, and there is nothing left to do.
    case "active":
      return { sentence: l.reg_sole_prop ? SOLE_PROP_TEXTING_SENTENCE : "Texting is on.", done: true };
    case "approved":
      return { sentence: "Your business is approved; one last check on the line is with the carriers.", done: false };
    case "registering":
      return { sentence: "Texting is with the carriers.", done: false };
    // The state the pre-flight writes, which had no case here at all -- so a
    // workspace stopped BEFORE anything was filed read the default, "Texting is
    // not available yet", which says nothing about what is in the way and nothing
    // about it being theirs to fix.
    //
    // It deliberately does NOT name the fault, for the same reason none of these
    // do: this is one clause inside a composed Setup sentence, the reason can be a
    // paragraph, and the owner's texting row on Connections renders `last_error`
    // in full. What this has to do is stop saying "not available" about something
    // that is waiting on them. It also cannot say "fill in your record" -- a
    // record that is COMPLETE but names a different business than the workspace
    // does trips the same state, and that fix is a rename, not a field.
    case "needs_record":
      return { sentence: "Texting needs something on your business record put right \u2014 Connections says what.", done: false };
    case "rejected":
      return { sentence: "The carriers refused the texting registration.", done: false };
    case "failed":
      return { sentence: "The texting registration stopped; a person at Chanlytics has it.", done: false };
    default:
      return { sentence: "Texting is not available yet.", done: false };
  }
}
var display = (e164) => e164 ? formatPhoneDisplay(e164) : null;
var plural3 = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function activationWords(cap, nowMs) {
  if (cap.live && cap.activated) return `Activated ${agoWords(Date.parse(cap.activated.at), nowMs)}`;
  if (cap.tested) return "Tested \u2014 activate it to say it is yours";
  return "Not tested yet \u2014 try it from your own phone";
}
function setupSteps(i, nowMs = Date.now()) {
  const later = new Set(i.later ?? []);
  const wa = i.channels.whatsapp;
  const voice = i.channels.voice;
  const waReady = wa.present && wa.active;
  const voiceReady = voice.present && voice.active;
  const answering = waReady || voiceReady;
  const waNum = display(wa.number) ?? "your number";
  const voiceNum = display(voice.number) ?? "your line";
  const handoffNum = display(i.business.handoff);
  const rows = [];
  const row2 = (r) => rows.push({ ...r, stateWords: r.stateWords ?? SETUP_STATE_WORDS[r.state], later: !r.required && later.has(r.id) });
  if (billingDoorOpen(i.billing)) {
    const b = i.billing;
    if (b.status === "trialing" && (b.cancel_at || b.cancel_at_period_end)) {
      row2({ id: "billing", icon: "money", title: "Billing", state: "ready", required: true, sentence: `On trial, cancelled: the receptionist answers until ${dayWords(b.cancel_at ?? b.trial_end) || "the trial ends"}, then stops.`, details: ["Nothing is charged; undo the cancellation from Billing before then to keep it"], verb: { label: "Open Billing", to: "admin/billing" } });
    } else if (b.status === "trialing") {
      row2({ id: "billing", icon: "money", title: "Billing", state: "ready", required: true, sentence: `On trial: ${trialWords(b.trial_end, nowMs) || "the card is on file"}.`, details: ["The card on file is charged when the trial ends; cancel from Billing before then if you'd rather not"], verb: { label: "Open Billing", to: "admin/billing" } });
    } else if (b.status === "active" || b.status === "incomplete") {
      row2({ id: "billing", icon: "money", title: "Billing", state: "ready", required: true, sentence: b.status === "active" ? `Subscribed \xB7 next invoice ${dayWords(b.current_period_end) || "on the renewal date"}.` : "Finishing checkout \u2014 this page updates by itself.", details: [], verb: { label: "Open Billing", to: "admin/billing" } });
    } else if (b.status === "past_due") {
      row2({ id: "billing", icon: "money", title: "Billing", state: "waiting_you", required: true, sentence: "The last payment failed. Update the card to keep the receptionist answering.", details: ["Stripe retries for a few days, then pauses the subscription"], verb: { label: "Update the card", to: "verb:billing-portal" } });
    } else if (b.status === "paused" || b.status === "unpaid") {
      row2({ id: "billing", icon: "money", title: "Billing", state: "waiting_you", required: true, sentence: "Your receptionist is paused: messages land in the Inbox, nothing is answered.", details: [b.status === "paused" ? "The trial ended without a card on file" : "Payment could not be collected"], verb: { label: "Resume in Billing", to: "admin/billing" } });
    } else {
      row2({ id: "billing", icon: "money", title: "Billing", state: "not_started", required: true, sentence: b.trial_days > 0 ? `Start the ${b.trial_days}-day trial with a card \u2014 nothing is charged until it ends.` : "Subscribe with a card \u2014 the first charge is today.", details: b.trial_days > 0 ? ["Cancel any time from Billing", "The receptionist answers through the trial"] : ["Cancel any time from Billing"], verb: { label: b.trial_days > 0 ? "Start the trial" : "Subscribe", to: "verb:billing-checkout" } });
    }
  }
  {
    const b = i.business;
    const missing = [!b.name ? "a name" : "", !b.hours ? "hours" : "", b.services === 0 ? "services" : ""].filter(Boolean);
    const serious = (i.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
    if (b.broken) {
      row2({ id: "facts", icon: "home", title: "Business facts", state: "waiting_you", required: true, sentence: "Your settings could not be read. Open Workspace to repair them before anything else.", details: [], verb: { label: "Open Workspace", to: "admin/workspace" } });
    } else if (serious) {
      row2({ id: "facts", icon: "home", title: "Business facts", state: "waiting_you", required: true, sentence: serious.sentence, details: [`${b.name} \xB7 hours set \xB7 ${plural3(b.services, "service")} on record`], verb: { label: "Fix it in Business", to: serious.to } });
    } else if (missing.length === 0) {
      row2({ id: "facts", icon: "home", title: "Business facts", state: "ready", required: true, sentence: `${b.name} \xB7 hours set \xB7 ${plural3(b.services, "service")} on record`, details: [b.bookingLink ? "Booking link on record" : "No booking link \u2014 the receptionist answers, but cannot send one", b.address ? "Address on record" : "No address yet"], verb: { label: "Edit in Workspace", to: "admin/workspace" } });
    } else {
      const none = missing.length === 3;
      row2({ id: "facts", icon: "home", title: "Business facts", state: none ? "not_started" : "waiting_you", required: true, sentence: none ? "Name, hours and services are what the receptionist answers with." : `Still missing: ${missing.join(" and ")}.`, details: [], verb: { label: none ? "Start in Workspace" : "Finish in Workspace", to: "admin/workspace" } });
    }
  }
  row2(handoffNum ? { id: "handoff", icon: "phone", title: "A person to hand off to", state: "ready", required: false, sentence: `Callers who insist on a person are transferred to ${handoffNum}.`, details: [], verb: { label: "Change it", to: "admin/workspace" } } : { id: "handoff", icon: "phone", title: "A person to hand off to", state: "waiting_you", required: false, sentence: "Give the receptionist a number to hand callers to when they insist on a person.", details: [], verb: { label: "Add a number", to: "admin/workspace" } });
  const lines = i.lines ?? { rows: [], ready: false, provider: null, costs: { local_number_month_usd: 1.15 } };
  const canSpend = !i.billing || maySpend(i.billing.mode, i.billing.status);
  const ownLine = lines.rows.find((l) => l.voice_state !== "none") ?? null;
  const texting = textingWords(ownLine);
  const lineNum = ownLine?.e164 ? display(ownLine.e164) ?? ownLine.e164 : "your number";
  if (voiceReady) {
    row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "ready", required: !answering, sentence: `Calls are answered on ${voiceNum}. ${texting.sentence}`, details: [ownLine?.voice_state === "answering" ? "Your own number through Chanlytics" : "", texting.done ? "" : "Texting arrives with lines that register with the carriers; this page will say when"].filter(Boolean), verb: { label: "Open Connections", to: "admin/integrations" } });
  } else if (voice.present) {
    row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: `Your line ${voice.number ? `${voiceNum} ` : ""}is switched off \u2014 the receptionist is not answering it.`, details: [], verb: { label: "Open Connections", to: "admin/integrations" } });
  } else if (ownLine && lineStuckProvisioning(ownLine, nowMs)) {
    row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Setting up ${lineNum} stopped while ${LINE_STEP_WORDS[ownLine.step ?? ""] ?? "working on it"}, ${agoWords(Date.parse(ownLine.state_since), nowMs)}.`, details: ["It is retried automatically, usually within a quarter of an hour, and Chanlytics is told when it is", "Retry from here \u2014 it picks up where it stopped and buys nothing twice"], verb: { label: "Retry", to: `verb:retry-line:${ownLine.id}` } });
  } else if (ownLine && ownLine.voice_state === "provisioning") {
    row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Setting up ${lineNum} \u2014 ${LINE_STEP_WORDS[ownLine.step ?? ""] ?? "working on it"}, since ${agoWords(Date.parse(ownLine.state_since), nowMs)}.`, details: ["Usually a minute or two; this page updates by itself"], verb: null });
  } else if (ownLine && ownLine.voice_state === "failed") {
    row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Setting up ${lineNum} stopped while ${LINE_STEP_WORDS[ownLine.step ?? ""] ?? "working on it"}. A person at Chanlytics has it.`, details: ["Retry from here; we have been told"], verb: { label: "Retry", to: `verb:retry-line:${ownLine.id}` } });
  } else if (ownLine && ownLine.voice_state === "answering") {
    row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `${lineNum} is set up \u2014 connecting it to the receptionist.`, details: [], verb: null });
  } else if (i.requests.line) {
    row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Requested ${agoWords(Date.parse(i.requests.line), nowMs)} \u2014 a person at Chanlytics will set up your line with you and reach you by email.`, details: [], verb: null });
  } else if (lines.ready) {
    canSpend ? row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "Get a number for calls, or keep the one you have.", details: [`A local number is about $${lines.costs.local_number_month_usd.toFixed(2)} a month \xB7 your receptionist answers it \xB7 texting arrives when the carriers register it`], verb: { label: "Get a line", to: "verb:choose-line" } }) : billingDoorOpen(i.billing) ? row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "Add a card, then get a number for calls.", details: [`A local number is about $${lines.costs.local_number_month_usd.toFixed(2)} a month, billed with your subscription`, "Nothing is charged until your trial ends"], verb: { label: "Open Billing", to: "admin/billing" } }) : row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "We set up your phone line with you.", details: ["A number, the receptionist answering it, and forwarding from the number you have", "Billing is not open on this deployment yet, so there is nothing to add a card to"], verb: { label: "Ask for a line", to: "verb:request-line" } });
  } else {
    row2({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "We set up your phone line with you.", details: ["A number, the receptionist answering it, and forwarding from the number you have"], verb: { label: "Ask for a line", to: "verb:request-line" } });
  }
  if (voiceReady) {
    const last = voice.lastInboundAt ? `Last call ${agoWords(Date.parse(voice.lastInboundAt), nowMs)}` : "No calls yet";
    const cap = capabilityStatus("voice", i, nowMs);
    if (!i.business.name || !i.business.hours) {
      row2({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_you", required: !answering, sentence: `Picking up on ${voiceNum}, but it has no facts to answer with yet.`, details: ["Callers are told someone will confirm and are offered to leave a message", "Fill in your name, hours and services and it answers properly from the next call"], verb: { label: "Add your facts", to: "admin/workspace" } });
    } else {
      row2({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "ready", required: !answering, sentence: `Answering on ${voiceNum}.`, details: [handoffNum ? `Transfers to ${handoffNum} when a caller insists on a person` : "No hand-off number yet \u2014 callers who insist on a person are told someone will call back", last, activationWords(cap, nowMs)], verb: cap.tested && !cap.live ? { label: "Activate", to: "verb:activate:voice" } : voice.number ? { label: "Call it", to: `tel:${voice.number}` } : null });
    }
  } else if (voice.present) {
    row2({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_you", required: !answering, sentence: "Switched off with the line.", details: [], verb: null });
  } else if (ownLine && (ownLine.voice_state === "provisioning" || ownLine.voice_state === "answering")) {
    row2({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_them", required: !answering, sentence: "Being created with your line \u2014 it answers the moment the line does.", details: [], verb: null });
  } else {
    row2({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_them", required: !answering, sentence: "The phone receptionist arrives with your line.", details: [], verb: null });
  }
  {
    const fw = lines.rows.find((l) => l.kind === "forwarded") ?? null;
    const f = fw?.forwarding ?? null;
    const kept = fw?.e164 ? display(fw.e164) ?? fw.e164 : "your number";
    const dest = voiceReady && voice.number ? voiceNum : null;
    const how = f ? `${MODE_WORDS[f.mode] ?? "Forwarded"} \xB7 ${CARRIER_WORDS[f.carrier] ?? "your carrier"}` : "";
    const title = "The number you already have";
    if (fw && f && fw.forwarding_state === "verified") {
      row2({ id: "keep", icon: "refresh", title, state: "ready", required: false, sentence: `Calls to ${kept} reach your receptionist.`, details: [f.verified_at ? `Verified ${agoWords(Date.parse(f.verified_at), nowMs)}` : "Verified", how], verb: { label: "Change it", to: "verb:forwarding" } });
    } else if (fw && f && forwardingTestOpen(f, nowMs)) {
      row2({ id: "keep", icon: "refresh", title, state: "waiting_you", required: false, sentence: `Testing \u2014 call ${kept} from another phone. This page updates by itself.`, details: [`Window open for ${spanLabel(Date.parse(f.test_until ?? "") - nowMs)}`], verb: { label: "Show the code", to: "verb:forwarding" } });
    } else if (fw && f) {
      row2({ id: "keep", icon: "refresh", title, state: "waiting_you", required: false, sentence: `Dial the code on the phone with ${kept}, then test it.`, details: [how], verb: { label: "Test it", to: `verb:forwarding-test:${fw.id}` } });
    } else if (!dest) {
      row2({ id: "keep", icon: "refresh", title, state: "not_started", required: false, sentence: "Once your receptionist has a line, keep the number customers know by forwarding its calls to it.", details: [], verb: null });
    } else {
      row2({ id: "keep", icon: "refresh", title, state: "not_started", required: false, sentence: `Keep the number your customers know: forward its calls to ${dest}.`, details: ["You keep your phone, your carrier and your texts"], verb: { label: "Set up forwarding", to: "verb:forwarding" } });
    }
  }
  if (waReady) {
    const t = i.templates;
    const metaWaits = t.approved === 0 && t.pending > 0;
    const cap = capabilityStatus("whatsapp", i, nowMs);
    const details = [
      wa.quality ? `Quality ${wa.quality.toLowerCase()}` : "",
      t.approved ? `${plural3(t.approved, "approved message")}` : t.pending ? `${plural3(t.pending, "message")} with Meta for approval` : "No approved messages yet",
      t.startersApproved < 5 ? "Add the starter messages: welcome, win-back, the month's offer" : "",
      wa.lastInboundAt ? `Last message ${agoWords(Date.parse(wa.lastInboundAt), nowMs)}` : ""
    ].filter(Boolean);
    if (!metaWaits) details.push(activationWords(cap, nowMs));
    row2({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: metaWaits ? "waiting_them" : "ready", stateWords: metaWaits ? "Waiting on Meta" : void 0, required: !answering, sentence: metaWaits ? `Connected on ${waNum} \u2014 your first messages are with Meta for approval.` : `Connected on ${waNum}.`, details, verb: cap.tested && !cap.live && !metaWaits ? { label: "Activate", to: "verb:activate:whatsapp" } : t.startersApproved < 5 && !metaWaits ? { label: "Add the starters", to: "outbound" } : { label: "Open the Inbox", to: "inbox" } });
  } else if (wa.present) {
    row2({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: "waiting_you", required: !answering, sentence: `${waNum ?? "Your number"} is connected but switched off.`, details: [], verb: { label: "Open Connections", to: "admin/integrations" } });
  } else {
    row2({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: "waiting_you", required: !answering, sentence: "Connect the WhatsApp number customers write to.", details: ["A new number, or the WhatsApp Business app you already use"], verb: { label: "Connect", to: "admin/integrations" } });
  }
  row2(i.calendar.state === "ok" ? { id: "calendar", icon: "calendar", title: "Calendar", state: "ready", required: false, sentence: "Readable \u2014 the receptionist offers times from it.", details: [], verb: { label: "Open Calendar", to: "calendar" } } : i.calendar.state === "unavailable" ? { id: "calendar", icon: "calendar", title: "Calendar", state: "waiting_you", required: false, sentence: "Your calendar could not be read. Check the address in Workspace.", details: [], verb: { label: "Check the feed", to: "admin/workspace" } } : { id: "calendar", icon: "calendar", title: "Calendar", state: "not_started", required: false, sentence: "Paste your calendar's iCal address so the receptionist knows what is taken.", details: [], verb: { label: "Paste the feed", to: "admin/workspace" } });
  {
    const t = i.team;
    const people = t.members > 1 || t.invitesOpen > 0;
    const who = `${plural3(t.members, "person", "people")}${t.invitesOpen ? ` \xB7 ${plural3(t.invitesOpen, "invite")} open` : ""}`;
    const alerts = t.alertEmails ? `alerts go to ${plural3(t.alertEmails, "address", "addresses")}` : "no alert address yet";
    row2({
      id: "team",
      icon: "users",
      title: "Team and alerts",
      state: people && t.alertEmails ? "ready" : !people && !t.alertEmails ? "not_started" : "waiting_you",
      required: false,
      sentence: people ? `${who} \xB7 ${alerts}.` : `Only you so far \xB7 ${alerts}.`,
      details: people ? [] : ["Invite someone who answers when you can't"],
      verb: !t.alertEmails ? { label: "Set alerts", to: "admin/notifications" } : !people ? { label: "Invite", to: "admin/workspace" } : { label: "Open Team", to: "admin/workspace" }
    });
  }
  {
    const offers = i.consent.offers;
    const talk = i.consent.yes;
    const alsoTalk = talk > offers ? [`${plural3(talk, "person", "people")} said yes to messages about their own visit`] : [];
    row2(offers > 0 ? { id: "yes", icon: "tag", title: "The first yes", state: "ready", required: false, sentence: `${plural3(offers, "person", "people")} said yes to offers.`, details: alsoTalk, verb: { label: "Open Broadcasts", to: "broadcasts" } } : { id: "yes", icon: "tag", title: "The first yes", state: "not_started", required: false, sentence: "Nobody has said yes to offers yet. The keyword and the QR are on Broadcasts.", details: alsoTalk, verb: { label: "Get their yes", to: "broadcasts" } });
  }
  if (i.google?.ready) {
    const g = i.google.listing;
    const title = "Your Google listing";
    const connected = i.google.connected === true;
    const reach = connected ? "Business Profile connected \u2014 every review, replies from Reports" : "New reviews reach your bell and Reports";
    if (g && g.check_error) {
      row2({ id: "google", icon: "star", title, state: "waiting_them", stateWords: "Waiting on Google", required: false, sentence: `${g.name} is on record, but Google could not be read${g.checked_at ? ` since ${agoWords(Date.parse(g.checked_at), nowMs)}` : " yet"} \u2014 it is tried again every hour.`, details: [], verb: { label: "Open Reports", to: "reports" } });
    } else if (g) {
      row2({ id: "google", icon: "star", title, state: "ready", required: false, sentence: `${listingLine(g)}.`, details: [g.checked_at ? `Checked ${agoWords(Date.parse(g.checked_at), nowMs)}` : "Not read yet", reach], verb: { label: "Open Reports", to: "reports" } });
    } else if (i.google.places !== false) {
      row2({ id: "google", icon: "star", title, state: "not_started", required: false, sentence: "Find your business on Google so new reviews reach you here.", details: [i.business.address ? "Uses the name and address on record" : "Add your address in Workspace for a surer match"], verb: { label: "Find it", to: "verb:google-find" } });
    } else {
      row2({ id: "google", icon: "star", title, state: "not_started", required: false, sentence: "Connect your Google Business Profile so every review reaches you here.", details: ["Sign in to Google once, on Connections"], verb: { label: "Connect", to: "admin/integrations" } });
    }
  }
  const open = rows.filter((r) => r.state !== "ready" && !r.later);
  const nextRow = open.find((r) => r.verb) ?? null;
  const next = nextRow && nextRow.verb ? { label: nextRow.verb.label, to: nextRow.verb.to, row: nextRow.id, title: nextRow.title } : null;
  const done = rows.filter((r) => r.state === "ready").length;
  const seriousConflict = (i.conflicts ?? []).find((k) => k.severity === "serious") ?? null;
  const sentence = seriousConflict ? seriousConflict.sentence : waReady && voiceReady ? `Your receptionist answers calls on ${voiceNum} and WhatsApp on ${waNum}. ${texting.sentence}` : voiceReady ? `Your receptionist answers calls on ${voiceNum}. WhatsApp is not connected. ${texting.sentence}` : waReady ? `Your receptionist answers WhatsApp on ${waNum}. No phone line yet.` : "Your receptionist is not answering yet.";
  return {
    rows,
    readiness: { answering, sentence },
    next,
    done,
    total: rows.length,
    line: next ? `Setup \xB7 ${done} of ${rows.length} \xB7 ${next.title}: ${next.label.toLowerCase()}` : null,
    tryIt: answering ? { voice: voiceReady ? voice.number : null, voiceLabel: voiceReady ? voiceNum : null, whatsapp: waReady ? wa.number : null, whatsappLabel: waReady ? waNum : null } : null
  };
}
function setupRoute(hash) {
  return (hash || "#/today").replace(/^#\/?/, "");
}
function shouldLandOnSetup(role, answering, route, landed) {
  if (landed || role !== "owner" || answering) return false;
  return route === "" || route === "today";
}

// src/identity.ts
var ROLE_WORDS = {
  owner: "Owner",
  operator: "Operator",
  viewer: "Viewer"
};
function personInitials(name, email) {
  const n = (name ?? "").trim();
  if (n) return initialsOf(n);
  const e = (email ?? "").trim();
  return e ? e[0].toUpperCase() : "?";
}
function identityWords(me) {
  if (!me) return { name: "Your account", email: "", initials: "?", role: "", named: false };
  const name = (me.display_name ?? "").trim();
  return {
    name: name || "Your account",
    email: me.email ?? "",
    initials: personInitials(name, me.email),
    role: ROLE_WORDS[me.role ?? ""] ?? "",
    named: name.length > 0
  };
}
function memberWords(m) {
  const name = (m.display_name ?? "").trim();
  if (name) return { name, sub: m.email };
  return { name: m.email ?? "Someone", sub: null };
}
var DISPLAY_NAME_MAX = 80;
function cleanDisplayName(raw) {
  if (typeof raw !== "string") return { ok: false, reason: "Give a name, or leave it empty to clear it." };
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length > DISPLAY_NAME_MAX) return { ok: false, reason: `A name is at most ${DISPLAY_NAME_MAX} characters.` };
  return { ok: true, name };
}

// src/signup.ts
import { z as z4 } from "zod";
var SIGNUP_NAME_MIN = 2;
var SIGNUP_NAME_MAX = 120;
var SignupSchema = z4.object({
  name: z4.string().trim().min(SIGNUP_NAME_MIN, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX, "That name is too long \u2014 120 characters at most."),
  email: z4.string().trim().toLowerCase().email("Enter a work email address.").max(254),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z4.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z4.string().trim().max(80).optional()
}).strict();
var SIGNUP_WAITLIST = "waitlist";
function signupPosture(code2) {
  if (!code2) return "open";
  return code2 === SIGNUP_WAITLIST ? "waitlist" : "invite";
}
var PENDING_WORKSPACE_KEY = "pending_workspace";
var PendingWorkspaceSchema = z4.object({
  name: z4.string().trim().min(SIGNUP_NAME_MIN).max(SIGNUP_NAME_MAX),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z4.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone(v) ? v : null)
});
function pendingWorkspaceOf(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const r = PendingWorkspaceSchema.safeParse(metadata[PENDING_WORKSPACE_KEY]);
  return r.success ? r.data : null;
}
var SIGNUP_WORDS = {
  title: "Create your workspace",
  lead: "Your business gets its own workspace: the receptionist, the inbox, the numbers. You become its owner.",
  sent: (email) => `If ${email} can receive email, a 6-digit code is on its way. Enter it on the next screen to make your workspace.`,
  codeRequired: "Sign-up is by invitation right now. Enter the invite code you were given.",
  /*
   * WHEN THE CODE DID NOT GO OUT, and it is our fault rather than theirs.
   *
   * `sent` above is deliberately opaque -- "if this address can receive email" --
   * because whether an address is already registered is not a stranger's to learn
   * from a sign-up form. That is right, and it stays.
   *
   * But it was answering for a second case it does not fit. The auth mailer has a
   * declared budget of two an hour and no SMTP configured, so the third person to
   * sign up in an hour got the same "a code is on its way" and was sent to /login
   * to wait for something that would never arrive, with nothing in the product
   * telling them why.
   *
   * A send WE could not make says nothing about whether the address is known, so
   * saying so leaks nothing -- and it is the difference between waiting usefully
   * and waiting for ever. Nothing is lost because nothing was made: the name they
   * typed waits on their account for the sign-in that makes the workspace.
   */
  notSentTitle: "We could not send your code",
  notSent: "We could not send the sign-in code just now. Wait a few minutes and ask for it again from the sign-in page \u2014 nothing is lost.",
  /* ---------------------------------------------------------- the waitlist
   * Said the way a person would say it: what is true, when they will hear,
   * and no apology. "We are onboarding businesses in small groups" is the
   * honest reason -- the product provisions phone numbers and files carrier
   * registrations per customer, and doing that badly at volume is worse for
   * the people already inside than making the next ones wait. */
  waitlistTitle: "Join the list",
  waitlistLead: "We are onboarding businesses in small groups, so every new workspace gets set up properly. Leave your details and we will send you an invite.",
  waitlistSent: (email) => `You are on the list. We will write to ${email} when there is room \u2014 usually within a week.`,
  waitlistCta: "Join the list",
  codeWrong: "That invite code is not right.",
  crossSite: "That request did not come from this site.",
  haveOne: "Already have a workspace?",
  newHere: "New to Chanlytics?",
  clock: (tz) => `Your clock: ${tz}, read from this device. Change it later in Settings \u203A Workspace.`
};
function sendFailureIsOurs(e) {
  if (!e) return false;
  if (e.code === "over_email_send_rate_limit" || e.code === "email_provider_disabled") return true;
  if (e.status === 429) return true;
  return /rate limit|too many requests|email provider|smtp/i.test(e.message ?? "");
}
function signupNext(email) {
  return `/login?email=${encodeURIComponent(email.trim().toLowerCase())}&sent=1`;
}
function deviceTimezone(resolve = () => Intl.DateTimeFormat().resolvedOptions().timeZone) {
  try {
    const tz = resolve();
    return tz && tz.length <= 64 ? tz : void 0;
  } catch {
    return void 0;
  }
}

// src/workspace.ts
var DEFAULT_TIMEZONE = "America/New_York";
function isTimezone(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}
function cleanTimezone(raw) {
  const tz = typeof raw === "string" ? raw.trim() : "";
  if (!tz) return { ok: false, reason: "Pick the timezone your business runs on." };
  if (!isTimezone(tz)) return { ok: false, reason: `${tz} is not a timezone this system knows.` };
  return { ok: true, tz };
}
function timezoneCity(tz) {
  const tail = tz.split("/").pop() || tz;
  return tail.replace(/_/g, " ");
}
function timezoneWords(tz, nowMs = Date.now()) {
  const zone = tz && isTimezone(tz) ? tz : DEFAULT_TIMEZONE;
  const city = timezoneCity(zone);
  let timeThere = null;
  try {
    timeThere = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(nowMs));
  } catch {
    timeThere = null;
  }
  return { city, zone, timeThere, line: timeThere ? `${city} \xB7 ${timeThere} there now` : city };
}
function knownTimezones() {
  const intl = Intl;
  try {
    const all = intl.supportedValuesOf?.("timeZone");
    if (all && all.length) return all;
  } catch {
  }
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set([here, DEFAULT_TIMEZONE].filter(isTimezone))];
}
function usableDeviceTimezone(resolve) {
  const tz = deviceTimezone(resolve);
  return tz && isTimezone(tz) ? tz : null;
}

// src/chrome.ts
var THEME_OPTIONS = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "system", label: "System", icon: "monitor" }
];
var isThemePref = (v) => v === "light" || v === "dark" || v === "system";
function resolveTheme(pref, systemDark) {
  if (pref === "light" || pref === "dark") return pref;
  return systemDark ? "dark" : "light";
}
var isSidebarPref = (v) => v === "open" || v === "rail";
function workspaceHotkey(index) {
  return Number.isInteger(index) && index >= 0 && index < 9 ? `\u2318${index + 1}` : null;
}
function isTypingTarget(tagName, contentEditable) {
  const t = (tagName ?? "").toUpperCase();
  return contentEditable || t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
}
function shellStatusLine(s) {
  if (!s) return null;
  if (s.paused) return { text: "Your receptionist is paused", action: "billing" };
  if (s.stale) return { text: "A newer version is ready", action: "reload" };
  if (s.degraded.length) return { text: `${s.degraded.join(", ")} not refreshing`, action: null };
  return null;
}
var SHORTCUTS = [
  { group: "Everywhere", keys: ["\u2318K"], does: "Ask Chanlytics" },
  { group: "Everywhere", keys: ["\u2318B"], does: "Collapse or expand the sidebar" },
  { group: "Everywhere", keys: ["\u23181", "\u23189"], does: "Switch to the first to ninth workspace" },
  { group: "Everywhere", keys: ["?"], does: "This sheet" },
  { group: "Everywhere", keys: ["Esc"], does: "Close what is open" },
  { group: "Lists", keys: ["/"], does: "Search the page" },
  { group: "Lists", keys: ["J", "K"], does: "Next and previous item" },
  { group: "Inbox", keys: ["A"], does: "Approve the draft" },
  { group: "Inbox", keys: ["D"], does: "Decline it" },
  { group: "Inbox", keys: ["E"], does: "Edit it first" },
  { group: "Inbox", keys: ["\u2318\u21B5"], does: "Send" }
];
function shortcutGroups(list = SHORTCUTS) {
  const out = [];
  for (const s of list) {
    const g = out.find((x) => x.group === s.group);
    if (g) g.items.push(s);
    else out.push({ group: s.group, items: [s] });
  }
  return out;
}

// src/connections.ts
var CONNECTION_KINDS = ["whatsapp", "phone", "sms", "google_profile", "google_listing", "calendar", "instagram", "email", "deposits"];
var TONE = {
  connected: "ok",
  attention: "warn",
  off: "warn",
  waiting_you: "accent",
  waiting_them: "accent",
  none: "muted",
  later: "muted"
};
var GROUP = {
  connected: "connected",
  attention: "connected",
  off: "connected",
  waiting_you: "available",
  waiting_them: "available",
  none: "available",
  later: "later"
};
var ORDER = { whatsapp: 0, phone: 1, sms: 2, google_profile: 3, google_listing: 4, calendar: 5, instagram: 6, email: 7, deposits: 8 };
function row(d) {
  return { ...d, group: GROUP[d.state], tone: TONE[d.state], body: d.body ?? null };
}
function googleAudienceWords(a) {
  if (a === "testing") return "Google is reviewing Chanlytics; until then Connect works for invited Google accounts only.";
  if (a === "unverified") return "Google shows a warning until its review of Chanlytics is done \u2014 choose Advanced, then Go to Chanlytics.";
  return null;
}
function smsStateRow(line, nowMs) {
  const num = line ? formatPhoneDisplay(line.e164) : null;
  const since = line ? agoWords(Date.parse(line.state_since), nowMs) : null;
  const base = { kind: "sms", icon: "chat", title: "Texting", detail: num, verb: null };
  const ready = line?.voice_state === "answering";
  if (ready && (!line?.sms_state || line.sms_state === "none")) {
    return { ...base, state: "waiting_you", stateWords: "Waiting on you", sentence: "Texting needs your business on record for the carriers \u2014 two minutes, once.", verb: { label: "Fill it in", to: "verb:business-record", who: "owner" }, body: "business_record" };
  }
  if (line?.reg_mock) {
    return { ...base, state: "attention", stateWords: "Waiting on us", sentence: textingWords(line).sentence };
  }
  switch (line?.sms_state) {
    case "active":
      return {
        ...base,
        state: "connected",
        stateWords: "On",
        sentence: line?.reg_sole_prop ? `Customers text ${num ?? "this number"} and the receptionist answers inside your hours. ${SOLE_PROP_CEILING_SENTENCE}` : `Customers text ${num ?? "this number"}; the receptionist answers inside your hours.`
      };
    case "approved":
      return { ...base, state: "waiting_them", stateWords: "Waiting on carriers", sentence: `Your business is approved. One last check on the line is with the carriers \u2014 usually days, and texting switches itself on${since ? `; approved ${since}` : ""}.` };
    case "needs_record":
      return line?.last_error ? { ...base, state: "waiting_you", stateWords: "Waiting on you", sentence: line.last_error, verb: { label: "Open the record", to: "verb:business-record", who: "owner" }, body: "business_record" } : { ...base, state: "waiting_you", stateWords: "Waiting on you", sentence: "Texting needs your business on record for the carriers \u2014 two minutes, once.", verb: { label: "Fill it in", to: "verb:business-record", who: "owner" }, body: "business_record" };
    case "otp_waiting":
      return { ...base, state: "waiting_you", stateWords: "Waiting on you", sentence: "The carriers texted your mobile \u2014 reply to that message from the handset itself and texting switches on. There is nothing to type here. The code lasts a day; if it runs out, Chanlytics asks the carriers for another." };
    case "registering":
    case "hosting":
      return { ...base, state: "waiting_them", stateWords: "Waiting on carriers", sentence: `The carriers are registering your line, since ${since} \xB7 usually a week.` };
    case "rejected":
      return {
        ...base,
        state: "attention",
        stateWords: "Sent back",
        sentence: `The carriers sent the registration back${line?.last_error ? `: ${line.last_error}` : ""}. Correct what they named and Chanlytics sends it again \u2014 resubmitting is ours to do, and it costs nothing.`,
        verb: { label: "Open the record", to: "verb:business-record", who: "owner" },
        body: "business_record"
      };
    case "failed":
      return { ...base, state: "attention", stateWords: "Waiting on us", sentence: line?.last_error || "Registering stopped. A person at Chanlytics has it." };
    default:
      return { ...base, state: "later", stateWords: "Later", sentence: "Plain text messages \u2014 arrives with a line that registers with the carriers; this page will say when." };
  }
}
function connectionRows(i, nowMs = Date.now()) {
  const out = [];
  const channel = (kind) => channelFor(i.channels, kind);
  const wa = channel("whatsapp");
  if (wa) {
    out.push(row({ kind: "whatsapp", icon: "chat", title: "WhatsApp Business", detail: wa.number, state: wa.on ? "connected" : "off", stateWords: wa.on ? "On" : "Off", sentence: wa.healthLabel, verb: { label: "Messages", to: "messages", who: "operator" } }));
  } else if (i.whatsapp === void 0) {
    out.push(row({ kind: "whatsapp", icon: "chat", title: "WhatsApp Business", detail: null, state: "none", stateWords: "Not connected", sentence: "Checking whether Chanlytics can connect a number\u2026", verb: null }));
  } else if (i.whatsapp?.ready) {
    out.push(row({ kind: "whatsapp", icon: "chat", title: "WhatsApp Business", detail: null, state: "none", stateWords: "Not connected", sentence: "Sign in to Meta, pick the number, and the receptionist answers on it. Nothing here touches a phone line.", verb: { label: "Connect WhatsApp", to: "verb:whatsapp-connect", who: "owner" } }));
  } else {
    const why = i.whatsapp?.reason === "no_config_id" ? " \u2014 the Embedded Signup configuration is missing on the Chanlytics side" : i.whatsapp?.reason === "preview" ? " \u2014 only on the production dashboard" : "";
    out.push(row({ kind: "whatsapp", icon: "chat", title: "WhatsApp Business", detail: null, state: "none", stateWords: "Not connected", sentence: `Chanlytics isn't set up to connect numbers yet${why}.`, verb: null }));
  }
  const voice = channel("voice");
  const own = i.lines.rows.find((l2) => l2.provider !== "carrier") ?? null;
  if (voice) {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: voice.number, state: voice.on ? "connected" : "off", stateWords: voice.on ? "On" : "Off", sentence: voice.healthLabel, verb: null }));
  } else if (own && own.voice_state === "provisioning") {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: formatPhoneDisplay(own.e164), state: "waiting_them", stateWords: "Waiting on us", sentence: `Setting up \u2014 ${LINE_STEP_WORDS[own.step ?? ""] ?? "working on it"}, since ${agoWords(Date.parse(own.state_since), nowMs)}. Usually a minute or two.`, verb: null }));
  } else if (own && own.voice_state === "failed") {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: formatPhoneDisplay(own.e164), state: "waiting_them", stateWords: "Waiting on us", sentence: "Setting up stopped. A person at Chanlytics has it; retry from Setup.", verb: { label: "Open Setup", to: "admin/setup", who: "owner" } }));
  } else if (i.lineRequestedAt) {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: null, state: "waiting_them", stateWords: "Waiting on us", sentence: `Requested ${agoWords(Date.parse(i.lineRequestedAt), nowMs)} \u2014 a person at Chanlytics will set up your line with you and reach you by email.`, verb: null }));
  } else if (i.lines.ready) {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: null, state: "none", stateWords: "Not connected", sentence: "Get a number the receptionist answers, or keep the one you have.", verb: { label: "Get a line", to: "admin/setup", who: "owner" } }));
  } else {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: null, state: "none", stateWords: "Not connected", sentence: "We set up your phone line with you.", verb: { label: "Ask for a line", to: "admin/setup", who: "owner" } }));
  }
  out.push(row(smsStateRow(own, nowMs)));
  const g = i.google;
  const c = g?.connection ?? null;
  const l = g?.listing ?? null;
  if (c && c.location_name) {
    out.push(row({ kind: "google_profile", icon: "shield", title: "Google Business Profile", detail: c.location_title, state: c.sync_error ? "attention" : "connected", stateWords: c.sync_error ? "Could not sync" : "Connected", sentence: connectionWords(c, nowMs), verb: { label: "Disconnect", to: "verb:google-disconnect", who: "owner" } }));
  } else if (c) {
    out.push(row({ kind: "google_profile", icon: "shield", title: "Google Business Profile", detail: null, state: "waiting_you", stateWords: "Waiting on you", sentence: `${connectionWords(c, nowMs)}.`, verb: null, body: "google_choose" }));
  } else if (g?.ready.profile) {
    const note = googleAudienceWords(g.ready.audience);
    out.push(row({ kind: "google_profile", icon: "shield", title: "Google Business Profile", detail: null, state: "none", stateWords: "Not connected", sentence: `Sign in to Google once; every review and the right to answer them follow.${note ? ` ${note}` : ""}`, verb: { label: "Connect Google", to: "verb:google-connect", who: "owner" } }));
  } else {
    out.push(row({ kind: "google_profile", icon: "shield", title: "Google Business Profile", detail: null, state: "later", stateWords: "Later", sentence: "Every review and the replies you send from Reports arrive with the Business Profile connection.", verb: null }));
  }
  if (l) {
    out.push(row({ kind: "google_listing", icon: "star", title: "Your listing on Google", detail: l.address, state: l.check_error ? "attention" : "connected", stateWords: l.check_error ? "Could not be read" : "Watched", sentence: `${listingLine(l)} \xB7 ${checkedWords(l, nowMs)}`, verb: { label: c && c.location_name ? "Sync now" : "Check now", to: "verb:google-check", who: "operator" } }));
  } else if (g?.ready.places) {
    out.push(row({ kind: "google_listing", icon: "star", title: "Your listing on Google", detail: null, state: "none", stateWords: "Not watched", sentence: "Find it from the name and address on record; new reviews then reach your bell and Reports.", verb: { label: "Find it on Setup", to: "admin/setup", who: "owner" } }));
  } else {
    out.push(row({ kind: "google_listing", icon: "star", title: "Your listing on Google", detail: null, state: "later", stateWords: "Later", sentence: "Your public listing on Google Maps, read once a day for new reviews.", verb: null }));
  }
  const cal = i.calendar?.state ?? "none";
  if (cal === "ok") {
    out.push(row({ kind: "calendar", icon: "calendar", title: "Calendar", detail: "iCal feed", state: "connected", stateWords: "Readable", sentence: "The receptionist offers times from it. Two-way sync with Google Calendar comes later.", verb: { label: "Open Calendar", to: "calendar", who: "operator" } }));
  } else if (cal === "unavailable") {
    out.push(row({ kind: "calendar", icon: "calendar", title: "Calendar", detail: "iCal feed", state: "attention", stateWords: "Could not be read", sentence: "Your calendar could not be read. Check the address in Workspace.", verb: { label: "Check the feed", to: "admin/workspace", who: "owner" } }));
  } else {
    out.push(row({ kind: "calendar", icon: "calendar", title: "Calendar", detail: null, state: "none", stateWords: "Not connected", sentence: "Paste your calendar's iCal address so the receptionist knows what is taken. Two-way sync with Google Calendar comes later.", verb: { label: "Paste the feed", to: "admin/workspace", who: "owner" } }));
  }
  out.push(row({ kind: "instagram", icon: "instagram", title: "Instagram", detail: null, state: "later", stateWords: "Later", sentence: "Direct messages, answered by the receptionist like WhatsApp.", verb: null }));
  out.push(row({ kind: "email", icon: "mail", title: "Email", detail: null, state: "later", stateWords: "Later", sentence: "An address the receptionist answers.", verb: null }));
  out.push(row({ kind: "deposits", icon: "money", title: "Deposits", detail: null, state: "later", stateWords: "Later", sentence: "Deposits and payments taken by the receptionist.", verb: null }));
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
var CONNECTION_GROUP_WORDS = {
  connected: {
    title: "Connected",
    sub: (rows) => {
      const bad = rows.filter((r) => r.state !== "connected").length;
      return `${rows.length} connected${bad ? ` \xB7 ${bad} need${bad === 1 ? "s" : ""} attention` : ""}`;
    }
  },
  available: { title: "Available", sub: (rows) => rows.some((r) => r.state === "waiting_you") ? "something here waits on you" : rows.some((r) => r.state === "waiting_them") ? "in progress" : "ready when you are" },
  later: { title: "Later", sub: () => "nothing here pretends to be connected" }
};

// src/platform.ts
var PLATFORM_VERDICTS = {
  broken: { label: "Broken", tone: "danger", rank: 100 },
  billing: { label: "Billing", tone: "danger", rank: 90 },
  rehearsal: { label: "Rehearsal", tone: "warn", rank: 80 },
  stalled: { label: "Stalled", tone: "warn", rank: 70 },
  waiting_owner: { label: "Waiting on them", tone: "accent", rank: 60 },
  quiet: { label: "Quiet", tone: "warn", rank: 40 },
  new: { label: "New", tone: "accent", rank: 20 },
  live: { label: "Live", tone: "ok", rank: 10 },
  paused: { label: "Paused", tone: "muted", rank: 5 },
  test: { label: "Test", tone: "muted", rank: 0 }
};
var DAY = 864e5;
var PLATFORM_NEW_DAYS = 1;
var PLATFORM_QUIET_DAYS = 14;
var at = (iso) => {
  if (!iso) return null;
  const ms2 = Date.parse(iso);
  return Number.isFinite(ms2) ? ms2 : null;
};
var OURS_TO_FIX = ["failed"];
var THEIRS_TO_FIX = ["needs_record", "otp_waiting", "rejected"];
function billingBites(mode, status) {
  if (mode !== "stripe") return false;
  return !receptionistOn(status) || status === "past_due";
}
function verdictFor(r, nowMs) {
  if (r.status === "test") return "test";
  const mode = r.billing_mode ?? "direct";
  const status = r.billing_status ?? "none";
  const answering = r.voice_active === true || r.whatsapp_active === true;
  const age = nowMs - (at(r.created_at) ?? nowMs);
  if (r.voice_state === "failed" || OURS_TO_FIX.includes(r.sms_state ?? "")) return "broken";
  if (billingBites(mode, status)) return "billing";
  if (r.status === "paused") return "paused";
  if (r.reg_mock === true) return "rehearsal";
  if (!answering && age <= PLATFORM_NEW_DAYS * DAY) return "new";
  if (THEIRS_TO_FIX.includes(r.sms_state ?? "")) return "waiting_owner";
  if (mode === "stripe" && !maySpend(mode, status)) return "waiting_owner";
  if (!answering) return "stalled";
  const heard = at(r.last_inbound_at);
  if (heard === null) return age > PLATFORM_QUIET_DAYS * DAY ? "quiet" : "new";
  if (nowMs - heard > PLATFORM_QUIET_DAYS * DAY) return "quiet";
  return "live";
}
function sentenceFor(r, verdict, nowMs) {
  const heard = at(r.last_inbound_at);
  const quietFor = heard === null ? null : Math.floor((nowMs - heard) / DAY);
  switch (verdict) {
    case "broken":
      return r.line_error ? `${r.line_error}${r.reg_step ? ` (stopped at ${r.reg_step})` : ""}` : "Their line stopped and said nothing. A person at Chanlytics has to look.";
    case "billing":
      return r.billing_status === "past_due" ? "A payment failed. The receptionist still answers, and will not once Stripe gives up." : `Not subscribed (${r.billing_status ?? "no status"}) \u2014 the receptionist is paused for them.`;
    case "rehearsal":
      return "Texting is filed against the test registry: it reports itself approved, delivers nothing, and expires thirty days after filing.";
    case "stalled":
      return `Set up ${agoWords(at(r.created_at) ?? nowMs, nowMs)} and nothing answers yet${r.members <= 1 ? ", with one person in the workspace" : ""}.`;
    case "waiting_owner": {
      const mode = r.billing_mode ?? "direct";
      const status = r.billing_status ?? "none";
      if (!THEIRS_TO_FIX.includes(r.sms_state ?? "") && mode === "stripe") {
        return whyCannotSpend(mode, status) ?? "Something about their billing needs them.";
      }
      const words = textingWords({ sms_state: r.sms_state ?? "none", reg_mock: r.reg_mock ?? false, reg_sole_prop: r.reg_sole_prop ?? false }).sentence;
      return r.line_error ? `${words} \u2014 ${r.line_error}` : words;
    }
    case "quiet":
      return quietFor === null ? "Answering, and no customer has ever reached them." : `Answering, and no customer has reached them in ${quietFor} days.`;
    case "new":
      return r.voice_active === true || r.whatsapp_active === true ? `Answering since ${agoWords(at(r.created_at) ?? nowMs, nowMs)}; no customer has reached them yet.` : `Signed up ${agoWords(at(r.created_at) ?? nowMs, nowMs)}, still setting up.`;
    case "live":
      return `Answering; last heard from ${heard === null ? "never" : agoWords(heard, nowMs)}.`;
    case "paused":
      return "The workspace is paused. Nothing answers, by design.";
    case "test":
      return "Not a customer \u2014 a test workspace.";
  }
}
function factsFor(r, nowMs) {
  const mode = r.billing_mode ?? null;
  const status = r.billing_status ?? null;
  const paying = mode === null ? "No arrangement" : mode === "direct" ? "Invoiced" : status === "trialing" && r.trial_end ? `Trial to ${r.trial_end.slice(0, 10)}` : status ?? "unknown";
  const on = [r.voice_active ? "phone" : null, r.whatsapp_active ? "WhatsApp" : null].filter(Boolean);
  const answering = on.length ? on.join(" + ") : r.voice_state === "provisioning" ? "Getting a number" : r.voice_state === "failed" ? "Line failed" : "Nothing yet";
  const texting = !r.line_e164 ? "No line" : r.sms_state === "active" ? r.reg_sole_prop ? "On (sole proprietor)" : "On" : r.reg_mock ? "Rehearsal" : (r.sms_state ?? "none").replace(/_/g, " ");
  const at_ = at(r.last_inbound_at);
  return { paying, answering, texting, heard: at_ === null ? "Never" : agoWords(at_, nowMs) };
}
function platformRows(rows, nowMs = Date.now()) {
  return rows.map((r) => {
    const verdict = verdictFor(r, nowMs);
    return {
      tenantId: r.tenant_id,
      slug: r.slug,
      name: r.name,
      verdict,
      sentence: sentenceFor(r, verdict, nowMs),
      facts: factsFor(r, nowMs),
      age: agoWords(at(r.created_at) ?? nowMs, nowMs),
      members: r.members
    };
  }).sort((a, b) => {
    const byRank = PLATFORM_VERDICTS[b.verdict].rank - PLATFORM_VERDICTS[a.verdict].rank;
    if (byRank !== 0) return byRank;
    return a.name.localeCompare(b.name);
  });
}
function platformSummary(rows) {
  const customers = rows.filter((r) => r.verdict !== "test");
  const needsUs = customers.filter((r) => r.verdict === "broken" || r.verdict === "rehearsal").length;
  const needsThem = customers.filter((r) => r.verdict === "billing" || r.verdict === "waiting_owner" || r.verdict === "stalled").length;
  const live = customers.filter((r) => r.verdict === "live").length;
  const parts2 = [`${customers.length} workspace${customers.length === 1 ? "" : "s"}`, `${live} live`];
  if (needsUs) parts2.push(`${needsUs} on us`);
  if (needsThem) parts2.push(`${needsThem} on them`);
  return { total: customers.length, needsUs, needsThem, live, sentence: parts2.join(" \xB7 ") };
}
function platformNumber(e164) {
  return formatPhoneDisplay(e164) ?? "\u2014";
}
var NUMBER_MONTHLY = "$1.15 a month";
var REAL_FILING = "about $19.50 once";
var CAMPAIGN_VETTING = "about $15 once";
function platformLineActions(l, nowMs = Date.now()) {
  const out = [];
  if (l.voice_state === "failed" || lineStuckProvisioning(l, nowMs)) {
    out.push({
      action: "retry",
      label: "Retry setting up",
      sentence: "Resumes the line where it stopped, without repeating the steps that succeeded. The saga reads its own receipts, so nothing is bought twice.",
      // A saga that failed BEFORE the number was bought buys one when it
      // resumes, so this can spend even though it usually does not.
      cost: `If it stopped before the number was bought, this buys one \u2014 ${NUMBER_MONTHLY}.`,
      permanent: false
    });
  }
  if (l.sms_state === "rejected") {
    out.push({
      action: "refile",
      label: "Send the campaign back",
      // It used to say "Correct the business on record first — this sends what is
      // there now", which was true and was the whole problem: nothing verified
      // that anyone had, so a rejection could be answered with the fault that
      // caused it. Both senders now run the same pre-flight, so the honest
      // sentence is that this REFUSES rather than repeats.
      sentence: "Resubmits the campaign to the carriers, free \u2014 the vetting fee is charged once per campaign. It refuses, with the reason, if the record or the workspace's name still would not pass review.",
      cost: null,
      permanent: false
    });
    out.push({
      action: "replace",
      label: "File a new campaign",
      sentence: "Deletes the refused campaign and files a new one from today's facts, under the same approved brand: the remedy when what the carriers named cannot be edited (the opt-in confirmation and its keywords never can be). It refuses, with the reason, if the record or the workspace's name still would not pass review.",
      cost: `${CAMPAIGN_VETTING}, charged to Chanlytics.`,
      permanent: true
    });
  } else if (l.reg_mock === true) {
    out.push({
      action: "refile",
      label: "File it for real",
      sentence: "Takes the rehearsal off and files a real registration with the carriers. The rehearsal delivers nothing and expires thirty days after it was filed.",
      cost: `${REAL_FILING}, charged to Chanlytics.`,
      permanent: true
    });
  }
  if (l.e164) {
    out.push({
      action: "release",
      label: "Give the number back",
      sentence: "Releases the number, drops the trunk and forgets the line. Calls keep their history; the routing row is switched off, never deleted.",
      cost: `Stops the ${NUMBER_MONTHLY} this number costs.`,
      permanent: true
    });
  }
  return out;
}
function platformActionWarning(a) {
  const parts2 = [a.cost, a.permanent ? "This cannot be undone." : null].filter(Boolean);
  return parts2.length ? parts2.join(" ") : "Nothing is spent, and it can be done again.";
}

// src/consent-page.ts
function policyLinks(f) {
  const slug = (f.slug ?? "").trim();
  if (slug && f.businessPage) return { privacy: `/b/${slug}`, terms: `/b/${slug}/terms` };
  return { privacy: "/privacy", terms: "/terms" };
}
function optInConfirmation(businessName, purpose) {
  const name = businessName.trim() || "This business";
  return purpose === "marketing" ? `${name}: you're signed up for offers and news. A few messages a month. Msg & data rates may apply. Reply HELP for help, STOP to cancel.` : `${name}: you'll get texts about your appointments. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`;
}
var CONSENT_PHRASE = OFFERS_OPT_IN_PHRASES.en;
var CONSENT_PHRASE_ES = OFFERS_OPT_IN_PHRASES.es;
var CONVERSATION_PHRASE = "START";
function waysFor(f, phrase) {
  const ways = [];
  const waLink = optInLink(f.whatsappE164, phrase);
  if (waLink) {
    ways.push({
      kind: "whatsapp",
      title: "On WhatsApp",
      sentence: `Tap to open WhatsApp with ${phrase} ready to send. Sending it is your yes.`,
      phrase,
      href: waLink,
      display: formatPhoneDisplay(f.whatsappE164)
    });
  }
  const smsDisplay = formatPhoneDisplay(f.smsE164);
  if (smsDisplay) {
    ways.push({
      kind: "sms",
      title: "By text",
      sentence: `Text ${phrase} to ${smsDisplay}. Sending it is your yes.`,
      phrase,
      href: `sms:${f.smsE164}?&body=${encodeURIComponent(phrase)}`,
      display: smsDisplay
    });
  }
  return ways;
}
function askWords(name) {
  return {
    conversational: {
      title: "Messages about your visit",
      lead: `Appointment reminders and confirmations from ${name}, and a reply when you write to them.`,
      optional: null,
      terms: [
        `You get appointment reminders and answers to what you ask ${name}. Message frequency varies.`,
        "Message and data rates may apply.",
        "Reply HELP for help. Reply STOP at any time to stop."
      ]
    },
    marketing: {
      title: "Offers and news",
      lead: `Promotions and news from ${name}.`,
      optional: `Separate, and entirely optional \u2014 you can have the messages above without this one, and saying no changes nothing about your appointments or anything you buy from ${name}.`,
      terms: [
        `You get promotional offers and news from ${name}. A few messages a month, never daily.`,
        "Message and data rates may apply.",
        "Reply HELP for help. Reply STOP at any time to stop."
      ]
    }
  };
}
function bothTerms(name) {
  return [
    "No mobile information is shared with third parties or affiliates for marketing purposes.",
    `Consent is not a condition of any purchase from ${name}.`
  ];
}
function consentPageVM(f) {
  const name = f.businessName.trim() || "This business";
  const conversation = waysFor(f, CONVERSATION_PHRASE);
  const offers = waysFor(f, CONSENT_PHRASE);
  const empty = conversation.length === 0 && offers.length === 0;
  const words = askWords(name);
  const asks = empty ? [] : [
    { purpose: "conversational", ...words.conversational, ways: conversation },
    { purpose: "marketing", ...words.marketing, ways: offers }
  ];
  return {
    title: `Text messages from ${name}`,
    lead: empty ? `${name} is not set up to take sign-ups here yet.` : `Two separate things you can say yes to, in your own message from your own phone. ${name} never sells or shares your number.`,
    asks,
    qrLink: optInLink(f.whatsappE164, CONSENT_PHRASE),
    terms: bothTerms(name),
    links: policyLinks(f),
    empty
  };
}
function consentFormVM(f) {
  const name = f.businessName.trim() || "This business";
  const words = askWords(name);
  return {
    title: `Text messages from ${name}`,
    lead: "Two separate boxes. Tick and sign only the ones you want: signing one does not sign you up for the other, and either one can be had without the other.",
    fields: ["Name", "Mobile number"],
    sections: [
      { purpose: "conversational", ...words.conversational, box: `Yes, text me about my appointments with ${name}.`, sign: "Signature for this box" },
      { purpose: "marketing", ...words.marketing, box: `Yes, text me offers and news from ${name}.`, sign: "Signature for this box" }
    ],
    terms: bothTerms(name),
    links: policyLinks(f),
    office: `For ${name}: record each signed box on the customer's profile, under its own answer, as \u201CSign-up form\u201D, and keep this sheet. Recorded on __________ by __________`
  };
}

// src/business-page.ts
var SMS_CLAUSES = [
  "Message and data rates may apply.",
  "Message frequency varies.",
  "Reply STOP to stop and HELP for help.",
  "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes; all other categories of sharing exclude text-messaging originator opt-in data and consent, which will not be shared with any third parties."
];
function dataSentences(businessName) {
  return [
    `For text messages, ${businessName} keeps your mobile number, the messages you and it exchange, and each answer you give to the two questions on its sign-up page, with the date and the way it was given.`,
    "They are used only to answer you, to send the messages you agreed to, and to honour a STOP. They are not sold, and they are not shared with third parties or affiliates for marketing or promotional purposes."
  ];
}
function smsConsentSentence(businessName) {
  return `${businessName}'s customers receive text messages only when they have contacted ${businessName} first, or when they have separately agreed to receive them \u2014 messages about their own appointments and promotional messages are asked for separately, and either can be declined without affecting the other.`;
}
function addressLine(f) {
  const parts2 = [f.street, f.streetSecondary, `${f.city}, ${f.region} ${f.postalCode}`.trim(), f.country].map((p) => (p ?? "").trim()).filter(Boolean);
  return parts2.join(", ");
}
function businessPageVM(f) {
  const legal = f.legalName.trim();
  const trade = (f.tradeName ?? "").trim();
  const known = trade || legal;
  const empty = !legal || !f.street.trim() || !f.city.trim();
  const identity = [];
  if (legal) identity.push({ label: "Legal name", value: trade && trade !== legal ? `${legal}, trading as ${trade}` : legal });
  const where = addressLine(f);
  if (where) identity.push({ label: "Address", value: where });
  const phone = formatPhoneDisplay(f.publicPhoneE164);
  if (phone) identity.push({ label: "Phone", value: phone, href: `tel:${f.publicPhoneE164}` });
  if (f.contactEmail.trim()) identity.push({ label: "Email", value: f.contactEmail.trim(), href: `mailto:${f.contactEmail.trim()}` });
  if (f.websiteUrl && f.websiteUrl.trim()) identity.push({ label: "Website", value: f.websiteUrl.trim(), href: f.websiteUrl.trim() });
  return {
    title: known || "This business",
    lead: empty ? "This business has not finished setting up yet." : `${known} answers its customers by phone, on WhatsApp and by text. This page says who they are and what those messages are.`,
    identity,
    services: f.services.slice(0, 40).map((s) => ({
      name: s.name,
      detail: [
        typeof s.durationMin === "number" && s.durationMin > 0 ? `${s.durationMin} min` : null,
        (s.priceNote ?? "").trim() || null
      ].filter(Boolean).join(" \xB7 ") || null
    })),
    smsLead: smsConsentSentence(known || "This business"),
    smsClauses: SMS_CLAUSES,
    optInUrl: f.optInUrl,
    yourData: dataSentences(known || "This business"),
    termsUrl: f.termsUrl,
    websiteUrl: f.websiteUrl && f.websiteUrl.trim() ? f.websiteUrl.trim() : null,
    empty
  };
}
function textingTermsVM(f) {
  const legal = f.legalName.trim();
  const trade = (f.tradeName ?? "").trim();
  const known = trade || legal || "This business";
  const empty = !legal || !f.street.trim() || !f.city.trim();
  const phone = formatPhoneDisplay(f.publicPhoneE164);
  const email = f.contactEmail.trim();
  const support = [phone ? `call ${phone}` : null, email ? `email ${email}` : null].filter(Boolean).join(" or ");
  const entity = trade && trade !== legal ? `${legal}, trading as ${trade}` : legal;
  return {
    title: `Text messaging terms: ${known}`,
    lead: `These terms cover the text messages ${known} sends. ${known} is ${entity}${addressLine(f) ? `, ${addressLine(f)}` : ""}.`,
    items: [
      { label: "The program", text: `${known} texts customers who asked for it: replies to what they write, confirmations and reminders about their own appointments, and, only with a separate opt-in, occasional offers and news.` },
      { label: "How you join", text: `By texting START (appointment messages) or YES OFFERS (offers and news) to ${known}'s number from your own phone, or by ticking and signing the matching box on its sign-up form. Each is a separate choice, and neither is a condition of any purchase.` },
      { label: "Message frequency", text: "Message frequency varies for appointment messages. Offers and news are a few messages a month." },
      { label: "Cost", text: "Message and data rates may apply." },
      { label: "Help", text: `Reply HELP for help${support ? `, or ${support}` : ""}.` },
      { label: "Stop", text: `Reply STOP at any time to stop. ${known} confirms once and sends nothing more, of either kind.` },
      { label: "Carriers", text: "Wireless carriers are not liable for delayed or undelivered messages." },
      { label: "Your information", text: SMS_CLAUSES[3] }
    ],
    privacyUrl: f.privacyUrl,
    empty
  };
}
var loose = (s) => s.toLowerCase().replace(/\b(llc|inc|ltd|corp|co|the)\b/g, "").replace(/[^a-z0-9]/g, "");
function registrationPreflight(f) {
  const out = [];
  const said = loose(f.workspaceName);
  const legal = loose(f.legalName);
  const trade = loose(f.tradeName ?? "");
  if (said && legal && said !== legal && (!trade || said !== trade)) {
    out.push({
      id: "name_mismatch",
      what: `The carriers will be told this business is called \u201C${f.workspaceName}\u201D, but the business on record is \u201C${f.tradeName?.trim() || f.legalName}\u201D.`,
      fix: "Make the workspace's name match the name on record before filing. The name goes into the confirmation message customers receive, and that message cannot be changed after a filing without registering a new campaign."
    });
  }
  if (!f.legalName.trim() || !f.street.trim() || !f.city.trim()) {
    out.push({
      id: "no_identity",
      what: "The page the carriers will open to check who you are cannot be published: it needs your legal name and your address.",
      fix: "Fill in the legal name and the street address above. They are the two facts a reviewer looks for first."
    });
  }
  if (!f.hasOptInNumber) {
    out.push({
      id: "no_opt_in_number",
      what: "There is no number for customers to text to say yes, so the sign-up page has nothing to offer them.",
      fix: "Connect WhatsApp or finish setting up the phone line first. The carriers are told customers opt in by texting this business, and that has to be true."
    });
  }
  const site = (f.websiteUrl ?? "").trim();
  if (site && !/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(site)) {
    out.push({
      id: "website_unusable",
      what: `\u201C${site}\u201D is not an address a reviewer can open.`,
      fix: "Write it in full, starting with https:// \u2014 or clear it, and we will publish a page for you instead."
    });
  }
  return out;
}

// src/a2p-enums.ts
var BUSINESS_INDUSTRIES = [
  "AGRICULTURE",
  "AUTOMOTIVE",
  "BANKING",
  "CONSTRUCTION",
  "CONSUMER",
  "EDUCATION",
  "ELECTRONICS",
  "ENERGY",
  "ENGINEERING",
  "FAST_MOVING_CONSUMER_GOODS",
  "FINANCIAL",
  "FINTECH",
  "FOOD_AND_BEVERAGE",
  "GOVERNMENT",
  "HEALTHCARE",
  "HOSPITALITY",
  "INSURANCE",
  "JEWELRY",
  "LEGAL",
  "MANUFACTURING",
  "MEDIA",
  "NOT_FOR_PROFIT",
  "OIL_AND_GAS",
  "ONLINE",
  "PROFESSIONAL_SERVICES",
  "RAW_MATERIALS",
  "REAL_ESTATE",
  "RELIGION",
  "RETAIL",
  "TECHNOLOGY",
  "TELECOMMUNICATIONS",
  "TRANSPORTATION",
  "TRAVEL"
];
var DEFAULT_INDUSTRY = "PROFESSIONAL_SERVICES";
var BUSINESS_TYPES = ["Co-operative", "Corporation", "Limited Liability Corporation", "Non-profit Corporation", "Partnership"];
var DEFAULT_BUSINESS_TYPE = "Limited Liability Corporation";
var COMPANY_TYPES = ["government", "non-profit", "private", "public"];
var DEFAULT_COMPANY_TYPE = "private";
function industryOf(v) {
  const up = String(v ?? "").trim().toUpperCase();
  return BUSINESS_INDUSTRIES.includes(up) ? up : DEFAULT_INDUSTRY;
}
function businessTypeOf(v) {
  const s = String(v ?? "").trim();
  return BUSINESS_TYPES.includes(s) ? s : DEFAULT_BUSINESS_TYPE;
}
function companyTypeOf(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return COMPANY_TYPES.includes(s) ? s : DEFAULT_COMPANY_TYPE;
}
function industryWords(v) {
  return v.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// src/business-record.ts
var FIELD = {
  legal_name: { label: "Legal name", hint: "Exactly as it appears on your tax filing, not your trading name.", placeholder: "Harbor Moving LLC", group: "business" },
  trade_name: { label: "Trading name", hint: "What customers call you, if it differs.", placeholder: "Harbor Moving", group: "business" },
  ein: { label: "Tax ID (EIN)", hint: "Nine digits from the IRS \u2014 on the letter that issued it, or any filing you have made with it.", placeholder: "12-3456789", group: "business" },
  business_type: { label: "Legal form", options: BUSINESS_TYPES, group: "business" },
  company_type: { label: "Ownership", options: COMPANY_TYPES, group: "business" },
  industry: { label: "Industry", options: BUSINESS_INDUSTRIES, group: "business" },
  website_url: { label: "Website", hint: "Yours, if you have one. Without it we publish a page for you at chanlytics.com carrying your name, address and the wording the carriers require \u2014 which is what they check.", placeholder: "https://", group: "business" },
  street: { label: "Street", placeholder: "193 Jamaica Ave", group: "address" },
  street_secondary: { label: "Suite or floor", group: "address" },
  city: { label: "City", placeholder: "Brooklyn", group: "address" },
  region: { label: "State", placeholder: "NY", group: "address" },
  postal_code: { label: "ZIP", placeholder: "11207", group: "address" },
  contact_first_name: { label: "First name", group: "contact" },
  contact_last_name: { label: "Last name", group: "contact" },
  contact_email: { label: "Email", hint: "The carriers write here if they need something.", placeholder: "you@business.com", group: "contact" },
  contact_phone: { label: "Mobile", hint: "Yours, not the business line.", placeholder: "+1 646 555 0123", group: "contact" },
  contact_title: { label: "Title", placeholder: "Owner", group: "contact" }
};
var PATH_FIELDS = {
  standard: [
    { name: "legal_name", required: true },
    { name: "trade_name", required: false },
    { name: "ein", required: true },
    { name: "business_type", required: true },
    { name: "company_type", required: true },
    { name: "industry", required: true },
    // NOT required, and this is the change gate 8 is. A carrier registration
    // needs a website that identifies the business and a privacy policy
    // carrying SMS language, on a domain that matches the brand -- and most
    // salons have a Facebook page and a Booksy link. Demanding a URL here
    // turned that into a wall at field seven. We publish `/b/<slug>` from the
    // facts on this very form instead, and file that.
    { name: "website_url", required: false },
    { name: "street", required: true },
    { name: "street_secondary", required: false },
    { name: "city", required: true },
    { name: "region", required: true },
    { name: "postal_code", required: true },
    { name: "contact_first_name", required: true },
    { name: "contact_last_name", required: true },
    { name: "contact_email", required: true },
    { name: "contact_phone", required: true },
    { name: "contact_title", required: false }
  ],
  // No tax id, no legal form, no ownership: there is no registered entity to
  // describe, only a person trading under a name. One name box rather than
  // two, because the filing sends one name. The website is asked and not
  // required because nothing in this registration sends it — a required box
  // whose answer goes nowhere is how a form loses somebody at field fifteen.
  sole_proprietor: [
    { name: "legal_name", required: true, label: "Business name", hint: "What customers call you. There is no filing to match \u2014 this is the name the carriers show beside your texts." },
    { name: "industry", required: true },
    { name: "website_url", required: false, hint: "Optional: nothing in this registration sends it. Worth having anyway, if a customer ever looks you up." },
    { name: "street", required: true },
    { name: "street_secondary", required: false },
    { name: "city", required: true },
    { name: "region", required: true },
    { name: "postal_code", required: true },
    { name: "contact_first_name", required: true },
    { name: "contact_last_name", required: true },
    { name: "contact_email", required: true },
    { name: "contact_phone", required: true, label: "Your mobile", hint: "Your own handset, not the number Chanlytics answers for you. The carriers text a code to it and you reply from that phone." }
  ]
};
var BUILT = {};
function businessFieldsFor(path) {
  const built = BUILT[path];
  if (built) return built;
  const made = PATH_FIELDS[path].map((a) => ({
    ...FIELD[a.name],
    name: a.name,
    required: a.required,
    ...a.label ? { label: a.label } : {},
    ...a.hint ? { hint: a.hint } : {}
  }));
  BUILT[path] = made;
  return made;
}
function businessGroupWordsFor(path) {
  if (path === "sole_proprietor") {
    return {
      business: { title: "What you do", sub: "as customers know it" },
      address: { title: "Where you are", sub: "your own address \u2014 the carriers check it" },
      contact: { title: "You", sub: "the carriers text this mobile, and you answer from it" }
    };
  }
  return {
    business: { title: "The business", sub: "as the tax authorities know it" },
    address: { title: "Where it is registered", sub: "the address on the filing, not a mailbox" },
    contact: { title: "Who signs for it", sub: "a person the carriers can reach" }
  };
}
function emptyBusinessRecord(o = {}) {
  return {
    legal_name: "",
    trade_name: null,
    ein: null,
    street: "",
    street_secondary: null,
    city: "",
    region: "",
    postal_code: "",
    country: "US",
    website_url: o.websiteUrl ?? "",
    industry: DEFAULT_INDUSTRY,
    business_type: DEFAULT_BUSINESS_TYPE,
    company_type: DEFAULT_COMPANY_TYPE,
    contact_first_name: "",
    contact_last_name: "",
    contact_email: o.email ?? "",
    contact_phone: "",
    contact_title: "Owner",
    contact_job_position: "Director"
  };
}
var EIN = /^\d{2}-?\d{7}$/;
var EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
var E1642 = /^\+[1-9]\d{6,14}$/;
var REGION = /^[A-Za-z]{2}$/;
var REGISTERABLE_COUNTRIES = ["US", "CA"];
var digits = (s) => s.replace(/\D/g, "");
function businessRecordProblems(r, path, facts = {}) {
  const out = {};
  const has = (k) => String(r[k] ?? "").trim().length > 0;
  for (const f of businessFieldsFor(path)) if (f.required && !has(f.name)) out[f.name] = `${f.label} is needed.`;
  if (has("ein") && !EIN.test(String(r.ein).trim())) out.ein = "A tax ID is nine digits, like 12-3456789.";
  if (has("contact_email") && !EMAIL.test(String(r.contact_email).trim())) out.contact_email = "That does not look like an email address.";
  if (has("contact_phone") && !E1642.test(String(r.contact_phone).replace(/[\s()-]/g, ""))) out.contact_phone = "Write it with the country code, like +1 646 555 0123.";
  if (has("region") && !REGION.test(String(r.region).trim())) out.region = "Two letters, like NY.";
  if (has("website_url") && !/^https?:\/\/\S+\.\S+/.test(String(r.website_url).trim())) out.website_url = "A full address a reviewer can open, starting with https://";
  if (has("country") && !REGISTERABLE_COUNTRIES.includes(String(r.country).trim().toUpperCase())) {
    out.country = "The carriers register US and Canadian businesses only. Ours is not a door we can open.";
  }
  if (path === "sole_proprietor" && has("contact_phone") && (facts.ourNumbers ?? []).some((n) => digits(String(n)) === digits(String(r.contact_phone)))) {
    out.contact_phone = "This is the number Chanlytics answers for you. The carriers need YOUR handset \u2014 they text a code to it and you reply from the phone in your hand.";
  }
  return out;
}
function businessRecordForPath(r, path) {
  return path === "standard" ? r : { ...r, ein: null };
}
function businessRecordLine(r) {
  if (!r) return "The carriers ask who you are before they let a number text. It takes two minutes, once.";
  const path = registrationPathOf(r) ?? "standard";
  const problems = businessRecordProblems(r, path);
  const missing = Object.keys(problems).length;
  if (missing) return `${missing} thing${missing === 1 ? "" : "s"} still to fill in before this can be filed.`;
  const capped = path === "sole_proprietor" ? ` \xB7 one number, about ${SOLE_PROP_LIMITS.messagesPerSecond} text a second` : "";
  return `${r.legal_name}${r.trade_name ? ` (${r.trade_name})` : ""} \xB7 ${r.city}, ${r.region} \xB7 on record${capped}.`;
}

// src/schema-sets.generated.ts
var SCHEMA_SETS = {
  "ask_messages.role": ["user", "assistant"],
  "billing_accounts.mode": ["stripe", "direct"],
  "billing_accounts.status": [
    "none",
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused"
  ],
  "broadcast_recipients.state": ["queued", "sent", "skipped", "failed"],
  "broadcasts.state": ["pending_approval", "scheduled", "sending", "sent", "canceled", "failed"],
  "business_records.business_type": [
    "Co-operative",
    "Corporation",
    "Limited Liability Corporation",
    "Non-profit Corporation",
    "Partnership"
  ],
  "business_records.company_type": ["government", "non-profit", "private", "public"],
  "calls.direction": ["inbound", "outbound"],
  "calls.outcome": ["answered", "booking_link_sent", "callback_needed", "voicemail", "no_request", "other"],
  "calls.status": ["registered", "ongoing", "ended", "error", "not_connected"],
  "capability_activations.capability": ["voice", "whatsapp", "sms"],
  "contact_identities.channel": ["whatsapp", "voice", "sms", "email", "instagram"],
  "contacts.consent": ["unknown", "opted_in", "opted_out"],
  "contacts.marketing_consent": ["unknown", "opted_in", "opted_out"],
  "conversations.state": ["open", "needs_human", "snoozed", "archived"],
  "decisions.actor_type": ["user", "ai", "system", "owner_phone"],
  "decisions.subject_type": [
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
    "playbook",
    "review"
  ],
  "decisions.verb": [
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
    "invite",
    "revoke_invite",
    "change_role",
    "remove_member",
    "erase",
    "whisper",
    "connect_channel",
    "consent_change",
    "send_broadcast",
    "cancel_broadcast",
    "start_playbook",
    "pause_playbook",
    "reply_review"
  ],
  "escalations.reason": [
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
    "stale",
    "person_hold",
    "budget",
    "policy_ask",
    "callback",
    "paused",
    "carriers"
  ],
  "escalations.state": ["open", "resolved"],
  "google_reviews.origin": ["places", "profile"],
  "invitations.role": ["operator", "viewer"],
  "jobs.kind": ["outbound_send", "broadcast_send", "blob_thread_erase", "line_provision"],
  "jobs.state": ["scheduled", "fired", "done", "canceled", "failed"],
  "lines.forwarding_state": ["none", "instructed", "verified"],
  "lines.kind": ["chanlytics", "hosted", "ported", "forwarded"],
  "lines.port_state": ["none", "requested", "scheduled", "done", "rejected"],
  "lines.provider": ["twilio", "dry", "carrier"],
  "lines.reg_step": [
    "profile",
    "business",
    "representative",
    "address",
    "document",
    "primary",
    "submit",
    "a2p_profile",
    "brand",
    "campaign"
  ],
  "lines.sms_state": [
    "none",
    "needs_record",
    "otp_waiting",
    "registering",
    "approved",
    "rejected",
    "hosting",
    "active",
    "failed"
  ],
  "lines.step": ["subaccount", "number", "trunk", "agent", "import", "messaging", "channel"],
  "lines.voice_state": ["none", "provisioning", "answering", "failed"],
  "lines.whatsapp_state": ["none", "connecting", "connected", "coexistence", "failed"],
  "memberships.role": ["owner", "operator", "viewer"],
  "messages.channel": ["whatsapp", "voice", "sms", "email", "system"],
  "messages.direction": ["inbound", "outbound"],
  "messages.sender": ["customer", "ai", "human", "system"],
  "messages.status": ["received", "queued", "sent", "delivered", "read", "failed", "canceled"],
  "messages.type": ["text", "template", "media", "call_summary", "note"],
  "notifications.kind": [
    "handoff",
    "deadman",
    "call",
    "number",
    "sweep",
    "job_failed",
    "playbook",
    "calendar_people",
    "alert",
    "review",
    "billing"
  ],
  "playbooks.policy_class": ["reengage", "campaign", "booking"],
  "playbooks.state": ["running", "paused"],
  "playbooks.trigger": [
    "quiet_30",
    "new_week",
    "phoned_only",
    "everyone_monthly",
    "visit_tomorrow",
    "visited"
  ],
  "policies.class": ["reply", "booking", "faq", "reengage", "campaign", "money", "reviews"],
  "policies.mode": ["auto", "veto", "ask", "never"],
  "policies.subject_type": ["segment", "contact"],
  "sweep_status.judged_by": ["request", "run"],
  "templates.category": ["marketing", "utility", "authentication"],
  "templates.channel": ["whatsapp", "voice", "sms", "email", "instagram"],
  "templates.meta_status": ["approved", "pending", "rejected", "paused", "disabled"],
  "templates.source": ["meta", "chanlytics"],
  "tenant_channels.kind": ["whatsapp", "voice", "sms", "email", "instagram"],
  "tenant_channels.status": ["active", "disabled"],
  "tenants.status": ["active", "paused", "test"]
};
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
  BILLING_MODES,
  BILLING_STATUSES,
  BILLING_TRIAL_DAYS,
  BOOKING_DEFAULTS,
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
  BUSINESS_INDUSTRIES,
  BUSINESS_TYPES,
  BookingRulesSchema,
  BrainConfigSchema,
  BrainOutputSchema,
  BusinessProfileSchema,
  CALL_HEARTBEAT_MS,
  CALL_OUTCOMES,
  CALL_OUTCOME_WORDS,
  CAMPAIGN_REPORT_RANGES,
  CAPABILITY_KINDS,
  CARRIERS,
  CARRIER_WORDS,
  CHANNEL_KINDS,
  CHECKOUT_OUTCOME_WORDS,
  COMPANY_TYPES,
  CONFIDENCE_STEPS,
  CONNECTION_GROUP_WORDS,
  CONNECTION_KINDS,
  CONSENT_PHRASE,
  CONSENT_PHRASE_ES,
  CONSENT_RESET_SOURCE,
  CONSENT_SOURCES,
  CONSENT_STATES,
  CONVERSATION_OPT_IN_PATTERN,
  CONVERSATION_PHRASE,
  CONVERSATION_STATES,
  CalendarConfigSchema,
  ClosureSchema,
  DAYS,
  DECISION_SUBJECTS,
  DECISION_VERBS,
  DEFAULT_BUSINESS_TYPE,
  DEFAULT_COMPANY_TYPE,
  DEFAULT_INDUSTRY,
  DEFAULT_TIMEZONE,
  DISCONNECTION_LABELS,
  DISPLAY_NAME_MAX,
  E164,
  EMPTY_READ_STATE,
  ERROR_CODES,
  ESCALATION_REASONS,
  ESCALATION_REASON_LABELS,
  ESCALATION_STATES,
  EVENT_KINDS,
  EVERYONE_LABEL,
  FORWARDING_MODES,
  FORWARDING_TEST_WINDOW_MS,
  FeaturesConfigSchema,
  GOOGLE_SHOWN_REVIEWS,
  GuardrailsSchema,
  HELD_REASONS,
  HoursSchema,
  INTENT_LABELS,
  IntervalSchema,
  JOB_KINDS,
  JOB_STATES,
  LIMIT_TIERS,
  LINE_STEP_WORDS,
  LIVE_OVERLONG_MS,
  LIVE_STALE_MS,
  MARKETING_OPT_IN_PATTERN,
  MAX_CLOSURES,
  MAX_INTERVALS_PER_DAY,
  MEMBERSHIP_ROLES,
  MESSAGE_CHANNELS,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDERS,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  MOCK_TEXTING_SENTENCE,
  MODE_WORDS,
  NEW_WINDOW_MS,
  NoteSchema,
  NotificationsConfigSchema,
  OFFERS_OPT_IN_PHRASES,
  OFFERS_YES_SOURCES,
  OPT_IN_PATTERN,
  OPT_OUT_PATTERN,
  OPT_OUT_REFUSAL,
  PARAM_SOURCES,
  PARAM_SOURCE_LABELS,
  PENDING_WORKSPACE_KEY,
  PEOPLE_LISTS,
  PEOPLE_LIST_GROUPS,
  PEOPLE_TABS,
  PERSON_MODES,
  PERSON_MODE_LABELS,
  PERSON_STATE_LABELS,
  PLATFORM_NEW_DAYS,
  PLATFORM_QUIET_DAYS,
  PLATFORM_VERDICTS,
  PLAYBOOK_BREATH_MS,
  PLAYBOOK_CLASS_LABEL,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_STATES,
  PLAYBOOK_TRIGGERS,
  PLAYBOOK_VETO_DELAY_MS,
  POLICY_CLASSES,
  POLICY_CLASS_MODES,
  POLICY_CLASS_WORDS,
  POLICY_MODES,
  PROPOSAL_GATE,
  PROVISIONING_DEADLINE_MS,
  PURPOSE_REFUSALS,
  PendingWorkspaceSchema,
  PolicyLimitsSchema,
  QUIET_AFTER_MS,
  RECENT_MAX,
  RECIPIENT_STATES,
  REGISTRATION_COST_WORDS,
  REGISTRATION_PATHS,
  REGISTRATION_PATH_WORDS,
  REGISTRATION_QUESTION,
  REPLY_DELAY_DEFAULT_MS,
  REPLY_DELAY_MAX_MS,
  REPLY_DELAY_MIN_MS,
  REPORT_RANGES,
  REVIEW_AUTO_REPLIES_PER_SYNC,
  REVIEW_AUTO_REPLY_MAX_AGE_MS,
  REVIEW_NEWS_MAX_AGE_MS,
  REVIEW_NEWS_MS,
  REVIEW_REPLY_MAX_CHARS,
  REVIEW_REPLY_MAX_WORDS,
  ROLES,
  ROLE_PERMS,
  ROLE_WORDS,
  SCHEMA_SETS,
  SERVER_KEY_PREFIX,
  SERVER_NOTIFICATION_KINDS,
  SETUP_STATE_WORDS,
  SHORTCUTS,
  SIGNUP_NAME_MAX,
  SIGNUP_NAME_MIN,
  SIGNUP_WAITLIST,
  SIGNUP_WORDS,
  SMS_CLAUSES,
  SMS_OPT_OUT_PATTERN,
  SOLE_PROP_CEILING_SENTENCE,
  SOLE_PROP_LIMITS,
  SOLE_PROP_TEXTING_SENTENCE,
  SOURCE_WORDS,
  STARTER_LANGUAGES,
  STARTER_TEMPLATES,
  ServiceSchema,
  SignupSchema,
  TEMPLATE_BODY_MAX,
  TEMPLATE_CATEGORIES,
  TEMPLATE_EXAMPLE_MAX,
  TEMPLATE_FOOTER_MAX,
  TEMPLATE_LANGUAGES,
  TEMPLATE_NAME_MAX,
  TEMPLATE_STATUSES,
  TEMPLATE_TITLE_MAX,
  TENANT_STATUSES,
  THEME_OPTIONS,
  TODAY_QUEUE_MAX,
  TenantConfigSchema,
  TenantConfigWriteSchema,
  WA_WINDOW_MS,
  afterPersonRefused,
  ago,
  agoLabel,
  agoShort,
  agoWords,
  allVisitsIn,
  applyReadState,
  applySettingsChange,
  asPersonMode,
  askJump,
  attentionRow,
  autoReplyBell,
  autoReplyCandidates,
  billingAccountDto,
  billingDoorOpen,
  bookedAfterAsk,
  brainMetaOf,
  broadcastName,
  buildAskSuggestions,
  buildNotificationFeed,
  businessFieldsFor,
  businessGroupWordsFor,
  businessPageVM,
  businessRecordForPath,
  businessRecordLine,
  businessRecordProblems,
  businessTypeOf,
  callOutcomeOf,
  callOutcomeWords,
  capabilityStatus,
  changedConfigFields,
  channelFor,
  checkedWords,
  citationRoute,
  citationsToShow,
  cleanAnswer,
  cleanDisplayName,
  cleanDraft,
  cleanParam,
  cleanTimezone,
  clockInZone,
  clockLabel,
  closedOn,
  companyTypeOf,
  compareTemplates,
  composeSystemPrompt,
  connectionRows,
  connectionWords,
  consentFormVM,
  consentPageVM,
  consentSourceLabel,
  contactMeta,
  contactName,
  coversSpan,
  dailyLimit,
  dataSentences,
  dayDate,
  dayFromQuestion,
  dayInZone,
  dayIntervals2 as dayIntervals,
  dayWords,
  dedupeFeed,
  defaultParamSpecs,
  defaultSlotKinds,
  defaultTemplate,
  deltaOf,
  describeNow,
  describeOpenings,
  describeSettingsChange,
  describeVisits,
  detectLanguage,
  deviceTimezone,
  draftSendsAtMs,
  durationLabel,
  eligibleFor,
  eligibleForPlaybook,
  emptyAudienceRefusal,
  emptyBusinessRecord,
  emptyReadSet,
  err,
  eventText,
  exampleParams,
  extractContacts,
  factConflicts,
  fastPath,
  feedSourceLabel,
  filterOpenings,
  firstNameOf,
  fmtClock,
  fmtDay,
  fmtSeconds,
  followupsToShow,
  formatPhoneDisplay,
  formatWaited,
  forwardingCodes,
  forwardingMatch,
  forwardingTestOpen,
  frameOf,
  frameSteer,
  frameWhisper,
  freeWindows,
  gainedOver,
  googleAudienceWords,
  groundCitations,
  guessName,
  guessSlotKind,
  handoffE164,
  hasProfile,
  hoursLines2 as hoursLines,
  hoursRuns,
  identityWords,
  indexFeed,
  industryOf,
  industryWords,
  initialsOf,
  isCarrier,
  isDayKey,
  isForwardingMode,
  isHeldDraft,
  isLiveCall,
  isOptedOut,
  isOptedOutContact,
  isOwned,
  isRealDate,
  isSidebarPref,
  isThemePref,
  isTimezone,
  isTypingTarget,
  isUngrounded,
  knownTimezones,
  lineRetryRefusal,
  lineStuckProvisioning,
  listingLine,
  localDate,
  localHour,
  localToUtcMs,
  matchPerson,
  matchService,
  mayMessageFor,
  mayReceive,
  maySpend,
  mediaKind,
  mediaVM,
  memberWords,
  messageAt,
  messageStatusLabel,
  messageText,
  mondayOf,
  moneyWords,
  monthLabelOf,
  monthSpan,
  navigateLabel,
  newReceptionistDefaults,
  nextRunLabel,
  normalizeNavigate,
  normalizePhone,
  numberHealth,
  offersYesRefusal,
  ok,
  optInConfirmation,
  optInLink,
  optInPurposeOf,
  overLimitRefusal,
  paramLabel,
  parseAskFinish,
  parseBrainOutput,
  parseIcs,
  parseParamSpec,
  parseTenantConfig,
  parseTenantConfigResult,
  partialAnswer,
  pausedVoiceFacts,
  pendingWorkspaceOf,
  peopleAggregates,
  peopleFromItems,
  peopleListAction,
  personInText,
  personInitials,
  personName,
  personStanding,
  personStateFor,
  placeholdersOf,
  placeholdersSequential,
  planBilling,
  planRun,
  platformActionWarning,
  platformLineActions,
  platformNumber,
  platformRows,
  platformSummary,
  pointsDelta,
  policyAskClass,
  policyClassOfIntent,
  policyLinks,
  policyRules,
  priceWords,
  purposeOfPlaybook,
  purposeOfTemplate,
  quantile,
  ratingWords,
  reachedCustomer,
  readAgoLabel,
  reasonShort,
  recencyCells,
  receptionistOn,
  recoverCitations,
  registrationPathOf,
  registrationPreflight,
  renderTemplate,
  replyDelayMs,
  replyWhy,
  replyWindow,
  resolveFacts,
  resolveParams,
  resolveSystemPrompt,
  resolveTheme,
  reviewIsNew,
  reviewReplyModeOf,
  reviewReplyPrompt,
  reviewReplyWords,
  reviewSnippet,
  reviewsWords,
  rulesLine,
  runDueNow,
  safeNavigate,
  sameAddress,
  sameName,
  samePhone,
  sameQuestion,
  scheduleLine,
  scopeFromRoute,
  sendFailureIsOurs,
  serverNotificationRows,
  setupRoute,
  setupSteps,
  shellStatusLine,
  shiftKey,
  shiftMonth,
  shortCode,
  shortTime,
  shortcutGroups,
  shouldLandOnSetup,
  signupNext,
  signupPosture,
  slotLabels,
  slugTemplateName,
  smsConsentSentence,
  smsStateRow,
  soleProprietorLimits,
  spanForView,
  spanLabel,
  spanUnits,
  standingOf,
  starsOf,
  starterByKey,
  starterByName,
  starterDraft,
  starterForTrigger,
  starterIndex,
  starterPreview,
  starterText,
  telHref,
  templateComponents,
  templateNameOk,
  templateTitle,
  tenantStatusFor,
  textingTermsVM,
  textingWords,
  threadStanding,
  tidyCallSummary,
  timezoneCity,
  timezoneWords,
  toBillingVM,
  toBookingReportVM,
  toBroadcastVM,
  toCalendarVM,
  toCallVM,
  toCampaignReportVM,
  toChannelVM,
  toConversationVM,
  toGoogleReviewVM,
  toGoogleVM,
  toInboxThreadVM,
  toLiveCallVM,
  toLiveVM,
  toPersonRowVM,
  toPersonVM,
  toReportVM,
  toTodayVM,
  toVisitDto,
  todayAway,
  todayDay,
  todayDayFacts,
  todayJourney,
  todayWeek,
  trialOffer,
  trialWords,
  triggerOf,
  tzClock,
  usableDeviceTimezone,
  validateTemplateDraft,
  verbForRoute,
  violatesNoPrices,
  visitDateKey,
  visitDay,
  visitFactsFor,
  visitLine,
  visitStartTime,
  visitTime,
  visitsIn,
  visitsOf,
  waWindow,
  waitedLabel,
  whenLabel,
  whisperText,
  whyCannotSpend,
  whyNotAHandoff,
  whyNotAPhone,
  windowFor,
  workspaceHotkey,
  zoneMidnight,
  zoneOffsetMs
};
