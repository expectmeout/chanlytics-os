// ../channels/dist/index.js
import { z } from "zod";
import { z as z2 } from "zod";
import { z as z3 } from "zod";
import { z as z4 } from "zod";
import { z as z5 } from "zod";
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
  "channel.connected"
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
var CALL_HEARTBEAT_MS = 10 * 60 * 1e3;
var CALL_OUTCOMES = ["answered", "booking_link_sent", "callback_needed", "voicemail", "no_request", "other"];
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
  cron_history: 14
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
var DAY_MS4 = 24 * 3600 * 1e3;
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
var DAY_MS5 = 864e5;
var PLAYBOOK_HOURS = { min: 9, max: 20 };
var SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00\u2013${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`
};
var PLAYBOOK_BREATH_MS = 7 * DAY_MS5;
var PLAYBOOK_VETO_DELAY_MS = 30 * 6e4;
var PLAYBOOK_CLASS_LABEL = {
  reengage: POLICY_CLASS_WORDS.reengage.short,
  campaign: POLICY_CLASS_WORDS.campaign.short,
  booking: POLICY_CLASS_WORDS.booking.short
};
var DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WHEN2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DAY_MS6 = 864e5;
var QUIET_AFTER_MS2 = 7 * DAY_MS6;
var DATE_FMT2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
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
var GRAPH = "https://graph.facebook.com/v25.0";
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
var MEDIA_MAX_BYTES = 25 * 1024 * 1024;
function greetingFor(name) {
  const who = name ? ` ${name}` : "";
  return `Thank you for calling${who}! This call may be recorded. I'm the automated assistant \u2014 how can I help you today?`;
}
var GREETING_DEFAULT = greetingFor(null);
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
var enc = new TextEncoder();
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
var FRESH_SLACK_MS = 2 * 864e5;
var STATE_TTL_MS = 10 * 6e4;
var enc2 = new TextEncoder();
var dec = new TextDecoder();

