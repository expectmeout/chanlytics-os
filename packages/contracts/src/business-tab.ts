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

import {
  BookingRulesSchema,
  BrainConfigSchema,
  BusinessProfileSchema,
  ClosureSchema,
  DAYS,
  FALLBACK_DEFAULTS,
  GuardrailsSchema,
  INSTRUCTIONS_MAX,
  MAX_CLOSURES,
  MAX_INTERVALS_PER_DAY,
  POLICY_MODES,
  POLICY_MODE_WORDS,
  type Closure,
  type Hours,
  type PolicyMode,
} from "./config";
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
      {
        channel: "voice",
        words:
          "It has already been heard. A correction goes into the live call, and you are told while it is still up.",
      },
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
  typeof v === "string"
    ? v.trim().length > 0
    : Array.isArray(v)
      ? v.length > 0
      : !!v && Object.keys(v as object).length > 0;

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
  if (!has(p.tone))
    gaps.push({
      sentence: "It has no voice of its own yet — it answers in nobody in particular's words.",
      row: "tone",
    });

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

/**
 * The line over the week while it is being edited: whose clock these times are on, by the name the card above already
 * uses for it (openWeekWords, "in New York time"), and what they are.
 *
 * Never the IANA id. "All times America/New_York" is the machine's name for the place, on the one fold where somebody
 * is typing the hours their front door opens -- and a zone with an underscore in it reads as a setting rather than a
 * sentence. The zone row itself says the whole of it, where changing it is the point.
 */
export function hoursZoneWords(tz: string): string {
  return `All times in ${timezoneCity(tz)} time, as the receptionist states them.`;
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
export function closuresAheadWords(
  closures: readonly Closure[] | null | undefined,
  tz: string,
  now: Date,
): ClosuresAheadVM {
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
  /** The first four in the stored order, which is the order the receptionist reads them in: each name, and "180 min" where it has a duration ("180m" a screen reader may say as metres). */
  chips: { name: string; takes: string | null }[];
  /** "+29 more" past the four; null when every one is a chip. */
  more: string | null;
}

/**
 * How many chips a row of the record draws at rest, and how the rest of them are said.
 *
 * One number and one spelling for every list of chips on the page -- the services, the notes, the rules -- because
 * three of them with their own caps is three rows that wrap to different depths on the same phone. Four is the
 * canvas's Record board, measured at 390px: four chips and "+N more" is two lines, and a fifth is a third.
 */
export const CHIPS_SHOWN = 4;

/** "+3 more": the rest of a list of chips, said once, wherever a row cuts one. */
export function chipsMoreWords(n: number): string {
  return `+${count(n)} more`;
}

const SERVICE_CHIPS = CHIPS_SHOWN;
// A note that sends the price to a consultation: "quoted at consult", "by consultation".
const CONSULT = /\bconsult/i;
// A note is written by the owner and read in a sentence: its first letter goes lower unless it opens an acronym.
const inSentence = (note: string): string =>
  /^[A-Z][a-z]/.test(note) ? `${note[0]!.toLowerCase()}${note.slice(1)}` : note;

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
  const list = (Array.isArray(services) ? services : []).filter(
    (s): s is ServiceWordsInput & { name: string } => !!s && typeof s.name === "string" && s.name.trim() !== "",
  );
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
    takes: typeof s.duration_min === "number" && s.duration_min > 0 ? `${s.duration_min} min` : null,
  }));
  return {
    count: n,
    line: `${count(n)} on record`,
    priced,
    chips,
    more: n > SERVICE_CHIPS ? chipsMoreWords(n - SERVICE_CHIPS) : null,
  };
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
    [1 / 10, "a tenth"],
    [1 / 5, "a fifth"],
    [1 / 4, "a quarter"],
    [1 / 3, "a third"],
    [2 / 5, "two fifths"],
    [1 / 2, "half"],
    [3 / 5, "three fifths"],
    [2 / 3, "two thirds"],
    [3 / 4, "three quarters"],
    [4 / 5, "four fifths"],
    [9 / 10, "nine tenths"],
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

/**
 * What the services sheet's search has left in sight, said politely to a screen reader as it narrows: "11 of 33
 * services". A search that leaves none says so as the sheet's own note does ("No service is called that."), and a list
 * with no rows says it has none. With no search the page says nothing: every row is in sight, which the list shows.
 */
