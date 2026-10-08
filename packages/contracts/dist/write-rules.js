// src/zod-config.ts
import { config } from "zod/v4/core";
config({ jitless: true });

// src/shared/time.ts
var MIN_MS = 6e4;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
function formatterOnUse(locales, options) {
  let built = null;
  return { format: (date) => (built ??= new Intl.DateTimeFormat(locales, options)).format(date) };
}
var DATE_FMT = formatterOnUse([], { month: "short", day: "numeric" });

// src/calendar/feed-url.ts
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

// src/shared/email-address.ts
var LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
var LOCAL = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
var SHAPE = new RegExp(`^(${LOCAL})@(${LABEL}(?:\\.${LABEL})+)$`);

// src/calendar/booking-notice.ts
var BOOKING_TOOLS = [
  { tool: "booksy", name: "Booksy", domains: ["booksy.com"], calendar: "none" },
  { tool: "acuity", name: "Acuity", domains: ["acuityscheduling.com", "squarespacescheduling.com"], calendar: "own" },
  { tool: "fresha", name: "Fresha", domains: ["fresha.com"], calendar: "own" },
  { tool: "square", name: "Square", domains: ["squareup.com", "square.com"], calendar: "writes" },
  { tool: "vagaro", name: "Vagaro", domains: ["vagaro.com"], calendar: "writes" },
  { tool: "glossgenius", name: "GlossGenius", domains: ["glossgenius.com"], calendar: "own" },
  { tool: "calendly", name: "Calendly", domains: ["calendly.com"], calendar: "writes" },
  { tool: "setmore", name: "Setmore", domains: ["setmore.com"], calendar: null },
  { tool: "mindbody", name: "Mindbody", domains: ["mindbodyonline.com"], calendar: null },
  { tool: "simplybook", name: "SimplyBook", domains: ["simplybook.me"], calendar: null },
  { tool: "schedulicity", name: "Schedulicity", domains: ["schedulicity.com"], calendar: null },
  { tool: "styleseat", name: "StyleSeat", domains: ["styleseat.com"], calendar: null }
];
var isBookingTool = (v) => BOOKING_TOOLS.some((t) => t.tool === v);
var NOTICE_LENGTH_MAX_MS = 12 * HOUR_MS;
var NOTICE_TIME_REACH_MS = 400 * DAY_MS;
var SAME_VISIT_MS = 15 * MIN_MS;

// src/config/workspace-config/config-schema.ts
import { z as z3 } from "zod";

// src/config/unknown-keys.ts
var isJsonObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function keysLeftOut(raw, kept, at = []) {
  if (Array.isArray(raw) && Array.isArray(kept)) {
    return raw.flatMap((v, i) => i < kept.length ? keysLeftOut(v, kept[i], [...at, i]) : []);
  }
  if (!isJsonObject(raw) || !isJsonObject(kept)) return [];
  return Object.entries(raw).flatMap(([k, v]) => {
    if (v === void 0) return [];
    return Object.hasOwn(kept, k) ? keysLeftOut(v, kept[k], [...at, k]) : [[...at, k]];
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

// src/config/workspace-config/brain-config-schema.ts
import { z as z2 } from "zod";

// src/config/workspace-config/business-profile.ts
import { z } from "zod";

// src/config/workspace-config/config-rules.ts
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
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
function isRealDate(key) {
  const at = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === key;
}
var MAX_INTERVALS_PER_DAY = 4;
var MAX_CLOSURES = 60;
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
var E164 = /^\+[1-9]\d{6,14}$/;
var INSTRUCTIONS_MAX = 2e4;
var BOOKING_LINK_MAX = 500;
var PROFILE_LIMITS = {
  tone: 200,
  services: 60,
  serviceName: 80,
  serviceMinutes: 1440,
  servicePrice: 120,
  languages: 8,
  languageMin: 2,
  languageMax: 40,
  reasons: 20,
  reason: 200,
  consultFirst: 20,
  consultFirstLine: 80,
  ruleNotes: 10,
  ruleNote: 200,
  notes: 10,
  noteTitle: 80,
  noteText: 1200,
  closureNote: 200,
  closures: MAX_CLOSURES,
  shifts: MAX_INTERVALS_PER_DAY,
  instructions: INSTRUCTIONS_MAX,
  message: 2e3
};
var BOOKING_RULE_BOUNDS = {
  /** Least notice for a slot, in hours. */
  lead_hours: { min: 0, max: 168 },
  /** The shortest window worth naming, in minutes. */
  slot_min: { min: 15, max: 240 },
  /** Gap kept around each existing appointment, in minutes. */
  buffer_min: { min: 0, max: 120 },
  /** How far ahead open times are offered, in days. */
  max_days_ahead: { min: 1, max: 90 },
  party_max: { min: 1, max: 20 }
};

// src/config/workspace-config/business-profile.ts
var TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema = z.object({ open: TIME, close: TIME });
var HoursSchema = z.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME.nullable().optional(),
  close: TIME.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: z.array(IntervalSchema).optional()
}).strip();
var DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema = z.object({
  date: DATE,
  until: DATE.optional(),
  note: z.string().max(PROFILE_LIMITS.closureNote).optional()
});
var ServiceSchema = z.object({
  name: z.string().min(1).max(PROFILE_LIMITS.serviceName),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: z.number().int().min(1).max(PROFILE_LIMITS.serviceMinutes).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: z.string().max(PROFILE_LIMITS.servicePrice).optional()
}).strip();
var GuardrailsSchema = z.object({
  never_quote_prices: z.boolean().optional(),
  never_confirm_booking: z.boolean().optional(),
  disclose_ai: z.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: z.boolean().optional()
}).strip();
var NoteSchema = z.object({
  title: z.string().min(1).max(PROFILE_LIMITS.noteTitle),
  text: z.string().min(1).max(PROFILE_LIMITS.noteText)
}).strip();
var rule = (key) => z.number().int().min(BOOKING_RULE_BOUNDS[key].min).max(BOOKING_RULE_BOUNDS[key].max).optional();
var BookingRulesSchema = z.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: rule("lead_hours"),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: rule("buffer_min"),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: rule("max_days_ahead"),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: rule("slot_min"),
  /** Services that need a consultation before they can be booked. */
  consult_first: z.array(z.string().min(1).max(PROFILE_LIMITS.consultFirstLine)).max(PROFILE_LIMITS.consultFirst).optional(),
  party_max: rule("party_max"),
  /**
   * Ask, once, for an email when sending the booking link -- for the confirmation, and for the campaigns that follow
   * (Part 0 of the campaigns-on-every-channel spec). Absent = no.
   */
  ask_email: z.boolean().optional(),
  /** Anything else about booking, one short line each. */
  notes: z.array(z.string().min(1).max(PROFILE_LIMITS.ruleNote)).max(PROFILE_LIMITS.ruleNotes).optional()
}).strip();
var BusinessProfileSchema = z.object({
  address: z.string().max(300).optional(),
  hours: z.partialRecord(z.enum(DAYS), HoursSchema).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: z.array(ClosureSchema).optional(),
  services: z.array(ServiceSchema).max(PROFILE_LIMITS.services).optional(),
  languages: z.array(z.string().min(PROFILE_LIMITS.languageMin).max(PROFILE_LIMITS.languageMax)).max(PROFILE_LIMITS.languages).optional(),
  guardrails: GuardrailsSchema.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: z.array(z.string().min(1).max(PROFILE_LIMITS.reason)).max(PROFILE_LIMITS.reasons).optional(),
  tone: z.string().max(PROFILE_LIMITS.tone).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: z.string().regex(E164, "E.164, like +12125550143").optional(),
  website: z.string().url().max(500).optional(),
  notes: z.array(NoteSchema).max(PROFILE_LIMITS.notes).optional(),
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
  extra_instructions: z.string().max(PROFILE_LIMITS.instructions).optional()
}).strip();