// ../contracts/dist/index.js
import { z as z6 } from "zod";
import { z as z22 } from "zod";
import { z as z32 } from "zod";
import { z as z42 } from "zod";
import { z as z52 } from "zod";
z6.config({ jitless: true });
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
var LABEL2 = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
var LOCAL2 = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
var SHAPE2 = new RegExp(`^(${LOCAL2})@(${LABEL2}(?:\\.${LABEL2})+)$`);
var EVENT_KINDS2 = [
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
  "channel.connected"
];
var OFFERS_OPT_IN_PHRASES2 = { en: "YES OFFERS", es: "SI OFERTAS" };
var DECISION_VERBS2 = [
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
function purposeOfTemplate(category) {
  return category === "utility" || category === "authentication" ? "conversational" : "marketing";
}
function purposeOfPlaybook(policyClass) {
  return policyClass === "booking" ? "conversational" : "marketing";
}
var DAY_MS2 = 864e5;
var WEEK_MS4 = 7 * DAY_MS2;
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
var FORMATS = /* @__PURE__ */ new Map();
function formatsFor(tz) {
  const hit = FORMATS.get(tz);
  if (hit) return hit;
  let zone = tz || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const made = {
    zone,
    time: new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }),
    date: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }),
    dateYear: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", year: "numeric" }),
    parts: new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  };
  FORMATS.set(tz, made);
  return made;
}
var WALLS = /* @__PURE__ */ new Map();
var WALLS_MAX = 2048;
function wall(atMs, tz) {
  const id = `${tz}|${atMs}`;
  const hit = WALLS.get(id);
  if (hit) return hit;
  const p = {};
  for (const x of formatsFor(tz).parts.formatToParts(new Date(atMs))) p[x.type] = x.value;
  const made = { key: `${p.year}-${p.month}-${p.day}`, year: Number(p.year), hh: Number(p.hour) % 24, mm: Number(p.minute) };
  if (WALLS.size >= WALLS_MAX) WALLS.clear();
  WALLS.set(id, made);
  return made;
}
function clockDate(atMs, tz, nowMs) {
  const f = formatsFor(tz);
  return wall(atMs, tz).year === wall(nowMs, tz).year ? f.date.format(new Date(atMs)) : f.dateYear.format(new Date(atMs));
}
var BRAIN_INTENTS2 = ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
var BRAIN_LANGUAGES2 = ["en", "es", "other"];
var BRAIN_OUTPUT_JSON_SCHEMA2 = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here."
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS2],
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
      enum: [...BRAIN_LANGUAGES2],
      description: "The language the reply is written in."
    }
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false
};
var BrainOutputSchema2 = z22.object({
  reply: z22.string(),
  intent: z22.enum(BRAIN_INTENTS2).catch("other"),
  escalate: z22.boolean().catch(false),
  reason: z22.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z22.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z22.array(z22.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: z22.enum(BRAIN_LANGUAGES2).catch("other")
});
var WA_WINDOW_MS2 = 24 * 3600 * 1e3;
function waWindow(lastWaInboundAtIso, now = /* @__PURE__ */ new Date()) {
  if (!lastWaInboundAtIso) return { open: false, closesAtIso: null };
  const closes = new Date(lastWaInboundAtIso).getTime() + WA_WINDOW_MS2;
  return { open: closes > now.getTime(), closesAtIso: new Date(closes).toISOString() };
}
function replyWindow(replyChannel, lastWaInboundAtIso, now = /* @__PURE__ */ new Date()) {
  return replyChannel === "sms" ? { open: true, closesAtIso: null } : waWindow(lastWaInboundAtIso, now);
}
var CALL_HEARTBEAT_MS2 = 10 * 60 * 1e3;
var RETENTION_DAYS2 = {
  /** Call audio in the private media bucket. The transcript and the summary stay with the call (api/cron/calls). */
  call_recordings: 90,
  /** The evidence kinds on the events ledger (EVENT_EVIDENCE_KINDS); every other kind is the record and is kept (purge_events, 00115). */
  events_evidence: 30,
  /** Assistant threads untouched for this long, with their messages (purge_ask, 00040). */
  ask_threads: 90,
  /** The bell's rows and their marks (purge_notifications, 00057). */
  notifications: 90,
  /** The sweeps' run history; a clock that fires every few minutes keeps a day (purge_cron_history, 00099). */
  cron_history: 14
};
var RECORDING_RETENTION_DAYS2 = RETENTION_DAYS2.call_recordings;
var RECORDING_PURGED_WORDS2 = `Recording removed after ${RECORDING_RETENTION_DAYS2} days; the transcript is kept`;
var PRIVATE_HOST2 = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;
function feedUrlOk2(raw) {
  if (!raw) return null;
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (PRIVATE_HOST2.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return null;
  return u.toString();
}
function feedProblemWords2(reason, status) {
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
var POLICY_CLASS_WORDS2 = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: { name: "Service & pricing questions", short: "Questions", note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone" },
  booking: { name: "Book \xB7 reschedule", short: "Bookings", note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone" },
  reengage: { name: "Re-engage quiet customers", short: "Re-engage", note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  campaign: { name: "Standing offers", short: "Offers", note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  reviews: { name: "Google reviews", short: "Reviews", note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you" },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" }
};
var PolicyLimitsSchema2 = z32.object({
  max_replies_day: z32.number().int().min(1).max(200).optional(),
  pause_hours: z32.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: z32.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: z32.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: z32.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME2 = z32.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema2 = z32.object({ open: TIME2, close: TIME2 });
var HoursSchema2 = z32.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME2.nullable().optional(),
  close: TIME2.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: z32.array(IntervalSchema2).optional()
}).strict();
var DATE2 = z32.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema2 = z32.object({
  date: DATE2,
  until: DATE2.optional(),
  note: z32.string().max(200).optional()
});
var DAYS2 = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema2 = z32.object({
  name: z32.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: z32.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: z32.string().max(120).optional()
}).strict();
var GuardrailsSchema2 = z32.object({
  never_quote_prices: z32.boolean().optional(),
  never_confirm_booking: z32.boolean().optional(),
  disclose_ai: z32.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: z32.boolean().optional()
}).strict();
var NoteSchema2 = z32.object({
  title: z32.string().min(1).max(80),
  text: z32.string().min(1).max(1200)
}).strict();
var BookingRulesSchema2 = z32.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: z32.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: z32.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: z32.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: z32.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: z32.array(z32.string().min(1).max(80)).max(20).optional(),
  party_max: z32.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: z32.array(z32.string().min(1).max(200)).max(10).optional()
}).strict();
var E1642 = /^\+[1-9]\d{6,14}$/;
var INSTRUCTIONS_MAX2 = 2e4;
var BusinessProfileSchema2 = z32.object({
  address: z32.string().max(300).optional(),
  hours: z32.partialRecord(z32.enum(DAYS2), HoursSchema2).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: z32.array(ClosureSchema2).optional(),
  services: z32.array(ServiceSchema2).max(60).optional(),
  languages: z32.array(z32.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema2.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: z32.array(z32.string().min(1).max(200)).max(20).optional(),
  tone: z32.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: z32.string().regex(E1642, "E.164, like +16469325775").optional(),
  website: z32.string().url().max(500).optional(),
  notes: z32.array(NoteSchema2).max(10).optional(),
  booking_rules: BookingRulesSchema2.optional(),
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
  extra_instructions: z32.string().max(INSTRUCTIONS_MAX2).optional()
}).strict();
var BrainConfigSchema2 = z32.object({
  business_name: z32.string().min(1).max(120),
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
  phone_display: z32.string().min(3).max(40).optional(),
  booking_link: z32.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: z32.string().min(40).max(INSTRUCTIONS_MAX2),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema2.optional(),
  fallbacks: z32.object({
    /** Sent when no model key is configured. */
    greeting: z32.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: z32.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: z32.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema2 = z32.object({
  escalation_emails: z32.array(z32.string().email()).min(1).max(10),
  from: z32.string().max(200).optional()
}).strict();
var CalendarConfigSchema2 = z32.object({
  ical_url: z32.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema2 = z32.object({ vision: z32.boolean().optional() }).strict();
var TenantConfigSchema2 = z32.object({
  brain: BrainConfigSchema2.optional(),
  notifications: NotificationsConfigSchema2.optional(),
  calendar: CalendarConfigSchema2.optional(),
  features: FeaturesConfigSchema2.optional()
});
var MAX_INTERVALS_PER_DAY2 = 4;
var MAX_CLOSURES2 = 60;
function isRealDate2(key) {
  const at2 = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at2.getTime()) && at2.toISOString().slice(0, 10) === key;
}
var DAY_NAME2 = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function checkDay2(h, day, ctx) {
  const name = DAY_NAME2[day] ?? day;
  const at2 = (...rest) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: z32.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z32.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY2) {
    ctx.addIssue({
      code: z32.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY2} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z32.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z32.ZodIssueCode.custom,
        path: at2("intervals", n, "open"),
        message: `${name}: two shifts overlap.`
      });
    }
  }
}
function checkClosure2(c, n, ctx) {
  const at2 = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate2(c.date)) {
    ctx.addIssue({
      code: z32.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate2(c.until)) {
    ctx.addIssue({
      code: z32.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z32.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema2 = TenantConfigSchema2.superRefine((cfg, ctx) => {
  if (cfg.calendar && !feedUrlOk2(cfg.calendar.ical_url)) {
    ctx.addIssue({ code: z32.ZodIssueCode.custom, path: ["calendar", "ical_url"], message: feedProblemWords2("address") ?? "Not an address the receptionist may read." });
  }
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay2(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES2) {
    ctx.addIssue({
      code: z32.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES2} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure2(c, n, ctx));
});
function keyParts(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m ?? 1, d: d ?? 1 };
}
function shiftKey(key, n) {
  const { y, m, d } = keyParts(key);
  const at2 = new Date(Date.UTC(y, m - 1, d + n));
  return `${at2.getUTCFullYear()}-${String(at2.getUTCMonth() + 1).padStart(2, "0")}-${String(at2.getUTCDate()).padStart(2, "0")}`;
}
var SHORT2 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
function zoneMidnight(tz, key) {
  const { y, m, d } = keyParts(key);
  return localToUtcMs(tz, y, m, d, 0, 0);
}
var LIVE_STALE_MS2 = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS2 = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS2 = 10 * 60 * 1e3;
var ms = (t) => typeof t === "number" ? t : Date.parse(t);
function visitStartTime(v, tz) {
  if (v.allDay || v.all_day) return "all day";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms(v.start)));
}
var PERSON_MODE_LABELS2 = { auto: "Answer", ask: "Ask me first", never: "Never" };
var PERSON_MODE_WORDS2 = { ...PERSON_MODE_LABELS2, inherit: "Follow the workspace" };
var DAY_MS32 = 864e5;
var WEEK_MS22 = 7 * DAY_MS32;
var MONTH_MS2 = 30 * DAY_MS32;
var NEW_WINDOW_MS2 = 7 * DAY_MS32;
var QUIET_AFTER_MS3 = 30 * DAY_MS32;
function mayReceive(r, purpose) {
  if (!r.phone) return false;
  return mayMessageFor(
    { consent: r.consent.state, dnc: r.consent.dnc, marketing_consent: r.consent.marketing },
    purpose,
    { proactive: true }
  ).ok;
}
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
var DAY_MS42 = 24 * 3600 * 1e3;
var ASK_CAPS2 = {
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
var ASK_CITATION_KINDS2 = ["thread", "conversation", "call", "person", "page"];
var ASK_LANGUAGES2 = ["en", "es", "other"];
var ASK_FINISH_JSON_SCHEMA2 = {
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
          kind: { type: "string", enum: [...ASK_CITATION_KINDS2] },
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
    language: { type: "string", enum: [...ASK_LANGUAGES2] }
  },
  required: ["answer", "citations", "followups", "navigate", "language"],
  additionalProperties: false
};
var clip2 = (n) => (s) => s.trim().slice(0, n);
var TAG_CUT2 = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
function cleanAnswer2(raw) {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT2);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}
var AskFinishSchema2 = z42.object({
  answer: z42.string().catch("").transform((s) => clip2(1500)(cleanAnswer2(s))),
  citations: z42.array(
    z42.object({
      kind: z42.enum(ASK_CITATION_KINDS2).catch("page"),
      id: z42.string().catch("").transform(clip2(200)),
      label: z42.string().catch("").transform(clip2(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS2.citations)),
  followups: z42.array(z42.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS2.followups).map((s) => s.slice(0, 90))),
  navigate: z42.object({ to: z42.string().catch(""), label: z42.string().catch(""), now: z42.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: z42.enum(ASK_LANGUAGES2).catch("other")
});
var ASK_UNDO_MS2 = 10 * 6e4;
var AskProposalOutcomeSchema2 = z42.object({
  state: z42.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z42.string().max(300).catch(""),
  atMs: z42.number().catch(0),
  undo: z42.record(z42.string(), z42.unknown()).nullable().optional()
});
var AskSettingsChangeSchema2 = z42.discriminatedUnion("op", [
  z42.object({ op: z42.literal("add_closure"), date: z42.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z42.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z42.string().max(200).optional() }),
  z42.object({ op: z42.literal("set_hours"), day: z42.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z42.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z42.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z42.object({ op: z42.literal("add_note"), title: z42.string().min(1).max(80), text: z42.string().min(1).max(1200) }),
  z42.object({ op: z42.literal("add_service"), name: z42.string().min(1).max(80), duration_min: z42.number().int().min(1).max(1440).optional() })
]);
var FIRST2 = { kind: "first_name", label: "First name", example: "Dani" };
var BUSINESS2 = { kind: "business_name", label: "Business name", example: "Luna Studio" };
var LINK2 = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
var FIRST_ES2 = { ...FIRST2, label: "Nombre" };
var BUSINESS_ES2 = { ...BUSINESS2, label: "Nombre del negocio" };
var LINK_ES2 = { ...LINK2, label: "Enlace de reservas" };
var WHEN3 = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
var SERVICE2 = { kind: "visit_service", label: "Service", example: "a consultation" };
var WHEN_ES2 = { ...WHEN3, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
var SERVICE_ES2 = { ...SERVICE2, label: "Servicio", example: "una consulta" };
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
        slots: [FIRST2, BUSINESS2, LINK2]
      },
      es: {
        body: "Hola {{1}}, hace tiempo que no te vemos en {{2}}. Nos encantar\xEDa volver a atenderte \u2014 elige la hora que mejor te venga aqu\xED: {{3}} y nosotros nos ocupamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES2, BUSINESS_ES2, LINK_ES2]
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
        slots: [FIRST2, BUSINESS2, LINK2]
      },
      es: {
        body: "Hola {{1}}, \xA1bienvenido/a a {{2}}! Este es nuestro WhatsApp \u2014 escr\xEDbenos aqu\xED cuando quieras para reservar, cambiar o preguntar por una cita. Reserva cuando quieras: {{3}} y nosotros nos encargamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES2, BUSINESS_ES2, LINK_ES2]
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
        slots: [FIRST2, BUSINESS2, LINK2]
      },
      es: {
        body: "Hola {{1}}, gracias por llamar a {{2}}. Guarda este n\xFAmero \u2014 por WhatsApp puedes reservar, cambiar tu cita o preguntarnos lo que quieras, y respondemos r\xE1pido. Reserva cuando quieras: {{3}} o escr\xEDbenos aqu\xED.",
        footer: STOP_ES,
        slots: [FIRST_ES2, BUSINESS_ES2, LINK_ES2]
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
        slots: [FIRST2, BUSINESS2, { kind: "text", label: "The offer", example: "20% off any service booked before Friday." }, LINK2]
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aqu\xED: {{4}} \u2014 las plazas son limitadas.",
        footer: STOP_ES,
        slots: [FIRST_ES2, BUSINESS_ES2, { kind: "text", label: "La oferta", example: "20% de descuento en cualquier servicio reservado antes del viernes." }, LINK_ES2]
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
        slots: [FIRST2, BUSINESS2, WHEN3, SERVICE2]
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Te recordamos tu cita {{3}} para {{4}}. Si necesitas cambiarla, responde aqu\xED.",
        footer: null,
        slots: [FIRST_ES2, BUSINESS_ES2, WHEN_ES2, SERVICE_ES2]
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
        slots: [FIRST2, BUSINESS2, LINK2]
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}} \u2014 esperamos que te encante el resultado. Cuando quieras tu pr\xF3xima cita, elige la hora aqu\xED: {{3}}.",
        footer: STOP_ES,
        slots: [FIRST_ES2, BUSINESS_ES2, LINK_ES2]
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
        slots: [FIRST2, BUSINESS2, { kind: "text", label: "The note", example: "we're open late on Thursdays this month." }]
      },
      es: {
        body: "Hola {{1}}, una nota r\xE1pida de {{2}}: {{3}} Escr\xEDbenos aqu\xED si tienes alguna pregunta.",
        footer: STOP_ES,
        slots: [FIRST_ES2, BUSINESS_ES2, { kind: "text", label: "La nota", example: "este mes abrimos hasta tarde los jueves." }]
      }
    }
  }
];
function starterByName(name) {
  return STARTER_TEMPLATES.find((s) => s.name === name) ?? null;
}
function starterForTrigger(trigger) {
  if (!trigger) return null;
  return STARTER_TEMPLATES.find((s) => s.trigger === trigger) ?? null;
}
function starterText(s, language) {
  return s.texts[language] ?? s.texts.en_US;
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
function inboxSlots(t) {
  return Array.isArray(t.variables) ? defaultParamSpecs({ name: t.name, variables: t.variables }) : [{ kind: "business_name" }, { kind: "booking_link" }];
}
function slotToWrite(t) {
  const at2 = inboxSlots(t).findIndex((s) => s.kind === "text" || s.kind === "visit_when" || s.kind === "visit_service");
  if (at2 < 0) return null;
  return slotLabels({ name: t.name, language: t.language ?? "en_US", variables: t.variables })[at2] ?? `Value ${at2 + 1}`;
}
var BROADCAST_CHUNK = 25;
var BROADCAST_GAP_MS = 300;
var BROADCAST_MAX_RECIPIENTS = 2e3;
var BROADCAST_PARAM_MAX = 1024;
var BROADCAST_SCHEDULE_MAX_DAYS = 30;
var BROADCAST_NAME_MAX = 80;
var REPLY_WINDOW_HOURS2 = 72;
var REPLY_WINDOW_MS2 = REPLY_WINDOW_HOURS2 * 36e5;
var REPLY_WINDOW_WORDS2 = `within ${REPLY_WINDOW_HOURS2 / 24} days`;
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
function broadcastName(templateName, tz, now = /* @__PURE__ */ new Date(), title) {
  const day = clockDate(now.getTime(), tz, now.getTime());
  return `${templateTitle(templateName, title)} \xB7 ${day}`.slice(0, BROADCAST_NAME_MAX);
}
var OUTCOME_UNKNOWN = "outcome_unknown";
function emptyAudienceRefusal(purpose) {
  return purpose === "marketing" ? "Nobody there has said yes to offers yet \u2014 that is a separate answer from saying yes to messages, and only it puts somebody on a promotional broadcast. Record it under \u201COffers and news\u201D on a person's profile, or get their yes with the phrase and QR on this page." : "Nobody there has said yes to messages yet. Even a reminder about their own visit needs their recorded yes. Record it on a person's profile, or get their yes with the phrase and QR on this page.";
}
var LIMIT_TIERS2 = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
function overLimitRefusal(h, audience) {
  if (h.limitPerDay === null || audience <= h.limitPerDay) return null;
  return `This number can start up to ${h.limitPerDay.toLocaleString("en-US")} new conversations a day; this audience is ${audience.toLocaleString("en-US")}. Send to a smaller list or split it.`;
}
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
function parseParamSpecs(raw) {
  return Array.isArray(raw) ? raw.map((p) => parseParamSpec(p) ?? { kind: "text", value: String(p) }) : [];
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
var DAY_MS52 = 864e5;
var PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", kind: "list", hint: "Nothing heard in 30 days" },
  { id: "new_week", label: "Welcome", list: "new_week", cls: "campaign", kind: "list", hint: "First contact in the last 7 days" },
  { id: "phoned_only", label: "Save our number", list: "phoned_only", cls: "reengage", kind: "list", hint: "Only ever phoned, never texted" },
  { id: "everyone_monthly", label: "The month's offer", list: null, cls: "campaign", kind: "cadence", hint: "Everyone who said yes, on a cadence" },
  { id: "visit_tomorrow", label: "Visit reminder", list: null, cls: "booking", kind: "visit", hint: "The day before an appointment on the calendar" },
  { id: "visited", label: "After the visit", list: null, cls: "reengage", kind: "visit", hint: "The day after a visit, when nothing is booked next" }
];
var PLAYBOOK_DEFAULTS = { runHour: 10, capPerRun: 25, gapDays: 90, cadenceDays: 30 };
var PLAYBOOK_HOURS2 = { min: 9, max: 20 };
var SENDING_HOURS_WORDS2 = {
  min: PLAYBOOK_HOURS2.min,
  max: PLAYBOOK_HOURS2.max,
  first: `${PLAYBOOK_HOURS2.min}:00`,
  range: `${PLAYBOOK_HOURS2.min}:00\u2013${PLAYBOOK_HOURS2.max}:59`,
  between: `between ${PLAYBOOK_HOURS2.min}:00 and ${PLAYBOOK_HOURS2.max}:59`
};
var PLAYBOOK_BREATH_MS2 = 7 * DAY_MS52;
var PLAYBOOK_VETO_DELAY_MS2 = 30 * 6e4;
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
      if (p.trigger === "visit_tomorrow") return r.nextVisitDate !== null && r.nextVisitDate === localDate(r.calendarTz, new Date(nowMs + DAY_MS52));
      return r.lastVisitDate !== null && r.lastVisitDate === localDate(r.calendarTz, new Date(nowMs - DAY_MS52)) && !r.booked;
    });
    pool2.sort((a, b) => p.trigger === "visit_tomorrow" ? (a.nextVisitMs ?? 0) - (b.nextVisitMs ?? 0) : (a.lastVisitMs ?? 0) - (b.lastVisitMs ?? 0));
    return pool2;
  }
  const pool = t.list ? eligibleFor(rows, "list", t.list, null, purpose) : eligibleFor(rows, "everyone", null, null, purpose);
  const gapMs = (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) * DAY_MS52;
  const picked = pool.filter((r) => {
    const mine = touches.byThis.get(r.id);
    if (mine !== void 0 && nowMs - mine < gapMs) return false;
    const any = touches.byAny.get(r.id);
    if (any !== void 0 && nowMs - any < PLAYBOOK_BREATH_MS2) return false;
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
      return { kind: "send", state: "scheduled", at: new Date(now.getTime() + PLAYBOOK_VETO_DELAY_MS2) };
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
function nextOpenMoment(tz, when) {
  const { date, hour } = parts(tz, when);
  if (hour >= PLAYBOOK_HOURS2.min && hour <= PLAYBOOK_HOURS2.max) return { at: when, moved: false };
  const day = hour < PLAYBOOK_HOURS2.min ? date : shiftKey(date, 1);
  let at2 = zoneMidnight(tz, day) + PLAYBOOK_HOURS2.min * 36e5;
  const landed = parts(tz, new Date(at2)).hour;
  if (landed !== PLAYBOOK_HOURS2.min) at2 += (PLAYBOOK_HOURS2.min - landed) * 36e5;
  return { at: new Date(at2), moved: true };
}
var PLAYBOOK_CLASS_LABEL2 = {
  reengage: POLICY_CLASS_WORDS2.reengage.short,
  campaign: POLICY_CLASS_WORDS2.campaign.short,
  booking: POLICY_CLASS_WORDS2.booking.short
};
function visitFactsFor(trigger, visit, tz, sendAt) {
  const t = triggerOf(trigger);
  if (!t || t.kind !== "visit" || !visit) return null;
  return {
    visit_when: trigger === "visit_tomorrow" ? `${visitDayWord(visit, tz, sendAt, "tomorrow")} at ${visitStartTime(visit, tz)}` : visitDayWord(visit, tz, sendAt, "yesterday"),
    visit_service: visit.title.trim() || "your appointment"
  };
}
function visitDayWord(visit, tz, sendAt, assumed) {
  if (!sendAt) return assumed;
  const visitDay2 = localDate(tz, new Date(visit.start));
  const sendDay = localDate(tz, sendAt);
  const delta = Math.round((Date.parse(`${visitDay2}T00:00:00Z`) - Date.parse(`${sendDay}T00:00:00Z`)) / DAY_MS52);
  if (delta === 1) return "tomorrow";
  if (delta === 0) return "today";
  if (delta === -1) return "yesterday";
  try {
    return `on ${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date(visit.start))}`;
  } catch {
    return delta > 0 ? "soon" : "recently";
  }
}
var DATE_FMT5 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WHEN22 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DAY_MS62 = 864e5;
var QUIET_AFTER_MS22 = 7 * DAY_MS62;
var DATE_FMT22 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var FORWARDING_TEST_WINDOW_MS2 = 30 * 6e4;
var REVIEW_AUTO_REPLY_MAX_AGE_MS2 = 14 * 864e5;
var REVIEW_NEWS_MS2 = 36 * 3600 * 1e3;
var REVIEW_NEWS_MAX_AGE_MS2 = 14 * 864e5;
var BOOTSTRAP_MS2 = 3600 * 1e3;
var DATE_FMT32 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS32 = 7 * 864e5;
var DATE_FMT42 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var SOLE_PROP_LIMITS2 = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
var REGISTRATION_COST_WORDS2 = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS2.messagesPerSecond} message a second.`
};
var PROVISIONING_DEADLINE_MS2 = 5 * 6e4;
var SOLE_PROP_CEILING_SENTENCE2 = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS2.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE2 = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE2}`;
var SIGNUP_NAME_MIN2 = 2;
var SIGNUP_NAME_MAX2 = 120;
var SignupSchema2 = z52.object({
  name: z52.string().trim().min(SIGNUP_NAME_MIN2, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX2, "That name is too long \u2014 120 characters at most."),
  email: z52.string().trim().toLowerCase().email("Enter a work email address.").max(254),
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
  password: z52.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z52.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z52.string().trim().max(80).optional()
}).strict();
var PendingWorkspaceSchema2 = z52.object({
  name: z52.string().trim().min(SIGNUP_NAME_MIN2).max(SIGNUP_NAME_MAX2),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z52.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone2(v) ? v : null)
});
function isTimezone2(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}
var CONSENT_PHRASE2 = OFFERS_OPT_IN_PHRASES2.en;
var CONSENT_PHRASE_ES2 = OFFERS_OPT_IN_PHRASES2.es;
var ACTIVITY_KINDS2 = [...DECISION_VERBS2, ...EVENT_KINDS2];
var PASSWORD_MIN2 = 12;
var PASSWORD_WORDS2 = {
  label: "Password",
  chooseLabel: "Choose a password",
  newLabel: "New password",
  hint: `At least ${PASSWORD_MIN2} characters. A long phrase beats a short puzzle.`,
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

// ../db/dist/index.js
import { z as z7 } from "zod";
import { z as z23 } from "zod";
import { z as z33 } from "zod";
import { z as z43 } from "zod";
import { z as z53 } from "zod";
z7.config({ jitless: true });
var LABEL3 = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
var LOCAL3 = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
var SHAPE3 = new RegExp(`^(${LOCAL3})@(${LABEL3}(?:\\.${LABEL3})+)$`);
var EVENT_KINDS3 = [
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
  "channel.connected"
];
var OFFERS_OPT_IN_PHRASES3 = { en: "YES OFFERS", es: "SI OFERTAS" };
var DECISION_VERBS3 = [
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
var DAY_MS7 = 864e5;
var WEEK_MS5 = 7 * DAY_MS7;
var BRAIN_INTENTS3 = ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
var BRAIN_LANGUAGES3 = ["en", "es", "other"];
var BRAIN_OUTPUT_JSON_SCHEMA3 = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here."
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS3],
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
      enum: [...BRAIN_LANGUAGES3],
      description: "The language the reply is written in."
    }
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false
};
var BrainOutputSchema3 = z23.object({
  reply: z23.string(),
  intent: z23.enum(BRAIN_INTENTS3).catch("other"),
  escalate: z23.boolean().catch(false),
  reason: z23.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z23.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z23.array(z23.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: z23.enum(BRAIN_LANGUAGES3).catch("other")
});
var WA_WINDOW_MS3 = 24 * 3600 * 1e3;
var CALL_HEARTBEAT_MS3 = 10 * 60 * 1e3;
var RETENTION_DAYS3 = {
  /** Call audio in the private media bucket. The transcript and the summary stay with the call (api/cron/calls). */
  call_recordings: 90,
  /** The evidence kinds on the events ledger (EVENT_EVIDENCE_KINDS); every other kind is the record and is kept (purge_events, 00115). */
  events_evidence: 30,
  /** Assistant threads untouched for this long, with their messages (purge_ask, 00040). */
  ask_threads: 90,
  /** The bell's rows and their marks (purge_notifications, 00057). */
  notifications: 90,
  /** The sweeps' run history; a clock that fires every few minutes keeps a day (purge_cron_history, 00099). */
  cron_history: 14
};
var RECORDING_RETENTION_DAYS3 = RETENTION_DAYS3.call_recordings;
var RECORDING_PURGED_WORDS3 = `Recording removed after ${RECORDING_RETENTION_DAYS3} days; the transcript is kept`;
var PRIVATE_HOST3 = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;
function feedUrlOk3(raw) {
  if (!raw) return null;
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (PRIVATE_HOST3.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return null;
  return u.toString();
}
function feedProblemWords3(reason, status) {
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
var POLICY_CLASS_WORDS3 = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: { name: "Service & pricing questions", short: "Questions", note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone" },
  booking: { name: "Book \xB7 reschedule", short: "Bookings", note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone" },
  reengage: { name: "Re-engage quiet customers", short: "Re-engage", note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  campaign: { name: "Standing offers", short: "Offers", note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  reviews: { name: "Google reviews", short: "Reviews", note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you" },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" }
};
var PolicyLimitsSchema3 = z33.object({
  max_replies_day: z33.number().int().min(1).max(200).optional(),
  pause_hours: z33.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: z33.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: z33.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: z33.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME3 = z33.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema3 = z33.object({ open: TIME3, close: TIME3 });
var HoursSchema3 = z33.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME3.nullable().optional(),
  close: TIME3.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: z33.array(IntervalSchema3).optional()
}).strict();
var DATE3 = z33.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema3 = z33.object({
  date: DATE3,
  until: DATE3.optional(),
  note: z33.string().max(200).optional()
});
var DAYS3 = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema3 = z33.object({
  name: z33.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: z33.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: z33.string().max(120).optional()
}).strict();
var GuardrailsSchema3 = z33.object({
  never_quote_prices: z33.boolean().optional(),
  never_confirm_booking: z33.boolean().optional(),
  disclose_ai: z33.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: z33.boolean().optional()
}).strict();
var NoteSchema3 = z33.object({
  title: z33.string().min(1).max(80),
  text: z33.string().min(1).max(1200)
}).strict();
var BookingRulesSchema3 = z33.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: z33.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: z33.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: z33.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: z33.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: z33.array(z33.string().min(1).max(80)).max(20).optional(),
  party_max: z33.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: z33.array(z33.string().min(1).max(200)).max(10).optional()
}).strict();
var E1643 = /^\+[1-9]\d{6,14}$/;
var INSTRUCTIONS_MAX3 = 2e4;
var BusinessProfileSchema3 = z33.object({
  address: z33.string().max(300).optional(),
  hours: z33.partialRecord(z33.enum(DAYS3), HoursSchema3).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: z33.array(ClosureSchema3).optional(),
  services: z33.array(ServiceSchema3).max(60).optional(),
  languages: z33.array(z33.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema3.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: z33.array(z33.string().min(1).max(200)).max(20).optional(),
  tone: z33.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: z33.string().regex(E1643, "E.164, like +16469325775").optional(),
  website: z33.string().url().max(500).optional(),
  notes: z33.array(NoteSchema3).max(10).optional(),
  booking_rules: BookingRulesSchema3.optional(),
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
  extra_instructions: z33.string().max(INSTRUCTIONS_MAX3).optional()
}).strict();
var BrainConfigSchema3 = z33.object({
  business_name: z33.string().min(1).max(120),
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
  phone_display: z33.string().min(3).max(40).optional(),
  booking_link: z33.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: z33.string().min(40).max(INSTRUCTIONS_MAX3),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema3.optional(),
  fallbacks: z33.object({
    /** Sent when no model key is configured. */
    greeting: z33.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: z33.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: z33.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema3 = z33.object({
  escalation_emails: z33.array(z33.string().email()).min(1).max(10),
  from: z33.string().max(200).optional()
}).strict();
var CalendarConfigSchema3 = z33.object({
  ical_url: z33.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema3 = z33.object({ vision: z33.boolean().optional() }).strict();
var TenantConfigSchema3 = z33.object({
  brain: BrainConfigSchema3.optional(),
  notifications: NotificationsConfigSchema3.optional(),
  calendar: CalendarConfigSchema3.optional(),
  features: FeaturesConfigSchema3.optional()
});
var MAX_INTERVALS_PER_DAY3 = 4;
var MAX_CLOSURES3 = 60;
function isRealDate3(key) {
  const at2 = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at2.getTime()) && at2.toISOString().slice(0, 10) === key;
}
var DAY_NAME3 = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function checkDay3(h, day, ctx) {
  const name = DAY_NAME3[day] ?? day;
  const at2 = (...rest) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: z33.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z33.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY3) {
    ctx.addIssue({
      code: z33.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY3} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z33.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z33.ZodIssueCode.custom,
        path: at2("intervals", n, "open"),
        message: `${name}: two shifts overlap.`
      });
    }
  }
}
function checkClosure3(c, n, ctx) {
  const at2 = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate3(c.date)) {
    ctx.addIssue({
      code: z33.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate3(c.until)) {
    ctx.addIssue({
      code: z33.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z33.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema3 = TenantConfigSchema3.superRefine((cfg, ctx) => {
  if (cfg.calendar && !feedUrlOk3(cfg.calendar.ical_url)) {
    ctx.addIssue({ code: z33.ZodIssueCode.custom, path: ["calendar", "ical_url"], message: feedProblemWords3("address") ?? "Not an address the receptionist may read." });
  }
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay3(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES3) {
    ctx.addIssue({
      code: z33.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES3} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure3(c, n, ctx));
});
var SHORT3 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var LIVE_STALE_MS3 = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS3 = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS3 = 10 * 60 * 1e3;
var PERSON_MODE_LABELS3 = { auto: "Answer", ask: "Ask me first", never: "Never" };
var PERSON_MODE_WORDS3 = { ...PERSON_MODE_LABELS3, inherit: "Follow the workspace" };
var DAY_MS33 = 864e5;
var WEEK_MS23 = 7 * DAY_MS33;
var MONTH_MS3 = 30 * DAY_MS33;
var NEW_WINDOW_MS3 = 7 * DAY_MS33;
var QUIET_AFTER_MS4 = 30 * DAY_MS33;
var DAY_MS43 = 24 * 3600 * 1e3;
var ASK_CAPS3 = {
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
var ASK_CITATION_KINDS3 = ["thread", "conversation", "call", "person", "page"];
var ASK_LANGUAGES3 = ["en", "es", "other"];
var ASK_FINISH_JSON_SCHEMA3 = {
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
          kind: { type: "string", enum: [...ASK_CITATION_KINDS3] },
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
    language: { type: "string", enum: [...ASK_LANGUAGES3] }
  },
  required: ["answer", "citations", "followups", "navigate", "language"],
  additionalProperties: false
};
var clip3 = (n) => (s) => s.trim().slice(0, n);
var TAG_CUT3 = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
function cleanAnswer3(raw) {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT3);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}
var AskFinishSchema3 = z43.object({
  answer: z43.string().catch("").transform((s) => clip3(1500)(cleanAnswer3(s))),
  citations: z43.array(
    z43.object({
      kind: z43.enum(ASK_CITATION_KINDS3).catch("page"),
      id: z43.string().catch("").transform(clip3(200)),
      label: z43.string().catch("").transform(clip3(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS3.citations)),
  followups: z43.array(z43.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS3.followups).map((s) => s.slice(0, 90))),
  navigate: z43.object({ to: z43.string().catch(""), label: z43.string().catch(""), now: z43.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: z43.enum(ASK_LANGUAGES3).catch("other")
});
var ASK_UNDO_MS3 = 10 * 6e4;
var AskProposalOutcomeSchema3 = z43.object({
  state: z43.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z43.string().max(300).catch(""),
  atMs: z43.number().catch(0),
  undo: z43.record(z43.string(), z43.unknown()).nullable().optional()
});
var AskSettingsChangeSchema3 = z43.discriminatedUnion("op", [
  z43.object({ op: z43.literal("add_closure"), date: z43.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z43.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z43.string().max(200).optional() }),
  z43.object({ op: z43.literal("set_hours"), day: z43.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z43.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z43.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z43.object({ op: z43.literal("add_note"), title: z43.string().min(1).max(80), text: z43.string().min(1).max(1200) }),
  z43.object({ op: z43.literal("add_service"), name: z43.string().min(1).max(80), duration_min: z43.number().int().min(1).max(1440).optional() })
]);
var FIRST3 = { kind: "first_name", label: "First name", example: "Dani" };
var BUSINESS3 = { kind: "business_name", label: "Business name", example: "Luna Studio" };
var LINK3 = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
var FIRST_ES3 = { ...FIRST3, label: "Nombre" };
var BUSINESS_ES3 = { ...BUSINESS3, label: "Nombre del negocio" };
var LINK_ES3 = { ...LINK3, label: "Enlace de reservas" };
var WHEN4 = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
var SERVICE3 = { kind: "visit_service", label: "Service", example: "a consultation" };
var WHEN_ES3 = { ...WHEN4, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
var SERVICE_ES3 = { ...SERVICE3, label: "Servicio", example: "una consulta" };
var REPLY_WINDOW_HOURS3 = 72;
var REPLY_WINDOW_MS3 = REPLY_WINDOW_HOURS3 * 36e5;
var REPLY_WINDOW_WORDS3 = `within ${REPLY_WINDOW_HOURS3 / 24} days`;
var LIMIT_TIERS3 = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
var DAY_MS53 = 864e5;
var PLAYBOOK_HOURS3 = { min: 9, max: 20 };
var SENDING_HOURS_WORDS3 = {
  min: PLAYBOOK_HOURS3.min,
  max: PLAYBOOK_HOURS3.max,
  first: `${PLAYBOOK_HOURS3.min}:00`,
  range: `${PLAYBOOK_HOURS3.min}:00\u2013${PLAYBOOK_HOURS3.max}:59`,
  between: `between ${PLAYBOOK_HOURS3.min}:00 and ${PLAYBOOK_HOURS3.max}:59`
};
var PLAYBOOK_BREATH_MS3 = 7 * DAY_MS53;
var PLAYBOOK_VETO_DELAY_MS3 = 30 * 6e4;
var PLAYBOOK_CLASS_LABEL3 = {
  reengage: POLICY_CLASS_WORDS3.reengage.short,
  campaign: POLICY_CLASS_WORDS3.campaign.short,
  booking: POLICY_CLASS_WORDS3.booking.short
};
var DATE_FMT6 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WHEN23 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DAY_MS63 = 864e5;
var QUIET_AFTER_MS23 = 7 * DAY_MS63;
var DATE_FMT23 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var FORWARDING_TEST_WINDOW_MS3 = 30 * 6e4;
var REVIEW_AUTO_REPLY_MAX_AGE_MS3 = 14 * 864e5;
var REVIEW_NEWS_MS3 = 36 * 3600 * 1e3;
var REVIEW_NEWS_MAX_AGE_MS3 = 14 * 864e5;
var BOOTSTRAP_MS3 = 3600 * 1e3;
var DATE_FMT33 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS33 = 7 * 864e5;
var DATE_FMT43 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var SOLE_PROP_LIMITS3 = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
var REGISTRATION_COST_WORDS3 = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS3.messagesPerSecond} message a second.`
};
var PROVISIONING_DEADLINE_MS3 = 5 * 6e4;
var SOLE_PROP_CEILING_SENTENCE3 = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS3.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE3 = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE3}`;
var SIGNUP_NAME_MIN3 = 2;
var SIGNUP_NAME_MAX3 = 120;
var SignupSchema3 = z53.object({
  name: z53.string().trim().min(SIGNUP_NAME_MIN3, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX3, "That name is too long \u2014 120 characters at most."),
  email: z53.string().trim().toLowerCase().email("Enter a work email address.").max(254),
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
  password: z53.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z53.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z53.string().trim().max(80).optional()
}).strict();
var PendingWorkspaceSchema3 = z53.object({
  name: z53.string().trim().min(SIGNUP_NAME_MIN3).max(SIGNUP_NAME_MAX3),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z53.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone3(v) ? v : null)
});
function isTimezone3(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}
var CONSENT_PHRASE3 = OFFERS_OPT_IN_PHRASES3.en;
var CONSENT_PHRASE_ES3 = OFFERS_OPT_IN_PHRASES3.es;
var ACTIVITY_KINDS3 = [...DECISION_VERBS3, ...EVENT_KINDS3];
var PASSWORD_MIN3 = 12;
var PASSWORD_WORDS3 = {
  label: "Password",
  chooseLabel: "Choose a password",
  newLabel: "New password",
  hint: `At least ${PASSWORD_MIN3} characters. A long phrase beats a short puzzle.`,
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
var POS_TTL_MS = 5 * 60 * 1e3;
var NEG_TTL_MS = 60 * 1e3;
var DAY_MS22 = 24 * 3600 * 1e3;

// src/deliver.ts
function whatsappSender(cfg) {
  if (!cfg) return null;
  return (to, p) => {
    const digits = to.replace(/^\+/, "");
    return p.template ? sendTemplate(cfg, digits, p.template) : sendText(cfg, digits, p.body);
  };
}
function emailSender(cfg) {
  if (!cfg) return null;
  return (to, p) => {
    if (!p.email) return Promise.resolve({ ok: false, wamid: null, status: 0, errorBody: "no_frozen_request" });
    if (p.email.to.length !== 1 || p.email.to[0] !== to) return Promise.resolve({ ok: false, wamid: null, status: 0, errorBody: "request_names_another_recipient" });
    return sendEmail(cfg, p.email);
  };
}
function kindOf(d) {
  if (d.kind) return d.kind;
  if (d.sender === "human") return d.proactive ? "broadcast" : "reply";
  return d.messageId ? "draft" : "answer";
}
async function wireFacts(db, d) {
  const { data, error } = await db.from("conversations").select("paused_until, assignee_user_id, contacts (consent, dnc, marketing_consent, erased_at, erasing_since, email, email_suppressed_at), tenants (status)").eq("id", d.conversationId).eq("tenant_id", d.tenantId).maybeSingle();
  if (error) throw new Error(`deliver: cannot read the wire for conversation ${d.conversationId}: ${error.message}`);
  if (!data) throw new Error(`deliver: no conversation ${d.conversationId} in workspace ${d.tenantId}`);
  const row = data;
  return {
    pausedUntil: row.paused_until ?? null,
    assignee: row.assignee_user_id ?? null,
    contact: row.contacts ?? { consent: null, dnc: null, marketing_consent: null, erased_at: null, erasing_since: null, email: null, email_suppressed_at: null },
    tenantStatus: row.tenants?.status ?? null
  };
}
function refusalFor(d, f, nowMs) {
  if (f.contact.erased_at || f.contact.erasing_since) return "erased";
  if (d.channel === "sms" && d.purpose === "marketing") return "sms_carries_no_promotions";
  if (d.channel === "email") {
    if (d.purpose === "marketing") return "email_marketing_disabled";
    if (f.contact.email_suppressed_at) return "email_suppressed";
    if (f.contact.email !== d.to) return "recipient_changed";
  }
  const may = mayMessageFor(f.contact, d.purpose, { proactive: d.proactive });
  if (!may.ok) return may.reason;
  const kind = kindOf(d);
  if (kind === "reply") return null;
  if (f.tenantStatus === "paused") return "paused";
  if (kind === "draft" && f.assignee) return "human_has_it";
  if (kind !== "draft" && kind !== "system" && f.pausedUntil && nowMs < new Date(f.pausedUntil).getTime()) return "human_has_it";
  return null;
}
async function overtakenByHuman(db, d) {
  const { data: mine, error: mineErr } = await db.from("messages").select("created_at").eq("id", d.messageId).eq("tenant_id", d.tenantId).maybeSingle();
  if (mineErr) throw new Error(`deliver: cannot read message ${d.messageId}: ${mineErr.message}`);
  if (!mine) return null;
  const { data: newer, error } = await db.from("messages").select("id, meta").eq("conversation_id", d.conversationId).eq("tenant_id", d.tenantId).eq("direction", "outbound").eq("sender", "human").gt("created_at", mine.created_at).order("created_at", { ascending: true }).limit(10);
  if (error) throw new Error(`deliver: cannot read the thread for ${d.messageId}: ${error.message}`);
  const spoke = (newer ?? []).find((m) => m.meta?.source !== "broadcast");
  return spoke ? spoke.id : null;
}
function event(db, d, kind, messageId, data) {
  return emitEvent(db, d.tenantId, kind, "message", "message", messageId, data);
}
async function stampThread(db, d, nowMs) {
  const { error } = await db.from("conversations").update({ last_message_at: new Date(nowMs).toISOString() }).eq("id", d.conversationId).eq("tenant_id", d.tenantId);
  if (error) console.error("deliver_stamp_failed", JSON.stringify({ tenant: d.tenantId, conversation: d.conversationId, error: error.message }));
}
async function finalizeQueued(db, d, patch) {
  const { data, error } = await db.from("messages").update(patch).eq("id", d.messageId).eq("status", "queued").select("id");
  if (error) throw new Error(`deliver: cannot finalize message ${d.messageId}: ${error.message}`);
  return !!data && data.length > 0;
}
async function deliver(ports, d) {
  const nowMs = (ports.now ?? Date.now)();
  const facts = await wireFacts(ports.db, d);
  const refusal = refusalFor(d, facts, nowMs);
  const overtakenBy = !refusal && kindOf(d) === "draft" ? await overtakenByHuman(ports.db, d) : null;
  const reason = refusal ?? (overtakenBy ? "superseded_by_human" : null);
  if (reason) {
    if (d.messageId) {
      await finalizeQueued(ports.db, d, { status: "canceled", error: { reason } });
      await event(ports.db, d, "message.send_blocked", d.messageId, {
        reason,
        purpose: d.purpose,
        consent: facts.contact.consent,
        dnc: facts.contact.dnc,
        marketing_consent: facts.contact.marketing_consent,
        ...overtakenBy ? { after: overtakenBy } : {}
      });
    }
    return { outcome: "refused", reason, messageId: d.messageId ?? null };
  }
  const send = ports.wire[d.channel];
  const sent = send === void 0 ? { ok: false, wamid: null, status: 0, errorBody: "no_sender_for_channel", reason: "no_sender_for_channel" } : send === null ? { ok: false, wamid: null, status: 503, errorBody: "no_credentials", reason: "no_credentials" } : await send(d.to, { body: d.body, template: d.template, ...d.email ? { email: d.email } : {} });
  if (sent.ok) {
    if (d.messageId) {
      const marked = await finalizeQueued(ports.db, d, { status: "sent", ...sent.wamid ? { external_id: sent.wamid } : {} }).catch((e) => {
        console.error("deliver_finalize_failed", JSON.stringify({ tenant: d.tenantId, message: d.messageId, wamid: sent.wamid, error: e instanceof Error ? e.message : String(e) }));
        return null;
      });
      await Promise.all([
        marked === false ? event(ports.db, d, "message.send_raced_cancel", d.messageId, { wamid: sent.wamid }) : Promise.resolve(),
        stampThread(ports.db, d, nowMs),
        event(ports.db, d, "message.sent", d.messageId, { sender: d.sender })
      ]);
      return { outcome: "sent", messageId: d.messageId, externalId: sent.wamid };
    }
    const messageId2 = await recordOutbound(ports.db, {
      tenantId: d.tenantId,
      conversationId: d.conversationId,
      contactId: d.contactId,
      sender: d.sender,
      type: d.template ? "template" : "text",
      body: d.body,
      channel: d.channel,
      externalId: sent.wamid,
      status: "sent",
      meta: d.meta ?? {}
    }).catch((e) => {
      console.error("deliver_record_failed", JSON.stringify({ tenant: d.tenantId, conversation: d.conversationId, wamid: sent.wamid, error: e instanceof Error ? e.message : String(e) }));
      return null;
    });
    return { outcome: "sent", messageId: messageId2, externalId: sent.wamid };
  }
  const failure = { http_status: sent.status, body: sent.errorBody ?? null };
  let messageId = d.messageId ?? null;
  if (d.messageId) {
    await finalizeQueued(ports.db, d, { status: "failed", error: failure });
  } else {
    messageId = await recordOutbound(ports.db, {
      tenantId: d.tenantId,
      conversationId: d.conversationId,
      contactId: d.contactId,
      sender: d.sender,
      type: d.template ? "template" : "text",
      body: d.body,
      channel: d.channel,
      externalId: null,
      status: "failed",
      meta: { ...d.meta ?? {}, ...failure }
    });
  }
  await event(ports.db, d, "message.send_failed", messageId, { ...failure, reason: sent.reason ?? "provider" });
  return { outcome: "failed", reason: sent.reason ?? "provider", status: sent.status, errorBody: sent.errorBody ?? null, messageId };
}
async function templatePurpose(db, tenantId, template) {
  if (!template) return "conversational";
  const { data, error } = await db.from("templates").select("category").eq("tenant_id", tenantId).eq("channel", "whatsapp").eq("name", template.name).eq("language", template.language).maybeSingle();
  if (error) throw new Error(`deliver: cannot read template ${template.name}: ${error.message}`);
  return purposeOfTemplate(data?.category);
}
async function deliverSafely(ports, d) {
  try {
    return await deliver(ports, d);
  } catch (e) {
    const errorBody = e instanceof Error ? e.message : String(e);
    console.error("deliver_threw", JSON.stringify({ tenant: d.tenantId, conversation: d.conversationId, error: errorBody }));
    return { outcome: "failed", reason: "wire_unreadable", status: 0, errorBody, messageId: d.messageId ?? null };
  }
}

// src/conversations/take-over.ts
async function takeOver(ports, cmd) {
  const { conv } = cmd;
  const phone = conv.phone_e164;
  const mirror = async (until) => {
    if (phone) await ports.pauseBot(conv.tenant_id, phone, until);
  };
  const untilMs = ports.now() + await ports.pauseMs(conv.tenant_id);
  const paused_until = new Date(untilMs).toISOString();
  await mirror(untilMs);
  if (!await ports.claim(conv.id, paused_until, cmd.userId)) {
    await mirror(0);
    throw new AppError("conflict", "Could not take this thread over \u2014 reload and try again.", 409);
  }
  const withdrawn_drafts = await ports.withdrawDrafts(conv.tenant_id, conv.id);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "take_over", { paused_until });
  return { state: "needs_human", paused_until, decision_id, withdrawn_drafts };
}

// src/conversations/hand-back.ts
async function handBack(ports, cmd) {
  const { conv } = cmd;
  const phone = conv.phone_e164;
  const mirror = async (until) => {
    if (phone) await ports.pauseBot(conv.tenant_id, phone, until);
  };
  await mirror(0);
  const back = conv.paused_until ? () => mirror(Date.parse(conv.paused_until)) : async () => {
  };
  const released = await ports.release(conv.id).catch(async (e) => {
    await back();
    throw e;
  });
  if (!released) {
    await back();
    throw new AppError("conflict", "Could not hand this thread back \u2014 reload and try again.", 409);
  }
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "hand_back");
  await ports.resolveEscalation(conv.id, decision_id);
  return { state: "open", decision_id };
}

// src/conversations/snooze.ts
var MAX_SNOOZE_MS = 30 * 24 * 3600 * 1e3;
var NEEDS_UNTIL = "snooze needs a future `until` timestamp.";
async function snooze(ports, cmd) {
  const { conv } = cmd;
  const now = ports.now();
  const until = cmd.until ? new Date(cmd.until) : null;
  if (!until || Number.isNaN(until.getTime()) || until.getTime() <= now) throw new AppError("validation", NEEDS_UNTIL);
  if (until.getTime() - now > MAX_SNOOZE_MS) throw new AppError("validation", "snooze is capped at 30 days.");
  const held = conv.paused_until && conv.phone_e164 ? { phone: conv.phone_e164, until: Date.parse(conv.paused_until) } : null;
  if (held) await ports.pauseBot(conv.tenant_id, held.phone, 0);
  const snooze_until = until.toISOString();
  const back = held ? () => ports.pauseBot(conv.tenant_id, held.phone, held.until) : async () => {
  };
  const snoozed = await ports.snooze(conv.id, snooze_until).catch(async (e) => {
    await back();
    throw e;
  });
  if (!snoozed) {
    await back();
    throw new AppError("conflict", "Could not snooze this thread \u2014 reload and try again.", 409);
  }
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "snooze", { until: snooze_until });
  return { state: "snoozed", snooze_until, decision_id };
}

// src/conversations/wake.ts
async function wake(ports, cmd) {
  const { conv } = cmd;
  if (conv.state !== "snoozed") throw new AppError("conflict", "This thread is not snoozed.", 409);
  if (!await ports.wake(conv.id)) throw new AppError("conflict", "Could not wake this thread \u2014 reload and try again.", 409);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "wake", {});
  return { state: "open", decision_id };
}

// src/conversations/archive.ts
async function archive(ports, cmd) {
  const { conv } = cmd;
  const held = conv.paused_until && conv.phone_e164 ? { phone: conv.phone_e164, until: Date.parse(conv.paused_until) } : null;
  if (held) await ports.pauseBot(conv.tenant_id, held.phone, 0);
  const back = held ? () => ports.pauseBot(conv.tenant_id, held.phone, held.until) : async () => {
  };
  const archived = await ports.archive(conv.id).catch(async (e) => {
    await back();
    throw e;
  });
  if (!archived) {
    await back();
    throw new AppError("conflict", "Could not archive this thread \u2014 reload and try again.", 409);
  }
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "archive");
  await ports.resolveEscalation(conv.id, decision_id);
  return { state: "archived", decision_id };
}

// src/conversations/resolve.ts
async function resolveEscalation(ports, cmd) {
  const { esc } = cmd;
  if (esc.state === "resolved") return { state: "resolved", already: true };
  if (!await ports.resolve(esc.id)) throw new AppError("conflict", "This escalation was already resolved \u2014 reload.", 409);
  const decision_id = await ports.record(esc.tenant_id, "escalation", esc.id, "resolve");
  await ports.link(esc.id, decision_id);
  return { state: "resolved", decision_id };
}

// src/conversations/cancel-send.ts
async function cancelSend(ports, cmd) {
  const { msg } = cmd;
  if (msg.status !== "queued") throw new AppError("conflict", "Too late \u2014 this message has already been sent.");
  if (!await ports.cancelQueued(msg.id)) throw new AppError("conflict", "Too late \u2014 this message went out while you were canceling it.");
  await ports.cancelJob(msg.tenant_id, msg.id);
  const decision_id = await ports.record(msg.tenant_id, "message", msg.id, "cancel_send");
  return { status: "canceled", decision_id };
}

// src/conversations/reply.ts
var SEND_GRACE_MS = 15 * 1e3;
var IDEMPOTENCY_WINDOW_MS = 30 * 1e3;
async function replyToConversation(ports, cmd) {
  const { conv, body } = cmd;
  if (!conv.phone_e164) throw new AppError("conflict", "This person has no phone number, so a WhatsApp or text reply cannot reach them.");
  if (isOptedOutContact(conv)) throw new AppError("conflict", OPT_OUT_REFUSAL);
  const now = ports.now();
  const channel = await ports.replyChannel(conv);
  const window = replyWindow(channel, conv.last_wa_inbound_at, new Date(now));
  const idemKey = cmd.idempotencyKey ? `${cmd.userId}:${cmd.idempotencyKey}` : null;
  const intentHash = ports.hash(JSON.stringify(body));
  if (idemKey) {
    const prior = await ports.priorReceipt(conv.tenant_id, idemKey);
    const sameIntent = prior?.request_hash === intentHash;
    if (prior && sameIntent && now - Date.parse(prior.created_at) < IDEMPOTENCY_WINDOW_MS) return prior.response;
  }
  let messageBody;
  let templateVars = null;
  let templateName = null;
  let jobTemplate;
  if (window.open) {
    if (!body.text?.trim()) throw new AppError("validation", "Reply text is required.");
    messageBody = body.text.trim();
    if (channel === "sms" && messageBody.length > 1600) throw new AppError("validation", "A text can be at most 1600 characters.");
  } else {
    if (!body.template?.name) throw new AppError("window_closed", "The 24-hour WhatsApp window is closed \u2014 replies must use an approved template.");
    const tpl = await ports.template(conv.tenant_id, body.template.name, body.template.language);
    if (!tpl || tpl.meta_status !== "approved") throw new AppError("validation", "Template not found or not approved.");
    if (purposeOfTemplate(tpl.category) === "marketing" && conv.marketing_consent !== "opted_in") {
      throw new AppError("forbidden", "This template is a promotion, and this person has not said yes to offers. Use an appointment template, or ask them first.");
    }
    const toWrite = slotToWrite(tpl);
    if (toWrite) {
      throw new AppError("validation", `This template needs words for \u201C${toWrite}\u201D, which the Inbox does not ask for. Pick a template without them, or send it from Campaigns.`);
    }
    const facts = await ports.templateFacts(conv.tenant_id);
    if (!facts) throw new AppError("validation", "This workspace has no template facts configured yet. Add the business name and booking link in Settings \u203A Business first.");
    const params = resolveParams(inboxSlots(tpl), {
      firstName: firstNameOf(conv.display_name, conv.wa_profile_name),
      businessName: facts.business_name,
      bookingLink: facts.booking_link.replace(/^https?:[/][/]/, "")
    });
    templateName = tpl.name;
    templateVars = { language: tpl.language, params };
    messageBody = renderTemplate(tpl.body_preview, params) || `[template ${tpl.name}]`;
    jobTemplate = { name: tpl.name, language: tpl.language, params };
  }
  const pauseUntil = now + await ports.pauseMs(conv.tenant_id);
  await ports.pauseBot(conv.tenant_id, conv.phone_e164, pauseUntil);
  if (!await ports.claimForReply(conv.id, new Date(pauseUntil).toISOString(), cmd.userId, new Date(now).toISOString())) {
    await ports.pauseBot(conv.tenant_id, conv.phone_e164, 0);
    throw new AppError("conflict", "Could not take this thread over just now, so nothing was sent. Try again.", 409);
  }
  const withdrawn_drafts = await ports.withdrawDrafts(conv.tenant_id, conv.id);
  const message_id = await ports.queue({
    tenant_id: conv.tenant_id,
    conversation_id: conv.id,
    contact_id: conv.contact_id,
    channel,
    sent_by: cmd.userId,
    type: jobTemplate ? "template" : "text",
    body: messageBody,
    template_name: templateName,
    template_vars: templateVars,
    content_hash: ports.hash(messageBody)
  });
  const dueAt = new Date(now + SEND_GRACE_MS);
  try {
    await ports.schedule(conv.tenant_id, dueAt, { message_id, conversation_id: conv.id, to_phone: conv.phone_e164, ...jobTemplate ? { template: jobTemplate } : { body: messageBody } });
  } catch (e) {
    await ports.cancelOrphan(message_id);
    throw e;
  }
  const queued = { message_id, status: "queued", cancelable_until: dueAt.toISOString(), window_open: window.open, withdrawn_drafts };
  if (idemKey) await ports.storeReceipt(conv.tenant_id, idemKey, intentHash, queued);
  const decision_id = await ports.record(conv.tenant_id, "conversation", conv.id, "reply", { message_id, window_open: window.open, template: templateName });
  await ports.resolveEscalation(conv.id, decision_id);
  const receipt = { ...queued, decision_id };
  if (idemKey) await ports.storeReceipt(conv.tenant_id, idemKey, intentHash, receipt);
  return receipt;
}

// src/messages/send.ts
async function sendQueued(ports, cmd) {
  const p = cmd.payload;
  let msg;
  try {
    msg = await ports.queued(p.message_id);
  } catch (e) {
    throw new Error(`outbound_send: cannot read message ${p.message_id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!msg || msg.status !== "queued") return;
  const purpose = await ports.purposeOf(p.template);
  const channel = msg.channel ?? "whatsapp";
  const out = await ports.deliver({
    tenantId: cmd.tenantId,
    conversationId: p.conversation_id,
    contactId: null,
    to: p.to_phone,
    channel,
    // Read from the ROW, not hardcoded: under a veto window the receptionist's
    // own reply travels this path, and stamping every send "human" would make
    // the metrics report a bot's words as a person's.
    sender: msg.sender ?? "human",
    purpose,
    proactive: false,
    body: p.body ?? msg.body ?? "",
    template: p.template,
    messageId: p.message_id
  });
  if (out.outcome !== "failed") return;
  if (out.reason === "provider" && (out.status === 401 || out.status === 403)) {
    await ports.page?.(`provider_auth:${channel}`, `${channel} rejected a send with ${out.status}`, `Tenant ${cmd.tenantId}, message ${p.message_id}. Credentials, not content.`);
  }
  const notConnected = channel === "sms" ? "the texting line is not connected" : channel === "whatsapp" ? "the WhatsApp number is not connected" : `the ${channel} channel is not connected`;
  const cause = out.reason === "no_credentials" ? notConnected : out.reason === "no_sender_for_channel" ? `this runtime has no ${channel} line` : out.reason === "wire_unreadable" ? "the thread could not be read at the wire" : `HTTP ${out.status}`;
  const receptionist = msg.sender === "ai";
  await ports.escalate(p.conversation_id, "send_failed", `${receptionist ? "The receptionist's reply" : "Dashboard reply"} could not be delivered (${cause}).`);
  await ports.alert(`Reply delivery failed: ${p.to_phone}`, `${receptionist ? "A reply the receptionist queued" : "A reply queued from the dashboard"} could not be sent (${cause}). The thread is flagged in the Inbox.`);
}

// src/messages/erase-thread.ts
async function eraseBlobThread(ports, cmd) {
  const p = cmd.payload;
  if (p.scrubbed) return;
  if (!p.namespace) throw new Error("blob_thread_erase: payload has no namespace");
  const ids = (Array.isArray(p.thread_ids) ? p.thread_ids : []).filter((t) => typeof t === "string" && t.length > 0);
  const failed = [];
  for (const id of ids) if (!await ports.eraseThread(p.namespace, id)) failed.push(id);
  if (failed.length) throw new Error(`blob_thread_erase: ${failed.length} thread(s) not deleted`);
  if (p.contact_id) await ports.recordErased(cmd.tenantId, p.contact_id, ids.length, cmd.jobId);
  const scrubbed = { contact_id: p.contact_id ?? null, namespace: p.namespace, threads: ids.length, scrubbed: true };
  await ports.scrub(cmd.tenantId, p.contact_id ? { contactId: p.contact_id } : { jobId: cmd.jobId }, scrubbed);
}

// src/messages/provision-line.ts
async function provisionLine(ports, cmd) {
  const lineId = typeof cmd.payload.line_id === "string" ? cmd.payload.line_id : "";
  const by = cmd.payload.by === "sweep" || cmd.payload.by === "support" ? cmd.payload.by : "owner";
  if (!lineId) throw new Error("line_provision: payload.line_id is required");
  if (!ports.provision) throw new Error("line_provision: this runtime holds no line provider");
  const r = await ports.provision(lineId, by);
  if (!r.ok) throw new Error(`line_provision: stopped at ${r.step ?? "?"}: ${r.error ?? "unknown"}`);
}

// src/messages/broadcast.ts
var BROADCAST_STALL_RETRY_MS = 6e4;
function wireIsDown(out) {
  return out.reason === "no_credentials" || out.reason === "no_sender_for_channel" || out.reason === "provider" && (out.status === 401 || out.status === 403);
}
var ThrownAtTheDoor = class {
  error;
  constructor(error) {
    this.error = error;
  }
};
async function sendBroadcastBatch(ports, cmd) {
  const b = await ports.broadcast(cmd.broadcastId);
  if (!b) return;
  if (b.state !== "scheduled" && b.state !== "sending") return;
  if (await ports.workspacePaused()) {
    await ports.fail(b.id, "paused");
    await ports.alert(`Broadcast \u201C${b.name}\u201D not sent`, "The workspace is paused until billing resumes, so nothing went out. Resume from Settings \u203A Billing and send it again.");
    return;
  }
  if (b.state === "scheduled" && !await ports.startSending(b.id)) return;
  const tpl = await ports.template(b.template_name, b.template_language);
  if (!tpl || tpl.meta_status !== "approved") {
    await ports.fail(b.id, "template_not_approved");
    await ports.alert(`Broadcast \u201C${b.name}\u201D stopped`, `The template \u201C${b.template_name}\u201D is no longer approved by WhatsApp, so nothing was sent.`);
    return;
  }
  const purpose = purposeOfTemplate(tpl.category);
  const specs = parseParamSpecs(b.params);
  const { businessName, bookingLink } = await ports.facts();
  const batch = await ports.batch(b.id, BROADCAST_CHUNK);
  const ids = batch.map((r) => r.contact_id);
  let people = /* @__PURE__ */ new Map();
  let priors = /* @__PURE__ */ new Map();
  let unreadable = false;
  if (ids.length > 0) {
    try {
      [people, priors] = await Promise.all([ports.contacts(ids), ports.alreadySent(b.id, ids)]);
    } catch (e) {
      unreadable = true;
      console.error("broadcast_batch_unreadable", b.id, e instanceof Error ? e.message : String(e));
    }
  }
  let begun = 0;
  let marked = 0;
  const mark = async (contactId, patch) => {
    marked += 1;
    await ports.mark(b.id, contactId, patch);
  };
  const skip = (contactId, reason) => mark(contactId, { state: "skipped", reason });
  const one = async (r) => {
    const c = people.get(r.contact_id) ?? null;
    if (!c || c.erased_at) {
      await skip(r.contact_id, "erased");
      return "go on";
    }
    if (!c.phone_e164) {
      await skip(r.contact_id, "no_phone");
      return "go on";
    }
    const prior = priors.get(c.id) ?? null;
    if (prior) {
      await mark(r.contact_id, { state: "sent", message_id: prior.id, sent_at: prior.sentAt });
      return "go on";
    }
    const target = await ports.target(c.phone_e164);
    if (!target) {
      await skip(r.contact_id, "no_thread");
      return "go on";
    }
    const facts = r.facts !== null && typeof r.facts === "object" && !Array.isArray(r.facts) ? r.facts : {};
    const params = resolveParams(specs, {
      firstName: firstNameOf(c.display_name, c.wa_profile_name),
      businessName,
      bookingLink,
      visitWhen: typeof facts.visit_when === "string" ? facts.visit_when : null,
      visitService: typeof facts.visit_service === "string" ? facts.visit_service : null
    });
    if (params.some((v) => !v)) {
      await skip(r.contact_id, "missing_value");
      return "go on";
    }
    const words = renderTemplate(tpl.body_preview, params);
    await ports.mark(b.id, r.contact_id, { state: "failed", reason: OUTCOME_UNKNOWN });
    const out = await ports.deliver({
      tenantId: cmd.tenantId,
      conversationId: target.conversationId,
      contactId: c.id,
      to: c.phone_e164,
      channel: "whatsapp",
      sender: "human",
      kind: "broadcast",
      purpose,
      proactive: true,
      body: words,
      template: { name: b.template_name, language: b.template_language, params },
      // A run's message names its playbook, so a thread reads "by the Win-back playbook".
      meta: {
        source: "broadcast",
        broadcast_id: b.id,
        broadcast_name: b.name,
        ...b.playbook_id ? { playbook_id: b.playbook_id, playbook_name: String(b.audience?.label ?? b.name) } : {}
      }
    }).catch((e) => {
      throw new ThrownAtTheDoor(e);
    });
    if (out.outcome === "sent") {
      await mark(r.contact_id, { state: "sent", message_id: out.messageId });
      return "go on";
    }
    if (out.outcome === "refused") {
      await skip(r.contact_id, out.reason);
      return "go on";
    }
    await mark(r.contact_id, { state: "failed", reason: "send_failed", message_id: out.messageId });
    if (!wireIsDown(out)) return "go on";
    const cause = out.reason === "no_credentials" ? "the number is not connected" : out.reason === "no_sender_for_channel" ? "this runtime has no WhatsApp wire" : `WhatsApp answered HTTP ${out.status}`;
    await ports.fail(b.id, "wire_unavailable");
    await ports.alert(`Broadcast \u201C${b.name}\u201D stopped`, `WhatsApp could not be reached on this workspace's number (${cause}), so the rest was not sent. Reconnect the number in Settings \u203A Channels and send it again.`);
    return "stop";
  };
  for (const [i, r] of batch.entries()) {
    if (unreadable) break;
    if (begun > 0 && ports.now() >= cmd.deadline) break;
    begun += 1;
    let verdict;
    try {
      verdict = await one(r);
    } catch (e) {
      if (e instanceof ThrownAtTheDoor) throw e.error;
      console.error("broadcast_person_unreadable", r.contact_id, e instanceof Error ? e.message : String(e));
      continue;
    }
    if (verdict === "stop") return;
    if (BROADCAST_GAP_MS > 0 && i < batch.length - 1) await ports.sleep(BROADCAST_GAP_MS);
  }
  const remaining = await ports.remaining(b.id);
  if (remaining > 0) {
    if (await ports.state(b.id) !== "sending") return;
    if (batch.length > 0 && marked === 0) await ports.scheduleNext(b.id, new Date(ports.now() + BROADCAST_STALL_RETRY_MS));
    else await ports.scheduleNext(b.id);
    return;
  }
  const { sent, held } = await ports.tally(b.id);
  await ports.finish(b.id, { sent, held });
  await ports.alert(
    `Broadcast \u201C${b.name}\u201D sent`,
    `${sent} ${sent === 1 ? "person" : "people"} got it${held ? `; ${held} held back (no recorded yes, asked to stop, no number, a person had the thread, or a run that did not finish)` : ""}. Replies land in the Inbox.`
  );
}

// src/campaigns/assemble.ts
async function assembleRun(ports, cmd) {
  let id;
  try {
    id = await ports.create(cmd.broadcast);
  } catch (e) {
    return { ok: false, failure: "run_not_created", error: said(e) };
  }
  try {
    await ports.enrol(id, cmd.recipients);
  } catch (e) {
    await ports.fail(id, "recipients_write_failed");
    return { ok: false, failure: "recipients_write_failed", error: said(e) };
  }
  if (cmd.sendAt) {
    try {
      await ports.schedule(id, cmd.sendAt);
    } catch (e) {
      await ports.fail(id, "schedule_failed");
      return { ok: false, failure: "schedule_failed", error: said(e) };
    }
  }
  return { ok: true, id };
}
var said = (e) => e instanceof Error ? e.message : String(e);

// src/campaigns/run-playbook.ts
async function runPlaybook(ports, cmd) {
  const { playbook: p, ctx, by } = cmd;
  const now = ctx.now;
  const runFor = cmd.runFor ?? localDate(ctx.tz, now);
  const record = (data) => ports.record(p.id, runFor, now, { run_for: runFor, by: by.kind, ...data });
  const mode = ctx.modes.get(p.policy_class) ?? "ask";
  const off = async (skipped, opts = {}) => {
    if (opts.record !== false) await record({ mode, skipped });
    return { outcome: "off", mode, skipped };
  };
  const plan = by.kind === "user" ? mode === "never" ? { kind: "off" } : { kind: "send", state: "scheduled", at: now } : planRun(mode, now);
  if (plan.kind === "off") return off("never");
  const send = plan.kind === "send" ? plan : null;
  const open = send ? nextOpenMoment(ctx.tz, send.at) : null;
  const movedFrom = send && open?.moved ? send.at.toISOString() : null;
  let tpl;
  try {
    tpl = await ports.template(p.template_name, p.template_language);
  } catch (e) {
    return { outcome: "failed", error: `template: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!tpl || tpl.meta_status !== "approved") return off("template_not_approved");
  if (!ctx.health.canSend) return off("number_flagged");
  if (await ports.alreadyRan(p.id, runFor)) return off("already_ran_today", { record: false });
  if (triggerOf(p.trigger)?.kind === "visit" && ctx.calendar !== "ok") return off("no_calendar");
  let eligible = eligibleForPlaybook(
    ctx.people,
    { trigger: p.trigger, cap_per_run: p.cap_per_run, gap_days: p.gap_days, cadence_days: p.cadence_days },
    { byThis: ctx.touches.byThis.get(p.id) ?? /* @__PURE__ */ new Map(), byAny: ctx.touches.byAny },
    now.getTime()
  );
  let dropped = 0;
  if (ctx.health.limitPerDay !== null && eligible.length > ctx.health.limitPerDay) {
    const keep = Math.max(0, Math.floor(ctx.health.limitPerDay));
    dropped = eligible.length - keep;
    eligible = eligible.slice(0, keep);
  }
  if (eligible.length === 0) {
    await record({ mode, eligible: 0, ...dropped ? { dropped } : {} });
    return { outcome: "empty", eligible: 0, mode };
  }
  const specs = parseParamSpecs(p.params);
  const factsOf = (r) => {
    const v = ctx.visits.get(r.id);
    return visitFactsFor(p.trigger, p.trigger === "visit_tomorrow" ? v?.next ?? null : v?.last ?? null, ctx.tz, open ? open.at : now);
  };
  const n = eligible.length;
  const made = await assembleRun(ports, {
    broadcast: {
      name: `${p.name} \xB7 ${runFor}`,
      template_id: p.template_id,
      template_name: p.template_name,
      template_language: p.template_language,
      params: specs,
      audience: { kind: "playbook", id: p.id, label: p.name },
      state: plan.state,
      scheduled_for: (open ? open.at : now).toISOString(),
      recipient_count: n,
      created_by: by.kind === "user" ? by.userId : p.created_by,
      playbook_id: p.id,
      run_for: runFor
    },
    recipients: eligible.map((r) => ({ contact_id: r.id, facts: factsOf(r) })),
    sendAt: open ? open.at : null
  });
  if (!made.ok) return { outcome: "failed", error: made.error };
  if (open) {
    await ports.decide({ broadcastId: made.id, by, payload: { playbook_id: p.id, playbook: p.name, mode, recipients: n, scheduled_for: open.at.toISOString(), run_now: by.kind === "user", ...movedFrom ? { moved_from: movedFrom } : {} } });
  } else {
    await ports.notify(
      `Playbook \u201C${p.name}\u201D is ready: ${n} ${n === 1 ? "person" : "people"}`,
      `${n} ${n === 1 ? "person has" : "people have"} become eligible for \u201C${p.name}\u201D. Approve or skip the run on Today or in Campaigns \u203A Playbooks. Nothing is sent until you do.`
    );
  }
  await record({ mode, eligible: n, broadcast_id: made.id, state: plan.state, ...movedFrom ? { moved_from: movedFrom } : {} });
  return open ? { outcome: "sent", broadcast_id: made.id, eligible: n, mode, state: plan.state, scheduled_for: open.at.toISOString(), moved_from: movedFrom } : { outcome: "held", broadcast_id: made.id, eligible: n, mode, state: plan.state };
}

// src/campaigns/template-values.ts
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function templateValues(ports, cmd) {
  if (!UUID.test(cmd.templateId)) throw new AppError("validation", "Pick a template.");
  const tpl = await ports.template(cmd.templateId);
  if (!tpl) throw new AppError("not_found", "Template not found.", 404);
  if (tpl.meta_status !== "approved") throw new AppError("conflict", "That template is not approved by WhatsApp, so it cannot be sent.", 409);
  const expected = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
  const rawParams = Array.isArray(cmd.params) ? cmd.params : [];
  if (rawParams.length !== expected) {
    throw new AppError("validation", expected === 0 ? "This template takes no values." : `This template takes ${expected} value${expected === 1 ? "" : "s"}.`);
  }
  const specs = [];
  for (const p of rawParams) {
    const spec = parseParamSpec(p);
    if (!spec) throw new AppError("validation", "Each value is typed text, their first name, the business name, the booking link, or a visit's time or service.");
    if (spec.kind === "text") {
      const v = cleanParam(spec.value);
      if (v === null) throw new AppError("validation", "Every value is needed, without line breaks or tabs, and under 1024 characters.");
      specs.push({ kind: "text", value: v });
    } else {
      if ((spec.kind === "visit_when" || spec.kind === "visit_service") && !cmd.visits) {
        throw new AppError("validation", "Only a visit reminder or an after-the-visit playbook can fill in a visit's time or service.");
      }
      specs.push(spec);
    }
  }
  if (specs.some((s) => s.kind === "booking_link") && !await ports.bookingLink()) {
    throw new AppError("conflict", "This message takes the booking link, and none is on file. Add it in Settings \u203A Business first.", 409);
  }
  return { template: tpl, specs };
}

// src/campaigns/create-broadcast.ts
var UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;
async function createBroadcast(ports, cmd) {
  const { now } = cmd;
  const body = cmd.body;
  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  if (!UUID2.test(templateId)) throw new AppError("validation", "Pick a template.");
  const kind = body?.audience?.kind;
  if (typeof kind !== "string" || !AUDIENCE_KINDS.includes(kind)) {
    throw new AppError("validation", "Pick who this goes to.");
  }
  const audienceId = typeof body?.audience?.id === "string" ? body.audience.id : null;
  if (kind === "saved" && (!audienceId || !UUID2.test(audienceId))) throw new AppError("validation", "Pick a list.");
  if (kind === "list" && (!audienceId || !PEOPLE_LISTS.some((l) => l.id === audienceId))) throw new AppError("validation", "Pick a list.");
  const { template: tpl, specs } = await templateValues(ports, { templateId, params: body?.params, visits: false });
  let when = now;
  if (typeof body?.scheduled_for === "string" && body.scheduled_for) {
    const t = new Date(body.scheduled_for);
    if (Number.isNaN(t.getTime())) throw new AppError("validation", "That is not a time.");
    if (!OFFSET.test(body.scheduled_for)) throw new AppError("validation", "Give the time with its offset, like 2026-09-20T15:00:00-04:00.");
    when = t.getTime() > now.getTime() ? t : now;
  }
  const health = await ports.number();
  if (!health) throw new AppError("conflict", "Connect a WhatsApp number first \u2014 a broadcast goes out on one.", 409);
  if (!health.canSend) throw new AppError("conflict", health.refusal, 409);
  const rows = await ports.people(now);
  let savedIds = null;
  let label = EVERYONE_LABEL;
  if (kind === "saved") {
    const seg = await ports.savedList(audienceId);
    if (!seg) throw new AppError("not_found", "List not found.", 404);
    savedIds = new Set(seg.memberIds);
    label = seg.name;
  } else if (kind === "list") {
    label = PEOPLE_LISTS.find((l) => l.id === audienceId).label;
  }
  const purpose = purposeOfTemplate(tpl.category);
  const eligible = eligibleFor(rows, kind, audienceId, savedIds, purpose);
  if (eligible.length === 0) throw new AppError("conflict", emptyAudienceRefusal(purpose), 409);
  if (eligible.length > BROADCAST_MAX_RECIPIENTS) throw new AppError("validation", `At most ${BROADCAST_MAX_RECIPIENTS} people in one broadcast.`);
  const over = overLimitRefusal(health, eligible.length);
  if (over) throw new AppError("validation", over);
  const tz = await ports.timezone();
  const open = nextOpenMoment(tz, when);
  const movedFrom = open.moved ? when.toISOString() : null;
  when = open.at;
  if (when.getTime() > now.getTime() + BROADCAST_SCHEDULE_MAX_DAYS * 864e5) throw new AppError("validation", `Schedule within ${BROADCAST_SCHEDULE_MAX_DAYS} days.`);
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, BROADCAST_NAME_MAX) : broadcastName(tpl.name, tz, now, tpl.title);
  const audience = { kind, id: audienceId, label };
  const made = await assembleRun(ports, {
    broadcast: {
      name,
      template_id: tpl.id,
      template_name: tpl.name,
      template_language: tpl.language,
      params: specs,
      audience,
      state: "scheduled",
      scheduled_for: when.toISOString(),
      recipient_count: eligible.length,
      created_by: cmd.userId
    },
    recipients: eligible.map((p) => ({ contact_id: p.id, facts: null })),
    sendAt: when
  });
  if (!made.ok) {
    if (made.failure === "schedule_failed") throw new AppError("upstream_meta", "The send could not be scheduled. Nothing was sent; try again.", 502, made.error);
    throw new AppError("internal", made.failure === "run_not_created" ? "The broadcast could not be created. Nothing was sent; try again." : "The people could not be enrolled. Nothing was sent; try again.", 500, made.error);
  }
  const decision_id = await ports.record("broadcast", made.id, "send_broadcast", {
    name,
    template: `${tpl.name}/${tpl.language}`,
    category: tpl.category,
    audience: { kind: audience.kind, id: audience.id, label: audience.label },
    values: specs.map(paramLabel),
    recipients: eligible.length,
    scheduled_for: when.toISOString(),
    ...movedFrom ? { moved_from: movedFrom } : {}
  });
  return { id: made.id, name, state: "scheduled", recipient_count: eligible.length, scheduled_for: when.toISOString(), moved_from: movedFrom, decision_id };
}

// src/campaigns/approve.ts
async function approveRun(ports, cmd) {
  const b = cmd.row;
  if (b.state !== "pending_approval") throw new AppError("conflict", "This run is not waiting for approval.", 409);
  const tz = await ports.timezone();
  if (b.playbook_id && b.run_for && localDate(tz, cmd.now) !== b.run_for) {
    throw new AppError("conflict", `This run was made for ${b.run_for} and that day has passed: its people and its words were that day's. Skip it; the next run reads the calendar again.`, 409);
  }
  const open = nextOpenMoment(tz, cmd.now);
  const at = open.at;
  if (!await ports.release(b.id, at)) throw new AppError("conflict", "This run just changed state; look again.", 409);
  try {
    await ports.schedule(b.id, at);
  } catch (e) {
    await ports.hold(b.id);
    throw new AppError("upstream_meta", "The send could not be scheduled. The run is still waiting; try again.", 502, e instanceof Error ? e.message : void 0);
  }
  const scheduledFor = at.toISOString();
  const movedFrom = open.moved ? cmd.now.toISOString() : null;
  const decision_id = await ports.record("broadcast", b.id, "send_broadcast", {
    name: b.name,
    playbook_id: b.playbook_id,
    recipients: b.recipient_count,
    approved: true,
    scheduled_for: scheduledFor,
    ...movedFrom ? { moved_from: movedFrom } : {}
  });
  return { id: b.id, state: "scheduled", recipient_count: b.recipient_count, scheduled_for: scheduledFor, moved_from: movedFrom, decision_id };
}

// src/campaigns/cancel.ts
async function cancelBroadcast(ports, cmd) {
  const b = cmd.row;
  if (b.state !== "scheduled" && b.state !== "sending" && b.state !== "pending_approval") {
    const said2 = b.state === "sent" ? "already been sent" : b.state === "canceled" ? "already been canceled" : "already failed";
    throw new AppError("conflict", `This broadcast has ${said2}.`, 409);
  }
  if (!await ports.cancel(b.id, b.state)) throw new AppError("conflict", "This broadcast just changed state; look again.", 409);
  if (b.state === "scheduled") await ports.withdraw(b.id);
  const decision_id = await ports.record("broadcast", b.id, "cancel_broadcast", { name: b.name, was: b.state });
  return { id: b.id, state: "canceled", was: b.state, decision_id };
}

// src/campaigns/check-playbook.ts
function int(v, fallback, min, max, what) {
  if (v === void 0 || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError("validation", `${what} must be a whole number from ${min} to ${max}.`);
  return n;
}
async function checkPlaybook(ports, body) {
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, PLAYBOOK_NAME_MAX) : "";
  const trig = typeof body?.trigger === "string" ? triggerOf(body.trigger) : null;
  if (!trig) throw new AppError("validation", "Pick what starts it: win-back, welcome, save our number, the month's offer, a visit tomorrow, or a visit yesterday.");
  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  const { template: tpl, specs } = await templateValues(ports, { templateId, params: body?.params, visits: trig.kind === "visit" });
  return {
    // A name when none was given: the trigger's alone when it sends its own starter, else with the template's title.
    name: name || (starterForTrigger(trig.id)?.name === tpl.name ? trig.label : `${trig.label} \xB7 ${templateTitle(tpl.name, tpl.title)}`).slice(0, PLAYBOOK_NAME_MAX),
    trigger: trig.id,
    template_id: tpl.id,
    template_name: tpl.name,
    template_language: tpl.language,
    params: specs,
    policy_class: trig.cls,
    run_hour: int(body?.run_hour, PLAYBOOK_DEFAULTS.runHour, PLAYBOOK_HOURS2.min, PLAYBOOK_HOURS2.max, "The hour"),
    cap_per_run: int(body?.cap_per_run, PLAYBOOK_DEFAULTS.capPerRun, 1, 500, "The cap"),
    gap_days: int(body?.gap_days, PLAYBOOK_DEFAULTS.gapDays, 7, 365, "The gap"),
    cadence_days: int(body?.cadence_days, PLAYBOOK_DEFAULTS.cadenceDays, 1, 90, "The cadence")
  };
}
export {
  BROADCAST_STALL_RETRY_MS,
  IDEMPOTENCY_WINDOW_MS,
  MAX_SNOOZE_MS,
  NEEDS_UNTIL,
  SEND_GRACE_MS,
  approveRun,
  archive,
  assembleRun,
  cancelBroadcast,
  cancelSend,
  checkPlaybook,
  createBroadcast,
  deliver,
  deliverSafely,
  emailSender,
  eraseBlobThread,
  handBack,
  provisionLine,
  replyToConversation,
  resolveEscalation,
  runPlaybook,
  sendBroadcastBatch,
  sendQueued,
  snooze,
  takeOver,
  templatePurpose,
  templateValues,
  wake,
  whatsappSender
};
