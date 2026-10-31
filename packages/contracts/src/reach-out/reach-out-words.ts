/**
 * A reach-out's words (Reach out, Part 4; spec §4.3–4.4): the slots a step may name, what a step's words must be to be
 * saved, the chain the sheet saves, and the code half of the check before each send. Pure. The sheet, the save route,
 * the check on the edge and its preview ask the same rules, so none of them passes what another refuses.
 *
 * A reach-out's email is an email like any other (One message, every channel, step 5): its slots are a slot set
 * (templates/slot-sets.ts), checked by the one `emailIssues` over its own rules, and filled by the one fill; what is
 * this module's own is what a cold email adds to those rules, and its words.
 *
 *   REACH_OUT_SLOTS          the eleven a step may name; any other {{…}} is refused at the save, never met at a send. The
 *                            person's four (00430: {{first name}}, {{company}}, {{title}}, {{role}}) are filled from a
 *                            company's addressee, and each has its fallback for a lead with none (REACH_OUT_SLOT_FALLBACKS)
 *   REACH_OUT_SLOT_SET       the eleven as a slot set, which every reader and the fill take. The last, {{their preview}}
 *                            (decision 0079), is the lead's own receptionist's link: a link like {{booking link}}, so a
 *                            step's one, and never in a first email
 *   reachOutRules            what a step's email keeps to, as an email's rules: the shared checks over this set, and the
 *                            cold email's own
 *   validateReachOutWords    one step's words: its subject (the first step's only), its body, its slots, its length,
 *                            one link at most, no line in capitals
 *   validateReachOutChain    a chain as the sheet saves it (reach-out-schemas.ts ReachOutChainSchema): its name, its
 *                            search, its steps and their days, its pace, its mailboxes, and what its words ask the
 *                            workspace to have
 *   checkOpening             an opening as the writer wrote it, read by code (F2)
 *   chainOf, customerDomainOf    the check's two code holds (F4, F6); a business's own site is the lead cleaner's siteHost
 *   holdWords, holdDoors     what a held send says, and what its owner can do about it (F3)
 *   HOLDS_INCLUDED_FOR_CHAIN the holds an owner's Include carries to the lead's later sends in the chain (R7); an Include
 *                            past any other covers that one email
 */
import { isFreeMail } from "../email/free-mail";
import { posesAsReply } from "../email/email-subject";
import { languageName } from "../templates/template-languages";
import { leadCalledByOf } from "../leads/search/called-by";
import { siteHost } from "../leads/search/clean";
import { violatesNoPrices } from "../config/policy";
import { normalizeEmail } from "../shared/email-address";
import { emailIssues } from "../templates/message-versions";
import type { EmailIssue, EmailProblem, EmailRules } from "../templates/message-versions";
import { namedSlots, slotCountIn, slotFault, slotMentions, slotsOut } from "../templates/slot-sets";
import type { SlotSet } from "../templates/slot-sets";
import { HAND_WORDS_MAX } from "./reach-out-hand";
import type { ReachOutChainInput } from "./reach-out-schemas";

export const REACH_OUT_SLOTS = [
  "opening",
  "business",
  "city",
  "your name",
  "your business",
  "booking link",
  // A company's addressee (00430), after the six: a slot's place is its number in a stored version ({{2}} is business),
  // so a slot is only ever added at the end.
  "first name",
  "company",
  "title",
  "role",
  // A lead's own receptionist's link (decision 0079): the sender fills it with the lead's preview, made at the first
  // send that names it.
  "their preview",
] as const;
export type ReachOutSlot = (typeof REACH_OUT_SLOTS)[number];

/**
 * What a person's slot says for a lead that names nobody: {{first name}} greets them as every message does ("Hi there",
 * templates' resolveParams), and {{company}} is the business's own name, which every lead has. {{title}} and {{role}}
 * claim something of a person, so they have no fallback: an email that names one for a lead with nobody named is not
 * written (missing_value), never sent with a guess.
 */
export const REACH_OUT_SLOT_FALLBACKS = {
  "first name": "there",
} as const satisfies Partial<Record<ReachOutSlot, string>>;

