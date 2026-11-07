/** Words: opening. */

import { defang } from "../../../ai/fence";
import { leadCalledByOf } from "../../../leads/search/called-by";
import { violatesNoPrices } from "../../../config/policy/prices";
import { HAND_WORDS_MAX } from "../hand";
import type { ReachOutChainInput } from "../schemas";
import {
  ANGLE_WORDS_MAX,
  OPENING_CHARS_MAX,
  OPENING_WORDS_MAX,
  linksIn,
  shoutingLine,
  slotCount,
  type WordsProblem,
  validateReachOutWords,
  wordCount,
  wordsIssueWords,
} from "./limits";

export type ChainProblem =
  | WordsProblem
  | "first_has_a_delay"
  | "step_needs_a_delay"
  | "no_name_to_sign"
  | "no_booking_link"
  | "hand_not_last"
  | "hand_words_empty"
  | "hand_words_long"
  | "first_has_a_link"
  | "first_has_their_preview";

export interface ChainIssue {
  /** The step's index, or null for the chain's own. */
  step: number | null;
  field: "subject" | "body" | "after_days" | "signed_by";
  problem: ChainProblem;
  slot?: string;
}

/**
 * A first email to a business that never heard of you carries no link (decision 0056, 7): a link in a first touch from
 * a mailbox is what spam filters weigh most. The booking link goes in the nudge. Their preview is a link like any other,
 * said in its own words: it goes in a later step (decision 0079).
 */
export function firstEmailLinkProblem(input: { subject: string | null; body: string }): ChainIssue["problem"] | null {
  if (slotCount(input.body, "their preview") > 0) return "first_has_their_preview";
  return linksIn(`${input.subject ?? ""}\n${input.body}`).length > 0 || slotCount(input.body, "booking link") > 0
    ? "first_has_a_link"
    : null;
}

/**
 * A chain, whole: each step's words, the first on day one and each after it waiting its days, and what the words ask
 * the workspace to have. {{your name}} needs a name to sign with. {{booking link}} needs the workspace's link: a chain
 * that names one the workspace does not have would hold every email it writes.
 */
export function validateReachOutChain(
  reachOutChainInput: ReachOutChainInput,
  has: { bookingLink: boolean },
): ChainIssue[] {
  const out: ChainIssue[] = [];
  reachOutChainInput.steps.forEach((s, i) => {
    if (s.hand) out.push(...handIssues(s.hand, i, reachOutChainInput.steps.length));
    else
      for (const w of validateReachOutWords({ subject: s.subject, body: s.body }, i === 0)) out.push({ step: i, ...w });
    if (i === 0 && s.after_days !== null) out.push({ step: 0, field: "after_days", problem: "first_has_a_delay" });
    const link = i === 0 && !s.hand ? firstEmailLinkProblem(s) : null;
    if (link) out.push({ step: 0, field: "body", problem: link });
    if (i > 0 && s.after_days === null) out.push({ step: i, field: "after_days", problem: "step_needs_a_delay" });
  });
  // Only the emails' words are sent: a call's or a note's are the team's own, and name no slot.
  const sentence = reachOutChainInput.steps
    .filter((s) => !s.hand)
    .map((s, i) => `${i === 0 ? (s.subject ?? "") : ""}\n${s.body}`)
    .join("\n");
  if (slotCount(sentence, "your name") > 0 && !reachOutChainInput.signed_by?.trim())
    out.push({ step: null, field: "signed_by", problem: "no_name_to_sign" });
  if (slotCount(sentence, "booking link") > 0 && !has.bookingLink)
    out.push({ step: null, field: "body", problem: "no_booking_link" });
  return out;
}

/**
 * A call or a note for the team (Part 5, G20): the chain's last step and never its first, since the chain writes before
 * it hands anyone over; with words to act on, up to 00228's 280 characters.
 */
function handIssues(hand: { words: string }, i: number, steps: number): ChainIssue[] {
  const out: ChainIssue[] = [];
  if (i === 0 || i < steps - 1) out.push({ step: i, field: "body", problem: "hand_not_last" });
  const words = hand.words.trim();
  if (!words) out.push({ step: i, field: "body", problem: "hand_words_empty" });
  else if (words.length > HAND_WORDS_MAX) out.push({ step: i, field: "body", problem: "hand_words_long" });
  return out;
}

