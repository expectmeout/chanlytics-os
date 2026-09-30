/**
 * The business's facts as fields (E4): the profile's schema and its parts (hours, closures, services, guardrails,
 * notes, booking rules), with the guardrails' defaults. The brain that holds the profile is brain-config.ts; the
 * prompt composed from it is compose.ts.
 */
import { z } from "zod";

/* --------------------------------------------------------------- E4 config */

/* ------------------------------------------------------------------ profile
 * The business's facts, as FIELDS.
 *
 * They used to live only inside `system_prompt` — five thousand characters of
 * prose holding the address, the hours, every service and its duration, the
 * booking link and the rules. Prose cannot be projected: you cannot render it
 * as a form, diff it when the hours change, or hand it to a voice provider that
 * wants variables. So the voice agent got its own copy of the same facts in
 * another dashboard, and the two drift the first time somebody opens later.
 *
 * Every field is OPTIONAL and the profile itself is optional, because the pilot's
 * hand-written prompt is live and working. Nothing composes until a workspace
 * actually fills these in.
 */

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * One stretch of the day the doors are open.
 *
 * DELIBERATELY LENIENT — no .strict(), no .refine(), no length bounds.
 *
 * This schema is on the READ path: apps/edge parses it out of the database on
 * every inbound message, and a parse failure there is not a warning. It sets
 * configBroken, the WhatsApp receptionist stops replying, and the voice agent
 * is handed no facts at all. Rules that reject a stored row are rules that
 * mute a live line, so the shape is all that lives here. Everything that can
 * be WRONG rather than malformed — reversed times, overlapping shifts, a
 * calendar date that does not exist — is checked on the way IN, and the
 * composer is written to tell the truth about whatever is already stored.
 */
export const IntervalSchema = z.object({ open: TIME, close: TIME });

export const HoursSchema = z
  .object({
    /** "09:00". Absent or null = closed that day, which is a real answer. */
    open: TIME.nullable().optional(),
    close: TIME.nullable().optional(),
    /**
     * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
     * actually keeps. Additive: a day that has always been one stretch keeps
     * saying so with open/close, and no stored config is rewritten.
     */
    intervals: z.array(IntervalSchema).optional(),
  })
  .strip();

/** A plain calendar date in the business's own zone — never an instant. */
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * A day the business is shut whatever the weekly grid says.
 *
 * `until` because "closed 24 December to 2 January" is ONE decision an owner
 * makes, and ten separate rows is how a holiday week ends up half-entered.
 *
 * Lenient for the same reason as IntervalSchema. Note the date regex accepts
 * 2026-11-31, which is not a day; the renderer checks that it round-trips and
 * prints the raw string when it does not, rather than confidently naming the
 * wrong date.
 */
export const ClosureSchema = z.object({
  date: DATE,
  until: DATE.optional(),
  note: z.string().max(200).optional(),
});

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const ServiceSchema = z
  .object({
    name: z.string().min(1).max(80),
    /** Minutes. The receptionist is asked "how long does it take" constantly. */
    duration_min: z.number().int().min(1).max(1440).optional(),
    /**
     * Free text, not a number, and deliberately so: "from $45", "quoted at
     * consult", "varies by length". A price the business cannot state flatly
     * must not be forced into a field that looks like it can.
     */
    price_note: z.string().max(120).optional(),
  })
  .strip();

/**
 * The rules that must survive editing.
 *
 * Flags, never prose. A free-text prompt box hands an owner the ability to
 * delete the price policy, the never-confirm-a-booking rule and the AI
 * disclosure without knowing they have — and nothing downstream could tell.
 * Composed in every time, and default ON: the safe reading of an absent value.
 */
export const GuardrailsSchema = z
  .object({
    never_quote_prices: z.boolean().optional(),
    never_confirm_booking: z.boolean().optional(),
    disclose_ai: z.boolean().optional(),
    /**
     * OPT-IN, unlike the three above. Those default on because absent means
     * "the safe reading"; this one arrived after prompts were live, and a
     * rule that defaulted on would have changed every composed prompt in
     * production the moment it deployed.
     */
    no_health_advice: z.boolean().optional(),
  })
  .strip();