export function servicesFoundWords(shown: number, total: number): string {
  if (!total) return "No services yet.";
  if (!shown) return "No service is called that.";
  return `${count(shown)} of ${count(total)} ${total === 1 ? "service" : "services"}`;
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
        : `${plural(r.buffer_min, "minute", "minutes")} between appointments`,
    );
  if (isNumber(r.max_days_ahead)) parts.push(`up to ${plural(r.max_days_ahead, "day", "days")} ahead`);
  if (isNumber(r.party_max)) parts.push(`up to ${plural(r.party_max, "person", "people")}`);
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
  const shape = BookingRulesSchema.shape as unknown as Record<
    string,
    { unwrap?: () => { minValue: number | null; maxValue: number | null } } | undefined
  >;
  const words: Record<BookingRuleKey, (lo: number, hi: number) => string> = {
    lead_hours: (lo, hi) =>
      `Least notice is ${lo} to ${hi} hours; leave it empty to use ${plural(BOOKING_DEFAULTS.lead_hours, "hour", "hours")}.`,
    slot_min: (lo, hi) =>
      `A slot is ${lo} to ${hi} minutes; leave it empty for the calendar’s ${plural(BOOKING_DEFAULTS.slot_min, "minute", "minutes")}.`,
    buffer_min: (lo, hi) =>
      `The gap is ${lo} to ${hi} minutes; leave it empty for ${BOOKING_DEFAULTS.buffer_min === 0 ? "none" : plural(BOOKING_DEFAULTS.buffer_min, "minute", "minutes")}.`,
    max_days_ahead: (lo, hi) =>
      `Times are offered ${lo} to ${hi} days ahead; leave it empty to use ${plural(BOOKING_DEFAULTS.max_days_ahead, "day", "days")}.`,
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
  stops:
    "Saved like this, the receptionist stops being given the details on this page and answers from its stored instructions.",
  starts:
    "Saved like this, the receptionist starts being given the details on this page, and the instructions it follows today are carried in beneath them.",
} as const;

export type ProfileCrossing = keyof typeof PROFILE_CROSSING_WORDS;

/* ---- How it answers ---- */

/**
 * The three voices the voice's fold offers to start from (the canvas's Group-Answers board): a press puts the sentence
 * in the box, and the owner makes it their own from there. Each is what the prompt then says after "Tone: ", for any
 * trade, and well inside the 200 characters the profile keeps (BusinessProfileSchema.tone; a vm test holds them to it).
 */
export const TONE_PRESETS: readonly { label: string; tone: string }[] = [
  {
    label: "Warm and brief",
    tone: "Warm and brief. Friendly, a sentence or two at a time, and straight to what the customer asked.",
  },
  {
    label: "Professional, no small talk",
    tone: "Professional and to the point. Polite and clear, with no small talk and no exclamation marks.",
  },
  {
    label: "Chatty, first names",
    tone: "Chatty and relaxed. Uses the customer's first name when it has one, and sounds like a friendly front desk.",
  },
];

/**
 * When the receptionist hands a customer over whatever the owner wrote: the composer's own triggers, on both channels
 * (config.ts, the two hand-off blocks: a person asked for, someone upset, a question its instructions do not cover), in
 * the words the page says them in. One clause, for the ability card and the hand-off row alike.
 */
const HANDED_OVER_ANYWAY = "a customer asks for a person or it can't help";

/**
 * Words cut to at most `max` characters at a word boundary, with an ellipsis where anything was cut: a row at rest
 * quotes the opening of something long, never the middle of a word.
 */
const cutAtWord = (text: string, max: number): string => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const at = head.lastIndexOf(" ");
  const cut = (at > 0 ? head.slice(0, at) : t.slice(0, max)).replace(/[\s,;:·—–-]+$/u, "");
  return `${cut}…`;
};

/**
 * What happens when a WhatsApp customer is handed over, checked against the edge: the composer teaches the model to end
 * its reply with the [[HUMAN]] token (config.ts, the chat hand-off block), and a reply carrying it is sent with the token
 * taken out; then the thread is paused for the Autonomy reply row's pause_hours (whatsapp/inbound.ts, a day when
 * nothing is stored), an escalation is opened, which is what turns the thread Needs you in the Inbox, and the alert goes
 * to the addresses the Notifications tab sets (notify.ts chooseAddressing: notifications.escalation_emails). After the
 * pause it answers the next message itself. The canvas said "It stops answering, marks the thread Needs you and emails
 * your staff": the email goes to whoever is on that list, which may be nobody, and the pause ends.
 *
 * The ability card's hand-off row and the hand-off row's fold both say it, so it is written once, here. `pauseHours` is
 * that row's stored pause_hours as it is stored, read the way the Autonomy pane reads it (hardLimitsWords).
 */
