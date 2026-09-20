// ../contracts/dist/index.js
import { z } from "zod";
import { z as z2 } from "zod";
import { z as z3 } from "zod";
import { z as z4 } from "zod";
import { z as z5 } from "zod";
import { z as z6 } from "zod";
import { z as z7 } from "zod";
z.config({ jitless: true });
var LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
var LOCAL = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
var SHAPE = new RegExp(`^(${LOCAL})@(${LABEL}(?:\\.${LABEL})+)$`);
var EVENT_KINDS = [
  "message.received",
  "message.sent",
  "contact.consent_changed",
  "usage.llm_tokens",
  "usage.wa_conversation",
  "ingest.allowlist_skip",
  /** The sender cannot receive a reply — a short code. Recorded, never answered. */
  "ingest.unreachable_sender",
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
  /** The owner's controls changed: which config fields moved (never their values); a policy row's class, mode and the limit keys that moved. */
  "settings.changed",
  "policy.changed",
  "billing.updated",
  "billing.paused",
  "billing.resumed",
  /** A call: the row (00007) and the seconds it cost. */
  "call.recorded",
  "usage.voice_seconds",
  /** The assistant's model usage, per turn (ask-gateway). */
  "usage.ask_tokens",
  /** Retell's webhook: every delivery and every refused signature, kept thirty days (00038). */
  "webhook.auth",
  "webhook.delivery",
  /** A person who came from the calendar or a hand, not from a message (00053). */
  "contact.added",
  /** A person renamed or annotated at the desk (00054), or given an email address (00125). */
  "contact.named",
  "contact.noted",
  "contact.email_set",
  /** A person's address stopped being sent to: a permanent bounce, a complaint, or the provider's own list (00126). The reason, never the address. */
  "contact.email_suppressed",
  /** An inbound the router could not place on any workspace. */
  "ingest.unroutable",
  /** A reply skipped because its veto window had already been spent. */
  "policy.veto_window_skipped",
  /** The sweep woke a snooze whose time had passed (00082). */
  "conversation.snooze_expired",
  /** A broadcast finished, with its tally; a playbook made a run. */
  "broadcast.sent",
  "playbook.run",
  /** A WhatsApp number connected through Embedded Signup (admin/whatsapp/connect). */
  "channel.connected",
  /** An owner gave the workspace its email address, or changed the name beside it (00129). Who, never the address. */
  "mailbox.created",
  "mailbox.renamed",
  /** A lead search's round started, waited, or ended with one of the nine endings (00140). */
  "lead.round",
  /** An ask no source card fits, logged as demand (§0.3): the words asked, never a place. */
  "lead.no_card"
];
var OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;
var SMS_OPT_OUT_PATTERN = /^\s*(stop|stopall|end|cancel|quit|unsubscribe|revoke|optout|baja|alto)\s*[.!]?\s*$/i;
var MARKETING_OPT_IN_PATTERN = /^\s*(yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;
var CONVERSATION_OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta)\s*[.!]?\s*$/i;
var OFFERS_OPT_IN_PHRASES = { en: "YES OFFERS", es: "SI OFERTAS" };
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
  "reply_review",
  /**
   * A copy of the workspace's data left the building: everyone as a CSV, a
   * thread, a call, or the whole workspace. Subject "workspace" for the two
   * that carry everyone; the thread's or the call's own row for the others.
   * The one verb an auditor asks about that the ledger did not keep.
   */
  "export",
  /** A call in progress ended from the Live page (00118). Passing one to the business is take_over, the Inbox's word for the same intent. */
  "end_call"
];
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
var BRAIN_INTENTS = ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
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
var BrainOutputSchema = z2.object({
  reply: z2.string(),
  intent: z2.enum(BRAIN_INTENTS).catch("other"),
  escalate: z2.boolean().catch(false),
  reason: z2.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z2.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z2.array(z2.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: z2.enum(BRAIN_LANGUAGES).catch("other")
});
var WA_WINDOW_MS = 24 * 3600 * 1e3;
var REPLY_LIMITS = {
  whatsapp: { max: 4096, refusal: "WhatsApp refuses a message over 4096 characters." },
  sms: { max: 1600, refusal: "A text can be at most 1600 characters." },
  email: { max: 2e4, refusal: "An email reply can be at most 20,000 characters." }
};
var REPLY_MAX_ANY = Math.max(...Object.values(REPLY_LIMITS).map((l) => l.max));
var CALL_HEARTBEAT_MS = 10 * 60 * 1e3;
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
var RETENTION_DAYS = {
  /** Call audio in the private media bucket. The transcript and the summary stay with the call (api/cron/calls). */
  call_recordings: 90,
  /** The evidence kinds on the events ledger (EVENT_EVIDENCE_KINDS); every other kind is the record and is kept (purge_events, 00115). */
  events_evidence: 30,
  /** Assistant threads untouched for this long, with their messages (purge_ask, 00040). */
  ask_threads: 90,
  /** The bell's rows and their marks (purge_notifications, 00057). */
  notifications: 90,
  /** The sweeps' run history; a clock that fires every few minutes keeps a day (purge_cron_history, 00099). */
  cron_history: 14,
  /** A found lead nobody worked (no contact, no export, no person): set aside, then its details removed (purge_leads, 00140). */
  leads_untouched: 90,
  leads_untouched_blanked: 180,
  /** A place a search left out: its details removed, while the count of what was left out stays (purge_leads, 00140). */
  leads_excluded_blanked: 30
};
var RECORDING_RETENTION_DAYS = RETENTION_DAYS.call_recordings;
var RECORDING_PURGED_WORDS = `Recording removed after ${RECORDING_RETENTION_DAYS} days; the transcript is kept`;
var PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;
function feedUrlOk(raw) {
  if (!raw) return null;
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (PRIVATE_HOST.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return null;
  return u.toString();
}
function feedProblemWords(reason, status) {
  switch (reason) {
    case "address":
      return "The calendar feed needs to be a full https:// or webcal:// address on the internet.";
    case "unreachable":
      return "The calendar could not be reached. Check the address and try again.";
    case "http":
      return `The calendar answered ${status ?? "an error"}. It is usually the private iCal address, not the calendar's web page.`;
    case "too_large":
      return "That feed is too large to read (over 2 MB).";
    case "not_ical":
      return "That address is not an iCal feed. In Google Calendar it is Settings \u203A your calendar \u203A Secret address in iCal format.";
    default:
      return null;
  }
}
var POLICY_CLASS_WORDS = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: { name: "Service & pricing questions", short: "Questions", note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone" },
  booking: { name: "Book \xB7 reschedule", short: "Bookings", note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone" },
  reengage: { name: "Re-engage quiet customers", short: "Re-engage", note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  campaign: { name: "Standing offers", short: "Offers", note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  reviews: { name: "Google reviews", short: "Reviews", note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you" },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" }
};
var PolicyLimitsSchema = z3.object({
  max_replies_day: z3.number().int().min(1).max(200).optional(),
  pause_hours: z3.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: z3.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: z3.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: z3.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME = z3.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema = z3.object({ open: TIME, close: TIME });
var HoursSchema = z3.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME.nullable().optional(),
  close: TIME.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: z3.array(IntervalSchema).optional()
}).strict();
var DATE = z3.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema = z3.object({
  date: DATE,
  until: DATE.optional(),
  note: z3.string().max(200).optional()
});
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema = z3.object({
  name: z3.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: z3.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: z3.string().max(120).optional()
}).strict();
var GuardrailsSchema = z3.object({
  never_quote_prices: z3.boolean().optional(),
  never_confirm_booking: z3.boolean().optional(),
  disclose_ai: z3.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: z3.boolean().optional()
}).strict();
var NoteSchema = z3.object({
  title: z3.string().min(1).max(80),
  text: z3.string().min(1).max(1200)
}).strict();
var BookingRulesSchema = z3.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: z3.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: z3.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: z3.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: z3.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: z3.array(z3.string().min(1).max(80)).max(20).optional(),
  party_max: z3.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: z3.array(z3.string().min(1).max(200)).max(10).optional()
}).strict();
var E164 = /^\+[1-9]\d{6,14}$/;
var INSTRUCTIONS_MAX = 2e4;
var BusinessProfileSchema = z3.object({
  address: z3.string().max(300).optional(),
  hours: z3.partialRecord(z3.enum(DAYS), HoursSchema).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: z3.array(ClosureSchema).optional(),
  services: z3.array(ServiceSchema).max(60).optional(),
  languages: z3.array(z3.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: z3.array(z3.string().min(1).max(200)).max(20).optional(),
  tone: z3.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: z3.string().regex(E164, "E.164, like +16469325775").optional(),
  website: z3.string().url().max(500).optional(),
  notes: z3.array(NoteSchema).max(10).optional(),
  booking_rules: BookingRulesSchema.optional(),
  /**
   * Anything the owner wants said that no field covers.
   *
   * The escape hatch that keeps this model honest — without it, structuring
   * the facts would mean losing whatever did not fit, and the first migration
   * would be a downgrade.
   *
   * It holds what the prompt it grew out of holds (INSTRUCTIONS_MAX), because
   * the form carries that prompt into it.
   */
  extra_instructions: z3.string().max(INSTRUCTIONS_MAX).optional()
}).strict();
var BrainConfigSchema = z3.object({
  business_name: z3.string().min(1).max(120),
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
  phone_display: z3.string().min(3).max(40).optional(),
  booking_link: z3.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: z3.string().min(40).max(INSTRUCTIONS_MAX),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema.optional(),
  fallbacks: z3.object({
    /** Sent when no model key is configured. */
    greeting: z3.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: z3.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: z3.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema = z3.object({
  escalation_emails: z3.array(z3.string().email()).min(1).max(10),
  from: z3.string().max(200).optional()
}).strict();
var CalendarConfigSchema = z3.object({
  ical_url: z3.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema = z3.object({ vision: z3.boolean().optional() }).strict();
var TenantConfigSchema = z3.object({
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
      code: z3.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z3.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z3.ZodIssueCode.custom,
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
      code: z3.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate(c.until)) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema = TenantConfigSchema.superRefine((cfg, ctx) => {
  if (cfg.calendar && !feedUrlOk(cfg.calendar.ical_url)) {
    ctx.addIssue({ code: z3.ZodIssueCode.custom, path: ["calendar", "ical_url"], message: feedProblemWords("address") ?? "Not an address the receptionist may read." });
  }
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure(c, n, ctx));
});
var SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var LIVE_STALE_MS = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS = 10 * 60 * 1e3;
var PERSON_MODE_LABELS = { auto: "Answer", ask: "Ask me first", never: "Never" };
var PERSON_MODE_WORDS = { ...PERSON_MODE_LABELS, inherit: "Follow the workspace" };
var DAY_MS3 = 864e5;
var WEEK_MS2 = 7 * DAY_MS3;
var MONTH_MS = 30 * DAY_MS3;
var NEW_WINDOW_MS = 7 * DAY_MS3;
var QUIET_AFTER_MS = 30 * DAY_MS3;
var REPLY_VIA = { whatsapp: "WhatsApp", sms: "Text", email: "Email" };
var PERSON_CHANNEL_WORDS = { whatsapp: "WhatsApp", sms: "Text", voice: "Phone", email: "Email" };
var PERSON_CAME_FROM_WORDS = {
  whatsapp: REPLY_VIA.whatsapp,
  sms: REPLY_VIA.sms,
  email: REPLY_VIA.email,
  call: PERSON_CHANNEL_WORDS.voice,
  calendar: "Your calendar",
  manual: "Added by hand",
  import: "Imported history",
  lead: "A lead you found"
};
var DAY_MS4 = 24 * 3600 * 1e3;
var DAY_MS5 = 864e5;
var QUIET_AFTER_MS2 = 7 * DAY_MS5;
var DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var CHANNEL_KIND_WORDS = {
  whatsapp: "WhatsApp",
  voice: "Phone line",
  sms: "Texting",
  email: "Email",
  instagram: "Instagram"
};
var KIND_META = {
  whatsapp: { name: `${CHANNEL_KIND_WORDS.whatsapp} Business`, what: "Customers text this number; the receptionist answers", icon: "chat", noun: "message" },
  voice: { name: CHANNEL_KIND_WORDS.voice, what: "Customers call this number; the receptionist picks up", icon: "phone", noun: "call" },
  sms: { name: CHANNEL_KIND_WORDS.sms, what: "Text messages", icon: "chat", noun: "message" },
  email: { name: CHANNEL_KIND_WORDS.email, what: "Email", icon: "mail", noun: "email" },
  instagram: { name: CHANNEL_KIND_WORDS.instagram, what: "Direct messages", icon: "instagram", noun: "message" }
};
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
var AskFinishSchema = z4.object({
  answer: z4.string().catch("").transform((s) => clip(1500)(cleanAnswer(s))),
  citations: z4.array(
    z4.object({
      kind: z4.enum(ASK_CITATION_KINDS).catch("page"),
      id: z4.string().catch("").transform(clip(200)),
      label: z4.string().catch("").transform(clip(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS.citations)),
  followups: z4.array(z4.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS.followups).map((s) => s.slice(0, 90))),
  navigate: z4.object({ to: z4.string().catch(""), label: z4.string().catch(""), now: z4.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: z4.enum(ASK_LANGUAGES).catch("other")
});
var ASK_UNDO_MS = 10 * 6e4;
var AskProposalOutcomeSchema = z4.object({
  state: z4.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z4.string().max(300).catch(""),
  atMs: z4.number().catch(0),
  undo: z4.record(z4.string(), z4.unknown()).nullable().optional()
});
var AskSettingsChangeSchema = z4.discriminatedUnion("op", [
  z4.object({ op: z4.literal("add_closure"), date: z4.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z4.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z4.string().max(200).optional() }),
  z4.object({ op: z4.literal("set_hours"), day: z4.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z4.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z4.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z4.object({ op: z4.literal("add_note"), title: z4.string().min(1).max(80), text: z4.string().min(1).max(1200) }),
  z4.object({ op: z4.literal("add_service"), name: z4.string().min(1).max(80), duration_min: z4.number().int().min(1).max(1440).optional() })
]);
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
var REPLY_WINDOW_HOURS = 72;
var REPLY_WINDOW_MS = REPLY_WINDOW_HOURS * 36e5;
var REPLY_WINDOW_WORDS = `within ${REPLY_WINDOW_HOURS / 24} days`;
var LIMIT_TIERS = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
var DAY_MS6 = 864e5;
var PLAYBOOK_HOURS = { min: 9, max: 20 };
var SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00\u2013${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`
};
var PLAYBOOK_BREATH_MS = 7 * DAY_MS6;
var PLAYBOOK_VETO_DELAY_MS = 30 * 6e4;
var PLAYBOOK_CLASS_LABEL = {
  reengage: POLICY_CLASS_WORDS.reengage.short,
  campaign: POLICY_CLASS_WORDS.campaign.short,
  booking: POLICY_CLASS_WORDS.booking.short
};
var DATE_FMT2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WHEN2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var FORWARDING_TEST_WINDOW_MS = 30 * 6e4;
var REVIEW_AUTO_REPLY_MAX_AGE_MS = 14 * 864e5;
var REVIEW_NEWS_MS = 36 * 3600 * 1e3;
var REVIEW_NEWS_MAX_AGE_MS = 14 * 864e5;
var BOOTSTRAP_MS = 3600 * 1e3;
function ratingWords(rating) {
  return typeof rating === "number" && Number.isFinite(rating) ? `${rating.toFixed(1)} \u2605` : "no rating yet";
}
function starsOf(rating) {
  const n = typeof rating === "number" && Number.isFinite(rating) ? Math.max(0, Math.min(5, Math.round(rating))) : 0;
  return "\u2605".repeat(n) + "\u2606".repeat(5 - n);
}
function reviewSnippet(body, max = 90) {
  const t = (body ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}\u2026` : t;
}
var DATE_FMT3 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS3 = 7 * 864e5;
var DATE_FMT4 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
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
var REGISTRATION_COST_WORDS = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second.`
};
var PROVISIONING_DEADLINE_MS = 5 * 6e4;
var SOLE_PROP_CEILING_SENTENCE = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE}`;
var SIGNUP_NAME_MIN = 2;
var SIGNUP_NAME_MAX = 120;
var SignupSchema = z5.object({
  name: z5.string().trim().min(SIGNUP_NAME_MIN, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX, "That name is too long \u2014 120 characters at most."),
  email: z5.string().trim().toLowerCase().email("Enter a work email address.").max(254),
  /**
   * The credential, and the reason it is OPTIONAL here rather than required.
   *
   * The waitlist posture takes details and creates nothing -- no account, so
   * no password -- and its form shows no such field. A schema that demanded
   * one would refuse the queue, which is the posture a launch actually runs
   * in. So the shape admits it and the CREATING path insists on it: the
   * route calls `passwordProblem` the moment it knows the posture is not the
   * list, and that one function is also what the page checks with, so the
   * browser's rule and the server's rule cannot drift.
   *
   * The cap here is a body-size guard, not the rule; the rule is bytes.
   */
  password: z5.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z5.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z5.string().trim().max(80).optional()
}).strict();
var PendingWorkspaceSchema = z5.object({
  name: z5.string().trim().min(SIGNUP_NAME_MIN).max(SIGNUP_NAME_MAX),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z5.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone(v) ? v : null)
});
function isTimezone(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}
var CONSENT_PHRASE = OFFERS_OPT_IN_PHRASES.en;
var CONSENT_PHRASE_ES = OFFERS_OPT_IN_PHRASES.es;
var LEAD_MAX_PLACES = 1e3;
var LEAD_QUESTION_WAIT_MS = 24 * 36e5;
var US_STATES = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY"
};
var US_CODES = new Set(Object.values(US_STATES));
var KEY = /^[a-z][a-z0-9_]{0,39}$/;
var stripUnsafe = (s) => s.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ");
var words = (min, max) => z6.string().transform((s) => stripUnsafe(s).trim()).pipe(z6.string().min(min).max(max));
var LeadSearchPlanSchema = z6.object({
  version: z6.number().int().min(1),
  card: z6.literal("local_businesses"),
  name: words(2, 80),
  asked: words(1, 400),
  terms: z6.array(words(2, 60)).min(1).max(5),
  area: z6.object({
    kind: z6.enum(["zip", "city", "radius"]),
    label: words(2, 80),
    state: z6.string().regex(/^[A-Z]{2}$/),
    center: z6.object({ lat: z6.number().min(-90).max(90), lng: z6.number().min(-180).max(180) }).nullable(),
    radius_m: z6.number().int().min(500).max(2e5),
    zip: z6.string().regex(/^\d{5}$/).optional(),
    query: words(2, 120)
  }),
  count: z6.number().int().min(1).max(LEAD_MAX_PLACES),
  contact: z6.enum(["phone", "email"]),
  criteria: z6.array(z6.object({ key: z6.string().regex(KEY), text: words(2, 120), standard: z6.enum(["likely", "seen"]), required: z6.boolean() })).max(8),
  exclusions: z6.array(z6.object({ key: z6.string().regex(KEY), text: words(2, 80), origin: z6.enum(["claude", "you_said"]), category_key: z6.string().regex(KEY).optional() })).max(8)
}).superRefine((p, ctx) => {
  const keys = [...p.criteria.map((c) => c.key), ...p.exclusions.map((e) => e.key)];
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "every criterion and exclusion has a key of its own", path: ["criteria"] });
  const lowerTerms = p.terms.map((t) => t.toLowerCase());
  if (new Set(lowerTerms).size !== lowerTerms.length) ctx.addIssue({ code: "custom", message: "the terms are not the same phrase twice", path: ["terms"] });
  if (p.area.kind === "radius" && p.area.center === null) ctx.addIssue({ code: "custom", message: "a radius needs a center", path: ["area", "center"] });
  if (p.area.kind === "zip" && !p.area.zip) ctx.addIssue({ code: "custom", message: "a ZIP ask needs a zip code (A2 derives its center from the ZCTA table)", path: ["area", "zip"] });
  if (!US_CODES.has(p.area.state)) ctx.addIssue({ code: "custom", message: "state is not a real US state or DC", path: ["area", "state"] });
});
var ACTIVITY_KINDS = [...DECISION_VERBS, ...EVENT_KINDS];
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
var PASSWORD_MIN = 12;
var PASSWORD_WORDS = {
  label: "Password",
  chooseLabel: "Choose a password",
  newLabel: "New password",
  hint: `At least ${PASSWORD_MIN} characters. A long phrase beats a short puzzle.`,
  wrong: "That email and password don't match an account.",
  wrongNudge: "If you started with Google, use Continue with Google.",
  codeInstead: "Email me a code instead",
  passwordInstead: "Use your password instead",
  forgot: "Forgot your password?",
  /* ------------------------------------------------------------ the reset */
  resetTitle: "Reset your password",
  resetLead: "We'll send a 6-digit code to your work email. Enter it with the password you want.",
  resetSent: (email) => `If ${email} can receive email, a 6-digit code is on its way. Enter it below with your new password.`,
  resetSubmit: "Set my password",
  resetDone: "Your password is set \u2014 signing you in.",
  /**
   * A recovery code that did not verify. The address is already implied here
   * (they typed it on the previous step), so this may say what is wrong.
   */
  resetBadCode: "That code didn't match or has expired \u2014 ask for a new one.",
  backToSignIn: "Back to sign-in"
};
var JUDGE_FACT_KEYS = ["name", "category", "city", "state", "host", "rating", "reviews", "emails", "phone_matches_site"];
var JUDGE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    places: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "integer" },
          criteria: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                answer: { type: "string", enum: ["pass", "fail", "unknown"] },
                facts: { type: "array", items: { type: "string", enum: [...JUDGE_FACT_KEYS] } }
              },
              required: ["key", "answer", "facts"],
              additionalProperties: false
            }
          },
          email_index: { anyOf: [{ type: "integer" }, { type: "null" }] },
          reason: { type: "string" }
        },
        required: ["ref", "criteria", "email_index", "reason"],
        additionalProperties: false
      }
    }
  },
  required: ["places"],
  additionalProperties: false
};
var AnswerSchema = z7.object({
  places: z7.array(z7.object({
    ref: z7.number().int(),
    criteria: z7.array(z7.object({ key: z7.string(), answer: z7.enum(["pass", "fail", "unknown"]), facts: z7.array(z7.string()) })),
    email_index: z7.number().int().nullable(),
    reason: z7.string()
  }))
});
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);

// src/whatsapp.ts
var GRAPH = "https://graph.facebook.com/v25.0";
function chosenReply(m) {
  if (m.button) {
    const label = m.button.text ?? m.button.payload ?? "";
    const id = m.button.payload ?? "";
    return label || id ? { label, id } : null;
  }
  const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
  if (r) {
    const label = r.title ?? "";
    const id = r.id ?? "";
    return label || id ? { label, id } : null;
  }
  return null;
}
function normalizeInbound(m, value) {
  const list = value.contacts || [];
  const contact = list.find((c) => c.wa_id === m.from) ?? (list.length === 1 ? list[0] : void 0);
  const mediaSrc = m.image || m.audio || m.video || m.document || m.sticker || null;
  const chosen = chosenReply(m);
  const typed = m.type === "text" && !!m.text?.body;
  const isText = typed || !!chosen;
  const loc = m.location;
  const cards = m.contacts?.length ? m.contacts : null;
  const kind = isText ? "text" : m.type === "reaction" && m.reaction ? "reaction" : loc && (loc.latitude != null || loc.address || loc.name) ? "location" : cards ? "contacts" : m.type === "system" ? "system" : mediaSrc?.id ? "media" : "unsupported";
  const describeLocation = () => {
    const where = [loc?.name, loc?.address].filter(Boolean).join(", ");
    const coords = loc?.latitude != null && loc?.longitude != null ? `${loc.latitude}, ${loc.longitude}` : null;
    return `Shared a location${where ? `: ${where}` : ""}${coords ? ` (${coords})` : ""}`;
  };
  const describeCards = () => {
    const names = (cards ?? []).map((c) => c.name?.formatted_name || c.phones?.[0]?.phone).filter(Boolean);
    return `Shared a contact card${names.length ? `: ${names.join(", ")}` : ""}`;
  };
  const body = typed ? m.text.body : chosen ? chosen.label || chosen.id : kind === "reaction" ? m.reaction?.emoji ?? null : kind === "location" ? describeLocation() : kind === "contacts" ? describeCards() : kind === "system" ? m.system?.body ?? null : null;
  const consentText = [body, chosen?.id].filter((s) => !!s);
  const matches = (re) => consentText.some((s) => re.test(s));
  return {
    waId: contact?.wa_id || m.from,
    phoneDigits: m.from,
    profileName: contact?.profile?.name || null,
    messageId: m.id,
    // Reactions, locations, contact cards and system notices all carry words
    // rather than bytes, so they are stored as text — messages.type has no
    // column for them and needs none. `kind` is what routing consults.
    type: isText || body !== null && kind !== "media" ? "text" : "media",
    kind,
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
    optOut: isText && matches(OPT_OUT_PATTERN),
    // WHICH yes, and only that one. START, UNSTOP, RESUME and ALTA answer the
    // appointment question; YES OFFERS answers the offers question and nothing
    // else. It used to answer both -- "texting OFFERS is also a way back in from
    // a STOP" -- which is one opt-in enrolling a person in two programs: the
    // thing the carriers refuse a campaign for (30913), and the message flow had
    // to confess it in the field the refusal named. The way back in from a STOP
    // is START, as the carriers' own reply to a STOP says.
    optIn: isText && matches(CONVERSATION_OPT_IN_PATTERN),
    optInMarketing: isText && matches(MARKETING_OPT_IN_PATTERN)
  };
}
var SEND_TIMEOUT_MS = 15e3;
async function postGraph(cfg, payload) {
  try {
    const r = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    });
    const out = await r.json().catch(() => ({}));
    return {
      ok: r.ok,
      wamid: out.messages?.[0]?.id ?? null,
      status: r.status,
      errorBody: r.ok ? void 0 : JSON.stringify(out).slice(0, 200)
    };
  } catch (e) {
    return { ok: false, wamid: null, status: 0, errorBody: e instanceof Error ? e.message : String(e) };
  }
}
async function sendText(cfg, to, body) {
  return postGraph(cfg, { messaging_product: "whatsapp", to, type: "text", text: { body } });
}
async function sendTemplate(cfg, to, template) {
  return postGraph(cfg, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components: template.params.length ? [{ type: "body", parameters: template.params.map((t) => ({ type: "text", text: t })) }] : []
    }
  });
}
var MEDIA_META_TIMEOUT_MS = 8e3;
var MEDIA_BYTES_TIMEOUT_MS = 15e3;
var MEDIA_MAX_BYTES = 25 * 1024 * 1024;
async function fetchMediaBytes(cfg, providerMediaId) {
  try {
    const metaRes = await fetch(`${GRAPH}/${providerMediaId}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(MEDIA_META_TIMEOUT_MS)
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json().catch(() => ({}));
    if (!meta.url) return null;
    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(MEDIA_BYTES_TIMEOUT_MS)
    });
    if (!binRes.ok) return null;
    const declared = Number(binRes.headers.get("content-length") ?? "0");
    if (declared > MEDIA_MAX_BYTES) {
      console.error("media_too_large", providerMediaId, declared);
      return null;
    }
    const bytes = await binRes.arrayBuffer();
    if (bytes.byteLength > MEDIA_MAX_BYTES) {
      console.error("media_too_large_after_read", providerMediaId, bytes.byteLength);
      return null;
    }
    return { bytes, mime: meta.mime_type ?? binRes.headers.get("content-type") };
  } catch (e) {
    console.error("media_fetch_failed", providerMediaId, e instanceof Error ? `${e.name}: ${e.message}` : e);
    return null;
  }
}

// src/voice-retell.ts
import crypto2 from "crypto";
var API = "https://api.retellai.com";
var E1642 = /^\+[1-9]\d{6,14}$/;
function plainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function toStatus(s) {
  switch (s) {
    case "registered":
      return "registered";
    case "ongoing":
      return "ongoing";
    case "error":
      return "error";
    case "not_connected":
      return "not_connected";
    default:
      return "ended";
  }
}
function liveTurns(items) {
  if (!items?.length) return null;
  const spoken = items.filter((t) => t.role === "agent" || t.role === "user" || t.role === "injected");
  if (!spoken.length) return null;
  return spoken.map(({ role, content, words: words2 }) => ({ role, content: content ?? "", ...words2 ? { words: words2 } : {} }));
}
function parseTranscriptText(text) {
  if (!text) return null;
  const turns = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^(Agent|User):\s*(.*)$/.exec(line);
    if (!m) {
      if (turns.length) turns[turns.length - 1].content += ` ${line}`;
      continue;
    }
    turns.push({ role: m[1] === "Agent" ? "agent" : "user", content: m[2] });
  }
  return turns.length ? turns : null;
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
    fromE164: from && E1642.test(from) ? from : null,
    fromRaw: from,
    toE164: c.to_number && E1642.test(c.to_number) ? c.to_number : null,
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
    transcriptObject: c.transcript_object ?? liveTurns(c.transcript_with_tool_calls),
    recordingUrl: c.recording_url ?? null,
    publicLogUrl: c.public_log_url ?? null,
    cost: c.call_cost ?? null,
    latency: c.latency ?? null,
    analysis: plainObject(analysis.custom_analysis_data)
  };
}
function callSummaryLine(n) {
  const mins = n.durationMs ? Math.max(1, Math.round(n.durationMs / 6e4)) : null;
  const head = n.direction === "inbound" ? "Inbound call" : "Outbound call";
  const dur = mins ? ` \xB7 ${mins} min` : "";
  const wanted = typeof n.analysis?.caller_wanted === "string" ? n.analysis.caller_wanted.trim() : "";
  const outcome = wanted ? callOutcomeWords(n.analysis?.outcome) : null;
  const body = wanted || n.summary?.trim() || (n.inVoicemail ? "Reached voicemail." : "No summary available.");
  return `${head}${dur} \u2014 ${body}${outcome ? ` (${outcome.toLowerCase()})` : ""}`;
}
async function listCalls(cfg, opts) {
  const limit = Math.min(opts.limit ?? 100, 1e3);
  const body = {
    limit,
    sort_order: opts.ascending ? "ascending" : "descending",
    filter_criteria: { agent: [{ agent_id: opts.agentId }] },
    // documented nested shape
    ...opts.paginationKey ? { pagination_key: opts.paginationKey } : {},
    ...opts.includeTotal ? { include_total: true } : {}
  };
  const r = await fetch(`${API}/v3/list-calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`list-calls ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const out = await r.json();
  const calls = out.items ?? [];
  return {
    calls,
    nextKey: out.has_more ? out.pagination_key ?? null : null,
    total: typeof out.total === "number" ? out.total : null
  };
}
async function getCall(cfg, callId) {
  const r = await fetch(`${API}/v2/get-call/${callId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` }
  });
  if (!r.ok) return null;
  return await r.json();
}
async function getAgent(cfg, agentId) {
  const r = await fetch(`${API}/get-agent/${agentId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` }
  });
  if (!r.ok) return null;
  const a = await r.json();
  const str4 = (k) => typeof a[k] === "string" ? a[k] : null;
  const num2 = (k) => typeof a[k] === "number" ? a[k] : null;
  const bool = (k) => typeof a[k] === "boolean" ? a[k] : null;
  const engine = a.response_engine ?? {};
  return {
    agent_id: str4("agent_id") ?? agentId,
    agent_name: str4("agent_name"),
    version: num2("version"),
    is_published: bool("is_published"),
    llm_id: engine.type === "retell-llm" && typeof engine.llm_id === "string" ? engine.llm_id : null,
    llm_version: typeof engine.version === "number" ? engine.version : null,
    // The URL only, never its query string: Retell lets a secret ride there
    // (?key=...) and this object is meant to be printed by a diagnostic. That
    // a key rides there at all is kept as a fact, so the planner can retire it.
    webhook_url: str4("webhook_url")?.split("?")[0] ?? null,
    webhook_url_keyed: /[?&]key=/.test(str4("webhook_url") ?? ""),
    webhook_events: Array.isArray(a.webhook_events) ? a.webhook_events.map(String) : null,
    webhook_timeout_ms: num2("webhook_timeout_ms"),
    data_storage_setting: str4("data_storage_setting"),
    data_storage_retention_days: num2("data_storage_retention_days"),
    opt_in_signed_url: bool("opt_in_signed_url"),
    post_call_analysis_data: Array.isArray(a.post_call_analysis_data) ? a.post_call_analysis_data : null
  };
}
async function getAgentRaw(cfg, agentId) {
  const r = await fetch(`${API}/get-agent/${agentId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(8e3)
  });
  if (!r.ok) return null;
  const a = await r.json();
  return a !== null && typeof a === "object" && !Array.isArray(a) ? a : null;
}
async function writeRetell(cfg, method, path, payload) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8e3)
  });
  const text = await r.text();
  let body = null;
  try {
    const parsed2 = JSON.parse(text);
    body = parsed2 !== null && typeof parsed2 === "object" ? parsed2 : null;
  } catch {
    body = text ? { text: text.slice(0, 300) } : null;
  }
  return { ok: r.ok, status: r.status, body };
}
function createAgentVersion(cfg, agentId, baseVersion) {
  return writeRetell(cfg, "POST", `/create-agent-version/${agentId}`, { base_version: baseVersion });
}
function updateAgent(cfg, agentId, patch) {
  return writeRetell(cfg, "PATCH", `/update-agent/${agentId}`, patch);
}
function publishAgentVersion(cfg, agentId, version, title) {
  return writeRetell(cfg, "POST", `/publish-agent-version/${agentId}`, { version, version_title: title });
}
function createRetellLlm(cfg, body) {
  return writeRetell(cfg, "POST", "/create-retell-llm", body);
}
function createAgent(cfg, body) {
  return writeRetell(cfg, "POST", "/create-agent", body);
}
function createPhoneNumber(cfg, body) {
  return writeRetell(cfg, "POST", "/create-phone-number", body);
}
function importPhoneNumber(cfg, body) {
  return writeRetell(cfg, "POST", "/import-phone-number", body);
}
function updatePhoneNumber(cfg, number, patch) {
  return writeRetell(cfg, "PATCH", `/update-phone-number/${encodeURIComponent(number)}`, patch);
}
async function getPhoneNumber(cfg, number) {
  const r = await fetch(`${API}/get-phone-number/${encodeURIComponent(number)}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(8e3)
  });
  if (!r.ok) return null;
  const n = await r.json();
  return n !== null && typeof n === "object" && !Array.isArray(n) ? n : null;
}
async function updateLiveCall(cfg, callId, control) {
  const r = await fetch(`${API}/v2/update-live-call/${encodeURIComponent(callId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...control.variables ? { fields_to_override: { override_dynamic_variables: control.variables } } : {},
      call_control: {
        additional_context: control.additionalContext,
        ...control.triggerResponse !== void 0 ? { trigger_response: control.triggerResponse } : {}
      }
    }),
    signal: AbortSignal.timeout(8e3)
  });
  return { ok: r.ok, status: r.status };
}
async function stopCall(cfg, callId) {
  const r = await fetch(`${API}/v2/stop-call/${encodeURIComponent(callId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(8e3)
  });
  return { ok: r.ok, status: r.status };
}
async function getRetellLlm(cfg, llmId, version) {
  const q = version === void 0 || version === null ? "" : `?version=${version}`;
  const r = await fetch(`${API}/get-retell-llm/${llmId}${q}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` }
  });
  if (!r.ok) return null;
  const l = await r.json();
  const str4 = (k) => typeof l[k] === "string" ? l[k] : null;
  return {
    llm_id: str4("llm_id") ?? llmId,
    version: typeof l.version === "number" ? l.version : null,
    model: str4("model"),
    model_temperature: typeof l.model_temperature === "number" ? l.model_temperature : null,
    general_prompt: str4("general_prompt"),
    begin_message: str4("begin_message"),
    default_dynamic_variables: l.default_dynamic_variables && typeof l.default_dynamic_variables === "object" ? l.default_dynamic_variables : null,
    general_tools: Array.isArray(l.general_tools) ? l.general_tools : null,
    knowledge_base_ids: Array.isArray(l.knowledge_base_ids) ? l.knowledge_base_ids.map(String) : null
  };
}
function needsHydration(c) {
  return !c.transcript && !c.transcript_object;
}
async function fetchRecording(url, opts = {}) {
  const signal = opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : void 0;
  const r = await fetch(url, signal ? { signal } : void 0);
  if (!r.ok) return { ok: false, status: r.status };
  return { ok: true, bytes: await r.arrayBuffer(), mime: r.headers.get("content-type") };
}
function verifyRetellSignature(rawBody, header, apiKey) {
  if (!header || !apiKey) return false;
  const m = /v=(\d+),d=([0-9a-f]+)/i.exec(String(header));
  if (!m) return false;
  const [, ts, digest] = m;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1e3) return false;
  const expected = crypto2.createHmac("sha256", apiKey).update(rawBody + ts).digest("hex");
  const a = Buffer.from(digest.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto2.timingSafeEqual(a, b);
}

// src/voice-shell.ts
var VOICE_SHELL_PROMPT = "{{business_facts}}\n\nWho you are speaking with:\n{{caller_context}}";
var VOICE_SHELL_BEGIN = "{{greeting}}";
var HANDOFF_VAR = "{{handoff_number}}";
var FACTS_UNAVAILABLE = "The business's details could not be loaded for this call. Do not state opening hours, prices, services or an address from memory \u2014 you do not have them. Say you will have someone confirm, offer to take a message, and offer to text the booking link.";
var CALLER_UNKNOWN = "New caller - no prior interactions on record.";
function greetingFor(name) {
  const who = name ? ` ${name}` : "";
  return `Thank you for calling${who}! This call may be recorded. I'm the automated assistant \u2014 how can I help you today?`;
}
var GREETING_DEFAULT = greetingFor(null);
var DEFAULT_FN_URL = "https://chanlytics-messaging.vercel.app/api/retell-fn";
function availabilityUrl(fnUrl) {
  return /\/api\/retell-fn$/.test(fnUrl) ? fnUrl.replace(/\/api\/retell-fn$/, "/api/retell-availability") : `${fnUrl}-availability`;
}
function voiceShellTools(fnUrl = DEFAULT_FN_URL, bookingHeaders) {
  return [
    {
      type: "end_call",
      name: "end_call",
      description: "End the call once the conversation is complete and the caller has said goodbye."
    },
    {
      type: "transfer_call",
      name: "transfer_to_staff",
      description: "Transfer the caller to a person on the business's own line. Use during opening hours when the caller asks for a person, has a complaint, or needs something the facts do not cover.",
      // A dynamic variable, filled per call from the workspace's profile. An
      // E.164 number typed here would be a fact kept in a second place.
      transfer_destination: { type: "predefined", number: HANDOFF_VAR },
      transfer_option: {
        type: "warm_transfer",
        show_transferee_as_caller: true,
        on_hold_music: "relaxing_sound"
      }
    },
    {
      type: "custom",
      name: "send_booking_link",
      description: "Text the booking link to the caller's WhatsApp. Use when the caller wants to book. It goes to the number they are calling from unless another number is given.",
      url: fnUrl,
      method: "POST",
      speak_during_execution: true,
      execution_message_description: "Say you are sending the booking link to their WhatsApp now.",
      speak_after_execution: true,
      ...bookingHeaders ? { headers: bookingHeaders } : {},
      // No `required` list: the provider drops an empty one on save, and the
      // plan would then see a difference that is not there.
      parameters: {
        type: "object",
        properties: {
          phone_number: {
            type: "string",
            description: "Alternate number to send the link to, digits only with country code. Omit to use the caller's number."
          }
        }
      }
    },
    {
      type: "custom",
      name: "check_availability",
      description: "Check which appointment times are open right now. Use when the caller asks when they could come in, or before offering a time. Returns the open windows; offer up to three that fit, then send the booking link. Never confirm a slot yourself.",
      url: availabilityUrl(fnUrl),
      method: "POST",
      speak_during_execution: true,
      execution_message_description: "Say you are checking the calendar.",
      speak_after_execution: true,
      ...bookingHeaders ? { headers: bookingHeaders } : {},
      parameters: {
        type: "object",
        properties: {
          day: {
            type: "string",
            description: "A day the caller asked about, as YYYY-MM-DD or a weekday name. Omit for the next few days."
          },
          service: {
            type: "string",
            description: "The service they want, so only windows long enough for it are offered. Omit if unknown."
          }
        }
      }
    }
  ];
}
function desiredVoiceShell(fnUrl = DEFAULT_FN_URL, bookingHeaders) {
  return {
    general_prompt: VOICE_SHELL_PROMPT,
    begin_message: VOICE_SHELL_BEGIN,
    default_dynamic_variables: {
      business_facts: FACTS_UNAVAILABLE,
      caller_context: CALLER_UNKNOWN,
      greeting: GREETING_DEFAULT,
      // Empty on purpose: with no line to reach, the transfer tool has
      // nowhere to dial and the composed facts tell the agent to take a
      // message instead of transferring.
      handoff_number: ""
    },
    general_tools: voiceShellTools(fnUrl, bookingHeaders)
  };
}
var norm = (s) => (s ?? "").replace(/\r\n/g, "\n").trim();
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
function subsetEqual(live, desired) {
  if (Array.isArray(desired)) return stableJson(live) === stableJson(desired);
  if (desired && typeof desired === "object") {
    if (!live || typeof live !== "object" || Array.isArray(live)) return false;
    return Object.entries(desired).every(
      ([k, v]) => subsetEqual(live[k], v)
    );
  }
  return stableJson(live) === stableJson(desired);
}
function planVoiceConvergence(live, desired) {
  const drift = [];
  const patch = {};
  if (norm(live.general_prompt) !== norm(desired.general_prompt)) {
    const has = (v) => norm(live.general_prompt).includes(v);
    drift.push(
      `general_prompt differs (${norm(live.general_prompt).length} chars live; reads {{business_facts}}: ${has("{{business_facts}}")}, {{caller_context}}: ${has("{{caller_context}}")})`
    );
    patch.general_prompt = desired.general_prompt;
  }
  if (norm(live.begin_message) !== norm(desired.begin_message)) {
    drift.push(`begin_message is typed in (${JSON.stringify(norm(live.begin_message).slice(0, 60))}\u2026), not ${desired.begin_message}`);
    patch.begin_message = desired.begin_message;
  }
  const liveDefaults = live.default_dynamic_variables ?? {};
  const missingDefaults = Object.keys(desired.default_dynamic_variables).filter(
    (k) => liveDefaults[k] !== desired.default_dynamic_variables[k]
  );
  if (missingDefaults.length) {
    drift.push(`default_dynamic_variables missing or different: ${missingDefaults.join(", ")}`);
    patch.default_dynamic_variables = { ...liveDefaults, ...desired.default_dynamic_variables };
  }
  const liveTools = live.general_tools ?? [];
  const byName = new Map(liveTools.map((t) => [t.name, t]));
  let toolsDiffer = false;
  for (const want of desired.general_tools) {
    const have = byName.get(want.name);
    if (!have) {
      drift.push(`tool ${want.name} is missing`);
      toolsDiffer = true;
      continue;
    }
    if (!subsetEqual(have, want)) {
      const what = want.name === "transfer_to_staff" ? ` (live destination: ${JSON.stringify(have.transfer_destination?.number ?? "?")}, option: ${JSON.stringify(have.transfer_option?.type ?? "?")})` : "";
      drift.push(`tool ${want.name} differs${what}`);
      toolsDiffer = true;
    }
  }
  const unknownTools = liveTools.map((t) => t.name).filter((n) => !desired.general_tools.some((t) => t.name === n));
  if (unknownTools.length) drift.push(`live tools the shell does not define (an apply would drop them): ${unknownTools.join(", ")}`);
  if (toolsDiffer) patch.general_tools = desired.general_tools;
  return { drift, llmPatch: Object.keys(patch).length ? patch : null, unknownTools };
}
function voiceShellDrift(live) {
  const booking = (live.general_tools ?? []).find((t) => t.name === "send_booking_link");
  const url = typeof booking?.url === "string" ? booking.url : DEFAULT_FN_URL;
  const headers2 = booking?.headers ?? null;
  const plan = planVoiceConvergence(live, desiredVoiceShell(url, headers2));
  const drift = [...plan.drift];
  if (booking && !headers2) drift.push("send_booking_link has no x-fn-secret header \u2014 the edge will refuse it");
  return { converged: drift.length === 0, drift };
}
var VOICE_WEBHOOK_EVENTS = ["call_started", "call_ended", "call_analyzed", "transcript_updated"];
var VOICE_WEBHOOK_TIMEOUT_MS = 2e4;
var RETELL_DEFAULT_EVENTS = ["call_started", "call_ended", "call_analyzed"];
var CALL_ANALYSIS_FIELDS = [
  {
    type: "string",
    name: "caller_wanted",
    description: "What the caller wanted, in one short sentence in plain words, the way the business owner would say it. Start with the request itself, never with 'The user' or 'The caller'. Leave empty if they asked for nothing.",
    examples: ["Asked whether Saturday at 10 is free.", "Wanted Tuesday's hours and a price.", "Moved Friday's appointment to next week."]
  },
  {
    type: "enum",
    name: "outcome",
    description: "How the call ended for the caller. answered: their question was answered. booking_link_sent: the receptionist sent them the booking link. callback_needed: a person at the business has to call them back or follow up. voicemail: the call reached voicemail. no_request: they hung up, tested the line or asked for nothing. other: none of these.",
    choices: [...CALL_OUTCOMES]
  },
  {
    type: "string",
    name: "follow_up",
    description: "What a person at the business should do next for this caller, in one short sentence. Leave empty when nothing is needed.",
    examples: ["Call back to confirm a Saturday 10:00 gel manicure.", "Text the price list for highlights."]
  },
  {
    type: "string",
    name: "caller_name",
    description: "The caller's name exactly as they gave it. Leave empty if they did not say one.",
    examples: ["Ana", "Daniela R."]
  }
];
function sameAnalysisField(live, want) {
  const w = want;
  return live.name === w.name && live.type === w.type && live.description === w.description && JSON.stringify(live.choices ?? null) === JSON.stringify(w.choices ?? null) && JSON.stringify(live.examples ?? null) === JSON.stringify(w.examples ?? null);
}
function planAgentSettings(live, opts = {}) {
  const drift = [];
  const patch = {};
  const events = live.webhook_events ?? RETELL_DEFAULT_EVENTS;
  const missing = VOICE_WEBHOOK_EVENTS.filter((e) => !events.includes(e));
  if (missing.length) {
    drift.push(`webhook_events missing ${missing.join(", ")} (the live transcript needs transcript_updated)`);
    patch.webhook_events = [.../* @__PURE__ */ new Set([...events, ...VOICE_WEBHOOK_EVENTS])];
  }
  const timeout = live.webhook_timeout_ms ?? 1e4;
  if (timeout < VOICE_WEBHOOK_TIMEOUT_MS) {
    drift.push(`webhook_timeout_ms is ${timeout}; the recording copy needs ${VOICE_WEBHOOK_TIMEOUT_MS}`);
    patch.webhook_timeout_ms = VOICE_WEBHOOK_TIMEOUT_MS;
  }
  if (live.opt_in_signed_url !== true) {
    drift.push("recording URLs are public and permanent (opt_in_signed_url off); the pipeline copies audio within seconds and refetches a fresh link when it must");
    patch.opt_in_signed_url = true;
  }
  const liveFields = Array.isArray(live.post_call_analysis_data) ? live.post_call_analysis_data.filter((f) => f !== null && typeof f === "object") : [];
  const missingFields = CALL_ANALYSIS_FIELDS.filter((f) => !liveFields.some((l) => sameAnalysisField(l, f)));
  if (missingFields.length) {
    drift.push(`post_call_analysis_data lacks ${missingFields.map((f) => f.name).join(", ")} (the strip, the profile and the call card read what the caller wanted)`);
    patch.post_call_analysis_data = [
      ...liveFields.filter((l) => !CALL_ANALYSIS_FIELDS.some((f) => f.name === l.name)),
      ...CALL_ANALYSIS_FIELDS.map((f) => ({ ...f }))
    ];
  }
  if (typeof live.webhook_url === "string" && live.webhook_url !== "" && (live.webhook_url_keyed === true || /[?&]key=/.test(live.webhook_url))) {
    drift.push("webhook_url still carries the retired query-string key; the signature is the credential and the door no longer reads one");
    patch.webhook_url = live.webhook_url.split("?")[0];
  }
  if (opts.retentionDays !== void 0 && live.data_storage_retention_days !== opts.retentionDays) {
    if (!Number.isInteger(opts.retentionDays) || opts.retentionDays < 1 || opts.retentionDays > 730) {
      drift.push(`retention must be a whole number of days from 1 to 730, not ${opts.retentionDays}`);
    } else {
      drift.push(`data_storage_retention_days is ${live.data_storage_retention_days ?? "unset (kept forever)"}; asked for ${opts.retentionDays}`);
      patch.data_storage_retention_days = opts.retentionDays;
    }
  }
  return { drift, agentPatch: Object.keys(patch).length ? patch : null };
}
function agentSettingsDrift(live) {
  const plan = planAgentSettings(live);
  return { converged: plan.drift.length === 0, drift: plan.drift };
}

// src/voice-provision.ts
var VOICE_LLM_DEFAULTS = {
  model: "claude-4.5-haiku",
  model_temperature: 0,
  start_speaker: "agent"
};
var VOICE_AGENT_DEFAULTS = {
  voice_id: "minimax-Tamsin",
  language: ["en-US", "es-ES", "fr-FR", "de-DE", "hi-IN", "ru-RU", "pt-PT", "ja-JP", "it-IT", "nl-NL"],
  end_call_after_silence_ms: 3e4,
  max_call_duration_ms: 36e5,
  data_storage_setting: "everything",
  data_storage_retention_days: 90,
  post_call_analysis_model: "gpt-4.1",
  allow_user_dtmf: true
};
var VOICE_NUMBER_DEFAULTS = {
  country_code: "US",
  number_provider: "twilio"
};
function voiceEndpoints(fnUrl = DEFAULT_FN_URL) {
  const base = fnUrl.replace(/\/api\/retell-fn$/, "");
  return {
    fn: fnUrl,
    availability: availabilityUrl(fnUrl),
    webhook: `${base}/api/retell-webhook`,
    inbound: `${base}/api/retell-inbound`
  };
}
function withKey(url, secret) {
  return `${url}?key=${encodeURIComponent(secret)}`;
}
function stripKey(url) {
  return typeof url === "string" ? url.split("?")[0] : null;
}
function voiceLlmCreateBody(s, fnUrl = DEFAULT_FN_URL) {
  return { ...VOICE_LLM_DEFAULTS, ...desiredVoiceShell(fnUrl, { "x-fn-secret": s.fnSecret }) };
}
function voiceAgentCreateBody(o, s, fnUrl = DEFAULT_FN_URL) {
  return {
    agent_name: o.agentName,
    response_engine: { type: "retell-llm", llm_id: o.llmId, ...o.llmVersion === null ? {} : { version: o.llmVersion } },
    ...VOICE_AGENT_DEFAULTS,
    language: [...VOICE_AGENT_DEFAULTS.language],
    webhook_url: voiceEndpoints(fnUrl).webhook,
    webhook_events: [...VOICE_WEBHOOK_EVENTS],
    webhook_timeout_ms: VOICE_WEBHOOK_TIMEOUT_MS,
    opt_in_signed_url: true,
    post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f }))
  };
}
function voiceNumberBinding(o) {
  return [{ agent_id: o.agentId, ...o.pinned ? { agent_version: "latest_published" } : {}, weight: 1 }];
}
function voiceNumberCreateBody(o, s, fnUrl = DEFAULT_FN_URL) {
  return {
    ...VOICE_NUMBER_DEFAULTS,
    area_code: o.areaCode,
    nickname: o.nickname,
    inbound_agents: voiceNumberBinding(o),
    inbound_webhook_url: withKey(voiceEndpoints(fnUrl).inbound, s.fnSecret)
  };
}
function voiceNumberBindBody(o, s, fnUrl = DEFAULT_FN_URL) {
  return {
    nickname: o.nickname,
    inbound_agents: voiceNumberBinding(o),
    inbound_webhook_url: withKey(voiceEndpoints(fnUrl).inbound, s.fnSecret)
  };
}
var E1643 = /^\+[1-9]\d{6,14}$/;
function planVoiceProvision(st) {
  const errors = [];
  const r = st.request;
  const number = r.number ?? null;
  const area = r.areaCode ?? null;
  if (number !== null && !E1643.test(number)) errors.push("number must be E.164, like +13055550100");
  if (area !== null && !(Number.isInteger(area) && area >= 200 && area <= 999)) errors.push("area_code must be three digits, like 305");
  if (number !== null && area !== null) errors.push("give a number to bind or an area code to buy in, not both");
  if (r.llmId && !/^llm_[a-z0-9]+$/i.test(r.llmId)) errors.push("llm_id does not look like a Retell LLM id");
  if (r.agentId && !/^agent_[a-z0-9]+$/i.test(r.agentId)) errors.push("agent_id does not look like a Retell agent id");
  const names = { agent: `${st.tenant.name} front desk`, nickname: `${st.tenant.name} \xB7 Chanlytics` };
  if (errors.length) return { ok: false, errors, nothing: true, reason: null, steps: [], names };
  if (st.channel) {
    const on = st.channel.status === "active";
    return {
      ok: true,
      errors,
      nothing: true,
      reason: on ? `already answering on ${st.channel.number ?? "its number"} (agent ${st.channel.agentId}); voice-converge keeps it on the shell` : `a voice line exists but is ${st.channel.status} (agent ${st.channel.agentId}); switch it on in Connections rather than provisioning another`,
      steps: [],
      names
    };
  }
  const steps = [];
  if (r.agentId) {
    steps.push({ id: "llm", action: "skip", detail: "the adopted agent brings its own LLM" });
    steps.push({ id: "agent", action: "adopt", detail: `${r.agentId}, read from the provider first` });
  } else {
    steps.push(
      r.llmId ? { id: "llm", action: "reuse", detail: `${r.llmId}, read from the provider first` } : { id: "llm", action: "create", detail: `the shell: placeholders, the four tools, spoken defaults; ${VOICE_LLM_DEFAULTS.model} at temperature ${VOICE_LLM_DEFAULTS.model_temperature}` }
    );
    steps.push({
      id: "agent",
      action: "create",
      detail: `"${names.agent}": the product's voice, the webhook with its events, the analysis fields, ${VOICE_AGENT_DEFAULTS.data_storage_retention_days}-day retention`
    });
  }
  steps.push({ id: "publish", action: "publish", detail: "the first version, so the number can pin to latest_published" });
  if (number) steps.push({ id: "number", action: "bind", detail: `${number} \u2192 the agent, pinned to latest_published, inbound webhook set` });
  else if (area !== null) steps.push({ id: "number", action: "buy", detail: `a local number in area code ${area} from Retell (Twilio), bound and pinned, inbound webhook set` });
  else steps.push({ id: "number", action: "skip", detail: "no number asked for \u2014 give number (an existing Retell number) or area_code (buy one); the row is not written until a number answers" });
  if (number || area !== null) {
    steps.push({ id: "channel", action: "insert", detail: "tenant_channels: kind voice, the agent as external_id, the number, active" });
    steps.push({ id: "notify", action: "notify", detail: "the workspace's bell says the line is ready; a voice.provisioned event" });
  }
  return { ok: true, errors, nothing: false, reason: null, steps, names };
}

