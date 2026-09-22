/**
 * What the Business tab says, as view models.
 *
 * Named apart from `business-page.ts` (the public /b/<slug> page) and
 * `business-record.ts` (the carrier record). This one is the operator's own tab.
 *
 * Every sentence with a number or a judgement in it is composed here rather
 * than in the page, for the reason Today and Reports already hold to: a
 * sentence written in JSX cannot be tested, and the same sentence written
 * twice is one that will be edited once.
 *
 * The prompt view, which cuts what the receptionist reads into the blocks that
 * wrote it, is `prompt-blocks.ts`.
 */

import { BookingRulesSchema, DAYS, GuardrailsSchema, type Closure, type Hours } from "./config";
import { hardLimitsWords, violatesNoPrices } from "./policy";
import { BOOKING_DEFAULTS, dayIntervals } from "./availability";
import { closureDatesLabel, closuresFrom } from "./calendar";
import { zoneDayKey } from "./clock";
import { timezoneCity } from "./time";

/**
 * The guardrail keys the profile stores, read off the schema rather than copied
 * from it. A copy would let a new rule reach the schema without a strength here;
 * derived, `STRENGTHS` below fails to compile until somebody says how far it goes.
 *
 * Read inside a call marked pure: a top-level call is a side effect to the bundler,
 * so a bare one kept this list in the four dists that bundle contracts and never use it.
 */
export const GUARDRAIL_KEYS = /* @__PURE__ */ (() => GuardrailsSchema.keyof().options)();
export type GuardrailKey = (typeof GUARDRAIL_KEYS)[number];

/**
 * How far a rule actually goes.
 *
 * The page drew four identical switches over three different guarantees, which
 * is the quietest dishonesty it had. One of these the product cannot break at
 * all; one has a detector on both channels; two are lines in a prompt, and
 * `policy.ts` says in its own header that an instruction is not an enforcement.
 */
export type RuleStrength = "structural" | "checked" | "instructed";

export interface RuleStrengthVM {
  strength: RuleStrength;
  /** The chip beside the rule's name. */
  chip: string;
  /** What actually happens, in the owner's words. */
  sentence: string;
  /** For a checked rule, what happens per channel. Null otherwise. */
  checkedOn: { channel: "whatsapp" | "voice"; words: string }[] | null;
}

const STRENGTHS: Record<GuardrailKey, RuleStrengthVM> = {
  never_confirm_booking: {
    strength: "structural",
    chip: "It cannot anyway",
    sentence:
      "There is no appointments table in this product; nothing in it can create, move or cancel one. Switching this off would not let it book — it would only stop it being told not to claim it had.",
    checkedOn: null,
  },
  never_quote_prices: {
    strength: "checked",
    chip: "Checked, not just told",
    // The sentence says the rule. `checkedOn` says how it lands per channel, and the
    // page draws both -- so the sentence must not say the channels too, or an owner
    // reads the same fact twice, once in prose and once in the two boxes under it.
    // Dollars and pesos are what `violatesNoPrices` knows. "A currency figure" promised
    // more: forty-five euros, or a pound sign, would pass it untouched.
    //
    // The owner's decision (20 Sep 2026): a receptionist never states a price, whatever
    // this switch says. The detectors (violatesNoPrices on a chat reply, spokenBreach on a
    // call) run either way; the switch adds or removes the one prompt line that tells it
    // not to quote one. So the sentence cannot say the switch turns the checking on.
    sentence:
      "A detector reads every reply for a price in dollars or pesos whether this switch is on or off, and it offers a consult or the booking link instead. On, it is also told not to quote one.",
    checkedOn: [
      { channel: "whatsapp", words: "The words are swapped before the customer sees them. A draft sits in between." },
      { channel: "voice", words: "It has already been heard. A correction goes into the live call, and you are told while it is still up." },
    ],
  },
  disclose_ai: {
    strength: "instructed",
    chip: "Told, and trusted",
    sentence:
      "A line in what it reads, and nothing checks the answer afterwards. There is no clean signal to check against: the phrase that would catch a denial also catches the correct disclosure.",
    checkedOn: null,
  },
  no_health_advice: {
    strength: "instructed",
    chip: "Told, and trusted",
    sentence: "Skin reactions, allergies, pregnancy, medication — a professional advises at the appointment.",
    checkedOn: null,
  },
};