export function chainIssueWords(chainIssue: ChainIssue): string {
  switch (chainIssue.problem) {
    case "hand_not_last":
      return "A call or a note ends the chain.";
    case "hand_words_empty":
      return "Say what to do when they come up.";
    case "hand_words_long":
      return `Keep it under ${HAND_WORDS_MAX} characters.`;
    case "first_has_a_delay":
      return "Your email goes on day one.";
    case "step_needs_a_delay":
      return "Say how many days after the one before.";
    case "no_name_to_sign":
      return "Your words name {{your name}}. Say the name you sign with.";
    case "no_booking_link":
      return "Your words name {{booking link}}. Add your booking link in Settings › Hours & booking first.";
    case "first_has_their_preview":
      return "A first email carries no link. Put their preview in a later step.";
    case "first_has_a_link":
      return "Keep your first email free of links: put your booking link in the nudge.";
    default:
      return wordsIssueWords({
        field: chainIssue.field === "subject" ? "subject" : "body",
        problem: chainIssue.problem,
        slot: chainIssue.slot,
      });
  }
}

/** The record fields an opening may lean on, as the writer names them in facts_used. */
export const OPENING_FACT_KEYS = [
  "category",
  "city",
  "rating",
  "reviews",
  "website",
  "hours",
  "about",
  "why_it_fits",
  "website_says",
] as const;

export type OpeningFactKey = (typeof OPENING_FACT_KEYS)[number];

export function isOpeningFactKey(key: string): key is OpeningFactKey {
  return (OPENING_FACT_KEYS as readonly string[]).includes(key);
}

/** A business's record: what the writer and the reader are given, and what code checks their answers against. */
export interface OpeningRecord {
  business_name: string;
  category: string | null;
  city: string | null;
  region: string | null;
  rating: number | null;
  reviews: number | null;
  website: string | null;
  /** The listing's hours, as words ("Mon–Fri 8–6"). */
  hours: string | null;
  /** The listing's own about text: the business's words, not ours. */
  about: string | null;
  /** The finder's reason it fits (lead_search_members.reason). */
  why_it_fits: string | null;
  /**
   * What the business's own website says about itself (channels siteWordsOf: its title, description, headings and first
   * lines), read when the writer is asked; null where it has none, or it was not read. Its words, not ours.
   */
  website_says: string | null;
  /**
   * What the owner asked the finder for (lead_searches.asked): the sender's words about their search, never a fact
   * about this business. The writer is told it; no opening leans on it, and its numbers back nothing.
   */
  what_you_asked: string | null;
}

export interface WrittenOpening {
  opening: string;
  angle: string;
  /** As the writer named them: a name that is no field of the record is kept, and code refuses it. */
  facts_used: string[];
}

/** A field as the writer is shown it (fenceLine): one holding only what a reader cannot see is no fact to lean on. */
export function factValue(opening: OpeningRecord, openingFactKey: OpeningFactKey): string | null {
  const v = opening[openingFactKey];
  if (v === null || v === undefined) return null;
  const s = defang(String(v)).trim();
  return s ? s : null;
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Every way the record's numbers may be written: a rating 4.9 or 5.0 and its scale ("4.9 out of 5"), a count 1,204
 * or 1204, a year in the about. What the owner searched for is not the business's, so its numbers back nothing.
 */
function recordNumbers(opening: OpeningRecord): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => {
    out.add(String(n));
    out.add(n.toLocaleString("en-US"));
    out.add(n.toFixed(1));
  };
  if (opening.rating !== null) {
    add(opening.rating);
    add(5);
  }
  if (opening.reviews !== null) add(opening.reviews);
  for (const text of [
    opening.business_name,
    opening.category,
    opening.city,
    opening.hours,
    opening.about,
    opening.why_it_fits,
    opening.website_says,
  ])
    for (const m of defang(text ?? "").matchAll(NUMBER)) out.add(m[0].replace(/,$/, ""));
  return out;
}

export const OPENING_PROBLEMS = [
  "empty",
  "too_long",
  "link",
  "brace",
  "shouting",
  "price",
  "angle",
  "unnamed_fact",
  "unbacked_number",
  "guess",
] as const;

export type OpeningProblem = (typeof OPENING_PROBLEMS)[number];

/**
 * The words a guess is said in: a sentence holding one supposes something about the business, however true it sounds,
 * and no record states a supposition. The first five are the ones the writer's and the reader's prompts quote (29 Oct
 * 2026: the reader passed "which tells me you're handling real volume—probably more calls than you can grab").
 */
