// src/schedule.ts
async function scheduleJob(db, p) {
  const { data, error } = await db.from("jobs").insert({ tenant_id: p.tenantId, kind: p.kind, due_at: p.dueAt.toISOString(), payload: p.payload }).select("id").single();
  if (error || !data) throw new Error(`schedule_job: ${error?.message ?? "no row"}`);
  return { jobId: data.id };
}
async function cancelJobsFor(db, tenantId, kind, payloadKey, payloadValue) {
  if (!/^[a-z][a-z0-9_]*$/.test(payloadKey)) throw new Error(`cancel_jobs_for: ${payloadKey} is not a payload key`);
  const { data, error } = await db.from("jobs").update({ state: "canceled" }).eq("tenant_id", tenantId).eq("kind", kind).eq("state", "scheduled").eq(`payload->>${payloadKey}`, payloadValue).select("id");
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "cancel_jobs_failed", tenant_id: tenantId, kind, error: error.message }));
    return 0;
  }
  return data?.length ?? 0;
}

// ../contracts/dist/index.js
import { z as z5 } from "zod";
import { z } from "zod";
import { z as z2 } from "zod";
import { z as z3 } from "zod";
import { z as z4 } from "zod";
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
  /** A person renamed or annotated at the desk (00054). */
  "contact.named",
  "contact.noted",
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
var BrainOutputSchema = z.object({
  reply: z.string(),
  intent: z.enum(BRAIN_INTENTS).catch("other"),
  escalate: z.boolean().catch(false),
  reason: z.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z.array(z.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: z.enum(BRAIN_LANGUAGES).catch("other")
});
var WA_WINDOW_MS = 24 * 3600 * 1e3;
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
var INSTRUCTIONS_MAX = 2e4;
var BusinessProfileSchema = z2.object({
  address: z2.string().max(300).optional(),
  hours: z2.partialRecord(z2.enum(DAYS), HoursSchema).optional(),
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
   *
   * It holds what the prompt it grew out of holds (INSTRUCTIONS_MAX), because
   * the form carries that prompt into it.
   */
  extra_instructions: z2.string().max(INSTRUCTIONS_MAX).optional()
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
  system_prompt: z2.string().min(40).max(INSTRUCTIONS_MAX),
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
  if (cfg.calendar && !feedUrlOk(cfg.calendar.ical_url)) {
    ctx.addIssue({ code: z2.ZodIssueCode.custom, path: ["calendar", "ical_url"], message: feedProblemWords("address") ?? "Not an address the receptionist may read." });
  }
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
var ASK_UNDO_MS = 10 * 6e4;
var AskProposalOutcomeSchema = z3.object({
  state: z3.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z3.string().max(300).catch(""),
  atMs: z3.number().catch(0),
  undo: z3.record(z3.string(), z3.unknown()).nullable().optional()
});
var AskSettingsChangeSchema = z3.discriminatedUnion("op", [
  z3.object({ op: z3.literal("add_closure"), date: z3.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z3.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z3.string().max(200).optional() }),
  z3.object({ op: z3.literal("set_hours"), day: z3.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z3.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z3.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z3.object({ op: z3.literal("add_note"), title: z3.string().min(1).max(80), text: z3.string().min(1).max(1200) }),
  z3.object({ op: z3.literal("add_service"), name: z3.string().min(1).max(80), duration_min: z3.number().int().min(1).max(1440).optional() })
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
var SignupSchema = z4.object({
  name: z4.string().trim().min(SIGNUP_NAME_MIN, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX, "That name is too long \u2014 120 characters at most."),
  email: z4.string().trim().toLowerCase().email("Enter a work email address.").max(254),
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
  password: z4.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z4.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z4.string().trim().max(80).optional()
}).strict();
var PendingWorkspaceSchema = z4.object({
  name: z4.string().trim().min(SIGNUP_NAME_MIN).max(SIGNUP_NAME_MAX),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z4.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone(v) ? v : null)
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
z5.config({ jitless: true });

// ../core/dist/index.js
import { z as z52 } from "zod";
import { z as z6 } from "zod";
import { z as z22 } from "zod";
import { z as z32 } from "zod";
import { z as z42 } from "zod";
import { z as z522 } from "zod";
import { z as z62 } from "zod";
import { z as z222 } from "zod";
import { z as z322 } from "zod";
import { z as z422 } from "zod";
import { z as z53 } from "zod";
import { z as z7 } from "zod";
import { z as z23 } from "zod";
import { z as z33 } from "zod";
import { z as z43 } from "zod";
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
  /** A person renamed or annotated at the desk (00054). */
  "contact.named",
  "contact.noted",
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
var DAY_MS2 = 864e5;
var WEEK_MS4 = 7 * DAY_MS2;
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
var BrainOutputSchema2 = z6.object({
  reply: z6.string(),
  intent: z6.enum(BRAIN_INTENTS2).catch("other"),
  escalate: z6.boolean().catch(false),
  reason: z6.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z6.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z6.array(z6.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: z6.enum(BRAIN_LANGUAGES2).catch("other")
});
var WA_WINDOW_MS2 = 24 * 3600 * 1e3;
var CALL_HEARTBEAT_MS2 = 10 * 60 * 1e3;
var CALL_OUTCOMES = ["answered", "booking_link_sent", "callback_needed", "voicemail", "no_request", "other"];
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
var PolicyLimitsSchema2 = z22.object({
  max_replies_day: z22.number().int().min(1).max(200).optional(),
  pause_hours: z22.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: z22.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: z22.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: z22.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME2 = z22.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema2 = z22.object({ open: TIME2, close: TIME2 });
var HoursSchema2 = z22.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME2.nullable().optional(),
  close: TIME2.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: z22.array(IntervalSchema2).optional()
}).strict();
var DATE2 = z22.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema2 = z22.object({
  date: DATE2,
  until: DATE2.optional(),
  note: z22.string().max(200).optional()
});
var DAYS2 = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema2 = z22.object({
  name: z22.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: z22.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: z22.string().max(120).optional()
}).strict();
var GuardrailsSchema2 = z22.object({
  never_quote_prices: z22.boolean().optional(),
  never_confirm_booking: z22.boolean().optional(),
  disclose_ai: z22.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: z22.boolean().optional()
}).strict();
var NoteSchema2 = z22.object({
  title: z22.string().min(1).max(80),
  text: z22.string().min(1).max(1200)
}).strict();
var BookingRulesSchema2 = z22.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: z22.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: z22.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: z22.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: z22.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: z22.array(z22.string().min(1).max(80)).max(20).optional(),
  party_max: z22.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: z22.array(z22.string().min(1).max(200)).max(10).optional()
}).strict();
var E1642 = /^\+[1-9]\d{6,14}$/;
var INSTRUCTIONS_MAX2 = 2e4;
var BusinessProfileSchema2 = z22.object({
  address: z22.string().max(300).optional(),
  hours: z22.partialRecord(z22.enum(DAYS2), HoursSchema2).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: z22.array(ClosureSchema2).optional(),
  services: z22.array(ServiceSchema2).max(60).optional(),
  languages: z22.array(z22.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema2.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: z22.array(z22.string().min(1).max(200)).max(20).optional(),
  tone: z22.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: z22.string().regex(E1642, "E.164, like +16469325775").optional(),
  website: z22.string().url().max(500).optional(),
  notes: z22.array(NoteSchema2).max(10).optional(),
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
  extra_instructions: z22.string().max(INSTRUCTIONS_MAX2).optional()
}).strict();
var BrainConfigSchema2 = z22.object({
  business_name: z22.string().min(1).max(120),
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
  phone_display: z22.string().min(3).max(40).optional(),
  booking_link: z22.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: z22.string().min(40).max(INSTRUCTIONS_MAX2),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema2.optional(),
  fallbacks: z22.object({
    /** Sent when no model key is configured. */
    greeting: z22.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: z22.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: z22.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema2 = z22.object({
  escalation_emails: z22.array(z22.string().email()).min(1).max(10),
  from: z22.string().max(200).optional()
}).strict();
var CalendarConfigSchema2 = z22.object({
  ical_url: z22.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema2 = z22.object({ vision: z22.boolean().optional() }).strict();
var TenantConfigSchema2 = z22.object({
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
      code: z22.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z22.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY2) {
    ctx.addIssue({
      code: z22.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY2} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z22.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z22.ZodIssueCode.custom,
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
      code: z22.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate2(c.until)) {
    ctx.addIssue({
      code: z22.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z22.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema2 = TenantConfigSchema2.superRefine((cfg, ctx) => {
  if (cfg.calendar && !feedUrlOk2(cfg.calendar.ical_url)) {
    ctx.addIssue({ code: z22.ZodIssueCode.custom, path: ["calendar", "ical_url"], message: feedProblemWords2("address") ?? "Not an address the receptionist may read." });
  }
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay2(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES2) {
    ctx.addIssue({
      code: z22.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES2} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure2(c, n, ctx));
});
var SHORT2 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var LIVE_STALE_MS2 = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS2 = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS2 = 10 * 60 * 1e3;
var PERSON_MODE_LABELS2 = { auto: "Answer", ask: "Ask me first", never: "Never" };
var PERSON_MODE_WORDS2 = { ...PERSON_MODE_LABELS2, inherit: "Follow the workspace" };
var DAY_MS32 = 864e5;
var WEEK_MS22 = 7 * DAY_MS32;
var MONTH_MS2 = 30 * DAY_MS32;
var NEW_WINDOW_MS2 = 7 * DAY_MS32;
var QUIET_AFTER_MS3 = 30 * DAY_MS32;
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
var AskFinishSchema2 = z32.object({
  answer: z32.string().catch("").transform((s) => clip2(1500)(cleanAnswer2(s))),
  citations: z32.array(
    z32.object({
      kind: z32.enum(ASK_CITATION_KINDS2).catch("page"),
      id: z32.string().catch("").transform(clip2(200)),
      label: z32.string().catch("").transform(clip2(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS2.citations)),
  followups: z32.array(z32.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS2.followups).map((s) => s.slice(0, 90))),
  navigate: z32.object({ to: z32.string().catch(""), label: z32.string().catch(""), now: z32.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: z32.enum(ASK_LANGUAGES2).catch("other")
});
var ASK_UNDO_MS2 = 10 * 6e4;
var AskProposalOutcomeSchema2 = z32.object({
  state: z32.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z32.string().max(300).catch(""),
  atMs: z32.number().catch(0),
  undo: z32.record(z32.string(), z32.unknown()).nullable().optional()
});
var AskSettingsChangeSchema2 = z32.discriminatedUnion("op", [
  z32.object({ op: z32.literal("add_closure"), date: z32.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z32.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z32.string().max(200).optional() }),
  z32.object({ op: z32.literal("set_hours"), day: z32.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z32.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z32.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z32.object({ op: z32.literal("add_note"), title: z32.string().min(1).max(80), text: z32.string().min(1).max(1200) }),
  z32.object({ op: z32.literal("add_service"), name: z32.string().min(1).max(80), duration_min: z32.number().int().min(1).max(1440).optional() })
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
var REPLY_WINDOW_HOURS2 = 72;
var REPLY_WINDOW_MS2 = REPLY_WINDOW_HOURS2 * 36e5;
var REPLY_WINDOW_WORDS2 = `within ${REPLY_WINDOW_HOURS2 / 24} days`;
var LIMIT_TIERS2 = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
var DAY_MS52 = 864e5;
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
var PLAYBOOK_CLASS_LABEL2 = {
  reengage: POLICY_CLASS_WORDS2.reengage.short,
  campaign: POLICY_CLASS_WORDS2.campaign.short,
  booking: POLICY_CLASS_WORDS2.booking.short
};
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
var SignupSchema2 = z42.object({
  name: z42.string().trim().min(SIGNUP_NAME_MIN2, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX2, "That name is too long \u2014 120 characters at most."),
  email: z42.string().trim().toLowerCase().email("Enter a work email address.").max(254),
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
  password: z42.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z42.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z42.string().trim().max(80).optional()
}).strict();
var PendingWorkspaceSchema2 = z42.object({
  name: z42.string().trim().min(SIGNUP_NAME_MIN2).max(SIGNUP_NAME_MAX2),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z42.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone2(v) ? v : null)
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
z52.config({ jitless: true });
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
var FRESH_SLACK_MS = 2 * 864e5;
var STATE_TTL_MS = 10 * 6e4;
var enc2 = new TextEncoder();
var dec = new TextDecoder();
var EVENT_KINDS22 = [
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
  /** A person renamed or annotated at the desk (00054). */
  "contact.named",
  "contact.noted",
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
var OFFERS_OPT_IN_PHRASES22 = { en: "YES OFFERS", es: "SI OFERTAS" };
var DECISION_VERBS22 = [
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
var DAY_MS22 = 864e5;
var WEEK_MS42 = 7 * DAY_MS22;
var BRAIN_INTENTS22 = ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
var BRAIN_LANGUAGES22 = ["en", "es", "other"];
var BRAIN_OUTPUT_JSON_SCHEMA22 = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here."
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS22],
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
      enum: [...BRAIN_LANGUAGES22],
      description: "The language the reply is written in."
    }
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false
};
var BrainOutputSchema22 = z62.object({
  reply: z62.string(),
  intent: z62.enum(BRAIN_INTENTS22).catch("other"),
  escalate: z62.boolean().catch(false),
  reason: z62.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z62.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z62.array(z62.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: z62.enum(BRAIN_LANGUAGES22).catch("other")
});
var WA_WINDOW_MS22 = 24 * 3600 * 1e3;
var CALL_HEARTBEAT_MS22 = 10 * 60 * 1e3;
var RETENTION_DAYS22 = {
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
var RECORDING_RETENTION_DAYS22 = RETENTION_DAYS22.call_recordings;
var RECORDING_PURGED_WORDS22 = `Recording removed after ${RECORDING_RETENTION_DAYS22} days; the transcript is kept`;
var PRIVATE_HOST22 = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;
function feedUrlOk22(raw) {
  if (!raw) return null;
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (PRIVATE_HOST22.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return null;
  return u.toString();
}
function feedProblemWords22(reason, status) {
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
var POLICY_CLASS_WORDS22 = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: { name: "Service & pricing questions", short: "Questions", note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone" },
  booking: { name: "Book \xB7 reschedule", short: "Bookings", note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone" },
  reengage: { name: "Re-engage quiet customers", short: "Re-engage", note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  campaign: { name: "Standing offers", short: "Offers", note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  reviews: { name: "Google reviews", short: "Reviews", note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you" },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" }
};
var PolicyLimitsSchema22 = z222.object({
  max_replies_day: z222.number().int().min(1).max(200).optional(),
  pause_hours: z222.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: z222.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: z222.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: z222.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME22 = z222.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema22 = z222.object({ open: TIME22, close: TIME22 });
var HoursSchema22 = z222.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME22.nullable().optional(),
  close: TIME22.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: z222.array(IntervalSchema22).optional()
}).strict();
var DATE22 = z222.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema22 = z222.object({
  date: DATE22,
  until: DATE22.optional(),
  note: z222.string().max(200).optional()
});
var DAYS22 = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema22 = z222.object({
  name: z222.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: z222.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: z222.string().max(120).optional()
}).strict();
var GuardrailsSchema22 = z222.object({
  never_quote_prices: z222.boolean().optional(),
  never_confirm_booking: z222.boolean().optional(),
  disclose_ai: z222.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: z222.boolean().optional()
}).strict();
var NoteSchema22 = z222.object({
  title: z222.string().min(1).max(80),
  text: z222.string().min(1).max(1200)
}).strict();
var BookingRulesSchema22 = z222.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: z222.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: z222.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: z222.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: z222.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: z222.array(z222.string().min(1).max(80)).max(20).optional(),
  party_max: z222.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: z222.array(z222.string().min(1).max(200)).max(10).optional()
}).strict();
var E16422 = /^\+[1-9]\d{6,14}$/;
var INSTRUCTIONS_MAX22 = 2e4;
var BusinessProfileSchema22 = z222.object({
  address: z222.string().max(300).optional(),
  hours: z222.partialRecord(z222.enum(DAYS22), HoursSchema22).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: z222.array(ClosureSchema22).optional(),
  services: z222.array(ServiceSchema22).max(60).optional(),
  languages: z222.array(z222.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema22.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: z222.array(z222.string().min(1).max(200)).max(20).optional(),
  tone: z222.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: z222.string().regex(E16422, "E.164, like +16469325775").optional(),
  website: z222.string().url().max(500).optional(),
  notes: z222.array(NoteSchema22).max(10).optional(),
  booking_rules: BookingRulesSchema22.optional(),
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
  extra_instructions: z222.string().max(INSTRUCTIONS_MAX22).optional()
}).strict();
var BrainConfigSchema22 = z222.object({
  business_name: z222.string().min(1).max(120),
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
  phone_display: z222.string().min(3).max(40).optional(),
  booking_link: z222.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: z222.string().min(40).max(INSTRUCTIONS_MAX22),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema22.optional(),
  fallbacks: z222.object({
    /** Sent when no model key is configured. */
    greeting: z222.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: z222.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: z222.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema22 = z222.object({
  escalation_emails: z222.array(z222.string().email()).min(1).max(10),
  from: z222.string().max(200).optional()
}).strict();
var CalendarConfigSchema22 = z222.object({
  ical_url: z222.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema22 = z222.object({ vision: z222.boolean().optional() }).strict();
var TenantConfigSchema22 = z222.object({
  brain: BrainConfigSchema22.optional(),
  notifications: NotificationsConfigSchema22.optional(),
  calendar: CalendarConfigSchema22.optional(),
  features: FeaturesConfigSchema22.optional()
});
var MAX_INTERVALS_PER_DAY22 = 4;
var MAX_CLOSURES22 = 60;
function isRealDate22(key) {
  const at2 = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at2.getTime()) && at2.toISOString().slice(0, 10) === key;
}
var DAY_NAME22 = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function checkDay22(h, day, ctx) {
  const name = DAY_NAME22[day] ?? day;
  const at2 = (...rest) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: z222.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z222.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY22) {
    ctx.addIssue({
      code: z222.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY22} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z222.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z222.ZodIssueCode.custom,
        path: at2("intervals", n, "open"),
        message: `${name}: two shifts overlap.`
      });
    }
  }
}
function checkClosure22(c, n, ctx) {
  const at2 = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate22(c.date)) {
    ctx.addIssue({
      code: z222.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate22(c.until)) {
    ctx.addIssue({
      code: z222.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z222.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema22 = TenantConfigSchema22.superRefine((cfg, ctx) => {
  if (cfg.calendar && !feedUrlOk22(cfg.calendar.ical_url)) {
    ctx.addIssue({ code: z222.ZodIssueCode.custom, path: ["calendar", "ical_url"], message: feedProblemWords22("address") ?? "Not an address the receptionist may read." });
  }
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay22(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES22) {
    ctx.addIssue({
      code: z222.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES22} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure22(c, n, ctx));
});
var SHORT22 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var LIVE_STALE_MS22 = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS22 = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS22 = 10 * 60 * 1e3;
var PERSON_MODE_LABELS22 = { auto: "Answer", ask: "Ask me first", never: "Never" };
var PERSON_MODE_WORDS22 = { ...PERSON_MODE_LABELS22, inherit: "Follow the workspace" };
var DAY_MS322 = 864e5;
var WEEK_MS222 = 7 * DAY_MS322;
var MONTH_MS22 = 30 * DAY_MS322;
var NEW_WINDOW_MS22 = 7 * DAY_MS322;
var QUIET_AFTER_MS32 = 30 * DAY_MS322;
var DAY_MS422 = 24 * 3600 * 1e3;
var ASK_CAPS22 = {
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
var ASK_CITATION_KINDS22 = ["thread", "conversation", "call", "person", "page"];
var ASK_LANGUAGES22 = ["en", "es", "other"];
var ASK_FINISH_JSON_SCHEMA22 = {
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
          kind: { type: "string", enum: [...ASK_CITATION_KINDS22] },
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
    language: { type: "string", enum: [...ASK_LANGUAGES22] }
  },
  required: ["answer", "citations", "followups", "navigate", "language"],
  additionalProperties: false
};
var clip22 = (n) => (s) => s.trim().slice(0, n);
var TAG_CUT22 = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
function cleanAnswer22(raw) {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT22);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}
var AskFinishSchema22 = z322.object({
  answer: z322.string().catch("").transform((s) => clip22(1500)(cleanAnswer22(s))),
  citations: z322.array(
    z322.object({
      kind: z322.enum(ASK_CITATION_KINDS22).catch("page"),
      id: z322.string().catch("").transform(clip22(200)),
      label: z322.string().catch("").transform(clip22(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS22.citations)),
  followups: z322.array(z322.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS22.followups).map((s) => s.slice(0, 90))),
  navigate: z322.object({ to: z322.string().catch(""), label: z322.string().catch(""), now: z322.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: z322.enum(ASK_LANGUAGES22).catch("other")
});
var ASK_UNDO_MS22 = 10 * 6e4;
var AskProposalOutcomeSchema22 = z322.object({
  state: z322.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z322.string().max(300).catch(""),
  atMs: z322.number().catch(0),
  undo: z322.record(z322.string(), z322.unknown()).nullable().optional()
});
var AskSettingsChangeSchema22 = z322.discriminatedUnion("op", [
  z322.object({ op: z322.literal("add_closure"), date: z322.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z322.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z322.string().max(200).optional() }),
  z322.object({ op: z322.literal("set_hours"), day: z322.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z322.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z322.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z322.object({ op: z322.literal("add_note"), title: z322.string().min(1).max(80), text: z322.string().min(1).max(1200) }),
  z322.object({ op: z322.literal("add_service"), name: z322.string().min(1).max(80), duration_min: z322.number().int().min(1).max(1440).optional() })
]);
var FIRST22 = { kind: "first_name", label: "First name", example: "Dani" };
var BUSINESS22 = { kind: "business_name", label: "Business name", example: "Luna Studio" };
var LINK22 = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
var FIRST_ES22 = { ...FIRST22, label: "Nombre" };
var BUSINESS_ES22 = { ...BUSINESS22, label: "Nombre del negocio" };
var LINK_ES22 = { ...LINK22, label: "Enlace de reservas" };
var WHEN32 = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
var SERVICE22 = { kind: "visit_service", label: "Service", example: "a consultation" };
var WHEN_ES22 = { ...WHEN32, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
var SERVICE_ES22 = { ...SERVICE22, label: "Servicio", example: "una consulta" };
var BROADCAST_CHUNK = 25;
var BROADCAST_GAP_MS = 300;
var REPLY_WINDOW_HOURS22 = 72;
var REPLY_WINDOW_MS22 = REPLY_WINDOW_HOURS22 * 36e5;
var REPLY_WINDOW_WORDS22 = `within ${REPLY_WINDOW_HOURS22 / 24} days`;
function renderTemplate(body, params) {
  return String(body ?? "").replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const v = params[Number(n) - 1];
    return typeof v === "string" && v !== "" ? v : m;
  });
}
var OUTCOME_UNKNOWN = "outcome_unknown";
var LIMIT_TIERS22 = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
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
var DAY_MS522 = 864e5;
var PLAYBOOK_HOURS22 = { min: 9, max: 20 };
var SENDING_HOURS_WORDS22 = {
  min: PLAYBOOK_HOURS22.min,
  max: PLAYBOOK_HOURS22.max,
  first: `${PLAYBOOK_HOURS22.min}:00`,
  range: `${PLAYBOOK_HOURS22.min}:00\u2013${PLAYBOOK_HOURS22.max}:59`,
  between: `between ${PLAYBOOK_HOURS22.min}:00 and ${PLAYBOOK_HOURS22.max}:59`
};
var PLAYBOOK_BREATH_MS22 = 7 * DAY_MS522;
var PLAYBOOK_VETO_DELAY_MS22 = 30 * 6e4;
var PLAYBOOK_CLASS_LABEL22 = {
  reengage: POLICY_CLASS_WORDS22.reengage.short,
  campaign: POLICY_CLASS_WORDS22.campaign.short,
  booking: POLICY_CLASS_WORDS22.booking.short
};
var DATE_FMT52 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WHEN222 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DAY_MS622 = 864e5;
var QUIET_AFTER_MS222 = 7 * DAY_MS622;
var DATE_FMT222 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var FORWARDING_TEST_WINDOW_MS22 = 30 * 6e4;
var REVIEW_AUTO_REPLY_MAX_AGE_MS22 = 14 * 864e5;
var REVIEW_NEWS_MS22 = 36 * 3600 * 1e3;
var REVIEW_NEWS_MAX_AGE_MS22 = 14 * 864e5;
var BOOTSTRAP_MS22 = 3600 * 1e3;
var DATE_FMT322 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS322 = 7 * 864e5;
var DATE_FMT422 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var SOLE_PROP_LIMITS22 = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
var REGISTRATION_COST_WORDS22 = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS22.messagesPerSecond} message a second.`
};
var PROVISIONING_DEADLINE_MS22 = 5 * 6e4;
var SOLE_PROP_CEILING_SENTENCE22 = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS22.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE22 = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE22}`;
var SIGNUP_NAME_MIN22 = 2;
var SIGNUP_NAME_MAX22 = 120;
var SignupSchema22 = z422.object({
  name: z422.string().trim().min(SIGNUP_NAME_MIN22, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX22, "That name is too long \u2014 120 characters at most."),
  email: z422.string().trim().toLowerCase().email("Enter a work email address.").max(254),
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
  password: z422.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z422.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z422.string().trim().max(80).optional()
}).strict();
var PendingWorkspaceSchema22 = z422.object({
  name: z422.string().trim().min(SIGNUP_NAME_MIN22).max(SIGNUP_NAME_MAX22),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z422.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone22(v) ? v : null)
});
function isTimezone22(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}
var CONSENT_PHRASE22 = OFFERS_OPT_IN_PHRASES22.en;
var CONSENT_PHRASE_ES22 = OFFERS_OPT_IN_PHRASES22.es;
var ACTIVITY_KINDS22 = [...DECISION_VERBS22, ...EVENT_KINDS22];
var PASSWORD_MIN22 = 12;
var PASSWORD_WORDS22 = {
  label: "Password",
  chooseLabel: "Choose a password",
  newLabel: "New password",
  hint: `At least ${PASSWORD_MIN22} characters. A long phrase beats a short puzzle.`,
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
z522.config({ jitless: true });
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
  /** A person renamed or annotated at the desk (00054). */
  "contact.named",
  "contact.noted",
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
var BrainOutputSchema3 = z7.object({
  reply: z7.string(),
  intent: z7.enum(BRAIN_INTENTS3).catch("other"),
  escalate: z7.boolean().catch(false),
  reason: z7.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z7.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z7.array(z7.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: z7.enum(BRAIN_LANGUAGES3).catch("other")
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
var PolicyLimitsSchema3 = z23.object({
  max_replies_day: z23.number().int().min(1).max(200).optional(),
  pause_hours: z23.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: z23.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: z23.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: z23.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME3 = z23.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema3 = z23.object({ open: TIME3, close: TIME3 });
var HoursSchema3 = z23.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME3.nullable().optional(),
  close: TIME3.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: z23.array(IntervalSchema3).optional()
}).strict();
var DATE3 = z23.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema3 = z23.object({
  date: DATE3,
  until: DATE3.optional(),
  note: z23.string().max(200).optional()
});
var DAYS3 = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema3 = z23.object({
  name: z23.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: z23.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: z23.string().max(120).optional()
}).strict();
var GuardrailsSchema3 = z23.object({
  never_quote_prices: z23.boolean().optional(),
  never_confirm_booking: z23.boolean().optional(),
  disclose_ai: z23.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: z23.boolean().optional()
}).strict();
var NoteSchema3 = z23.object({
  title: z23.string().min(1).max(80),
  text: z23.string().min(1).max(1200)
}).strict();
var BookingRulesSchema3 = z23.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: z23.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: z23.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: z23.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: z23.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: z23.array(z23.string().min(1).max(80)).max(20).optional(),
  party_max: z23.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: z23.array(z23.string().min(1).max(200)).max(10).optional()
}).strict();
var E1643 = /^\+[1-9]\d{6,14}$/;
var INSTRUCTIONS_MAX3 = 2e4;
var BusinessProfileSchema3 = z23.object({
  address: z23.string().max(300).optional(),
  hours: z23.partialRecord(z23.enum(DAYS3), HoursSchema3).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: z23.array(ClosureSchema3).optional(),
  services: z23.array(ServiceSchema3).max(60).optional(),
  languages: z23.array(z23.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema3.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: z23.array(z23.string().min(1).max(200)).max(20).optional(),
  tone: z23.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: z23.string().regex(E1643, "E.164, like +16469325775").optional(),
  website: z23.string().url().max(500).optional(),
  notes: z23.array(NoteSchema3).max(10).optional(),
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
  extra_instructions: z23.string().max(INSTRUCTIONS_MAX3).optional()
}).strict();
var BrainConfigSchema3 = z23.object({
  business_name: z23.string().min(1).max(120),
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
  phone_display: z23.string().min(3).max(40).optional(),
  booking_link: z23.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: z23.string().min(40).max(INSTRUCTIONS_MAX3),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema3.optional(),
  fallbacks: z23.object({
    /** Sent when no model key is configured. */
    greeting: z23.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: z23.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: z23.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema3 = z23.object({
  escalation_emails: z23.array(z23.string().email()).min(1).max(10),
  from: z23.string().max(200).optional()
}).strict();
var CalendarConfigSchema3 = z23.object({
  ical_url: z23.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema3 = z23.object({ vision: z23.boolean().optional() }).strict();
var TenantConfigSchema3 = z23.object({
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
      code: z23.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z23.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY3) {
    ctx.addIssue({
      code: z23.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY3} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z23.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z23.ZodIssueCode.custom,
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
      code: z23.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate3(c.until)) {
    ctx.addIssue({
      code: z23.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z23.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema3 = TenantConfigSchema3.superRefine((cfg, ctx) => {
  if (cfg.calendar && !feedUrlOk3(cfg.calendar.ical_url)) {
    ctx.addIssue({ code: z23.ZodIssueCode.custom, path: ["calendar", "ical_url"], message: feedProblemWords3("address") ?? "Not an address the receptionist may read." });
  }
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay3(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES3) {
    ctx.addIssue({
      code: z23.ZodIssueCode.custom,
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
var AskFinishSchema3 = z33.object({
  answer: z33.string().catch("").transform((s) => clip3(1500)(cleanAnswer3(s))),
  citations: z33.array(
    z33.object({
      kind: z33.enum(ASK_CITATION_KINDS3).catch("page"),
      id: z33.string().catch("").transform(clip3(200)),
      label: z33.string().catch("").transform(clip3(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS3.citations)),
  followups: z33.array(z33.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS3.followups).map((s) => s.slice(0, 90))),
  navigate: z33.object({ to: z33.string().catch(""), label: z33.string().catch(""), now: z33.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: z33.enum(ASK_LANGUAGES3).catch("other")
});
var ASK_UNDO_MS3 = 10 * 6e4;
var AskProposalOutcomeSchema3 = z33.object({
  state: z33.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z33.string().max(300).catch(""),
  atMs: z33.number().catch(0),
  undo: z33.record(z33.string(), z33.unknown()).nullable().optional()
});
var AskSettingsChangeSchema3 = z33.discriminatedUnion("op", [
  z33.object({ op: z33.literal("add_closure"), date: z33.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z33.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z33.string().max(200).optional() }),
  z33.object({ op: z33.literal("set_hours"), day: z33.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z33.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z33.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z33.object({ op: z33.literal("add_note"), title: z33.string().min(1).max(80), text: z33.string().min(1).max(1200) }),
  z33.object({ op: z33.literal("add_service"), name: z33.string().min(1).max(80), duration_min: z33.number().int().min(1).max(1440).optional() })
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
var SignupSchema3 = z43.object({
  name: z43.string().trim().min(SIGNUP_NAME_MIN3, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX3, "That name is too long \u2014 120 characters at most."),
  email: z43.string().trim().toLowerCase().email("Enter a work email address.").max(254),
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
  password: z43.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z43.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z43.string().trim().max(80).optional()
}).strict();
var PendingWorkspaceSchema3 = z43.object({
  name: z43.string().trim().min(SIGNUP_NAME_MIN3).max(SIGNUP_NAME_MAX3),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z43.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone3(v) ? v : null)
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
z53.config({ jitless: true });
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
var DAY_MS222 = 24 * 3600 * 1e3;
function kindOf(d) {
  if (d.kind) return d.kind;
  if (d.sender === "human") return d.proactive ? "broadcast" : "reply";
  return d.messageId ? "draft" : "answer";
}
async function wireFacts(db, d) {
  const { data, error } = await db.from("conversations").select("paused_until, assignee_user_id, contacts (consent, dnc, marketing_consent, erased_at, erasing_since), tenants (status)").eq("id", d.conversationId).eq("tenant_id", d.tenantId).maybeSingle();
  if (error) throw new Error(`deliver: cannot read the wire for conversation ${d.conversationId}: ${error.message}`);
  if (!data) throw new Error(`deliver: no conversation ${d.conversationId} in workspace ${d.tenantId}`);
  const row = data;
  return {
    pausedUntil: row.paused_until ?? null,
    assignee: row.assignee_user_id ?? null,
    contact: row.contacts ?? { consent: null, dnc: null, marketing_consent: null, erased_at: null, erasing_since: null },
    tenantStatus: row.tenants?.status ?? null
  };
}
function refusalFor(d, f, nowMs) {
  if (f.contact.erased_at || f.contact.erasing_since) return "erased";
  if (d.channel === "sms" && d.purpose === "marketing") return "sms_carries_no_promotions";
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
  const sent = send === void 0 ? { ok: false, wamid: null, status: 0, errorBody: "no_sender_for_channel", reason: "no_sender_for_channel" } : send === null ? { ok: false, wamid: null, status: 503, errorBody: "no_credentials", reason: "no_credentials" } : await send(d.to, { body: d.body, template: d.template });
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
var MAX_SNOOZE_MS = 30 * 24 * 3600 * 1e3;
var SEND_GRACE_MS = 15 * 1e3;
var IDEMPOTENCY_WINDOW_MS = 30 * 1e3;
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
async function provisionLine(ports, cmd) {
  const lineId = typeof cmd.payload.line_id === "string" ? cmd.payload.line_id : "";
  const by = cmd.payload.by === "sweep" || cmd.payload.by === "support" ? cmd.payload.by : "owner";
  if (!lineId) throw new Error("line_provision: payload.line_id is required");
  if (!ports.provision) throw new Error("line_provision: this runtime holds no line provider");
  const r = await ports.provision(lineId, by);
  if (!r.ok) throw new Error(`line_provision: stopped at ${r.step ?? "?"}: ${r.error ?? "unknown"}`);
}
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

// ../db/dist/index.js
import { z as z54 } from "zod";
import { z as z8 } from "zod";
import { z as z24 } from "zod";
import { z as z34 } from "zod";
import { z as z44 } from "zod";
function normalizePhone(raw) {
  if (raw == null) return null;
  const digits2 = String(raw).replace(/[^\d]/g, "");
  if (!digits2) return null;
  if (digits2.length === 10) return `+1${digits2}`;
  if (digits2.length >= 8 && digits2.length <= 15) return `+${digits2}`;
  return null;
}
var EVENT_KINDS4 = [
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
  /** A person renamed or annotated at the desk (00054). */
  "contact.named",
  "contact.noted",
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
var OFFERS_OPT_IN_PHRASES4 = { en: "YES OFFERS", es: "SI OFERTAS" };
var DECISION_VERBS4 = [
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
var DAY_MS8 = 864e5;
var WEEK_MS6 = 7 * DAY_MS8;
var BRAIN_INTENTS4 = ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
var BRAIN_LANGUAGES4 = ["en", "es", "other"];
var BRAIN_OUTPUT_JSON_SCHEMA4 = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here."
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS4],
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
      enum: [...BRAIN_LANGUAGES4],
      description: "The language the reply is written in."
    }
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false
};
var BrainOutputSchema4 = z8.object({
  reply: z8.string(),
  intent: z8.enum(BRAIN_INTENTS4).catch("other"),
  escalate: z8.boolean().catch(false),
  reason: z8.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z8.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z8.array(z8.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: z8.enum(BRAIN_LANGUAGES4).catch("other")
});
var WA_WINDOW_MS4 = 24 * 3600 * 1e3;
var CALL_HEARTBEAT_MS4 = 10 * 60 * 1e3;
var RETENTION_DAYS4 = {
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
var RECORDING_RETENTION_DAYS4 = RETENTION_DAYS4.call_recordings;
var RECORDING_PURGED_WORDS4 = `Recording removed after ${RECORDING_RETENTION_DAYS4} days; the transcript is kept`;
var PRIVATE_HOST4 = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;
function feedUrlOk4(raw) {
  if (!raw) return null;
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (PRIVATE_HOST4.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return null;
  return u.toString();
}
function feedProblemWords4(reason, status) {
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
var POLICY_CLASS_WORDS4 = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: { name: "Service & pricing questions", short: "Questions", note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone" },
  booking: { name: "Book \xB7 reschedule", short: "Bookings", note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone" },
  reengage: { name: "Re-engage quiet customers", short: "Re-engage", note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  campaign: { name: "Standing offers", short: "Offers", note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  reviews: { name: "Google reviews", short: "Reviews", note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you" },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" }
};
var PolicyLimitsSchema4 = z24.object({
  max_replies_day: z24.number().int().min(1).max(200).optional(),
  pause_hours: z24.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: z24.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: z24.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: z24.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME4 = z24.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema4 = z24.object({ open: TIME4, close: TIME4 });
var HoursSchema4 = z24.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME4.nullable().optional(),
  close: TIME4.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: z24.array(IntervalSchema4).optional()
}).strict();
var DATE4 = z24.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema4 = z24.object({
  date: DATE4,
  until: DATE4.optional(),
  note: z24.string().max(200).optional()
});
var DAYS4 = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema4 = z24.object({
  name: z24.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: z24.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: z24.string().max(120).optional()
}).strict();
var GuardrailsSchema4 = z24.object({
  never_quote_prices: z24.boolean().optional(),
  never_confirm_booking: z24.boolean().optional(),
  disclose_ai: z24.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: z24.boolean().optional()
}).strict();
var NoteSchema4 = z24.object({
  title: z24.string().min(1).max(80),
  text: z24.string().min(1).max(1200)
}).strict();
var BookingRulesSchema4 = z24.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: z24.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: z24.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: z24.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: z24.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: z24.array(z24.string().min(1).max(80)).max(20).optional(),
  party_max: z24.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: z24.array(z24.string().min(1).max(200)).max(10).optional()
}).strict();
var E1644 = /^\+[1-9]\d{6,14}$/;
var INSTRUCTIONS_MAX4 = 2e4;
var BusinessProfileSchema4 = z24.object({
  address: z24.string().max(300).optional(),
  hours: z24.partialRecord(z24.enum(DAYS4), HoursSchema4).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: z24.array(ClosureSchema4).optional(),
  services: z24.array(ServiceSchema4).max(60).optional(),
  languages: z24.array(z24.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema4.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: z24.array(z24.string().min(1).max(200)).max(20).optional(),
  tone: z24.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: z24.string().regex(E1644, "E.164, like +16469325775").optional(),
  website: z24.string().url().max(500).optional(),
  notes: z24.array(NoteSchema4).max(10).optional(),
  booking_rules: BookingRulesSchema4.optional(),
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
  extra_instructions: z24.string().max(INSTRUCTIONS_MAX4).optional()
}).strict();
var BrainConfigSchema4 = z24.object({
  business_name: z24.string().min(1).max(120),
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
  phone_display: z24.string().min(3).max(40).optional(),
  booking_link: z24.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: z24.string().min(40).max(INSTRUCTIONS_MAX4),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema4.optional(),
  fallbacks: z24.object({
    /** Sent when no model key is configured. */
    greeting: z24.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: z24.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: z24.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema4 = z24.object({
  escalation_emails: z24.array(z24.string().email()).min(1).max(10),
  from: z24.string().max(200).optional()
}).strict();
var CalendarConfigSchema4 = z24.object({
  ical_url: z24.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema4 = z24.object({ vision: z24.boolean().optional() }).strict();
var TenantConfigSchema4 = z24.object({
  brain: BrainConfigSchema4.optional(),
  notifications: NotificationsConfigSchema4.optional(),
  calendar: CalendarConfigSchema4.optional(),
  features: FeaturesConfigSchema4.optional()
});
var MAX_INTERVALS_PER_DAY4 = 4;
var MAX_CLOSURES4 = 60;
function isRealDate4(key) {
  const at2 = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at2.getTime()) && at2.toISOString().slice(0, 10) === key;
}
var DAY_NAME4 = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function checkDay4(h, day, ctx) {
  const name = DAY_NAME4[day] ?? day;
  const at2 = (...rest) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: z24.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z24.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY4) {
    ctx.addIssue({
      code: z24.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY4} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z24.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z24.ZodIssueCode.custom,
        path: at2("intervals", n, "open"),
        message: `${name}: two shifts overlap.`
      });
    }
  }
}
function checkClosure4(c, n, ctx) {
  const at2 = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate4(c.date)) {
    ctx.addIssue({
      code: z24.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate4(c.until)) {
    ctx.addIssue({
      code: z24.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z24.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema4 = TenantConfigSchema4.superRefine((cfg, ctx) => {
  if (cfg.calendar && !feedUrlOk4(cfg.calendar.ical_url)) {
    ctx.addIssue({ code: z24.ZodIssueCode.custom, path: ["calendar", "ical_url"], message: feedProblemWords4("address") ?? "Not an address the receptionist may read." });
  }
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay4(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES4) {
    ctx.addIssue({
      code: z24.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES4} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure4(c, n, ctx));
});
var SHORT4 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var LIVE_STALE_MS4 = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS4 = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS4 = 10 * 60 * 1e3;
var PERSON_MODE_LABELS4 = { auto: "Answer", ask: "Ask me first", never: "Never" };
var PERSON_MODE_WORDS4 = { ...PERSON_MODE_LABELS4, inherit: "Follow the workspace" };
var DAY_MS34 = 864e5;
var WEEK_MS24 = 7 * DAY_MS34;
var MONTH_MS4 = 30 * DAY_MS34;
var NEW_WINDOW_MS4 = 7 * DAY_MS34;
var QUIET_AFTER_MS5 = 30 * DAY_MS34;
var DAY_MS44 = 24 * 3600 * 1e3;
var ASK_CAPS4 = {
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
var ASK_CITATION_KINDS4 = ["thread", "conversation", "call", "person", "page"];
var ASK_LANGUAGES4 = ["en", "es", "other"];
var ASK_FINISH_JSON_SCHEMA4 = {
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
          kind: { type: "string", enum: [...ASK_CITATION_KINDS4] },
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
    language: { type: "string", enum: [...ASK_LANGUAGES4] }
  },
  required: ["answer", "citations", "followups", "navigate", "language"],
  additionalProperties: false
};
var clip4 = (n) => (s) => s.trim().slice(0, n);
var TAG_CUT4 = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
function cleanAnswer4(raw) {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT4);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}
var AskFinishSchema4 = z34.object({
  answer: z34.string().catch("").transform((s) => clip4(1500)(cleanAnswer4(s))),
  citations: z34.array(
    z34.object({
      kind: z34.enum(ASK_CITATION_KINDS4).catch("page"),
      id: z34.string().catch("").transform(clip4(200)),
      label: z34.string().catch("").transform(clip4(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS4.citations)),
  followups: z34.array(z34.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS4.followups).map((s) => s.slice(0, 90))),
  navigate: z34.object({ to: z34.string().catch(""), label: z34.string().catch(""), now: z34.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: z34.enum(ASK_LANGUAGES4).catch("other")
});
var ASK_UNDO_MS4 = 10 * 6e4;
var AskProposalOutcomeSchema4 = z34.object({
  state: z34.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z34.string().max(300).catch(""),
  atMs: z34.number().catch(0),
  undo: z34.record(z34.string(), z34.unknown()).nullable().optional()
});
var AskSettingsChangeSchema4 = z34.discriminatedUnion("op", [
  z34.object({ op: z34.literal("add_closure"), date: z34.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z34.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z34.string().max(200).optional() }),
  z34.object({ op: z34.literal("set_hours"), day: z34.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z34.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z34.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z34.object({ op: z34.literal("add_note"), title: z34.string().min(1).max(80), text: z34.string().min(1).max(1200) }),
  z34.object({ op: z34.literal("add_service"), name: z34.string().min(1).max(80), duration_min: z34.number().int().min(1).max(1440).optional() })
]);
var FIRST4 = { kind: "first_name", label: "First name", example: "Dani" };
var BUSINESS4 = { kind: "business_name", label: "Business name", example: "Luna Studio" };
var LINK4 = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
var FIRST_ES4 = { ...FIRST4, label: "Nombre" };
var BUSINESS_ES4 = { ...BUSINESS4, label: "Nombre del negocio" };
var LINK_ES4 = { ...LINK4, label: "Enlace de reservas" };
var WHEN5 = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
var SERVICE4 = { kind: "visit_service", label: "Service", example: "a consultation" };
var WHEN_ES4 = { ...WHEN5, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
var SERVICE_ES4 = { ...SERVICE4, label: "Servicio", example: "una consulta" };
var REPLY_WINDOW_HOURS4 = 72;
var REPLY_WINDOW_MS4 = REPLY_WINDOW_HOURS4 * 36e5;
var REPLY_WINDOW_WORDS4 = `within ${REPLY_WINDOW_HOURS4 / 24} days`;
var LIMIT_TIERS4 = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
var DAY_MS54 = 864e5;
var PLAYBOOK_HOURS4 = { min: 9, max: 20 };
var SENDING_HOURS_WORDS4 = {
  min: PLAYBOOK_HOURS4.min,
  max: PLAYBOOK_HOURS4.max,
  first: `${PLAYBOOK_HOURS4.min}:00`,
  range: `${PLAYBOOK_HOURS4.min}:00\u2013${PLAYBOOK_HOURS4.max}:59`,
  between: `between ${PLAYBOOK_HOURS4.min}:00 and ${PLAYBOOK_HOURS4.max}:59`
};
var PLAYBOOK_BREATH_MS4 = 7 * DAY_MS54;
var PLAYBOOK_VETO_DELAY_MS4 = 30 * 6e4;
var PLAYBOOK_CLASS_LABEL4 = {
  reengage: POLICY_CLASS_WORDS4.reengage.short,
  campaign: POLICY_CLASS_WORDS4.campaign.short,
  booking: POLICY_CLASS_WORDS4.booking.short
};
var DATE_FMT7 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WHEN24 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DAY_MS64 = 864e5;
var QUIET_AFTER_MS24 = 7 * DAY_MS64;
var DATE_FMT24 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var FORWARDING_TEST_WINDOW_MS4 = 30 * 6e4;
var REVIEW_AUTO_REPLY_MAX_AGE_MS4 = 14 * 864e5;
var REVIEW_NEWS_MS4 = 36 * 3600 * 1e3;
var REVIEW_NEWS_MAX_AGE_MS4 = 14 * 864e5;
var BOOTSTRAP_MS4 = 3600 * 1e3;
var DATE_FMT34 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS34 = 7 * 864e5;
var DATE_FMT44 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var SOLE_PROP_LIMITS4 = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
var REGISTRATION_COST_WORDS4 = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS4.messagesPerSecond} message a second.`
};
var PROVISIONING_DEADLINE_MS4 = 5 * 6e4;
var SOLE_PROP_CEILING_SENTENCE4 = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS4.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE4 = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE4}`;
var SIGNUP_NAME_MIN4 = 2;
var SIGNUP_NAME_MAX4 = 120;
var SignupSchema4 = z44.object({
  name: z44.string().trim().min(SIGNUP_NAME_MIN4, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX4, "That name is too long \u2014 120 characters at most."),
  email: z44.string().trim().toLowerCase().email("Enter a work email address.").max(254),
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
  password: z44.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z44.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: z44.string().trim().max(80).optional()
}).strict();
var PendingWorkspaceSchema4 = z44.object({
  name: z44.string().trim().min(SIGNUP_NAME_MIN4).max(SIGNUP_NAME_MAX4),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z44.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone4(v) ? v : null)
});
function isTimezone4(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}
var CONSENT_PHRASE4 = OFFERS_OPT_IN_PHRASES4.en;
var CONSENT_PHRASE_ES4 = OFFERS_OPT_IN_PHRASES4.es;
var ACTIVITY_KINDS4 = [...DECISION_VERBS4, ...EVENT_KINDS4];
var PASSWORD_MIN4 = 12;
var PASSWORD_WORDS4 = {
  label: "Password",
  chooseLabel: "Choose a password",
  newLabel: "New password",
  hint: `At least ${PASSWORD_MIN4} characters. A long phrase beats a short puzzle.`,
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
z54.config({ jitless: true });
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
var POS_TTL_MS2 = 5 * 60 * 1e3;
var NEG_TTL_MS2 = 60 * 1e3;
var DAY_MS23 = 24 * 3600 * 1e3;

// src/escalate.ts
async function upsertEscalation(db, tenantId, conversationId, reason, details) {
  const { error } = await db.from("escalations").insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    reason,
    details
  });
  if (!error) return "opened";
  if (error.code === "23505") {
    const { error: refreshErr } = await db.from("escalations").update({ details, reason }).eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("state", "open");
    if (refreshErr) {
      console.error("escalation_refresh_failed", refreshErr.message);
      return "failed";
    }
    return "refreshed";
  }
  console.error("escalation_upsert_failed", error.message);
  return "failed";
}

// src/handlers.ts
function must(what, r) {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}
async function countRecipients(db, tenantId, broadcastId, state) {
  let q = db.from("broadcast_recipients").select("contact_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("broadcast_id", broadcastId);
  if (state) q = q.eq("state", state);
  const { count, error } = await q;
  if (error) throw new Error(`broadcast_send: cannot count ${state ?? "all"} recipients: ${error.message}`);
  return count ?? 0;
}
async function outboundSend(ctx, job) {
  await sendQueued(
    {
      // maybeSingle() reports an absent row as `data: null` without an error,
      // so a read that failed and a message that is gone stay separable; the
      // verb turns the error into the job's loud failure.
      queued: async (id) => {
        const { data, error } = await ctx.db.from("messages").select("id, status, body, template_name, channel, sender").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      },
      purposeOf: (template) => templatePurpose(ctx.db, job.tenant_id, template),
      deliver: (d) => deliver({ db: ctx.db, wire: ctx.wire }, d),
      escalate: (conversationId, reason, details) => upsertEscalation(ctx.db, job.tenant_id, conversationId, reason, details),
      alert: ctx.alert,
      ...ctx.page ? { page: ctx.page } : {}
    },
    { tenantId: job.tenant_id, payload: job.payload }
  );
}
async function blobThreadErase(ctx, job) {
  await eraseBlobThread(
    {
      eraseThread: ctx.eraseThread,
      // A scrub that failed silently is the worst of both: the ledger row above
      // says the erasure is done while the payload still holds the digits we
      // were asked to erase, in a table whose rows are never deleted. It throws,
      // so the job fails and the unscrubbed payload — the only handle that can
      // retry this leg — is tried again.
      scrub: async (tenantId, by, scrubbed) => {
        const q = ctx.db.from("jobs").update({ payload: scrubbed });
        must("blob_thread_erase: the erased number is still on the job", "contactId" in by ? await q.eq("tenant_id", tenantId).eq("kind", "blob_thread_erase").eq("payload->>contact_id", by.contactId) : await q.eq("id", by.jobId));
      },
      // actor_type 'system' with a null actor_user_id is what decisions_check
      // requires; the service role is not subject to RLS here. An erasure whose
      // ledger row was refused is an erasure nobody can prove, so it throws too.
      recordErased: async (tenantId, contactId, threads, jobId) => {
        const [decided, evented] = await Promise.all([
          ctx.db.from("decisions").insert({ tenant_id: tenantId, subject_type: "contact", subject_id: contactId, verb: "erase", actor_type: "system", payload: { leg: "blob", threads, job_id: jobId } }),
          ctx.db.from("events").insert({ tenant_id: tenantId, kind: "contact.blob_erased", category: "contact", subject_type: "contact", subject_id: contactId, data: { threads } })
        ]);
        must("blob_thread_erase: the erasure is not on the decisions ledger", decided);
        must("blob_thread_erase: the erasure is not in the events", evented);
      }
    },
    { tenantId: job.tenant_id, jobId: job.id, payload: job.payload }
  );
}
async function broadcastSend(ctx, job) {
  const p = job.payload;
  const db = ctx.db;
  await sendBroadcastBatch(
    {
      broadcast: async (id) => {
        const { data, error } = await db.from("broadcasts").select("id, state, name, template_name, template_language, params, recipient_count, playbook_id, audience").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle();
        if (error) throw new Error(`broadcast_send: cannot read broadcast ${id}: ${error.message}`);
        return data;
      },
      // The billing gate, so it fails CLOSED: a tenants row that cannot be read
      // is not a workspace that is paying.
      workspacePaused: async () => {
        const row = must("broadcast_send: cannot read the workspace's status", await db.from("tenants").select("status").eq("id", job.tenant_id).maybeSingle());
        return row?.status === "paused";
      },
      fail: async (id, failure) => {
        must("broadcast_send: cannot mark the broadcast failed", await db.from("broadcasts").update({ state: "failed", failure, finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id));
      },
      startSending: async (id) => {
        const rows = must("broadcast_send: cannot start the broadcast", await db.from("broadcasts").update({ state: "sending", started_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id).eq("state", "scheduled").select("id"));
        return !!rows && rows.length > 0;
      },
      // `category` is Meta's verdict on what kind of message this is, and it
      // decides which consent the send needs. A template that cannot be READ is
      // not a template Meta withdrew: null here fails the whole broadcast and
      // emails the owner that WhatsApp rejected it, which would be a lie about
      // their Meta account told over a statement timeout.
      template: async (name, language) => {
        return must(`broadcast_send: cannot read template ${name}`, await db.from("templates").select("meta_status, body_preview, category").eq("tenant_id", job.tenant_id).eq("channel", "whatsapp").eq("name", name).eq("language", language).maybeSingle());
      },
      // An empty business name is not a fallback: it resolves to an empty slot,
      // and the verb marks everyone in the batch permanently "missing_value".
      facts: async () => {
        const [tenantRes, cfgRes] = await Promise.all([
          db.from("tenants").select("name").eq("id", job.tenant_id).maybeSingle(),
          db.from("tenant_config").select("config").eq("tenant_id", job.tenant_id).maybeSingle()
        ]);
        const tenantRow = must("broadcast_send: cannot read the workspace", tenantRes);
        const cfgRow = must("broadcast_send: cannot read the workspace's settings", cfgRes);
        const parsedCfg = parseTenantConfig(cfgRow?.config ?? null);
        const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";
        return { businessName, bookingLink: parsedCfg?.brain?.booking_link ?? null };
      },
      batch: async (id, limit) => {
        const { data, error } = await db.from("broadcast_recipients").select("contact_id, facts").eq("tenant_id", job.tenant_id).eq("broadcast_id", id).eq("state", "queued").limit(limit);
        if (error) throw new Error(`broadcast_send: cannot read recipients: ${error.message}`);
        return data ?? [];
      },
      // The batch's people in one read, not one read per person.
      contacts: async (ids) => {
        const { data, error } = await db.from("contacts").select("id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name").in("id", ids).eq("tenant_id", job.tenant_id);
        if (error) throw new Error(`broadcast_send: cannot read the people: ${error.message}`);
        return new Map((data ?? []).map((c) => [c.id, c]));
      },
      // create: false — a broadcast never opens a contact. touch: false — the
      // door below still has to refuse some of these people, and a thread they
      // were not messaged in has nothing new in it.
      target: (phoneE164) => resolveOutboundTarget(db, { tenantId: job.tenant_id, phoneE164, create: false, touch: false }),
      // The messages a dying run left these people: written by deliver after the
      // wire accepted them, with this broadcast's id in their meta, read once for
      // the batch. It is the one check standing between a resumed run and a
      // second WhatsApp template to the same person, so a read that FAILED must
      // never come back as "no, they have not been messaged".
      alreadySent: async (id, contactIds) => {
        const rows = must("broadcast_send: cannot check what the batch was already sent", await db.from("messages").select("id, contact_id, created_at").eq("tenant_id", job.tenant_id).in("contact_id", contactIds).filter("meta->>broadcast_id", "eq", id).in("status", ["sent", "delivered", "read"]));
        const prior = /* @__PURE__ */ new Map();
        for (const m of rows ?? []) if (m.contact_id && !prior.has(m.contact_id)) prior.set(m.contact_id, { id: m.id, sentAt: m.created_at });
        return prior;
      },
      // `sent_at` comes from the patch when the caller knows it — a resumed run
      // reading the message a dying run left knows when it actually went out,
      // and stamping "now" instead would reorder the broadcast's own page.
      mark: async (id, contactId, patch) => {
        const sentAt = patch.sent_at ?? (patch.state === "sent" ? (/* @__PURE__ */ new Date()).toISOString() : null);
        must("broadcast_send: cannot record how this person's send went", await db.from("broadcast_recipients").update({ ...patch, sent_at: sentAt }).eq("tenant_id", job.tenant_id).eq("broadcast_id", id).eq("contact_id", contactId));
      },
      deliver: (d) => deliver({ db, wire: ctx.wire }, d),
      remaining: (id) => countRecipients(db, job.tenant_id, id, "queued"),
      // Read by the verb as "is this broadcast still wanted"; null is how a
      // cancel reads, so a failed read here would abandon a half-sent broadcast
      // with nothing scheduled, nothing failed and nobody told.
      state: async (id) => {
        const row = must("broadcast_send: cannot read whether the broadcast is still wanted", await db.from("broadcasts").select("state").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle());
        return row?.state ?? null;
      },
      scheduleNext: async (id, dueAt) => {
        await ctx.schedule("broadcast_send", dueAt ?? /* @__PURE__ */ new Date(), { broadcast_id: id });
      },
      // This tally is written to the permanent record and read out to the owner,
      // so it is counted rather than tallied from a page of rows.
      tally: async (id) => {
        const [all, sent] = await Promise.all([
          countRecipients(db, job.tenant_id, id),
          countRecipients(db, job.tenant_id, id, "sent")
        ]);
        return { sent, held: all - sent };
      },
      finish: async (id, tally) => {
        must("broadcast_send: cannot close the broadcast", await db.from("broadcasts").update({ state: "sent", finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).eq("tenant_id", job.tenant_id).eq("state", "sending"));
        must("broadcast_send: cannot record the broadcast's tally", await db.from("events").insert({ tenant_id: job.tenant_id, kind: "broadcast.sent", category: "message", subject_type: "broadcast", subject_id: id, data: tally }));
      },
      alert: ctx.alert,
      now: Date.now,
      sleep: (ms) => new Promise((res) => setTimeout(res, ms))
    },
    { tenantId: job.tenant_id, broadcastId: p.broadcast_id, deadline: ctx.deadline }
  );
}
async function lineProvision(ctx, job) {
  await provisionLine({ ...ctx.provisionLine ? { provision: ctx.provisionLine } : {} }, { payload: job.payload });
}
var HANDLERS = {
  outbound_send: outboundSend,
  broadcast_send: broadcastSend,
  blob_thread_erase: blobThreadErase,
  line_provision: lineProvision
};
async function dispatchJob(ctx, job) {
  const handler = HANDLERS[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}

// src/ledger.ts
var LEASE_SECONDS = 90;
var CLAIM_FOR_MS = 2e4;
var YIELD_AT_MS = 45e3;
var MAX_ATTEMPTS = 3;
var MAX_RESUMES = 5;
var SPEAKS_TO_A_PERSON = /* @__PURE__ */ new Set(["outbound_send", "broadcast_send"]);
var RUN_INTERRUPTED = "the run did not finish; its outcome is unknown";
function verdictFor(job) {
  if (job.attempts <= 1) return "run";
  if (SPEAKS_TO_A_PERSON.has(job.kind)) return "give_up";
  return job.attempts > MAX_ATTEMPTS ? "give_up" : "run";
}
async function claimNext(db, leaseSeconds) {
  const { data, error } = await db.rpc("claim_due_jobs", { p_limit: 1, p_lease_seconds: leaseSeconds });
  if (error) throw new Error(`claim_due_jobs: ${error.message}`);
  const rows = data ?? [];
  return rows[0] ?? null;
}
async function completeJob(db, job) {
  const { data, error } = await db.from("jobs").update({ state: "done", lease_until: null }).eq("id", job.id).eq("state", "fired").eq("attempts", job.attempts).select("id");
  if (error) throw new Error(`complete_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
async function failJob(db, job, reason) {
  const { data, error } = await db.from("jobs").update({ state: "failed", last_error: reason.slice(0, 500), lease_until: null }).eq("id", job.id).eq("state", "fired").eq("attempts", job.attempts).select("id");
  if (error) throw new Error(`fail_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// src/settle.ts
var NEVER_SENT = "the job that would have sent this never ran";
var MAY_HAVE_SENT = "the run that was sending this did not finish";
function idFrom(payload, key) {
  if (typeof payload !== "object" || payload === null) return null;
  const v = payload[key];
  return typeof v === "string" ? v : null;
}
function resumesOf(payload) {
  if (typeof payload !== "object" || payload === null) return 0;
  const v = payload.resumes;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
async function howFar(db, tenantId, broadcastId) {
  const of = (state) => db.from("broadcast_recipients").select("contact_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("broadcast_id", broadcastId).eq("state", state);
  const [sent, queued] = await Promise.all([of("sent"), of("queued")]);
  const error = sent.error?.message ?? queued.error?.message;
  return { reached: sent.count ?? 0, remaining: queued.count ?? 0, ...error ? { error } : {} };
}
async function failBroadcast(db, job, broadcastId, why, far) {
  const { data, error } = await db.from("broadcasts").update({ state: "failed", failure: "run_interrupted", finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", broadcastId).eq("tenant_id", job.tenant_id).in("state", ["scheduled", "sending"]).select("id");
  if (error) return [{ what: "broadcast", changed: false, ...far, error: `${why}; then ${error.message}` }];
  if (!data?.length) return [{ what: "broadcast", changed: false, ...far }];
  return [{ what: "broadcast", changed: true, notResumed: why, ...far }];
}
async function settleJob(db, job, certain) {
  const reason = certain ? "never_delivered" : "run_interrupted";
  if (job.kind === "outbound_send") {
    const messageId = idFrom(job.payload, "message_id");
    if (!messageId) return [{ what: "message", changed: false, error: "no message_id on the job" }];
    const { data, error } = await db.from("messages").update({ status: "failed", error: { reason, note: certain ? NEVER_SENT : MAY_HAVE_SENT } }).eq("id", messageId).eq("tenant_id", job.tenant_id).eq("status", "queued").select("id, conversation_id, sender");
    const row = data?.[0] ?? null;
    const flagged = !error && row?.conversation_id ? await upsertEscalation(db, job.tenant_id, row.conversation_id, "send_failed", `${row.sender === "ai" ? "The receptionist's reply" : "A reply"} never left: ${certain ? NEVER_SENT : MAY_HAVE_SENT}.`) : null;
    return [{ what: "message", changed: !!data?.length, ...flagged ? { flagged } : {}, ...error ? { error: error.message } : {} }];
  }
  if (job.kind === "broadcast_send") {
    const broadcastId = idFrom(job.payload, "broadcast_id");
    if (!broadcastId) return [{ what: "broadcast", changed: false, error: "no broadcast_id on the job" }];
    const { data: row, error: readErr } = await db.from("broadcasts").select("id, state").eq("id", broadcastId).eq("tenant_id", job.tenant_id).maybeSingle();
    if (readErr) return [{ what: "broadcast", changed: false, error: readErr.message }];
    if (!row || row.state !== "sending" && row.state !== "scheduled") return [{ what: "broadcast", changed: false }];
    const far = await howFar(db, job.tenant_id, broadcastId);
    if (far.error) return [{ what: "broadcast", changed: false, error: far.error }];
    const { reached, remaining } = far;
    const live = await db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", job.tenant_id).eq("kind", "broadcast_send").eq("payload->>broadcast_id", broadcastId).in("state", ["scheduled", "fired"]).neq("id", job.id);
    if (live.error) return [{ what: "broadcast", changed: false, reached, remaining, error: live.error.message }];
    if ((live.count ?? 0) > 0) return [{ what: "broadcast", changed: false, resumed: true, reached, remaining }];
    const resumes = resumesOf(job.payload);
    if (resumes >= MAX_RESUMES) return failBroadcast(db, job, broadcastId, `${resumes} fresh runs in a row did not finish`, { reached, remaining });
    try {
      await scheduleJob(db, { tenantId: job.tenant_id, kind: "broadcast_send", dueAt: /* @__PURE__ */ new Date(), payload: { broadcast_id: broadcastId, resumes: resumes + 1 } });
      return [{ what: "broadcast", changed: true, resumed: true, reached, remaining }];
    } catch (e) {
      return failBroadcast(db, job, broadcastId, e instanceof Error ? e.message : String(e), { reached, remaining });
    }
  }
  return [];
}
function saySettled(results) {
  const lines = [];
  for (const r of results) {
    if (r.error) {
      lines.push(r.what === "message" ? `The message it was sending could not be updated (${r.error}), so it may still show as sending.` : `The broadcast could not be updated (${r.error}), so it may still show as sending.`);
    } else if (r.resumed) {
      lines.push(`The broadcast carries on in a fresh run: ${r.reached ?? 0} reached so far, ${r.remaining ?? 0} still to go. Anyone it already recorded as sent is skipped, not sent again.`);
    } else if (r.changed && r.notResumed) {
      lines.push(`The broadcast could not be handed to a fresh run (${r.notResumed}), so it has been marked failed; the ${r.reached ?? "people"} it had already reached still got it${typeof r.remaining === "number" ? `, and ${r.remaining} did not` : ""}.`);
    } else if (r.changed) {
      lines.push(r.what === "message" ? "The message has been marked failed, so it is no longer shown as on its way." : `The broadcast has been marked failed; the ${r.reached ?? "people"} it had already reached still got it${typeof r.remaining === "number" ? `, and ${r.remaining} did not` : ""}.`);
    }
  }
  return lines.length ? lines.join(" ") : null;
}

// src/tick.ts
var errText = (e) => e instanceof Error ? e.message : String(e);
async function runTick(ports, opts) {
  const started = ports.now();
  const deadline = started + opts.yieldAtMs;
  const c = { claimed: 0, done: 0, failed: 0, gaveUp: 0 };
  while (ports.now() - started < opts.claimForMs) {
    const job = await ports.claim(opts.leaseSeconds);
    if (!job) break;
    c.claimed += 1;
    if (verdictFor(job) === "give_up") {
      await conclude(
        ports,
        job,
        RUN_INTERRUPTED,
        false,
        `A ${job.kind} job did not finish`,
        `Job ${job.id} (${job.kind}) started and never reported back, so ${RUN_INTERRUPTED}.` + (job.kind === "outbound_send" ? " If this was a reply, it may or may not have reached the customer; check the conversation before sending it again." : "")
      );
      c.gaveUp += 1;
      continue;
    }
    let outcome;
    try {
      outcome = await ports.dispatch(job, deadline);
    } catch (e) {
      const msg = errText(e);
      await conclude(
        ports,
        job,
        msg,
        false,
        `A ${job.kind} job failed`,
        `Job ${job.id} (${job.kind}) failed and will not retry on its own.

${msg}`
      );
      c.failed += 1;
      continue;
    }
    if (outcome === "unknown_kind") {
      await conclude(
        ports,
        job,
        `unknown job kind ${job.kind}`,
        true,
        `A ${job.kind} job could not run`,
        `Job ${job.id} has a kind this runner does not know (${job.kind}), so nothing ran.`
      );
      c.failed += 1;
      continue;
    }
    try {
      if (await ports.complete(job)) c.done += 1;
      else ports.log.warn("job_complete_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
    } catch (e) {
      ports.log.error("job_complete_write_failed", { job_id: job.id, kind: job.kind, error: errText(e) });
    }
  }
  return c;
}
async function conclude(ports, job, reason, certain, subject, lead) {
  let failed;
  try {
    failed = await ports.fail(job, reason);
  } catch (e) {
    ports.log.error("job_fail_write_failed", { job_id: job.id, kind: job.kind, error: errText(e) });
    return;
  }
  if (!failed) {
    ports.log.warn("job_fail_lost_race", { job_id: job.id, kind: job.kind, attempts: job.attempts });
    return;
  }
  let wreckage;
  try {
    const settled = await ports.settle(job, certain);
    for (const s of settled) {
      if (s.error) ports.log.error("job_settle_failed", { job_id: job.id, what: s.what, error: s.error });
      else if (s.notResumed) ports.log.warn("broadcast_not_resumed", { job_id: job.id, tenant_id: job.tenant_id, reason: s.notResumed });
    }
    wreckage = saySettled(settled);
  } catch (e) {
    ports.log.error("job_settle_failed", { job_id: job.id, error: errText(e) });
    wreckage = "What it was in the middle of could not be checked, so a message or broadcast may still show as sending.";
  }
  ports.log.info("job_failed", { job_id: job.id, tenant_id: job.tenant_id, kind: job.kind, attempts: job.attempts, reason });
  try {
    await ports.alert(job, subject, wreckage ? `${lead}

${wreckage}` : lead);
  } catch (e) {
    ports.log.error("job_alert_failed", { job_id: job.id, error: errText(e) });
  }
}
export {
  CLAIM_FOR_MS,
  LEASE_SECONDS,
  MAX_ATTEMPTS,
  MAX_RESUMES,
  RUN_INTERRUPTED,
  SPEAKS_TO_A_PERSON,
  YIELD_AT_MS,
  cancelJobsFor,
  claimNext,
  completeJob,
  dispatchJob,
  failJob,
  runTick,
  saySettled,
  scheduleJob,
  settleJob,
  upsertEscalation,
  verdictFor
};