// src/lines.ts
var RETELL_ORIGINATION = "sip:sip.retellai.com";
var LINE_COSTS = {
  local_number_month_usd: 1.15,
  toll_free_month_usd: 2.15
};
function chooseLineProvider(env) {
  if (env.sid && env.token) return "twilio";
  if (env.dryRun === "1" && env.vercelEnv !== "production") return "dry";
  return null;
}
function trunkDomain(lineId) {
  return `chanlytics-${lineId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase()}.pstn.twilio.com`;
}
function sipUsername(lineId) {
  return `line-${lineId.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase()}`;
}
var LOWER = "abcdefghijkmnpqrstuvwxyz";
var UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
var DIGIT = "23456789";
function sipPassword(random = Math.random) {
  const pick = (s) => s[Math.floor(random() * s.length)];
  const all = LOWER + UPPER + DIGIT;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT)];
  while (chars.length < 24) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
function isValidSipPassword(p) {
  return p.length >= 12 && /\d/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p);
}
var E1644 = /^\+[1-9]\d{6,14}$/;
var isE164 = (s) => typeof s === "string" && E1644.test(s);
var isAreaCode = (n) => typeof n === "number" && Number.isInteger(n) && n >= 200 && n <= 999;

// src/lines-twilio.ts
var API2 = "https://api.twilio.com/2010-04-01";
var TRUNKING = "https://trunking.twilio.com/v1";
var MESSAGING = "https://messaging.twilio.com/v1";
var twilioUrls = {
  subaccounts: `${API2}/Accounts.json`,
  availableLocal: (sid2, country = "US") => `${API2}/Accounts/${sid2}/AvailablePhoneNumbers/${country}/Local.json`,
  incomingNumbers: (sid2) => `${API2}/Accounts/${sid2}/IncomingPhoneNumbers.json`,
  incomingNumber: (sid2, numberSid) => `${API2}/Accounts/${sid2}/IncomingPhoneNumbers/${numberSid}.json`,
  credentialLists: (sid2) => `${API2}/Accounts/${sid2}/SIP/CredentialLists.json`,
  credentials: (sid2, listSid) => `${API2}/Accounts/${sid2}/SIP/CredentialLists/${listSid}/Credentials.json`,
  trunks: `${TRUNKING}/Trunks`,
  trunk: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}`,
  trunkCredentialLists: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}/CredentialLists`,
  trunkOriginationUrls: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}/OriginationUrls`,
  trunkPhoneNumbers: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}/PhoneNumbers`,
  messagingServices: `${MESSAGING}/Services`,
  serviceNumbers: (serviceSid) => `${MESSAGING}/Services/${serviceSid}/PhoneNumbers`,
  messages: (sid2) => `${API2}/Accounts/${sid2}/Messages.json`
};
var TwilioError = class extends Error {
  status;
  code;
  constructor(status, body, what) {
    const code = typeof body?.code === "number" ? body.code : null;
    const msg = typeof body?.message === "string" ? body.message : `HTTP ${status}`;
    super(`${what}: ${msg}${code ? ` (Twilio ${code})` : ""}`);
    this.name = "TwilioError";
    this.status = status;
    this.code = code;
  }
};
var fetchTwilio = async (acct, method, url, form2) => {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${acct.sid}:${acct.token}`).toString("base64")}`,
      ...form2 ? { "Content-Type": "application/x-www-form-urlencoded" } : {}
    },
    body: form2 ? new URLSearchParams(form2).toString() : void 0,
    signal: AbortSignal.timeout(15e3)
  });
  const text = await r.text();
  let body = null;
  try {
    const parsed2 = JSON.parse(text);
    body = parsed2 !== null && typeof parsed2 === "object" ? parsed2 : null;
  } catch {
    body = text ? { text: text.slice(0, 300) } : null;
  }
  return { status: r.status, body };
};
var str = (o, k) => typeof o?.[k] === "string" ? o[k] : null;
function need(a, what) {
  if (a.status < 200 || a.status >= 300 || !a.body) throw new TwilioError(a.status, a.body, what);
  return a.body;
}
function twilioProvider(http = fetchTwilio) {
  return {
    name: "twilio",
    async createSubaccount(master, friendlyName) {
      const b = need(await http(master, "POST", twilioUrls.subaccounts, { FriendlyName: friendlyName.slice(0, 64) }), "create subaccount");
      const sid2 = str(b, "sid");
      const token = str(b, "auth_token");
      if (!sid2 || !token) throw new TwilioError(200, b, "create subaccount answered without sid/auth_token");
      return { sid: sid2, token, status: str(b, "status") ?? "active" };
    },
    async searchLocal(acct, q) {
      const url = `${twilioUrls.availableLocal(acct.sid)}?${new URLSearchParams({
        AreaCode: String(q.areaCode),
        VoiceEnabled: "true",
        SmsEnabled: "true",
        PageSize: String(Math.min(Math.max(q.limit, 1), 30))
      }).toString()}`;
      const b = need(await http(acct, "GET", url), "search numbers");
      const rows = Array.isArray(b.available_phone_numbers) ? b.available_phone_numbers : [];
      return rows.map((n) => {
        const e164 = str(n, "phone_number");
        if (!e164) return null;
        const caps = n.capabilities ?? {};
        return {
          e164,
          friendly: str(n, "friendly_name") ?? e164,
          locality: str(n, "locality"),
          region: str(n, "region"),
          capabilities: { voice: caps.voice === true, sms: caps.sms === true, mms: caps.mms === true }
        };
      }).filter((n) => n !== null);
    },
    async buyNumber(acct, e164, friendlyName) {
      const b = need(await http(acct, "POST", twilioUrls.incomingNumbers(acct.sid), { PhoneNumber: e164, FriendlyName: friendlyName.slice(0, 64) }), "buy number");
      const sid2 = str(b, "sid");
      if (!sid2) throw new TwilioError(200, b, "buy number answered without a sid");
      return { sid: sid2, e164: str(b, "phone_number") ?? e164 };
    },
    // A number this subaccount already holds. Twilio filters IncomingPhoneNumbers by
    // exact E.164, so this is one GET and no guessing.
    //
    // A read that FAILS must not be reported as "we do not own it": that answer sends
    // the saga on to buy a second number. So a non-200 throws, and the step retries
    // rather than spending.
    async ownedNumber(acct, e164) {
      const a = await http(acct, "GET", `${twilioUrls.incomingNumbers(acct.sid)}?PhoneNumber=${encodeURIComponent(e164)}&PageSize=1`);
      if (a.status === 404) return null;
      const b = need(a, "list owned numbers");
      const list = Array.isArray(b.incoming_phone_numbers) ? b.incoming_phone_numbers : [];
      for (const row of list) {
        if (!row || typeof row !== "object") continue;
        const sid2 = str(row, "sid");
        if (sid2) return { sid: sid2, e164: str(row, "phone_number") ?? e164 };
      }
      return null;
    },
    async releaseNumber(acct, numberSid) {
      const a = await http(acct, "DELETE", twilioUrls.incomingNumber(acct.sid, numberSid));
      if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "release number");
    },
    async createTrunk(acct, o) {
      const b = need(await http(acct, "POST", twilioUrls.trunks, { FriendlyName: o.friendlyName.slice(0, 64), DomainName: o.domainName }), "create trunk");
      const sid2 = str(b, "sid");
      if (!sid2) throw new TwilioError(200, b, "create trunk answered without a sid");
      return { sid: sid2, domainName: str(b, "domain_name") ?? o.domainName };
    },
    async deleteTrunk(acct, trunkSid) {
      const a = await http(acct, "DELETE", twilioUrls.trunk(trunkSid));
      if (a.status !== 204 && a.status !== 404) throw new TwilioError(a.status, a.body, "delete trunk");
    },
    async createCredentialList(acct, friendlyName) {
      const b = need(await http(acct, "POST", twilioUrls.credentialLists(acct.sid), { FriendlyName: friendlyName.slice(0, 64) }), "create credential list");
      const sid2 = str(b, "sid");
      if (!sid2) throw new TwilioError(200, b, "create credential list answered without a sid");
      return { sid: sid2 };
    },
    async addCredential(acct, listSid, username, password) {
      const b = need(await http(acct, "POST", twilioUrls.credentials(acct.sid, listSid), { Username: username, Password: password }), "add credential");
      const sid2 = str(b, "sid");
      if (!sid2) throw new TwilioError(200, b, "add credential answered without a sid");
      return { sid: sid2 };
    },
    async attachCredentialList(acct, trunkSid, listSid) {
      need(await http(acct, "POST", twilioUrls.trunkCredentialLists(trunkSid), { CredentialListSid: listSid }), "attach credential list");
    },
    async addOrigination(acct, trunkSid, o) {
      const b = need(
        await http(acct, "POST", twilioUrls.trunkOriginationUrls(trunkSid), {
          SipUrl: o.sipUrl,
          FriendlyName: o.friendlyName.slice(0, 64),
          Weight: "10",
          Priority: "10",
          Enabled: "true"
        }),
        "add origination"
      );
      const sid2 = str(b, "sid");
      if (!sid2) throw new TwilioError(200, b, "add origination answered without a sid");
      return { sid: sid2 };
    },
    async attachNumber(acct, trunkSid, numberSid) {
      need(await http(acct, "POST", twilioUrls.trunkPhoneNumbers(trunkSid), { PhoneNumberSid: numberSid }), "attach number to trunk");
    },
    // Messaging Services API (verified 2026-09-07): the service's own inbound
    // URL wins over the number's; sticky sender and smart encoding on.
    async createMessagingService(acct, o) {
      const b = need(
        await http(acct, "POST", twilioUrls.messagingServices, {
          FriendlyName: o.friendlyName.slice(0, 64),
          InboundRequestUrl: o.inboundUrl,
          InboundMethod: "POST",
          UseInboundWebhookOnNumber: "false",
          StickySender: "true",
          SmartEncoding: "true"
        }),
        "create messaging service"
      );
      const sid2 = str(b, "sid");
      if (!sid2) throw new TwilioError(200, b, "create messaging service answered without a sid");
      return { sid: sid2 };
    },
    async addNumberToService(acct, serviceSid, numberSid) {
      const b = need(await http(acct, "POST", twilioUrls.serviceNumbers(serviceSid), { PhoneNumberSid: numberSid }), "add number to messaging service");
      const sid2 = str(b, "sid");
      if (!sid2) throw new TwilioError(200, b, "add number to messaging service answered without a sid");
      return { sid: sid2 };
    },
    async sendSms(acct, o) {
      const a = await http(acct, "POST", twilioUrls.messages(acct.sid), {
        MessagingServiceSid: o.serviceSid,
        To: o.to,
        Body: o.body,
        ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
      });
      const ok2 = a.status >= 200 && a.status < 300 && !!str(a.body, "sid");
      return { ok: ok2, sid: str(a.body, "sid"), status: a.status, code: typeof a.body?.code === "number" ? a.body.code : null };
    }
  };
}

