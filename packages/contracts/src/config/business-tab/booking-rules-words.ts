/**
 * The booking rules at rest, and what a rule's box says: the refusal when a number is out of the save's range,
 * and what an empty box uses, both from the schema's bounds and the calendar's own defaults.
 */
import { BookingRulesSchema } from "../workspace-config/business-profile";
import { BOOKING_DEFAULTS } from "../../calendar/availability";
import { count, pluralGrouped } from "./counts";

/** The booking rules the row states (contracts BookingRulesSchema), read defensively: the page is untyped. */
export interface BookingRulesWordsInput {
  lead_hours?: number | null;
  slot_min?: number | null;
  buffer_min?: number | null;
  max_days_ahead?: number | null;
  party_max?: number | null;
  ask_email?: boolean | null;
  notes?: readonly string[] | null;
}

export interface BookingRulesWordsVM {
  /**
   * "At least 2 hours' notice · 30-minute slots · up to 14 days ahead · up to 4 people · asks for an email when sending
   * the booking link": the rules that are set; null with none.
   */
  line: string | null;
  /** "No chemical services after 4 PM. Bridal parties are booked by phone.": the notes, as sentences; null with none. */
  notes: string | null;
  /** What it does with none of the five set: the calendar's own rules, said as they are applied. */
  none: string;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The booking rules at rest, in ONE sentence: each of the five numbers that is set, and the email switch where it is
 * on, joined by " · " in the fold's order (the canvas's Record board). A rule left empty is not said as if the owner
 * had set it, and a switch that is off is not said at all; with none set, `none` says what
 * the calendar offers by (availability.ts BOOKING_DEFAULTS, which freeWindows applies to every opening it hands the
 * receptionist): at least two hours' notice, fourteen days ahead, half-hour slots, no gap. "No rule" would not be true.
 * The notes are the owner's own lines, each said as a sentence.
 */
export function bookingRulesWords(rules: BookingRulesWordsInput | null | undefined): BookingRulesWordsVM {
  const r = rules ?? {};
  const parts: string[] = [];
  if (isNumber(r.lead_hours))
    parts.push(
      r.lead_hours === 0
        ? "same-day bookings"
        : `at least ${r.lead_hours === 1 ? "1 hour's" : `${count(r.lead_hours)} hours'`} notice`,
    );
  if (isNumber(r.slot_min)) parts.push(`${count(r.slot_min)}-minute slots`);
  if (isNumber(r.buffer_min))
    parts.push(
      r.buffer_min === 0
        ? "no gap between appointments"
        : `${pluralGrouped(r.buffer_min, "minute", "minutes")} between appointments`,
    );
  if (isNumber(r.max_days_ahead)) parts.push(`up to ${pluralGrouped(r.max_days_ahead, "day", "days")} ahead`);
  if (isNumber(r.party_max)) parts.push(`up to ${pluralGrouped(r.party_max, "person", "people")}`);
  if (r.ask_email) parts.push("asks for an email when sending the booking link");
  const joined = parts.join(" · ");
  // A stored list that is not one (a hand-edited record) is none, never a throw: the row is drawn from what is stored.
  const notes = (Array.isArray(r.notes) ? r.notes : [])
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => {
      const t = x.trim();
      return /[.!?…]$/.test(t) ? t : `${t}.`;
    });
  const d = BOOKING_DEFAULTS;
  return {
    line: joined ? `${joined[0]!.toUpperCase()}${joined.slice(1)}` : null,
    notes: notes.length ? notes.join(" ") : null,
    none: `The calendar's own — at least ${pluralGrouped(d.lead_hours, "hour's", "hours'")} notice, up to ${pluralGrouped(d.max_days_ahead, "day", "days")} ahead, in ${count(d.slot_min)}-minute slots`,
  };
}

/** The five booking rules a box holds a number for, by the key the schema stores each under. */
export type BookingRuleKey = "lead_hours" | "slot_min" | "buffer_min" | "max_days_ahead" | "party_max";