export function handoffChatWords(i: { hasEscalateWhen: boolean; pauseHours: unknown }): string {
  const when = i.hasEscalateWhen
    ? `On your reasons, or when ${HANDED_OVER_ANYWAY}, it`
    : `When ${HANDED_OVER_ANYWAY}, it`;
  const pause = heldFor(hardLimitsWords({ pause_hours: i.pauseHours }).hours);
  return `${when} stops answering, the thread turns Needs you in the Inbox, and anyone set to be alerted is emailed. It holds off for ${pause}, then answers the customer's next message itself.`;
}

/**
 * What a call does with a caller who needs a person (config.ts, the call hand-off block: "Use transfer_to_staff during
 * opening hours -- it rings the line a person answers, and you stay on until they pick up"), for the ability card's
 * transfer row and the hand-off row's fold alike.
 */
function transferWords(hasHandoffNumber: boolean): string {
  return hasHandoffNumber
    ? "During opening hours it rings the number you gave and stays on until someone picks up. Outside them, or if nobody answers, it takes a message."
    : "No number yet, so it takes a message instead — which is better than a number nobody picks up.";
}

/**
 * The hand-off on a call, under the hand-off row's reasons: what a transfer does, and that the reasons count there too.
 * They do: the composer writes them under the call's hand-off heading as it writes them under the chat's ("and
 * whenever:"). The canvas said the phone agent's own transfer kept the reasons from reaching it, which was not true.
 */
export function handoffCallWords(i: { hasHandoffNumber: boolean; hasEscalateWhen: boolean }): string {
  return `${i.hasEscalateWhen ? "Your reasons reach a call too. " : ""}${transferWords(!!i.hasHandoffNumber)}`;
}

/** The hand-off row at rest: one line for each channel, under its chip. */
export interface HandoffWordsVM {
  /** "on 2 reasons — They ask for a person, for the owner · They are upset…"; with none, when it hands over anyway. */
  chat: string;
  /** "transfers to +1 (646) 932-5775", or "takes a message" with no number. */
  phone: string;
}

/** How many characters of the reasons the row quotes at rest, joined, before it cuts at a word. */
const HANDOFF_REASONS_SHOWN = 64;

/**
 * The hand-off row at rest (the canvas's Record board): how many reasons the owner gave and the opening of them, and
 * what a call does. `transfer` is the transfer number as the page shows it (the settings read's resolved fact, written
 * for people); the row only states it, and the Who you are row is where it is changed. A stored list that is not one
 * (a hand-edited record) is no reasons, never a throw: the page draws this as it draws.
 */
export function handoffWords(
  reasons: readonly string[] | null | undefined,
  transfer: string | null | undefined,
): HandoffWordsVM {
  const list = (Array.isArray(reasons) ? reasons : [])
    .filter((r): r is string => typeof r === "string" && r.trim() !== "")
    .map((r) => r.trim());
  const n = list.length;
  const number = typeof transfer === "string" ? transfer.trim() : "";
  return {
    chat: n
      ? `on ${plural(n, "reason", "reasons")} — ${cutAtWord(list.join(" · "), HANDOFF_REASONS_SHOWN)}`
      : `when ${HANDED_OVER_ANYWAY}`,
    phone: number ? `transfers to ${number}` : "takes a message",
  };
}

/** The notes row at rest: the first titles as chips, and how many more. */
export interface NotesWordsVM {
  count: number;
  /** The first four titles, in the stored order, which is the order the receptionist reads them in. */
  chips: string[];
  /** "+3 more" past the four; null when every one is a chip. */
  more: string | null;
}

const NOTE_CHIPS = CHIPS_SHOWN;

/**
 * The notes row at rest (the canvas's Record board): each note by its title, four at most, and "+N more" past them. A
 * note with no title is a row nobody finished (the schema needs one), and is not counted; a stored list that is not one
 * is none.
 */
export function notesWords(
  notes: readonly ({ title?: string | null } | null | undefined)[] | null | undefined,
): NotesWordsVM {
  const titles = (Array.isArray(notes) ? notes : [])
    .map((n) => (n && typeof n.title === "string" ? n.title.trim() : ""))
    .filter((t) => t !== "");
  const n = titles.length;
  return {
    count: n,
    chips: titles.slice(0, NOTE_CHIPS),
    more: n > NOTE_CHIPS ? chipsMoreWords(n - NOTE_CHIPS) : null,
  };
}

/** The owner's own words, at rest and in their box. */
export interface InstructionsWordsVM {
  /** Their opening, quoted and cut at a word; null with nothing written. */
  opening: string | null;
  /** "339 of 20,000 characters", for the foot of the box that edits them; null with nothing written. */
  limit: string | null;
}

/** How many characters of the owner's words the row quotes at rest, before it cuts at a word. */
const OPENING_SHOWN = 72;