// src/lines-dry.ts
var hex = (n, width = 32) => n.toString(16).padStart(width, "0");
function dryProvider(seed = 1) {
  let n = seed;
  const next = (prefix) => `${prefix}${hex(n++)}`;
  const calls = [];
  const owned = /* @__PURE__ */ new Map();
  const rec = (op, ...args) => calls.push({ op, args });
  const acctOf = (a) => a.sid;
  return {
    name: "dry",
    calls,
    owned,
    async createSubaccount(master, friendlyName) {
      rec("createSubaccount", acctOf(master), friendlyName);
      return { sid: next("AC"), token: next("tok"), status: "active" };
    },
    async searchLocal(acct, q) {
      rec("searchLocal", acctOf(acct), q);
      const out = [];
      for (let i = 0; i < Math.min(q.limit, 8); i++) {
        const local = `555${String(100 + i).padStart(4, "0")}`;
        out.push({
          e164: `+1${q.areaCode}${local}`,
          friendly: `(${q.areaCode}) ${local.slice(0, 3)}-${local.slice(3)}`,
          locality: "Dry Run",
          region: "XX",
          capabilities: { voice: true, sms: true, mms: false }
        });
      }
      return out;
    },
    async buyNumber(acct, e164, friendlyName) {
      rec("buyNumber", acctOf(acct), e164, friendlyName);
      const sid2 = next("PN");
      owned.set(sid2, e164);
      return { sid: sid2, e164 };
    },
    // The dry provider already keeps what it "sold", so it can answer honestly --
    // which is what makes the saga's lookup-before-buy testable without a carrier.
    async ownedNumber(acct, e164) {
      rec("ownedNumber", acctOf(acct), e164);
      for (const [sid2, held] of owned) if (held === e164) return { sid: sid2, e164 };
      return null;
    },
    async releaseNumber(acct, numberSid) {
      rec("releaseNumber", acctOf(acct), numberSid);
      owned.delete(numberSid);
    },
    async createTrunk(acct, o) {
      rec("createTrunk", acctOf(acct), o);
      return { sid: next("TK"), domainName: o.domainName };
    },
    async deleteTrunk(acct, trunkSid) {
      rec("deleteTrunk", acctOf(acct), trunkSid);
    },
    async createCredentialList(acct, friendlyName) {
      rec("createCredentialList", acctOf(acct), friendlyName);
      return { sid: next("CL") };
    },
    async addCredential(acct, listSid, username) {
      rec("addCredential", acctOf(acct), listSid, username);
      return { sid: next("CR") };
    },
    async attachCredentialList(acct, trunkSid, listSid) {
      rec("attachCredentialList", acctOf(acct), trunkSid, listSid);
    },
    async addOrigination(acct, trunkSid, o) {
      rec("addOrigination", acctOf(acct), trunkSid, o);
      return { sid: next("OU") };
    },
    async attachNumber(acct, trunkSid, numberSid) {
      rec("attachNumber", acctOf(acct), trunkSid, numberSid);
    },
    async createMessagingService(acct, o) {
      rec("createMessagingService", acctOf(acct), o);
      return { sid: next("MG") };
    },
    async addNumberToService(acct, serviceSid, numberSid) {
      rec("addNumberToService", acctOf(acct), serviceSid, numberSid);
      return { sid: next("PH") };
    },
    async sendSms(acct, o) {
      rec("sendSms", acctOf(acct), o.serviceSid, o.to);
      return { ok: true, sid: next("SM"), status: 201, code: null };
    }
  };
}