/** What the editor calls each slot, in its chips and its menu. */
const REACH_OUT_SLOT_LABELS: Record<ReachOutSlot, string> = {
  opening: "Opening",
  "first name": "First name",
  business: "Their business",
  company: "Their company",
  title: "Their title",
  role: "Their role",
  city: "Their city",
  "your name": "Your name",
  "your business": "Your business",
  "booking link": "Booking link",
  "their preview": "Their preview",
};

/** The ten as a slot set: named, in the sheet's order. Every reader of a step's words and the fill take this one. */
export const REACH_OUT_SLOT_SET: SlotSet = namedSlots(
  REACH_OUT_SLOTS,
  REACH_OUT_SLOTS.map((s) => REACH_OUT_SLOT_LABELS[s]),
);

export const REACH_OUT_SUBJECT_MAX = 80;
export const REACH_OUT_BODY_MAX = 1200;
/** The whole email as a business reads it, the opening counted at its most (§4.4). */
export const REACH_OUT_WORDS_MAX = 120;
export const OPENING_WORDS_MAX = 40;
/** An opening's length in characters, as a send stores it (00197 reach_out_sends.opening): forty words fit well within. */
export const OPENING_CHARS_MAX = 400;
export const ANGLE_WORDS_MAX = 3;
export const REACH_OUT_STEPS_MAX = 5;
/** The most mailboxes a chain names (as many as a workspace connects); none named is every connected one. */
export const REACH_OUT_MAILBOXES_MAX = 10;
export const REACH_OUT_NAME_MAX = 80;
export const SIGNED_BY_MAX = 60;
/** The gap's choices on the sheet, in minutes; the database holds 5–120 (00183). */
export const REACH_OUT_GAP_MINUTES = [5, 8, 12, 20, 30, 60] as const;
/** A step after the first waits this long after the one before (00183 holds 2–30); a new one starts at four. */
export const REACH_OUT_AFTER_DAYS = { min: 2, max: 30, first: 4 } as const;

/** How many times the words name one slot. */
export function slotCount(text: string, slot: ReachOutSlot): number {
  return slotCountIn(REACH_OUT_SLOT_SET, text, slot);
}

/**
 * Whether a step's words are written wrongly for the slots: a {{…}} that is none of them, or a brace with no pair. The save
 * refuses such words (validateReachOutWords), and the sender holds a send whose words were saved before the rule.
 */
export function reachOutSlotFault(text: string): boolean {
  return slotFault(REACH_OUT_SLOT_SET, text);
}

/**
 * Whether a step's words name {{opening}}, in its subject or its body: the one rule for "this email needs an opening
 * written for it", asked by the check (which writes one) and by the sender (which sends none without it).
 */
export function wordsNeedOpening(w: { subject: string | null; body: string }): boolean {
  return slotCount(`${w.subject ?? ""}\n${w.body}`, "opening") > 0;
}

/** Words as a reader counts them: a mark standing alone (a dash, the comma a slot left behind) is no word. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** The words a business reads, counted as a reader counts them: a slot is one word, the opening its most. */
export function emailWordCount(text: string): number {
  const slots = slotMentions(REACH_OUT_SLOT_SET, text).reduce(
    (n, m) => n + (m.key === "opening" ? OPENING_WORDS_MAX : 1),
    0,
  );
  return slots + wordCount(slotsOut(REACH_OUT_SLOT_SET, text));
}

const ADDRESS = /[^\s@<>]+@[^\s@<>]+/g;
const SCHEME_OR_WWW = /\bhttps?:\/\/[^\s<>]+|\bwww\.[^\s<>]+/gi;
// A bare name.tld as an address is written: "example.com", "harbor.example/book", and "RJCapital.io" with capitals
// before its dot, which a mail app links all the same (30 Oct 2026). "St.Louis", "Dr.Smith" and a rating's "4.9" are
// not: a capital after the last dot, or no letters.
const BARE_HOST = /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,24}\b(?:\/[^\s<>]*)?/g;

