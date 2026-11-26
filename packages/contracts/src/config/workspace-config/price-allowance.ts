/**
 * The prices the receptionist may say (decision 0051, "The owner's words"): the amounts the owner wrote, once they have
 * turned "Never quote a price" off. ONE derivation, read by every place a price is checked: a chat reply (core
 * layerTwo), a call (spokenBreach), a steer, the eval judge, and the Business tab's read-only list of what it may say.
 *
 * It reverses the owner's 20 Sep 2026 decision that a receptionist never states a price whatever the switch says: the
 * switch now does what its label says. What stays: an amount nobody wrote is still swapped out of a chat reply and
 * flagged on a call, and money (a discount, a deposit, a refund, a payment term) is a person's whatever any switch says
 * (policy.ts namesMoney, the locked money row).
 *
 * Read only from what the owner wrote as a price or a note: each service's price box, the business's notes still in
 * force, the booking notes. A note whose last day has passed on the business's day gives nothing: the composer stops
 * telling it then, by the one rule for which notes hold (compose.ts notesInForce), so an offer's price is said while the
 * offer runs and never after. Hence the zone and the clock, the ones the prompt was composed with, beside the brain.
 * Never their own words or a carried hand-written prompt, which hold examples, stale prices and prices
 * they forbid ("never say our $500 package"); never a person's notes (0007), a deal's amount (0004) or anything a
 * customer wrote. A sentence that names money, a cut ("$50 off") or forbids something gives nothing, and a share is never
 * a price. The owner's phone greeting counts too, once the switch is off and the line is the one callers hear: a price
 * the owner put in it is one they wrote. With the switch on it gives nothing, and the call's check never reads the
 * greeting's own turn (policy.ts spokenBreach), so the line is heard as written and nothing after it may repeat a price.
 *
 * The same pieces of the owner's text, as words, are what a post is held to (ownersSayings): one list of where the owner
 * writes what is theirs to say (writtenToSay), read here for its amounts and there for its sentences.
 */
import { greetingOf } from "../../voice/greeting-owner";
import { namesMoney, priceFigures } from "../policy/prices";
import type { BrainConfig } from "./brain-config-schema";
import { noteAsTold, notesInForce } from "./compose";
import { guardrailsInForce } from "./config-rules";
import { hasProfile } from "./resolve";

/** A price box that is a price and nothing else: "45", "45-60", "from 45", "desde $45", "45+". Its bare numbers count. */
const BARE_PRICE =
  /^\s*(?:from|starting at|desde|a partir de)?\s*\$?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:(?:-|–|to|a)\s*\$?\s*(\d+(?:[.,]\d{1,2})?))?\s*\+?\s*$/i;