export function ruleStrength(key: GuardrailKey): RuleStrengthVM {
  return STRENGTHS[key];
}

/** The subset of the brain the standing line reads. */
export interface StandingInputs {
  business_name?: string | null;
  booking_link?: string | null;
  profile?: {
    address?: string | null;
    tone?: string | null;
    hours?: Record<string, unknown> | null;
    services?: unknown[] | null;
  } | null;
}

export interface StandingVM {
  /** What it can answer, in one clause. */
  can: string;
  /**
   * What it will not do: state a price. Said whenever there are services to price,
   * whatever the price switch says, because the detector runs either way (the owner's
   * decision, 20 Sep 2026). Null with nothing to price.
   */
  wont: string | null;
  /** The single most useful gap, and the row that fixes it. Null when there is none. */
  missing: { sentence: string; row: string } | null;
}

/**
 * What a receptionist with no services cannot do, in ONE place: the standing line's gap says it ("It cannot say what you
 * offer."), and so does the services sheet's foot once the last one is taken out (servicesToldWords).
 */
const CANNOT_SAY_SERVICES = "cannot say what you offer";

const has = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : !!v && Object.keys(v as object).length > 0;

/**
 * Three clauses, worst last.
 *
 * The gaps are ordered by what a customer notices: a receptionist with no name
 * cannot introduce itself, one with no hours cannot answer the commonest
 * question, and one with no voice answers in nobody's words. Only
 * the first gap is named — a list of six is a list nobody starts.
 */
export function standingLine(i: StandingInputs): StandingVM {
  const p = i.profile ?? {};
  const gaps: { sentence: string; row: string }[] = [];
  if (!has(i.business_name)) gaps.push({ sentence: "It has no name to introduce itself with.", row: "name" });
  if (!has(i.booking_link)) gaps.push({ sentence: "It has no booking link to send anyone.", row: "booking_link" });
  if (!has(p.hours)) gaps.push({ sentence: "It cannot say when you are open.", row: "hours" });
  if (!has(p.services)) gaps.push({ sentence: `It ${CANNOT_SAY_SERVICES}.`, row: "services" });
  if (!has(p.address)) gaps.push({ sentence: "It cannot say where you are.", row: "address" });
  if (!has(p.tone)) gaps.push({ sentence: "It has no voice of its own yet — it answers in nobody in particular's words.", row: "tone" });

  const answers: string[] = [];
  if (has(p.address)) answers.push("where you are");
  if (has(p.hours)) answers.push("when you're open");
  if (has(p.services)) answers.push("what you offer");
  if (has(i.booking_link)) answers.push("how to book");

  const can = answers.length
    ? `It can say ${answers.length === 1 ? answers[0] : `${answers.slice(0, -1).join(", ")} and ${answers.at(-1)}`}.`
    : "It cannot answer anyone yet.";

  // Both, because the two channels do different things: chat's replacement offers a
  // consult (layerTwo), and a call's correction offers the booking link (frameGuardrail).
  // "A consult" alone was true on WhatsApp and not on the phone.
  const wont = has(p.services) ? "It offers a consult or the booking link instead of a price." : null;

  return { can, wont, missing: gaps[0] ?? null };
}

/* ---- When you're open ---- */

const DAY_COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven"] as const;

/**
 * The line under the card's title: how much of the week is open, and whose clock the times are on. "Six days a week,
 * in New York time".
 *
 * A day counts as open when the composer would state times for it (dayIntervals, which reads both shapes a stored day
 * may have), so the card never counts a day the receptionist calls closed. With no open day there is no week to
 * count, and the line says only whose clock it is; the Hours row under it says they are not set.
 */
export function openWeekWords(hours: Partial<Record<string, Hours>> | null | undefined, tz: string): string {
  const open = DAYS.filter((d) => dayIntervals(hours?.[d]).length > 0).length;
  const zone = `in ${timezoneCity(tz)} time`;
  if (!open) return `Times are ${zone}`;
  return `${DAY_COUNT_WORDS[open]} ${open === 1 ? "day" : "days"} a week, ${zone}`;
}

export interface ClosuresAheadVM {
  /** How many closures are still to come, by the business's own day. */
  count: number;
  /** "2 ahead · next Dec 24 – 26 · Christmas"; null when none is, and the row says "None ahead". */
  line: string | null;
}