/**
 * The web addresses a reader sees in the words: each with a scheme or a www., and each bare name.tld. An email
 * address is not one. The one link rule: the words' "one link at most" and the opening's "no link" both ask it.
 */
export function linksIn(text: string): string[] {
  const out: string[] = [];
  const rest = slotsOut(REACH_OUT_SLOT_SET, text)
    .replace(ADDRESS, " ")
    .replace(SCHEME_OR_WWW, (m) => {
      out.push(m);
      return " ";
    });
  for (const m of rest.matchAll(BARE_HOST)) out.push(m[0]);
  return out;
}

/** The links a business sees: each one written out, each {{booking link}} and each {{their preview}}. */
export function linkCount(text: string): number {
  return linksIn(text).length + slotCount(text, "booking link") + slotCount(text, "their preview");
}

/**
 * Words in capitals: a line, or lines one under another, of eight letters or more and none of them lower case.
 * "FREE / TRIAL / TODAY" on three lines shouts as one.
 */
export function shoutingLine(text: string): boolean {
  let run = 0;
  for (const line of slotsOut(REACH_OUT_SLOT_SET, text).split(/\r\n|\r|\n/)) {
    const letters = line.replace(/[^\p{L}]/gu, "");
    const capitals = letters !== "" && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
    run = capitals ? run + letters.length : 0;
    if (run >= 8) return true;
  }
  return false;
}

/** What a cold email asks of its words beyond what every email's are asked (a reach-out's own rules). */
type ColdProblem =
  | "subject_poses_as_reply"
  | "opening_in_subject"
  | "link_in_subject"
  | "opening_twice"
  | "too_many_words"
  | "too_many_links"
  | "shouting";

export type WordsProblem = EmailProblem | ColdProblem;

/** One thing wrong with a step's words: the shared email problems and the cold email's. */
export type WordsIssue = EmailIssue<ColdProblem>;

/** What a cold email's subject may not be: a reply it is not, the opening, a link, or a shout. */
function coldSubjectProblems(subject: string): ColdProblem[] {
  const out: ColdProblem[] = [];
  if (posesAsReply(subject)) out.push("subject_poses_as_reply");
  if (slotCount(subject, "opening") > 0) out.push("opening_in_subject");
  if (linkCount(subject) > 0) out.push("link_in_subject");
  if (shoutingLine(subject)) out.push("shouting");
  return out;
}

/** What a cold email's body may not be: the opening twice, over the hundred and twenty words, a second link, a shout. */
function coldBodyProblems(body: string): ColdProblem[] {
  const out: ColdProblem[] = [];
  if (slotCount(body, "opening") > 1) out.push("opening_twice");
  if (emailWordCount(body) > REACH_OUT_WORDS_MAX) out.push("too_many_words");
  if (linkCount(body) > 1) out.push("too_many_links");
  if (shoutingLine(body)) out.push("shouting");
  return out;
}

/**
 * What a reach-out step's email keeps to, as an email's rules (templates/message-versions.ts): its slots, a subject
 * up to 80 characters (the first step's: a step after it answers the one before, "Re:", D19, and has none) and a body
 * up to 1,200, then the cold email's own. The one check, the Templates editor and the sheet all read these.
 */
export function reachOutRules(first: boolean): EmailRules<ColdProblem> {
  return {
    slots: REACH_OUT_SLOT_SET,
    subject: first,
    subjectMax: REACH_OUT_SUBJECT_MAX,
    bodyMax: REACH_OUT_BODY_MAX,
    subjectAlso: coldSubjectProblems,
    bodyAlso: coldBodyProblems,
    say: wordsIssueWords,
    foot: REACH_OUT_FOOT_NOTE,
  };
}

/** What the sender adds under a cold email that a preview does not draw. */
const REACH_OUT_FOOT_NOTE =
  "The footer is added when it goes: why they are hearing from you, who you are and where, and how to say no.";

/**
 * One step's words, as the sheet saves them. The first step names its subject; a step after it answers the one before
 * ("Re:", D19), so its subject is never read. Every {{…}} is one of the slots, and the opening goes in the body once.
 * The whole email, the opening counted at its most, is under 120 words, with one link at most and no line in capitals.
 */