/** Words that forbid what a sentence names, the apostrophe straight or curly: its amount is not one to say. */
const FORBIDS = /\b(?:never|don['’]?t|do not|not to|no digas|no menciones|nunca)\b/i;

/** A cut written as an amount: "$50 off", "10 de descuento". A cut is money, never a price to say. */
const CUT = /\d\s*%?\s*(?:off|de descuento|menos)\b/i;

/** One amount the receptionist may say, and where the owner wrote it, for the Business tab's list. */
export interface AllowedPrice {
  figure: string;
  /** "Haircut" for a service's price box, "Notes", "Booking notes" or "Greeting" for the rest. */
  from: string;
}

/** A piece of the owner's text, sentence by sentence, without the sentences that forbid what they name. */
const sentencesToSay = (text: string): string[] =>
  text.split(/(?<=[.!?;])\s+|\n+/).filter((s) => s.trim() && !FORBIDS.test(s));

/** The amounts in one piece of the owner's text, sentence by sentence: none from money, a cut, a ban or a share. */
function amountsIn(text: string): string[] {
  return sentencesToSay(text)
    .filter((s) => !namesMoney(s) && !CUT.test(s))
    .flatMap((s) => priceFigures(s))
    .filter((f) => /^\d+(?:\.\d+)?$/.test(f));
}

/** A price box's amounts: its bare numbers when the box is only a price, else the currency amounts it names. */
function amountsInPriceBox(note: string): string[] {
  const bare = BARE_PRICE.exec(note);
  if (bare) {
    const [, low, high] = bare;
    return [low, high].filter((n): n is string => !!n).flatMap((n) => priceFigures(`$${n}`));
  }
  return amountsIn(note);
}

/** A price box as it is said: one that is only a price reads as that price ("45-60" as "$45 to $60"), any other as written. */
function priceBoxAsSaid(note: string): string {
  const bare = BARE_PRICE.exec(note);
  if (!bare) return note;
  const [, low, high] = bare;
  return [low, high]
    .filter((n): n is string => !!n)
    .map((n) => `$${n}`)
    .join(" to ");
}

/** One piece of what the owner wrote in Settings as theirs to say: a service's price box, a note still in force, a booking note. */
interface Written {
  /** "Haircut" for a service's price box, "Notes" or "Booking notes" for the rest. */
  from: string;
  /** What they typed there: for a service its price box alone, empty where it has none. */
  text: string;
  /** A service's price box, whose bare numbers are prices. */
  priceBox: boolean;
  /** The same as it is said whole: the service with its price, the note with its last day. */
  told: string;
}

/**
 * Where the owner writes what is theirs to say, at `now`: each service's price box, the notes still in force, the booking
 * notes. The one list of it. Never their phone, their address, their hours, a service's minutes or a booking rule's
 * number, which are facts with fields of their own and no claim; never a carried hand-written prompt or their
 * instructions to the receptionist, which hold what it must not say.
 */
function writtenToSay(
  profile: NonNullable<BrainConfig["profile"]>,
  tz: string | null | undefined,
  now: Date,
): Written[] {
  return [
    ...(profile.services ?? []).map((s) => ({
      from: s.name,
      text: s.price_note ?? "",
      priceBox: true,
      told: `${s.name} ${priceBoxAsSaid(s.price_note ?? "")}`.trim(),
    })),
    ...notesInForce(profile.notes, tz, now).map((n) => ({
      from: "Notes",
      text: `${n.title}. ${n.text}`,
      priceBox: false,
      told: noteAsTold(n),
    })),
    ...(profile.booking_rules?.notes ?? []).map((n) => ({ from: "Booking notes", text: n, priceBox: false, told: n })),
  ];
}

/**
 * What the owner wrote in Settings as theirs to say at `now`, in sentences: the business's name, each service with its
 * price, the notes still in force as the receptionist is told them, and the booking notes, without any sentence that
 * forbids what it names. For a check that holds other words to the owner's: a post's, and its caption's (dashboard
 * act/files/post.ts ownersWords).
 *
 * The whole of Settings counted as said there until 14 Nov 2026: a number to call and a service's minutes each backed any
 * number, a carried prompt's "never offer a discount" backed a discount, and an offer backed its price after its last day.
 *
 * Read whatever the price switch says, and with or without a composed prompt: the switch is over what the receptionist
 * says by itself, and these words back only what their owner then reads and approves.
 */
export function ownersSayings(
  brain: Pick<BrainConfig, "profile" | "business_name"> | null | undefined,
  tz: string | null | undefined,
  now: Date,
): string[] {
  if (!brain) return [];
  const lines = brain.profile ? writtenToSay(brain.profile, tz, now).map((w) => w.told) : [];
  return [brain.business_name, ...lines].flatMap(sentencesToSay);
}

/**
 * Every amount the receptionist may say at `now`, with where it came from, or null when it may say none: the switch on
 * (the default), or a record whose details compose no prompt, where the switches change nothing (rule-strengths.ts).
 * `tz` is the zone the receptionist is composed with, the workspace's own (null where it has none, never a page's), and
 * `now` the clock it was composed at: a note counts while notesInForce says it is told.
 */
export function allowedPrices(
  brain: Pick<BrainConfig, "profile" | "business_name"> | null | undefined,
  tz: string | null | undefined,
  now: Date,
): AllowedPrice[] | null {
  const profile = brain?.profile;
  if (!profile || !hasProfile(profile) || guardrailsInForce(profile.guardrails).never_quote_prices) return null;
  const out: AllowedPrice[] = [];
  const add = (figures: string[], from: string) => {
    for (const figure of figures) if (!out.some((p) => p.figure === figure)) out.push({ figure, from });
  };
  for (const w of writtenToSay(profile, tz, now))
    if (w.text) add(w.priceBox ? amountsInPriceBox(w.text) : amountsIn(w.text), w.from);
  const greeting = profile.phone_greeting;
  const heard = greeting ? greetingOf({ name: brain.business_name, stored: greeting, paused: false }).source : null;
  if (greeting && (heard === "owner" || heard === "owner_disclosed")) add(amountsIn(greeting), "Greeting");
  return out;
}

/**
 * The allowance as the checks read it: the set of figures, or null for the strict rule (priceBreach). `tz` and `now` are
 * allowedPrices': each check passes the zone and the clock the words it checks were composed with.
 */
export function priceAllowance(
  brain: Pick<BrainConfig, "profile" | "business_name"> | null | undefined,
  tz: string | null | undefined,
  now: Date,
): ReadonlySet<string> | null {
  const list = allowedPrices(brain, tz, now);
  return list ? new Set(list.map((p) => p.figure)) : null;
}