/**
 * The closed days still ahead, counted on the BUSINESS's day, not the browser's: an owner working from another
 * country must not be told a date has passed when it has not. A closure that ends today is still ahead, and one with
 * no date is a row somebody started and never finished, which no save writes. A zone the clock cannot use is read as
 * UTC, the clock's own rule (clock.ts), so the row is never lost to one.
 */
export function closuresAheadWords(closures: readonly Closure[] | null | undefined, tz: string, now: Date): ClosuresAheadVM {
  const dated = (closures ?? []).filter((c) => !!c?.date);
  const ahead = closuresFrom(dated, zoneDayKey(now.getTime(), tz));
  const next = ahead[0];
  if (!next) return { count: 0, line: null };
  const named = `${closureDatesLabel(next)}${next.note ? ` · ${next.note}` : ""}`;
  return { count: ahead.length, line: `${ahead.length} ahead · ${ahead.length > 1 ? "next " : ""}${named}` };
}

/* ---- What you offer ---- */

const count = (n: number): string => n.toLocaleString("en-US");

/** A service as the settings read hands one over (contracts ServiceSchema), read defensively: the page is untyped. */
export interface ServiceWordsInput {
  name?: string | null;
  duration_min?: number | null;
  price_note?: string | null;
}

export interface ServicesWordsVM {
  /** How many are on record. */
  count: number;
  /** "33 on record"; null with none, and the row says it has none. */
  line: string | null;
  /** How they are priced, in one sentence; null with none. */
  priced: string | null;
  /** The first four in the stored order, which is the order the receptionist reads them in: each name, and "180m" where it has a duration. */
  chips: { name: string; takes: string | null }[];
  /** "+29 more" past the four; null when every one is a chip. */
  more: string | null;
}

/** How many services the row names at rest (the canvas's Record board). */
const SERVICE_CHIPS = 4;
// A note that sends the price to a consultation: "quoted at consult", "by consultation".
const CONSULT = /\bconsult/i;
// A note is written by the owner and read in a sentence: its first letter goes lower unless it opens an acronym.
const inSentence = (note: string): string => (/^[A-Z][a-z]/.test(note) ? `${note[0]!.toLowerCase()}${note.slice(1)}` : note);

/**
 * The services row at rest: how many are on record, the first few by name with how long each takes, and ONE sentence
 * about how they are priced.
 *
 * A note "names a price" when the detector the replies are checked by would take it for one (policy.ts
 * violatesNoPrices), never a second test of what a price looks like: a note that names one is composed into the prompt
 * as written, and the detector swaps it out of every reply, so the owner is told how many there are. With none that
 * does, a list that sends every price to a consultation says so ("Every one quoted at consult — none names a price.",
 * the canvas's words, in the owner's own note); any other says only that none names one. A service with no name is a
 * row nobody finished, which no save writes, and is not counted.
 */
export function servicesWords(services: readonly ServiceWordsInput[] | null | undefined): ServicesWordsVM {
  // A stored list that is not one (a hand-edited record) is no services, never a throw: the page draws this as it draws.
  const list = (Array.isArray(services) ? services : []).filter((s): s is ServiceWordsInput & { name: string } => !!s && typeof s.name === "string" && s.name.trim() !== "");
  const n = list.length;
  if (!n) return { count: 0, line: null, priced: null, chips: [], more: null };
  const notes = list.map((s) => (typeof s.price_note === "string" ? s.price_note.trim() : ""));
  const naming = notes.filter((note) => note !== "" && violatesNoPrices(note)).length;
  const first = notes[0] ?? "";
  const oneNote = first !== "" && notes.every((note) => note.toLowerCase() === first.toLowerCase());
  const priced = naming
    ? `${count(naming)} ${naming === 1 ? "names" : "name"} a price.`
    : oneNote && CONSULT.test(first)
      ? n === 1
        ? `${first[0]!.toUpperCase()}${first.slice(1)} — it names no price.`
        : `Every one ${inSentence(first)} — none names a price.`
      : "None names a price.";
  const chips = list.slice(0, SERVICE_CHIPS).map((s) => ({
    name: s.name.trim(),
    takes: typeof s.duration_min === "number" && s.duration_min > 0 ? `${s.duration_min}m` : null,
  }));
  return { count: n, line: `${count(n)} on record`, priced, chips, more: n > SERVICE_CHIPS ? `+${count(n - SERVICE_CHIPS)} more` : null };
}