export const OPENING_HEDGES = [
  "probably",
  "I'd guess",
  "tells me",
  "clearly",
  "sounds like",
  "I guess",
  "I'm guessing",
  "my guess",
  "likely",
  "presumably",
  "surely",
  "obviously",
  "no doubt",
  "I bet",
  "I'd bet",
  "I imagine",
  "I'd imagine",
  "I assume",
  "I'm assuming",
  "I suspect",
  "I'm sure",
  "chances are",
  "odds are",
  "must be",
  "must get",
  "must have",
  "which means",
  "which mean",
  "that means",
  "that mean",
  "seems like",
  "seems to",
  "seem to",
  "typically",
  "might",
  "could be",
] as const;

const HEDGE = new RegExp(`\\b(?:${OPENING_HEDGES.map((h) => h.replace(/ /g, "\\s+")).join("|")})\\b`, "i");

/** Where a clause ends: a stop, a comma or a colon before a space, a dash, a bracket; never the point in "4.9". */
const CLAUSE_END = /[.!?;:,](?=\s|$)|[—()]|\s[-–]\s/g;

/**
 * The clause an opening guesses in (OPENING_HEDGES), as it was written, or null: what a hold says the opening said. A
 * curly apostrophe reads as a straight one ("I’d guess").
 */
export function openingGuess(text: string): string | null {
  const plain = text.replace(/[‘’]/g, "'");
  const hedge = HEDGE.exec(plain);
  if (!hedge) return null;
  let start = 0;
  let end = plain.length;
  for (const m of plain.matchAll(CLAUSE_END)) {
    const at = m.index ?? 0;
    if (at < hedge.index) start = at + m[0].length;
    else if (at >= hedge.index + hedge[0].length) {
      end = at;
      break;
    }
  }
  return text.slice(start, end).trim();
}

export function isOpeningProblem(phone: string | null | undefined): phone is OpeningProblem {
  return (OPENING_PROBLEMS as readonly string[]).includes(phone ?? "");
}

/**
 * An opening as the writer wrote it, read by code before the reader reads it (§4.4, F2): something to say, forty
 * words at most, no link (the owner's words carry theirs), no brace, no line in capitals, no price, an angle of one to three
 * words, every fact it names one the record has, every number in it one the record holds, and no guess.
 */
export function checkOpening(writtenOpening: WrittenOpening, opening: OpeningRecord): OpeningProblem | null {
  // Read as the record is, so a listing's name in a sentence its own fields say matches itself, and no link hides.
  const text = defang(writtenOpening.opening).trim();
  if (!text) return "empty";
  if (wordCount(text) > OPENING_WORDS_MAX || text.length > OPENING_CHARS_MAX) return "too_long";
  // The business's own name, as its listing writes it and as it is called by, and its city are theirs, dots and all
  // ("fixit.co Repairs"); anything else shaped like an address, or an email address, is a link (a business's own host
  // is one to a spam filter too).
  let unnamed = text;
  for (const own of [opening.business_name, leadCalledByOf(opening), opening.city].map((name) =>
    defang(name ?? "").trim(),
  ))
    if (own) unnamed = unnamed.split(own).join(" ");
  if (linksIn(unnamed).length > 0 || /@/.test(unnamed)) return "link";
  if (/\{\{|\}\}/.test(text)) return "brace";
  if (shoutingLine(text)) return "shouting";
  // The platform's one price rule (policy.ts), the one every reply the receptionist writes is read by.
  if (violatesNoPrices(text)) return "price";
  const angle = writtenOpening.angle.trim().split(/\s+/).filter(Boolean);
  if (angle.length === 0 || angle.length > ANGLE_WORDS_MAX) return "angle";
  for (const k of writtenOpening.facts_used) if (!isOpeningFactKey(k) || !factValue(opening, k)) return "unnamed_fact";
  const known = recordNumbers(opening);
  for (const m of text.matchAll(NUMBER)) if (!known.has(m[0].replace(/,$/, ""))) return "unbacked_number";
  if (openingGuess(text) !== null) return "guess";
  return null;
}

/** Why a rewrite is asked for, as the writer is told it. */
export function openingProblemWords(openingProblem: OpeningProblem): string {
  switch (openingProblem) {
    case "empty":
      return "it said nothing";
    case "too_long":
      return `it ran past ${OPENING_WORDS_MAX} words or ${OPENING_CHARS_MAX} characters`;
    case "link":
      return "it carried a link or a web address";
    case "brace":
      return "it left a {{slot}} in";
    case "shouting":
      return "it had a line in capitals";
    case "price":
      return "it named a price";
    case "angle":
      return `its angle was not ${ANGLE_WORDS_MAX} words or fewer`;
    case "unnamed_fact":
      return "it leaned on a fact the record does not hold";
    case "unbacked_number":
      return "it named a number the record does not hold";
    case "guess":
      return "it guessed at something the record does not say";
  }
}