export function validateReachOutWords(w: { subject: string | null; body: string }, first: boolean): WordsIssue[] {
  return emailIssues({ subject: (w.subject ?? "").trim(), body: w.body.trim() }, reachOutRules(first));
}

export function wordsIssueWords(i: WordsIssue): string {
  switch (i.problem) {
    case "subject_missing":
      return "Give your email a subject.";
    case "subject_too_long":
      return `Keep the subject under ${REACH_OUT_SUBJECT_MAX} characters.`;
    case "subject_poses_as_reply":
      return "A first email can't start with Re: or Fwd:.";
    case "opening_in_subject":
      return "The opening goes in the email, not the subject.";
    case "link_in_subject":
      return "Keep links out of the subject.";
    case "body_missing":
      return "Write what you'd say.";
    case "body_too_long":
      return `Keep it under ${REACH_OUT_BODY_MAX.toLocaleString("en-US")} characters.`;
    case "unknown_slot":
      return `{{${i.slot ?? ""}}} isn't one of the slots. Use one from the list.`;
    case "stray_brace":
      return "Braces are for slots only, two on each side: {{business}}.";
    case "opening_twice":
      return "The opening goes in once.";
    case "too_many_words":
      return `Keep it under ${REACH_OUT_WORDS_MAX} words, counting the opening as ${OPENING_WORDS_MAX}.`;
    case "too_many_links":
      return "One link at most. A second reads like a pitch.";
    case "shouting":
      return "A line in capitals reads like spam.";
  }
}

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
 * A chain, whole: each step's words, the first on day one and each after it waiting its days, and what the words ask
 * the workspace to have. {{your name}} needs a name to sign with. {{booking link}} needs the workspace's link: a chain
 * that names one the workspace does not have would hold every email it writes.
 */