// src/lines-saga.ts
var LINE_STEPS = ["subaccount", "number", "trunk", "agent", "import", "messaging", "channel"];
function retellImportBody(o) {
  return {
    phone_number: o.e164,
    termination_uri: o.terminationUri,
    sip_trunk_auth_username: o.username,
    sip_trunk_auth_password: o.password,
    inbound_agents: [{ agent_id: o.agentId, ...o.pinned ? { agent_version: "latest_published" } : {}, weight: 1 }],
    nickname: o.nickname,
    inbound_webhook_url: o.inboundWebhookUrl
  };
}
function nextLineStep(line) {
  if (!line.subaccount_sid) return "subaccount";
  if (!line.number_sid) return "number";
  if (!line.trunk_sid || !line.credential_list_sid || !line.termination_uri || line.facts.trunk_ready !== true) return "trunk";
  if (!line.retell_agent_id) return "agent";
  if (line.facts.retell_imported !== true) return "import";
  if (!line.messaging_service_sid || line.facts.number_in_service !== true) return "messaging";
  if (typeof line.facts.channel_id !== "string" || typeof line.facts.sms_channel_id !== "string") return "channel";
  return null;
}
function errorWords(e) {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}
async function runLineSaga(start, ports) {
  let line = { ...start, facts: { ...start.facts ?? {} } };
  const save = async (patch) => {
    line = { ...line, ...patch, facts: patch.facts ? { ...patch.facts } : line.facts };
    await ports.store.save(patch);
  };
  const fact = async (k, v) => save({ facts: { ...line.facts, [k]: v } });
  if (line.voice_state === "answering" && nextLineStep(line) === null) return { ok: true, line };
  if (!line.e164) {
    await save({ voice_state: "failed", step: "number", last_error: "no number chosen", state_since: ports.now() });
    return { ok: false, step: "number", error: "no number chosen", line };
  }
  let secrets = await ports.store.getSecrets();
  const putSecrets = async (s) => {
    secrets = { ...secrets, ...s };
    await ports.store.putSecrets(s);
  };
  const sub = () => {
    if (!line.subaccount_sid || !secrets.auth_token) throw new Error("the subaccount's token is missing from the vault");
    return { sid: line.subaccount_sid, token: secrets.auth_token };
  };
  let step = nextLineStep(line);
  await save({ voice_state: "provisioning", step, last_error: null, state_since: ports.now() });
  try {
    while ((step = nextLineStep(line)) !== null) {
      await save({ step });
      switch (step) {
        case "subaccount": {
          const acct = await ports.provider.createSubaccount(ports.master, `${ports.tenant.name} \xB7 Chanlytics`);
          await putSecrets({ auth_token: acct.token });
          await save({ subaccount_sid: acct.sid });
          break;
        }
        case "number": {
          const held = await ports.provider.ownedNumber(sub(), line.e164);
          const bought = held ?? await ports.provider.buyNumber(sub(), line.e164, `${ports.tenant.name} \xB7 Chanlytics`);
          await save({ number_sid: bought.sid, e164: bought.e164 });
          break;
        }
        case "trunk": {
          const acct = sub();
          if (!line.trunk_sid) {
            const t = await ports.provider.createTrunk(acct, { friendlyName: `${ports.tenant.name} \xB7 Chanlytics`, domainName: trunkDomain(line.id) });
            await save({ trunk_sid: t.sid, termination_uri: t.domainName });
          }
          if (!line.credential_list_sid) {
            const cl = await ports.provider.createCredentialList(acct, `${ports.tenant.name} \xB7 Chanlytics`);
            await save({ credential_list_sid: cl.sid });
          }
          if (!secrets.sip_password || !secrets.sip_username) {
            const username = sipUsername(line.id);
            const password = sipPassword(ports.random);
            if (!isValidSipPassword(password)) throw new Error("generated SIP password failed Twilio's rule");
            await ports.provider.addCredential(acct, line.credential_list_sid, username, password);
            await putSecrets({ sip_username: username, sip_password: password });
          }
          if (line.facts.credential_list_attached !== true) {
            await ports.provider.attachCredentialList(acct, line.trunk_sid, line.credential_list_sid);
            await fact("credential_list_attached", true);
          }
          if (typeof line.facts.origination_sid !== "string") {
            const o = await ports.provider.addOrigination(acct, line.trunk_sid, { sipUrl: RETELL_ORIGINATION, friendlyName: "Retell" });
            await fact("origination_sid", o.sid);
          }
          if (line.facts.number_attached !== true) {
            await ports.provider.attachNumber(acct, line.trunk_sid, line.number_sid);
            await fact("number_attached", true);
          }
          await fact("trunk_ready", true);
          break;
        }
        case "agent": {
          const a = await ports.agent.ensure();
          await save({ retell_agent_id: a.agentId, facts: { ...line.facts, llm_id: a.llmId, agent_pinned: a.pinned } });
          break;
        }
        case "import": {
          if (!secrets.sip_username || !secrets.sip_password) throw new Error("the SIP credential is missing from the vault");
          const body = retellImportBody({
            e164: line.e164,
            terminationUri: line.termination_uri,
            username: secrets.sip_username,
            password: secrets.sip_password,
            agentId: line.retell_agent_id,
            pinned: line.facts.agent_pinned === true,
            nickname: ports.nickname,
            inboundWebhookUrl: ports.inboundWebhookUrl
          });
          const r = await ports.retell.importNumber(body);
          if (!r.ok) {
            const msg = typeof r.body?.message === "string" ? r.body.message : JSON.stringify(r.body ?? {}).slice(0, 200);
            throw new Error(`Retell import: HTTP ${r.status} ${msg}`);
          }
          await save({ facts: { ...line.facts, retell_imported: true, retell_number_type: typeof r.body?.phone_number_type === "string" ? r.body.phone_number_type : "custom" } });
          break;
        }
        case "messaging": {
          const acct = sub();
          if (!line.messaging_service_sid) {
            const svc = await ports.provider.createMessagingService(acct, { friendlyName: `${ports.tenant.name} \xB7 Chanlytics`, inboundUrl: ports.smsInboundUrl });
            await save({ messaging_service_sid: svc.sid });
          }
          if (line.facts.number_in_service !== true) {
            await ports.provider.addNumberToService(acct, line.messaging_service_sid, line.number_sid);
            await fact("number_in_service", true);
          }
          break;
        }
        case "channel": {
          if (typeof line.facts.channel_id !== "string") {
            const c = await ports.channel.ensure({ agentId: line.retell_agent_id, e164: line.e164, lineId: line.id });
            await fact("channel_id", c.channelId);
          }
          if (typeof line.facts.sms_channel_id !== "string") {
            const s = await ports.smsChannel.ensure({ e164: line.e164, lineId: line.id, serviceSid: line.messaging_service_sid });
            await fact("sms_channel_id", s.channelId);
          }
          break;
        }
      }
    }
    await save({ voice_state: "answering", step: null, last_error: null, state_since: ports.now() });
    return { ok: true, line };
  } catch (e) {
    const error = errorWords(e);
    const at = line.step ?? step ?? "subaccount";
    await save({ voice_state: "failed", step: at, last_error: error, state_since: ports.now() });
    return { ok: false, step: at, error, line };
  }
}

