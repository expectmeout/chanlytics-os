// src/service-client.ts
import { createClient } from "@supabase/supabase-js";
function createServiceClient(cfg) {
  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// ../contracts/dist/index.js
import { z } from "zod";
import { z as z7 } from "zod";
import { z as z5 } from "zod";
import { z as z2 } from "zod";
import { z as z4 } from "zod";
import { z as z3 } from "zod";
import { z as z6 } from "zod";
import { z as z8 } from "zod";
import { z as z10 } from "zod";
import { z as z9 } from "zod";
import { z as z11 } from "zod";
import { z as z12 } from "zod";
import { z as z13 } from "zod";
import { z as z15 } from "zod";
import { z as z14 } from "zod";
import { z as z16 } from "zod";
import { z as z17 } from "zod";
import { z as z18 } from "zod";
import { z as z19 } from "zod";
import { z as z20 } from "zod";
import { z as z21 } from "zod";
import { z as z22 } from "zod";
import { z as z23 } from "zod";
z.config({ jitless: true });
var MIN_MS = 6e4;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
var DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var LEAD_MAX_PLACES = 1e3;
var LEAD_QUESTION_WAIT_MS = 24 * HOUR_MS;
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
var words = (min, max) => z2.string().transform((s) => stripUnsafe(s).trim()).pipe(z2.string().min(min).max(max));
var LeadSearchPlanSchema = z2.object({
  version: z2.number().int().min(1),
  card: z2.literal("local_businesses"),
  name: words(2, 80),
  asked: words(1, 400),
  terms: z2.array(words(2, 60)).min(1).max(5),
  area: z2.object({
    kind: z2.enum(["zip", "city", "radius"]),
    label: words(2, 80),
    state: z2.string().regex(/^[A-Z]{2}$/),
    center: z2.object({ lat: z2.number().min(-90).max(90), lng: z2.number().min(-180).max(180) }).nullable(),
    radius_m: z2.number().int().min(500).max(2e5),
    zip: z2.string().regex(/^\d{5}$/).optional(),
    query: words(2, 120)
  }),
  count: z2.number().int().min(1).max(LEAD_MAX_PLACES),
  contact: z2.enum(["phone", "email"]),
  criteria: z2.array(
    z2.object({
      key: z2.string().regex(KEY),
      text: words(2, 120),
      standard: z2.enum(["likely", "seen"]),
      required: z2.boolean()
    })
  ).max(8),
  exclusions: z2.array(
    z2.object({
      key: z2.string().regex(KEY),
      text: words(2, 80),
      origin: z2.enum(["claude", "you_said"]),
      category_key: z2.string().regex(KEY).optional()
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
var LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
var LOCAL = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
var SHAPE = new RegExp(`^(${LOCAL})@(${LABEL}(?:\\.${LABEL})+)$`);
function normalizePhone(raw) {
  if (raw == null) return null;
  const digits2 = String(raw).replace(/[^\d]/g, "");
  if (!digits2) return null;
  if (digits2.length === 10) return `+1${digits2}`;
  if (digits2.length >= 8 && digits2.length <= 15) return `+${digits2}`;
  return null;
}
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
}).strip();
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
}).strip();
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
}).strip();
var NoteSchema = z3.object({
  title: z3.string().min(1).max(80),
  text: z3.string().min(1).max(1200)
}).strip();
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
  /**
   * Ask, once, for an email when sending the booking link -- for the confirmation, and for the campaigns that follow
   * (Part 0 of the campaigns-on-every-channel spec). Absent = no.
   */
  ask_email: z3.boolean().optional(),
  /** Anything else about booking, one short line each. */
  notes: z3.array(z3.string().min(1).max(200)).max(10).optional()
}).strip();
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
}).strip();
var BrainConfigSchema = z4.object({
  business_name: z4.string().min(1).max(120),
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
  phone_display: z4.string().min(3).max(40).optional(),
  /**
   * Where a customer books. Optional since the first run's decision 2 (24 Sep 2026): a business that quotes each
   * job has none, and its receptionist takes the customer's details instead (no-booking-link.ts). Who is asked for
   * one is the pages' question, by how customers buy (deals.ts bookingLinkOptional): the config cannot see it.
   */
  booking_link: z4.string().url().max(500).optional(),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: z4.string().min(40).max(INSTRUCTIONS_MAX),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema.optional(),
  fallbacks: z4.object({
    /** Sent when no model key is configured. */
    greeting: z4.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: z4.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: z4.string().min(1).max(2e3)
  }).strip()
}).strip();
var LEAD_MEMBER_CLASSES = ["qualified", "review", "excluded"];
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
var LEAD_STAGE_WORDS = {
  ready: "Ready",
  nurture: "Contacted",
  converted: "Talking",
  archived: "Closed"
};
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
var LEAD_REVIEW_WORD = "Needs review";
var LEAD_LEFT_OUT_WORD = "Left out";
var LEAD_ERASE_WORDS = {
  act: "Erase this lead",
  ask: (name) => `Erase ${name}? Its record and every trace of it go for good.`,
  yes: "Yes, erase",
  no: "No",
  busy: "Erasing\u2026",
  done: (name) => `${name} is erased. It won't be found again.`,
  refused: "Not erased"
};
var LEAD_SENT_QUESTION = "Did you send it?";
var LEAD_CALL_QUESTION = "How did the call go?";
var LEAD_NOTE_PLACEHOLDER = "A note for next time, if you like";
var LEAD_NOTE_MAX = 280;
var LEAD_TALKING_NOTE = "They join People when they write or call in, or when a call goes well.";
function leadNoteLeft(left, max) {
  return left >= max ? `Up to ${max} characters` : `${left} left`;
}
var LEAD_UNCLAIMED_NOTE = "Listing not claimed by the owner";
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
var LeadOneQuerySchema = z5.object({ search: z5.string().uuid().optional() });
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
var PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;
var CARRIER_NAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
var PRIVATE_V6 = /^\[(::1?|f[cd][0-9a-f]{0,2}:.*|fe[89ab][0-9a-f]?:.*|::ffff:.*)\]$/i;
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
  const h = u.hostname;
  if (PRIVATE_HOST.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || CARRIER_NAT.test(h) || PRIVATE_V6.test(h))
    return null;
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
var isJsonObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function keysLeftOut(raw, kept, at2 = []) {
  if (Array.isArray(raw) && Array.isArray(kept)) {
    return raw.flatMap((v, i) => i < kept.length ? keysLeftOut(v, kept[i], [...at2, i]) : []);
  }
  if (!isJsonObject(raw) || !isJsonObject(kept)) return [];
  return Object.entries(raw).flatMap(([k, v]) => {
    if (v === void 0) return [];
    return Object.hasOwn(kept, k) ? keysLeftOut(v, kept[k], [...at2, k]) : [[...at2, k]];
  });
}
function refuseUnknownFields(read, raw, ctx) {
  const parsed = read.safeParse(raw);
  if (!parsed.success) return;
  const byObject = /* @__PURE__ */ new Map();
  for (const where of keysLeftOut(raw, parsed.data)) {
    if (where.length < 2) continue;
    const path = where.slice(0, -1);
    const id = JSON.stringify(path);
    const held = byObject.get(id) ?? { path, keys: [] };
    held.keys.push(String(where[where.length - 1]));
    byObject.set(id, held);
  }
  for (const { path, keys } of byObject.values()) ctx.addIssue({ code: "unrecognized_keys", keys, path });
}
var NotificationsConfigSchema = z6.object({
  escalation_emails: z6.array(z6.string().email()).min(1).max(10),
  from: z6.string().max(200).optional()
}).strip();
var CalendarConfigSchema = z6.object({
  ical_url: z6.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strip();
var FeaturesConfigSchema = z6.object({ vision: z6.boolean().optional() }).strip();
var TenantConfigSchema = z6.object({
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
var DAY_NAMES = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
var DAY_NAME = DAY_NAMES;
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
      code: z6.ZodIssueCode.custom,
      path: ["brain", "profile", "hours", day, ...p.path],
      message: p.message
    });
  }
}
function checkClosure(c, n, ctx) {
  const at2 = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate(c.date)) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate(c.until)) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var WriteRules = TenantConfigSchema.superRefine((cfg, ctx) => {
  if (cfg.calendar && !feedUrlOk(cfg.calendar.ical_url)) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
      path: ["calendar", "ical_url"],
      message: feedProblemWords("address") ?? "Not an address the receptionist may read."
    });
  }
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES) {
    ctx.addIssue({
      code: z6.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure(c, n, ctx));
});
var TenantConfigWriteSchema = z6.unknown().superRefine((raw, ctx) => refuseUnknownFields(TenantConfigSchema, raw, ctx)).pipe(WriteRules);
var DEAL_STAGES = ["proposed", "won", "lost", "ended"];
function isDealStage(s) {
  return typeof s === "string" && DEAL_STAGES.includes(s);
}
var ASK_UNDO_MS = 10 * 6e4;
var AskProposalOutcomeSchema = z7.object({
  state: z7.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z7.string().max(300).catch(""),
  atMs: z7.number().catch(0),
  undo: z7.record(z7.string(), z7.unknown()).nullable().optional()
});
var ASK_SCOPE_KINDS = ["thread", "conversation", "call", "person", "page", "lead", "search", "run"];
var ASK_SURFACES = [
  "today",
  "inbox",
  "people",
  "leads",
  "conversations",
  "live",
  "reports",
  "settings",
  "pipeline",
  "calendar",
  "campaigns",
  "start",
  "other"
];
var ASK_LANGUAGES = ["en", "es", "other"];
var AskSettingsChangeSchema = z8.discriminatedUnion("op", [
  z8.object({
    op: z8.literal("add_closure"),
    date: z8.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    until: z8.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z8.string().max(200).optional()
  }),
  z8.object({
    op: z8.literal("set_hours"),
    day: z8.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    open: z8.string().regex(/^\d{2}:\d{2}$/).nullable(),
    close: z8.string().regex(/^\d{2}:\d{2}$/).nullable()
  }),
  z8.object({ op: z8.literal("add_note"), title: z8.string().min(1).max(80), text: z8.string().min(1).max(1200) }),
  z8.object({
    op: z8.literal("add_service"),
    name: z8.string().min(1).max(80),
    duration_min: z8.number().int().min(1).max(1440).optional()
  })
]);
var ASK_CITATION_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "page",
  "lead",
  "search",
  "deal",
  "list",
  "broadcast",
  "playbook",
  "template",
  "domain"
];
var ASK_ROW_WORDS = "people, threads, calls, leads, searches, deals, lists, broadcasts, playbooks, templates, domains";
var SWEEP_TICK_MS = 5 * MIN_MS;
var PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", kind: "list", hint: "Nothing heard in 30 days" },
  {
    id: "new_week",
    label: "Welcome",
    list: "new_week",
    cls: "campaign",
    kind: "list",
    hint: "First contact in the last 7 days"
  },
  {
    id: "phoned_only",
    label: "Save our number",
    list: "phoned_only",
    cls: "reengage",
    kind: "list",
    hint: "Only ever phoned, never texted"
  },
  {
    id: "everyone_monthly",
    label: "The month's offer",
    list: null,
    cls: "campaign",
    kind: "cadence",
    hint: "Everyone who said yes, on a cadence"
  },
  {
    id: "visit_tomorrow",
    label: "Visit reminder",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day before an appointment on the calendar"
  },
  {
    id: "visited",
    label: "After the visit",
    list: null,
    cls: "reengage",
    kind: "visit",
    hint: "The day after a visit, when nothing is booked next"
  },
  // People's Lapsed list, by visits rather than silence: the win-back a salon means, which had no playbook of its own
  // (00155). Named for its list, so it is never a second "Win-back" beside the one for the quiet.
  {
    id: "lapsed",
    label: "Lapsed",
    list: "lapsed",
    cls: "reengage",
    kind: "list",
    hint: "No visit in 45 days, and nothing booked"
  },
  // Any list (decision 0009): one of People's (list_key, 00168) or one of the workspace's own (list_id, 00155), kept by
  // hand or by a rule; the card says which. The id stays: playbooks made before any list could be named keep running.
  {
    id: "saved_list",
    label: "On a list",
    list: null,
    cls: "campaign",
    kind: "saved",
    hint: "Everyone on a list: one of People's, or one you keep"
  },
  // A proposal out that has waited past the workspace's pace with nothing back (0006): one nudge per proposal, with
  // its link, under its own class, where deals are on. Conversational: it answers the person's own request.
  {
    id: "proposal_waiting",
    label: "Proposal follow-up",
    list: null,
    cls: "follow_up",
    kind: "deal",
    hint: "A proposal waiting with nothing back"
  },
  // Reach out (Part 3): a chain's first email, over a lead search, and a step days after the one before it. Made by
  // the reach-out sheet (Part 4), never offered among the moments (triggerOffered).
  {
    id: "lead_first",
    label: "Businesses a search found",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "The first email of a reach-out"
  },
  {
    id: "after_step",
    label: "After the step before",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "A nudge, days after the step before"
  }
];
var MOMENT_TRIGGERS = PLAYBOOK_TRIGGERS.filter(
  (t) => t.kind !== "reach_out"
);
var PLAYBOOK_HOURS = { min: 9, max: 20 };
var SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00\u2013${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`
};
var PLAYBOOK_BREATH_MS = 7 * DAY_MS;
var PLAYBOOK_VETO_DELAY_MS = 30 * MIN_MS;
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
  callSavedNote: "Saving moves them to Talking. They join People when they write or call in.",
  /**
   * The peek's ⋯ menu and its one item (Reach out Part 4, PR 9): Erase, the owner's alone (DELETE leads/[id]), asked
   * first because it cannot be undone. Who is offered it is `leadPeekMenu`'s to say, never the page's.
   */
  more: "More for this lead",
  erase: LEAD_ERASE_WORDS
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
  import: "Imported",
  lead: "A lead you found"
};
var LIST_NEEDS = ["calendar", "consult", "deals", "viewer"];
var LIST_RULE_FIELDS = [
  {
    id: "last_visit",
    label: "Last visit",
    kind: "days",
    needs: ["calendar"],
    draft: "days since their last appointment on the calendar"
  },
  {
    id: "next_visit",
    label: "Next visit",
    kind: "days",
    needs: ["calendar"],
    draft: "days until their next appointment; op this_week is Monday to Sunday of this week"
  },
  { id: "booked", label: "A visit booked", kind: "yesno", needs: ["calendar"], draft: "an appointment booked ahead" },
  {
    id: "asked_not_booked",
    label: "Asked, never booked",
    kind: "yesno",
    needs: ["calendar"],
    draft: "wrote or called in the last 30 days and nothing on the calendar answers it"
  },
  {
    id: "last_heard",
    label: "Last heard from",
    kind: "days",
    needs: [],
    draft: "days since THEY last wrote or called"
  },
  { id: "first_contact", label: "First contact", kind: "days", needs: [], draft: "days since they first got in touch" },
  {
    id: "channel",
    label: "Reaches you by",
    kind: "channel",
    needs: [],
    draft: "a way they reach the business: whatsapp, sms, voice (phone calls) or email"
  },
  {
    id: "came_from",
    label: "Came from",
    kind: "came_from",
    needs: [],
    draft: "how they first came: whatsapp, sms, email, call, calendar, manual, import or lead"
  },
  { id: "calls", label: "Calls", kind: "count", needs: [], draft: "how many calls" },
  { id: "conversations", label: "Conversations", kind: "count", needs: [], draft: "how many conversations" },
  {
    id: "has_chat",
    label: "Has written with you",
    kind: "yesno",
    needs: [],
    draft: "a written conversation either way (no means they have only phoned)"
  },
  {
    id: "said_yes",
    label: "Said yes to",
    kind: "purpose",
    needs: [],
    draft: "said yes to offers, or to messages (to: offers or messages)"
  },
  {
    id: "can_receive",
    label: "Can be sent",
    kind: "purpose",
    needs: [],
    draft: "can be sent offers or messages: the yes and a number to send to (to: offers or messages)"
  },
  { id: "stopped", label: "Asked to stop", kind: "yesno", needs: [], draft: "asked to stop, or on do-not-contact" },
  {
    id: "standing",
    label: "Standing",
    kind: "standing",
    needs: [],
    draft: "value needs_you (waiting for a person) or waiting_on_you (you have the thread and they wrote last)"
  },
  {
    id: "assigned",
    label: "Thread is with",
    kind: "assigned",
    needs: [],
    draft: "who has their thread: value me, teammate or nobody"
  },
  {
    id: "deal_stage",
    label: "Deal",
    kind: "deal_stage",
    needs: ["deals"],
    draft: "where they are on the way to a deal: value consultation, proposed, won, lost (passed) or ended"
  },
  {
    id: "consultation",
    label: "A consultation",
    kind: "yesno",
    needs: ["calendar", "consult"],
    draft: "their next or last visit is a consultation"
  },
  { id: "step_due", label: "A next step due", kind: "yesno", needs: [], draft: "a next step whose day has come" },
  {
    id: "in_list",
    label: "On the list",
    kind: "list",
    needs: [],
    draft: "on another list, by its token (list); never use it in a draft"
  }
];
var FIELD_IDS = LIST_RULE_FIELDS.map((f) => f.id);
var fieldOf = (id) => LIST_RULE_FIELDS.find((f) => f.id === id);
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
var LIST_PURPOSES = ["offers", "messages"];
var LIST_STANDINGS = ["needs_you", "waiting_on_you"];
var LIST_ASSIGNED = ["me", "teammate", "nobody"];
var LIST_DEAL_STAGES = ["consultation", "proposed", "won", "lost", "ended"];
var LIST_RULE_MAX = 12;
var LIST_ANY_MAX = 6;
var DAY_OPS = ["more_than", "within", "never", "ever", "this_week"];
var Days = { op: z9.enum(DAY_OPS), days: z9.number().int().min(1).max(3650).optional() };
var YesNo = { op: z9.literal("is"), yes: z9.boolean() };
var Count = { op: z9.enum(["at_least", "at_most"]), n: z9.number().int().min(0).max(1e4) };
var IsOrNot = z9.enum(["is", "is_not"]);
var Token = z9.string().regex(/^(seg:[a-z_]{1,40}|list:[0-9a-f-]{36})$/i);
var fact = (shape) => z9.object(shape).strict();
var ListFactSchema = z9.discriminatedUnion("field", [
  fact({ field: z9.literal("last_visit"), ...Days }),
  fact({ field: z9.literal("next_visit"), ...Days }),
  fact({ field: z9.literal("booked"), ...YesNo }),
  fact({ field: z9.literal("asked_not_booked"), ...YesNo }),
  fact({ field: z9.literal("last_heard"), ...Days }),
  fact({ field: z9.literal("first_contact"), ...Days }),
  fact({ field: z9.literal("channel"), op: IsOrNot, channel: z9.enum(CHANNELS) }),
  fact({ field: z9.literal("came_from"), op: IsOrNot, from: z9.enum(CAME_FROM) }),
  fact({ field: z9.literal("calls"), ...Count }),
  fact({ field: z9.literal("conversations"), ...Count }),
  fact({ field: z9.literal("has_chat"), ...YesNo }),
  fact({ field: z9.literal("said_yes"), ...YesNo, to: z9.enum(LIST_PURPOSES) }),
  fact({ field: z9.literal("can_receive"), ...YesNo, to: z9.enum(LIST_PURPOSES) }),
  fact({ field: z9.literal("stopped"), ...YesNo }),
  fact({ field: z9.literal("standing"), op: IsOrNot, value: z9.enum(LIST_STANDINGS) }),
  fact({ field: z9.literal("assigned"), op: IsOrNot, value: z9.enum(LIST_ASSIGNED) }),
  fact({ field: z9.literal("deal_stage"), op: IsOrNot, value: z9.enum(LIST_DEAL_STAGES) }),
  fact({ field: z9.literal("consultation"), ...YesNo }),
  fact({ field: z9.literal("step_due"), ...YesNo }),
  fact({ field: z9.literal("in_list"), op: IsOrNot, list: Token })
]);
var AnySchema = z9.object({ any: z9.array(ListFactSchema).min(2).max(LIST_ANY_MAX) }).strict();
var ListConditionSchema = z9.union([AnySchema, ListFactSchema]);
function factProblem(f) {
  if (f.field !== "last_visit" && f.field !== "next_visit" && f.field !== "last_heard" && f.field !== "first_contact")
    return null;
  if ((f.op === "more_than" || f.op === "within") && f.days === void 0) return `${f.field} ${f.op} needs days`;
  if (f.op === "this_week" && f.field !== "next_visit") return "only the next visit can be this week";
  return null;
}
var ListRuleSchema = z9.object({
  v: z9.literal(2).optional(),
  all: z9.array(ListConditionSchema).min(1).max(LIST_RULE_MAX)
}).strict().superRefine((r2, ctx) => {
  for (const f of r2.all.flatMap((c) => "any" in c ? c.any : [c])) {
    const p = factProblem(f);
    if (p) ctx.addIssue({ code: z9.ZodIssueCode.custom, message: p });
  }
});
function ruleFacts(rule) {
  return rule.all.flatMap((c) => "any" in c ? c.any : [c]);
}
function factNeeds(f) {
  const needs = new Set(fieldOf(f.field).needs);
  if (f.field === "standing" && f.value === "waiting_on_you") needs.add("viewer");
  if (f.field === "assigned" && f.value !== "nobody") needs.add("viewer");
  if (f.field === "deal_stage" && f.value === "consultation") {
    needs.add("calendar");
    needs.add("consult");
  }
  return LIST_NEEDS.filter((n) => needs.has(n));
}
function ruleNeeds(rule) {
  const needs = new Set(ruleFacts(rule).flatMap(factNeeds));
  return LIST_NEEDS.filter((n) => needs.has(n));
}
function dayHolds(days, op, n) {
  switch (op) {
    case "never":
      return days === null;
    case "ever":
      return days !== null;
    case "within":
      return days !== null && days <= (n ?? 0);
    case "more_than":
      return days !== null && days > (n ?? 0);
    case "this_week":
      return false;
  }
}
function holds(f, v, inList) {
  const is = "op" in f && f.op === "is";
  switch (f.field) {
    case "last_visit":
      return dayHolds(v.lastVisitDays, f.op, f.days);
    case "next_visit":
      return f.op === "this_week" ? v.nextVisitThisWeek : dayHolds(v.nextVisitDays, f.op, f.days);
    case "last_heard":
      return dayHolds(v.heardDays, f.op, f.days);
    case "first_contact":
      return f.op === "within" && !v.firstContact.evidence ? false : dayHolds(v.firstDays, f.op, f.days);
    case "booked":
      return v.booked === f.yes;
    case "asked_not_booked":
      return v.askedNotBooked === f.yes;
    case "has_chat":
      return v.hasChat === f.yes;
    case "stopped":
      return v.stopped === f.yes;
    case "consultation":
      return v.consultationVisit === f.yes;
    case "step_due":
      return v.stepDue === f.yes;
    case "said_yes":
      return v.saidYes[f.to] === f.yes;
    case "can_receive":
      return v.canReceive[f.to] === f.yes;
    case "channel":
      return v.channels.includes(f.channel) === is;
    case "came_from":
      return v.cameFrom?.key === f.from === is;
    case "calls":
      return f.op === "at_least" ? v.calls >= f.n : v.calls <= f.n;
    case "conversations":
      return f.op === "at_least" ? v.threads >= f.n : v.threads <= f.n;
    case "standing":
      return v.standing === f.value === is;
    case "assigned":
      return v.assigned === f.value === is;
    case "deal_stage":
      return v.dealStage === f.value === is;
    case "in_list":
      return inList(f.list, v.id) === is;
  }
}
var noLists = () => false;
function listRuleMatches(rule, v, inList = noLists) {
  return rule.all.every((c) => "any" in c ? c.any.some((f) => holds(f, v, inList)) : holds(c, v, inList));
}
var LEAF_PROPERTIES = {
  field: { type: "string", enum: FIELD_IDS.filter((id) => id !== "in_list") },
  op: { type: "string", enum: [...DAY_OPS, "at_least", "at_most", "is", "is_not"] },
  days: { type: "integer" },
  n: { type: "integer" },
  yes: { type: "boolean" },
  channel: { type: "string", enum: [...CHANNELS] },
  from: { type: "string", enum: [...CAME_FROM] },
  to: { type: "string", enum: [...LIST_PURPOSES] },
  value: { type: "string", enum: [.../* @__PURE__ */ new Set([...LIST_STANDINGS, ...LIST_ASSIGNED, ...LIST_DEAL_STAGES])] }
};
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
        properties: {
          ...LEAF_PROPERTIES,
          any: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["field", "op"],
              properties: LEAF_PROPERTIES
            }
          }
        }
      }
    }
  }
};
var ListDraftAnswerSchema = z9.object({
  name: z9.string().trim().min(1).max(60),
  cannot: z9.string().trim().max(200),
  all: z9.array(z9.unknown()).max(LIST_RULE_MAX)
});
var SELLS_BY_QUESTION = "How customers buy";
var SELLS_BY_WORDS = {
  booking: { label: "They book an appointment", sentence: "Bookings, reminders and the booking link." },
  proposal: {
    label: "Some get a proposal first",
    sentence: "Adds deals: a proposal on each person, a Pipeline in People, and a Deals section in Reports."
  }
};
function dealsAreOn(sellsBy) {
  return sellsBy === "proposal";
}
var SAVED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var BUILTIN_ID = /^[a-z_]{1,40}$/;
function parseListToken(token2) {
  if (typeof token2 !== "string") return null;
  const at2 = token2.indexOf(":");
  const kind = token2.slice(0, at2);
  const id = token2.slice(at2 + 1);
  if ((kind === "seg" || kind === "state") && BUILTIN_ID.test(id)) return { kind: "builtin", id };
  if (kind === "list" && SAVED_ID.test(id)) return { kind: "saved", id: id.toLowerCase() };
  return null;
}
var r = (...all) => ({ v: 2, all });
var BUILTIN_LISTS = [
  {
    id: "needs_you",
    label: "Needs you",
    tip: "An open escalation, or a thread waiting for a person",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "needs_you" })
  },
  // Yours, or nobody's: a teammate's thread waits on them (standing.ts).
  {
    id: "waiting_on_you",
    label: "Waiting on you",
    tip: "You have the thread, or nobody does, and they wrote last \u2014 a teammate's waits on them",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "waiting_on_you" })
  },
  // Their next step's day has come (0007, amended): every workspace, deals or not. The page says the step itself.
  {
    id: "steps_due",
    label: "Steps due",
    tip: "Their next step's day has come, or gone by \u2014 a note with a day, for the team",
    group: "attention",
    onProfile: false,
    rule: r({ field: "step_due", op: "is", yes: true })
  },
  // New by the date they first got in touch, whatever their standing: someone new who needs you is both.
  {
    id: "new_week",
    label: "New this week",
    tip: "First contact in the last 7 days, by evidence \u2014 imported history never counts",
    group: "journey",
    rule: r({ field: "first_contact", op: "within", days: 7 })
  },
  // This week, Monday to Sunday, by the workspace's clock.
  {
    id: "booked_week",
    label: "Booked this week",
    tip: "An appointment this week, Monday to Sunday",
    group: "journey",
    rule: r({ field: "next_visit", op: "this_week" })
  },
  {
    id: "booked",
    label: "Booked",
    tip: "An appointment ahead on your calendar \u2014 the booking is the conversion",
    group: "journey",
    rule: r({ field: "booked", op: "is", yes: true })
  },
  // Reports' rule (calendar-people.ts visitAnswersAsk): asked in 30 days and nothing on the calendar answers it.
  {
    id: "asked_never_booked",
    label: "Asked, never booked",
    tip: "Wrote or called in the last 30 days, and nothing on your calendar since answers it \u2014 the people you can still win",
    group: "journey",
    rule: r({ field: "asked_not_booked", op: "is", yes: true })
  },
  // Forty-five days since the chair, nothing ahead: the win-back list, from visits rather than silence.
  {
    id: "lapsed",
    label: "Lapsed",
    tip: "Forty-five days or more since their last visit, nothing ahead \u2014 the win-back list, from visits rather than silence",
    group: "journey",
    rule: r({ field: "booked", op: "is", yes: false }, { field: "last_visit", op: "more_than", days: 44 })
  },
  // The journey past the booking (0004), as the Pipeline groups it (deals.ts dealStageOf).
  {
    id: "consultation_booked",
    label: "Consultations",
    tip: "A consultation coming up, or one this past week with no proposal since \u2014 the Pipeline's Consultations",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "consultation" })
  },
  {
    id: "proposal_out",
    label: "Proposal out",
    tip: "A proposal went out and is waiting on their answer",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "proposed" })
  },
  {
    id: "clients",
    label: "Clients",
    tip: "Said yes, or paid \u2014 the engagement is running",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "won" })
  },
  {
    id: "deal_passed",
    label: "Passed",
    tip: "They passed on a proposal",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "lost" })
  },
  {
    id: "deal_ended",
    label: "Ended",
    tip: "An engagement that ended \u2014 the win-back list for clients",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "ended" })
  },
  // Heard from them, then nothing for thirty days: someone we never heard from is not quiet, and our own sends are
  // not their word.
  {
    id: "quiet",
    label: "Quiet 30+ days",
    tip: "They haven't written or called in 30 days \u2014 your own messages don't count, and someone never heard from isn't quiet",
    group: "reach",
    rule: r({ field: "last_heard", op: "more_than", days: 30 })
  },
  {
    id: "phoned_only",
    label: "Phoned only",
    tip: "Only ever phoned \u2014 no WhatsApp thread",
    group: "reach",
    rule: r({ field: "has_chat", op: "is", yes: false }, { field: "calls", op: "at_least", n: 1 })
  },
  // TWO LISTS, BECAUSE THERE ARE TWO ANSWERS. This one is the yes to hearing from the business, which says nothing
  // about offers; the next is the promotional audience, who a marketing broadcast may reach: the yes AND a number.
  {
    id: "opted_in",
    label: "Said yes to messages",
    tip: "Said yes to hearing from you \u2014 replies and messages about their own visit",
    group: "reach",
    onProfile: false,
    rule: r({ field: "said_yes", op: "is", to: "messages", yes: true })
  },
  {
    id: "offers_ok",
    label: "Can receive offers",
    tip: "Said yes to OFFERS, separately, with a number to send to \u2014 the only people a promotional broadcast may reach",
    group: "reach",
    onProfile: false,
    rule: r({ field: "can_receive", op: "is", to: "offers", yes: true })
  },
  // A fact, not the state: someone who opted out AND needs you is in both lists.
  {
    id: "opted_out",
    label: "Opted out",
    tip: "Asked to stop; the receptionist stays silent, offers included",
    group: "reach",
    onProfile: false,
    rule: r({ field: "stopped", op: "is", yes: true })
  }
];
var PEOPLE_LISTS = BUILTIN_LISTS.map((l) => {
  const needs = ruleNeeds(l.rule);
  return {
    ...l,
    ...needs.includes("calendar") ? { needsCalendar: true } : {},
    ...needs.includes("consult") ? { needsConsultFirst: true } : {},
    ...needs.includes("deals") ? { needsDeals: true } : {},
    ...needs.includes("viewer") ? { needsViewer: true } : {},
    test: (vm) => listRuleMatches(l.rule, vm)
  };
});
var PeopleExportQuerySchema = z10.object({
  list: z10.string().max(80).refine((t) => parseListToken(t) !== null, "Name a list by its token.").optional()
});
var MONTH_MS = 30 * DAY_MS;
var CARRIER_CONSENT_SOURCE = "carrier";
var PERSON_MODE_LABELS = { auto: "Answer", ask: "Ask me first", never: "Never" };
var PERSON_MODE_WORDS = {
  ...PERSON_MODE_LABELS,
  inherit: "Follow the workspace"
};
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
var ROW_KINDS = ASK_CITATION_KINDS.filter((k) => k !== "page");
var SOURCE = {
  type: "object",
  description: "A row or a page read this turn (the workspace block and the reads above count, as does a tool's result), or a row an earlier answer in this thread named, with the kind and the exact id it came with (a page's id is its route; a run is kind broadcast); kind none when it rests on nothing read or named.",
  properties: {
    kind: { type: "string", enum: [...ASK_CITATION_KINDS, "none"] },
    id: { type: "string" },
    label: { type: "string", description: `A short name for it, at most ${ASK_ANSWER_CAPS.label} characters.` }
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
          description: `The answer itself in one sentence, the finding first and never a preamble; under 20 words and at most ${ASK_ANSWER_CAPS.headline} characters.`
        },
        detail: {
          type: "string",
          description: `Only what the headline needs: empty when the headline is enough; at most two short sentences, or five when they asked why, how, for a summary or for detail; at most ${ASK_ANSWER_CAPS.detail} characters.`
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
          description: `The numbers the headline rests on, at most ${ASK_ANSWER_CAPS.figures}; empty when there is none.`,
          items: {
            type: "object",
            properties: {
              value: {
                type: "string",
                description: `The number as said: "5", "44%", "1 min"; at most ${ASK_ANSWER_CAPS.value} characters.`
              },
              label: { type: "string", description: `What it counts, at most ${ASK_ANSWER_CAPS.label} characters.` },
              note: {
                type: "string",
                description: `How it compares ("up from 1"), or empty; at most ${ASK_ANSWER_CAPS.note} characters.`
              },
              source: SOURCE
            },
            required: ["value", "label", "note", "source"],
            additionalProperties: false
          }
        },
        items: {
          type: "array",
          description: `The rows the answer names (${ASK_ROW_WORDS}), at most ${ASK_ANSWER_CAPS.items}; empty when it names none. Each opens its row.`,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: `Who or what it is, at most ${ASK_ANSWER_CAPS.title} characters.` },
              meta: {
                type: "string",
                description: `The channel and how long, or empty; at most ${ASK_ANSWER_CAPS.meta} characters.`
              },
              line: { type: "string", description: `Why it matters, in one line of at most ${ASK_ANSWER_CAPS.line} characters.` },
              source: SOURCE
            },
            required: ["title", "meta", "line", "source"],
            additionalProperties: false
          }
        },
        breakdown: {
          type: "object",
          description: `One whole in its parts, at most ${ASK_ANSWER_CAPS.parts} parts whose values add up exactly to total; parts empty when nothing splits.`,
          properties: {
            label: {
              type: "string",
              description: `What the whole is ("customer messages"), at most ${ASK_ANSWER_CAPS.label} characters.`
            },
            total: { type: "number" },
            parts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: `At most ${ASK_ANSWER_CAPS.label} characters.` },
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
            label: { type: "string", description: `The button's words, at most ${ASK_ANSWER_CAPS.label} characters.` },
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
          description: `Up to ${ASK_ANSWER_CAPS.next} short questions they might ask next, at most ${ASK_ANSWER_CAPS.question} characters each, never one about a place already offered; empty when nothing follows.`,
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
var ASK_CONTEXT_MAX_ROWS = 40;
var ASK_CONTEXT_ROW_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "lead",
  "search",
  "run",
  "playbook",
  "template"
];
var Id = z11.string().min(1).max(120);
var PageContextSchema = z11.object({
  v: z11.literal(1),
  surface: z11.enum(ASK_SURFACES),
  route: z11.string().max(200),
  view: z11.string().max(80).nullish(),
  focus: z11.object({ kind: z11.enum(ASK_SCOPE_KINDS), id: Id, label: z11.string().max(80) }).strict().nullish(),
  rows: z11.array(z11.object({ kind: z11.enum(ASK_CONTEXT_ROW_KINDS), id: Id }).strict()).max(ASK_CONTEXT_MAX_ROWS),
  askedAt: z11.number().int().nonnegative()
}).strict();
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
var PROPOSAL = {
  kind: "proposal_link",
  label: "Proposal link",
  example: "https://docs.example.com/proposal"
};
var PROPOSAL_ES = { ...PROPOSAL, label: "Enlace de la propuesta" };
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
function parseParamSpec(raw) {
  if (typeof raw === "string") {
    const m = /^@(first_name|business_name|booking_link|visit_when|visit_service|proposal_link)$/.exec(raw.trim());
    if (m) return { kind: m[1] };
    return { kind: "text", value: raw };
  }
  if (raw && typeof raw === "object") {
    const o = raw;
    if (o.kind === "text") return typeof o.value === "string" ? { kind: "text", value: o.value } : null;
    if (o.kind === "first_name" || o.kind === "business_name" || o.kind === "booking_link" || o.kind === "visit_when" || o.kind === "visit_service" || o.kind === "proposal_link")
      return { kind: o.kind };
  }
  return null;
}
function parseParamSpecs(raw) {
  return Array.isArray(raw) ? raw.map((p) => parseParamSpec(p) ?? { kind: "text", value: String(p) }) : [];
}
var LIMIT_TIERS = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
var REPLY_WINDOW_HOURS = 72;
var REPLY_WINDOW_MS = REPLY_WINDOW_HOURS * HOUR_MS;
var REPLY_WINDOW_WORDS = `within ${REPLY_WINDOW_HOURS / 24} days`;
var BROADCAST_THROTTLE_WAITS_MS = [
  MIN_MS,
  2 * MIN_MS,
  5 * MIN_MS,
  10 * MIN_MS,
  15 * MIN_MS,
  30 * MIN_MS
];
var SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var WA_WINDOW_MS = 24 * HOUR_MS;
var REPLY_LIMITS = {
  whatsapp: { max: 4096, refusal: "WhatsApp refuses a message over 4096 characters." },
  sms: { max: 1600, refusal: "A text can be at most 1600 characters." },
  email: { max: 2e4, refusal: "An email reply can be at most 20,000 characters." }
};
var REPLY_MAX_ANY = Math.max(...Object.values(REPLY_LIMITS).map((l) => l.max));
var CALL_HEARTBEAT_MS = 10 * MIN_MS;
var REPLY_DELAY_MAX_MS = 10 * MIN_MS;
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
  /** A workspace's own sending domain (Reach out, 00175): added, verified, held by the domains clock, sending again,
   * removed. The host and the reason, never the provider's id. */
  "sending_domain.added",
  "sending_domain.verified",
  "sending_domain.held",
  "sending_domain.released",
  /** The owner resumed a domain held for its bounces or a complaint (00176): 30 a day again. */
  "sending_domain.resumed",
  "sending_domain.removed",
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
  "deal.ended",
  // A partner (0012): the workspace was made through a partner's link and the partner joined its team, or the code
  // the link left named no partner who could be credited (unknown, paused, or the caller's own).
  "partner.attributed",
  "partner.code_ignored",
  // The ledger (0012, P3): a share written from a paid invoice, a refund's or a dispute's effect on it, and the
  // standing the sweep decided for a workspace once it had paid.
  "partner.earned",
  "partner.reversed",
  "partner.standing_set",
  // A payout sent by hand (0012, P5), on each workspace it came from, with that workspace's part.
  "partner.paid",
  // A workspace a partner set up for a business (0016): handed to its owner (again, on a resend), accepted, declined.
  "partner.handover_sent",
  "partner.handover_accepted",
  "partner.handover_declined",
  // An existing workspace asks a partner to join it (0020): asked (again, on a second ask), taken back, joined, declined.
  "partner.invited",
  "partner.invite_withdrawn",
  "partner.invite_accepted",
  "partner.invite_declined",
  // A reply to a reach-out, read (00222, Reach out Part 5): what it meant ({ intent, claim, reread, unread }), on the lead.
  "reach_out.replied",
  // A reply read as no, undone by a member within seven days (00222 reach_out_reply_undo).
  "reach_out.reply_undone"
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
  "record_deal",
  /**
   * A list's life (00169, decision 0009): made, renamed, its rule changed, people put on or taken off, archived (a
   * playbook or another list depends on it), restored, deleted. Subject 'list'; the payload says what changed.
   */
  "make_list",
  "rename_list",
  "change_list_rule",
  "add_to_list",
  "drop_from_list",
  "archive_list",
  "restore_list",
  "delete_list",
  /** A client list brought in from a spreadsheet (00170): one row per part of fifty, subject the workspace. */
  "import"
];
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
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" },
  // 0006: one nudge per proposal, with its link, once it has waited past the workspace's pace with nothing back.
  follow_up: {
    name: "Proposal follow-ups",
    short: "Follow-ups",
    note: "the proposal follow-up playbook \xB7 one nudge per proposal, with its link, once it has waited with nothing back \xB7 auto sends each run, ask leaves it waiting on Today, never runs nothing"
  },
  // Reach out (Part 3): cold email to the businesses a search found. A chain's first run always waits for its owner.
  outreach: {
    name: "Cold email to businesses a search found",
    short: "Reach-outs",
    note: "every email a reach-out sends \xB7 its first run always waits for you; later runs send 30 minutes after they are made unless you stop them \xB7 never sends none"
  }
};
var PolicyLimitsSchema = z12.object({
  max_replies_day: z12.number().int().min(1).max(200).optional(),
  pause_hours: z12.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: z12.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: z12.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: z12.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
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
var BrainOutputSchema = z13.object({
  reply: z13.string(),
  intent: z13.enum(BRAIN_INTENTS).catch("other"),
  escalate: z13.boolean().catch(false),
  reason: z13.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: z13.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: z13.array(z13.string()).catch([]).transform(
    (a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))
  ),
  language: z13.enum(BRAIN_LANGUAGES).catch("other")
});
var REVIEW_AUTO_REPLY_MAX_AGE_MS = 14 * DAY_MS;
var REVIEW_NEWS_MS = 36 * HOUR_MS;
var REVIEW_NEWS_MAX_AGE_MS = 14 * DAY_MS;
var NAME_MAX = BrainConfigSchema.shape.business_name.maxLength ?? Infinity;
function maySpend(mode, status) {
  if (mode !== "stripe") return true;
  return status === "active";
}
var DATE_FMT2 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var CHECKOUT_OUTCOME_WORDS = {
  success: "Your card is on file and the trial has started. This page updates as Stripe confirms it.",
  cancel: "Checkout was closed before finishing; nothing was charged.",
  portal: "Back from Stripe. Any change you made there shows here within a minute."
};
var CONSENT_PHRASE = OFFERS_OPT_IN_PHRASES.en;
var CONSENT_PHRASE_ES = OFFERS_OPT_IN_PHRASES.es;
var HAND_KINDS = ["call", "note"];
var HAND_WORDS_MAX = 280;
var REACH_OUT_SUBJECT_MAX = 80;
var REACH_OUT_BODY_MAX = 1200;
var OPENING_WORDS_MAX = 40;
var OPENING_CHARS_MAX = 400;
var REACH_OUT_STEPS_MAX = 5;
var REACH_OUT_DOMAINS_MAX = 5;
var REACH_OUT_NAME_MAX = 80;
var SIGNED_BY_MAX = 60;
var REACH_OUT_GAP_MINUTES = [5, 8, 12, 20, 30, 60];
var REACH_OUT_AFTER_DAYS = { min: 2, max: 30, first: 4 };
var ReachOutStepSchema = z14.object({
  /** An existing step's id, when the sheet edits a chain; none for a new one. */
  id: z14.string().uuid().nullable().optional(),
  subject: z14.string().max(REACH_OUT_SUBJECT_MAX * 2).nullable(),
  body: z14.string().max(REACH_OUT_BODY_MAX * 2),
  after_days: z14.number().int().min(REACH_OUT_AFTER_DAYS.min).max(REACH_OUT_AFTER_DAYS.max).nullable(),
  /** A call or a note for the team instead of an email (Part 5, G20): the chain's last step only. */
  hand: z14.object({ kind: z14.enum(HAND_KINDS), words: z14.string().max(HAND_WORDS_MAX * 2) }).nullable().optional()
});
var ReachOutChainSchema = z14.object({
  name: z14.string().trim().min(1).max(REACH_OUT_NAME_MAX),
  search_id: z14.string().uuid(),
  include_unconfirmed: z14.boolean(),
  /** One of the sheet's paces: the database's CHECK holds the same set (00211). */
  gap_minutes: z14.number().int().refine((g) => REACH_OUT_GAP_MINUTES.includes(g), {
    message: `One of ${REACH_OUT_GAP_MINUTES.join(", ")} minutes.`
  }),
  /** Empty: every verified domain of the workspace (00183). */
  domain_ids: z14.array(z14.string().uuid()).max(REACH_OUT_DOMAINS_MAX),
  signed_by: z14.string().trim().max(SIGNED_BY_MAX).nullable(),
  steps: z14.array(ReachOutStepSchema).min(1).max(REACH_OUT_STEPS_MAX)
});
var OPENING_FACT_KEYS = [
  "category",
  "city",
  "rating",
  "reviews",
  "website",
  "hours",
  "about",
  "why_it_fits"
];
var OPENING_SCHEMA = {
  type: "object",
  properties: {
    // The bound is said, not constrained: structured outputs refuse maxLength. Code holds it (checkOpening, too_long).
    opening: { type: "string", description: `At most ${OPENING_WORDS_MAX} words and ${OPENING_CHARS_MAX} characters.` },
    angle: { type: "string" },
    facts_used: { type: "array", items: { type: "string", enum: [...OPENING_FACT_KEYS] } }
  },
  required: ["opening", "angle", "facts_used"],
  additionalProperties: false
};
var ReachOutRepliesQuerySchema = z15.object({
  since: z15.string().datetime({ offset: true }).optional(),
  conversation_id: z15.string().uuid().optional()
});
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
  leads_excluded_blanked: 30,
  /** A background job done or canceled, which carried a message's number and words while it was sent (purge_jobs, 00215). */
  jobs_finished: 7,
  /** A failed one lives as long as the alert that cites it (purge_jobs, 00215; notifications). */
  jobs_failed: 90,
  /** How fast a page load was, with no person or workspace on it (purge-page-vitals, 00229). */
  page_vitals: 30
};
var RECORDING_RETENTION_DAYS = RETENTION_DAYS.call_recordings;
var RECORDING_PURGED_WORDS = `Recording removed after ${RECORDING_RETENTION_DAYS} days; the transcript is kept`;
var RECORDING_NOTE = {
  none: "No recording",
  pending: "Recording still processing",
  failed: "Recording couldn't be saved",
  purged: `Recording removed after ${RECORDING_RETENTION_DAYS} days`
};
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
var PROVISIONING_DEADLINE_MS = 5 * MIN_MS;
var SOLE_PROP_CEILING_SENTENCE = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE}`;
var LEAD_MAP_STATE_WORDS = {
  talking: LEAD_STAGE_WORDS.converted,
  contacted: LEAD_STAGE_WORDS.nurture,
  review: LEAD_REVIEW_WORD,
  ready: LEAD_STAGE_WORDS.ready,
  out: `${LEAD_STAGE_WORDS.archived} or ${LEAD_LEFT_OUT_WORD.toLowerCase()}`
};
function parts(tz, now) {
  try {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false
    });
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
var FOLLOW_UP_NEEDS_DEALS = `Proposal follow-ups need deals: in Settings \u203A Business, answer \u201C${SELLS_BY_QUESTION}\u201D with \u201C${SELLS_BY_WORDS.proposal.label}\u201D.`;
var PLAYBOOK_TOUCH_WINDOW_MS = (365 + 7) * DAY_MS;
var PLAYBOOK_CLASS_LABEL = {
  reengage: POLICY_CLASS_WORDS.reengage.short,
  campaign: POLICY_CLASS_WORDS.campaign.short,
  booking: POLICY_CLASS_WORDS.booking.short,
  follow_up: POLICY_CLASS_WORDS.follow_up.short,
  outreach: POLICY_CLASS_WORDS.outreach.short
};
var DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var REPUTATION_MEMORY_MS = 30 * 864e5;
var FORWARDING_TEST_WINDOW_MS = 30 * MIN_MS;
var TRY_QUIET_AFTER_MS = 3 * MIN_MS;
var FIRST_RUN_PHONE_WORDS = {
  chooseHeading: "How should calls reach your receptionist?",
  chooseLead: "Most businesses keep the number customers already know. Your team still answers first, and your receptionist gets the rest.",
  readyHeading: "Getting your receptionist's number ready",
  readyLeadForwarded: "Customers never see this number: the calls nobody picks up at yours are sent to it.",
  readyLeadNew: "Customers call this number directly. Put it on your website and your Google listing.",
  recommended: "Recommended",
  keepTitle: (display) => display ? `Keep ${display}` : "Keep the number you have",
  keepListed: "The number on your Google listing. Calls nobody picks up go to your receptionist. Same phone, same phone company.",
  keepTyped: "Calls nobody picks up go to your receptionist. Same phone, same phone company.",
  newTitle: "Get a new number",
  newSentence: "For a business that doesn't have one yet. Customers call it directly.",
  moveTitle: "Move my number to Chanlytics",
  moveSentence: "Takes 7\u201314 business days. Your number forwards in the meantime, so nothing changes for customers.",
  numberLabel: "The number customers call",
  numberPlaceholder: "(305) 555-0100",
  areaLabel: "Area code",
  areaPlaceholder: "305",
  find: "Find numbers",
  finding: "Looking\u2026",
  pickLabel: "Pick your receptionist's number",
  noneFree: (area) => `Nothing free in ${area} right now. Try a nearby area code.`,
  threeDigits: "Three digits, like 305.",
  local: "Local",
  held: {
    number: "Type the number customers call.",
    us: "Forwarding works for a US number: type it with its area code.",
    pick: "Pick a number first."
  },
  cta: {
    planKeep: "Start my plan",
    planNew: (number) => number ? `Start my plan with ${number}` : "Start my plan",
    planMove: "Start my plan and ask for the move",
    keep: "Keep this number",
    new: (number) => number ? `Get ${number}` : "Get this number",
    move: "Ask for the move"
  },
  planOffer: (price) => price ? `${price}, starting today` : "Your plan, starting today",
  planNote: "Your number is included. The first charge is today, and you can cancel anytime from Billing.",
  /** A workspace on a free trial: the trial covers no number, so getting one starts the plan early. */
  planNoteTrial: "Your free trial ends today and your plan starts, on the card you gave. Your number is included.",
  starting: "Starting your plan\u2026",
  startingDetail: "Your card is on file. This page updates as Stripe confirms it.",
  buyingIn: (area) => area ? `Getting your receptionist's number in ${area}\u2026` : "Getting your receptionist's number\u2026",
  buyingNew: (number) => `Getting ${number}\u2026`,
  usually: "Usually a minute or two; this page updates by itself",
  /** What the page says when a buy or a search is refused, over the door's own sentence. */
  notBought: "No number yet",
  moveAsked: "We'll move your number with you and reach you by email. Until then, it forwards.",
  moveNotAsked: "The move wasn't asked for. Ask again from Settings later; your number forwards meanwhile.",
  cancelled: CHECKOUT_OUTCOME_WORDS.cancel,
  /** The two questions while the number is on its way (canvas R4), and the button they lead to. */
  ringsLabel: (display) => display ? `Which phone rings when customers call ${display}?` : "Which phone rings when customers call?",
  rings: { mobile: "A mobile", landline: "A landline", office: "An office phone system" },
  companyLabel: "Who's the phone company?",
  company: { verizon: "Verizon", att: "AT&T", tmobile: "T-Mobile", other: "Another company" },
  show: "Show me what to dial",
  showOffice: "Show me where to forward",
  readySoon: "Ready in a moment",
  answerFirst: "Answer the questions first.",
  askHeading: "One more thing",
  askLead: "How the calls are sent to your receptionist depends on the phone that rings.",
  /** The code (canvas R5, P5). */
  codeHeading: "Dial this on the phone customers call",
  codeLead: "It tells your phone company to send the calls nobody picks up to your receptionist. You only do this once.",
  codeLeadAll: "It tells your phone company to send every call to your receptionist. You only do this once.",
  codeLabel: (company, rings) => rings === "landline" ? "A landline" : company ? `${company} \xB7 a mobile` : "A mobile",
  stepsLandline: ["Pick up the phone customers call.", "Dial the code above.", "Wait for the tone, then hang up."],
  stepsMobile: ["On the phone customers call, dial the code above.", "Wait for the tone, then hang up."],
  /** A tab that lost the answers: what rings is not known, so neither is said. */
  stepsAny: ["Dial the code above on the phone customers call.", "Wait for the tone, then hang up."],
  // Not a promise the code replaces voicemail: forwarding.ts says a voicemail that picks up first keeps calls away.
  warnMobile: "Voicemail on this phone? If it still picks up after you dial the code, calls never reach your receptionist: see The code didn't work.",
  warnLandline: "If an answering machine is on this line, turn it off. Otherwise it answers before your receptionist can.",
  warnAny: "Voicemail or an answering machine on that phone? If it picks up first, calls never reach your receptionist: see The code didn't work.",
  off: (code2) => `To switch it off later, dial ${code2}.`,
  tap: "Tap to dial",
  done: "Done, let's try it",
  help: "The code didn't work",
  change: "Change the answers",
  keepCode: "Keep what I have",
  /** An office phone system (canvas V6): the number to forward to, and a person to do it with. */
  officeHeading: "Forward missed calls in your phone system",
  officeLead: "Office phone systems set this in their own settings, under \u201Cforwarding\u201D or \u201Cwhen no one answers\u201D.",
  officeLabel: (always) => always ? "Forward every call to" : "Forward unanswered calls to",
  officeSteps: [
    "Open your phone system's settings.",
    "Find forwarding, or what happens when no one answers.",
    "Forward the calls to the number above: your receptionist's number. Customers never see it."
  ],
  officeWarn: "Voicemail in the system? The forwarding has to come before it, or calls never reach your receptionist.",
  officeOff: "To switch it off later, take the forwarding out in the same settings.",
  withMe: "Not sure where it is? A person at Chanlytics can do it with you on a call.",
  withMeLabel: "Do it with me",
  helpOffice: "It didn't work",
  withMeAsked: (ago3) => `Asked ${ago3}: a person at Chanlytics will email you to find a time.`,
  withMeFailed: "Not asked",
  withMeSent: "We'll email you to find a time for a call.",
  notForwarded: "Forwarding not saved"
};
var FIRST_RUN_ROUTE = "start";
var FIND_PARAM = "find";
var FIRST_RUN_FIND_ROUTE = `${FIRST_RUN_ROUTE}/${FIND_PARAM}`;
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
var AnswerSchema = z16.object({
  places: z16.array(
    z16.object({
      ref: z16.number().int(),
      criteria: z16.array(
        z16.object({ key: z16.string(), answer: z16.enum(["pass", "fail", "unknown"]), facts: z16.array(z16.string()) })
      ),
      email_index: z16.number().int().nullable(),
      reason: z16.string()
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
var QUIET_AFTER_MS = 7 * DAY_MS;
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
var CALL_ACTIVITY_STALE_MS = 15 * MIN_MS;
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
async function keyedDigest(tenantId, identifier) {
  const bytes = new TextEncoder().encode(`${tenantId}:${identifier}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function leadSuppressionHash(tenantId, value) {
  return keyedDigest(tenantId, value);
}
var NINE_TO_FIVE = [{ from: 9 * 60, to: 17 * 60 }];
var SEND_DAY_FRAME = { from: 8 * 60, to: 20 * 60 };
var REACH_OUT_PREVIEW_INDEX_MAX = 199;
var ReachOutPreviewSchema = z17.object({
  search_id: z17.string().uuid(),
  index: z17.number().int().min(0).max(REACH_OUT_PREVIEW_INDEX_MAX),
  include_unconfirmed: z17.boolean(),
  words: z17.object({
    subject: z17.string().max(REACH_OUT_SUBJECT_MAX * 2).nullable(),
    body: z17.string().trim().min(1).max(REACH_OUT_BODY_MAX * 2)
  }),
  signed_by: z17.string().trim().max(SIGNED_BY_MAX).nullable(),
  language: z17.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/).optional()
});
var REACH_OUT_DECISIONS = ["include", "rewrite", "skip", "not_a_fit"];
var ReachOutDecideSchema = z17.object({ decision: z17.enum(REACH_OUT_DECISIONS) });
var REACH_OUT_REFUSALS = {
  exists: "This search has a reach-out already.",
  wrote: "This reach-out has written already. Pause it instead.",
  stepWrote: "That step has written already. Pause the reach-out instead.",
  /** 00228's: a call or a note anywhere but last, and a step changed from one to the other once it has run. */
  handLast: "A call or a note ends the chain.",
  stepRan: "That step has run already. Add a new step instead.",
  outOfPlace: "A step is out of its place. Open the reach-out again.",
  notFound: "Reach-out not found.",
  workspaceNotFound: "Workspace not found.",
  oneEmail: "A reach-out has at least one email.",
  /** lead_set_stage's own, when Not a fit finds its lead missing or erased. */
  leadNotFound: "Lead not found.",
  leadGone: "This lead is gone.",
  searchNotFound: "Search not found.",
  domainNotFound: "Domain not found.",
  sendNotFound: "Email not found.",
  runNotFound: "Run not found.",
  runOver: "That run is over.",
  gone: "That email has gone.",
  includeHeld: "Only an email the check held for a reason is included.",
  givenUp: "This email waited two weeks for your answer and was given up.",
  decision: "Include, rewrite, skip or not a fit.",
  /** A row's CHECK refused what the words' rules let through: never expected, said plainly. */
  unsaved: "That reach-out could not be saved as it is. Check its steps and try again.",
  /** DELETE playbooks/[id] on a reach-out (R16): its history is never deleted there. */
  notHere: "A reach-out is removed from its own row, and only before its first email goes. After that, pause it.",
  /** The preview on a deployment that runs nothing. */
  preview: "Previews only work on the production dashboard.",
  previewDown: "The preview could not be written just now. Try again in a moment.",
  budget: "Today's assistant budget is spent, so the preview waits until tomorrow."
};
var REFUSAL_SET = new Set(Object.values(REACH_OUT_REFUSALS));
var REACH_OUT_SHEET_PARTS = {
  who: "Who gets it",
  words: "What you'd say",
  then: "Then",
  pace: "Pace",
  from: "From",
  before: "Before it goes",
  subject: "Subject",
  body: "Your words",
  signAs: "Sign as",
  after: "After",
  afterTail: "with nothing back \xB7 in the same thread",
  dayOne: "Day one \xB7 the pace below",
  remove: "Remove this step",
  everyDomain: "Every verified domain",
  domainsMax: `Up to ${REACH_OUT_DOMAINS_MAX} domains, or every verified one.`,
  close: "Close",
  recommended: "Recommended",
  start: "Start it",
  save: "Save",
  starting: "Starting\u2026",
  saving: "Saving\u2026",
  cancel: "Cancel",
  name: "The reach-out's name",
  fromLine: "From",
  toLine: "To",
  subjectLine: "Subject",
  footLine: "At the foot",
  repliesLine: "Replies"
};
var WHEN2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var PAGE_VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"];
var PAGE_NAME = /^[a-z][a-z0-9-]{0,31}$/;
var VITAL_ID = /^[A-Za-z0-9-]{1,64}$/;
var VITAL_CEILING = 10 * MIN_MS;
var PageVitalReport = z18.object({
  id: z18.string().regex(VITAL_ID, { error: "A report needs the browser's id." }),
  name: z18.enum(PAGE_VITALS, { error: "A report names one of the five." }),
  value: z18.number().min(0).max(VITAL_CEILING)
});
var PageVitalsInput = z18.object({
  page: z18.string().regex(PAGE_NAME, { error: "A page's name is a word in lower case." }),
  vitals: z18.array(PageVitalReport).min(1).max(PAGE_VITALS.length)
});
var LIVE_STALE_MS = 5 * MIN_MS;
var LIVE_OVERLONG_MS = 30 * MIN_MS;
var ANALYSIS_GRACE_MS = 10 * MIN_MS;
var SEARCH_WARN_MS = 12 * HOUR_MS;
var PUSH_RECEIPTS_AFTER_MS = 15 * MIN_MS;
var SIGNUP_NAME_MIN = 2;
var SIGNUP_NAME_MAX = 120;
var InviteCodeSchema = z19.string().trim().max(80);
var SignupSchema = z19.object({
  name: z19.string().trim().min(SIGNUP_NAME_MIN, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX, "That name is too long \u2014 120 characters at most."),
  email: z19.string().trim().toLowerCase().email("Enter a work email address.").max(254),
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
  password: z19.string().max(200).optional(),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: z19.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: InviteCodeSchema.optional()
}).strict();
var PendingWorkspaceSchema = z19.object({
  name: z19.string().trim().min(SIGNUP_NAME_MIN).max(SIGNUP_NAME_MAX),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z19.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone(v) ? v : null)
});
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
var PARTNER_CODE_MIN = 3;
var PARTNER_CODE_MAX = 24;
var PartnerBecomeSchema = z20.object({
  code: z20.string().trim().min(1).max(64),
  terms: z20.literal(true, { message: "The terms have to be accepted." })
}).strict();
var PartnerLettersSchema = z20.object({ letters: z20.boolean() }).strict();
var PARTNER_WORDS = {
  tab: "Partner",
  title: "Bring a business to Chanlytics",
  /** The offer, before the share, which is printed from the row (shareWords). */
  offer: "Send a business your link. When it signs up through the link and pays for its plan, you join its team as its partner: you set its receptionist up and keep it running, and Chanlytics pays you a share of what it pays for its plan, for as long as it pays. A business already on Chanlytics can ask you in by your code: if it has not paid for a plan yet, the same share is yours once it does.",
  codeLabel: "Your code",
  codeHint: `${PARTNER_CODE_MIN} to ${PARTNER_CODE_MAX} letters, digits or dashes. It is the end of your link, and it is yours for good.`,
  terms: "A share is paid on a workspace someone other than you brought you onto: made through your link, set up by you and handed to its owner, or one whose owner asked you in before it had paid for a plan. It is paid thirty days after each payment of its plan, and never on a workspace of your own. Chanlytics can pause a partner account, and a workspace's owner can remove you from its team at any time.",
  termsAgree: "I agree to these terms.",
  become: "Become a partner",
  becoming: "Setting you up\u2026",
  linkLabel: "Your link",
  copy: "Copy link",
  copied: "Copied",
  since: (at2) => `A partner since ${new Date(at2).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`,
  paused: "Your partner account is paused. Write to us to have it looked at.",
  closed: "Your partner account is closed.",
  reading: "Reading your partner account\u2026",
  failed: "your partner account",
  /** What the switcher and Team show for a workspace brought this way. */
  role: "Partner",
  earnings: "Earnings",
  workspaces: "Your workspaces",
  open: "Open",
  readingWorkspaces: "Reading your workspaces\u2026",
  failedWorkspaces: "your workspaces",
  noneYet: "Nothing earned yet. A share is written when a workspace you brought pays for its plan.",
  /**
   * The create screen's question when a partner's link brought the person (0012): nobody joins a team without the
   * owner's yes. Their price does not change; the share is Chanlytics'.
   */
  joinAsk: (code2) => `Add ${code2}, who sent you here, to your team as your partner? They set your receptionist up for you, and Chanlytics pays them a share of your plan: your price is the same. You can remove them in Team at any time.`,
  /** What a partner may not do for a business until it pays: the spend doors wait on its plan (maySpend). */
  spend: "Anything that spends a business's money, a phone number or a lead search, waits until its owner pays for a plan.",
  /** The pane's switch for the daily letter (0014). */
  letters: "Email me when something changes in my earnings or my workspaces' standing, at most once a day.",
  lettersFailed: "your email setting"
};
var letterCents = z20.coerce.number();
var letterSum = z20.object({ currency: z20.string(), cents: letterCents });
var PartnerLetterNewsSchema = z20.object({
  /** Ledger rows written since: shares and reversals, per kind and currency, void ones left out. */
  written: z20.array(z20.object({ kind: z20.string(), currency: z20.string(), count: z20.coerce.number(), cents: letterCents })).default([]),
  /** Rows written before the last letter that became payable since. */
  matured: z20.array(letterSum).default([]),
  /** Shares written before that will not be paid: their workspace was disqualified. */
  voided: z20.array(letterSum).default([]),
  paid: z20.array(z20.object({ currency: z20.string(), cents: letterCents, reference: z20.string(), sent_at: z20.string() })).default([]),
  /** A workspace held for review, or a person's decision on one, with the why they wrote for the partner. */
  standing: z20.array(z20.object({ workspace: z20.string().nullable(), standing: z20.string(), why: z20.string().nullable() })).default([]),
  /** Workspaces that came through the link since. */
  brought: z20.array(z20.string().nullable()).default([]),
  /** Workspaces the partner set up whose owner accepted them, or declined them (0016, 00214). */
  accepted: z20.array(z20.string().nullable()).default([]),
  declined: z20.array(z20.string().nullable()).default([]),
  /** The partner's own status, when it changed since. */
  status: z20.object({ status: z20.string(), why: z20.string().nullable() }).nullable().default(null),
  balance: z20.array(
    z20.object({
      currency: z20.string(),
      held: letterCents,
      payable: letterCents,
      paid: letterCents,
      next_payable_at: z20.string().nullable()
    })
  ).default([])
});
var HANDOVER_DAYS = 14;
var ownerEmail = z21.string().trim().toLowerCase().max(254, "That address is too long.").regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter the business owner's email address.");
var HandoverCreateSchema = z21.object({
  name: z21.string().trim().min(2, "A workspace needs a name of at least 2 characters.").max(120, "That name is too long: 120 characters at most."),
  timezone: z21.string().trim().max(64).nullish(),
  email: ownerEmail
}).strict();
var HandoverResendSchema = z21.object({ email: ownerEmail }).strict();
var HANDOVER_WORDS = {
  start: "Set up a workspace for a business",
  intro: `Build it and show it working, then hand it to its owner: they accept it, choose a plan and pay for it, and you stay on the team as their partner. The invitation is open ${HANDOVER_DAYS} days and you can send it again. If nobody accepts it, what you set up goes with the workspace.`,
  nameLabel: "The business's name",
  emailLabel: "Its owner's email",
  emailHint: "They'll be asked to accept it when they sign in with this address.",
  make: "Set it up",
  making: "Setting it up\u2026",
  cancel: "Cancel",
  resend: "Send again",
  resendTo: "Send to",
  resending: "Sending\u2026",
  failed: "the workspace",
  failedResend: "the invitation",
  waiting: "Handed to their owners",
  sentAgain: "Sent again.",
  notSent: "The workspace is set up, but its invitation did not go. Send it again from its row below.",
  unnamed: "A workspace you set up",
  /** The accept screen. */
  title: (workspace) => `${workspace} is ready for you`,
  body: (partnerCode, workspace) => `${partnerCode} set ${workspace} up for you. Accept to become its owner: you'll choose a plan and pay for it, and ${partnerCode} stays on your team as your partner, whom you can remove in Team at any time.`,
  accept: "Accept and open it",
  accepting: "Opening\u2026",
  decline: "Decline",
  declining: "Declining\u2026",
  later: "Not now",
  failedAnswer: "your answer"
};
var PartnerSecondFactorResetSchema = z22.object({
  partner_id: z22.string().uuid("That partner does not exist."),
  why: z22.string().trim().min(1, "Say why, and how you checked it's them.").max(500, "At most 500 characters.")
}).strict();
var PARTNER_INVITE_DAYS = 14;
var PartnerInviteSchema = z23.object({
  code: z23.string().trim().min(1, "Enter your partner's code, or paste their link.").max(200, "That is too long for a partner's code or link.")
}).strict();
var PARTNER_INVITE_WORDS = {
  /** Settings › Team, the owner's card. */
  title: "Your partner",
  intro: `A partner is someone who sets up and runs your receptionist with you: they join your team with the partner role, and never touch billing or the team. Ask one by their code, the end of their link. They have ${PARTNER_INVITE_DAYS} days to accept.`,
  codeLabel: "Their code or link",
  codePlaceholder: "their-code",
  invite: "Ask them",
  inviting: "Asking\u2026",
  withdraw: "Take it back",
  withdrawing: "Taking it back\u2026",
  /** The ask was kept but its email did not go: where the partner sees it, and how to send it again. */
  notSent: "Asked, but their email didn't go. It is on their Partner page when they sign in; to send the email again, take it back and ask again.",
  failed: "your partner",
  failedAnswer: "the invitation",
  /** Settings › Partner, the partner's pane. */
  invitationsTitle: "Workspaces asking for you",
  failedInvitations: "the workspaces asking for you",
  accept: "Join",
  accepting: "Joining\u2026",
  decline: "Decline",
  declining: "Declining\u2026"
};

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
async function recordCarrierOptOut(db, p) {
  const { data, error } = await db.from("contacts").update({
    consent: "opted_out",
    dnc: true,
    consent_source: CARRIER_CONSENT_SOURCE,
    consent_updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", p.contactId).eq("tenant_id", p.tenantId).neq("consent", "opted_out").select("id");
  if (error) throw new Error(`recording the carrier's opt-out for contact ${p.contactId}: ${error.message}`);
  if (!data || data.length === 0) return false;
  const change = { consent: "opted_out", previous: p.previous, source: CARRIER_CONSENT_SOURCE, channel: p.channel };
  await emitEvent(db, p.tenantId, "contact.consent_changed", "contact", "contact", p.contactId, change);
  return true;
}
async function markProcessed(db, tenantId, messageId) {
  const { error } = await db.rpc("mark_processed", {
    p_tenant_id: tenantId,
    p_message_id: messageId
  });
  if (error) throw new Error(`mark_processed: ${error.message}`);
}
async function recordOutbound(db, p) {
  if (p.channel === "email")
    throw new Error("record_outbound: an email's row is written before it is sent, never after");
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
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();
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
  const str2 = (v) => typeof v === "string" && v ? v : null;
  return {
    messageId: data.id,
    from: str2(e.from),
    rfcMessageId: str2(e.message_id),
    references: Array.isArray(e.references) ? e.references.filter((r2) => typeof r2 === "string") : [],
    subject: str2(e.subject)
  };
}
var ANSWERED_LOOKBACK = 50;
async function answeredReachOutEmail(db, p) {
  const { data, error } = await db.from("messages").select("id, meta, status").eq("tenant_id", p.tenantId).eq("conversation_id", p.conversationId).eq("channel", "email").eq("direction", "outbound").order("created_at", { ascending: false }).limit(ANSWERED_LOOKBACK);
  if (error) throw new Error(`email: cannot read the reach-out being answered: ${error.message}`);
  const left = /* @__PURE__ */ new Set(["sent", "delivered", "read"]);
  const sent = (data ?? []).flatMap((m) => {
    const meta = m.meta ?? {};
    if (meta.source !== "reach_out" || !left.has(String(m.status))) return [];
    const req = meta.email?.request ?? {};
    const replyTo = Array.isArray(req.reply_to) && typeof req.reply_to[0] === "string" ? req.reply_to[0] : null;
    return [
      {
        messageId: m.id,
        rfc: typeof meta.email?.message_id === "string" ? meta.email.message_id : null,
        from: typeof req.from === "string" ? req.from : null,
        replyTo
      }
    ];
  });
  const named = new Set(p.references);
  const hit = sent.find((e) => e.rfc !== null && named.has(e.rfc)) ?? sent[0];
  return hit ? { messageId: hit.messageId, from: hit.from, replyTo: hit.replyTo } : null;
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
async function stampEmailLeftAs(db, p) {
  const { data, error } = await db.rpc("stamp_email_left_as", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_left_as: p.leftAs,
    p_why: p.why
  });
  if (error) throw new Error(`stamp_email_left_as: ${error.message}`);
  return data === true;
}
async function sentEmailRequestOf(db, p) {
  return (await sentEmailOf(db, p))?.request ?? null;
}
async function sentEmailOf(db, p) {
  const { data, error } = await db.from("messages").select("meta").eq("id", p.messageId).eq("tenant_id", p.tenantId).eq("channel", "email").eq("direction", "outbound").maybeSingle();
  if (error) throw new Error(`sent email request: ${error.message}`);
  if (!data) return null;
  const meta = data.meta ?? null;
  const lead = meta?.reach_out?.lead_id;
  return { request: meta?.email?.request ?? null, leadId: typeof lead === "string" && lead ? lead : null };
}
async function stampEmailComplaint(db, p) {
  const { data, error } = await db.rpc("stamp_email_complaint", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_at: p.at
  });
  if (error) throw new Error(`stamp_email_complaint: ${error.message}`);
  return data === true;
}
async function recordEmailNo(db, p) {
  const { data, error } = await db.from("messages").select("contact_id, meta").eq("id", p.messageId).eq("tenant_id", p.tenantId).eq("channel", "email").eq("direction", "outbound").maybeSingle();
  if (error) throw new Error(`email receipt: cannot read message ${p.messageId}: ${error.message}`);
  const meta = data?.meta ?? {};
  const from = typeof meta.email?.request?.from === "string" ? meta.email.request.from : null;
  const contactId = data?.contact_id ?? null;
  if (!contactId) return { contactId: null, from };
  const r2 = await db.rpc("set_email_marketing", {
    p_tenant_id: p.tenantId,
    p_contact_id: contactId,
    p_state: "opted_out",
    p_source: p.source,
    p_message_id: p.messageId,
    p_evidence: { channel: "email", via: p.source }
  });
  if (r2.error) throw new Error(`email receipt: cannot record the ${p.source} as a no: ${r2.error.message}`);
  return { contactId, from };
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

// src/repositories/sending-domains.ts
var must = (what, r2) => {
  if (r2.error) throw new Error(`sending_domains: ${what}: ${r2.error.message}`);
  return r2.data;
};
async function sendingDomainsOf(db, tenantId) {
  return must(
    "read a workspace's domains",
    await db.from("sending_domains").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: true })
  ) ?? [];
}
async function sendingDomainOf(db, tenantId, id) {
  return must(
    "read a domain",
    await db.from("sending_domains").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle()
  );
}
async function sendingDomainByHost(db, tenantId, host) {
  return must(
    "read a domain by host",
    await db.from("sending_domains").select("*").eq("tenant_id", tenantId).eq("host", host.trim().toLowerCase()).maybeSingle()
  );
}
async function dueSendingDomains(db, limit) {
  return must(
    "read the due domains",
    await db.from("sending_domains").select("*").in("state", ["verifying", "verified", "held"]).or("held_why.is.null,held_why.neq.complaint").order("checked_at", { ascending: true, nullsFirst: true }).limit(limit)
  ) ?? [];
}
async function coldReceiptsOwed(db, from, to) {
  return must(
    "count the receipts owed",
    await db.rpc("cold_receipts_owed", { p_from: from.toISOString(), p_to: to.toISOString() })
  ) ?? [];
}
async function countSendingDomains(db, tenantId) {
  const r2 = await db.from("sending_domains").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (r2.error) throw new Error(`sending_domains: count a workspace's domains: ${r2.error.message}`);
  return r2.count ?? 0;
}
async function reserveSendingDomain(db, i) {
  const r2 = await db.from("sending_domains").insert({
    tenant_id: i.tenantId,
    host: i.host,
    from_local: i.fromLocal,
    from_name: i.fromName,
    created_by: i.by,
    // Where every domain starts: its records to publish. Said, not left to the column's default.
    state: "records"
  }).select("*").single();
  const code = r2.error?.code;
  if (code === "P0001" && r2.error.hint === "too_many") return { ok: false, reason: "too_many" };
  if (code === "23505") {
    const holder = must(
      "read who holds a host",
      await db.from("sending_domains").select("id, tenant_id, state, created_at, provider_domain_id, provider_status, updated_at, records").eq("host", i.host).maybeSingle()
    );
    return { ok: false, reason: "taken", holder: holder ?? null };
  }
  return { ok: true, row: must("reserve a domain", r2) };
}
async function touchSendingDomain(db, row) {
  return must(
    "touch a domain",
    await db.from("sending_domains").update({ checked_at: row.checked_at }).eq("id", row.id).eq("tenant_id", row.tenant_id).select("*").maybeSingle()
  );
}
async function recordProviderDomain(db, id, p) {
  return must(
    "record the provider's domain",
    await db.from("sending_domains").update({ provider_domain_id: p.providerDomainId, records: p.records, provider_status: p.providerStatus }).eq("id", id).select("*").single()
  );
}
async function applyDomainCheck(db, row, patch) {
  const r2 = await db.from("sending_domains").update(patch).eq("id", row.id).eq("updated_at", row.updated_at).select("*").maybeSingle();
  return must("write a domain's check", r2);
}
async function sendingDomainCounts(db, tenantId, host, since) {
  const r2 = await db.rpc("sending_domain_counts", { p_tenant_id: tenantId, p_host: host, p_since: since });
  const c = must("count a domain's sends", r2) ?? {};
  const n = (k) => typeof c[k] === "number" ? c[k] : Number(c[k] ?? 0) || 0;
  return {
    sent: n("sent"),
    bounced: n("bounced"),
    complained: n("complained"),
    unsubscribed: n("unsubscribed"),
    // A count from before 00188 says none apart: every complaint is taken as new, as it was.
    complained_new: "complained_new" in c ? n("complained_new") : n("complained")
  };
}
async function reputationHoldsSince(db, p) {
  const r2 = await db.from("events").select("id").eq("tenant_id", p.tenantId).eq("kind", "sending_domain.held").gte("created_at", p.sinceIso).eq("data->>host", p.host).in("data->>why", [...p.whys]).limit(20);
  if (r2.error) throw new Error(`sending_domains: read a domain's reputation holds: ${r2.error.message}`);
  return (r2.data ?? []).length;
}
async function platformHoldStands(db, p) {
  const r2 = await db.from("events").select("kind, data, created_at").eq("tenant_id", p.tenantId).in("kind", ["sending_domain.held", "sending_domain.resumed"]).gte("created_at", p.sinceIso).eq("data->>host", p.host).order("created_at", { ascending: false }).limit(20);
  if (r2.error) throw new Error(`sending_domains: read a domain's platform holds: ${r2.error.message}`);
  for (const e of r2.data ?? []) {
    const d = e.data ?? {};
    if (e.kind === "sending_domain.held" && d.resume_by === "platform") return true;
    if (e.kind === "sending_domain.resumed" && d.by === "platform") return false;
  }
  return false;
}
async function deleteSendingDomainAsRead(db, row) {
  const r2 = must(
    "remove a domain as it was read",
    await db.from("sending_domains").delete().eq("tenant_id", row.tenant_id).eq("id", row.id).eq("updated_at", row.updated_at).select("id")
  );
  return (r2 ?? []).length > 0;
}
async function domainHeldSince(db, tenantId, domainId, sinceIso, whys) {
  const r2 = await db.from("events").select("data").eq("tenant_id", tenantId).eq("kind", "sending_domain.held").eq("subject_id", domainId).gte("created_at", sinceIso).limit(20);
  if (r2.error) throw new Error(`sending_domains: read a domain's holds: ${r2.error.message}`);
  return (r2.data ?? []).some((e) => whys.includes(String(e.data?.why ?? "")));
}
async function deleteSendingDomain(db, tenantId, id) {
  const r2 = must(
    "remove a domain",
    await db.from("sending_domains").delete().eq("tenant_id", tenantId).eq("id", id).select("id")
  );
  return (r2 ?? []).length > 0;
}

// src/repositories/outreach.ts
async function outreachFactsOf(db, p) {
  const { data, error } = await db.rpc("outreach_facts", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_to: p.to,
    p_host: p.host,
    p_since: p.since,
    // Named only when there is a lead: a database before 00184 knows five arguments, and a sixth it has never heard of
    // would fail every cold send rather than answer as it did.
    ...p.leadId ? { p_lead_id: p.leadId } : {}
  });
  if (error) throw new Error(`cannot read the outreach facts: ${error.message}`);
  const f = data ?? {};
  if (typeof f.wrote_back !== "boolean")
    throw new Error("cannot read the outreach facts: the database did not say whether this person wrote back");
  return {
    lead_stage: typeof f.lead_stage === "string" ? f.lead_stage : null,
    suppressed: f.suppressed === true,
    wrote_back: f.wrote_back,
    // Absent before 00226: not away, as it was.
    away: f.away === true,
    domain: f.domain && typeof f.domain === "object" && typeof f.domain.state === "string" ? {
      state: f.domain.state,
      from_local: String(f.domain.from_local ?? ""),
      clean_since: typeof f.domain.clean_since === "string" ? f.domain.clean_since : null,
      // A database before 00184 says nothing of it: no days sent, the ramp's first step.
      sent_days: Math.max(0, Number(f.domain.sent_days ?? 0) || 0)
    } : null,
    sent_since: Number(f.sent_since ?? 0) || 0
  };
}
async function addressesSuppressed(db, tenantId, addresses) {
  const asked = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter((a) => a !== ""))];
  if (!asked.length) return /* @__PURE__ */ new Set();
  const { data, error } = await db.rpc("lead_addresses_suppressed", { p_tenant_id: tenantId, p_addresses: asked });
  if (error && missingDoor(error)) return addressesHeldBefore00220(db, tenantId, asked);
  if (error) throw new Error(`cannot read the never-again list: ${error.message}`);
  return new Set((data ?? []).filter((a) => typeof a === "string"));
}
var missingDoor = (e) => e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message);
async function addressesHeldBefore00220(db, tenantId, asked) {
  const byHash = new Map(
    await Promise.all(asked.map(async (a) => [await leadSuppressionHash(tenantId, a), a]))
  );
  const { data, error } = await db.from("lead_suppressions").select("hash").eq("tenant_id", tenantId).eq("kind", "email").in("hash", [...byHash.keys()]);
  if (error) throw new Error(`cannot read the never-again list: ${error.message}`);
  return new Set((data ?? []).flatMap((r2) => byHash.get(r2.hash) ?? []));
}
var textOf = (v) => typeof v === "string" && v !== "" ? v : null;
async function reachOutReplyOf(db, p) {
  const { data, error } = await db.rpc("reach_out_reply_of", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_days: p.days
  });
  if (error && missingDoor(error)) return null;
  if (error) throw new Error(`cannot read whose reply this is: ${error.message}`);
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  const sendId = textOf(o?.send_id);
  const leadId = textOf(o?.lead_id);
  const conversationId = textOf(o?.conversation_id);
  const receivedAt = textOf(o?.received_at);
  if (!o || !sendId || !leadId || !conversationId || !receivedAt) return null;
  const claim = o.claim === "auto_reply" || o.claim === "automated" ? o.claim : "person";
  return {
    send_id: sendId,
    lead_id: leadId,
    lead_contact_id: textOf(o.lead_contact_id),
    lead_email: textOf(o.lead_email),
    lead_website: textOf(o.lead_website),
    lead_website_root: typeof o.lead_website_root === "boolean" ? o.lead_website_root : null,
    answered_message_id: textOf(o.answered_message_id),
    answered_text: textOf(o.answered_text),
    business: textOf(o.business) ?? "",
    chain: textOf(o.chain),
    signed_by: textOf(o.signed_by),
    tz: textOf(o.tz),
    conversation_id: conversationId,
    contact_id: textOf(o.contact_id),
    claim,
    from: textOf(o.from),
    subject: textOf(o.subject),
    text: textOf(o.text),
    received_at: receivedAt
  };
}
async function replyReadingOf(db, p) {
  const { data, error } = await db.from("reach_out_replies").select("intent, claim, summary, unread, rereads, plan, told_at, undone_at, draft, draft_state, draft_why").eq("tenant_id", p.tenantId).eq("message_id", p.messageId).maybeSingle();
  if (error) throw new Error(`cannot read the reply's reading: ${error.message}`);
  return data ?? null;
}
async function markReplyDraft(db, p) {
  const { data, error } = await db.rpc("reach_out_reply_draft", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_state: p.state,
    p_draft: p.draft,
    p_why: p.why
  });
  if (error) throw new Error(`cannot mark the reply's draft: ${error.message}`);
  return data === true;
}
async function takeReplyRead(db, p) {
  const { data, error } = await db.rpc("reach_out_read_take", {
    p_tenant_id: p.tenantId,
    p_cap: p.cap,
    p_at: p.at.toISOString()
  });
  if (error) throw new Error(`cannot take the day's read: ${error.message}`);
  return data === true;
}
async function applyReplyReading(db, p) {
  const { data, error } = await db.rpc("reach_out_reply_apply", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_reading: p.reading,
    p_plan: p.plan,
    p_reread: p.reread,
    p_days: p.days
  });
  if (error) throw new Error(`cannot apply the reply's reading: ${error.message}`);
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return o.applied === true;
}
async function claimReplyTell(db, p) {
  const { data, error } = await db.rpc("reach_out_reply_tell_claim", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_stale_before: p.staleBefore.toISOString()
  });
  if (error) throw new Error(`cannot claim the reply's notice: ${error.message}`);
  return typeof data === "string" && data !== "" ? data : null;
}
async function markReplyTold(db, p) {
  const { error } = await db.rpc("reach_out_reply_told", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_claimed_at: p.claim
  });
  if (error) throw new Error(`cannot mark the reply's notice told: ${error.message}`);
}
var REPLY_LIST_COLUMNS = "message_id, conversation_id, read_at, intent, claim, summary, named_day, refer_to, unread, rereads, undone_at, draft, draft_state, draft_why, plan, until_at, lead_id, send_id";
async function repliesFor(db, p) {
  let q = db.from("reach_out_replies").select(REPLY_LIST_COLUMNS).eq("tenant_id", p.tenantId).gte("read_at", p.since);
  if (p.conversationId) q = q.eq("conversation_id", p.conversationId);
  const { data, error } = await q.order("read_at", { ascending: false }).limit(p.limit);
  if (error) throw new Error(`cannot read the replies: ${error.message}`);
  const rows = data ?? [];
  const ids = (k) => [...new Set(rows.map((r2) => r2[k]).filter((v) => !!v))];
  const [leads, sends] = await Promise.all([
    ids("lead_id").length ? db.from("leads").select("id, business_name").eq("tenant_id", p.tenantId).in("id", ids("lead_id")) : Promise.resolve({ data: [], error: null }),
    ids("send_id").length ? db.from("reach_out_sends").select("id, playbook_id, root_id").eq("tenant_id", p.tenantId).in("id", ids("send_id")) : Promise.resolve({ data: [], error: null })
  ]);
  if (leads.error) throw new Error(`cannot read the replies' leads: ${leads.error.message}`);
  if (sends.error) throw new Error(`cannot read the replies' emails: ${sends.error.message}`);
  const business = new Map((leads.data ?? []).map((l) => [l.id, l.business_name]));
  const step = new Map((sends.data ?? []).map((s) => [s.id, s]));
  return rows.map(({ lead_id, send_id, ...r2 }) => ({
    ...r2,
    business: lead_id && business.get(lead_id) || null,
    playbook_id: send_id && step.get(send_id)?.playbook_id || null,
    root_id: send_id && step.get(send_id)?.root_id || null
  }));
}
async function replyReadingRefOf(db, messageId) {
  const { data, error } = await db.from("reach_out_replies").select("message_id, tenant_id").eq("message_id", messageId).maybeSingle();
  if (error) throw new Error(`cannot read the reply: ${error.message}`);
  return data ? { id: data.message_id, tenant_id: data.tenant_id } : null;
}
async function replyUndoableOf(db, messageId) {
  const { data, error } = await db.rpc("reach_out_reply_undoable", { p_message_id: messageId });
  if (error) throw new Error(`cannot ask whether the reply can be undone: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}
async function undoReplyReading(db, messageId) {
  const { data, error } = await db.rpc("reach_out_reply_undo", { p_message_id: messageId });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}

// src/repositories/reach-out-sheet.ts
var STEP_COLUMNS = "id, name, state, trigger, lead_search_id, after_playbook_id, after_days, gap_minutes, domain_ids, signed_by, include_unconfirmed, template_id, hand, run_hour, last_run_for, created_at";
async function reachOutStepsOf(db, tenantId) {
  const { data, error } = await db.from("playbooks").select(STEP_COLUMNS).eq("tenant_id", tenantId).eq("kind", "reach_out");
  if (error) throw new Error(`cannot read the reach-outs: ${error.message}`);
  return data ?? [];
}
async function reachOutRootOf(db, id) {
  const { data, error } = await db.from("playbooks").select("id, tenant_id, name, state, trigger, lead_search_id").eq("id", id).eq("kind", "reach_out").eq("trigger", "lead_first").maybeSingle();
  if (error) throw new Error(`cannot read the reach-out: ${error.message}`);
  return data;
}
async function reachOutSendRefOf(db, id) {
  const { data, error } = await db.from("reach_out_sends").select("id, tenant_id, broadcast_id, state, reason").eq("id", id).maybeSingle();
  if (error) throw new Error(`cannot read the email: ${error.message}`);
  return data;
}
function emailWordsFrom(row) {
  const part = (type) => {
    for (const c of Array.isArray(row.components) ? row.components : [])
      if (c && typeof c === "object" && String(c.type ?? "").toUpperCase() === type) {
        const t = c.text;
        return typeof t === "string" && t.trim() ? t : null;
      }
    return null;
  };
  const body = part("BODY") ?? (row.body_preview?.trim() || null);
  return body ? { subject: part("HEADER"), body } : null;
}
async function emailWordsByTemplate(db, tenantId, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const { data, error } = await db.from("templates").select("id, components, body_preview").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw new Error(`cannot read the reach-outs' words: ${error.message}`);
  return new Map((data ?? []).map((t) => [t.id, emailWordsFrom(t)]));
}
async function searchNamesByIds(db, tenantId, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const { data, error } = await db.from("lead_searches").select("id, name").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw new Error(`cannot read the searches: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}
async function leadNamesByIds(db, tenantId, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const { data, error } = await db.from("leads").select("id, business_name").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw new Error(`cannot read the leads' names: ${error.message}`);
  return new Map((data ?? []).map((l) => [l.id, l.business_name]));
}
async function handRun(db, p) {
  const { data, error } = await db.rpc("reach_out_hand_run", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    p_run_id: p.runId,
    p_day: p.day,
    p_items: p.items
  });
  if (error) throw new Error(`cannot write the hand step's run: ${error.message}`);
  const r2 = data ?? {};
  return { made: r2.made ?? 0, already: r2.already ?? 0 };
}
async function runsWaitingOf(db, tenantId) {
  const { data, error } = await db.from("broadcasts").select("id, audience").eq("tenant_id", tenantId).eq("state", "pending_approval");
  if (error) throw new Error(`cannot read the runs waiting: ${error.message}`);
  return data ?? [];
}
async function reachOutRunSendsOf(db, tenantId, runId) {
  const { data, error } = await db.from("reach_out_sends").select(
    "id, lead_id, state, reason, hold_detail, opening, angle, send_at, checked_at, created_at, domain_id, lead:leads(business_name, email, city)"
  ).eq("tenant_id", tenantId).eq("broadcast_id", runId);
  if (error) throw new Error(`cannot read the run's emails: ${error.message}`);
  return data ?? [];
}
async function stampReachOutStep(db, id, p) {
  const { error } = await db.from("playbooks").update({ last_run_at: p.at.toISOString(), ...p.runFor ? { last_run_for: p.runFor } : {} }).eq("id", id);
  if (error) throw new Error(`cannot stamp the step's day: ${error.message}`);
}
async function recheckSends(db, p) {
  if (p.ids.length === 0) return 0;
  const { data, error } = await db.rpc("reach_out_recheck", {
    p_send_ids: p.ids,
    p_tenant_id: p.tenantId,
    ...p.fromState ? { p_from_state: p.fromState } : {}
  });
  if (error) throw new Error(`cannot put the sends back to be checked: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
async function outreachModeOf(db, tenantId) {
  const { data, error } = await db.from("policies").select("mode").eq("tenant_id", tenantId).eq("class", "outreach").is("subject_type", null).maybeSingle();
  if (error) throw new Error(`cannot read the outreach mode: ${error.message}`);
  const said = data?.mode;
  return said === "veto" || said === "never" ? said : "ask";
}
async function tenantZoneOf(db, tenantId) {
  const { data, error } = await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
  return error ? null : data?.timezone ?? null;
}
var markOf = (v) => v && typeof v === "object" && !Array.isArray(v) && typeof v.claimed_at === "string" ? { claimed_at: v.claimed_at, ...typeof v.sent_at === "string" ? { sent_at: v.sent_at } : {} } : null;
async function heldNoticeDue(db, p) {
  let sends = db.from("reach_out_sends").select("tenant_id, broadcast_id, reason").eq("state", "held").gte("updated_at", p.since).limit(p.limit);
  if (p.tenantId) sends = sends.eq("tenant_id", p.tenantId);
  const held = await sends;
  if (held.error) throw new Error(`cannot read the held: ${held.error.message}`);
  const byRun = /* @__PURE__ */ new Map();
  for (const s of held.data ?? []) {
    if (!s.broadcast_id) continue;
    const r2 = byRun.get(s.broadcast_id) ?? { held: 0, reasons: /* @__PURE__ */ new Set() };
    r2.held += 1;
    if (s.reason) r2.reasons.add(s.reason);
    byRun.set(s.broadcast_id, r2);
  }
  if (byRun.size === 0) return [];
  const runs = await db.from("broadcasts").select("id, tenant_id, name, state, audience, updated_at").in("id", [...byRun.keys()]).in("state", ["scheduled", "sending"]);
  if (runs.error) throw new Error(`cannot read the held's runs: ${runs.error.message}`);
  return (runs.data ?? []).flatMap((b) => {
    const audience = b.audience && typeof b.audience === "object" && !Array.isArray(b.audience) ? b.audience : {};
    if (audience.kind !== "reach_out") return [];
    const mark = markOf(audience.held_notice);
    if (mark && (mark.sent_at || mark.claimed_at >= p.staleBefore)) return [];
    const r2 = byRun.get(b.id);
    return [
      {
        id: b.id,
        tenant_id: b.tenant_id,
        name: b.name,
        audience,
        updated_at: b.updated_at,
        held: r2.held,
        reasons: [...r2.reasons]
      }
    ];
  });
}
async function markHeldNotice(db, p) {
  let q = db.from("broadcasts").update({ audience: { ...p.audience, held_notice: { ...p.mark } } }).eq("tenant_id", p.tenantId).eq("id", p.id);
  if (p.ifUpdatedAt) q = q.eq("updated_at", p.ifUpdatedAt);
  const { data, error } = await q.select("id");
  if (error) throw new Error(`cannot mark the run: ${error.message}`);
  return (data ?? []).length === 1;
}

// src/repositories/reach-out.ts
async function domainCapacityOf(db, domainId, at) {
  const { data, error } = await db.rpc("sending_domain_capacity", {
    p_domain_id: domainId,
    p_at: at.toISOString()
  });
  if (error) throw new Error(`cannot read the domain's capacity: ${error.message}`);
  const c = data ?? {};
  if (typeof c.used !== "number" || typeof c.sent_days !== "number")
    throw new Error("cannot read the domain's capacity: the database answered without its counts");
  return {
    state: String(c.state ?? ""),
    clean_since: typeof c.clean_since === "string" ? c.clean_since : null,
    sent_days: c.sent_days,
    used: c.used,
    recent: Array.isArray(c.recent) ? c.recent.map(Number).filter(Number.isFinite) : [],
    last_sent_at: typeof c.last_sent_at === "string" ? c.last_sent_at : null
  };
}
async function reachOutAudience(db, p) {
  const { data, error } = await db.rpc("reach_out_audience", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    p_limit: p.limit,
    p_include_unconfirmed: p.includeUnconfirmed
  });
  if (error) throw new Error(`cannot read who a reach-out may write to: ${error.message}`);
  return data ?? [];
}
async function reachOutPerson(db, tenantId, leadId) {
  const { data, error } = await db.rpc("reach_out_person", { p_tenant_id: tenantId, p_lead_id: leadId });
  if (error) throw new Error(`cannot make the person this send is for: ${error.message}`);
  const r2 = data ?? {};
  if (r2.refused === "lead_gone" || r2.refused === "lead_closed" || r2.refused === "no_address" || r2.refused === "already_yours")
    return { ok: false, refused: r2.refused };
  if (!r2.contact_id || !r2.conversation_id)
    throw new Error("cannot make the person this send is for: no person came back");
  return { ok: true, contactId: r2.contact_id, conversationId: r2.conversation_id, made: r2.made === true };
}
async function claimSends(db, p) {
  if (!Number.isInteger(p.cap) || !Number.isInteger(p.limit) || Number.isNaN(p.at.getTime()))
    throw new Error(`cannot claim the domain's due sends: a cap and a limit are whole numbers (${p.cap}, ${p.limit})`);
  const { data, error } = await db.rpc("reach_out_claim", {
    p_domain_id: p.domainId,
    p_cap: p.cap,
    p_at: p.at.toISOString(),
    p_limit: p.limit
  });
  if (error) throw new Error(`cannot claim the domain's due sends: ${error.message}`);
  return data ?? [];
}
async function moveSend(db, p) {
  const { data, error } = await db.from("reach_out_sends").update(p.patch).eq("tenant_id", p.tenantId).eq("id", p.id).eq("state", p.from).select("id");
  if (error) throw new Error(`cannot move the send: ${error.message}`);
  return (data ?? []).length === 1;
}
async function reachOutFollowers(db, p) {
  const { data, error } = await db.rpc("reach_out_followers", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    p_parent_id: p.parentId,
    p_after_days: p.afterDays,
    p_limit: p.limit
  });
  if (error) throw new Error(`cannot read who a step may write to: ${error.message}`);
  const rows = data ?? [];
  for (const r2 of rows)
    if (typeof r2.facts?.wrote_back !== "boolean")
      throw new Error("cannot read who a step may write to: the database did not say whether they wrote back");
  return rows;
}
async function queuedOutcomes(db, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_queued_outcomes", {
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the queued sends: ${error.message}`);
  return data ?? [];
}
async function stuckClaims(db, before, limit, tenantId) {
  let q = db.from("reach_out_sends").select("*").eq("state", "claimed");
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.lt("claimed_at", before.toISOString()).order("claimed_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`cannot read the claimed sends: ${error.message}`);
  return data ?? [];
}
async function staleSends(db, before, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_stale_sends", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the stale sends: ${error.message}`);
  return data ?? [];
}
async function closedRunSends(db, stuckBefore, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_closed_sends", {
    p_stuck_before: stuckBefore.toISOString(),
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the closed runs' sends: ${error.message}`);
  return data ?? [];
}
async function finishableRuns(db, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_finishable", {
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the runs to finish: ${error.message}`);
  return (data ?? []).map(
    (r2) => typeof r2 === "string" ? r2 : String(r2.reach_out_finishable ?? "")
  );
}
async function writtenEmails(db, ids) {
  const out = /* @__PURE__ */ new Set();
  const all = [...new Set(ids)];
  for (let i = 0; i < all.length; i += 100) {
    const { data, error } = await db.from("messages").select("id").in("id", all.slice(i, i + 100));
    if (error) throw new Error(`cannot read the sends' emails: ${error.message}`);
    for (const m of data ?? []) out.add(m.id);
  }
  return out;
}
async function withdrawEmail(db, p) {
  const why = { reason: p.reason };
  const { data, error } = await db.from("messages").update({ status: "canceled", error: why }).eq("tenant_id", p.tenantId).eq("id", p.id).eq("status", "queued").select("id");
  if (error) throw new Error(`cannot withdraw the email: ${error.message}`);
  return (data ?? []).length > 0;
}
async function dueDomains(db, at, limit, opts = {}) {
  const { data, error } = await db.rpc("reach_out_due_domains", {
    p_at: at.toISOString(),
    p_limit: limit,
    ...opts.tenantId ? { p_tenant_id: opts.tenantId } : {},
    p_skip_tenants: [...opts.skipTenants ?? []],
    p_skip_domains: [...opts.skipDomains ?? []]
  });
  if (error) throw new Error(`cannot read the domains with sends due: ${error.message}`);
  return data ?? [];
}
async function monthSent(db, tenantId, at) {
  const { data, error } = await db.rpc("reach_out_month_sent", {
    p_tenant_id: tenantId,
    p_at: at.toISOString()
  });
  if (error) throw new Error(`cannot count the month's cold emails: ${error.message}`);
  if (typeof data !== "number") throw new Error("cannot count the month's cold emails: the database answered no count");
  return data;
}
async function insertQueuedEmail(db, row) {
  const { error } = await db.from("messages").insert(row);
  if (!error) return "written";
  if (error.code === "23505") return "exists";
  throw new Error(`cannot write the email: ${error.message}`);
}
async function writtenEmail(db, p) {
  const { data, error } = await db.from("messages").select("conversation_id, contact_id, status, meta").eq("tenant_id", p.tenantId).eq("id", p.id).maybeSingle();
  if (error) throw new Error(`cannot read the written email: ${error.message}`);
  if (!data) return null;
  const to = data.meta?.email?.request?.to;
  return {
    conversation_id: data.conversation_id,
    contact_id: data.contact_id,
    status: data.status,
    to: Array.isArray(to) && typeof to[0] === "string" ? to[0] : null
  };
}
async function sendJobScheduled(db, p) {
  const { data, error } = await db.from("jobs").select("id").eq("tenant_id", p.tenantId).eq("kind", "outbound_send").eq("payload->>message_id", p.messageId).limit(1);
  if (error) throw new Error(`cannot read the email's job: ${error.message}`);
  return (data ?? []).length > 0;
}
async function sendStanding(db, s) {
  const [run, chain] = await Promise.all([
    db.from("broadcasts").select("state").eq("tenant_id", s.tenant_id).eq("id", s.broadcast_id).maybeSingle(),
    db.from("playbooks").select("id, state, template_id, after_playbook_id, signed_by").eq("tenant_id", s.tenant_id).in("id", [s.playbook_id ?? s.root_id, s.root_id])
  ]);
  if (run.error) throw new Error(`cannot read the send's run: ${run.error.message}`);
  if (chain.error) throw new Error(`cannot read the send's chain: ${chain.error.message}`);
  const step = s.playbook_id ? (chain.data ?? []).find((p) => p.id === s.playbook_id) : void 0;
  return {
    run: run.data?.state ?? null,
    step: step?.template_id ? { state: step.state, template_id: step.template_id, after_playbook_id: step.after_playbook_id } : null,
    root: (chain.data ?? []).find((p) => p.id === s.root_id)?.state ?? null,
    signedBy: (chain.data ?? []).find((p) => p.id === s.root_id)?.signed_by ?? null
  };
}
async function emailWordsOf(db, tenantId, templateId) {
  const { data, error } = await db.from("templates").select("components, body_preview").eq("tenant_id", tenantId).eq("id", templateId).eq("channel", "email").maybeSingle();
  if (error) throw new Error(`cannot read the step's words: ${error.message}`);
  return data ? emailWordsFrom(data) : null;
}
async function workspaceNameAndConfig(db, tenantId) {
  const [t, cfg] = await Promise.all([
    db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (t.error) throw new Error(`cannot read the workspace: ${t.error.message}`);
  if (cfg.error) throw new Error(`cannot read the workspace's configuration: ${cfg.error.message}`);
  return { name: t.data?.name ?? null, config: cfg.data?.config ?? null };
}
async function leadSlotsOf(db, tenantId, leadId) {
  const { data, error } = await db.from("leads").select("business_name, city").eq("tenant_id", tenantId).eq("id", leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead: ${error.message}`);
  return data;
}
async function contactEmailOf(db, tenantId, contactId) {
  const { data, error } = await db.from("contacts").select("email").eq("tenant_id", tenantId).eq("id", contactId).maybeSingle();
  if (error) throw new Error(`cannot read the person: ${error.message}`);
  return data?.email ?? null;
}
async function sendNow(db, p) {
  const { data, error } = await db.from("reach_out_sends").select("state, message_id").eq("tenant_id", p.tenantId).eq("id", p.id).maybeSingle();
  if (error) throw new Error(`cannot read the send: ${error.message}`);
  return data;
}
async function runSending(db, p) {
  const { error } = await db.from("broadcasts").update({ state: "sending" }).eq("tenant_id", p.tenantId).eq("id", p.id).eq("state", "scheduled");
  if (error) throw new Error(`cannot start the run: ${error.message}`);
}
async function parentEmailOf(db, p) {
  const { data: sends, error } = await db.from("reach_out_sends").select("message_id").eq("tenant_id", p.tenantId).eq("root_id", p.rootId).eq("lead_id", p.leadId).eq("playbook_id", p.stepId).eq("state", "sent").order("sent_at", { ascending: false }).limit(1);
  if (error) throw new Error(`cannot read the step before's send: ${error.message}`);
  const id = sends?.[0]?.message_id;
  if (!id) return null;
  const { data: m, error: me } = await db.from("messages").select("id, meta").eq("tenant_id", p.tenantId).eq("id", id).maybeSingle();
  if (me) throw new Error(`cannot read the step before's email: ${me.message}`);
  if (!m) return null;
  const e = m.meta?.email ?? {};
  const refs = e.request?.headers?.References;
  const subject = typeof e.subject === "string" ? e.subject : e.request?.subject;
  return {
    messageId: m.id,
    rfcMessageId: typeof e.message_id === "string" && e.message_id ? e.message_id : null,
    references: typeof refs === "string" ? refs.split(/\s+/).filter(Boolean) : [],
    subject: typeof subject === "string" ? subject : null
  };
}
async function leadAddressBounced(db, p) {
  const { data: lead, error } = await db.from("leads").select("version, email_state, erased_at, blanked_at").eq("tenant_id", p.tenantId).eq("id", p.leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead whose address bounced: ${error.message}`);
  if (!lead || lead.erased_at || lead.blanked_at || lead.email_state === "invalid") return false;
  const { data: moved, error: e2 } = await db.from("leads").update({ email_state: "invalid", email_checked_at: p.at, version: lead.version + 1 }).eq("tenant_id", p.tenantId).eq("id", p.leadId).eq("version", lead.version).select("id");
  if (e2) throw new Error(`cannot mark the lead's address bounced: ${e2.message}`);
  if ((moved ?? []).length === 0) {
    if (p.retried) throw new Error("the lead whose address bounced moved while it was marked");
    return leadAddressBounced(db, { ...p, retried: true });
  }
  return true;
}
async function leadWritten(db, p) {
  const { data: lead, error } = await db.from("leads").select("stage, version, contacted_at").eq("tenant_id", p.tenantId).eq("id", p.leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead a send wrote to: ${error.message}`);
  if (!lead) return false;
  const { data: moved, error: e2 } = await db.from("leads").update({
    stage: lead.stage === "ready" ? "nurture" : lead.stage,
    contacted_at: lead.contacted_at ?? p.at,
    last_outcome: "emailed",
    version: lead.version + 1
  }).eq("tenant_id", p.tenantId).eq("id", p.leadId).eq("version", lead.version).select("id");
  if (e2) throw new Error(`cannot record the lead as written to: ${e2.message}`);
  if ((moved ?? []).length === 0) return p.retried ? false : leadWritten(db, { ...p, retried: true });
  const said = { by: "reach_out", send_id: p.sendId };
  const { error: e3 } = await db.from("events").insert({
    tenant_id: p.tenantId,
    kind: "lead.emailed",
    category: "lead",
    subject_type: "lead",
    subject_id: p.leadId,
    data: said
  });
  if (e3) throw new Error(`cannot record the lead's email: ${e3.message}`);
  return true;
}
var num = (v) => v === null || v === void 0 || v === "" ? null : Number(v);
var text = (v) => typeof v === "string" ? v : null;
function recordOf(r2) {
  return {
    business_name: text(r2.business_name),
    category: text(r2.category),
    city: text(r2.city),
    region: text(r2.region),
    rating: num(r2.rating),
    reviews: num(r2.reviews),
    website_host: text(r2.website_host),
    hours: r2.hours ?? null,
    about: text(r2.about),
    email: text(r2.email),
    why_it_fits: text(r2.why_it_fits),
    what_you_asked: text(r2.what_you_asked),
    site_listings: Number(r2.site_listings ?? 0),
    name_listings: Number(r2.name_listings ?? 0),
    email_domain_shared: r2.email_domain_shared === true
  };
}
async function uncheckedSends(db, p) {
  const { data, error } = await db.rpc("reach_out_unchecked", {
    p_limit: p.limit,
    p_per_workspace: p.perWorkspace,
    p_ahead_minutes: p.aheadMinutes,
    ...p.tenantId ? { p_tenant_id: p.tenantId } : {}
  });
  if (error) throw new Error(`cannot read the sends to check: ${error.message}`);
  return (data ?? []).map((r2) => {
    const send = r2.send;
    return {
      send,
      check_gen: Number(r2.check_gen ?? send.check_gen ?? 0),
      template_id: String(r2.template_id),
      template_language: String(r2.template_language ?? "en"),
      signed_by: text(r2.signed_by),
      included_for: Array.isArray(r2.included_for) ? r2.included_for.filter((x) => typeof x === "string") : [],
      record: recordOf(r2)
    };
  });
}
async function uncheckedWaiting(db, tenantId) {
  let q = db.from("reach_out_sends").select("id").eq("state", "planned").is("checked_at", null);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(`cannot read the sends to check: ${error.message}`);
  return (data ?? []).length > 0;
}
async function reachOutRecord(db, p) {
  const { data, error } = await db.rpc("reach_out_record", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    p_lead_id: p.leadId
  });
  if (error) throw new Error(`cannot read the business's record: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? recordOf(row) : null;
}
async function recordCheck(db, p) {
  const { data, error } = await db.from("reach_out_sends").update({ ...p.patch, check_started_at: null }).eq("tenant_id", p.tenantId).eq("id", p.id).eq("state", "planned").is("checked_at", null).eq("check_gen", p.gen).select("id");
  if (error) throw new Error(`cannot record the send's check: ${error.message}`);
  return (data ?? []).length === 1;
}
async function heldStale(db, before, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_held_stale", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the held sends: ${error.message}`);
  return data ?? [];
}
async function releaseUnavailableHolds(db, p) {
  const { data, error } = await db.rpc("reach_out_release_unavailable", {
    p_before: p.before.toISOString(),
    ...p.tenantId ? { p_tenant_id: p.tenantId } : {}
  });
  if (error) throw new Error(`cannot put the holds back to be checked: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
async function takeCheckAttempt(db, p) {
  const { data, error } = await db.rpc("reach_out_check_take", {
    p_tenant_id: p.tenantId,
    p_cap: p.cap,
    p_at: p.at.toISOString()
  });
  if (error) throw new Error(`cannot take the check's attempt: ${error.message}`);
  return data === true;
}
async function workspaceMaySpend(db, tenantId) {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (tenant.error) throw new Error(`cannot read the workspace: ${tenant.error.message}`);
  if (billing.error) throw new Error(`cannot read the workspace's billing: ${billing.error.message}`);
  if (tenant.data?.status === "paused" || !billing.data) return false;
  return maySpend(billing.data.mode, billing.data.status);
}
async function workspaceAbout(db, tenantId) {
  const { data, error } = await db.from("business_records").select("about").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the business record: ${error.message}`);
  return data?.about?.trim() || null;
}

// src/repositories/notifications.ts
async function forgetNotification(db, p) {
  const { error } = await db.from("notifications").delete().eq("tenant_id", p.tenantId).eq("id", p.id);
  if (error) throw new Error(`cannot take the notification back: ${error.message}`);
}
async function activityTokensOf(db, tenantId, roles) {
  const { data: members, error: me } = await db.from("memberships").select("user_id").eq("tenant_id", tenantId).in("role", [...roles]);
  if (me) throw new Error(`cannot read who is in the workspace: ${me.message}`);
  const people = (members ?? []).map((m) => m.user_id);
  if (!people.length) return [];
  const { data: devices, error: de } = await db.from("push_devices").select("activity_token").in("user_id", people).not("activity_token", "is", null);
  if (de) throw new Error(`cannot read the phones: ${de.message}`);
  return [...new Set((devices ?? []).map((d) => d.activity_token).filter((t) => !!t))];
}
async function forgetActivityTokens(db, tokens) {
  if (!tokens.length) return;
  const { error } = await db.from("push_devices").update({ activity_token: null }).in("activity_token", [...tokens]);
  if (error) throw new Error(`cannot forget the gone activity tokens: ${error.message}`);
}

// src/repositories/routing.ts
var POS_TTL_MS = 5 * MIN_MS;
var NEG_TTL_MS = MIN_MS;
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

// src/repositories/people.ts
var PEOPLE_PAGE = 1e3;
var IDS_PER_READ = 100;
async function namesOfPeople(db, tenantId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db.from("contacts").select("id, display_name, wa_profile_name, phone_e164, email").eq("tenant_id", tenantId).in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`namesOfPeople: ${error.message}`);
    out.push(...data ?? []);
  }
  return out;
}
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
async function callersOf(db, tenantId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db.from("calls").select("id, from_e164, from_raw").eq("tenant_id", tenantId).in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`callersOf: ${error.message}`);
    out.push(...data ?? []);
  }
  return out;
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
async function claimCallActivity(db, tenantId, callId) {
  const { data, error } = await db.from("calls").update({ activity_started_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", callId).eq("tenant_id", tenantId).is("activity_started_at", null).select("id");
  if (error) throw new Error(`claim_call_activity: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
async function callerNameOf(db, tenantId, contactId) {
  const { data, error } = await db.from("contacts").select("display_name, wa_profile_name").eq("tenant_id", tenantId).eq("id", contactId).maybeSingle();
  if (error) throw new Error(`caller_name: ${error.message}`);
  return (data?.display_name || data?.wa_profile_name || "").trim() || null;
}

// src/repositories/thread.ts
var DELIVERED = ["sent", "delivered", "read"];
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
  const since = new Date(Date.now() - DAY_MS).toISOString();
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
    replies: (replies.data ?? []).filter((r2) => !isBackfill(r2) && !isAcknowledgement(r2)).map((r2) => new Date(r2.created_at).getTime())
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
  const withAnswer = await db.from("contacts").select(
    "id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, email, tenants(sells_by)"
  ).eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
  let contact = withAnswer.data ? { ...withAnswer.data, sellsBy: sellsByOf(withAnswer.data.tenants) } : null;
  let cErr = withAnswer.error;
  if (cErr && noSellsBy(cErr.message)) {
    const older = await db.from("contacts").select("id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, email").eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
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
    hasEmail: !!contact.email,
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
    const parts2 = [];
    let used = 0;
    for (const n of lead.noteList) {
      const body = n.body.replace(/\s+/g, " ").trim();
      if (!body) continue;
      const t = Date.parse(n.at);
      const part = Number.isFinite(t) ? `(${clockDate(t, tz, now.getTime())}) ${body}` : body;
      if (parts2.length && used + part.length > NOTES_BUDGET) break;
      parts2.push(part);
      used += part.length + 2;
    }
    return parts2.length ? `Notes from the team about them, newest first (use as facts, never read aloud or quoted): ${parts2.join("; ")}` : null;
  }
  const notes = (lead.notes ?? "").replace(/\s+/g, " ").trim();
  return notes ? `Notes from the owner about them (use as facts, never read aloud or quoted): ${notes}` : null;
}
function describeLead(lead, now = /* @__PURE__ */ new Date(), tz = "UTC") {
  if (!lead.contactId) return "New contact \u2014 no prior history on record.";
  const bits = [];
  bits.push(lead.name ? `Name on record: ${lead.name}.` : "No name on record.");
  if (lead.hasEmail === true) bits.push("Their email address is on file.");
  else if (lead.hasEmail === false) bits.push("No email address on file.");
  if (lead.returning) {
    const days = lead.lastSeenAt ? Math.floor((now.getTime() - new Date(lead.lastSeenAt).getTime()) / DAY_MS) : null;
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
function hitKind(kind) {
  if (kind === "message" || kind === "call") return kind;
  throw new Error(`searchMessages: unknown kind ${kind}`);
}
async function searchMessages(db, tenantId, words2, since, limit) {
  const { data, error } = await db.rpc("search_messages", {
    p_tenant: tenantId,
    p_words: words2,
    p_since: since.toISOString(),
    p_limit: limit
  });
  if (error) throw new Error(`searchMessages: ${error.message}`);
  return (data ?? []).map((r2) => ({
    kind: hitKind(r2.kind),
    id: r2.id,
    conversationId: r2.conversation_id ?? null,
    contactId: r2.contact_id ?? null,
    channel: r2.channel ?? null,
    direction: r2.direction,
    at: r2.at,
    snippet: r2.snippet ?? ""
  }));
}
async function messageSenders(db, tenantId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db.from("messages").select("id, sender, status, type").eq("tenant_id", tenantId).in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`messageSenders: ${error.message}`);
    out.push(...data ?? []);
  }
  return out;
}

// src/repositories/idempotency.ts
var HOLD_COLUMNS = "response, created_at, request_hash";
async function claimIdempotencyKey(db, p) {
  const claimed = await db.from("idempotency_keys").upsert(
    {
      tenant_id: p.tenantId,
      key: p.key,
      route: p.route,
      request_hash: p.requestHash,
      response: null,
      created_at: p.nowIso
    },
    { onConflict: "tenant_id,key", ignoreDuplicates: true }
  ).select("key");
  if (claimed.error) throw new Error(`idempotency claim: ${claimed.error.message}`);
  if ((claimed.data ?? []).length > 0) return { won: true };
  const held = await db.from("idempotency_keys").select(HOLD_COLUMNS).eq("tenant_id", p.tenantId).eq("key", p.key).maybeSingle();
  if (held.error) throw new Error(`idempotency lookup: ${held.error.message}`);
  return { won: false, held: held.data };
}
async function takeIdempotencyKey(db, p) {
  const taken = await db.from("idempotency_keys").update({ request_hash: p.requestHash, response: null, created_at: p.nowIso }).eq("tenant_id", p.tenantId).eq("key", p.key).eq("created_at", p.from).select("key");
  if (taken.error) throw new Error(`idempotency take: ${taken.error.message}`);
  return (taken.data ?? []).length > 0;
}
async function releaseIdempotencyKey(db, p) {
  const released = await db.from("idempotency_keys").delete().eq("tenant_id", p.tenantId).eq("key", p.key).eq("created_at", p.nowIso);
  if (released.error) throw new Error(`idempotency release: ${released.error.message}`);
}
async function keepIdempotencyReceipt(db, p) {
  const kept = await db.from("idempotency_keys").update({ request_hash: p.requestHash, response: p.response }).eq("tenant_id", p.tenantId).eq("key", p.key).eq("created_at", p.stamp).select("key");
  if (kept.error) throw new Error(`idempotency receipt: ${kept.error.message}`);
  return (kept.data ?? []).length > 0;
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
async function readAllRowsByKey(what, key, page, cap = DEFAULT_ROW_CAP, onCapped = (w, c) => console.error("paged_read_capped", JSON.stringify({ what: w, cap: c }))) {
  const out = [];
  let after = null;
  while (out.length < cap) {
    const size = Math.min(MAX_ROWS, cap - out.length);
    const { data, error } = await page(after, size);
    if (error) throw new Error(`${what}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
    after = key(rows[rows.length - 1]);
  }
  onCapped(what, cap);
  return out;
}

// src/repositories/lists.ts
var missingColumn = (message, column) => new RegExp(`\\b${column}\\b`).test(message) && /does not exist|could not find/i.test(message);
var LIST_COLUMNS = ["rule, archived_at", "rule", ""];
async function readWithFallback(read, base) {
  let last = null;
  for (const extra of LIST_COLUMNS) {
    try {
      return await read(extra ? `${base}, ${extra}` : base);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!missingColumn(message, "archived_at") && !missingColumn(message, "rule")) throw e;
      last = e;
    }
  }
  throw last;
}
async function listRows(db, tenantId) {
  const rows = await readWithFallback(
    (columns) => readAllRows(
      "segments",
      (from, to) => (
        // The columns are chosen at run time, past the client's typed parser: the rows are the columns named.
        db.from("segments").select(columns).eq("tenant_id", tenantId).order("name").order("id").range(from, to)
      )
    ),
    "id, name"
  );
  return rows.map((l) => ({ id: l.id, name: l.name, rule: l.rule ?? null, archived_at: l.archived_at ?? null }));
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
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    ids: byList.get(l.id) ?? [],
    rule: l.rule ?? null,
    archived_at: l.archived_at
  }));
}
async function listMemberIds(db, listId) {
  const rows = await readAllRows(
    "segment_members",
    (from, to) => db.from("segment_members").select("contact_id").eq("segment_id", listId).order("contact_id").range(from, to)
  );
  return rows.map((m) => m.contact_id);
}
async function savedListFor(db, tenantId, id) {
  const data = await readWithFallback(async (columns) => {
    const { data: data2, error } = await db.from("segments").select(columns).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (error) throw new Error(`segments: ${error.message}`);
    return data2;
  }, "id, name");
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    ids: data.rule == null ? await listMemberIds(db, data.id) : [],
    rule: data.rule ?? null,
    archived_at: data.archived_at ?? null
  };
}
async function listRow(db, id) {
  const data = await readWithFallback(async (columns) => {
    const { data: data2, error } = await db.from("segments").select(columns).eq("id", id).maybeSingle();
    if (error) throw new Error(`segments: ${error.message}`);
    return data2;
  }, "id, tenant_id, name");
  return data ? {
    id: data.id,
    tenant_id: data.tenant_id,
    name: data.name,
    rule: data.rule ?? null,
    archived_at: data.archived_at ?? null
  } : null;
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
async function archiveList(db, id, at, name) {
  const { data, error } = await db.from("segments").update({ archived_at: at ? at.toISOString() : null, ...name ? { name } : {} }).eq("id", id).select("id");
  return { error, count: data?.length ?? 0 };
}
async function playbooksOnList(db, tenantId, listId) {
  const { data, error } = await db.from("playbooks").select("id, name, state").eq("tenant_id", tenantId).eq("list_id", listId).order("name");
  if (error) {
    if (missingColumn(error.message, "list_id")) return [];
    throw new Error(`playbooks: ${error.message}`);
  }
  return data ?? [];
}
async function deleteList(db, id) {
  const { error, count } = await db.from("segments").delete({ count: "exact" }).eq("id", id);
  return { error, count };
}

// src/repositories/touches.ts
var RUN_IDS_PER_QUERY = 200;
var STOPPED = /* @__PURE__ */ new Set(["canceled", "failed"]);
async function touchesSince(db, tenantId, since, now) {
  return touchesOf(db, tenantId, since, now, false);
}
async function followUpTouchesSince(db, tenantId, since, now) {
  return touchesOf(db, tenantId, since, now, true);
}
var FOLLOW_UP_PARAMS = '[{"kind":"proposal_link"}]';
async function touchesOf(db, tenantId, since, now, followUpsOnly) {
  const [all, zone] = await Promise.all([
    readAllRows("broadcasts", (from, to) => {
      const q = db.from("broadcasts").select("id, playbook_id, state, scheduled_for, created_at, run_for, params").eq("tenant_id", tenantId).gte("created_at", since.toISOString());
      return (followUpsOnly ? q.contains("params", FOLLOW_UP_PARAMS) : q).order("id").range(from, to);
    }),
    db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle().then(
      (r2) => r2.error ? null : r2.data?.timezone || DEFAULT_TIMEZONE,
      () => null
    )
  ]);
  const today = zone ? localDate(zone, now) : null;
  const runs = all.filter(
    (b) => !(b.state === "pending_approval" && today !== null && b.run_for !== null && b.run_for < today)
  );
  const ofRun = new Map(runs.map((b) => [b.id, b]));
  const followUp = new Set(
    runs.filter((b) => parseParamSpecs(b.params).some((s) => s.kind === "proposal_link")).map((b) => b.id)
  );
  const ids = runs.map((b) => b.id);
  const out = [];
  const sinceMs = since.getTime();
  for (let i = 0; i < ids.length; i += RUN_IDS_PER_QUERY) {
    const rows = await readAllRows(
      "broadcast_recipients",
      (from, to) => db.from("broadcast_recipients").select("broadcast_id, contact_id, sent_at, state").eq("tenant_id", tenantId).in("broadcast_id", ids.slice(i, i + RUN_IDS_PER_QUERY)).in("state", ["sent", "queued"]).order("broadcast_id").order("contact_id").range(from, to)
    );
    for (const r2 of rows) {
      const run = ofRun.get(r2.broadcast_id);
      if (!run) continue;
      if (STOPPED.has(run.state) && r2.state !== "sent") continue;
      const at = r2.sent_at ?? run.scheduled_for ?? run.created_at;
      if (Date.parse(at) < sinceMs) continue;
      out.push({
        contact_id: r2.contact_id,
        playbook_id: run.playbook_id,
        at,
        sent: r2.state === "sent",
        held: run.state === "pending_approval",
        follow_up: followUp.has(run.id)
      });
    }
  }
  return out;
}
function touchIndex(touches) {
  const byThis = /* @__PURE__ */ new Map();
  const byAny = /* @__PURE__ */ new Map();
  const followUps = /* @__PURE__ */ new Map();
  for (const t of touches) {
    const at = Date.parse(t.at);
    if (t.playbook_id) {
      const m = byThis.get(t.playbook_id) ?? /* @__PURE__ */ new Map();
      m.set(t.contact_id, Math.max(m.get(t.contact_id) ?? 0, at));
      byThis.set(t.playbook_id, m);
    }
    byAny.set(t.contact_id, Math.max(byAny.get(t.contact_id) ?? 0, at));
    if (t.follow_up) followUps.set(t.contact_id, Math.max(followUps.get(t.contact_id) ?? 0, at));
  }
  return { byThis, byAny, followUps };
}

// src/repositories/deals.ts
async function yesesSince(db, tenantId, since) {
  const rows = await readAllRows(
    "deals",
    (from, to) => db.from("deals").select("id, stage, proposed_at, decided_at").eq("tenant_id", tenantId).in("stage", ["won", "ended"]).gte("decided_at", since.toISOString()).order("id").range(from, to)
  );
  return rows.map((r2) => ({ stage: r2.stage, proposed_at: r2.proposed_at, decided_at: r2.decided_at }));
}

// src/repositories/partner.ts
var PARTNER_COLUMNS = "id, code, status, share_bp, terms_accepted_at, created_at";
var noTable = (message) => /\bpartners\b/.test(message) && /does not exist|could not find|schema cache/i.test(message);
async function getOwnPartner(db) {
  const { data, error } = await db.from("partners").select(PARTNER_COLUMNS).maybeSingle();
  if (error) {
    if (noTable(error.message)) return null;
    throw new Error(`getOwnPartner: ${error.message}`);
  }
  return data;
}
async function getPartnerBroughtCount(db, partnerId) {
  const of = () => db.from("partner_tenants").select("tenant_id", { count: "exact", head: true }).eq("partner_id", partnerId);
  const r2 = await of().or("origin.eq.link,origin.eq.invite,handover_accepted_at.not.is.null");
  if (!r2.error) return r2.count ?? 0;
  if (!/\b(origin|handover_accepted_at)\b/.test(r2.error.message)) return null;
  const older = await of();
  return older.error ? null : older.count ?? 0;
}
async function getPartnerBalance(db) {
  const { data, error } = await db.rpc("partner_balance");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message))
      return [];
    throw new Error(`getPartnerBalance: ${error.message}`);
  }
  return (data ?? []).map((r2) => ({
    currency: r2.currency,
    state: r2.state,
    earned_cents: Number(r2.earned_cents),
    next_payable_at: r2.next_payable_at ?? null
  }));
}
async function getPartnerLetters(db) {
  const { data, error } = await db.from("partners").select("letters").maybeSingle();
  if (error || !data) return null;
  return typeof data.letters === "boolean" ? data.letters : null;
}
async function setPartnerLetters(db, on) {
  const { data, error } = await db.rpc("partner_letters_set", { p_on: on });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, letters: data === true };
}
async function becomePartner(db, code) {
  const { data, error } = await db.rpc("partner_become", { p_code: code });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, row: data };
}
var noFunction = (e) => e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message);
async function getPartnerWorkspaces(db) {
  const [o, m] = await Promise.all([db.rpc("partner_overview"), db.rpc("partner_workspace_money")]);
  for (const r2 of [o, m]) {
    if (r2.error && !noFunction(r2.error)) throw new Error(`getPartnerWorkspaces: ${r2.error.message}`);
  }
  return {
    overview: o.error ? [] : o.data ?? [],
    money: m.error ? [] : (m.data ?? []).map((r2) => ({
      ...r2,
      held_cents: Number(r2.held_cents),
      payable_cents: Number(r2.payable_cents),
      paid_cents: Number(r2.paid_cents),
      month_cents: Number(r2.month_cents)
    }))
  };
}
async function getPlatformPartners(db) {
  const [b, w] = await Promise.all([db.rpc("platform_partner_balances"), db.rpc("platform_partner_workspaces")]);
  for (const r2 of [b, w]) {
    if (r2.error && !noFunction(r2.error)) throw Object.assign(new Error(r2.error.message), { code: r2.error.code });
  }
  return {
    balances: b.error ? [] : (b.data ?? []).map((r2) => ({
      ...r2,
      held_cents: Number(r2.held_cents),
      payable_cents: Number(r2.payable_cents),
      paid_cents: Number(r2.paid_cents)
    })),
    workspaces: w.error ? [] : w.data ?? []
  };
}
async function setPartnerStanding(db, tenantId, standing, why) {
  const { data, error } = await db.rpc("partner_standing_set", {
    p_tenant: tenantId,
    p_standing: standing,
    p_why: why
  });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return {
    ok: true,
    value: data
  };
}
async function markPartnerPaid(db, partnerId, currency, reference, expectedCents) {
  const { data, error } = await db.rpc("partner_payout_mark", {
    p_partner: partnerId,
    p_currency: currency,
    p_reference: reference,
    ...expectedCents === void 0 ? {} : { p_expected_cents: expectedCents }
  });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = data;
  return { ok: true, value: { ...v, total_cents: Number(v.total_cents) } };
}
async function setPartnerStatus(db, partnerId, status, why) {
  const { data, error } = await db.rpc("partner_status_set", { p_partner: partnerId, p_status: status, p_why: why });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: data };
}
async function recordPartnerSecondFactorReset(db, partnerId, why) {
  const { data, error } = await db.rpc("partner_second_factor_reset", { p_partner: partnerId, p_why: why });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: String(data) };
}
async function createWorkspaceForBusiness(db, input) {
  const { data, error } = await db.rpc("create_workspace_for_business", {
    p_name: input.name,
    p_timezone: input.timezone ?? "",
    p_owner_email: input.ownerEmail
  });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "", message: "The workspace was not made." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name } };
}
async function resendHandover(db, tenantId, email) {
  const { data, error } = await db.rpc("partner_handover_resend", { p_tenant: tenantId, p_email: email });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = data ?? {};
  return {
    ok: true,
    value: { email: String(v.email ?? email), sentAt: String(v.sent_at ?? ""), expiresAt: String(v.expires_at ?? "") }
  };
}
async function getOpenHandovers(db) {
  const { data, error } = await Promise.resolve().then(() => db.rpc("handovers_mine")).catch((e) => ({ data: null, error: { code: "", message: e instanceof Error ? e.message : String(e) } }));
  if (error) return { handovers: [], error: noFunction(error) ? null : error.message };
  return {
    handovers: (data ?? []).map((r2) => ({
      tenantId: r2.tenant_id,
      workspace: r2.workspace,
      partnerCode: r2.partner_code,
      expiresAt: r2.expires_at
    })),
    error: null
  };
}
async function acceptHandover(db, tenantId) {
  const { data, error } = await db.rpc("handover_accept", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "P0002", message: "There is no workspace waiting for you there." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name } };
}
async function declineHandover(db, tenantId) {
  const { error } = await db.rpc("handover_decline", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: null };
}
async function getPartnerHandovers(db) {
  const { data, error } = await db.from("partner_tenants").select(
    "tenant_id, handover_email, handover_sent_at, handover_expires_at, handover_accepted_at, handover_declined_at, tenants(name)"
  ).eq("origin", "handover").order("handover_sent_at", { ascending: false });
  if (error) {
    if (/\b(origin|handover_\w+)\b/.test(error.message) && /does not exist|could not find/i.test(error.message))
      return [];
    throw new Error(`getPartnerHandovers: ${error.message}`);
  }
  return (data ?? []).map((r2) => ({
    tenantId: r2.tenant_id,
    name: r2.tenants?.name ?? null,
    email: r2.handover_email ?? "",
    sentAt: r2.handover_sent_at ?? "",
    expiresAt: r2.handover_expires_at ?? "",
    acceptedAt: r2.handover_accepted_at,
    declinedAt: r2.handover_declined_at
  }));
}
async function getHandoverInvite(db, tenantId) {
  const { data, error } = await db.from("partner_tenants").select(
    "handover_email, handover_expires_at, handover_accepted_at, handover_declined_at, tenants(name), partners(code)"
  ).eq("tenant_id", tenantId).eq("origin", "handover").maybeSingle();
  if (error) throw new Error(`getHandoverInvite: ${error.message}`);
  if (!data?.handover_email || !data.handover_expires_at) return null;
  if (data.handover_accepted_at || data.handover_declined_at) return null;
  if (Date.parse(data.handover_expires_at) <= Date.now()) return null;
  return {
    email: data.handover_email,
    workspace: data.tenants?.name ?? "",
    partnerCode: data.partners?.code ?? "",
    expiresAt: data.handover_expires_at
  };
}
async function invitePartner(db, tenantId, code) {
  const { data, error } = await db.rpc("partner_invite", { p_tenant: tenantId, p_code: code });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = data ?? {};
  return {
    ok: true,
    value: { code: String(v.code ?? code), sentAt: String(v.sent_at ?? ""), expiresAt: String(v.expires_at ?? "") }
  };
}
async function withdrawPartnerInvite(db, tenantId) {
  const { error } = await db.rpc("partner_invite_withdraw", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: null };
}
async function getWorkspacePartner(db, tenantId) {
  const { data, error } = await db.rpc("workspace_partner", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = data ?? {};
  const p = v.partner ?? null;
  const i = v.invitation ?? null;
  return {
    ok: true,
    value: {
      partner: p ? {
        code: String(p.code ?? ""),
        origin: String(p.origin ?? ""),
        since: String(p.since ?? ""),
        seated: p.seated === true
      } : null,
      invitation: i ? {
        code: String(i.code ?? ""),
        sentAt: String(i.sent_at ?? ""),
        expiresAt: String(i.expires_at ?? ""),
        declinedAt: i.declined_at ? String(i.declined_at) : null
      } : null
    }
  };
}
async function getPartnerInvitations(db) {
  const { data, error } = await db.rpc("partner_invitations_mine");
  if (error) {
    if (noFunction(error)) return [];
    throw new Error(`getPartnerInvitations: ${error.message}`);
  }
  return (data ?? []).map((r2) => ({
    tenantId: r2.tenant_id,
    workspace: r2.workspace,
    sentAt: r2.sent_at,
    expiresAt: r2.expires_at
  }));
}
async function acceptPartnerInvite(db, tenantId) {
  const { data, error } = await db.rpc("partner_invite_accept", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "P0002", message: "There is no invitation for you there." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name, earns: row.earns } };
}
async function declinePartnerInvite(db, tenantId) {
  const { error } = await db.rpc("partner_invite_decline", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: null };
}
async function getPartnerInviteMail(db, tenantId) {
  const { data, error } = await db.from("partner_invitations").select("expires_at, declined_at, tenants(name), partners(code, user_id)").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`getPartnerInviteMail: ${error.message}`);
  if (!data || data.declined_at || Date.parse(data.expires_at) <= Date.now()) return null;
  const userId = data.partners?.user_id;
  if (!userId) return null;
  const who = await db.auth.admin.getUserById(userId);
  if (who.error) throw new Error(`getPartnerInviteMail: ${who.error.message}`);
  const email = who.data.user?.email;
  if (!email) return null;
  return {
    email,
    workspace: data.tenants?.name ?? "",
    partnerCode: data.partners?.code ?? "",
    expiresAt: data.expires_at
  };
}

// src/repositories/leads.ts
var ONE_LEAD_COLUMNS = "id, tenant_id, place_id, business_name, category, street, city, region, postal_code, neighborhood, lat, lng, mark_path, website_host, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, email_checked_at, rating, reviews, stage, closed_reason, last_outcome, last_note, about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank, contact_id, contacted_at, converted_at, exported_at, found_at, version, blanked_at, erased_at";
var str = (v) => typeof v === "string" ? v : null;
function memberOf(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = str(data.id);
  const searchId = str(data.search_id);
  const cls = str(data.class);
  if (!id || !searchId || !cls) return null;
  return {
    id,
    search_id: searchId,
    class: cls,
    excluded_by: str(data.excluded_by),
    fit: str(data.fit),
    reason: str(data.reason) ?? "",
    distance_m: typeof data.distance_m === "number" ? data.distance_m : null,
    counted: data.counted === true,
    judgment: data.judgment ?? null
  };
}
async function readLeadOne(db, tenantId, leadId, searchId) {
  const [l, m, places] = await Promise.all([
    db.from("leads").select(ONE_LEAD_COLUMNS).eq("id", leadId).eq("tenant_id", tenantId).maybeSingle(),
    db.rpc("lead_member_of", {
      p_tenant_id: tenantId,
      p_lead_id: leadId,
      ...searchId ? { p_search_id: searchId } : {}
    }),
    db.from("lead_places").select("id", { count: "exact", head: true }).eq("lead_id", leadId)
  ]);
  if (l.error) throw new Error(`readLeadOne: ${l.error.message}`);
  if (m.error) throw new Error(`lead_member_of: ${m.error.message}`);
  if (places.error) throw new Error(`readLeadOne: ${places.error.message}`);
  const lead = l.data;
  const member = memberOf(m.data);
  if (!lead || lead.tenant_id !== tenantId || lead.blanked_at || lead.erased_at || !member) return null;
  return { lead, member, places: places.count ?? 1 };
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
  { table: "sending_domains", event: "*" },
  // a domain added, checked, verified or held by the ten-minute clock: Connections repaints (00175)
  // a round's page committed, a check landed, a class changed: the Leads scope repaints (00140)
  { table: "leads", event: "*" },
  { table: "lead_searches", event: "*" },
  { table: "lead_rounds", event: "*" },
  { table: "lead_search_members", event: "*" },
  // a deal recorded or moved by a teammate, or by a payment: People (and its Pipeline) repaints (00156, 0008)
  { table: "deals", event: "*" },
  // a note written, a step set or done by a teammate: People's next steps and a person's page repaint (00157, 00166)
  { table: "person_notes", event: "*" },
  // a list made, renamed, archived, or people put on and taken off by a teammate: People's rail repaints (00169)
  { table: "segments", event: "*" },
  { table: "segment_members", event: "*" },
  // a reply to a reach-out read, drafted or undone: the Inbox's strip and chip repaint (00222)
  { table: "reach_out_replies", event: "*" }
];
function watchedTables() {
  return WATCHED.map((w) => w.table);
}
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
  IDS_PER_READ,
  MAX_ROWS,
  PEOPLE_PAGE,
  acceptHandover,
  acceptPartnerInvite,
  activityTokensOf,
  addToList,
  addressesSuppressed,
  answeredReachOutEmail,
  applyDomainCheck,
  applyReplyReading,
  archiveList,
  assembleHistory,
  becomePartner,
  callerNameOf,
  callersOf,
  claimCallActivity,
  claimCallNotification,
  claimControl,
  claimIdempotencyKey,
  claimReplyTell,
  claimSends,
  closedRunSends,
  coldReceiptsOwed,
  contactEmailOf,
  countSendingDomains,
  countSentToday,
  createList,
  createServiceClient,
  createWorkspaceForBusiness,
  declineHandover,
  declinePartnerInvite,
  deleteList,
  deleteSendingDomain,
  deleteSendingDomainAsRead,
  describeLead,
  domainCapacityOf,
  domainHeldSince,
  dropFromList,
  dueDomains,
  dueSendingDomains,
  emailWordsByTemplate,
  emailWordsFrom,
  emailWordsOf,
  emitEvent,
  everyoneIn,
  finishableRuns,
  followUpTouchesSince,
  forgetActivityTokens,
  forgetNotification,
  getHandoverInvite,
  getOpenHandovers,
  getOwnPartner,
  getPartnerBalance,
  getPartnerBroughtCount,
  getPartnerHandovers,
  getPartnerInvitations,
  getPartnerInviteMail,
  getPartnerLetters,
  getPartnerWorkspaces,
  getPlatformPartners,
  getTenantConfig,
  getWorkspacePartner,
  handRun,
  heldNoticeDue,
  heldStale,
  ingestCall,
  ingestInbound,
  ingestInboundEmail,
  insertQueuedEmail,
  invitePartner,
  keepIdempotencyReceipt,
  lastInboundEmail,
  leadAddressBounced,
  leadNamesByIds,
  leadSlotsOf,
  leadWritten,
  linkCallMessage,
  listMemberIds,
  listPolicies,
  listRow,
  mailboxById,
  mailboxFor,
  mailboxOfTenant,
  markHeldNotice,
  markPartnerPaid,
  markProcessed,
  markReplyDraft,
  markReplyTold,
  messageSenders,
  monthSent,
  moveSend,
  namesOfPeople,
  notesForReceptionist,
  outreachFactsOf,
  outreachModeOf,
  parentEmailOf,
  pauseConversation,
  peoplePage,
  personReplyMode,
  platformHoldStands,
  playbooksOnList,
  putTenantConfig,
  queuedOutcomes,
  reachOutAudience,
  reachOutFollowers,
  reachOutPerson,
  reachOutRecord,
  reachOutReplyOf,
  reachOutRootOf,
  reachOutRunSendsOf,
  reachOutSendRefOf,
  reachOutStepsOf,
  readAllRows,
  readAllRowsByKey,
  readDealForPhone,
  readLeadContext,
  readLeadOne,
  readThreadState,
  recheckSends,
  recordCallNote,
  recordCarrierOptOut,
  recordCheck,
  recordEchoAndPause,
  recordEmailNo,
  recordEmailStatus,
  recordOutbound,
  recordPartnerSecondFactorReset,
  recordProviderDomain,
  recordStatusByExternalId,
  releaseControl,
  releaseIdempotencyKey,
  releaseUnavailableHolds,
  renameList,
  repliesFor,
  replyReadingOf,
  replyReadingRefOf,
  replyUndoableOf,
  reputationHoldsSince,
  resendHandover,
  reserveSendingDomain,
  resolveChannel,
  resolveChannelDetailed,
  resolveOutboundTarget,
  runSending,
  runsWaitingOf,
  savedListFor,
  savedListsFor,
  searchMessages,
  searchNamesByIds,
  sendJobScheduled,
  sendNow,
  sendStanding,
  sendingDomainByHost,
  sendingDomainCounts,
  sendingDomainOf,
  sendingDomainsOf,
  sentEmailOf,
  sentEmailRequestOf,
  sentEmailWithMessageId,
  setCallRecording,
  setListRule,
  setPartnerLetters,
  setPartnerStanding,
  setPartnerStatus,
  setPersonReplyMode,
  setPolicyMode,
  staleSends,
  stampEmailComplaint,
  stampEmailLeftAs,
  stampEmailSent,
  stampMailboxReceived,
  stampReachOutStep,
  stuckClaims,
  subscribeMessagesInserts,
  suppressEmailOf,
  takeCheckAttempt,
  takeIdempotencyKey,
  takeReplyRead,
  templatesFor,
  tenantZoneOf,
  touchIndex,
  touchSendingDomain,
  touchesSince,
  uncheckedSends,
  uncheckedWaiting,
  undoReplyReading,
  watchedTables,
  withdrawEmail,
  withdrawPartnerInvite,
  workspaceAbout,
  workspaceMaySpend,
  workspaceNameAndConfig,
  writtenEmail,
  writtenEmails,
  yesesSince
};