// src/config/workspace-config/brain-config-schema.ts
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
  /**
   * Where a customer books. Optional since the first run's decision 2 (24 Sep 2026): a business that quotes each
   * job has none, and its receptionist takes the customer's details instead (no-booking-link.ts). Who is asked for
   * one is the pages' question, by how customers buy (deals.ts bookingLinkOptional): the config cannot see it.
   */
  booking_link: z2.string().url().max(BOOKING_LINK_MAX).optional(),
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
    greeting: z2.string().min(1).max(PROFILE_LIMITS.message),
    /** Sent when the model call failed. */
    error: z2.string().min(1).max(PROFILE_LIMITS.message),
    /** Sent for voice notes / photos before escalating. */
    non_text: z2.string().min(1).max(PROFILE_LIMITS.message)
  }).strip()
}).strip();

// src/config/workspace-config/config-schema.ts
var NotificationsConfigSchema = z3.object({
  escalation_emails: z3.array(z3.string().email()).min(1).max(10),
  from: z3.string().max(200).optional()
}).strip();
var CalendarConfigSchema = z3.object({
  ical_url: z3.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strip();
var BookingsConfigSchema = z3.object({ tool: z3.string().max(40).optional(), by_hand: z3.boolean().optional() }).strip();
var FeaturesConfigSchema = z3.object({ vision: z3.boolean().optional() }).strip();
var TenantConfigSchema = z3.object({
  brain: BrainConfigSchema.optional(),
  notifications: NotificationsConfigSchema.optional(),
  calendar: CalendarConfigSchema.optional(),
  bookings: BookingsConfigSchema.optional(),
  features: FeaturesConfigSchema.optional()
});
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
  const at = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate(c.date)) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: at("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate(c.until)) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: at("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: at("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var WriteRules = TenantConfigSchema.superRefine((cfg, ctx) => {
  if (cfg.calendar && !feedUrlOk(cfg.calendar.ical_url)) {
    ctx.addIssue({
      code: z3.ZodIssueCode.custom,
      path: ["calendar", "ical_url"],
      message: feedProblemWords("address") ?? "Not an address the receptionist may read."
    });
  }
  if (cfg.bookings?.tool !== void 0 && !isBookingTool(cfg.bookings.tool)) {
    ctx.addIssue({
      code: "custom",
      path: ["bookings", "tool"],
      message: "Not a booking tool this product knows."
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
var TenantConfigWriteSchema = z3.unknown().superRefine((raw, ctx) => refuseUnknownFields(TenantConfigSchema, raw, ctx)).pipe(WriteRules);

// src/workspace/signup-schema.ts
import { z as z4 } from "zod";

// src/workspace/signup.ts
var SIGNUP_NAME_MIN = 2;
var SIGNUP_NAME_MAX = 120;

// src/workspace/workspace.ts
function isTimezone(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}

// src/workspace/signup-schema.ts
var InviteCodeSchema = z4.string().trim().max(80);
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
  code: InviteCodeSchema.optional()
}).strict();
var PendingWorkspaceSchema = z4.object({
  name: z4.string().trim().min(SIGNUP_NAME_MIN).max(SIGNUP_NAME_MAX),
  // A clock Postgres would refuse is dropped here, so the owner's first Create
  // never fails over a zone a stranger's device reported.
  timezone: z4.string().trim().min(1).max(64).nullish().transform((v) => v && isTimezone(v) ? v : null)
});
export {
  SignupSchema,
  TenantConfigWriteSchema
};
