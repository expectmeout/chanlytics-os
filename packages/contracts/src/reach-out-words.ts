/**
 * A reach-out's words (Reach out, Part 4; spec §4.3–4.4): the slots a step may name, what a step's words must be to be
 * saved, the chain the sheet saves, and the code half of the check before each send. Pure. The sheet, the save route,
 * the check on the edge and its preview ask the same rules, so none of them passes what another refuses.
 *
 *   REACH_OUT_SLOTS          the six a step may name; any other {{…}} is refused at the save, never met at a send
 *   validateReachOutWords    one step's words: its subject (the first step's only), its body, its slots, its length,
 *                            one link at most, no line in capitals
 *   ReachOutChainSchema,     a chain as the sheet saves it: its name, its search, its steps and their days, its pace,
 *   validateReachOutChain    its domains, and what its words ask the workspace to have
 *   checkOpening             an opening as the writer wrote it, read by code (F2)
 *   chainOf, customerDomainOf    the check's two code holds (F4, F6); a business's own site is lead-search's siteHost
 *   holdWords, holdDoors     what a held send says, and what its owner can do about it (F3)
 */
import { z } from "zod";
import { isFreeMail } from "./free-mail";
import { posesAsReply } from "./email-subject";
import { languageName } from "./template-languages";
import { siteHost } from "./lead-search";
import { violatesNoPrices } from "./policy";
import { normalizeEmail } from "./email-address";

export const REACH_OUT_SLOTS = ["opening", "business", "city", "your name", "your business", "booking link"] as const;
export type ReachOutSlot = (typeof REACH_OUT_SLOTS)[number];

/** What each slot is, as the sheet's chips say it on hover. */
export const REACH_OUT_SLOT_WORDS: Record<ReachOutSlot, string> = {
  opening: "written for each business",
  business: "their name on Google",
  city: "their city",
  "your name": "the name you sign with",
  "your business": "your business's name",
  "booking link": "your booking link",
};

export const REACH_OUT_SUBJECT_MAX = 80;
export const REACH_OUT_BODY_MAX = 1200;
/** The whole email as a business reads it, the opening counted at its most (§4.4). */
export const REACH_OUT_WORDS_MAX = 120;
export const OPENING_WORDS_MAX = 40;
export const ANGLE_WORDS_MAX = 3;
export const REACH_OUT_STEPS_MAX = 5;
export const REACH_OUT_NAME_MAX = 80;
export const SIGNED_BY_MAX = 60;
/** The gap's choices on the sheet, in minutes; the database holds 5–120 (00183). */
export const REACH_OUT_GAP_MINUTES = [5, 8, 12, 20, 30, 60] as const;
/** A step after the first waits this long after the one before (00183 holds 2–30); a new one starts at four. */
export const REACH_OUT_AFTER_DAYS = { min: 2, max: 30, first: 4 } as const;

const SLOT = /\{\{([^{}]*)\}\}/g;

export function slotKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isReachOutSlot(name: string): name is ReachOutSlot {
  return (REACH_OUT_SLOTS as readonly string[]).includes(name);
}

/**
 * Every slot the words name, in order, once each, and whether a brace is left once the slots are out: "{{business"
 * with no end, "{business}" with one brace a side, "{{{business}}}" with one too many. A business never reads a brace.
 */
export function slotsNamed(text: string): { names: string[]; stray: boolean } {
  const names: string[] = [];
  for (const m of text.matchAll(SLOT)) {
    const key = slotKey(m[1] ?? "");
    if (!names.includes(key)) names.push(key);
  }
  return { names, stray: /[{}]/.test(text.replace(SLOT, "")) };
}

/** The words with each slot replaced by what `fill` gives for its key; a slot it has nothing for stays as written. */
export function replaceSlots(text: string, fill: (key: string) => string | null): string {
  return text.replace(SLOT, (whole, name: string) => fill(slotKey(name)) ?? whole);
}

/** How many times the words name one slot. */
export function slotCount(text: string, slot: ReachOutSlot): number {
  let n = 0;
  for (const m of text.matchAll(SLOT)) if (slotKey(m[1] ?? "") === slot) n += 1;
  return n;
}

/** Words as a reader counts them: a mark standing alone (a dash, the comma a slot left behind) is no word. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** The words a business reads, counted as a reader counts them: a slot is one word, the opening its most. */
export function emailWordCount(text: string): number {
  let slots = 0;
  const rest = text.replace(SLOT, (_whole, name: string) => {
    slots += slotKey(name) === "opening" ? OPENING_WORDS_MAX : 1;
    return " ";
  });
  return slots + wordCount(rest);
}

const ADDRESS = /[^\s@<>]+@[^\s@<>]+/g;
const SCHEME_OR_WWW = /\bhttps?:\/\/[^\s<>]+|\bwww\.[^\s<>]+/gi;
// A bare name.tld as an address is written, in lower case: "example.com", "harbor.example/book". "St.Louis",
// "Dr.Smith" and a rating's "4.9" are not: a capital after the dot, or no letters.
const BARE_HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b(?:\/[^\s<>]*)?/g;