/**
 * "In your own words": at rest, their opening, quoted, and nothing else.
 *
 * The row said "1,180 characters" first, in front of the words themselves. A length is not a fact an owner can do
 * anything about while they are reading the page, and on a phone it took the space the opening needed. What IS worth
 * saying is how much room is left, and that belongs beside the box where words are typed -- with the limit in it, so
 * the number has something to mean (INSTRUCTIONS_MAX, the save's own).
 */
export function instructionsWords(text: string | null | undefined): InstructionsWordsVM {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return { opening: null, limit: null };
  return {
    opening: `“${cutAtWord(t, OPENING_SHOWN)}”`,
    limit: `${count(t.length)} of ${count(INSTRUCTIONS_MAX)} characters`,
  };
}

/** The fallbacks row at rest. */
export interface FallbacksWordsVM {
  /** "3 messages, in your words", or "3 messages, the product's wording" when none differs from it. */
  line: string;
}

/**
 * The three messages sent in the business's name when the receptionist cannot answer, at rest: how many there are, and
 * whose words they are in.
 *
 * ONE line. It was two -- "3 messages sent in your name" and "3 differ from the default wording" -- and the second
 * counts a difference nobody can act on from the row: which message differs, and the press that puts the product's
 * wording back, are both inside the fold, on the message itself.
 *
 * "The product's wording", not "you wrote": a workspace set up before the default wording was written was given
 * messages with its details copied in (config.ts, S5), which are neither the default nor the owner's. A message stored
 * empty is sent in the default wording (fallbackMessages), so it counts as the default; so does a workspace that
 * stores none.
 */
export function fallbacksWords(
  fallbacks: Partial<Record<keyof typeof FALLBACK_DEFAULTS, string | null>> | null | undefined,
): FallbacksWordsVM {
  const keys = Object.keys(FALLBACK_DEFAULTS) as (keyof typeof FALLBACK_DEFAULTS)[];
  const f = fallbacks && typeof fallbacks === "object" ? fallbacks : {};
  const differ = keys.filter((k) => {
    const t = typeof f[k] === "string" ? (f[k] as string).trim() : "";
    return t !== "" && t !== FALLBACK_DEFAULTS[k];
  }).length;
  return { line: `${count(keys.length)} messages, ${differ ? "in your words" : "the product's wording"}` };
}

/**
 * What the rules fold says, once, on a record whose details compose nothing (config.ts hasProfile false). The resolver
 * answers such a record with its stored prompt as it stands, and adds after it only the Autonomy tab's rules
 * (resolveSystemPrompt's first branch), so none of the four switches changes a word it is TOLD, and there is no rules
 * block for the fold to show. It says nothing of what the receptionist does: the price detector reads every reply
 * whatever the profile holds (whatsapp/steps.ts layerTwo, and spokenBreach on a call), and nothing in the product can
 * confirm a booking anyway. It first said "these four rules do not reach it", which Phase 4 would have drawn beside the
 * price rule's "Checked, not just told". The prompt view says the same of that prompt (prompt-blocks.ts: "None of the
 * details on this page are composed into it yet."), and the two must agree; Phase 4's rules at three strengths say it
 * with these words too (the plan's M-2).
 */
export const RULES_WITHOUT_FIELDS_WORDS =
  "Nothing on this page is composed into what it reads yet, so these four switches change nothing it is told: it answers from its own stored instructions, followed only by any rules your Autonomy tab adds.";

/**
 * What the receptionist can do, and what it cannot.
 *
 * The tab sets the inputs to three of the phone agent's four tools
 * (`check_availability`, `send_booking_link`, `transfer_to_staff`) and has
 * never said a tool exists. An owner could not know their phone agent sends
 * the booking link to a caller's WhatsApp.
 *
 * Computed from what the records show, never typed: an ability is ready only
 * when its channel is live and its input is filled. A channel says what the
 * receptionist DOES there, input and all, not which channel the ability belongs
 * to -- a lit phone beside "No number yet, so it takes a message instead" is a
 * row disagreeing with itself, and the card's one signal is the pair of them.
 * So `ready` is exactly "one of the two channels does it". Every sentence below was
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
  /**
   * The Autonomy tab's REPLIES row, exactly as stored -- a separate row from Booking,
   * set independently, and the one that decides whether the receptionist speaks at all.
   *
   * On "ask" or "never" the WhatsApp receptionist composes no reply
   * (packages/core/src/inbound/reply-posture.ts, which every inbound message asks) and a
   * call's booking-link send is refused as a policy_hold
   * (apps/edge/lib/receptionist/outbound-gate.ts). So every chat ability on the card is
   * held at once, by one cause with one fix on another tab -- which is why the words for
   * it come back beside the rows, to be said ONCE, and not on each of six rows.
   *
   * Checked as it runs like the booleans, and for the same reason: an untyped page that
   * left it out would draw six abilities on a mode nobody chose. The page reads the row's
   * mode with the edge's own default for a missing row ("ask", reply-posture.ts).
   */
  replyMode: PolicyMode;
}