export function validateReachOutChain(c: ReachOutChainInput, has: { bookingLink: boolean }): ChainIssue[] {
  const out: ChainIssue[] = [];
  c.steps.forEach((s, i) => {
    if (s.hand) out.push(...handIssues(s.hand, i, c.steps.length));
    else
      for (const w of validateReachOutWords({ subject: s.subject, body: s.body }, i === 0)) out.push({ step: i, ...w });
    if (i === 0 && s.after_days !== null) out.push({ step: 0, field: "after_days", problem: "first_has_a_delay" });
    // A first email to a business that never heard of you carries no link (decision 0056, 7): a link in a first touch
    // from a mailbox is what spam filters weigh most. The booking link goes in the nudge. Their preview is a link like
    // any other, said in its own words: it goes in a later step (decision 0079).
    if (i === 0 && !s.hand && slotCount(s.body, "their preview") > 0)
      out.push({ step: 0, field: "body", problem: "first_has_their_preview" });
    else if (
      i === 0 &&
      !s.hand &&
      (linksIn(`${s.subject ?? ""}\n${s.body}`).length > 0 || slotCount(s.body, "booking link") > 0)
    )
      out.push({ step: 0, field: "body", problem: "first_has_a_link" });
    if (i > 0 && s.after_days === null) out.push({ step: i, field: "after_days", problem: "step_needs_a_delay" });
  });
  // Only the emails' words are sent: a call's or a note's are the team's own, and name no slot.
  const said = c.steps
    .filter((s) => !s.hand)
    .map((s, i) => `${i === 0 ? (s.subject ?? "") : ""}\n${s.body}`)
    .join("\n");
  if (slotCount(said, "your name") > 0 && !c.signed_by?.trim())
    out.push({ step: null, field: "signed_by", problem: "no_name_to_sign" });
  if (slotCount(said, "booking link") > 0 && !has.bookingLink)
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

export function chainIssueWords(i: ChainIssue): string {
  switch (i.problem) {
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
      return wordsIssueWords({ field: i.field === "subject" ? "subject" : "body", problem: i.problem, slot: i.slot });
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
export function isOpeningFactKey(k: string): k is OpeningFactKey {
  return (OPENING_FACT_KEYS as readonly string[]).includes(k);
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

export function factValue(r: OpeningRecord, k: OpeningFactKey): string | null {
  const v = r[k];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Every way the record's numbers may be written: a rating 4.9 or 5.0 and its scale ("4.9 out of 5"), a count 1,204
 * or 1204, a year in the about. What the owner searched for is not the business's, so its numbers back nothing.
 */
function recordNumbers(r: OpeningRecord): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => {
    out.add(String(n));
    out.add(n.toLocaleString("en-US"));
    out.add(n.toFixed(1));
  };
  if (r.rating !== null) {
    add(r.rating);
    add(5);
  }
  if (r.reviews !== null) add(r.reviews);
  for (const text of [r.business_name, r.category, r.city, r.hours, r.about, r.why_it_fits, r.website_says])
    for (const m of (text ?? "").matchAll(NUMBER)) out.add(m[0].replace(/,$/, ""));
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
export function isOpeningProblem(p: string | null | undefined): p is OpeningProblem {
  return (OPENING_PROBLEMS as readonly string[]).includes(p ?? "");
}

/**
 * An opening as the writer wrote it, read by code before the reader reads it (§4.4, F2): something to say, forty
 * words at most, no link (the owner's words carry theirs), no brace, no line in capitals, no price, an angle of one to three
 * words, every fact it names one the record has, every number in it one the record holds, and no guess.
 */
export function checkOpening(o: WrittenOpening, r: OpeningRecord): OpeningProblem | null {
  const text = o.opening.trim();
  if (!text) return "empty";
  if (wordCount(text) > OPENING_WORDS_MAX || text.length > OPENING_CHARS_MAX) return "too_long";
  // The business's own name, as its listing writes it and as it is called by, and its city are theirs, dots and all
  // ("fixit.co Repairs"); anything else shaped like an address, or an email address, is a link (a business's own host
  // is one to a spam filter too).
  let unnamed = text;
  for (const own of [r.business_name, leadCalledByOf(r), r.city])
    if (own?.trim()) unnamed = unnamed.split(own.trim()).join(" ");
  if (linksIn(unnamed).length > 0 || /@/.test(unnamed)) return "link";
  if (/\{\{|\}\}/.test(text)) return "brace";
  if (shoutingLine(text)) return "shouting";
  // The platform's one price rule (policy.ts), the one every reply the receptionist writes is read by.
  if (violatesNoPrices(text)) return "price";
  const angle = o.angle.trim().split(/\s+/).filter(Boolean);
  if (angle.length === 0 || angle.length > ANGLE_WORDS_MAX) return "angle";
  for (const k of o.facts_used) if (!isOpeningFactKey(k) || !factValue(r, k)) return "unnamed_fact";
  const known = recordNumbers(r);
  for (const m of text.matchAll(NUMBER)) if (!known.has(m[0].replace(/,$/, ""))) return "unbacked_number";
  if (openingGuess(text) !== null) return "guess";
  return null;
}

/** Why a rewrite is asked for, as the writer is told it. */
export function openingProblemWords(p: OpeningProblem): string {
  switch (p) {
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

export const CHAIN_MIN_LISTINGS = 3;

/**
 * Whether a business reads like a chain (§4.4, F4): three or more of the workspace's leads share its own website, or
 * its name. The spec's "three locations on Maps" has no field; this is what the finder holds, said as measured. A page
 * on a platform (a social profile, a booking site) is nobody's own site (siteHost), so it counts nothing.
 */
export function chainOf(l: {
  website: string | null;
  site_listings: number;
  name_listings: number;
}): { by: "site" | "name"; listings: number } | null {
  if (siteHost(l.website) && l.site_listings >= CHAIN_MIN_LISTINGS) return { by: "site", listings: l.site_listings };
  if (l.name_listings >= CHAIN_MIN_LISTINGS) return { by: "name", listings: l.name_listings };
  return null;
}

/** The lead's address's domain when a person in People writes from it and it is nobody's free mail (F6); else null. */
export function customerDomainOf(email: string | null, sharedWithPerson: boolean): string | null {
  const address = normalizeEmail(email);
  const domain = address ? address.slice(address.lastIndexOf("@") + 1) : "";
  return sharedWithPerson && domain && !isFreeMail(domain) ? domain : null;
}

export const REACH_OUT_HOLDS = [
  "customer_domain",
  "chain",
  "language",
  "unbacked_fact",
  "reads_like_spam",
  "check_unavailable",
  // A business outside the countries cold email goes to without asking (decision 0056, 9): the owner may include it.
  "abroad",
] as const;
export type ReachOutHold = (typeof REACH_OUT_HOLDS)[number];
export function isReachOutHold(r: string | null | undefined): r is ReachOutHold {
  return (REACH_OUT_HOLDS as readonly string[]).includes(r ?? "");
}

export type HoldDoor = "include" | "rewrite" | "skip" | "not_a_fit";

/**
 * What a claim the reader refused is about (30 Oct 2026: an owner read "which their record doesn't hold" and could not
 * tell why, or what to do): the kinds no business's record states (reach-out-opening.ts OPENING_UNSTATED), and any
 * other detail, number or name. The reader names one; a held email says it.
 */
export const OPENING_CLAIM_KINDS = ["calls", "busy", "revenue", "feelings", "problems", "plans", "detail"] as const;
export type OpeningClaimKind = (typeof OPENING_CLAIM_KINDS)[number];
/** What a held opening's claim is, as its hold stores it: the reader's kind, or a guess code read in its words. */
export type HeldClaimKind = OpeningClaimKind | "guess";
const HELD_CLAIM_KINDS: readonly string[] = [...OPENING_CLAIM_KINDS, "guess"];
const isHeldClaimKind = (k: string): k is HeldClaimKind => HELD_CLAIM_KINDS.includes(k);

/** How much of a refused claim's words a hold keeps: with its kind, inside sequence_sends.hold_detail's 120. */
const HELD_SAID_MAX = 100;

/** An unbacked opening's hold detail: its kind and the words it said, kept as a chain's is ("site:3"). */
export function heldClaimDetail(kind: HeldClaimKind, said: string | null): string {
  return `${kind}:${(said ?? "").slice(0, HELD_SAID_MAX)}`;
}

/** An unbacked opening's hold detail read back; one stored before its kind was (its words alone) is words alone. */
export function heldClaimOf(detail: string | null): { kind: HeldClaimKind | null; said: string | null } {
  const d = detail?.trim() ?? "";
  const at = d.indexOf(":");
  const kind = at > 0 ? d.slice(0, at) : "";
  if (isHeldClaimKind(kind)) return { kind, said: d.slice(at + 1).trim() || null };
  return { kind: null, said: d || null };
}

/** What an unbacked opening guessed at, after "the opening ". */
const CLAIM_GUESSED: Record<Exclude<OpeningClaimKind, "detail">, string> = {
  calls: "guesses at their calls",
  busy: "guesses how busy they are",
  revenue: "guesses at their revenue",
  feelings: "guesses at how they feel",
  problems: "guesses at a problem they have",
  plans: "guesses at their plans",
};
const NOTHING_FOUND = "we found nothing that says so";

/** What an unbacked opening did, by its kind alone ("the opening guesses at their calls"); a hold with none, a detail. */
export function openingClaimWords(kind: HeldClaimKind | null): string {
  if (kind === "guess") return "the opening is worded as a guess";
  if (kind && kind !== "detail") return `the opening ${CLAIM_GUESSED[kind]}`;
  return "the opening says something we found nothing on";
}

function unbackedWords(c: { kind: HeldClaimKind | null; said: string | null }): string {
  if (c.kind === "guess") return c.said ? `${openingClaimWords("guess")}: “${c.said}”` : openingClaimWords("guess");
  if (c.kind && c.kind !== "detail") return `${openingClaimWords(c.kind)}; ${NOTHING_FOUND}`;
  return c.said ? `the opening says “${c.said}”; ${NOTHING_FOUND}` : openingClaimWords(null);
}

/**
 * A held send, said in a line (F3). The detail is what the check stored beside the reason: "site:3" or "name:4" for a
 * chain, the language's code, a customer's domain, the reader's words for an unbacked claim, the code rule an
 * opening broke (an OpeningProblem) for a pitch or an opening that could not be written.
 */
export function holdWords(h: ReachOutHold, detail: string | null, stepLanguage = "en"): string {
  switch (h) {
    case "customer_domain":
      return `a person in People writes from ${detail || "their domain"}`;
    case "chain": {
      const [by, n] = (detail ?? "").split(":");
      return n
        ? `reads like a chain: ${n} listings share their ${by === "name" ? "name" : "website"}`
        : "reads like a chain";
    }
    case "language":
      return `their listing reads in ${languageName(detail || "?")}; the email is in ${languageName(stepLanguage)}`;
    case "unbacked_fact":
      return unbackedWords(heldClaimOf(detail));
    case "reads_like_spam":
      return isOpeningProblem(detail)
        ? `the opening read like a pitch: ${openingProblemWords(detail)}`
        : "the opening read like a pitch";
    case "check_unavailable":
      return isOpeningProblem(detail)
        ? `the opening couldn't be written to the rules: ${openingProblemWords(detail)}`
        : "the check couldn't run";
    case "abroad":
      return `they're in ${countryWords(detail)}, where writing to a business first may need its say`;
  }
}

/** The countries a cold email goes to without asking (decision 0056, 9): the US, Canada and the United Kingdom. */
export const REACH_OUT_COUNTRIES_FREE: ReadonlySet<string> = new Set(["US", "CA", "GB"]);
/** The countries a cold email never goes to, even business to business: their law asks consent first. */
export const REACH_OUT_COUNTRIES_REFUSED: ReadonlySet<string> = new Set(["DE", "AT"]);

/**
 * Where a lead's country puts it (decision 0056, 9): free to write to, held for its owner's say, or never written to.
 * A lead with no country is the finder's, which searches the United States.
 */
export function reachOutCountryOf(country: string | null | undefined): "free" | "held" | "refused" {
  const c = (country ?? "US").trim().toUpperCase() || "US";
  if (REACH_OUT_COUNTRIES_REFUSED.has(c)) return "refused";
  return REACH_OUT_COUNTRIES_FREE.has(c) ? "free" : "held";
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });
/** A country's name, from its code; the code itself when it is not one. */
function countryWords(code: string | null): string {
  const c = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "another country";
  try {
    return COUNTRY_NAMES.of(c) ?? c;
  } catch {
    return c;
  }
}

/** What an owner can do about a held send: only the doors that answer its reason. */
export function holdDoors(h: ReachOutHold): HoldDoor[] {
  switch (h) {
    case "customer_domain":
      return ["skip", "include"];
    // Not a fit closes the lead; Skip lets this email go unsent and keeps the lead, as every other hold's no does.
    case "chain":
      return ["include", "not_a_fit", "skip"];
    case "language":
      return ["include", "skip"];
    case "unbacked_fact":
    case "reads_like_spam":
      return ["rewrite", "include", "skip"];
    case "check_unavailable":
      return ["rewrite", "skip"];
    case "abroad":
      return ["include", "skip"];
  }
}

/**
 * The holds an owner's Include carries past this one email to the lead's later sends in the chain (R7). These four are
 * facts about the business, the same at every step: a person in People writes from its domain, it reads like a chain,
 * its listing reads in another language, it is abroad. The two word holds, unbacked_fact and reads_like_spam, are about
 * one opening's words, and every step's opening is written fresh: an Include past them vouches for that email alone,
 * and a later step's opening is read as any other. check_unavailable is never included (reach_out_send_decide refuses).
 */
export const HOLDS_INCLUDED_FOR_CHAIN: ReadonlySet<ReachOutHold> = new Set<ReachOutHold>([
  "customer_domain",
  "chain",
  "language",
  "abroad",
]);

/** A held email's doors, in one meaning each (the lead-to-sequence canvas): it goes as it reads, or this one is skipped. */
export const HOLD_DOOR_WORDS: Record<HoldDoor, string> = {
  include: "Send anyway",
  rewrite: "Rewrite the opening",
  skip: "Skip this email",
  not_a_fit: "Not a fit",
};