// src/sms.ts
function smsInboundFrom(form2) {
  const messageSid = form2.MessageSid || form2.SmsSid || "";
  const from = form2.From || "";
  const to = form2.To || "";
  if (!messageSid || !from || !to) return null;
  const numMedia = Math.max(0, Number.parseInt(form2.NumMedia || "0", 10) || 0);
  const mediaTypes = [];
  for (let i = 0; i < numMedia; i++) {
    const t = form2[`MediaContentType${i}`];
    if (t) mediaTypes.push(t);
  }
  const opt = (form2.OptOutType || "").toUpperCase();
  return {
    messageSid,
    from,
    to,
    body: form2.Body ?? "",
    numMedia,
    mediaTypes,
    optOutType: opt === "STOP" || opt === "START" || opt === "HELP" ? opt : null,
    messagingServiceSid: form2.MessagingServiceSid || null,
    accountSid: form2.AccountSid || null
  };
}
function smsAsWaMessage(s, nowMs = Date.now()) {
  const digits = s.from.replace(/[^\d]/g, "");
  const words2 = s.body.trim();
  const base = { from: digits, id: s.messageSid, timestamp: String(Math.floor(nowMs / 1e3)) };
  if (words2) return { ...base, type: "text", text: { body: s.numMedia > 0 ? `${words2} [with ${s.numMedia === 1 ? "a picture" : `${s.numMedia} pictures`}]` : words2 } };
  return { ...base, type: s.numMedia > 0 ? "image" : "unsupported" };
}
function carrierConsent(s) {
  if (s.optOutType === "STOP") return { optOut: true, optIn: false };
  if (s.optOutType === "START") return { optOut: false, optIn: true };
  return null;
}
function smsKeywordConsent(body) {
  if (!body || !SMS_OPT_OUT_PATTERN.test(body)) return null;
  return { optOut: true, optIn: false };
}
function mergeConsent(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { optOut: a.optOut || b.optOut, optIn: a.optIn || b.optIn };
}
function withCarrierConsent(n, c) {
  if (!c) return n;
  return { ...n, optOut: n.optOut || c.optOut, optIn: n.optIn || c.optIn };
}
var SMS_FOOTER = "Msg & data rates may apply. Reply STOP to opt out, HELP for help.";
var SMS_MAX_CHARS = 1600;
function smsBody(reply, isFirstReply) {
  const text = reply.trim();
  const withFooter = isFirstReply && !text.includes("STOP") ? `${text}
${SMS_FOOTER}` : text;
  return withFooter.length > SMS_MAX_CHARS ? `${withFooter.slice(0, SMS_MAX_CHARS - 1)}\u2026` : withFooter;
}
var SMS_HELD_REASON = "carriers";
var SMS_HELD_DETAILS = "This text arrived on your line before the carriers approved it for texting, so the receptionist did not answer. It is kept here; answer it yourself, or wait for the approval on Setup.";
function smsInboundUrl(fnUrl) {
  return `${fnUrl.replace(/\/api\/retell-fn$/, "")}/api/inbound-sms`;
}
function smsStatusUrl(fnUrl) {
  return `${fnUrl.replace(/\/api\/retell-fn$/, "")}/api/sms-status`;
}
function smsStatusFrom(form2) {
  const messageSid = form2.MessageSid || form2.SmsSid || "";
  const status = (form2.MessageStatus || form2.SmsStatus || "").toLowerCase();
  const from = form2.From || "";
  const to = form2.To || "";
  if (!messageSid || !status || !from || !to) return null;
  return {
    messageSid,
    status,
    errorCode: form2.ErrorCode ? String(form2.ErrorCode) : null,
    from,
    to,
    messagingServiceSid: form2.MessagingServiceSid || null,
    accountSid: form2.AccountSid || null
  };
}
function smsStatusToRow(status) {
  switch (status) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "undelivered":
    case "failed":
    case "canceled":
      return "failed";
    default:
      return null;
  }
}
function twilioSignedString(url, form2) {
  return url + Object.keys(form2).sort().map((k) => `${k}${form2[k]}`).join("");
}
var enc = new TextEncoder();
async function twilioSignature(authToken, url, form2) {
  const key = await crypto.subtle.importKey("raw", enc.encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(twilioSignedString(url, form2)));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}
function sameSignature(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyTwilioSignature(authToken, url, form2, header) {
  if (!header) return false;
  return sameSignature(await twilioSignature(authToken, url, form2), header);
}

// src/email.ts
function hostedAddress(localPart, domain) {
  return `${localPart}@${domain}`;
}
function replyRouteAddress(replyToken, domain) {
  return `r+${replyToken}@${domain}`;
}
function hostedIdentity(mailbox, domain) {
  return { fromName: mailbox.from_name, fromAddress: hostedAddress(mailbox.local_part, domain), replyTo: replyRouteAddress(mailbox.reply_token, domain) };
}
var oneLine = (s) => s.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
function mailboxHeader(name, address) {
  const clean = oneLine(name).replace(/["\\]/g, "");
  return clean ? `"${clean}" <${address}>` : address;
}
var REPLY_PREFIX = /^\s*(?:re|aw|sv|rv|antw)\s*:\s*/i;
var SUBJECT_MAX = 200;
function replySubject(parentSubject) {
  let s = oneLine(parentSubject ?? "");
  while (REPLY_PREFIX.test(s)) s = s.replace(REPLY_PREFIX, "");
  return `Re: ${s || "your message"}`.slice(0, SUBJECT_MAX);
}
var escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function emailHtml(text) {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n");
}
function messageIdHeader(id) {
  const s = oneLine(id ?? "");
  const bare = s.replace(/^<|>$/g, "");
  return /^[^\s<>@]+@[^\s<>@]+$/.test(bare) ? `<${bare}>` : null;
}
function referencesFor(parent) {
  const ids = [...parent.references, parent.rfcMessageId].map(messageIdHeader).filter((x) => x !== null);
  const unique = [...new Set(ids)];
  const MAX = 20;
  return unique.length <= MAX ? unique : [unique[0], ...unique.slice(unique.length - (MAX - 1))];
}
function buildEmailRequest(i) {
  const text = [i.body.trim(), i.signature?.trim()].filter(Boolean).join("\n\n");
  const inReplyTo = messageIdHeader(i.parent.rfcMessageId);
  const references = referencesFor(i.parent);
  const headers2 = {
    ...inReplyTo ? { "In-Reply-To": inReplyTo } : {},
    ...references.length ? { References: references.join(" ") } : {},
    ...i.actor === "ai" ? { "Auto-Submitted": "auto-replied" } : {}
  };
  return {
    from: mailboxHeader(i.identity.fromName, i.identity.fromAddress),
    to: [i.to],
    reply_to: [i.identity.replyTo],
    subject: replySubject(i.parent.subject),
    text,
    html: emailHtml(text),
    headers: headers2,
    tags: [{ name: "cl_message", value: i.messageId }, { name: "cl_tenant", value: i.tenantId }],
    idempotency_key: i.messageId
  };
}
function isEmailRequest(v) {
  if (!v || typeof v !== "object") return false;
  const r = v;
  const strings = (x) => Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string" && s.length > 0);
  return typeof r.from === "string" && strings(r.to) && strings(r.reply_to) && typeof r.subject === "string" && typeof r.text === "string" && typeof r.html === "string" && !!r.headers && typeof r.headers === "object" && Array.isArray(r.tags) && typeof r.idempotency_key === "string" && r.idempotency_key.length > 0;
}
var bytesOfBase64 = (s) => {
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out.buffer;
};
var base64OfBytes = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
var WEBHOOK_TOLERANCE_S = 300;
async function resendWebhookSignature(secret, id, timestamp, rawBody) {
  let keyBytes;
  try {
    keyBytes = bytesOfBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  } catch {
    return null;
  }
  const key = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64OfBytes(await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)));
}
async function verifyResendWebhook(secret, h, rawBody, nowMs) {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1e3 - ts) > WEBHOOK_TOLERANCE_S) return false;
  const expected = await resendWebhookSignature(secret, h.id, h.timestamp, rawBody);
  if (!expected) return false;
  return h.signature.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    return version === "v1" && !!sig && sameBytes(sig, expected);
  });
}
function platformRecipient(address, domain) {
  const a = address.trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at < 1 || a.slice(at + 1) !== domain.toLowerCase()) return null;
  const local = a.slice(0, at);
  const reply = /^r\+([a-z2-7]{24})$/.exec(local);
  if (reply) return { kind: "reply", token: reply[1] };
  return /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(local) && local !== "r" ? { kind: "mailbox", localPart: local } : null;
}
function addressOf(header) {
  const s = oneLine(header ?? "");
  if (!s) return null;
  const angle = /^(.*)<([^<>\s]+)>\s*$/.exec(s);
  const address = (angle ? angle[2] : s).trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return null;
  const name = angle ? angle[1].trim().replace(/^"(.*)"$/, "$1").trim() : "";
  return { address, name: name || null };
}
var stringsOf = (v) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter((x) => typeof x === "string" && x.length > 0);
var addressesOf = (v) => stringsOf(v).map((r) => addressOf(r)?.address).filter((a) => !!a);
function emailReceivedEventFrom(payload) {
  const p = payload;
  if (!p || p.type !== "email.received" || !p.data || typeof p.data !== "object") return null;
  const id = p.data.email_id ?? p.data.id;
  if (typeof id !== "string" || !id) return null;
  const envelope = addressesOf(p.data.received_for);
  const recipients = envelope.length ? envelope : [...addressesOf(p.data.to), ...addressesOf(p.data.cc), ...addressesOf(p.data.bcc)];
  return { type: "email.received", receivedId: id, recipients: [...new Set(recipients)] };
}
function headersOf(v) {
  const out = {};
  const put = (k, val) => {
    if (typeof k === "string" && typeof val === "string" && !(k.toLowerCase() in out)) out[k.toLowerCase()] = val;
  };
  if (Array.isArray(v)) for (const h of v) put(h?.name, h?.value);
  else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) put(k, Array.isArray(val) ? val[0] : val);
  return out;
}
function receivedEmailFrom(body) {
  const b = body;
  if (!b || typeof b !== "object" || typeof b.id !== "string") return null;
  const headers2 = headersOf(b.headers);
  const str4 = (v) => typeof v === "string" && v.length ? v : null;
  return {
    id: b.id,
    from: addressOf(str4(b.from) ?? headers2.from),
    to: addressesOf(b.to),
    cc: addressesOf(b.cc),
    subject: str4(b.subject) ?? str4(headers2.subject),
    text: str4(b.text),
    html: str4(b.html),
    headers: headers2,
    messageId: messageIdHeader(str4(b.message_id) ?? headers2["message-id"]),
    createdAt: str4(b.created_at),
    attachments: (Array.isArray(b.attachments) ? b.attachments : []).map((a) => {
      const x = a ?? {};
      return { filename: str4(x.filename), contentType: str4(x.content_type), size: typeof x.size === "number" ? x.size : null };
    })
  };
}
function messageIdsIn(header) {
  return (header ?? "").split(/\s+/).map(messageIdHeader).filter((x) => x !== null);
}
function classifyReceived(e) {
  const h = e.headers;
  const local = e.from?.address.split("@")[0] ?? "";
  if (/multipart\/report/i.test(h["content-type"] ?? "") || /^(mailer-daemon|postmaster)$/.test(local)) return "report";
  const auto = (h["auto-submitted"] ?? "").trim().toLowerCase();
  if (auto.startsWith("auto-replied") || "x-autoreply" in h || "x-autorespond" in h || /^auto[_-]?reply$/i.test((h.precedence ?? "").trim())) return "auto_reply";
  if (auto && auto !== "no" || /^(bulk|list|junk)$/i.test((h.precedence ?? "").trim()) || "list-id" in h || "list-unsubscribe" in h) return "automated";
  return "person";
}
var RECEIPT_TYPES = /* @__PURE__ */ new Set(["sent", "delivered", "delivery_delayed", "bounced", "complained", "failed", "suppressed"]);
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function tagOf(tags, name) {
  const v = Array.isArray(tags) ? tags.find((t) => t?.name === name)?.value : tags && typeof tags === "object" ? tags[name] : void 0;
  return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null;
}
function emailReceiptFrom(payload) {
  const p = payload;
  if (!p || typeof p.type !== "string" || !p.type.startsWith("email.") || !p.data || typeof p.data !== "object") return null;
  const type = p.type.slice("email.".length);
  if (!RECEIPT_TYPES.has(type)) return null;
  const d = p.data;
  if (typeof d.email_id !== "string" || !d.email_id) return null;
  const str4 = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
  const said = d.bounce ?? d.failed ?? d.suppressed ?? {};
  return {
    type,
    providerId: d.email_id,
    rfcMessageId: messageIdHeader(str4(d.message_id)),
    to: addressesOf(d.to),
    messageId: tagOf(d.tags, "cl_message"),
    tenantId: tagOf(d.tags, "cl_tenant"),
    detail: { kind: str4(said.type) ?? str4(said.reason), subKind: str4(said.subType), message: str4(said.message) }
  };
}
function emailReceiptEffect(r) {
  const error = { provider: r.type, kind: r.detail.kind, sub_kind: r.detail.subKind, message: r.detail.message };
  switch (r.type) {
    case "delivered":
      return { status: "delivered", error: null, suppress: null };
    case "bounced":
      return { status: "failed", error, suppress: /^permanent$/i.test(r.detail.kind ?? "") ? "hard_bounce" : null };
    case "failed":
      return { status: "failed", error, suppress: null };
    case "suppressed":
      return { status: "failed", error, suppress: "provider" };
    case "complained":
      return { status: null, error: null, suppress: "complaint" };
    default:
      return { status: null, error: null, suppress: null };
  }
}
function sendsAs(mailbox, domain) {
  return {
    address: hostedAddress(mailbox.local_part, domain),
    replyRoutes: [mailbox.reply_token, mailbox.reply_token_prev].filter((t) => !!t).map((t) => replyRouteAddress(t, domain))
  };
}
function requestLeavesAs(request, as) {
  return addressOf(request.from)?.address === as.address && request.reply_to.length === 1 && as.replyRoutes.includes(request.reply_to[0].trim().toLowerCase());
}
var capabilityOf = (v) => v === "enabled" || v === "disabled" ? v : "unknown";
function mailDomainsFrom(body) {
  const rows = body?.data;
  if (!Array.isArray(rows)) return null;
  const out = [];
  for (const r of rows) {
    const d = r ?? {};
    const caps = d.capabilities ?? {};
    if (typeof d.name !== "string" || !d.name) continue;
    out.push({
      name: d.name.trim().toLowerCase(),
      status: typeof d.status === "string" && d.status.trim() ? d.status.trim() : "unknown",
      sending: capabilityOf(caps.sending),
      receiving: capabilityOf(caps.receiving)
    });
  }
  return out;
}