/**
 * Which rules are in force, with each rule's default applied.
 *
 * Read here by whoever says what the receptionist follows, because two readings
 * drifted: the composer took the health rule as opt-in and Ask took it as on
 * when absent, so Ask told an owner "gives no health advice" on a workspace
 * whose receptionist was never given that line. Typed over the schema's keys:
 * a fifth rule fails to compile until its default is said here.
 */
export type GuardrailsInForce = Record<keyof z.infer<typeof GuardrailsSchema>, boolean>;

export function guardrailsInForce(g: z.infer<typeof GuardrailsSchema> | null | undefined): GuardrailsInForce {
  return {
    never_quote_prices: g?.never_quote_prices !== false,
    never_confirm_booking: g?.never_confirm_booking !== false,
    disclose_ai: g?.disclose_ai !== false,
    no_health_advice: g?.no_health_advice === true,
  };
}

/**
 * A thing the receptionist should know that fits no field — the academy, the
 * chair rental, the parking. One topic each, said by BOTH receptionists. The
 * long tail that a knowledge base would hold later; never the hours or the
 * booking link, which have fields.
 */
export const NoteSchema = z
  .object({
    title: z.string().min(1).max(80),
    text: z.string().min(1).max(1200),
  })
  .strip();
export type Note = z.infer<typeof NoteSchema>;

/**
 * How bookings may be OFFERED — never made. The receptionist sends the link;
 * these shape which open times it names first and what it says about them.
 */
export const BookingRulesSchema = z
  .object({
    /** Least notice for a slot, in hours. Absent = 2. */
    lead_hours: z.number().int().min(0).max(168).optional(),
    /** Gap kept around each existing appointment, in minutes. Absent = 0. */
    buffer_min: z.number().int().min(0).max(120).optional(),
    /** How far ahead open times are offered, in days. Absent = 14. */
    max_days_ahead: z.number().int().min(1).max(90).optional(),
    /** The shortest window worth naming, in minutes. Absent = 30. */
    slot_min: z.number().int().min(15).max(240).optional(),
    /** Services that need a consultation before they can be booked. */
    consult_first: z.array(z.string().min(1).max(80)).max(20).optional(),
    party_max: z.number().int().min(1).max(20).optional(),
    /**
     * Ask, once, for an email when sending the booking link -- for the confirmation, and for the campaigns that follow
     * (Part 0 of the campaigns-on-every-channel spec). Absent = no.
     */
    ask_email: z.boolean().optional(),
    /** Anything else about booking, one short line each. */
    notes: z.array(z.string().min(1).max(200)).max(10).optional(),
  })
  .strip();
export type BookingRules = z.infer<typeof BookingRulesSchema>;

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

export const BusinessProfileSchema = z
  .object({
    address: z.string().max(300).optional(),
    hours: z.partialRecord(z.enum(DAYS), HoursSchema).optional(),
    /** Dates the business is shut regardless of the weekly grid. */
    closures: z.array(ClosureSchema).optional(),
    services: z.array(ServiceSchema).max(60).optional(),
    languages: z.array(z.string().min(2).max(40)).max(8).optional(),
    guardrails: GuardrailsSchema.optional(),
    /** What must reach a person. One short line each. */
    escalate_when: z.array(z.string().min(1).max(200)).max(20).optional(),
    tone: z.string().max(200).optional(),
    /**
     * The line a PERSON answers. The phone receptionist warm-transfers here
     * during opening hours; absent, it takes a message instead. Never the
     * receptionist's own line — that would ring itself.
     */
    handoff_number: z.string().regex(E164, "E.164, like +12125550143").optional(),
    website: z.string().url().max(500).optional(),
    notes: z.array(NoteSchema).max(10).optional(),
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
    extra_instructions: z.string().max(INSTRUCTIONS_MAX).optional(),
  })
  .strip();

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;
export type Hours = z.infer<typeof HoursSchema>;
export type Service = z.infer<typeof ServiceSchema>;
export type Interval = z.infer<typeof IntervalSchema>;
export type Closure = z.infer<typeof ClosureSchema>;
