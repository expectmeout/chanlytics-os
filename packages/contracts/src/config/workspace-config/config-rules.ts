/**
 * The config's numbers, and the rules a value is judged by without a schema: the week's days and their names, a real
 * date, what is wrong with a day, the E.164 pattern, which guardrails are in force, and every cap the profile, the
 * booking rules and the receptionist's messages are saved under.
 *
 * The schemas are built from these numbers (business-profile.ts, brain-config-schema.ts, config-schema.ts), and the
 * Business tab's limits, refusals and hints read the same ones, so a cap is written once and the page cannot offer
 * more than the save takes. zod is not built into the browser's contracts (decision 0024, the browser's entry): a page
 * that says a limit or judges a day loads none of it.
 */
import type { Hours } from "./business-profile";

/* ------------------------------------------------------------------ the week */

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** A day of the week by its whole name, the one table: the write rules', the composer's and the first run's. */
export const DAY_NAMES: Record<(typeof DAYS)[number], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
const DAY_NAME: Record<string, string> = DAY_NAMES;

/** Does this string name a real day? "2026-11-31" does not. */
export function isRealDate(key: string): boolean {
  const at = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === key;
}

/** The most shifts one day may be split into. Must match the editor's cap. */
export const MAX_INTERVALS_PER_DAY = 4;
/** As many closures as the composer will state — there is no render cap. */
export const MAX_CLOSURES = 60;

/**
 * What is wrong with one day of the week, in the owner's words, each with where in the day it is. The write rules'
 * day check (config-schema.ts checkDay) and anything that builds a day from elsewhere (google.ts hoursFromGoogle) ask
 * this, so a day is judged by one set of rules wherever it comes from. Empty when the day is one the record holds.
 */