/**
 * How much of everything the receptionist reads one block of its prompt is: "a quarter of everything it reads". `chars`
 * is the block's own share of the prompt (PromptBlockVM.chars) and `total` the whole prompt's length, on one channel.
 * Rough on purpose, the nearest of a few named shares, and "about" when even the nearest is some way off: a
 * percentage would be a number nobody reads. Null when there is no block, or no prompt, to measure.
 *
 * The shares are inside the function: a table at the top of the module was kept, whole, in each of the four dists
 * that bundle contracts and never call this.
 */
export function blockShareWords(chars: number, total: number): string | null {
  const SHARES: ReadonlyArray<readonly [number, string]> = [
    [1 / 10, "a tenth"], [1 / 5, "a fifth"], [1 / 4, "a quarter"], [1 / 3, "a third"], [2 / 5, "two fifths"], [1 / 2, "half"],
    [3 / 5, "three fifths"], [2 / 3, "two thirds"], [3 / 4, "three quarters"], [4 / 5, "four fifths"], [9 / 10, "nine tenths"],
  ];
  if (!(typeof chars === "number" && chars > 0) || !(typeof total === "number" && total > 0)) return null;
  const f = Math.min(1, chars / total);
  if (f >= 0.95) return "nearly everything it reads";
  if (f < 0.075) return "less than a tenth of everything it reads";
  const [share, words] = SHARES.reduce((best, s) => (Math.abs(s[0] - f) < Math.abs(best[0] - f) ? s : best));
  return `${Math.abs(share - f) > 0.03 ? "about " : ""}${words} of everything it reads`;
}

/**
 * What the services sheet's foot says it will be told: "33 services, 1,190 characters — a quarter of everything it
 * reads." (the canvas's Edit-Sheet), from the services the save would write, its block's characters and the whole
 * prompt's length. With none it says what that costs, in the standing line's own words for it (CANNOT_SAY_SERVICES).
 */
export function servicesToldWords(i: { count: number; chars: number | null; total: number | null }): string {
  const n = i.count;
  if (!n) return `No services, so it ${CANNOT_SAY_SERVICES}.`;
  const share = i.chars ? blockShareWords(i.chars, i.total ?? 0) : null;
  const size = i.chars ? `, ${count(i.chars)} characters` : "";
  return `${count(n)} ${n === 1 ? "service" : "services"}${size}${share ? ` — ${share}` : ""}.`;
}

/**
 * The name of the Undo left where a service was taken out of the sheet, as a screen reader hears it: what it puts back,
 * "Undo removing Balayage". Each was named only "Undo", and two waiting side by side could not be told apart.
 */
export function serviceUndoName(name: string | null | undefined): string {
  const n = typeof name === "string" ? name.trim() : "";
  return n ? `Undo removing ${n}` : "Undo removing a service";
}

/** The sheet's Save, named for what it saves: "Save 33 services". */
export function servicesSaveWords(n: number): string {
  if (!n) return "Save with no services";
  return `Save ${count(n)} ${n === 1 ? "service" : "services"}`;
}

/** The booking rules the row states (contracts BookingRulesSchema), read defensively: the page is untyped. */
export interface BookingRulesWordsInput {
  lead_hours?: number | null;
  slot_min?: number | null;
  buffer_min?: number | null;
  max_days_ahead?: number | null;
  party_max?: number | null;
  notes?: readonly string[] | null;
}