/**
 * What a booking rule's box says when what is typed is not a whole number in the rule's range: the range, and what an
 * empty box uses, each with its unit, in the hint's place under the box. The range is the save's own schema's
 * (BookingRulesSchema's bounds, so a check never refuses what the save would take), and what empty uses is the defaults
 * the openings are made with (BOOKING_DEFAULTS), which the box's hint says too (BOOKING_RULE_HINTS). The old form said
 * "leave it empty for no rule" of the least notice and of the days ahead, each of which has a default; the party size has
 * none, and the composer says nothing of a party when none is set, so its "no rule" is true. A key that is not one of the
 * five is a TypeError, since the page is untyped.
 */
export function bookingRuleRefusal(key: BookingRuleKey): string {
  const shape = BookingRulesSchema.shape as unknown as Record<
    string,
    { unwrap?: () => { minValue: number | null; maxValue: number | null } } | undefined
  >;
  const words: Record<BookingRuleKey, (lo: number, hi: number) => string> = {
    lead_hours: (lo, hi) =>
      `Least notice is ${lo} to ${hi} hours; leave it empty to use ${pluralGrouped(BOOKING_DEFAULTS.lead_hours, "hour", "hours")}.`,
    slot_min: (lo, hi) =>
      `A slot is ${lo} to ${hi} minutes; leave it empty for the calendar’s ${pluralGrouped(BOOKING_DEFAULTS.slot_min, "minute", "minutes")}.`,
    buffer_min: (lo, hi) =>
      `The gap is ${lo} to ${hi} minutes; leave it empty for ${BOOKING_DEFAULTS.buffer_min === 0 ? "none" : pluralGrouped(BOOKING_DEFAULTS.buffer_min, "minute", "minutes")}.`,
    max_days_ahead: (lo, hi) =>
      `Times are offered ${lo} to ${hi} days ahead; leave it empty to use ${pluralGrouped(BOOKING_DEFAULTS.max_days_ahead, "day", "days")}.`,
    party_max: (lo, hi) => `A booking is for ${lo} to ${hi} people; leave it empty for no rule.`,
  };
  const say = Object.prototype.hasOwnProperty.call(words, key) ? words[key] : null;
  const bound = say ? shape[key]?.unwrap?.() : null;
  if (!say || !bound || bound.minValue == null || bound.maxValue == null) {
    throw new TypeError(
      `bookingRuleRefusal knows the five booking rules a box holds a number for (${Object.keys(words).join(", ")}), not ${JSON.stringify(key)}.`,
    );
  }
  return say(bound.minValue, bound.maxValue);
}

/**
 * What an empty box means, under each booking rule's box in its fold, where the box holds a number. From the defaults
 * the openings are worked out with (BOOKING_DEFAULTS), so the hint is true: the canvas said "Empty means no rule." of
 * the least notice, and an empty least notice is two hours'. The gap has no hint: empty is none. The party size has
 * no default at all, and its hint says what the composer tells the receptionist of a larger group.
 *
 * Built inside a call marked pure, as GUARDRAIL_KEYS is: a top-level call is a side effect to the bundler, which would
 * keep this in the four dists that bundle contracts and never use it.
 */
export const BOOKING_RULE_HINTS: Readonly<
  Record<"lead_hours" | "slot_min" | "buffer_min" | "max_days_ahead" | "party_max", string | null>
> = /* @__PURE__ */ (() => ({
  lead_hours: `Empty uses ${pluralGrouped(BOOKING_DEFAULTS.lead_hours, "hour", "hours")}.`,
  slot_min: `Empty uses the calendar's ${count(BOOKING_DEFAULTS.slot_min)}.`,
  buffer_min: null,
  max_days_ahead: `Empty uses ${count(BOOKING_DEFAULTS.max_days_ahead)}.`,
  party_max: "Larger groups go to a person.",
}))();