// src/email-text.ts
import { convert } from "html-to-text";
function emailPlainText(e) {
  const text = (e.text ?? "").replace(/\r\n/g, "\n").trim();
  if (text) return text;
  if (!e.html) return null;
  const converted = convert(e.html, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } }
    ]
  }).replace(/\n{3,}/g, "\n\n").trim();
  return converted || null;
}

// src/email-resend.ts
var RESEND_EMAILS = "https://api.resend.com/emails";
var SEND_TIMEOUT_MS2 = 15e3;
async function sendEmail(cfg, request) {
  const { idempotency_key, ...body } = request;
  try {
    const r = await fetch(RESEND_EMAILS, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotency_key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS2)
    });
    const raw = await r.text().catch(() => "");
    if (r.ok) {
      const id = (() => {
        try {
          return JSON.parse(raw).id;
        } catch {
          return null;
        }
      })();
      return { ok: true, wamid: typeof id === "string" ? id : null, status: r.status };
    }
    return { ok: false, wamid: null, status: r.status, errorBody: raw.slice(0, 500) };
  } catch (e) {
    return { ok: false, wamid: null, status: 0, errorBody: e instanceof Error ? e.message : String(e) };
  }
}
var RESEND_RECEIVED = "https://api.resend.com/emails/receiving";
var FETCH_TIMEOUT_MS = 15e3;
async function fetchReceivedEmail(cfg, receivedId) {
  const r = await fetch(`${RESEND_RECEIVED}/${encodeURIComponent(receivedId)}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (r.status === 404) return null;
  const raw = await r.text();
  if (!r.ok) throw new Error(`resend: received email ${receivedId} answered ${r.status}: ${raw.slice(0, 200)}`);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`resend: received email ${receivedId} answered something that is not JSON`);
  }
  const email = receivedEmailFrom(body);
  if (!email) throw new Error(`resend: received email ${receivedId} answered a shape that is not an email`);
  return email;
}
var RESEND_DOMAINS = "https://api.resend.com/domains";
async function fetchMailDomains(cfg) {
  const r = await fetch(RESEND_DOMAINS, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`resend: domains answered ${r.status}: ${raw.slice(0, 200)}`);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("resend: domains answered something that is not JSON");
  }
  const domains = mailDomainsFrom(body);
  if (!domains) throw new Error("resend: domains answered a shape that is not a list of domains");
  return domains;
}

// src/a2p.ts
var A2P_POLICIES = {
  /** The bundle one customer of an ISV gets. */
  secondaryCustomerProfile: "RNdfbf3fae0e1107f8aded0e7cead80bf5",
  /** The messaging profile a brand is registered from. */
  a2pMessaging: "RNb0d4771c2c98518d916a3d4cd70a8f8b",
  /**
   * A customer with no tax id registers on a PAIR of these instead, and it is
   * a pair -- half of it was here for months and the other half was missing,
   * which is why the path was refused rather than built.
   *
   * Verified against the live Policies API on 2026-09-09, because filing
   * against the wrong policy produces a registration that is refused after it
   * has been paid for:
   *
   *   RN806dd6... "Starter Customer Profile of type Business"
   *   RN670d5d... "Sole Proprietor TrustProduct"
   */
  starterCustomerProfile: "RN806dd6cd175f314e1f96a9727ee271f4",
  soleProprietor: "RN670d5d2e282a6130ae063b234b6019c8"
};
var TRUSTHUB = "https://trusthub.twilio.com/v1";
var MESSAGING2 = "https://messaging.twilio.com/v1";
function brandTypeFor(r) {
  return registrationPathOf(r) === "sole_proprietor" ? "SOLE_PROPRIETOR" : "STANDARD";
}
function encodeForm(form2) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(form2)) {
    if (Array.isArray(v)) v.forEach((one) => q.append(k, one));
    else q.append(k, v);
  }
  return q.toString();
}
var attrs = (o) => JSON.stringify(o);
function customerProfileRequest(o) {
  return {
    url: `${TRUSTHUB}/CustomerProfiles`,
    method: "POST",
    form: {
      FriendlyName: o.friendlyName.slice(0, 64),
      // Twilio asks for the ISV's address here, not the customer's: we are
      // the one it writes to about the bundle.
      Email: o.email,
      PolicySid: A2P_POLICIES.secondaryCustomerProfile,
      ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
    }
  };
}
function starterProfileRequest(o) {
  return {
    url: `${TRUSTHUB}/CustomerProfiles`,
    method: "POST",
    form: {
      FriendlyName: o.friendlyName.slice(0, 64),
      Email: o.email,
      PolicySid: A2P_POLICIES.starterCustomerProfile,
      ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
    }
  };
}
function starterEndUserRequest(r) {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.contactFirstName} ${r.contactLastName}`.trim().slice(0, 64),
      Type: "starter_customer_profile_information",
      Attributes: attrs({
        first_name: r.contactFirstName,
        last_name: r.contactLastName,
        email: r.contactEmail,
        phone_number: r.contactPhone
      })
    }
  };
}
function soleProprietorProfileRequest(o) {
  return {
    url: `${TRUSTHUB}/TrustProducts`,
    method: "POST",
    form: {
      FriendlyName: o.friendlyName.slice(0, 64),
      Email: o.email,
      PolicySid: A2P_POLICIES.soleProprietor,
      ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
    }
  };
}
function soleProprietorEndUserRequest(r, industry) {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.tradeName || r.legalName} \xB7 sole proprietor`.slice(0, 64),
      Type: "sole_proprietor_information",
      Attributes: attrs({
        brand_name: r.tradeName || r.legalName,
        mobile_phone_number: r.contactPhone,
        vertical: industry
      })
    }
  };
}
function businessEndUserRequest(r) {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.legalName} \xB7 business`.slice(0, 64),
      Type: "customer_profile_business_information",
      Attributes: attrs({
        business_name: r.legalName,
        social_media_profile_urls: "",
        website_url: r.websiteUrl,
        business_regions_of_operation: "USA_AND_CANADA",
        business_type: businessTypeOf(r.businessType),
        business_registration_identifier: "EIN",
        business_identity: "direct_customer",
        business_industry: industryOf(r.industry),
        business_registration_number: r.ein ?? ""
      })
    }
  };
}
function representativeEndUserRequest(r) {
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${r.contactFirstName} ${r.contactLastName}`.slice(0, 64),
      Type: "authorized_representative_1",
      Attributes: attrs({
        job_position: r.contactJobPosition,
        last_name: r.contactLastName,
        phone_number: r.contactPhone,
        first_name: r.contactFirstName,
        email: r.contactEmail,
        business_title: r.contactTitle
      })
    }
  };
}
function addressRequest(accountSid, r) {
  return {
    url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Addresses.json`,
    method: "POST",
    form: {
      FriendlyName: r.legalName.slice(0, 64),
      CustomerName: r.legalName.slice(0, 64),
      Street: r.street,
      ...r.streetSecondary ? { StreetSecondary: r.streetSecondary } : {},
      City: r.city,
      Region: r.region,
      PostalCode: r.postalCode,
      IsoCountry: r.country
    }
  };
}
function supportingDocumentRequest(o) {
  return {
    url: `${TRUSTHUB}/SupportingDocuments`,
    method: "POST",
    form: {
      FriendlyName: `${o.legalName} \xB7 address`.slice(0, 64),
      Type: "customer_profile_address",
      Attributes: attrs({ address_sids: o.addressSid })
    }
  };
}
function updateEndUserRequest(sid2, attributes) {
  return { url: `${TRUSTHUB}/EndUsers/${sid2}`, method: "POST", form: { Attributes: attrs(attributes) } };
}
var parsed = (req) => JSON.parse(String(req.form?.Attributes ?? "{}"));
function businessAttributes(r) {
  return parsed(businessEndUserRequest(r));
}
function starterAttributes(r) {
  return parsed(starterEndUserRequest(r));
}
function representativeAttributes(r) {
  return parsed(representativeEndUserRequest(r));
}
function assignRequest(bundleSid, objectSid) {
  return { url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}/EntityAssignments`, method: "POST", form: { ObjectSid: objectSid } };
}
function trustProductAssignRequest(bundleSid, objectSid) {
  return { url: `${TRUSTHUB}/TrustProducts/${bundleSid}/EntityAssignments`, method: "POST", form: { ObjectSid: objectSid } };
}
function evaluateRequest(bundleSid, policySid = A2P_POLICIES.secondaryCustomerProfile) {
  return { url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}/Evaluations`, method: "POST", form: { PolicySid: policySid } };
}
function submitProfileRequest(bundleSid) {
  return { url: `${TRUSTHUB}/CustomerProfiles/${bundleSid}`, method: "POST", form: { Status: "pending-review" } };
}
function a2pProfileRequest(o) {
  return {
    url: `${TRUSTHUB}/TrustProducts`,
    method: "POST",
    form: {
      FriendlyName: `${o.friendlyName} \xB7 A2P`.slice(0, 64),
      Email: o.email,
      PolicySid: A2P_POLICIES.a2pMessaging,
      ...o.statusCallback ? { StatusCallback: o.statusCallback } : {}
    }
  };
}
function a2pProfileEndUserRequest(o) {
  const companyType = companyTypeOf(o.companyType);
  return {
    url: `${TRUSTHUB}/EndUsers`,
    method: "POST",
    form: {
      FriendlyName: `${o.friendlyName} \xB7 A2P`.slice(0, 64),
      Type: "us_a2p_messaging_profile_information",
      Attributes: attrs({ company_type: companyType })
    }
  };
}
function evaluateTrustProductRequest(bundleSid) {
  return { url: `${TRUSTHUB}/TrustProducts/${bundleSid}/Evaluations`, method: "POST", form: { PolicySid: A2P_POLICIES.a2pMessaging } };
}
function submitTrustProductRequest(bundleSid) {
  return { url: `${TRUSTHUB}/TrustProducts/${bundleSid}`, method: "POST", form: { Status: "pending-review" } };
}
function brandRequest(o) {
  return {
    url: `${MESSAGING2}/a2p/BrandRegistrations`,
    method: "POST",
    form: {
      CustomerProfileBundleSid: o.customerProfileBundleSid,
      A2PProfileBundleSid: o.a2pProfileBundleSid,
      BrandType: o.brandType,
      ...o.skipVetting ? { SkipAutomaticSecVet: "true" } : {},
      ...o.mock ? { Mock: "true" } : {}
    }
  };
}
function keywordsFor(words2) {
  return words2.map((w) => w.trim()).filter((w) => /^[A-Za-z0-9]+$/.test(w));
}
var LOW_VOLUME_USECASE = "LOW_VOLUME";
function campaignRequest(f) {
  const form2 = {
    BrandRegistrationSid: f.brandSid,
    Description: f.description,
    MessageFlow: f.messageFlow,
    UsAppToPersonUsecase: f.useCase,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    SubscriberOptIn: "true",
    AgeGated: "false",
    DirectLending: "false",
    OptInMessage: f.optInMessage,
    PrivacyPolicyUrl: f.privacyPolicyUrl,
    TermsAndConditionsUrl: f.termsUrl
  };
  form2.MessageSamples = f.samples.slice(0, 5);
  const keywords = keywordsFor(f.optInKeywords);
  if (keywords.length) form2.OptInKeywords = keywords;
  else delete form2.OptInMessage;
  return { url: `${MESSAGING2}/Services/${f.messagingServiceSid}/Compliance/Usa2p`, method: "POST", form: form2 };
}
function updateCampaignRequest(messagingServiceSid, campaignSid, f) {
  const form2 = {
    Description: f.description,
    MessageFlow: f.messageFlow,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    AgeGated: "false",
    DirectLending: "false",
    PrivacyPolicyUrl: f.privacyPolicyUrl,
    TermsAndConditionsUrl: f.termsUrl
  };
  form2.MessageSamples = f.samples.slice(0, 5);
  return { url: `${MESSAGING2}/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, method: "POST", form: form2 };
}
function deleteCampaignRequest(messagingServiceSid, campaignSid) {
  return { url: `${MESSAGING2}/Services/${messagingServiceSid}/Compliance/Usa2p/${campaignSid}`, method: "DELETE" };
}
var A2P_STEPS = ["profile", "business", "representative", "address", "document", "primary", "submit", "a2p_profile", "brand", "campaign"];
var EMPTY_A2P_STATE = {
  profileSid: null,
  businessSid: null,
  representativeSid: null,
  addressSid: null,
  documentSid: null,
  primaryAssigned: false,
  profileSubmitted: false,
  a2pProfileSid: null,
  brandSid: null,
  campaignSid: null
};
function nextA2PStep(s, brandType = "STANDARD") {
  if (brandType === "SOLE_PROPRIETOR") {
    if (!s.profileSid) return "profile";
    if (!s.businessSid) return "business";
    if (!s.addressSid) return "address";
    if (!s.documentSid) return "document";
    if (!s.primaryAssigned) return "primary";
    if (!s.profileSubmitted) return "submit";
    if (!s.a2pProfileSid) return "a2p_profile";
    if (!s.brandSid) return "brand";
    if (!s.campaignSid) return "campaign";
    return null;
  }
  if (!s.profileSid) return "profile";
  if (!s.businessSid) return "business";
  if (!s.representativeSid) return "representative";
  if (!s.addressSid) return "address";
  if (!s.documentSid) return "document";
  if (!s.primaryAssigned) return "primary";
  if (!s.profileSubmitted) return "submit";
  if (!s.a2pProfileSid) return "a2p_profile";
  if (!s.brandSid) return "brand";
  if (!s.campaignSid) return "campaign";
  return null;
}
function isBrandNotReady(error) {
  return /until Brand is registered|Brand.*Current status:\s*(IN_PROGRESS|PENDING)/i.test(error);
}
var PREAMBLE = /^the campaign submission has been reviewed and (?:it was )?rejected because\s*(?:of\s*)?/i;
function refusalWords(o) {
  const parts = [];
  const brand = (o.brandFailureReason ?? "").trim();
  if (brand) parts.push(brand);
  for (const e of o.campaignErrors ?? []) {
    const said = String(e?.description ?? "");
    const body = said.replace(PREAMBLE, "").trim().replace(/\.$/, "").trim();
    if (!body) continue;
    const tags = [e?.error_code == null ? null : String(e.error_code), ...e?.fields ?? []].filter(Boolean);
    parts.push(tags.length ? `${body} (${tags.join(" \xB7 ")})` : body);
  }
  if (!parts.length) return null;
  return parts.join("; ");
}
function smsStateFor(o) {
  const brand = (o.brandStatus ?? "").toUpperCase();
  const campaign = (o.campaignStatus ?? "").toUpperCase();
  if (brand === "FAILED" || campaign === "FAILED") return "rejected";
  if (brand === "SUSPENDED") return "failed";
  if (campaign === "VERIFIED") return o.mock ? "approved" : "active";
  if (brand === "APPROVED") return "approved";
  return "registering";
}
function registrationVerdict(before, after, o) {
  if (before === after) return null;
  const num2 = o.number ?? "your line";
  const rehearsal = o.mock ? " (this was a test filing, so nothing routes)" : "";
  if (after === "active") {
    return {
      kind: "number",
      title: `Texting is on: ${num2}`,
      body: `The carriers approved ${num2}, so the receptionist answers texts to it inside your hours${rehearsal}. Customers who text first are answered; offers go only to people who said yes.`,
      route: "admin/integrations",
      event: "line.texting_on"
    };
  }
  if (after === "approved") {
    return {
      kind: "number",
      title: "Your business is approved by the carriers",
      body: `${num2} is through the slow half. One last check on the line is left, usually days; nothing is needed from you, and texting switches itself on when it clears.`,
      route: "admin/integrations",
      event: "line.texting_approved"
    };
  }
  if (after === "rejected") {
    return {
      kind: "alert",
      title: "The carriers sent your texting registration back",
      body: `${o.reason ? `They said: ${o.reason}. ` : ""}Open Connections, correct your business on record, and file it again. Calls and WhatsApp are unaffected.`,
      route: "admin/integrations",
      event: "line.texting_rejected"
    };
  }
  if (after === "failed") {
    return {
      kind: "alert",
      title: "Your texting registration stopped",
      body: `${o.reason ? `The carriers said: ${o.reason}. ` : ""}A person at Chanlytics has it \u2014 there is nothing for you to do. Calls and WhatsApp are unaffected.`,
      route: "admin/integrations",
      event: "line.texting_rejected"
    };
  }
  return null;
}

// src/a2p-saga.ts
var sid = (a) => typeof a.body?.sid === "string" ? a.body.sid : null;
function refusal(a, what) {
  const msg = typeof a.body?.message === "string" ? a.body.message : `HTTP ${a.status}`;
  const code = typeof a.body?.code === "number" ? ` (Twilio ${a.body.code})` : "";
  return `${what}: ${msg}${code}`;
}
var ok = (a) => a.status >= 200 && a.status < 300;
async function runA2PSaga(start, p) {
  let state = { ...EMPTY_A2P_STATE, ...start };
  const save = async (patch) => {
    state = { ...state, ...patch };
    await p.save(patch);
  };
  const need2 = async (req, what) => {
    const a = await p.send(req);
    const id = sid(a);
    if (!ok(a) || !id) throw new Error(refusal(a, what));
    return id;
  };
  const brandType = brandTypeFor(p.record);
  const soleProp = brandType === "SOLE_PROPRIETOR";
  let step = null;
  try {
    while ((step = nextA2PStep(state, brandType)) !== null) {
      switch (step) {
        case "profile":
          await save({
            profileSid: await need2(
              (soleProp ? starterProfileRequest : customerProfileRequest)({ friendlyName: p.workspace.name, email: p.email, statusCallback: p.statusCallback }),
              "creating the customer's profile"
            )
          });
          break;
        case "business": {
          const id = await need2(
            soleProp ? starterEndUserRequest(p.record) : businessEndUserRequest(p.record),
            soleProp ? "recording who you are" : "recording the business"
          );
          const a = await p.send(assignRequest(state.profileSid, id));
          if (!ok(a)) throw new Error(refusal(a, soleProp ? "attaching your details" : "attaching the business"));
          await save({ businessSid: id });
          break;
        }
        case "representative": {
          const id = await need2(representativeEndUserRequest(p.record), "recording the person who signs");
          const a = await p.send(assignRequest(state.profileSid, id));
          if (!ok(a)) throw new Error(refusal(a, "attaching the person who signs"));
          await save({ representativeSid: id });
          break;
        }
        case "address":
          await save({ addressSid: await need2(addressRequest(p.accountSid, p.record), "recording the address") });
          break;
        case "document": {
          const id = await need2(supportingDocumentRequest({ legalName: p.record.legalName, addressSid: state.addressSid }), "attaching the address");
          const a = await p.send(assignRequest(state.profileSid, id));
          if (!ok(a)) throw new Error(refusal(a, "attaching the address document"));
          await save({ documentSid: id });
          break;
        }
        case "primary": {
          const a = await p.send(assignRequest(state.profileSid, p.primaryProfileSid));
          if (!ok(a)) throw new Error(refusal(a, "naming us as the provider"));
          await save({ primaryAssigned: true });
          break;
        }
        case "submit": {
          const refresh = soleProp ? [[state.businessSid, starterAttributes(p.record)]] : [[state.businessSid, businessAttributes(p.record)], [state.representativeSid, representativeAttributes(p.record)]];
          for (const [sid2, a] of refresh) {
            const up = await p.send(updateEndUserRequest(sid2, a));
            if (!ok(up)) throw new Error(refusal(up, "refreshing the business on record"));
          }
          const ev = await p.send(evaluateRequest(state.profileSid, soleProp ? A2P_POLICIES.starterCustomerProfile : A2P_POLICIES.secondaryCustomerProfile));
          const status = typeof ev.body?.status === "string" ? ev.body.status : "";
          if (!ok(ev)) throw new Error(refusal(ev, "checking the profile"));
          if (status !== "compliant") throw new Error(`the profile is not complete yet: ${JSON.stringify(ev.body?.results ?? ev.body).slice(0, 300)}`);
          const sub = await p.send(submitProfileRequest(state.profileSid));
          if (!ok(sub)) throw new Error(refusal(sub, "submitting the profile"));
          await save({ profileSubmitted: true });
          break;
        }
        case "a2p_profile": {
          const bundle = await need2(
            (soleProp ? soleProprietorProfileRequest : a2pProfileRequest)({ friendlyName: p.workspace.name, email: p.email, statusCallback: p.statusCallback }),
            "creating the messaging profile"
          );
          const endUser = await need2(
            soleProp ? soleProprietorEndUserRequest(p.record, p.industry) : a2pProfileEndUserRequest({ friendlyName: p.workspace.name, companyType: p.record.companyType }),
            soleProp ? "recording your mobile for the carriers' code" : "recording the company type"
          );
          for (const objectSid of [endUser, state.profileSid]) {
            const a = await p.send(trustProductAssignRequest(bundle, objectSid));
            if (!ok(a)) throw new Error(refusal(a, "attaching to the messaging profile"));
          }
          const ev = await p.send(evaluateTrustProductRequest(bundle));
          if (!ok(ev)) throw new Error(refusal(ev, "checking the messaging profile"));
          const sub = await p.send(submitTrustProductRequest(bundle));
          if (!ok(sub)) throw new Error(refusal(sub, "submitting the messaging profile"));
          await save({ a2pProfileSid: bundle });
          break;
        }
        case "brand":
          await save({
            brandSid: await need2(
              brandRequest({ customerProfileBundleSid: state.profileSid, a2pProfileBundleSid: state.a2pProfileSid, brandType: brandTypeFor(p.record), mock: p.mock, skipVetting: p.skipVetting }),
              "registering the brand"
            )
          });
          break;
        case "campaign":
          await save({
            campaignSid: await need2(
              campaignRequest({ ...p.campaign, brandSid: state.brandSid, messagingServiceSid: p.messagingServiceSid, useCase: p.useCase }),
              "registering the campaign"
            )
          });
          break;
      }
    }
    return { ok: true, state };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    return { ok: false, step: step ?? nextA2PStep(state) ?? "profile", error, pending: isBrandNotReady(error), state };
  }
}

// src/google-places.ts
var PLACES_BASE = "https://places.googleapis.com/v1";
var PLACES_SEARCH_MASK = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus";
var PLACES_DETAILS_MASK = "id,displayName,formattedAddress,googleMapsUri,businessStatus,rating,userRatingCount,reviews";
var PLACES_SEARCH_LIMIT = 5;
var PLACES_TIMEOUT_MS = 1e4;
var PlacesError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "PlacesError";
  }
  status;
};
function headers(key, mask, json = false) {
  return { "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask, ...json ? { "Content-Type": "application/json" } : {} };
}
function placesSearchRequest(key, query, opts = {}) {
  const pageSize = Math.max(1, Math.min(20, opts.limit ?? PLACES_SEARCH_LIMIT));
  return {
    url: `${PLACES_BASE}/places:searchText`,
    method: "POST",
    headers: headers(key, PLACES_SEARCH_MASK, true),
    body: JSON.stringify({ textQuery: query, pageSize, languageCode: opts.languageCode ?? "en" })
  };
}
function placesDetailsRequest(key, placeId, opts = {}) {
  const q = new URLSearchParams({ languageCode: opts.languageCode ?? "en" });
  return {
    url: `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?${q.toString()}`,
    method: "GET",
    headers: headers(key, PLACES_DETAILS_MASK)
  };
}
var obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : null;
var str2 = (v) => typeof v === "string" && v.trim() ? v : null;
var num = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
var localized = (v) => {
  const o = obj(v);
  return { text: str2(o?.text), languageCode: str2(o?.languageCode) };
};
function candidateOf(p) {
  const id = str2(p.id);
  const name = localized(p.displayName).text;
  if (!id || !name) return null;
  return { place_id: id, name, address: str2(p.formattedAddress), maps_uri: str2(p.googleMapsUri), business_status: str2(p.businessStatus) };
}
function reviewIdOf(name) {
  const s = str2(name);
  if (!s) return null;
  const last = s.split("/").pop();
  return last && last.length > 0 ? last : null;
}
function reviewOf(r) {
  const id = reviewIdOf(r.name);
  if (!id) return null;
  const author = obj(r.authorAttribution);
  const text = localized(r.text);
  return {
    review_id: id,
    rating: num(r.rating),
    author: str2(author?.displayName),
    author_uri: str2(author?.uri),
    author_photo_uri: str2(author?.photoUri),
    text: text.text,
    language_code: text.languageCode,
    published_at: str2(r.publishTime),
    maps_uri: str2(r.googleMapsUri)
  };
}
function parsePlacesSearch(json) {
  const places = obj(json)?.places;
  if (!Array.isArray(places)) return [];
  return places.map((p) => obj(p) ? candidateOf(obj(p)) : null).filter((c) => c !== null);
}
function parsePlaceDetails(json) {
  const p = obj(json);
  const id = str2(p?.id);
  const name = localized(p?.displayName).text;
  if (!p || !id || !name) throw new PlacesError(502, "Google answered without a place");
  const reviews = Array.isArray(p.reviews) ? p.reviews.map((r) => obj(r) ? reviewOf(obj(r)) : null).filter((r) => r !== null) : [];
  return {
    place_id: id,
    name,
    address: str2(p.formattedAddress),
    maps_uri: str2(p.googleMapsUri),
    business_status: str2(p.businessStatus),
    rating: num(p.rating),
    review_count: num(p.userRatingCount),
    reviews
  };
}
function refusal2(status, body) {
  let message = `Google answered ${status}`;
  try {
    const e = obj(obj(JSON.parse(body))?.error);
    const m = str2(e?.message);
    const s = str2(e?.status);
    if (m) message = s ? `${s}: ${m}` : m;
  } catch {
  }
  return new PlacesError(status, message);
}
async function call(http, req) {
  const r = await http(req);
  if (r.status < 200 || r.status >= 300) throw refusal2(r.status, r.body);
  try {
    return JSON.parse(r.body);
  } catch {
    throw new PlacesError(502, "Google answered with something other than JSON");
  }
}
async function searchPlaces(http, key, query, opts = {}) {
  return parsePlacesSearch(await call(http, placesSearchRequest(key, query, opts)));
}
async function getPlace(http, key, placeId, opts = {}) {
  return parsePlaceDetails(await call(http, placesDetailsRequest(key, placeId, opts)));
}
function placesFetch(fetchImpl = fetch, timeoutMs = PLACES_TIMEOUT_MS) {
  return async (req) => {
    const r = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(timeoutMs) });
    return { status: r.status, body: await r.text() };
  };
}
var PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

// src/google-sync.ts
var REVIEW_BELL_MAX = 3;
var FRESH_SLACK_MS = 2 * 864e5;
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function overall(rating, count) {
  return `${ratingWords(rating)} overall${typeof count === "number" ? ` \xB7 ${plural(count, "review")}` : ""}`;
}
function reviewBells(news, counted, listing) {
  if (news.length > 0 && news.length <= REVIEW_BELL_MAX) {
    return news.map((r) => ({
      title: `New on Google: ${starsOf(r.rating)} from ${r.author?.trim() || "a customer"}`,
      body: `${r.text?.trim() ? `\u201C${reviewSnippet(r.text, 280)}\u201D` : "A rating without words."}
${overall(listing.rating, listing.review_count)}.`,
      review_id: r.review_id
    }));
  }
  if (news.length > REVIEW_BELL_MAX) {
    const who = news.map((r) => r.author?.trim() || "a customer").slice(0, 5).join(", ");
    return [{
      title: `${news.length} new reviews on Google`,
      body: `From ${who}${news.length > 5 ? " and others" : ""}. ${overall(listing.rating, listing.review_count)}. The words are on Reports.`,
      review_id: null
    }];
  }
  if (counted > 0) {
    return [{
      title: `${plural(counted, "new rating")} on Google`,
      body: `${overall(listing.rating, listing.review_count)}. Google shows the words of its five most relevant reviews; a rating outside them counts without its words.`,
      review_id: null
    }];
  }
  return [];
}
function writtenSince(at, sinceMs) {
  const t = at ? Date.parse(at) : NaN;
  return !Number.isNaN(t) && t >= sinceMs - FRESH_SLACK_MS;
}
function planListingCheck(before, knownIds, fresh, day, nowMs, opts = {}) {
  const now = new Date(nowMs).toISOString();
  const first = !before.checked_at;
  const sinceMs = before.checked_at ? Date.parse(before.checked_at) : NaN;
  const carriesReviews = opts.reviews !== false;
  const unseen = carriesReviews ? fresh.reviews.filter((r) => !knownIds.has(r.review_id)) : [];
  const news = first || Number.isNaN(sinceMs) ? [] : unseen.filter((r) => writtenSince(r.published_at, sinceMs));
  const counted = first || typeof before.review_count !== "number" || typeof fresh.review_count !== "number" ? 0 : Math.max(0, fresh.review_count - before.review_count);
  return {
    listing: {
      name: fresh.name,
      address: fresh.address,
      maps_uri: fresh.maps_uri,
      business_status: fresh.business_status,
      rating: fresh.rating,
      review_count: fresh.review_count,
      checked_at: now,
      check_error: null
    },
    day: { day, rating: fresh.rating, review_count: fresh.review_count ?? 0 },
    reviews: carriesReviews ? fresh.reviews.map((r) => ({ ...r, last_seen_at: now })) : [],
    fresh: news,
    counted,
    bells: carriesReviews ? reviewBells(news, counted, fresh) : []
  };
}
function planProfileSync(before, known, page, day, nowMs) {
  const now = new Date(nowMs).toISOString();
  const first = !before.last_synced_at;
  const sinceMs = before.last_synced_at ? Date.parse(before.last_synced_at) : NaN;
  const unseen = page.reviews.filter((r) => !known.has(r.review_id));
  const news = first || Number.isNaN(sinceMs) ? [] : unseen.filter((r) => writtenSince(r.created_at, sinceMs));
  const replied = page.reviews.filter((r) => {
    const k = known.get(r.review_id);
    return !!k && !!r.reply_text && r.reply_text !== k.reply_text;
  }).map((r) => r.review_id);
  const rating = page.average_rating;
  const count = page.total_count;
  const listing = typeof count === "number" || typeof rating === "number" ? { rating: typeof rating === "number" ? Math.round(rating * 10) / 10 : null, review_count: count, checked_at: now, check_error: null } : null;
  return {
    listing,
    day: typeof count === "number" ? { day, rating: listing?.rating ?? null, review_count: count } : null,
    reviews: page.reviews.map((r) => ({ ...r, last_seen_at: now })),
    fresh: news,
    replied,
    bells: reviewBells(news, 0, { rating: listing?.rating ?? null, review_count: count }),
    synced_at: now
  };
}

// src/google-oauth.ts
var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
var GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
var PROFILE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/business.manage"];
var STATE_TTL_MS = 10 * 6e4;
function authorizeUrl(cfg, state, loginHint) {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: PROFILE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state
  });
  if (loginHint) q.set("login_hint", loginHint);
  return `${GOOGLE_AUTH_URL}?${q.toString()}`;
}
var form = (params) => new URLSearchParams(params).toString();
var FORM = { "Content-Type": "application/x-www-form-urlencoded" };
function tokenExchangeRequest(cfg, code) {
  return { url: GOOGLE_TOKEN_URL, method: "POST", headers: FORM, body: form({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }) };
}
function tokenRefreshRequest(cfg, refreshToken) {
  return { url: GOOGLE_TOKEN_URL, method: "POST", headers: FORM, body: form({ refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }) };
}
function revokeRequest(token) {
  return { url: GOOGLE_REVOKE_URL, method: "POST", headers: FORM, body: form({ token }) };
}
function parseTokenResponse(json) {
  const o = json && typeof json === "object" ? json : {};
  const access = typeof o.access_token === "string" ? o.access_token : "";
  if (!access) throw new Error(typeof o.error === "string" ? `${o.error}${typeof o.error_description === "string" ? `: ${o.error_description}` : ""}` : "Google answered without a token");
  return {
    access_token: access,
    refresh_token: typeof o.refresh_token === "string" && o.refresh_token ? o.refresh_token : null,
    expires_in: typeof o.expires_in === "number" ? o.expires_in : 3600,
    scope: typeof o.scope === "string" ? o.scope : "",
    id_token: typeof o.id_token === "string" ? o.id_token : null
  };
}
function grantHasScope(grant, scope) {
  return grant.scope.split(/\s+/).includes(scope);
}
var enc2 = new TextEncoder();
var dec = new TextDecoder();
function b64url(bytes) {
  const b = typeof bytes === "string" ? enc2.encode(bytes) : bytes;
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - s.length % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function idTokenClaims(idToken) {
  try {
    const parts = (idToken ?? "").split(".");
    if (parts.length < 2) return { email: null, sub: null };
    const c = JSON.parse(dec.decode(unb64url(parts[1])));
    return { email: typeof c.email === "string" ? c.email : null, sub: typeof c.sub === "string" ? c.sub : null };
  } catch {
    return { email: null, sub: null };
  }
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc2.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc2.encode(data));
  return b64url(new Uint8Array(sig));
}
async function signState(secret, s) {
  const payload = b64url(JSON.stringify(s));
  return `${payload}.${await hmac(secret, payload)}`;
}
async function verifyState(secret, state, nowMs) {
  if (!state) return { ok: false, reason: "missing" };
  const [payload, sig, ...rest] = state.split(".");
  if (!payload || !sig || rest.length) return { ok: false, reason: "malformed" };
  const expected = await hmac(secret, payload);
  if (expected.length !== sig.length || !timingSafeEqualStr(expected, sig)) return { ok: false, reason: "signature" };
  let s;
  try {
    s = JSON.parse(dec.decode(unb64url(payload)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof s.t !== "string" || typeof s.u !== "string" || typeof s.n !== "string" || typeof s.exp !== "number") return { ok: false, reason: "malformed" };
  if (s.exp < nowMs) return { ok: false, reason: "expired" };
  return { ok: true, state: s };
}
function timingSafeEqualStr(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function newNonce() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return b64url(b);
}

// src/google-profile.ts
var GBP_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
var GBP_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
var GBP_V4_BASE = "https://mybusiness.googleapis.com/v4";
var GBP_LOCATIONS_READ_MASK = "name,title,storefrontAddress,metadata";
var GBP_REVIEWS_PAGE = 50;
var GBP_REVIEWS_MAX_PAGES = 5;
var obj2 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : null;
var str3 = (v) => typeof v === "string" && v.trim() ? v : null;
function bearer(token, v4 = false) {
  return { Authorization: `Bearer ${token}`, ...v4 ? { "X-GOOG-API-FORMAT-VERSION": "2" } : {} };
}
function accountsRequest(token, pageToken) {
  const q = new URLSearchParams({ pageSize: "20" });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_ACCOUNTS_URL}?${q.toString()}`, method: "GET", headers: bearer(token) };
}
function locationsRequest(token, accountName, pageToken) {
  const q = new URLSearchParams({ readMask: GBP_LOCATIONS_READ_MASK, pageSize: "100" });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_INFO_BASE}/${accountName}/locations?${q.toString()}`, method: "GET", headers: bearer(token) };
}
function reviewParent(accountName, locationName) {
  const loc = locationName.startsWith("locations/") ? locationName.slice("locations/".length) : locationName;
  return `${accountName}/locations/${loc}`;
}
function reviewsRequest(token, parent, pageToken) {
  const q = new URLSearchParams({ pageSize: String(GBP_REVIEWS_PAGE), orderBy: "updateTime desc" });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_V4_BASE}/${parent}/reviews?${q.toString()}`, method: "GET", headers: bearer(token, true) };
}
function replyRequest(token, reviewName, comment) {
  return { url: `${GBP_V4_BASE}/${reviewName}/reply`, method: "PUT", headers: { ...bearer(token, true), "Content-Type": "application/json" }, body: JSON.stringify({ comment }) };
}
function deleteReplyRequest(token, reviewName) {
  return { url: `${GBP_V4_BASE}/${reviewName}/reply`, method: "DELETE", headers: bearer(token, true) };
}
function parseAccounts(json) {
  const o = obj2(json);
  const list = Array.isArray(o?.accounts) ? o.accounts : [];
  const accounts = list.map((a) => obj2(a)).filter((a) => !!a).map((a) => ({ name: str3(a.name) ?? "", title: str3(a.accountName) ?? str3(obj2(a.organizationInfo)?.registeredDomain) ?? str3(a.name) ?? "", type: str3(a.type) })).filter((a) => a.name.startsWith("accounts/"));
  return { accounts, next: str3(o?.nextPageToken) };
}
function oneLineAddress(a) {
  const o = obj2(a);
  if (!o) return null;
  const lines = Array.isArray(o.addressLines) ? o.addressLines.filter((l) => typeof l === "string" && !!l.trim()) : [];
  const parts = [...lines, str3(o.locality), [str3(o.administrativeArea), str3(o.postalCode)].filter(Boolean).join(" ")].filter((p) => !!p);
  return parts.length ? parts.join(", ") : null;
}
function parseLocations(json) {
  const o = obj2(json);
  const list = Array.isArray(o?.locations) ? o.locations : [];
  const locations = list.map((l) => obj2(l)).filter((l) => !!l).map((l) => {
    const meta = obj2(l.metadata);
    return { name: str3(l.name) ?? "", title: str3(l.title) ?? "", address: oneLineAddress(l.storefrontAddress), place_id: str3(meta?.placeId), maps_uri: str3(meta?.mapsUri), new_review_uri: str3(meta?.newReviewUri) };
  }).filter((l) => l.name.startsWith("locations/"));
  return { locations, next: str3(o?.nextPageToken) };
}
var STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
function starRatingNumber(v) {
  return typeof v === "string" && v in STARS ? STARS[v] : null;
}
function parseReviewsPage(json) {
  const o = obj2(json);
  const list = Array.isArray(o?.reviews) ? o.reviews : [];
  const reviews = list.map((r) => obj2(r)).filter((r) => !!r).map((r) => {
    const name = str3(r.name);
    const id = str3(r.reviewId) ?? (name ? name.split("/").pop() ?? null : null);
    if (!name || !id) return null;
    const who = obj2(r.reviewer);
    const reply = obj2(r.reviewReply);
    return {
      name,
      review_id: id,
      rating: starRatingNumber(r.starRating),
      author: who?.isAnonymous === true ? null : str3(who?.displayName),
      author_photo_uri: str3(who?.profilePhotoUrl),
      anonymous: who?.isAnonymous === true,
      text: str3(r.comment),
      created_at: str3(r.createTime),
      updated_at: str3(r.updateTime),
      reply_text: str3(reply?.comment),
      replied_at: str3(reply?.updateTime)
    };
  }).filter((r) => r !== null);
  const avg = typeof o?.averageRating === "number" ? o.averageRating : null;
  const total = typeof o?.totalReviewCount === "number" ? o.totalReviewCount : null;
  return { reviews, average_rating: avg, total_count: total, next_page_token: str3(o?.nextPageToken) };
}
function refusal3(status, body) {
  let message = `Google answered ${status}`;
  try {
    const e = obj2(obj2(JSON.parse(body))?.error);
    const m = str3(e?.message);
    const s = str3(e?.status);
    if (m) message = s ? `${s}: ${m}` : m;
  } catch {
  }
  return new PlacesError(status, message);
}
async function call2(http, req) {
  const r = await http(req);
  if (r.status < 200 || r.status >= 300) throw refusal3(r.status, r.body);
  if (!r.body.trim()) return {};
  try {
    return JSON.parse(r.body);
  } catch {
    throw new PlacesError(502, "Google answered with something other than JSON");
  }
}
async function listAccounts(http, token) {
  const out = [];
  let page = null;
  for (let i = 0; i < 5; i++) {
    const r = parseAccounts(await call2(http, accountsRequest(token, page)));
    out.push(...r.accounts);
    page = r.next;
    if (!page) break;
  }
  return out;
}
async function listLocations(http, token, accountName) {
  const out = [];
  let page = null;
  for (let i = 0; i < 5; i++) {
    const r = parseLocations(await call2(http, locationsRequest(token, accountName, page)));
    out.push(...r.locations);
    page = r.next;
    if (!page) break;
  }
  return out;
}
async function listReviews(http, token, parent, maxPages = GBP_REVIEWS_MAX_PAGES) {
  const all = [];
  let page = null;
  let avg = null;
  let total = null;
  for (let i = 0; i < Math.max(1, maxPages); i++) {
    const r = parseReviewsPage(await call2(http, reviewsRequest(token, parent, page)));
    all.push(...r.reviews);
    if (i === 0) {
      avg = r.average_rating;
      total = r.total_count;
    }
    page = r.next_page_token;
    if (!page) break;
  }
  return { reviews: all, average_rating: avg, total_count: total, next_page_token: page };
}
async function replyToReview(http, token, reviewName, comment) {
  const o = obj2(await call2(http, replyRequest(token, reviewName, comment)));
  return { reply_text: str3(o?.comment) ?? comment, replied_at: str3(o?.updateTime) ?? (/* @__PURE__ */ new Date()).toISOString() };
}
var GBP_REPLY_MAX = 4096;
function cleanReply(text) {
  return typeof text === "string" ? text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim().slice(0, GBP_REPLY_MAX) : "";
}

