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
import { z as z5 } from "zod";
import { z as z4 } from "zod";
import { z as z6 } from "zod";
import { z as z7 } from "zod";
import { z as z8 } from "zod";
import { z as z9 } from "zod";
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
  /** A note changed, taken away, or the receptionist's suggestion kept or dismissed (00157, 0007). Never the words. */
  "contact.note_changed",
  "contact.note_removed",
  "contact.note_suggested",
  "contact.note_kept",
  "contact.note_dismissed",
  "contact.note_done",
  "contact.note_undone",
  "contact.email_set",
  /** A person's proposal link set or cleared at the desk (00154). Never the address. */
  "contact.proposal_set",
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
  "lead.not_a_fit",
  // A deal (0004): written by deal_record, one kind per stage; record kinds, kept.
  "deal.proposed",
  "deal.won",
  "deal.lost",
  "deal.ended"
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
   * and it survives the data it destroyed. Written by the owner (actor_type
   * 'user'), and again by the route for a leg that finished after the rows
   * were gone — the storage sweep.
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
  "end_call",
  "record_deal"
];
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
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
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }),
    parts: new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
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
  const made = {
    key: `${p.year}-${p.month}-${p.day}`,
    year: Number(p.year),
    hh: Number(p.hour) % 24,
    mm: Number(p.minute)
  };
  if (WALLS.size >= WALLS_MAX) WALLS.clear();
  WALLS.set(id, made);
  return made;
}
function clockDate(atMs, tz, nowMs) {
  const f = formatsFor(tz);
  return wall(atMs, tz).year === wall(nowMs, tz).year ? f.date.format(new Date(atMs)) : f.dateYear.format(new Date(atMs));
}
var BRAIN_INTENTS = [
  "booking",
  "pricing",
  "hours",
  "services",
  "location",
  "complaint",
  "smalltalk",
  "other"
];
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
  facts_used: z2.array(z2.string()).catch([]).transform(
    (a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))
  ),
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
var RECORDING_NOTE = {
  none: "No recording",
  pending: "Recording still processing",
  failed: "Recording couldn't be saved",
  purged: `Recording removed after ${RECORDING_RETENTION_DAYS} days`
};
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
    case "settings":
      return "Your workspace settings could not be read, so the calendar address could not be found. Save it again in Settings.";
    default:
      return null;
  }
}
var POLICY_CLASS_WORDS = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: {
    name: "Service & pricing questions",
    short: "Questions",
    note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone"
  },
  booking: {
    name: "Book \xB7 reschedule",
    short: "Bookings",
    note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone"
  },
  reengage: {
    name: "Re-engage quiet customers",
    short: "Re-engage",
    note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing"
  },
  campaign: {
    name: "Standing offers",
    short: "Offers",
    note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing"
  },
  reviews: {
    name: "Google reviews",
    short: "Reviews",
    note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you"
  },
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
  handoff_number: z3.string().regex(E164, "E.164, like +12125550143").optional(),
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
function dayProblems(h, day) {
  const name = DAY_NAME[day] ?? day;
  const out = [];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    out.push({
      path: [open ? "close" : "open"],
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    out.push({ path: ["close"], message: `${name} closes at or before it opens.` });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY) {
    out.push({ path: ["intervals"], message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY} shifts.` });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      out.push({ path: ["intervals", n, "close"], message: `${name}: a shift has to close after it opens.` });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      out.push({ path: ["intervals", n, "open"], message: `${name}: two shifts overlap.` });
    }
  }
  return out;
}
function checkDay(h, day, ctx) {
  for (const p of dayProblems(h, day)) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["brain", "profile", "hours", day, ...p.path],
      message: p.message
    });
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
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["calendar", "ical_url"],
      message: feedProblemWords("address") ?? "Not an address the receptionist may read."
    });
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
var REPLY_WINDOW_HOURS = 72;
var REPLY_WINDOW_MS = REPLY_WINDOW_HOURS * 36e5;
var REPLY_WINDOW_WORDS = `within ${REPLY_WINDOW_HOURS / 24} days`;
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
var words = (min, max) => z4.string().transform((s) => stripUnsafe(s).trim()).pipe(z4.string().min(min).max(max));
var LeadSearchPlanSchema = z4.object({
  version: z4.number().int().min(1),
  card: z4.literal("local_businesses"),
  name: words(2, 80),
  asked: words(1, 400),
  terms: z4.array(words(2, 60)).min(1).max(5),
  area: z4.object({
    kind: z4.enum(["zip", "city", "radius"]),
    label: words(2, 80),
    state: z4.string().regex(/^[A-Z]{2}$/),
    center: z4.object({ lat: z4.number().min(-90).max(90), lng: z4.number().min(-180).max(180) }).nullable(),
    radius_m: z4.number().int().min(500).max(2e5),
    zip: z4.string().regex(/^\d{5}$/).optional(),
    query: words(2, 120)
  }),
  count: z4.number().int().min(1).max(LEAD_MAX_PLACES),
  contact: z4.enum(["phone", "email"]),
  criteria: z4.array(
    z4.object({
      key: z4.string().regex(KEY),
      text: words(2, 120),
      standard: z4.enum(["likely", "seen"]),
      required: z4.boolean()
    })
  ).max(8),
  exclusions: z4.array(
    z4.object({
      key: z4.string().regex(KEY),
      text: words(2, 80),
      origin: z4.enum(["claude", "you_said"]),
      category_key: z4.string().regex(KEY).optional()
    })
  ).max(8)
}).superRefine((p, ctx) => {
  const keys = [...p.criteria.map((c) => c.key), ...p.exclusions.map((e) => e.key)];
  if (new Set(keys).size !== keys.length)
    ctx.addIssue({
      code: "custom",
      message: "every criterion and exclusion has a key of its own",
      path: ["criteria"]
    });
  const lowerTerms = p.terms.map((t) => t.toLowerCase());
  if (new Set(lowerTerms).size !== lowerTerms.length)
    ctx.addIssue({ code: "custom", message: "the terms are not the same phrase twice", path: ["terms"] });
  if (p.area.kind === "radius" && p.area.center === null)
    ctx.addIssue({ code: "custom", message: "a radius needs a center", path: ["area", "center"] });
  if (p.area.kind === "zip" && !p.area.zip)
    ctx.addIssue({
      code: "custom",
      message: "a ZIP ask needs a zip code (A2 derives its center from the ZCTA table)",
      path: ["area", "zip"]
    });
  if (!US_CODES.has(p.area.state))
    ctx.addIssue({ code: "custom", message: "state is not a real US state or DC", path: ["area", "state"] });
});
var US_NAMES = Object.fromEntries(
  Object.entries(US_STATES).map(([name, code2]) => [code2, name])
);
var LEAD_CLASSES = LEAD_MEMBER_CLASSES;
var LEAD_LISTS = ["all", "ready", "nurture", "converted", "said_no", "not_a_fit"];
var LEAD_SORTS = ["fit", "found", "distance", "business", "rating", "stage"];
var LEAD_CALL_OUTCOMES = [
  "interested",
  "call_back",
  "not_interested",
  "voicemail",
  "no_answer",
  "wrong_number"
];
var LEAD_NOT_A_FIT_WHYS = ["chain", "wrong_kind", "too_far", "customer", "other"];
var LEAD_CLOSED_WORDS = {
  said_no: "Said no",
  not_a_fit: "Not a fit",
  customer: "Already a customer",
  stale: "Went quiet",
  search_removed: "Search removed"
};
var LEAD_CALL_OUTCOME_TONES = {
  interested: "ok",
  call_back: "warn",
  voicemail: "plain",
  no_answer: "plain",
  not_interested: "danger",
  wrong_number: "danger"
};
var LEAD_CALL_OUTCOME_WORDS = {
  interested: "Interested",
  call_back: "Call back later",
  not_interested: "Not interested",
  voicemail: "Left a voicemail",
  no_answer: "No answer",
  wrong_number: "Wrong number"
};
var LEAD_DRAFT_NOTE = "Your business address and a way to say no are added at the foot, as US law asks.";
var LEAD_NOT_A_FIT_WORDS = {
  chain: "A chain or franchise",
  wrong_kind: "The wrong kind of business",
  too_far: "Too far away",
  customer: "Already a customer",
  other: "Something else"
};
var LEAD_NOT_A_FIT_TITLE = "What makes it not a fit?";
var LEAD_SENT_QUESTION = "Did you send it?";
var LEAD_CALL_QUESTION = "How did the call go?";
var LEAD_NOTE_PLACEHOLDER = "A note for next time, if you like";
var LEAD_NOTE_MAX = 280;
var LEAD_TALKING_NOTE = "They join People when they write or call in, or when a call goes well.";
function leadNoteLeft(left, max) {
  return left >= max ? `Up to ${max} characters` : `${left} left`;
}
var LEAD_UNCLAIMED_NOTE = "Listing not claimed by the owner";
var LEAD_FIRST_DAY_TITLE = "Your people gather here";
var LEAD_FIRST_DAY_SUB = "Or have Claude find businesses worth reaching";
var LEAD_FIRST_DAY_FOOT = "Claude finds businesses, not people at home.";
var LEAD_SUGGEST_UNAVAILABLE = "Suggestions are not available right now.";
var LEAD_WORDS = {
  /**
   * The ways a lead can be rung, offered when Call is pressed rather than dialling on the spot. Pressing it rang a
   * real business the moment a thumb landed on a row you might only have been skimming, and a call made from a
   * desk phone could not be recorded at all -- the six outcomes are armed by that button alone.
   *
   * The receptionist is NOT one of the ways and must not become one here. It answers the line and never rings a
   * customer (`business-tab.ts` CANNOT_ROWS, "outbound_call"), which the Business page states to the owner in
   * those words. A menu item offering it would promise what the product says two pages away that it cannot do.
   */
  callWays: {
    dial: { label: "Call from your phone" },
    copy: { label: "Copy the number" },
    /** Rung from a desk phone or a softphone: no dial, straight to "How did the call go?". */
    log: { label: "Log a call you already made", meta: "how did it go?" }
  },
  close: "Close",
  open: "Open",
  stageLabel: "Stage",
  notFit: LEAD_CLOSED_WORDS.not_a_fit,
  notFitTitle: LEAD_NOT_A_FIT_TITLE,
  whys: LEAD_NOT_A_FIT_WHYS.map((id) => ({ id, label: LEAD_NOT_A_FIT_WORDS[id] })),
  keep: "Keep",
  exclude: "Exclude",
  putBack: "Put back",
  leftOut: "Left out of this search. It doesn't count.",
  reach: "How you can reach them",
  checked: "Checked",
  found: "Found",
  call: "Call",
  copy: "Copy",
  copyAria: "Copy the email",
  /** The peek's reach rows act with quiet marks; these are their names, heard and shown on hover (data-tip). */
  copyPhoneAria: "Copy the number",
  draftAria: "Draft an email",
  draft: "Draft",
  noWebsite: "No website listed",
  instagram: "Instagram",
  talkingNote: LEAD_TALKING_NOTE,
  sentQuestion: LEAD_SENT_QUESTION,
  sentYes: "Yes, mark contacted",
  sentNo: "Not yet",
  callQuestion: LEAD_CALL_QUESTION,
  callSave: "Save",
  callCancel: "I didn't call",
  outcomes: LEAD_CALL_OUTCOMES.map((id) => ({
    id,
    label: LEAD_CALL_OUTCOME_WORDS[id],
    tone: LEAD_CALL_OUTCOME_TONES[id]
  })),
  noteLabel: "A note about the call",
  notePlaceholder: LEAD_NOTE_PLACEHOLDER,
  noteMax: LEAD_NOTE_MAX,
  noteLeft: leadNoteLeft,
  backTo: "Back to",
  to: "To",
  subject: "Subject",
  draftRewrite: "Rewrite",
  tones: [
    { id: "shorter", label: "Shorter" },
    { id: "warmer", label: "Warmer" }
  ],
  draftWriting: "Writing it\u2026",
  draftNote: LEAD_DRAFT_NOTE,
  draftOpen: "Open in your email",
  draftFrom: "Sent from your own inbox",
  copiedDraft: "Copied the email.",
  firstDay: { title: LEAD_FIRST_DAY_TITLE, sub: LEAD_FIRST_DAY_SUB, foot: LEAD_FIRST_DAY_FOOT },
  about: "About",
  reachHeading: "Reach",
  unclaimed: LEAD_UNCLAIMED_NOTE,
  suggestUnavailable: LEAD_SUGGEST_UNAVAILABLE,
  // D5: the peek re-cut, and the photo expanded.
  expand: "Expand",
  photos: "Photos",
  noPhoto: "No photo on the listing",
  whereSits: "Where it sits",
  openHours: "Open hours",
  fromListing: "From the listing",
  openMaps: "Open in Maps",
  ratedHeading: "What people say",
  closePhotos: "Close",
  // D5, on a phone: one lead at a time, and the question when you are back from the call.
  deckOf: (at2, of) => `${at2} of ${of}`,
  deckPrev: "The lead before",
  deckNext: "The next lead",
  callSaveNext: "Save and go to the next",
  callSavedNote: "Saving moves them to Talking. They join People when they write or call in."
};
var LeadsQuerySchema = z5.object({
  list: z5.enum(LEAD_LISTS).default("all"),
  search: z5.string().uuid().optional(),
  class: z5.enum(LEAD_CLASSES).optional(),
  sort: z5.enum(LEAD_SORTS).default("fit"),
  dir: z5.enum(["asc", "desc"]).default("asc"),
  after_key: z5.string().max(80).optional(),
  after_id: z5.string().uuid().optional(),
  limit: z5.coerce.number().int().min(1).max(500).default(500)
});
var LeadsViewSchema = LeadsQuerySchema.omit({ after_key: true, after_id: true, limit: true });
var LeadStageInputSchema = z5.discriminatedUnion("kind", [
  z5.object({ kind: z5.literal("stage"), stage: z5.enum(["ready", "nurture", "converted"]) }),
  z5.object({ kind: z5.literal("not_a_fit"), why: z5.enum(LEAD_NOT_A_FIT_WHYS) }),
  z5.object({ kind: z5.literal("said_no") }),
  z5.object({
    kind: z5.literal("outcome"),
    outcome: z5.enum(LEAD_CALL_OUTCOMES),
    note: z5.string().trim().max(280).optional()
  }),
  /** "Did you send it?" Yes. */
  z5.object({ kind: z5.literal("emailed") })
]);
var LeadsBulkSchema = z5.discriminatedUnion("by", [
  // Keep and Exclude (D3) take ids only, and may name the search the Needs review pile is read in.
  z5.object({
    by: z5.literal("ids"),
    action: z5.enum(["contacted", "not_a_fit", "keep", "exclude"]),
    ids: z5.array(z5.string().uuid()).min(1).max(500),
    search_id: z5.string().uuid().optional()
  }),
  z5.object({ by: z5.literal("view"), action: z5.enum(["contacted", "not_a_fit"]), view: LeadsViewSchema })
]);
var LeadsCheckAgainSchema = z5.object({ ids: z5.array(z5.string().uuid()).min(1).max(500) });
var LeadDraftInputSchema = z5.object({
  tone: z5.enum(["first", "shorter", "warmer"]).default("first"),
  previous: z5.object({ subject: z5.string().max(200), body: z5.string().max(4e3) }).optional()
});
var RenameLeadSearchSchema = z5.object({ name: z5.string().trim().min(1).max(80) });
var BusinessLineSchema = z5.object({ business_line: z5.string().trim().min(3).max(160) });
var planChip = (max) => z5.string().trim().min(2).max(max);
var ProposeLeadSearchSchema = z5.object({
  looking_for: z5.enum(["local_businesses", "people", "online_sellers", "other"]),
  country: z5.string().trim().min(2).max(40),
  count: z5.number().int().min(1).max(LEAD_MAX_PLACES),
  /** Plural, as the sentence says it: "personal trainers". */
  who: planChip(60),
  /** One of them, for the question and the judge's rubric: "personal trainer". */
  who_one: planChip(60),
  category_key: z5.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  terms: z5.array(planChip(60)).min(1).max(5),
  city: z5.string().trim().max(60).nullable().default(null),
  region: z5.string().trim().min(2).max(40),
  zip: z5.string().regex(/^\d{5}$/).nullable().default(null),
  contact: z5.enum(["phone", "email"]),
  criteria: z5.array(z5.object({ text: planChip(120), standard: z5.enum(["likely", "seen"]), required: z5.boolean() })).max(6).default([]),
  leave_out: z5.array(z5.object({ words: planChip(40) })).max(6).default([]),
  asked: z5.string().trim().min(1).max(400)
});
var LeadDraftAnswerSchema = z5.object({
  subject: z5.string().trim().min(3).max(120),
  body: z5.string().trim().min(20).max(2e3)
});
var LeadSuggestAnswerSchema = z5.object({
  line: z5.string().trim().min(3).max(160),
  items: z5.array(
    z5.object({
      words: z5.string().trim().min(3).max(80),
      who_for: z5.string().trim().min(3).max(120),
      category_key: z5.string().regex(/^[a-z_]{2,40}$/)
    })
  ).min(1).max(4)
});
var LEAD_UNDO_MS = 24 * 60 * 6e4;
var DEAL_STAGES = ["proposed", "won", "lost", "ended"];
function dealsAreOn(sellsBy) {
  return sellsBy === "proposal";
}
function isDealStage(s) {
  return typeof s === "string" && DEAL_STAGES.includes(s);
}
function pickCurrentDeal(rows) {
  const sorted = [...rows].sort(
    (a, b) => Number(dealIsOpen(b)) - Number(dealIsOpen(a)) || Date.parse(b.created_at) - Date.parse(a.created_at)
  );
  return sorted[0] ?? null;
}
function dealIsOpen(d) {
  return !!d && (d.stage === "proposed" || d.stage === "won");
}
function proposalLinkOf(current, personLink) {
  if (!current) return personLink?.trim() || null;
  if (current.stage !== "proposed") return null;
  return (current.proposal_url ?? current.proposal?.url)?.trim() || null;
}
function dealSinceMs(d) {
  const at2 = d.stage === "proposed" ? d.proposed_at : d.stage === "ended" ? d.ended_at : d.decided_at ?? d.proposed_at;
  const ms2 = at2 ? Date.parse(at2) : NaN;
  return Number.isFinite(ms2) ? ms2 : null;
}
function dealSentence(d, nowMs, tz = "UTC", opts = {}) {
  if (!d || !isDealStage(d.stage)) return null;
  const svc = d.service ? ` (${d.service})` : "";
  const sinceMs = dealSinceMs(d);
  const on = sinceMs === null ? "" : ` on ${clockDate(sinceMs, tz, nowMs)}`;
  const since = sinceMs === null ? "" : `, since ${clockDate(sinceMs, tz, nowMs)}`;
  switch (d.stage) {
    case "won":
      return `They are a client${svc}${since}. Offer them the service itself, not a consultation. Anything about their engagement or what it costs goes to a person: say someone will follow up, and hand over.`;
    case "proposed":
      return opts.hasLink ? `A proposal${svc} went out to them${on} and is waiting on their answer. If they ask about it, send them the proposal link and state none of its figures, then hand over.` : `A proposal${svc} went out to them${on} and is waiting on their answer. If they ask about it, say the person who sent it will follow up, and hand over. Never discuss its price.`;
    case "lost":
      return `They passed on a proposal${svc}${on}. Do not bring it up; if they ask again, hand over to a person.`;
    case "ended":
      return `A former client${svc}: the engagement ended${on}. Treat them as any customer.`;
  }
}
var PERSON_MODE_LABELS = { auto: "Answer", ask: "Ask me first", never: "Never" };
var PERSON_MODE_WORDS = {
  ...PERSON_MODE_LABELS,
  inherit: "Follow the workspace"
};
var DAY_MS4 = 864e5;
var WEEK_MS2 = 7 * DAY_MS4;
var MONTH_MS = 30 * DAY_MS4;
var NEW_WINDOW_MS = 7 * DAY_MS4;
var QUIET_AFTER_MS = 30 * DAY_MS4;
var NOTE_MAX = 600;
var NOTE_REFUSALS = {
  empty: "Write something first.",
  too_long: `A note is at most ${NOTE_MAX} characters.`,
  not_found: "This person or this note is no longer here.",
  not_a_member: "That person is not on the team.",
  not_yours: "Only the person who wrote this note can change it.",
  moved: "Someone changed this note since you opened it. Read it again, then save.",
  decided: "Someone already decided on this suggestion.",
  bad_source: "Could not save this note.",
  bad_deal: "That deal is not this person's.",
  not_a_step: "Only a note with a day can be done."
};
var REPLY_VIA = {
  whatsapp: "WhatsApp",
  sms: "Text",
  email: "Email"
};
var PERSON_CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  sms: "Text",
  voice: "Phone",
  email: "Email"
};
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
var DAY_MS5 = 24 * 3600 * 1e3;
var DAY_MS6 = 864e5;
var QUIET_AFTER_MS2 = 7 * DAY_MS6;
var DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var CHANNEL_KIND_WORDS = {
  whatsapp: "WhatsApp",
  voice: "Phone line",
  sms: "Texting",
  email: "Email",
  instagram: "Instagram"
};
var KIND_META = {
  whatsapp: {
    name: `${CHANNEL_KIND_WORDS.whatsapp} Business`,
    what: "Customers text this number; the receptionist answers",
    icon: "chat",
    noun: "message"
  },
  voice: {
    name: CHANNEL_KIND_WORDS.voice,
    what: "Customers call this number; the receptionist picks up",
    icon: "phone",
    noun: "call"
  },
  sms: { name: CHANNEL_KIND_WORDS.sms, what: "Text messages", icon: "chat", noun: "message" },
  email: { name: CHANNEL_KIND_WORDS.email, what: "Email", icon: "mail", noun: "email" },
  instagram: { name: CHANNEL_KIND_WORDS.instagram, what: "Direct messages", icon: "instagram", noun: "message" }
};
var NOTE_SUGGEST_KINDS = ["preference", "timing", "contact", "sensitivity", "context"];
var NOTE_SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    worth: { type: "boolean" },
    kind: { type: "string", enum: [...NOTE_SUGGEST_KINDS, "none"] },
    text: { type: "string" },
    quote: { type: "string" }
  },
  required: ["worth", "kind", "text", "quote"],
  additionalProperties: false
};
var ASK_CITATION_KINDS = ["thread", "conversation", "call", "person", "page"];
var ASK_LANGUAGES = ["en", "es", "other"];
var ASK_UNDO_MS = 10 * 6e4;
var AskProposalOutcomeSchema = z6.object({
  state: z6.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z6.string().max(300).catch(""),
  atMs: z6.number().catch(0),
  undo: z6.record(z6.string(), z6.unknown()).nullable().optional()
});
var AskSettingsChangeSchema = z6.discriminatedUnion("op", [
  z6.object({
    op: z6.literal("add_closure"),
    date: z6.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    until: z6.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z6.string().max(200).optional()
  }),
  z6.object({
    op: z6.literal("set_hours"),
    day: z6.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    open: z6.string().regex(/^\d{2}:\d{2}$/).nullable(),
    close: z6.string().regex(/^\d{2}:\d{2}$/).nullable()
  }),
  z6.object({ op: z6.literal("add_note"), title: z6.string().min(1).max(80), text: z6.string().min(1).max(1200) }),
  z6.object({
    op: z6.literal("add_service"),
    name: z6.string().min(1).max(80),
    duration_min: z6.number().int().min(1).max(1440).optional()
  })
]);
var ASK_ANSWER_CAPS = {
  headline: 160,
  detail: 700,
  figures: 4,
  items: 5,
  parts: 4,
  next: 2,
  value: 24,
  label: 60,
  note: 60,
  title: 80,
  meta: 60,
  line: 160,
  question: 90
};
var C = ASK_ANSWER_CAPS;
var SOURCE = {
  type: "object",
  description: "A row or a page read this turn (the workspace block and the reads above count, as does a tool's result), with the kind and the exact id it came with (a page's id is its route); kind none when it rests on nothing read.",
  properties: {
    kind: { type: "string", enum: [...ASK_CITATION_KINDS, "none"] },
    id: { type: "string" },
    label: { type: "string", description: `A short name for it, at most ${C.label} characters.` }
  },
  required: ["kind", "id", "label"],
  additionalProperties: false
};
var ASK_ANSWER_FORMAT = {
  type: "object",
  properties: {
    say: {
      type: "object",
      properties: {
        headline: {
          type: "string",
          description: `The answer itself in one sentence, the finding first and never a preamble; under 20 words and at most ${C.headline} characters.`
        },
        detail: {
          type: "string",
          description: `Only what the headline needs: empty when the headline is enough; at most two short sentences, or five when they asked why, how, for a summary or for detail; at most ${C.detail} characters.`
        }
      },
      required: ["headline", "detail"],
      additionalProperties: false
    },
    show: {
      type: "object",
      properties: {
        figures: {
          type: "array",
          description: `The numbers the headline rests on, at most ${C.figures}; empty when there is none.`,
          items: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: `The number as said: "5", "44%", "1 min"; at most ${C.value} characters.`
              },
              label: { type: "string", description: `What it counts, at most ${C.label} characters.` },
              note: {
                type: "string",
                description: `How it compares ("up from 1"), or empty; at most ${C.note} characters.`
              },
              source: SOURCE
            },
            required: ["value", "label", "note", "source"],
            additionalProperties: false
          }
        },
        items: {
          type: "array",
          description: `The rows the answer names (people, threads, calls), at most ${C.items}; empty when it names none. Each opens its row.`,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: `Who or what it is, at most ${C.title} characters.` },
              meta: {
                type: "string",
                description: `The channel and how long, or empty; at most ${C.meta} characters.`
              },
              line: { type: "string", description: `Why it matters, in one line of at most ${C.line} characters.` },
              source: SOURCE
            },
            required: ["title", "meta", "line", "source"],
            additionalProperties: false
          }
        },
        breakdown: {
          type: "object",
          description: `One whole in its parts, at most ${C.parts} parts whose values add up exactly to total; parts empty when nothing splits.`,
          properties: {
            label: {
              type: "string",
              description: `What the whole is ("customer messages"), at most ${C.label} characters.`
            },
            total: { type: "number" },
            parts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: `At most ${C.label} characters.` },
                  value: { type: "number" },
                  warn: { type: "boolean", description: "True for the one part that needs attention." }
                },
                required: ["label", "value", "warn"],
                additionalProperties: false
              }
            },
            source: SOURCE
          },
          required: ["label", "total", "parts", "source"],
          additionalProperties: false
        }
      },
      required: ["figures", "items", "breakdown"],
      additionalProperties: false
    },
    do: {
      type: "object",
      properties: {
        open: {
          type: "object",
          description: "The one place to open, when it helps: its source, kind none when nothing needs opening.",
          properties: {
            source: SOURCE,
            label: { type: "string", description: `The button's words, at most ${C.label} characters.` },
            now: {
              type: "boolean",
              description: "True when they asked to open, show or see it: the app goes there as the answer lands."
            }
          },
          required: ["source", "label", "now"],
          additionalProperties: false
        },
        next: {
          type: "array",
          description: `Up to ${C.next} short questions they might ask next, at most ${C.question} characters each, never one about a place already offered; empty when nothing follows.`,
          items: { type: "string" }
        }
      },
      required: ["open", "next"],
      additionalProperties: false
    },
    language: { type: "string", enum: [...ASK_LANGUAGES] }
  },
  required: ["say", "show", "do", "language"],
  additionalProperties: false
};
var L = (id, name, region, native) => ({
  id,
  label: region ? `${name} (${region})` : name,
  name,
  region,
  native
});
var WHATSAPP_LANGUAGES = [
  L("af", "Afrikaans", null, "Afrikaans"),
  L("sq", "Albanian", null, "Shqip"),
  L("ar", "Arabic", null, "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_EG", "Arabic", "Egypt", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_LB", "Arabic", "Lebanon", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_MA", "Arabic", "Morocco", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_QA", "Arabic", "Qatar", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_AE", "Arabic", "UAE", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("az", "Azerbaijani", null, "Az\u0259rbaycan"),
  L("be_BY", "Belarusian", null, "\u0411\u0435\u043B\u0430\u0440\u0443\u0441\u043A\u0430\u044F"),
  L("bn", "Bengali", null, "\u09AC\u09BE\u0982\u09B2\u09BE"),
  L("bn_IN", "Bengali", "India", "\u09AC\u09BE\u0982\u09B2\u09BE"),
  L("bg", "Bulgarian", null, "\u0411\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438"),
  L("ca", "Catalan", null, "Catal\xE0"),
  L("zh_CN", "Chinese", "China", "\u7B80\u4F53\u4E2D\u6587"),
  L("zh_HK", "Chinese", "Hong Kong", "\u7E41\u9AD4\u4E2D\u6587\uFF08\u9999\u6E2F\uFF09"),
  L("zh_TW", "Chinese", "Taiwan", "\u7E41\u9AD4\u4E2D\u6587\uFF08\u53F0\u7063\uFF09"),
  L("hr", "Croatian", null, "Hrvatski"),
  L("cs", "Czech", null, "\u010Ce\u0161tina"),
  L("da", "Danish", null, "Dansk"),
  L("prs_AF", "Dari", null, "\u062F\u0631\u06CC"),
  L("nl", "Dutch", null, "Nederlands"),
  L("nl_BE", "Dutch", "Belgium", "Nederlands"),
  L("en", "English", null, "English"),
  L("en_AU", "English", "Australia", "English"),
  L("en_CA", "English", "Canada", "English"),
  L("en_GH", "English", "Ghana", "English"),
  L("en_IN", "English", "India", "English"),
  L("en_IE", "English", "Ireland", "English"),
  L("en_JM", "English", "Jamaica", "English"),
  L("en_MY", "English", "Malaysia", "English"),
  L("en_NZ", "English", "New Zealand", "English"),
  L("en_QA", "English", "Qatar", "English"),
  L("en_SG", "English", "Singapore", "English"),
  L("en_ZA", "English", "South Africa", "English"),
  L("en_AE", "English", "UAE", "English"),
  L("en_UG", "English", "Uganda", "English"),
  L("en_GB", "English", "UK", "English"),
  L("en_US", "English", "US", "English"),
  L("et", "Estonian", null, "Eesti"),
  L("fil", "Filipino", null, "Filipino"),
  L("fi", "Finnish", null, "Suomi"),
  L("fr", "French", null, "Fran\xE7ais"),
  L("fr_BE", "French", "Belgium", "Fran\xE7ais"),
  L("fr_CA", "French", "Canada", "Fran\xE7ais"),
  L("fr_CI", "French", "C\xF4te d\u2019Ivoire", "Fran\xE7ais"),
  L("fr_MA", "French", "Morocco", "Fran\xE7ais"),
  L("fr_CH", "French", "Switzerland", "Fran\xE7ais"),
  L("ka", "Georgian", null, "\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8"),
  L("de", "German", null, "Deutsch"),
  L("de_AT", "German", "Austria", "Deutsch"),
  L("de_CH", "German", "Switzerland", "Deutsch"),
  L("el", "Greek", null, "\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC"),
  L("gu", "Gujarati", null, "\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0"),
  L("ha", "Hausa", null, "Hausa"),
  L("he", "Hebrew", null, "\u05E2\u05D1\u05E8\u05D9\u05EA"),
  L("hi", "Hindi", null, "\u0939\u093F\u0928\u094D\u0926\u0940"),
  L("hu", "Hungarian", null, "Magyar"),
  L("id", "Indonesian", null, "Bahasa Indonesia"),
  L("ga", "Irish", null, "Gaeilge"),
  L("it", "Italian", null, "Italiano"),
  L("ja", "Japanese", null, "\u65E5\u672C\u8A9E"),
  L("kn", "Kannada", null, "\u0C95\u0CA8\u0CCD\u0CA8\u0CA1"),
  L("kk", "Kazakh", null, "\u049A\u0430\u0437\u0430\u049B \u0442\u0456\u043B\u0456"),
  L("rw_RW", "Kinyarwanda", null, "Ikinyarwanda"),
  L("ko", "Korean", null, "\uD55C\uAD6D\uC5B4"),
  L("ky_KG", "Kyrgyz", "Kyrgyzstan", "\u041A\u044B\u0440\u0433\u044B\u0437\u0447\u0430"),
  L("lo", "Lao", null, "\u0EA5\u0EB2\u0EA7"),
  L("lv", "Latvian", null, "Latvie\u0161u"),
  L("lt", "Lithuanian", null, "Lietuvi\u0173"),
  L("mk", "Macedonian", null, "\u041C\u0430\u043A\u0435\u0434\u043E\u043D\u0441\u043A\u0438"),
  L("ms", "Malay", null, "Bahasa Melayu"),
  L("ml", "Malayalam", null, "\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02"),
  L("mr", "Marathi", null, "\u092E\u0930\u093E\u0920\u0940"),
  L("nb", "Norwegian", null, "Norsk bokm\xE5l"),
  L("ps_AF", "Pashto", null, "\u067E\u069A\u062A\u0648"),
  L("fa", "Persian", null, "\u0641\u0627\u0631\u0633\u06CC"),
  L("pl", "Polish", null, "Polski"),
  L("pt_BR", "Portuguese", "Brazil", "Portugu\xEAs"),
  L("pt_PT", "Portuguese", "Portugal", "Portugu\xEAs"),
  L("pa", "Punjabi", null, "\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40"),
  L("ro", "Romanian", null, "Rom\xE2n\u0103"),
  L("ru", "Russian", null, "\u0420\u0443\u0441\u0441\u043A\u0438\u0439"),
  L("sr", "Serbian", null, "\u0421\u0440\u043F\u0441\u043A\u0438"),
  L("si_LK", "Sinhala", null, "\u0DC3\u0DD2\u0D82\u0DC4\u0DBD"),
  L("sk", "Slovak", null, "Sloven\u010Dina"),
  L("sl", "Slovenian", null, "Sloven\u0161\u010Dina"),
  L("es", "Spanish", null, "Espa\xF1ol"),
  L("es_AR", "Spanish", "Argentina", "Espa\xF1ol"),
  L("es_CL", "Spanish", "Chile", "Espa\xF1ol"),
  L("es_CO", "Spanish", "Colombia", "Espa\xF1ol"),
  L("es_CR", "Spanish", "Costa Rica", "Espa\xF1ol"),
  L("es_DO", "Spanish", "Dominican Republic", "Espa\xF1ol"),
  L("es_EC", "Spanish", "Ecuador", "Espa\xF1ol"),
  L("es_HN", "Spanish", "Honduras", "Espa\xF1ol"),
  L("es_MX", "Spanish", "Mexico", "Espa\xF1ol"),
  L("es_PA", "Spanish", "Panama", "Espa\xF1ol"),
  L("es_PE", "Spanish", "Peru", "Espa\xF1ol"),
  L("es_ES", "Spanish", "Spain", "Espa\xF1ol"),
  L("es_UY", "Spanish", "Uruguay", "Espa\xF1ol"),
  L("sw", "Swahili", null, "Kiswahili"),
  L("sv", "Swedish", null, "Svenska"),
  L("ta", "Tamil", null, "\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD"),
  L("te", "Telugu", null, "\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41"),
  L("th", "Thai", null, "\u0E44\u0E17\u0E22"),
  L("tr", "Turkish", null, "T\xFCrk\xE7e"),
  L("uk", "Ukrainian", null, "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430"),
  L("ur", "Urdu", null, "\u0627\u0631\u062F\u0648"),
  L("uz", "Uzbek", null, "O\u02BBzbek"),
  L("vi", "Vietnamese", null, "Ti\u1EBFng Vi\u1EC7t"),
  L("zu", "Zulu", null, "isiZulu")
];
var BY_ID = new Map(WHATSAPP_LANGUAGES.map((l) => [l.id.toLowerCase(), l]));
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
var LIMIT_TIERS = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
var LIST_RULE_FIELDS = [
  { id: "last_visit", label: "Last visit", kind: "days", needsCalendar: true },
  { id: "next_visit", label: "Next visit", kind: "days", needsCalendar: true },
  { id: "booked", label: "A visit booked", kind: "yesno", needsCalendar: true },
  { id: "asked_not_booked", label: "Asked, never booked", kind: "yesno", needsCalendar: true },
  { id: "last_heard", label: "Last heard from", kind: "days", needsCalendar: false },
  { id: "first_contact", label: "First contact", kind: "days", needsCalendar: false },
  { id: "channel", label: "Reaches you by", kind: "channel", needsCalendar: false },
  { id: "came_from", label: "Came from", kind: "came_from", needsCalendar: false },
  { id: "calls", label: "Calls", kind: "count", needsCalendar: false },
  { id: "conversations", label: "Conversations", kind: "count", needsCalendar: false },
  { id: "offers_yes", label: "Said yes to offers", kind: "yesno", needsCalendar: false }
];
var CHANNELS = ["whatsapp", "sms", "voice", "email"];
var CAME_FROM = [
  "whatsapp",
  "sms",
  "email",
  "call",
  "calendar",
  "manual",
  "import",
  "lead"
];
var Days = z7.object({
  op: z7.enum(["more_than", "within"]),
  days: z7.number().int().min(1).max(3650)
});
var Count = z7.object({ op: z7.enum(["at_least", "at_most"]), n: z7.number().int().min(0).max(1e4) });
var YesNo = z7.object({ op: z7.literal("is"), yes: z7.boolean() });
var ListConditionSchema = z7.discriminatedUnion("field", [
  z7.object({ field: z7.literal("last_visit"), ...Days.shape }),
  z7.object({ field: z7.literal("next_visit"), ...Days.shape }),
  z7.object({ field: z7.literal("booked"), ...YesNo.shape }),
  z7.object({ field: z7.literal("asked_not_booked"), ...YesNo.shape }),
  z7.object({ field: z7.literal("last_heard"), ...Days.shape }),
  z7.object({ field: z7.literal("first_contact"), ...Days.shape }),
  z7.object({ field: z7.literal("channel"), op: z7.enum(["is", "is_not"]), channel: z7.enum(CHANNELS) }),
  z7.object({ field: z7.literal("came_from"), op: z7.enum(["is", "is_not"]), from: z7.enum(CAME_FROM) }),
  z7.object({ field: z7.literal("calls"), ...Count.shape }),
  z7.object({ field: z7.literal("conversations"), ...Count.shape }),
  z7.object({ field: z7.literal("offers_yes"), ...YesNo.shape })
]);
var ListRuleSchema = z7.object({
  all: z7.array(ListConditionSchema).min(1).max(8)
});
var LIST_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "all", "cannot"],
  properties: {
    name: { type: "string" },
    cannot: { type: "string" },
    all: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "op"],
        properties: {
          field: { type: "string", enum: LIST_RULE_FIELDS.map((f) => f.id) },
          op: { type: "string", enum: ["more_than", "within", "at_least", "at_most", "is", "is_not"] },
          days: { type: "integer" },
          n: { type: "integer" },
          yes: { type: "boolean" },
          channel: { type: "string", enum: [...CHANNELS] },
          from: { type: "string", enum: [...CAME_FROM] }
        }
      }
    }
  }
};
var ListDraftAnswerSchema = z7.object({
  name: z7.string().trim().min(1).max(60),
  cannot: z7.string().trim().max(200),
  all: z7.array(ListConditionSchema).max(8)
});
var DAY_MS8 = 864e5;
var PLAYBOOK_HOURS = { min: 9, max: 20 };
var SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00\u2013${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`
};
var PLAYBOOK_BREATH_MS = 7 * DAY_MS8;
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
var SignupSchema = z8.object({
  name: z8.string().trim().min(SIGNUP_NAME_MIN, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX, "That name is too long \u2014 120 characters at most."),
  email: z8.string().trim().toLowerCase().email("Enter a work email address.").max(254),
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
  password: z8.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z8.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z8.string().trim().max(80).optional()
}).strict();
var PendingWorkspaceSchema = z8.object({
  name: z8.string().trim().min(SIGNUP_NAME_MIN).max(SIGNUP_NAME_MAX),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z8.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone(v) ? v : null)
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
var JUDGE_FACT_KEYS = [
  "name",
  "category",
  "city",
  "state",
  "host",
  "rating",
  "reviews",
  "emails",
  "phone_matches_site"
];
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
var AnswerSchema = z9.object({
  places: z9.array(
    z9.object({
      ref: z9.number().int(),
      criteria: z9.array(
        z9.object({ key: z9.string(), answer: z9.enum(["pass", "fail", "unknown"]), facts: z9.array(z9.string()) })
      ),
      email_index: z9.number().int().nullable(),
      reason: z9.string()
    })
  )
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
    const evidence = {
      channel: p.channel,
      message_external_id: p.messageExternalId,
      words: (p.body ?? "").slice(0, 80) || null
    };
    let { error: mErr } = await db.rpc("set_marketing_consent", { ...args, p_evidence: evidence });
    if (mErr && /p_evidence/.test(mErr.message))
      ({ error: mErr } = await db.rpc("set_marketing_consent", args));
    if (mErr) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "marketing_consent_write_failed",
          tenant_id: p.tenantId,
          contact_id: out.contact_id,
          error: mErr.message
        })
      );
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
    const { error } = await db.from("contact_identities").upsert(
      { tenant_id: p.tenantId, contact_id: known.data.id, channel: "email", external_id: p.address },
      { onConflict: "tenant_id,channel,external_id", ignoreDuplicates: true }
    );
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
    if (error && error.code !== "23505")
      throw new Error(`ingest_email: cannot record the person's address: ${error.message}`);
    if (error)
      console.error("ingest_email_address_taken", JSON.stringify({ tenant: p.tenantId, contact: out.contact_id }));
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
  if (error && !/monotone|terminal/.test(error.message))
    throw new Error(`email receipt: cannot move message ${p.messageId}: ${error.message}`);
}
async function suppressEmailOf(db, p) {
  if (!p.addresses.length) return null;
  const sent = await db.from("messages").select("contact_id").eq("id", p.messageId).eq("tenant_id", p.tenantId).maybeSingle();
  if (sent.error)
    throw new Error(`email receipt: cannot read who message ${p.messageId} went to: ${sent.error.message}`);
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
  else if (!data || data.length === 0)
    console.error("link_call_message_noop", JSON.stringify({ tenant: tenantId, call: callId }));
}
async function setCallRecording(db, tenantId, callId, recording) {
  const { data, error } = await db.from("calls").update({ recording }).eq("id", callId).eq("tenant_id", tenantId).select("id");
  if (error) console.error("set_call_recording_failed", error.message);
  else if (!data || data.length === 0)
    console.error("set_call_recording_noop", JSON.stringify({ tenant: tenantId, call: callId }));
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
var IMPORTED_CALL_NOTE = /^\[voice call note /;
var isBackfill = (m) => !!m.meta && typeof m.meta === "object" && m.meta.backfill === true;
var isAcknowledgement = (m) => !!m.meta && typeof m.meta === "object" && m.meta.ack === true;
var effectiveAt = (m) => new Date(m.channel_ts ?? m.created_at).getTime();
function assembleHistory(rows, limit) {
  const kept = rows.filter((m) => {
    const body = (m.body ?? "").trim();
    if (!body) return false;
    if (m.direction === "outbound" && !DELIVERED.includes(String(m.status))) return false;
    if (isBackfill(m) && IMPORTED_CALL_NOTE.test(body)) return false;
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
    pausedUntil: pausedUntilIso ? new Date(pausedUntilIso).getTime() : 0,
    // Imported rows carry the timestamp of the IMPORT, not of a send. Counting
    // them would let a backfill silence the bot for a day against a cap it
    // never actually spent.
    replies: (replies.data ?? []).filter((r) => !isBackfill(r) && !isAcknowledgement(r)).map((r) => new Date(r.created_at).getTime())
  };
}
function sellsByOf(embedded) {
  const t = Array.isArray(embedded) ? embedded[0] : embedded;
  const v = t && typeof t === "object" ? t.sells_by : null;
  return typeof v === "string" ? v : null;
}
var noSellsBy = (message) => /\bsells_by\b/.test(message) && /does not exist|could not find/i.test(message);
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
  const withAnswer = await db.from("contacts").select("id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, tenants(sells_by)").eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
  let contact = withAnswer.data ? { ...withAnswer.data, sellsBy: sellsByOf(withAnswer.data.tenants) } : null;
  let cErr = withAnswer.error;
  if (cErr && noSellsBy(cErr.message)) {
    const older = await db.from("contacts").select("id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url").eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
    contact = older.data ? { ...older.data, sellsBy: null } : null;
    cErr = older.error;
  }
  if (cErr) throw new Error(`readLeadContext/contact: ${cErr.message}`);
  if (!contact) return EMPTY_LEAD;
  const dealsOn = dealsAreOn(contact.sellsBy);
  const { data: conv, error: vErr } = await db.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", contact.id).maybeSingle();
  if (vErr) throw new Error(`readLeadContext/conversation: ${vErr.message}`);
  let history = [];
  if (conv) {
    const { data: rows, error: hErr } = await db.from("messages").select(HISTORY_COLUMNS).eq("tenant_id", tenantId).eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(historyLimit * 3);
    if (hErr) throw new Error(`readLeadContext/history: ${hErr.message}`);
    history = assembleHistory(rows ?? [], historyLimit);
  }
  const { data: dealRows } = dealsOn ? await db.from("deals").select("stage, service, proposed_at, decided_at, ended_at, created_at, proposal_url").eq("tenant_id", tenantId).eq("contact_id", contact.id).order("created_at", { ascending: false }) : { data: [] };
  const current = pickCurrentDeal(dealRows ?? []);
  const { data: noteRows, error: nErr } = await db.from("person_notes").select("body, created_at").eq("tenant_id", tenantId).eq("contact_id", contact.id).eq("state", "kept").eq("team_only", false).order("created_at", { ascending: false }).limit(NOTES_READ);
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
    notes: contact.notes ?? null,
    noteList: nErr ? null : (noteRows ?? []).map((n) => ({ body: n.body, at: n.created_at })),
    proposalUrl: dealsOn ? proposalLinkOf(current, contact.proposal_url) : null,
    deal: current ? {
      stage: current.stage,
      service: current.service,
      proposed_at: current.proposed_at,
      decided_at: current.decided_at,
      ended_at: current.ended_at
    } : null
  };
}
async function readDealForPhone(db, tenantId, phoneE164) {
  const { data: c } = await db.from("contacts").select("id, tenants(sells_by)").eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
  if (!c || !dealsAreOn(sellsByOf(c.tenants))) return null;
  const { data } = await db.from("deals").select("stage, service, proposed_at, decided_at, ended_at, created_at").eq("tenant_id", tenantId).eq("contact_id", c.id).order("created_at", { ascending: false });
  const d = pickCurrentDeal(data ?? []);
  return d ? { stage: d.stage, service: d.service, proposed_at: d.proposed_at, decided_at: d.decided_at, ended_at: d.ended_at } : null;
}
var NOTES_READ = 12;
var NOTES_BUDGET = 1200;
function notesForReceptionist(lead, now = /* @__PURE__ */ new Date(), tz = "UTC") {
  if (Array.isArray(lead.noteList)) {
    const parts = [];
    let used = 0;
    for (const n of lead.noteList) {
      const body = n.body.replace(/\s+/g, " ").trim();
      if (!body) continue;
      const t = Date.parse(n.at);
      const part = Number.isFinite(t) ? `(${clockDate(t, tz, now.getTime())}) ${body}` : body;
      if (parts.length && used + part.length > NOTES_BUDGET) break;
      parts.push(part);
      used += part.length + 2;
    }
    return parts.length ? `Notes from the team about them, newest first (use as facts, never read aloud or quoted): ${parts.join("; ")}` : null;
  }
  const notes = (lead.notes ?? "").replace(/\s+/g, " ").trim();
  return notes ? `Notes from the owner about them (use as facts, never read aloud or quoted): ${notes}` : null;
}
function describeLead(lead, now = /* @__PURE__ */ new Date(), tz = "UTC") {
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
  const notes = notesForReceptionist(lead, now, tz);
  if (notes) bits.push(notes);
  const deal = dealSentence(lead.deal ?? null, now.getTime(), tz, { hasLink: !!(lead.proposalUrl ?? "").trim() });
  if (deal) bits.push(deal);
  const proposal = (lead.proposalUrl ?? "").trim();
  if (proposal)
    bits.push(
      `The owner has a proposal ready for them at ${proposal}. If they ask about price, a quote or the proposal, send that link and state none of its figures; on a call, never read the address out \u2014 say it is being sent to them in writing.`
    );
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

// src/repositories/people.ts
var PEOPLE_PAGE = 1e3;
async function peoplePage(db, tenantId, page = {}) {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? PEOPLE_PAGE;
  const { data, error } = await db.rpc("people_list", {
    p_tenant_id: tenantId,
    ...page.q ? { p_query: page.q } : {},
    ...offset > 0 ? { p_offset: offset } : {},
    ...limit !== PEOPLE_PAGE ? { p_limit: limit } : {}
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data ?? [];
}
async function everyoneIn(db, tenantId) {
  const all = [];
  for (let offset = 0; ; offset += PEOPLE_PAGE) {
    const page = await peoplePage(db, tenantId, { offset });
    all.push(...page);
    if (page.length < PEOPLE_PAGE) return all;
  }
}

// src/paged.ts
var MAX_ROWS = 1e3;
var DEFAULT_ROW_CAP = 2e4;
async function readAllRows(what, page, cap = DEFAULT_ROW_CAP, onCapped = (w, c) => console.error("paged_read_capped", JSON.stringify({ what: w, cap: c }))) {
  const out = [];
  while (out.length < cap) {
    const size = Math.min(MAX_ROWS, cap - out.length);
    const { data, error } = await page(out.length, out.length + size - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
  onCapped(what, cap);
  return out;
}

// src/repositories/lists.ts
var noRuleColumn = (message) => /\brule\b/.test(message) && /does not exist|could not find/i.test(message);
async function listRows(db, tenantId) {
  const read = (columns) => readAllRows(
    "segments",
    (from, to) => (
      // The columns are chosen at run time, past the client's typed parser: the rows are the columns named.
      db.from("segments").select(columns).eq("tenant_id", tenantId).order("name").order("id").range(from, to)
    )
  );
  try {
    return (await read("id, name, rule")).map((l) => ({ id: l.id, name: l.name, rule: l.rule ?? null }));
  } catch (e) {
    if (!(e instanceof Error) || !noRuleColumn(e.message)) throw e;
    return (await read("id, name")).map((l) => ({ id: l.id, name: l.name, rule: null }));
  }
}
async function savedListsFor(db, tenantId) {
  const [lists, members] = await Promise.all([
    listRows(db, tenantId),
    readAllRows(
      "segment_members",
      (from, to) => db.from("segment_members").select("segment_id, contact_id").eq("tenant_id", tenantId).order("segment_id").order("contact_id").range(from, to)
    )
  ]);
  const byList = /* @__PURE__ */ new Map();
  for (const m of members) {
    const ids = byList.get(m.segment_id) ?? [];
    ids.push(m.contact_id);
    byList.set(m.segment_id, ids);
  }
  return lists.map((l) => ({ id: l.id, name: l.name, ids: byList.get(l.id) ?? [], rule: l.rule ?? null }));
}
async function listMemberIds(db, listId) {
  const rows = await readAllRows(
    "segment_members",
    (from, to) => db.from("segment_members").select("contact_id").eq("segment_id", listId).order("contact_id").range(from, to)
  );
  return rows.map((m) => m.contact_id);
}
async function savedListFor(db, tenantId, id) {
  const read = (columns) => db.from("segments").select(columns).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  let { data, error } = await read("id, name, rule");
  if (error && noRuleColumn(error.message))
    ({ data, error } = await read("id, name"));
  if (error) throw new Error(`segments: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    ids: data.rule == null ? await listMemberIds(db, data.id) : [],
    rule: data.rule ?? null
  };
}
async function listRow(db, id) {
  const read = (columns) => db.from("segments").select(columns).eq("id", id).maybeSingle();
  let { data, error } = await read("id, tenant_id, name, rule");
  if (error && noRuleColumn(error.message))
    ({ data, error } = await read("id, tenant_id, name"));
  if (error) throw new Error(`segments: ${error.message}`);
  return data ? { id: data.id, tenant_id: data.tenant_id, name: data.name, rule: data.rule ?? null } : null;
}
async function createList(db, tenantId, name, userId, rule = null) {
  const { data, error } = await db.from("segments").insert({ tenant_id: tenantId, name, created_by: userId, ...rule ? { rule } : {} }).select("id, name").single();
  return error ? { list: null, error } : { list: { id: data.id, name: data.name }, error: null };
}
async function renameList(db, id, name) {
  const { error } = await db.from("segments").update({ name }).eq("id", id);
  return { error };
}
async function setListRule(db, id, rule) {
  const { error } = await db.from("segments").update({ rule }).eq("id", id);
  return { error };
}
async function addToList(db, list, contactIds, userId) {
  const rows = contactIds.map((contact_id) => ({
    segment_id: list.id,
    contact_id,
    tenant_id: list.tenant_id,
    added_by: userId
  }));
  const { error } = await db.from("segment_members").upsert(rows, { onConflict: "segment_id,contact_id", ignoreDuplicates: true });
  return { error };
}
async function dropFromList(db, listId, contactIds) {
  const { error } = await db.from("segment_members").delete().eq("segment_id", listId).in("contact_id", [...contactIds]);
  return { error };
}
async function deleteList(db, id) {
  const { error, count } = await db.from("segments").delete({ count: "exact" }).eq("id", id);
  return { error, count };
}

// src/repositories/touches.ts
var RUN_IDS_PER_QUERY = 200;
async function touchesSince(db, tenantId, since) {
  const runs = (await readAllRows(
    "broadcasts",
    (from, to) => db.from("broadcasts").select("id, playbook_id, state, scheduled_for, created_at").eq("tenant_id", tenantId).gte("created_at", since.toISOString()).order("id").range(from, to)
  )).filter((b) => b.state !== "canceled" && b.state !== "failed");
  const ofRun = new Map(runs.map((b) => [b.id, b]));
  const ids = runs.map((b) => b.id);
  const out = [];
  const sinceMs = since.getTime();
  for (let i = 0; i < ids.length; i += RUN_IDS_PER_QUERY) {
    const rows = await readAllRows(
      "broadcast_recipients",
      (from, to) => db.from("broadcast_recipients").select("broadcast_id, contact_id, sent_at").eq("tenant_id", tenantId).in("broadcast_id", ids.slice(i, i + RUN_IDS_PER_QUERY)).in("state", ["sent", "queued"]).order("broadcast_id").order("contact_id").range(from, to)
    );
    for (const r of rows) {
      const run = ofRun.get(r.broadcast_id);
      if (!run) continue;
      const at = r.sent_at ?? run.scheduled_for ?? run.created_at;
      if (Date.parse(at) < sinceMs) continue;
      out.push({ contact_id: r.contact_id, playbook_id: run.playbook_id, at });
    }
  }
  return out;
}
function touchIndex(touches) {
  const byThis = /* @__PURE__ */ new Map();
  const byAny = /* @__PURE__ */ new Map();
  for (const t of touches) {
    const at = Date.parse(t.at);
    if (t.playbook_id) {
      const m = byThis.get(t.playbook_id) ?? /* @__PURE__ */ new Map();
      m.set(t.contact_id, Math.max(m.get(t.contact_id) ?? 0, at));
      byThis.set(t.playbook_id, m);
    }
    byAny.set(t.contact_id, Math.max(byAny.get(t.contact_id) ?? 0, at));
  }
  return { byThis, byAny };
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
  { table: "lead_search_members", event: "*" },
  // a deal recorded or moved by a teammate, or by a payment: People (and its Pipeline) repaints (00156, 0008)
  { table: "deals", event: "*" },
  // a note written, a step set or done by a teammate: People's next steps and a person's page repaint (00157, 00166)
  { table: "person_notes", event: "*" }
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
        (payload) => onInsert(
          payload.new ?? payload.old ?? {},
          w.table,
          payload.eventType
        )
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
  DEFAULT_ROW_CAP,
  HISTORY_COLUMNS,
  MAX_ROWS,
  PEOPLE_PAGE,
  addToList,
  assembleHistory,
  claimCallNotification,
  claimControl,
  countSentToday,
  createList,
  createServiceClient,
  deleteList,
  describeLead,
  dropFromList,
  emitEvent,
  everyoneIn,
  getTenantConfig,
  ingestCall,
  ingestInbound,
  ingestInboundEmail,
  lastInboundEmail,
  linkCallMessage,
  listMemberIds,
  listPolicies,
  listRow,
  mailboxById,
  mailboxFor,
  mailboxOfTenant,
  markProcessed,
  notesForReceptionist,
  pauseConversation,
  peoplePage,
  personReplyMode,
  putTenantConfig,
  readAllRows,
  readDealForPhone,
  readLeadContext,
  readThreadState,
  recordCallNote,
  recordEchoAndPause,
  recordEmailStatus,
  recordOutbound,
  recordStatusByExternalId,
  releaseControl,
  renameList,
  resolveChannel,
  resolveChannelDetailed,
  resolveOutboundTarget,
  savedListFor,
  savedListsFor,
  sentEmailWithMessageId,
  setCallRecording,
  setListRule,
  setPersonReplyMode,
  setPolicyMode,
  stampEmailSent,
  stampMailboxReceived,
  subscribeMessagesInserts,
  suppressEmailOf,
  templatesFor,
  touchIndex,
  touchesSince
};
