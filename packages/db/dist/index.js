// src/service-client.ts
import { createClient } from "@supabase/supabase-js";
function createServiceClient(cfg) {
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// ../contracts/dist/index.js
import { z } from "zod";
import { z as z2 } from "zod";
import { z as z3 } from "zod";
import { z as z4 } from "zod";
import { z as z5 } from "zod";
import { z as z6 } from "zod";
import { z as z7 } from "zod";
import { z as z8 } from "zod";
z.config({ jitless: true });
function normalizePhone(raw) {
  if (raw == null) return null;
  const digits2 = String(raw).replace(/[^\d]/g, "");
  if (!digits2) return null;
  if (digits2.length === 10) return `+1${digits2}`;
  if (digits2.length >= 8 && digits2.length <= 15) return `+${digits2}`;
  return null;
}
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
  "lead.no_card",
  /** A lead worked: its stage moved, the owner said they sent the email, a call happened, it became a person, or it was not a fit (release B). */
  "lead.stage",
  "lead.emailed",
  "lead.call",
  "lead.converted",
  "lead.not_a_fit"
];
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
var DATE_FMT3 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS3 = 7 * 864e5;
var DATE_FMT4 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
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
var LEAD_MEMBER_CLASSES = ["qualified", "review", "excluded"];
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
var LEAD_CLASSES = LEAD_MEMBER_CLASSES;
var LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"];
var LEAD_SORTS = ["fit", "found", "distance", "business", "rating", "stage"];
var LEAD_CALL_OUTCOMES = ["interested", "call_back", "not_interested", "voicemail", "no_answer", "wrong_number"];
var LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"];
var LeadsQuerySchema = z7.object({
  list: z7.enum(LEAD_LISTS).default("all"),
  search: z7.string().uuid().optional(),
  class: z7.enum(LEAD_CLASSES).optional(),
  sort: z7.enum(LEAD_SORTS).default("fit"),
  dir: z7.enum(["asc", "desc"]).default("asc"),
  after_key: z7.string().max(80).optional(),
  after_id: z7.string().uuid().optional(),
  limit: z7.coerce.number().int().min(1).max(500).default(500)
});
var LeadsViewSchema = LeadsQuerySchema.omit({ after_key: true, after_id: true, limit: true });
var LeadStageInputSchema = z7.discriminatedUnion("kind", [
  z7.object({ kind: z7.literal("stage"), stage: z7.enum(["ready", "nurture", "converted"]) }),
  z7.object({ kind: z7.literal("not_a_fit"), why: z7.enum(LEAD_NOT_A_FIT_WHYS) }),
  z7.object({ kind: z7.literal("said_no") }),
  z7.object({ kind: z7.literal("outcome"), outcome: z7.enum(LEAD_CALL_OUTCOMES), note: z7.string().trim().max(280).optional() }),
  /** "Did you send it?" Yes. */
  z7.object({ kind: z7.literal("emailed") })
]);
var LeadsBulkSchema = z7.discriminatedUnion("by", [
  z7.object({ by: z7.literal("ids"), action: z7.enum(["contacted", "not_a_fit"]), ids: z7.array(z7.string().uuid()).min(1).max(500) }),
  z7.object({ by: z7.literal("view"), action: z7.enum(["contacted", "not_a_fit"]), view: LeadsViewSchema })
]);
var LeadDraftInputSchema = z7.object({
  tone: z7.enum(["first", "shorter", "warmer"]).default("first"),
  previous: z7.object({ subject: z7.string().max(200), body: z7.string().max(4e3) }).optional()
});
var RenameLeadSearchSchema = z7.object({ name: z7.string().trim().min(1).max(80) });
var BusinessLineSchema = z7.object({ business_line: z7.string().trim().min(3).max(160) });
var planChip = (max) => z7.string().trim().min(2).max(max);
var ProposeLeadSearchSchema = z7.object({
  looking_for: z7.enum(["local_businesses", "people", "online_sellers", "other"]),
  country: z7.string().trim().min(2).max(40),
  count: z7.number().int().min(1).max(LEAD_MAX_PLACES),
  /** Plural, as the sentence says it: "personal trainers". */
  who: planChip(60),
  /** One of them, for the question and the judge's rubric: "personal trainer". */
  who_one: planChip(60),
  category_key: z7.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  terms: z7.array(planChip(60)).min(1).max(5),
  city: z7.string().trim().max(60).nullable().default(null),
  region: z7.string().trim().min(2).max(40),
  zip: z7.string().regex(/^\d{5}$/).nullable().default(null),
  contact: z7.enum(["phone", "email"]),
  criteria: z7.array(z7.object({ text: planChip(120), standard: z7.enum(["likely", "seen"]), required: z7.boolean() })).max(6).default([]),
  leave_out: z7.array(z7.object({ words: planChip(40) })).max(6).default([]),
  asked: z7.string().trim().min(1).max(400)
});
var LeadDraftAnswerSchema = z7.object({ subject: z7.string().trim().min(3).max(120), body: z7.string().trim().min(20).max(2e3) });
var LeadSuggestAnswerSchema = z7.object({
  line: z7.string().trim().min(3).max(160),
  items: z7.array(z7.object({ words: z7.string().trim().min(3).max(80), who_for: z7.string().trim().min(3).max(120), category_key: z7.string().regex(/^[a-z_]{2,40}$/) })).min(1).max(4)
});
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
var AnswerSchema = z8.object({
  places: z8.array(z8.object({
    ref: z8.number().int(),
    criteria: z8.array(z8.object({ key: z8.string(), answer: z8.enum(["pass", "fail", "unknown"]), facts: z8.array(z8.string()) })),
    email_index: z8.number().int().nullable(),
    reason: z8.string()
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
  const out = data;
  if (p.optInMarketing && out?.contact_id) {
    const args = {
      p_tenant_id: p.tenantId,
      p_contact_id: out.contact_id,
      p_consent: "opted_in",
      p_source: "customer_message",
      p_note: null
    };
    const evidence = { channel: p.channel, message_external_id: p.messageExternalId, words: (p.body ?? "").slice(0, 80) || null };
    let { error: mErr } = await db.rpc("set_marketing_consent", { ...args, p_evidence: evidence });
    if (mErr && /p_evidence/.test(mErr.message)) ({ error: mErr } = await db.rpc("set_marketing_consent", args));
    if (mErr) {
      console.error(JSON.stringify({
        level: "error",
        event: "marketing_consent_write_failed",
        tenant_id: p.tenantId,
        contact_id: out.contact_id,
        error: mErr.message
      }));
    }
  }
  return out;
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
    channel: p.channel ?? "whatsapp",
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
  const status = p.status ?? "sent";
  await Promise.all([
    db.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.conversationId),
    status === "sent" ? emitEvent(db, p.tenantId, "message.sent", "message", "message", data.id, { sender: p.sender }) : Promise.resolve()
  ]);
  return data.id;
}
async function getOrCreateContact(db, tenantId, phoneE164) {
  const { data, error } = await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: phoneE164, last_seen_at: (/* @__PURE__ */ new Date()).toISOString() }).select("id, consent, dnc, marketing_consent").single();
  if (!error && data) return data;
  if (error && error.code !== "23505") throw new Error(`get_or_create_contact: ${error.message}`);
  const { data: raced, error: reErr } = await db.from("contacts").select("id, consent, dnc, marketing_consent").eq("tenant_id", tenantId).eq("phone_e164", phoneE164).single();
  if (reErr || !raced) throw new Error(`get_or_create_contact reselect: ${reErr?.message}`);
  return raced;
}
async function resolveOutboundTarget(db, p) {
  const phone = normalizePhone(p.phoneE164);
  if (!phone) return null;
  const { data: existing, error: selErr } = await db.from("contacts").select("id, consent, dnc, marketing_consent").eq("tenant_id", p.tenantId).eq("phone_e164", phone).maybeSingle();
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
      ...p.touch === false ? {} : { last_message_at: (/* @__PURE__ */ new Date()).toISOString() }
    },
    { onConflict: "tenant_id,contact_id" }
  ).select("id, paused_until").single();
  if (cErr || !conv) throw new Error(`resolve_outbound_target conversation: ${cErr?.message}`);
  return {
    contactId: contact.id,
    conversationId: conv.id,
    pausedUntil: conv.paused_until ?? null,
    consent: contact.consent ?? null,
    dnc: contact.dnc ?? false,
    marketing_consent: contact.marketing_consent ?? null
  };
}
async function countSentToday(db, p) {
  const since = new Date(Date.now() - 24 * 3600 * 1e3).toISOString();
  const { count, error } = await db.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", p.tenantId).eq("conversation_id", p.conversationId).eq("direction", "outbound").gte("created_at", since).contains("meta", { source: p.source });
  if (error) throw new Error(`count_sent_today: ${error.message}`);
  return count ?? 0;
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
  const { data: conv, error: verr } = await db.from("conversations").upsert({ tenant_id: p.tenantId, contact_id: contact.id }, { onConflict: "tenant_id,contact_id" }).select("id").single();
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
  if (error?.code === "23505" && p.externalId) return;
  const { error: perr } = await db.from("conversations").update({ state: "needs_human", paused_until: p.pausedUntilIso, last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", conv.id).eq("tenant_id", p.tenantId);
  if (perr) console.error("record_echo_pause_failed", perr.message);
}
async function pauseConversation(db, tenantId, conversationId, pausedUntilIso, opts = {}) {
  const { data, error } = await db.from("conversations").update({ state: "needs_human", paused_until: pausedUntilIso }).eq("id", conversationId).eq("tenant_id", tenantId).select("id");
  if (error) {
    console.error("pause_conversation_failed", conversationId, error.message);
    return false;
  }
  if (!data || data.length === 0) {
    console.error("pause_conversation_noop", conversationId);
    return false;
  }
  let withdraw = db.from("messages").update({ status: "canceled", error: { reason: "superseded_by_human" } }).eq("conversation_id", conversationId).eq("tenant_id", tenantId).eq("sender", "ai").eq("status", "queued");
  if (opts.keepMessageId) withdraw = withdraw.neq("id", opts.keepMessageId);
  const { error: wErr } = await withdraw;
  if (wErr) console.error("pause_withdraw_drafts_failed", conversationId, wErr.message);
  return true;
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

// src/repositories/email.ts
async function mailboxById(db, id) {
  const { data, error } = await db.from("mailboxes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}
async function mailboxFor(db, to) {
  const q = db.from("mailboxes").select("*");
  const { data, error } = to.kind === "mailbox" ? await q.eq("local_part", to.localPart).maybeSingle() : await q.or(`reply_token.eq.${to.token},reply_token_prev.eq.${to.token}`).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}
async function ingestInboundEmail(db, p) {
  const known = await db.from("contacts").select("id").eq("tenant_id", p.tenantId).eq("email", p.address).is("erased_at", null).is("merged_into_contact_id", null).maybeSingle();
  if (known.error) throw new Error(`ingest_email: cannot read who has this address: ${known.error.message}`);
  if (known.data) {
    const { error } = await db.from("contact_identities").upsert({ tenant_id: p.tenantId, contact_id: known.data.id, channel: "email", external_id: p.address }, { onConflict: "tenant_id,channel,external_id", ignoreDuplicates: true });
    if (error) throw new Error(`ingest_email: cannot name the person this address belongs to: ${error.message}`);
  }
  const out = await ingestInbound(db, {
    tenantId: p.tenantId,
    channel: "email",
    identityExternalId: p.address,
    phoneE164: null,
    waProfileName: null,
    messageExternalId: p.receivedId,
    type: "text",
    body: p.body,
    channelTs: p.channelTs,
    meta: p.meta
  });
  if (!known.data) {
    const { error } = await db.from("contacts").update({ email: p.address }).eq("id", out.contact_id).eq("tenant_id", p.tenantId).is("email", null);
    if (error && error.code !== "23505") throw new Error(`ingest_email: cannot record the person's address: ${error.message}`);
    if (error) console.error("ingest_email_address_taken", JSON.stringify({ tenant: p.tenantId, contact: out.contact_id }));
  }
  return out;
}
async function sentEmailWithMessageId(db, tenantId, rfcMessageId) {
  const { data, error } = await db.from("messages").select("id").eq("tenant_id", tenantId).eq("channel", "email").eq("direction", "outbound").eq("meta->email->>message_id", rfcMessageId).limit(1);
  if (error) throw new Error(`ingest_email: cannot read the ledger of sent emails: ${error.message}`);
  return (data ?? []).length > 0;
}
async function stampMailboxReceived(db, mailboxId, at) {
  const { error } = await db.from("mailboxes").update({ last_received_at: at, last_error: null }).eq("id", mailboxId);
  if (error) console.error("mailbox_stamp_failed", error.message);
}
async function mailboxOfTenant(db, tenantId) {
  const { data, error } = await db.from("mailboxes").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}
async function lastInboundEmail(db, tenantId, conversationId) {
  const { data, error } = await db.from("messages").select("id, meta").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("channel", "email").eq("direction", "inbound").order("channel_ts", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (error) throw new Error(`email: cannot read the email being answered: ${error.message}`);
  if (!data) return null;
  const e = data.meta?.email ?? {};
  const str = (v) => typeof v === "string" && v ? v : null;
  return {
    messageId: data.id,
    from: str(e.from),
    rfcMessageId: str(e.message_id),
    references: Array.isArray(e.references) ? e.references.filter((r) => typeof r === "string") : [],
    subject: str(e.subject)
  };
}
async function stampEmailSent(db, p) {
  const { data, error } = await db.rpc("stamp_email_sent", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_provider_id: p.providerId,
    p_rfc_message_id: p.rfcMessageId
  });
  if (error) throw new Error(`stamp_email_sent: ${error.message}`);
  const row = data?.[0];
  return row ? { status: row.status, conversationId: row.conversation_id } : null;
}
async function recordEmailStatus(db, p) {
  const { error } = await db.from("messages").update({ status: p.status, ...p.error ? { error: p.error } : {} }).eq("id", p.messageId).eq("tenant_id", p.tenantId).eq("channel", "email").eq("direction", "outbound");
  if (error && !/monotone|terminal/.test(error.message)) throw new Error(`email receipt: cannot move message ${p.messageId}: ${error.message}`);
}
async function suppressEmailOf(db, p) {
  if (!p.addresses.length) return null;
  const sent = await db.from("messages").select("contact_id").eq("id", p.messageId).eq("tenant_id", p.tenantId).maybeSingle();
  if (sent.error) throw new Error(`email receipt: cannot read who message ${p.messageId} went to: ${sent.error.message}`);
  if (!sent.data?.contact_id) return null;
  const { data, error } = await db.from("contacts").update({ email_suppressed_at: p.at, email_suppressed_reason: p.reason }).eq("id", sent.data.contact_id).eq("tenant_id", p.tenantId).in("email", p.addresses).is("email_suppressed_at", null).select("id");
  if (error) throw new Error(`email receipt: cannot stop sends to the address: ${error.message}`);
  return data?.[0]?.id ?? null;
}

// src/repositories/routing.ts
var POS_TTL_MS = 5 * 60 * 1e3;
var NEG_TTL_MS = 60 * 1e3;
var cache = /* @__PURE__ */ new Map();
async function resolveChannelDetailed(db, kind, externalId) {
  const key = `${kind}:${externalId}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return { channel: hit.v, lookupFailed: false };
  const { data, error } = await db.from("tenant_channels").select("id, tenant_id, kind, status, number_e164, credentials_ref, config, external_id").eq("kind", kind).eq("external_id", externalId).maybeSingle();
  if (error) {
    console.error("resolve_channel_failed", error.message);
    if (hit?.v) return { channel: hit.v, lookupFailed: false };
    return { channel: null, lookupFailed: true };
  }
  const routed = data && data.status === "active" ? {
    channelId: data.id,
    tenantId: data.tenant_id,
    kind: data.kind,
    externalId: data.external_id,
    numberE164: data.number_e164,
    credentialsRef: data.credentials_ref,
    config: data.config
  } : null;
  cache.set(key, { v: routed, exp: Date.now() + (routed ? POS_TTL_MS : NEG_TTL_MS) });
  return { channel: routed, lookupFailed: false };
}
async function resolveChannel(db, kind, externalId) {
  return (await resolveChannelDetailed(db, kind, externalId)).channel;
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
    // The provider URL is NOT written to the row: calls is in the realtime
    // publication, so every column reaches every member's browser, and the
    // REST layer's care in stripping it was being undone one layer down. A
    // retry asks the provider for a fresh URL by call id.
    p_recording: n.recordingUrl ? { fetch_state: "pending" } : null,
    p_public_log_url: n.publicLogUrl,
    p_cost: n.cost ?? null,
    p_latency: n.latency ?? null,
    p_raw: raw ?? {},
    p_analysis: n.analysis ?? null
  });
  if (error) throw new Error(`ingest_call: ${error.message}`);
  return data;
}
async function linkCallMessage(db, tenantId, callId, messageId) {
  const { data, error } = await db.from("calls").update({ message_id: messageId }).eq("id", callId).eq("tenant_id", tenantId).select("id");
  if (error) console.error("link_call_message_failed", error.message);
  else if (!data || data.length === 0) console.error("link_call_message_noop", JSON.stringify({ tenant: tenantId, call: callId }));
}
async function setCallRecording(db, tenantId, callId, recording) {
  const { data, error } = await db.from("calls").update({ recording }).eq("id", callId).eq("tenant_id", tenantId).select("id");
  if (error) console.error("set_call_recording_failed", error.message);
  else if (!data || data.length === 0) console.error("set_call_recording_noop", JSON.stringify({ tenant: tenantId, call: callId }));
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
    if (error.code === "23505") {
      const { data: prior } = await db.from("messages").select("id").eq("tenant_id", p.tenantId).eq("external_id", p.externalId).maybeSingle();
      return prior?.id ?? null;
    }
    console.error("record_call_note_failed", error.message);
    return null;
  }
  return data.id;
}
async function claimCallNotification(db, tenantId, callId) {
  const { data, error } = await db.from("calls").update({ notified_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", callId).eq("tenant_id", tenantId).is("notified_at", null).select("id");
  if (error) throw new Error(`claim_call_notification: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// src/repositories/thread.ts
var DELIVERED = ["sent", "delivered", "read"];
var DAY_MS2 = 24 * 3600 * 1e3;
var BLOB_CALL_NOTE = /^\[voice call note /;
var isBackfill = (m) => !!m.meta && typeof m.meta === "object" && m.meta.backfill === true;
var isAcknowledgement = (m) => !!m.meta && typeof m.meta === "object" && m.meta.ack === true;
var effectiveAt = (m) => new Date(m.channel_ts ?? m.created_at).getTime();
function assembleHistory(rows, limit) {
  const kept = rows.filter((m) => {
    const body = (m.body ?? "").trim();
    if (!body) return false;
    if (m.direction === "outbound" && !DELIVERED.includes(String(m.status))) return false;
    if (isBackfill(m) && BLOB_CALL_NOTE.test(body)) return false;
    return true;
  });
  kept.sort((a, b) => effectiveAt(a) - effectiveAt(b));
  return kept.map((m) => ({
    // A call note is the customer's own history on another channel — one
    // agent, so it counts the same as a message.
    role: m.sender === "customer" ? "user" : "assistant",
    content: (m.body ?? "").trim()
  })).slice(-limit);
}
var HISTORY_COLUMNS = "body, sender, direction, type, status, created_at, channel_ts, meta";
async function readThreadState(db, tenantId, conversationId, pausedUntilIso, historyLimit = 16) {
  const since = new Date(Date.now() - DAY_MS2).toISOString();
  const [recent, replies] = await Promise.all([
    db.from("messages").select(HISTORY_COLUMNS).eq("tenant_id", tenantId).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(historyLimit * 3),
    // headroom: duplicates and blanks drop out below
    db.from("messages").select("created_at, meta").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("sender", "ai").eq("direction", "outbound").in("status", DELIVERED).gte("created_at", since)
  ]);
  if (recent.error) throw new Error(`readThreadState/history: ${recent.error.message}`);
  if (replies.error) throw new Error(`readThreadState/replies: ${replies.error.message}`);
  const history = assembleHistory(recent.data ?? [], historyLimit);
  const repliedBefore = (recent.data ?? []).some(
    (m) => m.direction === "outbound" && DELIVERED.includes(String(m.status))
  );
  return {
    history,
    repliedBefore,
    seen: [],
    pausedUntil: pausedUntilIso ? new Date(pausedUntilIso).getTime() : 0,
    // Imported rows carry the timestamp of the IMPORT, not of a send. Counting
    // them would let a backfill silence the bot for a day against a cap it
    // never actually spent.
    replies: (replies.data ?? []).filter((r) => !isBackfill(r) && !isAcknowledgement(r)).map((r) => new Date(r.created_at).getTime())
  };
}
var EMPTY_LEAD = {
  contactId: null,
  conversationId: null,
  name: null,
  returning: false,
  lastSeenAt: null,
  history: [],
  optedOut: false
};
async function readLeadContext(db, tenantId, phoneE164, historyLimit = 16) {
  const { data: contact, error: cErr } = await db.from("contacts").select("id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes").eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
  if (cErr) throw new Error(`readLeadContext/contact: ${cErr.message}`);
  if (!contact) return EMPTY_LEAD;
  const { data: conv, error: vErr } = await db.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", contact.id).maybeSingle();
  if (vErr) throw new Error(`readLeadContext/conversation: ${vErr.message}`);
  let history = [];
  if (conv) {
    const { data: rows, error: hErr } = await db.from("messages").select(HISTORY_COLUMNS).eq("tenant_id", tenantId).eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(historyLimit * 3);
    if (hErr) throw new Error(`readLeadContext/history: ${hErr.message}`);
    history = assembleHistory(rows ?? [], historyLimit);
  }
  return {
    contactId: contact.id,
    conversationId: conv?.id ?? null,
    // display_name is what a human typed; wa_profile_name is what WhatsApp
    // reports. The human's version wins, and neither is invented.
    name: contact.display_name || contact.wa_profile_name || null,
    // Having said anything at all is what makes someone returning — not merely
    // existing as a row, which an outbound-only contact would also satisfy.
    returning: history.length > 0,
    lastSeenAt: contact.last_seen_at ?? null,
    history,
    optedOut: contact.consent === "opted_out" || contact.dnc === true,
    notes: contact.notes ?? null
  };
}
function describeLead(lead, now = /* @__PURE__ */ new Date()) {
  if (!lead.contactId) return "New contact \u2014 no prior history on record.";
  const bits = [];
  bits.push(lead.name ? `Name on record: ${lead.name}.` : "No name on record.");
  if (lead.returning) {
    const days = lead.lastSeenAt ? Math.floor((now.getTime() - new Date(lead.lastSeenAt).getTime()) / 864e5) : null;
    const when = days === null ? "" : days <= 0 ? " Last in touch today." : days === 1 ? " Last in touch yesterday." : ` Last in touch ${days} days ago.`;
    bits.push(`Returning contact.${when}`);
  } else {
    bits.push("First time reaching out.");
  }
  if (lead.optedOut) bits.push("They have asked not to receive messages.");
  const notes = (lead.notes ?? "").replace(/\s+/g, " ").trim();
  if (notes) bits.push(`Notes from the owner about them (use as facts, never read aloud or quoted): ${notes}`);
  return bits.join(" ");
}

// src/repositories/control.ts
var CALL_CONTROL_S = 15 * 60;
async function claimControl(db, p) {
  const { data, error } = await db.rpc("claim_conversation_control", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_kind: p.holder.kind,
    p_by: p.holder.kind === "person" ? p.holder.userId : null,
    p_ref: p.holder.kind === "call" ? p.holder.callId : null,
    p_seconds: p.seconds
  });
  if (error) throw new Error(`claim_conversation_control: ${error.message}`);
  return data;
}
async function releaseControl(db, p) {
  const { data, error } = await db.rpc("release_conversation_control", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_kind: p.holder.kind,
    p_by: p.holder.kind === "person" ? p.holder.userId : null,
    p_ref: p.holder.kind === "call" ? p.holder.callId : null
  });
  if (error) throw new Error(`release_conversation_control: ${error.message}`);
  return data === true;
}

// src/repositories/templates.ts
async function templatesFor(db, tenantId, channel = "whatsapp") {
  const { data, error } = await db.from("templates").select("name, language, category, meta_status, body_preview, title, variables").eq("tenant_id", tenantId).eq("channel", channel);
  if (error) throw new Error(`templatesFor: ${error.message}`);
  return data ?? [];
}

// src/repositories/control-plane.ts
async function getTenantConfig(db, tenantId) {
  const { data, error } = await db.from("tenant_config").select("tenant_id, config, version, updated_at, updated_by").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`getTenantConfig: ${error.message}`);
  return data;
}
async function putTenantConfig(db, tenantId, config, expectedVersion, updatedBy) {
  const { data, error } = await db.from("tenant_config").update({ config, version: expectedVersion + 1, ...updatedBy ? { updated_by: updatedBy } : {} }).eq("tenant_id", tenantId).eq("version", expectedVersion).select("tenant_id, config, version, updated_at, updated_by").maybeSingle();
  if (error) throw new Error(`putTenantConfig: ${error.message}`);
  if (data) return { ok: true, row: data };
  const existing = await getTenantConfig(db, tenantId);
  return { ok: false, reason: existing ? "stale" : "missing" };
}
async function listPolicies(db, tenantId) {
  const { data, error } = await db.from("policies").select("id, class, mode, subject_type, subject_id, limits, updated_at").eq("tenant_id", tenantId).is("subject_type", null).order("class");
  if (error) throw new Error(`listPolicies: ${error.message}`);
  return data ?? [];
}
async function setPolicyMode(db, tenantId, policyClass, mode, limits) {
  let merged;
  if (limits && Object.keys(limits).length) {
    const { data: current } = await db.from("policies").select("limits").eq("tenant_id", tenantId).eq("class", policyClass).is("subject_type", null).maybeSingle();
    merged = { ...current?.limits ?? {}, ...limits };
  }
  const { data, error } = await db.from("policies").update(merged ? { mode, limits: merged } : { mode }).eq("tenant_id", tenantId).eq("class", policyClass).is("subject_type", null).select("id, class, mode, subject_type, subject_id, limits, updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function personReplyMode(db, tenantId, contactId) {
  const { data, error } = await db.from("policies").select("mode").eq("tenant_id", tenantId).eq("class", "reply").eq("subject_type", "contact").eq("subject_id", contactId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.mode ?? null;
}
async function setPersonReplyMode(db, tenantId, contactId, mode) {
  if (mode === null) {
    const { error: error2 } = await db.from("policies").delete().eq("tenant_id", tenantId).eq("class", "reply").eq("subject_type", "contact").eq("subject_id", contactId);
    if (error2) throw new Error(error2.message);
    return;
  }
  const { error } = await db.from("policies").upsert(
    { tenant_id: tenantId, class: "reply", mode, subject_type: "contact", subject_id: contactId },
    { onConflict: "tenant_id,class,subject_type,subject_id" }
  );
  if (error) throw new Error(error.message);
}

// src/realtime.ts
var WATCHED = [
  { table: "messages", event: "INSERT" },
  { table: "conversations", event: "*" },
  // the pause and snooze clocks, other tabs
  { table: "escalations", event: "*" },
  // opened by the edge, resolved elsewhere
  { table: "calls", event: "*" },
  // a call starting, each live turn, its end, its analysis
  { table: "notifications", event: "INSERT" },
  // an alert the edge kept: the bell repaints
  { table: "lines", event: "*" },
  // a line's saga step, its failure, its answer: Setup repaints
  { table: "google_listings", event: "*" },
  // the listing linked, read, or removed: Setup and Reports repaint
  { table: "google_reviews", event: "INSERT" },
  // a review seen for the first time
  { table: "billing_accounts", event: "*" },
  // Stripe's answer, applied by the webhook: Billing and Setup repaint
  { table: "tenant_channels", event: "*" },
  // a channel connected, switched off, or written by a line's saga: Setup and Connections repaint (00117)
  { table: "capability_activations", event: "*" },
  // the owner's act, in another tab: Setup repaints (00108)
  { table: "business_records", event: "*" },
  // the record the carriers read, saved on Connections: Setup repaints (00075)
  { table: "google_connections", event: "*" },
  // the profile connected, synced or failing by the hourly sweep: Connections repaints (00070)
  // a round's page committed, a check landed, a class changed: the Leads scope repaints (00140)
  { table: "leads", event: "*" },
  { table: "lead_searches", event: "*" },
  { table: "lead_rounds", event: "*" },
  { table: "lead_search_members", event: "*" }
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
        // The event too: a surface may want a call STARTING and ENDING and
        // not the transcript turn every few seconds in between.
        (payload) => onInsert(payload.new ?? payload.old ?? {}, w.table, payload.eventType)
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
  CALL_CONTROL_S,
  HISTORY_COLUMNS,
  assembleHistory,
  claimCallNotification,
  claimControl,
  countSentToday,
  createServiceClient,
  describeLead,
  emitEvent,
  getTenantConfig,
  ingestCall,
  ingestInbound,
  ingestInboundEmail,
  lastInboundEmail,
  linkCallMessage,
  listPolicies,
  mailboxById,
  mailboxFor,
  mailboxOfTenant,
  markProcessed,
  pauseConversation,
  personReplyMode,
  putTenantConfig,
  readLeadContext,
  readThreadState,
  recordCallNote,
  recordEchoAndPause,
  recordEmailStatus,
  recordOutbound,
  recordStatusByExternalId,
  releaseControl,
  resolveChannel,
  resolveChannelDetailed,
  resolveOutboundTarget,
  sentEmailWithMessageId,
  setCallRecording,
  setPersonReplyMode,
  setPolicyMode,
  stampEmailSent,
  stampMailboxReceived,
  subscribeMessagesInserts,
  suppressEmailOf,
  templatesFor
};