/**
 * The web addresses a reader sees in the words: each with a scheme or a www., and each bare name.tld. An email
 * address is not one. The one link rule: the words' "one link at most" and the opening's "no link" both ask it.
 */
export function linksIn(text: string): string[] {
  const out: string[] = [];
  const rest = text
    .replace(SLOT, " ")
    .replace(ADDRESS, " ")
    .replace(SCHEME_OR_WWW, (m) => {
      out.push(m);
      return " ";
    });
  for (const m of rest.matchAll(BARE_HOST)) out.push(m[0]);
  return out;
}

/** The links a business sees: each one written out, and each {{booking link}}. */
export function linkCount(text: string): number {
  return linksIn(text).length + slotCount(text, "booking link");
}

/**
 * Words in capitals: a line, or lines one under another, of eight letters or more and none of them lower case.
 * "FREE / TRIAL / TODAY" on three lines shouts as one.
 */
export function shoutingLine(text: string): boolean {
  let run = 0;
  for (const line of text.replace(SLOT, " ").split(/\r\n|\r|\n/)) {
    const letters = line.replace(/[^\p{L}]/gu, "");
    const capitals = letters !== "" && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
    run = capitals ? run + letters.length : 0;
    if (run >= 8) return true;
  }
  return false;
}

export type WordsProblem =
  | "subject_missing"
  | "subject_too_long"
  | "subject_poses_as_reply"
  | "opening_in_subject"
  | "link_in_subject"
  | "body_missing"
  | "body_too_long"
  | "unknown_slot"
  | "stray_brace"
  | "opening_twice"
  | "too_many_words"
  | "too_many_links"
  | "shouting";

export interface WordsIssue {
  field: "subject" | "body";
  problem: WordsProblem;
  /** The slot as it was written, for unknown_slot. */
  slot?: string;
}

/**
 * One step's words, as the sheet saves them. The first step names its subject; a step after it answers the one before
 * ("Re:", D19), so its subject is never read. Every {{…}} is one of the six, and the opening goes in the body once.
 * The whole email, the opening counted at its most, is under 120 words, with one link at most and no line in capitals.
 */
export function validateReachOutWords(w: { subject: string | null; body: string }, first: boolean): WordsIssue[] {
  const out: WordsIssue[] = [];
  const subject = first ? (w.subject ?? "").trim() : null;
  const body = w.body.trim();
  if (subject !== null) {
    if (!subject) out.push({ field: "subject", problem: "subject_missing" });
    else if (subject.length > REACH_OUT_SUBJECT_MAX) out.push({ field: "subject", problem: "subject_too_long" });
    if (subject && posesAsReply(subject)) out.push({ field: "subject", problem: "subject_poses_as_reply" });
    if (slotCount(subject, "opening") > 0) out.push({ field: "subject", problem: "opening_in_subject" });
    if (linkCount(subject) > 0) out.push({ field: "subject", problem: "link_in_subject" });
    if (shoutingLine(subject)) out.push({ field: "subject", problem: "shouting" });
  }
  if (!body) out.push({ field: "body", problem: "body_missing" });
  else if (body.length > REACH_OUT_BODY_MAX) out.push({ field: "body", problem: "body_too_long" });
  for (const [field, text] of [
    ["subject", subject],
    ["body", body],
  ] as const) {
    if (!text) continue;
    const named = slotsNamed(text);
    for (const name of named.names) if (!isReachOutSlot(name)) out.push({ field, problem: "unknown_slot", slot: name });
    if (named.stray) out.push({ field, problem: "stray_brace" });
  }
  if (body) {
    if (slotCount(body, "opening") > 1) out.push({ field: "body", problem: "opening_twice" });
    if (emailWordCount(body) > REACH_OUT_WORDS_MAX) out.push({ field: "body", problem: "too_many_words" });
    if (linkCount(body) > 1) out.push({ field: "body", problem: "too_many_links" });
    if (shoutingLine(body)) out.push({ field: "body", problem: "shouting" });
  }
  return out;
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
      return `{{${i.slot ?? ""}}} isn't one of the slots. Use the chips below.`;
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

export const ReachOutStepSchema = z.object({
  /** An existing step's id, when the sheet edits a chain; none for a new one. */
  id: z.string().uuid().nullable().optional(),
  subject: z
    .string()
    .max(REACH_OUT_SUBJECT_MAX * 2)
    .nullable(),
  body: z.string().max(REACH_OUT_BODY_MAX * 2),
  after_days: z.number().int().min(REACH_OUT_AFTER_DAYS.min).max(REACH_OUT_AFTER_DAYS.max).nullable(),
});

export const ReachOutChainSchema = z.object({
  name: z.string().trim().min(1).max(REACH_OUT_NAME_MAX),
  search_id: z.string().uuid(),
  include_unconfirmed: z.boolean(),
  gap_minutes: z.number().int().min(5).max(120),
  /** Empty: every verified domain of the workspace (00183). */
  domain_ids: z.array(z.string().uuid()).max(5),
  signed_by: z.string().trim().max(SIGNED_BY_MAX).nullable(),
  steps: z.array(ReachOutStepSchema).min(1).max(REACH_OUT_STEPS_MAX),
});
export type ReachOutChainInput = z.infer<typeof ReachOutChainSchema>;

export type ChainProblem =
  WordsProblem | "first_has_a_delay" | "step_needs_a_delay" | "no_name_to_sign" | "no_booking_link";

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
    for (const w of validateReachOutWords({ subject: s.subject, body: s.body }, i === 0)) out.push({ step: i, ...w });
    if (i === 0 && s.after_days !== null) out.push({ step: 0, field: "after_days", problem: "first_has_a_delay" });
    if (i > 0 && s.after_days === null) out.push({ step: i, field: "after_days", problem: "step_needs_a_delay" });
  });
  const said = c.steps.map((s, i) => `${i === 0 ? (s.subject ?? "") : ""}\n${s.body}`).join("\n");
  if (slotCount(said, "your name") > 0 && !c.signed_by?.trim())
    out.push({ step: null, field: "signed_by", problem: "no_name_to_sign" });
  if (slotCount(said, "booking link") > 0 && !has.bookingLink)
    out.push({ step: null, field: "body", problem: "no_booking_link" });
  return out;
}