/** The inputs that must be true or false. Typed off AbilityInputs, so a new boolean cannot be left off. */
const BOOLEAN_INPUTS: Record<
  { [K in keyof AbilityInputs]-?: AbilityInputs[K] extends boolean ? K : never }[keyof AbilityInputs],
  true
> = {
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
  /**
   * What stops this ability is a row of THIS page, still empty (or a switch still off).
   *
   * The difference between a sentence worth drawing and one worth keeping out of the way: a
   * transfer with no number takes a message instead, and the number is two cards up, so the
   * card says so and offers the row. A channel that is not connected, bookings held, replies
   * held -- none of those is filled in here, and each is one cause the card states once,
   * rather than six rows saying the same thing six times.
   */
  missing: boolean;
  /** Only the opt-in ability carries this. */
  on?: boolean;
}

/**
 * What each of a row's two channel glyphs is called.
 *
 * The card draws chat and phone beside every ability, lit for a channel that has it and dim
 * for one that does not. Dim is a colour: it says nothing to a screen reader, and little to
 * anyone reading a phone in daylight. So each glyph carries its name, and the names live here
 * rather than in the JSX that draws them -- one spelling for the four states.
 */
export const ABILITY_CHANNEL_WORDS: Record<"whatsapp" | "voice", { has: string; not: string }> = {
  whatsapp: { has: "in chat", not: "not in chat" },
  voice: { has: "on a call", not: "not on a call" },
};

/**
 * The card: its rows, and what holds the whole card back, said once.
 *
 * `held` is null unless the Autonomy tab's Replies row keeps the receptionist from
 * answering. Six rows each repeating that one sentence is the page shouting; the Quiet
 * board's rule is that a refused act is absent and the page says why once, so the sentence
 * comes back here, with the tab that fixes it.
 */
export interface AbilitiesVM {
  rows: AbilityRowVM[];
  /** `door` is what the press to that tab says, so the page draws the words and types none of them. */
  held: { sentence: string; door: string; to: "admin/autonomy" } | null;
}

/** How long a hand-off holds, in the words the page says it: "a day", "4 hours", "3 days". */
function heldFor(pauseHours: number): string {
  const hours = Math.max(1, Math.round(pauseHours));
  if (hours % 24 === 0) return hours === 24 ? "a day" : `${hours / 24} days`;
  return hours === 1 ? "an hour" : `${hours} hours`;
}