export function dayProblems(h: Hours, day: string): Array<{ path: Array<string | number>; message: string }> {
  const name = DAY_NAME[day] ?? day;
  const out: Array<{ path: Array<string | number>; message: string }> = [];
  const open = h.open ?? undefined;
  const close = h.close ?? undefined;
  if (!!open !== !!close) {
    out.push({
      path: [open ? "close" : "open"],
      message: `${name} needs both an opening and a closing time, or neither.`,
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
  // Overlap, not adjacency. Two shifts that TOUCH — 09:00-13:00 and
  // 13:00-19:00 — are an ordinary two-stylist day, and rejecting them would
  // refuse a legitimate entry. Compared on sorted copies so the owner is not
  // told their day is wrong merely because they typed the afternoon first.
  const sorted = [...iv].sort((a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : 0));
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      out.push({ path: ["intervals", n, "open"], message: `${name}: two shifts overlap.` });
    }
  }
  return out;
}

/* ------------------------------------------------------------- the numbers */

/** E.164: a plus, then 7–15 digits, no leading zero. */
export const E164 = /^\+[1-9]\d{6,14}$/;

/** Whether a value is a number written in E.164, by that pattern. */
export const isE164 = (s: unknown): s is string => typeof s === "string" && E164.test(s);

/**
 * The most either set of the receptionist's instructions holds: the prompt a
 * workspace wrote before it had fields, and the owner's own instructions that
 * prompt is carried into. One number, so a carried prompt always fits. The
 * owner's held 8,000 characters against the prompt's 20,000, and a longer
 * prompt failed every save of the form on a box nobody had touched (the
 * wiring audit's S4).
 */
export const INSTRUCTIONS_MAX = 20_000;

/** The longest booking link the config keeps, and so the longest booking page (google/booking-page.ts). */
export const BOOKING_LINK_MAX = 500;

/** The owner's goal in their own words, at most this long: what Ask weighs every plan against (the operator, 15 Oct 2026). */
export const ASK_GOAL_MAX = 200;

/** Everything `PROFILE_LIMITS` holds a number for; `profileRefusal` (business-tab/fold-limits.ts) says what each one refuses in. */
export type ProfileLimitKey =
  | "tone"
  | "services"
  | "serviceName"
  | "serviceMinutes"
  | "servicePrice"
  | "languages"
  | "languageMin"
  | "languageMax"
  | "reasons"
  | "reason"
  | "consultFirst"
  | "consultFirstLine"
  | "ruleNotes"
  | "ruleNote"
  | "notes"
  | "noteTitle"
  | "noteText"
  | "closures"
  | "closureNote"
  | "shifts"
  | "instructions"
  | "message";

/**
 * The most of each thing the profile holds, and so the most a fold of the Business tab may hold: the schema that
 * would refuse the save is built from this table (business-profile.ts, brain-config-schema.ts).
 *
 * Every one of these was a literal in the page (`BT_LIMITS`, pages/business-tab-folds.jsx) beside a sentence carrying
 * the same number a second time, so a cap widened in the schema left the page offering less than the save would take
 * and the sentence naming a number neither of them used. Here, one table is the one place a number lives, and
 * `profileRefusal` writes the sentence from it -- the way `bookingRuleRefusal` writes the five booking rules' from
 * BOOKING_RULE_BOUNDS. `closures` and `shifts` are the save's own checks' (MAX_CLOSURES, MAX_INTERVALS_PER_DAY), here so
 * a fold asks one table rather than two; `message` is each of the receptionist's three fallback messages.
 */
export const PROFILE_LIMITS: Readonly<Record<ProfileLimitKey, number>> = {
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
  message: 2000,
};

/** The five booking rules a box holds a number for, by the key the schema stores each under. */
export type BookingRuleKey = "lead_hours" | "slot_min" | "buffer_min" | "max_days_ahead" | "party_max";

/**
 * Each booking rule's range, whole numbers from `min` to `max`: the schema's bounds (BookingRulesSchema) and the
 * range a rule's box refuses outside of (bookingRuleRefusal), one table, so a check never refuses what the save would
 * take.
 */
export const BOOKING_RULE_BOUNDS: Readonly<Record<BookingRuleKey, { readonly min: number; readonly max: number }>> = {
  /** Least notice for a slot, in hours. */
  lead_hours: { min: 0, max: 168 },
  /** The shortest window worth naming, in minutes. */
  slot_min: { min: 15, max: 240 },
  /** Gap kept around each existing appointment, in minutes. */
  buffer_min: { min: 0, max: 120 },
  /** How far ahead open times are offered, in days. */
  max_days_ahead: { min: 1, max: 90 },
  party_max: { min: 1, max: 20 },
};

/* ---------------------------------------------------------- the guardrails */

/**
 * The guardrail keys the profile stores, in the order the Business tab lists them. GuardrailsSchema is written over
 * the same keys, and its type test (config-rules.type-test.ts) holds the two equal: a fifth rule in the schema fails
 * to compile until it is named here, and then `STRENGTHS` (business-tab/rule-strengths.ts) and `guardrailsInForce`
 * below fail until somebody says how far it goes and what its absence means.
 */
export const GUARDRAIL_KEYS = [
  "never_quote_prices",
  "never_confirm_booking",
  "disclose_ai",
  "no_health_advice",
] as const;
export type GuardrailKey = (typeof GUARDRAIL_KEYS)[number];

/** The guardrails as the profile stores them: each a switch, any of them absent. */
export type StoredGuardrails = { [K in GuardrailKey]?: boolean | undefined };

/**
 * Which rules are in force, with each rule's default applied.
 *
 * Read here by whoever says what the receptionist follows, because two readings
 * drifted: the composer took the health rule as opt-in and Ask took it as on
 * when absent, so Ask told an owner "gives no health advice" on a workspace
 * whose receptionist was never given that line. Typed over the guardrail keys:
 * a fifth rule fails to compile until its default is said here.
 */
export type GuardrailsInForce = Record<GuardrailKey, boolean>;

export function guardrailsInForce(g: StoredGuardrails | null | undefined): GuardrailsInForce {
  return {
    never_quote_prices: g?.never_quote_prices !== false,
    // Always (the Settings wiring review, 18 Oct 2026): nothing in the product books, so no choice of the owner's lets the
    // receptionist confirm one; what happens instead is the booking choice on Hours & booking. A stored false is read as
    // on, and the key stays in the schema so an older tab's rules save is not refused by name.
    never_confirm_booking: true,
    // Always: the receptionist says it is an automated assistant whatever a row stores (decision 0051). The key stays
    // in the schema so an open tab's rules save, which writes all four, is never refused by name.
    disclose_ai: true,
    no_health_advice: g?.no_health_advice === true,
  };
}