// src/edge-token.ts
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
var EDGE_TOKEN_TTL_MS = 6e4;
function signEdgeToken(secret, aud, ctx = {}, nowMs = Date.now()) {
  const claims = {
    aud,
    ws: ctx.workspace ?? null,
    user: ctx.user ?? null,
    iat: nowMs,
    exp: nowMs + EDGE_TOKEN_TTL_MS,
    nonce: randomBytes(8).toString("hex")
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
function verifyEdgeToken(secret, token, aud, nowMs = Date.now()) {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!claims || typeof claims !== "object" || typeof claims.aud !== "string") return { ok: false, reason: "malformed" };
  if (claims.aud !== aud) return { ok: false, reason: "audience" };
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return { ok: false, reason: "malformed" };
  if (nowMs > claims.exp || claims.iat > nowMs + EDGE_TOKEN_TTL_MS) return { ok: false, reason: "expired" };
  return { ok: true, claims: { ...claims, ws: claims.ws ?? null, user: claims.user ?? null } };
}
export {
  A2P_POLICIES,
  A2P_STEPS,
  CALLER_UNKNOWN,
  CALL_ANALYSIS_FIELDS,
  DEFAULT_FN_URL,
  EDGE_TOKEN_TTL_MS,
  EMPTY_A2P_STATE,
  FACTS_UNAVAILABLE,
  FRESH_SLACK_MS,
  GBP_ACCOUNTS_URL,
  GBP_INFO_BASE,
  GBP_LOCATIONS_READ_MASK,
  GBP_REPLY_MAX,
  GBP_REVIEWS_MAX_PAGES,
  GBP_REVIEWS_PAGE,
  GBP_V4_BASE,
  GOOGLE_AUTH_URL,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  GREETING_DEFAULT,
  HANDOFF_VAR,
  LINE_COSTS,
  LINE_STEPS,
  LOW_VOLUME_USECASE,
  MESSAGING2 as MESSAGING,
  PLACES_BASE,
  PLACES_DETAILS_MASK,
  PLACES_SEARCH_LIMIT,
  PLACES_SEARCH_MASK,
  PLACES_TIMEOUT_MS,
  PLACE_ID,
  PROFILE_SCOPES,
  PlacesError,
  RETELL_ORIGINATION,
  REVIEW_BELL_MAX,
  SMS_FOOTER,
  SMS_HELD_DETAILS,
  SMS_HELD_REASON,
  SMS_MAX_CHARS,
  STATE_TTL_MS,
  TRUSTHUB,
  TwilioError,
  VOICE_AGENT_DEFAULTS,
  VOICE_LLM_DEFAULTS,
  VOICE_NUMBER_DEFAULTS,
  VOICE_SHELL_BEGIN,
  VOICE_SHELL_PROMPT,
  VOICE_WEBHOOK_EVENTS,
  VOICE_WEBHOOK_TIMEOUT_MS,
  WEBHOOK_TOLERANCE_S,
  a2pProfileEndUserRequest,
  a2pProfileRequest,
  accountsRequest,
  addressOf,
  addressRequest,
  agentSettingsDrift,
  assignRequest,
  authorizeUrl,
  availabilityUrl,
  b64url,
  brandRequest,
  brandTypeFor,
  buildEmailRequest,
  businessAttributes,
  businessEndUserRequest,
  callSummaryLine,
  campaignRequest,
  carrierConsent,
  chooseLineProvider,
  classifyReceived,
  cleanReply,
  createAgent,
  createAgentVersion,
  createPhoneNumber,
  createRetellLlm,
  customerProfileRequest,
  deleteCampaignRequest,
  deleteReplyRequest,
  desiredVoiceShell,
  dryProvider,
  emailHtml,
  emailPlainText,
  emailReceiptEffect,
  emailReceiptFrom,
  emailReceivedEventFrom,
  encodeForm,
  evaluateRequest,
  evaluateTrustProductRequest,
  fetchMailDomains,
  fetchMediaBytes,
  fetchReceivedEmail,
  fetchRecording,
  fetchTwilio,
  getAgent,
  getAgentRaw,
  getCall,
  getPhoneNumber,
  getPlace,
  getRetellLlm,
  grantHasScope,
  greetingFor,
  hostedAddress,
  hostedIdentity,
  idTokenClaims,
  importPhoneNumber,
  isAreaCode,
  isBrandNotReady,
  isE164,
  isEmailRequest,
  isValidSipPassword,
  keywordsFor,
  listAccounts,
  listCalls,
  listLocations,
  listReviews,
  liveTurns,
  locationsRequest,
  mailDomainsFrom,
  mailboxHeader,
  mergeConsent,
  messageIdHeader,
  messageIdsIn,
  needsHydration,
  newNonce,
  nextA2PStep,
  nextLineStep,
  normalizeCall,
  normalizeInbound,
  parseAccounts,
  parseLocations,
  parsePlaceDetails,
  parsePlacesSearch,
  parseReviewsPage,
  parseTokenResponse,
  parseTranscriptText,
  placesDetailsRequest,
  placesFetch,
  placesSearchRequest,
  planAgentSettings,
  planListingCheck,
  planProfileSync,
  planVoiceConvergence,
  planVoiceProvision,
  platformRecipient,
  publishAgentVersion,
  receivedEmailFrom,
  referencesFor,
  refusalWords,
  registrationVerdict,
  replyRequest,
  replyRouteAddress,
  replySubject,
  replyToReview,
  representativeAttributes,
  representativeEndUserRequest,
  requestLeavesAs,
  resendWebhookSignature,
  retellImportBody,
  reviewBells,
  reviewIdOf,
  reviewParent,
  reviewsRequest,
  revokeRequest,
  runA2PSaga,
  runLineSaga,
  sameSignature,
  searchPlaces,
  sendEmail,
  sendTemplate,
  sendText,
  sendsAs,
  signEdgeToken,
  signState,
  sipPassword,
  sipUsername,
  smsAsWaMessage,
  smsBody,
  smsInboundFrom,
  smsInboundUrl,
  smsKeywordConsent,
  smsStateFor,
  smsStatusFrom,
  smsStatusToRow,
  smsStatusUrl,
  soleProprietorEndUserRequest,
  soleProprietorProfileRequest,
  starRatingNumber,
  starterAttributes,
  starterEndUserRequest,
  starterProfileRequest,
  stopCall,
  stripKey,
  submitProfileRequest,
  submitTrustProductRequest,
  supportingDocumentRequest,
  tokenExchangeRequest,
  tokenRefreshRequest,
  trunkDomain,
  trustProductAssignRequest,
  twilioProvider,
  twilioSignature,
  twilioSignedString,
  twilioUrls,
  unb64url,
  updateAgent,
  updateCampaignRequest,
  updateEndUserRequest,
  updateLiveCall,
  updatePhoneNumber,
  verifyEdgeToken,
  verifyResendWebhook,
  verifyRetellSignature,
  verifyState,
  verifyTwilioSignature,
  voiceAgentCreateBody,
  voiceEndpoints,
  voiceLlmCreateBody,
  voiceNumberBindBody,
  voiceNumberBinding,
  voiceNumberCreateBody,
  voiceShellDrift,
  voiceShellTools,
  withCarrierConsent,
  withKey
};