export interface BookingRulesWordsVM {
  /** "At least 2 hours' notice · 30-minute slots · up to 14 days ahead · up to 4 people": the rules that are set; null with none. */
  line: string | null;
  /** "No chemical services after 4 PM. Bridal parties are booked by phone.": the notes, as sentences; null with none. */
  notes: string | null;
  /** What it does with none of the five set: the calendar's own rules, said as they are applied. */
  none: string;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const plural = (n: number, one: string, many: string): string => `${count(n)} ${n === 1 ? one : many}`;

/**
 * The booking rules at rest, in ONE sentence: each of the five that is set, joined by " · " in the fold's order (the
 * canvas's Record board). A rule left empty is not said as if the owner had set it; with none set, `none` says what
 * the calendar offers by (availability.ts BOOKING_DEFAULTS, which freeWindows applies to every opening it hands the
 * receptionist): at least two hours' notice, fourteen days ahead, half-hour slots, no gap. "No rule" would not be true.
 * The notes are the owner's own lines, each said as a sentence.
 */
export function bookingRulesWords(rules: BookingRulesWordsInput | null | undefined): BookingRulesWordsVM {
  const r = rules ?? {};
  const parts: string[] = [];
  if (isNumber(r.lead_hours)) parts.push(r.lead_hours === 0 ? "same-day bookings" : `at least ${r.lead_hours === 1 ? "1 hour's" : `${count(r.lead_hours)} hours'`} notice`);
  if (isNumber(r.slot_min)) parts.push(`${count(r.slot_min)}-minute slots`);
  if (isNumber(r.buffer_min)) parts.push(r.buffer_min === 0 ? "no gap between appointments" : `${plural(r.buffer_min, "minute", "minutes")} between appointments`);
  if (isNumber(r.max_days_ahead)) parts.push(`up to ${plural(r.max_days_ahead, "day", "days")} ahead`);
  if (isNumber(r.party_max)) parts.push(`up to ${plural(r.party_max, "person", "people")}`);
  const joined = parts.join(" · ");
  // A stored list that is not one (a hand-edited record) is none, never a throw: the row is drawn from what is stored.
  const notes = (Array.isArray(r.notes) ? r.notes : []).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => {
    const t = x.trim();
    return /[.!?…]$/.test(t) ? t : `${t}.`;
  });
  const d = BOOKING_DEFAULTS;
  return {
    line: joined ? `${joined[0]!.toUpperCase()}${joined.slice(1)}` : null,
    notes: notes.length ? notes.join(" ") : null,
    none: `The calendar's own — at least ${plural(d.lead_hours, "hour's", "hours'")} notice, up to ${plural(d.max_days_ahead, "day", "days")} ahead, in ${count(d.slot_min)}-minute slots`,
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
  const shape = BookingRulesSchema.shape as unknown as Record<string, { unwrap?: () => { minValue: number | null; maxValue: number | null } } | undefined>;
  const words: Record<BookingRuleKey, (lo: number, hi: number) => string> = {
    lead_hours: (lo, hi) => `Least notice is ${lo} to ${hi} hours; leave it empty to use ${plural(BOOKING_DEFAULTS.lead_hours, "hour", "hours")}.`,
    slot_min: (lo, hi) => `A slot is ${lo} to ${hi} minutes; leave it empty for the calendar’s ${plural(BOOKING_DEFAULTS.slot_min, "minute", "minutes")}.`,
    buffer_min: (lo, hi) => `The gap is ${lo} to ${hi} minutes; leave it empty for ${BOOKING_DEFAULTS.buffer_min === 0 ? "none" : plural(BOOKING_DEFAULTS.buffer_min, "minute", "minutes")}.`,
    max_days_ahead: (lo, hi) => `Times are offered ${lo} to ${hi} days ahead; leave it empty to use ${plural(BOOKING_DEFAULTS.max_days_ahead, "day", "days")}.`,
    party_max: (lo, hi) => `A booking is for ${lo} to ${hi} people; leave it empty for no rule.`,
  };
  const say = Object.prototype.hasOwnProperty.call(words, key) ? words[key] : null;
  const bound = say ? shape[key]?.unwrap?.() : null;
  if (!say || !bound || bound.minValue == null || bound.maxValue == null) {
    throw new TypeError(`bookingRuleRefusal knows the five booking rules a box holds a number for (${Object.keys(words).join(", ")}), not ${JSON.stringify(key)}.`);
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
export const BOOKING_RULE_HINTS: Readonly<Record<"lead_hours" | "slot_min" | "buffer_min" | "max_days_ahead" | "party_max", string | null>> = /* @__PURE__ */ (() => ({
  lead_hours: `Empty uses ${plural(BOOKING_DEFAULTS.lead_hours, "hour", "hours")}.`,
  slot_min: `Empty uses the calendar's ${count(BOOKING_DEFAULTS.slot_min)}.`,
  buffer_min: null,
  max_days_ahead: `Empty uses ${count(BOOKING_DEFAULTS.max_days_ahead)}.`,
  party_max: "Larger groups go to a person.",
}))();

/**
 * What a save says when it crosses the line the resolver draws between a record it composes from and one it answers
 * with the stored prompt (config.ts `hasProfile`).
 *
 * Emptying the last field the resolver composes from hands the receptionist its stored prompt instead: on a sparse
 * record the prompt fell from 2,128 characters to 240, with the hand-off token and every rule line gone. The first such
 * field does the reverse, and the prompt grows from 240 to 1,939. Either way far more changes than the field's own
 * line, so the row says so beside that line. It is not a refusal: the save still goes. Which way a save crosses is the
 * bridge's to decide (legacy-bridge/business-tab.ts, `profileCrossing`), from `hasProfile` over the stored brain's
 * profile and the next one's; these are the words.
 */
export const PROFILE_CROSSING_WORDS = {
  stops: "Saved like this, the receptionist stops being given the details on this page and answers from its stored instructions.",
  starts: "Saved like this, the receptionist starts being given the details on this page, and the instructions it follows today are carried in beneath them.",
} as const;

export type ProfileCrossing = keyof typeof PROFILE_CROSSING_WORDS;

/**
 * What the receptionist can do, and what it cannot.
 *
 * The tab sets the inputs to three of the phone agent's four tools
 * (`check_availability`, `send_booking_link`, `transfer_to_staff`) and has
 * never said a tool exists. An owner could not know their phone agent sends
 * the booking link to a caller's WhatsApp.
 *
 * Computed from what the records show, never typed: an ability is ready only
 * when its channel is live and its input is filled. Every sentence below was
 * checked against the code it describes, because the first draft of three of
 * them was not true: the link goes by WhatsApp and never by text, a transfer
 * happens only during opening hours and stays on the line, and a hand-off is a
 * pause that ends, not a stop.
 *
 * Every input is required, and the booleans are checked as it runs: the page
 * that calls this is untyped JSX, and a boolean it left out would be read as
 * false -- a live line drawn dark, a hold drawn as none -- with no error at all.
 */
export interface AbilityInputs {
  voiceLive: boolean;
  whatsappLive: boolean;
  hasCalendarFeed: boolean;
  hasBookingLink: boolean;
  /** An approved booking-link template: the call sends the link as one (template-library bookingTemplate). */
  hasBookingTemplate: boolean;
  hasHandoffNumber: boolean;
  hasEscalateWhen: boolean;
  /**
   * The Autonomy reply row's `limits.pause_hours`, exactly as stored -- usually
   * nothing, because most owners never set it. Read here the way the Autonomy pane
   * reads it (hardLimitsWords), which is the way the edge applies it: nothing, null
   * or 0 is the 24-hour default.
   */
  pauseHours: unknown;
  visionOn: boolean;
  /**
   * The Autonomy tab's Booking row is not on auto, so a person confirms bookings
   * and the link is never sent: bookingHeld(policy), the edge's own question.
   */
  bookingHeld: boolean;
}

/** The inputs that must be true or false. Typed off AbilityInputs, so a new boolean cannot be left off. */
const BOOLEAN_INPUTS: Record<{ [K in keyof AbilityInputs]-?: AbilityInputs[K] extends boolean ? K : never }[keyof AbilityInputs], true> = {
  voiceLive: true,
  whatsappLive: true,
  hasCalendarFeed: true,
  hasBookingLink: true,
  hasBookingTemplate: true,
  hasHandoffNumber: true,
  hasEscalateWhen: true,
  visionOn: true,
  bookingHeld: true,
};

export interface AbilityRowVM {
  id: "answer" | "open_times" | "booking_link" | "transfer" | "handoff" | "vision";
  title: string;
  detail: string;
  channels: { voice: boolean; whatsapp: boolean };
  /** The row on this page that supplies it. Null when nothing does. */
  runsOn: { label: string; row: string } | null;
  ready: boolean;
  /** Only the opt-in ability carries this. */
  on?: boolean;
}

/** How long a hand-off holds, in the words the page says it: "a day", "4 hours", "3 days". */
function heldFor(pauseHours: number): string {
  const hours = Math.max(1, Math.round(pauseHours));
  if (hours % 24 === 0) return hours === 24 ? "a day" : `${hours / 24} days`;
  return hours === 1 ? "an hour" : `${hours} hours`;
}

export function abilityRows(i: AbilityInputs): AbilityRowVM[] {
  if (!i || typeof i !== "object") throw new TypeError("abilityRows needs its inputs: which lines answer, what is filled in, and what the Autonomy tab holds.");
  const notBoolean = Object.keys(BOOLEAN_INPUTS).filter((k) => typeof (i as unknown as Record<string, unknown>)[k] !== "boolean");
  if (notBoolean.length) {
    throw new TypeError(`abilityRows needs true or false for ${notBoolean.join(", ")}: missing or not a boolean, each would be drawn as false.`);
  }
  const both = { voice: i.voiceLive, whatsapp: i.whatsappLive };
  // Nothing is ready on a channel that is not answering. An input filled against a
  // dead line is a setting, not an ability, and drawing it ready would tell an owner
  // the booking link goes out when there is nothing to send it.
  const answering = i.voiceLive || i.whatsappLive;

  // The link goes out on WhatsApp on both channels: in the thread, or on a call as a
  // template to the caller's own WhatsApp (retell-fn deliver({ channel: "whatsapp" })).
  // So a phone-only workspace cannot send it at all, and a call cannot send it without
  // an approved template -- whatever the booking link field holds.
  const callSendsLink = i.voiceLive && i.whatsappLive && i.hasBookingTemplate;
  // Where the booking-link row below is ready. Another row that promises the link after
  // something else promises it only here: with no WhatsApp to send it by, no link, or
  // bookings held on the Autonomy tab, "then the link" would not be true.
  const linkGoes = i.hasBookingLink && i.whatsappLive && !i.bookingHeld;
  // What is missing on this page is said first, because it is what this page can fix.
  // Then the Autonomy tab's hold: with Booking not on auto, a call's send is refused
  // (outbound-gate.ts), and a chat reply CLASSED AS A BOOKING has the link taken back out
  // (steps.ts layerTwo) -- a price or services reply still carries it, which is why the
  // sentence says "when someone asks to book" and not "it sends no link".
  const bookingDetail = !i.hasBookingLink
    ? "No booking link yet, so there is nothing to send."
    : !i.whatsappLive
      ? i.voiceLive
        ? "It goes out on WhatsApp, which isn't connected here, so on a call it offers to have someone follow up instead."
        : "It goes out on WhatsApp, which isn't connected here."
      : i.bookingHeld
        ? "Your Autonomy tab holds bookings for you to confirm, so when someone asks to book, it sends no link: it tells them someone from the team will confirm."
        : !i.voiceLive
          ? "It sends it in the thread."
          : callSendsLink
            ? "On a call it sends it to the caller's WhatsApp, when their number has one, and says so. In chat it sends it in the thread."
            : "In chat it sends it in the thread. On a call it can't yet: sending it to a caller's WhatsApp needs an approved booking-link message.";

  // The base triggers hold with no reasons at all -- they asked for a person, or it
  // cannot help -- so the owner's reasons widen the hand-off; they do not switch it on.
  const handoffWhen = i.hasEscalateWhen
    ? "On your reasons, or when a customer asks for a person or it can't help, it"
    : "When a customer asks for a person or it can't help, it";
  // The stored pause, as the Autonomy pane and the edge read it: nothing stored is a day.
  const pause = heldFor(hardLimitsWords({ pause_hours: i.pauseHours }).hours);

  return [
    {
      id: "answer",
      title: "Answer from your facts",
      // facts_used is the chat brain's (brain.ts); the phone agent reports an outcome, not its facts.
      detail: "Hours, address, services, your notes. In chat it also records which facts it leaned on, so you can see why it said what it said.",
      channels: both,
      runsOn: { label: "Name and hours", row: "name" },
      ready: answering,
    },
    {
      id: "open_times",
      title: "Say which times are open",
      // describeOpenings hands chat up to five days (availability.ts maxDays), not one.
      // With bookings held, check_availability offers a caller no times (retell-availability.ts),
      // while the call still starts with the openings (call-start.ts) and chat is still handed
      // them, so this says only what holds on both: it has them, and a request to book gets no link.
      detail: !i.hasCalendarFeed
        ? linkGoes
          ? "No calendar to read, so it does not guess at open times — it sends the link instead."
          : "No calendar to read, so it does not guess at open times."
        : i.bookingHeld
          ? "It is handed the openings on a call and in chat, but your Autonomy tab holds bookings for you to confirm, so when someone asks to book, no link follows."
          : `On a call it asks the calendar at that moment. In chat it is handed the next few days' openings with each message. It offers up to three that fit${linkGoes ? ", then the link" : ""}.`,
      channels: both,
      runsOn: { label: "The calendar it reads", row: "calendar" },
      ready: answering && i.hasCalendarFeed,
    },
    {
      id: "booking_link",
      title: "Send the booking link",
      detail: bookingDetail,
      channels: { voice: callSendsLink, whatsapp: i.whatsappLive },
      runsOn: { label: "The booking link", row: "booking_link" },
      ready: linkGoes,
    },
    {
      id: "transfer",
      title: "Put a caller through",
      // config.ts: "Use transfer_to_staff during opening hours -- it rings the line a person
      // answers, and you stay on until they pick up."
      detail: i.hasHandoffNumber
        ? "During opening hours it rings the number you gave and stays on until someone picks up. Outside them, or if nobody answers, it takes a message."
        : "No number yet, so it takes a message instead — which is better than a number nobody picks up.",
      channels: { voice: i.voiceLive, whatsapp: false },
      // One row on the page holds both halves of a hand-off (spec 4.5), and so does the prompt.
      runsOn: { label: "The transfer number", row: "handoff" },
      ready: i.voiceLive && i.hasHandoffNumber,
    },
    {
      id: "handoff",
      title: "Hand the thread to you",
      // A hand-off pauses the thread for pause_hours and no longer (inbound.ts, steps.ts);
      // after that the receptionist answers the next message itself, Needs you or not.
      detail: `${handoffWhen} stops answering, the thread turns Needs you in the Inbox, and anyone set to be alerted is emailed. It holds off for ${pause}, then answers the customer's next message itself.`,
      channels: { voice: false, whatsapp: i.whatsappLive },
      runsOn: { label: "Your reasons", row: "handoff" },
      ready: i.whatsappLive,
    },
    {
      id: "vision",
      title: "Look at a photo",
      detail: i.visionOn
        ? "It says what it sees and suggests the next step, under the rules it always keeps."
        : "Off. A photo is passed to a person.",
      channels: { voice: false, whatsapp: i.whatsappLive },
      // The switch sits with the rules it keeps, which is the row that opens it.
      runsOn: { label: i.visionOn ? "Turn it off" : "Turn it on", row: "guardrails" },
      ready: i.whatsappLive && i.visionOn,
      on: i.visionOn,
    },
  ];
}

export interface CannotRowVM {
  id: "book" | "outbound_call" | "sms";
  title: string;
  detail: string;
  /** True when it is a thing the product intends to sell later. */
  soon?: boolean;
}

const CANNOT_ROWS: readonly CannotRowVM[] = [
  {
    id: "book",
    title: "Book, move or cancel an appointment",
    detail:
      "Not a setting you could switch on. There is no appointments table in this product — nothing in it can create, move or cancel one. Your booking link does that, whichever tool is behind it.",
  },
  {
    id: "outbound_call",
    title: "Ring a customer",
    // Not "never dials out": a transfer rings the owner's number, two rows up the same card.
    detail:
      "It answers your line and never calls a customer. The only number it rings is yours, to put a caller through. A call back is a person's, and the receptionist tells you when one is wanted.",
  },
  {
    id: "sms",
    title: "Send a text message",
    detail:
      "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when. The booking link a caller receives goes to their WhatsApp.",
    soon: true,
  },
];

/**
 * Said here so nobody has to find out from a customer.
 *
 * None of these is a setting that could be switched on, and saying so on the
 * page that holds the switches is the difference between a limit and a bug.
 *
 * Texting is the one that changes: it goes live on an active carrier line that
 * is not a rehearsal filing (capabilities.ts), and on such a line "not part of
 * what is sold yet" is not true, so the row is left out. `smsLive` is checked as
 * it runs, like abilityRows' inputs: left out by an untyped page, it would read
 * as not live.
 */
export function cannotRows(i: { smsLive: boolean }): CannotRowVM[] {
  if (typeof i?.smsLive !== "boolean") {
    throw new TypeError("cannotRows needs true or false for smsLive: left out, texting would be drawn as not sold.");
  }
  return CANNOT_ROWS.filter((r) => !(r.id === "sms" && i.smsLive));
}