export function chainIssueWords(i: ChainIssue): string {
  switch (i.problem) {
    case "first_has_a_delay":
      return "Your email goes on day one.";
    case "step_needs_a_delay":
      return "Say how many days after the one before.";
    case "no_name_to_sign":
      return "Your words name {{your name}}. Say the name you sign with.";
    case "no_booking_link":
      return "Your words name {{booking link}}. Add your booking link in Settings › Business first.";
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
  for (const text of [r.business_name, r.category, r.city, r.hours, r.about, r.why_it_fits])
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
] as const;
export type OpeningProblem = (typeof OPENING_PROBLEMS)[number];
export function isOpeningProblem(p: string | null | undefined): p is OpeningProblem {
  return (OPENING_PROBLEMS as readonly string[]).includes(p ?? "");
}

/**
 * An opening as the writer wrote it, read by code before the reader reads it (§4.4, F2): something to say, forty
 * words at most, no link (the owner's words carry theirs), no brace, no line in capitals, no price, an angle of one to three
 * words, every fact it names one the record has, and every number in it one the record holds.
 */
export function checkOpening(o: WrittenOpening, r: OpeningRecord): OpeningProblem | null {
  const text = o.opening.trim();
  if (!text) return "empty";
  if (wordCount(text) > OPENING_WORDS_MAX) return "too_long";
  // The business's own name and city are theirs to be called by, dots and all ("fixit.co Repairs"); anything else
  // shaped like an address, or an email address, is a link (a business's own host is one to a spam filter too).
  let unnamed = text;
  for (const own of [r.business_name, r.city]) if (own?.trim()) unnamed = unnamed.split(own.trim()).join(" ");
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
  return null;
}

/** Why a rewrite is asked for, as the writer is told it. */
export function openingProblemWords(p: OpeningProblem): string {
  switch (p) {
    case "empty":
      return "it said nothing";
    case "too_long":
      return `it ran past ${OPENING_WORDS_MAX} words`;
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
] as const;
export type ReachOutHold = (typeof REACH_OUT_HOLDS)[number];
export function isReachOutHold(r: string | null | undefined): r is ReachOutHold {
  return (REACH_OUT_HOLDS as readonly string[]).includes(r ?? "");
}

export type HoldDoor = "include" | "rewrite" | "skip" | "not_a_fit";

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
      return detail
        ? `the opening said “${detail}”, which their record doesn't hold`
        : "the opening said something their record doesn't hold";
    case "reads_like_spam":
      return isOpeningProblem(detail)
        ? `the opening read like a pitch: ${openingProblemWords(detail)}`
        : "the opening read like a pitch";
    case "check_unavailable":
      return isOpeningProblem(detail)
        ? `the opening couldn't be written to the rules: ${openingProblemWords(detail)}`
        : "the check couldn't run";
  }
}

/** What an owner can do about a held send: only the doors that answer its reason. */
export function holdDoors(h: ReachOutHold): HoldDoor[] {
  switch (h) {
    case "customer_domain":
      return ["skip", "include"];
    case "chain":
      return ["include", "not_a_fit"];
    case "language":
      return ["include", "skip"];
    case "unbacked_fact":
    case "reads_like_spam":
      return ["rewrite", "include", "skip"];
    case "check_unavailable":
      return ["rewrite", "skip"];
  }
}

export const HOLD_DOOR_WORDS: Record<HoldDoor, string> = {
  include: "Include",
  rewrite: "Rewrite the opening",
  skip: "Skip",
  not_a_fit: "Not a fit",
};