export function abilityRows(i: AbilityInputs): AbilitiesVM {
  if (!i || typeof i !== "object")
    throw new TypeError(
      "abilityRows needs its inputs: which lines answer, what is filled in, and what the Autonomy tab holds.",
    );
  const notBoolean = Object.keys(BOOLEAN_INPUTS).filter(
    (k) => typeof (i as unknown as Record<string, unknown>)[k] !== "boolean",
  );
  if (notBoolean.length) {
    throw new TypeError(
      `abilityRows needs true or false for ${notBoolean.join(", ")}: missing or not a boolean, each would be drawn as false.`,
    );
  }
  if (!POLICY_MODES.includes(i.replyMode)) {
    throw new TypeError(
      `abilityRows needs replyMode, the Autonomy tab's Replies row (${POLICY_MODES.join(", ")}), not ${JSON.stringify(i.replyMode)}: every chat ability turns on it.`,
    );
  }
  // The Replies row holds the receptionist back: nothing is composed in chat, and a call's
  // booking-link send is refused. Said once for the card (`held` below), never on each row.
  const repliesHeld = i.replyMode === "ask" || i.replyMode === "never";
  // A chat ability needs a WhatsApp number that answers AND leave to answer with it.
  const chatAnswers = i.whatsappLive && !repliesHeld;
  const both = { voice: i.voiceLive, whatsapp: chatAnswers };
  // Nothing is ready on a channel that is not answering. An input filled against a
  // dead line is a setting, not an ability, and drawing it ready would tell an owner
  // the booking link goes out when there is nothing to send it.
  const answering = i.voiceLive || chatAnswers;

  // The link goes out on WhatsApp on both channels: in the thread, or on a call as a
  // template to the caller's own WhatsApp (retell-fn deliver({ channel: "whatsapp" })).
  // So a phone-only workspace cannot send it at all, and a call cannot send it without
  // an approved template -- whatever the booking link field holds.
  const callSendsLink = i.voiceLive && i.whatsappLive && i.hasBookingTemplate;
  // Where the booking-link row below is ready. Another row that promises the link after
  // something else promises it only here: with no WhatsApp to send it by, no link, or
  // bookings held on the Autonomy tab, "then the link" would not be true.
  const linkGoes = i.hasBookingLink && chatAnswers && !i.bookingHeld;
  // ...and whether the row ABOVE may promise it without naming a channel. The link goes by WhatsApp on
  // both channels, but a call sends it as a template, so a workspace on both lines with no approved
  // booking-link template sends it in chat and not on a call (retell-fn's deliver has no template to
  // send). Said unqualified, the openings row told such a workspace its call offers times "then the link".
  const linkIsChatsAlone = linkGoes && i.voiceLive && !callSendsLink;
  const inChat = linkIsChatsAlone ? " in chat" : "";
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

  const rows: AbilityRowVM[] = [
    {
      id: "answer",
      title: "Answer from your facts",
      // facts_used is the chat brain's (brain.ts); the phone agent reports an outcome, not its facts.
      detail:
        "Hours, address, services, your notes. In chat it also records which facts it leaned on, so you can see why it said what it said.",
      channels: both,
      runsOn: { label: "Name and hours", row: "name" },
      ready: answering,
      // The facts it answers from are the standing line's subject, at the top of the page.
      missing: false,
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
          ? `No calendar to read, so it does not guess at open times —${inChat} it sends the link instead.`
          : "No calendar to read, so it does not guess at open times."
        : i.bookingHeld
          ? "It is handed the openings on a call and in chat, but your Autonomy tab holds bookings for you to confirm, so when someone asks to book, no link follows."
          : `On a call it asks the calendar at that moment. In chat it is handed the next few days' openings with each message. It offers up to three that fit${linkGoes ? `, then the link${inChat}` : ""}.`,
      channels: { voice: i.voiceLive && i.hasCalendarFeed, whatsapp: chatAnswers && i.hasCalendarFeed },
      runsOn: { label: "The calendar it reads", row: "calendar" },
      ready: answering && i.hasCalendarFeed,
      missing: !i.hasCalendarFeed,
    },
    {
      id: "booking_link",
      title: "Send the booking link",
      detail: bookingDetail,
      // The call's send goes through the same outbound gate the Replies row holds, so a
      // workspace whose replies are held has no channel here at all -- and neither has one
      // where there is no link to send, or where the Autonomy tab confirms bookings itself.
      channels: { voice: linkGoes && callSendsLink && !repliesHeld, whatsapp: linkGoes },
      runsOn: { label: "The booking link", row: "booking_link" },
      ready: linkGoes,
      missing: !i.hasBookingLink,
    },
    {
      id: "transfer",
      title: "Put a caller through",
      // What a transfer does, in the words the hand-off row's fold says it in too (transferWords).
      detail: transferWords(i.hasHandoffNumber),
      channels: { voice: i.voiceLive && i.hasHandoffNumber, whatsapp: false },
      // The transfer number's one editor, Who you are's "Transfers a caller to" (the plan's Task 3.2 decision): the
      // hand-off row (escalate_when) shows the number and opens this same row, and edits only the reasons.
      runsOn: { label: "The transfer number", row: "handoff_number" },
      ready: i.voiceLive && i.hasHandoffNumber,
      missing: !i.hasHandoffNumber,
    },
    {
      id: "handoff",
      title: "Hand the thread to you",
      // A hand-off pauses the thread for pause_hours and no longer (inbound.ts, steps.ts); after that the receptionist
      // answers the next message itself, Needs you or not. The base triggers hold with no reasons at all -- they asked
      // for a person, or it cannot help -- so the owner's reasons widen the hand-off; they do not switch it on. The
      // hand-off row's fold says it in the same words (handoffChatWords).
      detail: handoffChatWords({ hasEscalateWhen: i.hasEscalateWhen, pauseHours: i.pauseHours }),
      channels: { voice: false, whatsapp: chatAnswers },
      runsOn: { label: "Your reasons", row: "escalate_when" },
      ready: chatAnswers,
      // The base triggers hold with no reasons at all, so nothing here is missing.
      missing: false,
    },
    {
      id: "vision",
      title: "Look at a photo",
      detail: i.visionOn
        ? "It says what it sees and suggests the next step, under the rules it always keeps."
        : "Off. A photo is passed to a person.",
      channels: { voice: false, whatsapp: chatAnswers && i.visionOn },
      // The switch sits with the rules it keeps, which is the row that opens it.
      runsOn: { label: i.visionOn ? "Turn it off" : "Turn it on", row: "guardrails" },
      ready: chatAnswers && i.visionOn,
      // Off is the one state an owner changes from this card.
      missing: !i.visionOn,
      on: i.visionOn,
    },
  ];

  // The mode in the pane's own words, never the stored auto|veto|ask|never (#657). The call
  // clause only where there is a call: a workspace on WhatsApp alone is promised nothing about one.
  const held = repliesHeld
    ? {
        sentence: `Replies on your Autonomy tab: it ${POLICY_MODE_WORDS[i.replyMode].chip} — ${POLICY_MODE_WORDS[i.replyMode].sub}. Until that changes it writes no WhatsApp reply at all, so nothing here happens in chat.${i.voiceLive ? " A call still answers, and cannot send the booking link." : ""}`,
        door: "Your Autonomy tab",
        to: "admin/autonomy" as const,
      }
    : null;
  return { rows, held };
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

/* ------------------------------------ what a fold will not take ------------------------------------ */

/**
 * The most of each thing a fold of the tab may hold, read off the schema that would refuse the save.
 *
 * Every one of these was a literal in the page (`BT_LIMITS`, pages/business-tab-folds.jsx) beside a sentence carrying
 * the same number a second time, so a cap widened in the schema left the page offering less than the save would take
 * and the sentence naming a number neither of them used. Read here, the schema is the one place a number lives, and
 * `profileRefusal` below writes the sentence from this table -- the way `bookingRuleRefusal` writes the five booking
 * rules' from `BookingRulesSchema`'s own bounds.
 *
 * `closures` and `shifts` are the two the save's own checks already published (`MAX_CLOSURES`,
 * `MAX_INTERVALS_PER_DAY`); they are here so a fold asks one table rather than two.
 *
 * Built inside a call marked pure, as GUARDRAIL_KEYS is: a top-level call is a side effect to the bundler, which
 * would keep this in the four dists that bundle contracts and never use it.
 */
export const PROFILE_LIMITS: Readonly<Record<ProfileLimitKey, number>> = /* @__PURE__ */ (() => {
  // A cap, however the schema states it: a string's own `maxLength`, or an array's `max_length` check.
  const cap = (schema: unknown): number => {
    const s = schema as {
      maxLength?: number | null;
      def?: { checks?: { _zod?: { def?: { check?: string; maximum?: number } } }[] };
    };
    if (typeof s.maxLength === "number") return s.maxLength;
    for (const c of s.def?.checks ?? []) {
      const d = c?._zod?.def;
      if (d?.check === "max_length" && typeof d.maximum === "number") return d.maximum;
    }
    throw new TypeError(
      "PROFILE_LIMITS: the schema states no maximum, so the page would offer a size the save refuses.",
    );
  };
  const floor = (schema: unknown): number => {
    const s = schema as { minLength?: number | null };
    if (typeof s.minLength !== "number") throw new TypeError("PROFILE_LIMITS: the schema states no minimum.");
    return s.minLength;
  };
  const opt = <T>(schema: { unwrap(): T }): T => schema.unwrap();
  const p = BusinessProfileSchema.shape;
  const service = opt(p.services).element.shape;
  const note = opt(p.notes).element.shape;
  const rules = BookingRulesSchema.shape;
  const minutes = opt(service.duration_min) as unknown as { maxValue: number | null };
  if (minutes.maxValue == null) throw new TypeError("PROFILE_LIMITS: a service's minutes state no maximum.");
  return {
    tone: cap(opt(p.tone)),
    services: cap(opt(p.services)),
    serviceName: cap(service.name),
    serviceMinutes: minutes.maxValue,
    servicePrice: cap(opt(service.price_note)),
    languages: cap(opt(p.languages)),
    languageMin: floor(opt(p.languages).element),
    languageMax: cap(opt(p.languages).element),
    reasons: cap(opt(p.escalate_when)),
    reason: cap(opt(p.escalate_when).element),
    consultFirst: cap(opt(rules.consult_first)),
    consultFirstLine: cap(opt(rules.consult_first).element),
    ruleNotes: cap(opt(rules.notes)),
    ruleNote: cap(opt(rules.notes).element),
    notes: cap(opt(p.notes)),
    noteTitle: cap(note.title),
    noteText: cap(note.text),
    closureNote: cap(opt(ClosureSchema.shape.note)),
    closures: MAX_CLOSURES,
    shifts: MAX_INTERVALS_PER_DAY,
    instructions: INSTRUCTIONS_MAX,
    message: cap(BrainConfigSchema.shape.fallbacks.shape.greeting),
  };
})();

/** Everything `PROFILE_LIMITS` holds a number for; `profileRefusal` says what each one refuses in. */
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

/** What `profileRefusal` will say a sentence for: the caps a fold refuses AT, and the one range a language sits in. */
export type ProfileRefusalKey =
  | "tone"
  | "services"
  | "serviceName"
  | "serviceMinutes"
  | "servicePrice"
  | "languages"
  | "language"
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
 * What a fold says under the box when what is typed is more than the save would take.
 *
 * Each sentence names the same unit as the limit it is written from, and the limit is the schema's, so the two cannot
 * disagree: the page said "At most 2,000 characters" beside a check reading `t.length > 2000`, the one number written
 * twice in one line. `seen` is what was measured -- characters, rows, a day's shifts -- and is said back where the
 * sentence has a place for it; `of` names what it was measured on, a day for `shifts` and the word itself for
 * `language`. A key that is not one of these is a TypeError, since the page is untyped.
 */
export function profileRefusal(key: ProfileRefusalKey, seen?: number, of?: string): string {
  const L = PROFILE_LIMITS;
  const chars = (max: number): string =>
    `At most ${count(max)} characters${seen === undefined ? "." : ` — this is ${count(seen)}.`}`;
  const lines = (max: number, one: string, many: string): string =>
    `At most ${plural(max, one, many)}, one to a line${seen === undefined ? "." : ` — this is ${count(seen)}.`}`;
  const words: Record<ProfileRefusalKey, () => string> = {
    tone: () => chars(L.tone),
    services: () => `At most ${plural(L.services, "service", "services")}.`,
    serviceName: () => chars(L.serviceName),
    serviceMinutes: () => `At most ${count(L.serviceMinutes)} minutes, a whole day.`,
    servicePrice: () => chars(L.servicePrice),
    languages: () => `At most ${plural(L.languages, "language", "languages")}.`,
    language: () => `“${of ?? ""}” is not a language's name: ${L.languageMin} to ${L.languageMax} characters.`,
    reasons: () => lines(L.reasons, "reason", "reasons"),
    reason: () => `Each reason is at most ${count(L.reason)} characters.`,
    consultFirst: () => lines(L.consultFirst, "service", "services"),
    consultFirstLine: () => `Each service is at most ${count(L.consultFirstLine)} characters.`,
    ruleNotes: () => lines(L.ruleNotes, "note", "notes"),
    ruleNote: () => `Each note is at most ${count(L.ruleNote)} characters.`,
    notes: () => `At most ${plural(L.notes, "note", "notes")}.`,
    noteTitle: () =>
      `A note's title is at most ${count(L.noteTitle)} characters${seen === undefined ? "." : ` — this is ${count(seen)}.`}`,
    noteText: () =>
      `A note's text is at most ${count(L.noteText)} characters${seen === undefined ? "." : ` — this is ${count(seen)}.`}`,
    closures: () => `At most ${plural(L.closures, "closed day", "closed days")}. Dates that have passed can go.`,
    closureNote: () => chars(L.closureNote),
    shifts: () =>
      `At most ${plural(L.shifts, "shift", "shifts")} in a day — ${of ?? "that day"} has ${count(seen ?? 0)}.`,
    instructions: () => chars(L.instructions),
    message: () => chars(L.message),
  };
  const say = Object.prototype.hasOwnProperty.call(words, key) ? words[key] : null;
  if (!say) {
    throw new TypeError(
      `profileRefusal knows the tab's own caps (${Object.keys(words).join(", ")}), not ${JSON.stringify(key)}.`,
    );
  }
  return say();
}

/**
 * A detail written OUT in one of the three messages, where the name for it would keep it current.
 *
 * `{business}`, `{booking link}` and `{phone}` are filled in as each message goes out, so a message that spells the
 * link or the number instead says what was true when it was typed and nothing after: a workspace that changed its
 * booking link went on sending the old one, in its own name. The link is known exactly (the brain holds it); a number
 * is recognised by its shape, since the one a customer would ring need not be the one on file.
 *
 * Answers "link", "number" or null, most-certain first: a message holding both is told about the link, which is the
 * one the page can name exactly.
 */
const WRITTEN_OUT_NUMBER = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
export function writtenOutDetail(
  text: string | null | undefined,
  bookingLink: string | null | undefined,
): "link" | "number" | null {
  const said = typeof text === "string" ? text : "";
  const link = typeof bookingLink === "string" ? bookingLink.trim() : "";
  if (link && said.includes(link)) return "link";
  return WRITTEN_OUT_NUMBER.test(said) ? "number" : null;
}
