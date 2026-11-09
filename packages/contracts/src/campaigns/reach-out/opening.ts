/**
 * The opening's two model calls (Reach out, Part 4; spec §4.3–4.4, F2), said once: the writer writes one business's
 * opening from its record, and the reader reads what the writer wrote against the same record. Their prompts, their
 * answers' schemas and the answers parsed are here. The edge (lib/campaigns/reach-out/check.ts) does the transport, and code
 * (reach-out/words/opening.ts checkOpening) reads the writer's answer before the reader does.
 *
 * Haiku, the smallest model: an opening is one sentence from a short record, and each email costs at most four calls
 * (two, and two more on its one rewrite). The id is the registry's (ai/models/routes.ts MODEL_ROUTES.reach_out_check), the
 * same one the notes sweep and the reply reader ask: one model for the platform's small reads, written once.
 */
import { ANGLE_WORDS_MAX, OPENING_CHARS_MAX, OPENING_WORDS_MAX } from "./words/limits";
import {
  OPENING_FACT_KEYS,
  OPENING_HEDGES,
  openingGuess,
  openingProblemWords,
  type WrittenOpening,
  type OpeningProblem,
  type OpeningRecord,
} from "./words/opening";
import { OPENING_CLAIM_KINDS, heldClaimDetail, type OpeningClaimKind } from "./words/claims";
import { languageBase } from "../templates/languages";
import { leadCalledByOf } from "../../leads/search/called-by";
import { DATA_NOT_INSTRUCTIONS, defang, fencedInline } from "../../ai/fence";
import { MODEL_ROUTES } from "../../ai/models/routes";
import { isOneOf } from "../../shared/unknown";

export const REACH_OUT_MODEL = MODEL_ROUTES.reach_out_check.model;

/**
 * What no business's record states, so the reader refuses a claim about it unless the record says it: said once, read
 * by the writer's prompt, the reader's, and the rewrite the writer is asked for, so the writer is told the kind of claim
 * before it writes and again when it made one (29 Oct 2026: the writer, never told, guessed at how busy a business is
 * in most openings, and a rewrite told only its words made the same guess in others).
 */
export const OPENING_UNSTATED =
  "how busy they are, how often their phone rings, how many customers or calls they get, their revenue, their feelings, their problems or their plans";

/** The guesses the prompts quote (contracts OPENING_HEDGES' first five), each in its marks. */
const HEDGES_QUOTED = OPENING_HEDGES.slice(0, 5)
  .map((h) => `“${h}”`)
  .join(", ");

export const OPENING_SCHEMA = {
  type: "object",
  properties: {
    // The bound is said, not constrained: structured outputs refuse maxLength. Code holds it (checkOpening, too_long).
    opening: { type: "string", description: `At most ${OPENING_WORDS_MAX} words and ${OPENING_CHARS_MAX} characters.` },
    angle: { type: "string", description: `${ANGLE_WORDS_MAX} words or fewer: what the sentence leans on.` },
    facts_used: { type: "array", items: { type: "string", enum: [...OPENING_FACT_KEYS] } },
  },
  required: ["opening", "angle", "facts_used"],
  additionalProperties: false,
} as const;

export const READING_SCHEMA = {
  type: "object",
  properties: {
    backed: { type: "boolean" },
    unbacked: { type: "string" },
    pitch: { type: "boolean" },
    language: { type: "string" },
    kind: { type: "string", enum: [...OPENING_CLAIM_KINDS, "none"] },
  },
  required: ["backed", "unbacked", "pitch", "language", "kind"],
  additionalProperties: false,
} as const;

/** The workspace's side of the writer's input: its name, what it does in its own words, its tone. */
export interface OpeningWorkspace {
  name: string;
  what_we_do: string | null;
  tone: string | null;
}

/** What a record's website_says line is, told the writer and the reader alike. */
const WEBSITE_SAYS_LINE =
  "website_says, where the record has it, is what the business's own website says about itself: its words, a fact like the rest of the record.";

/** The reader's kinds, each with what it covers. */
const CLAIM_KINDS_SAID: string = (
  [
    ["calls", "how often their phone rings or how many calls they get"],
    ["busy", "how busy they are or how many customers they have"],
    ["revenue", "their money"],
    ["feelings", "how they feel"],
    ["problems", "a problem they have"],
    ["plans", "what they mean to do"],
    ["detail", "any other detail, number or name"],
  ] satisfies [OpeningClaimKind, string][]
)
  .map(([k, what]) => `${k} (${what})`)
  .join(", ");

export function openingSystemPrompt(): string {
  return [
    "You write the first sentence of a cold email one local business owner is sending to another local business.",
    "The owner's own email follows your sentence word for word. You write only the opening: the part that shows the owner looked at this business.",
    `Use only the facts in the business's record, the lines inside <record>. Never guess or invent a detail, a number or a name the record does not state, nor ${OPENING_UNSTATED}, unless the record says it.`,
    "Call the business by its name, as the record's name line says it; listed_as is how its listing writes it, with the words a listing adds to be found.",
    WEBSITE_SAYS_LINE,
    "The owner's email makes the case for what they offer: never lead into it with a guess about this business. Say only what the record shows.",
    `A guess said softly is still a guess: never write ${HEDGES_QUOTED} or any word that supposes what the record does not say.`,
    "What the owner searched for is their own words about their search, not a fact about this business: never say it about them.",
    `At most ${OPENING_WORDS_MAX} words, one or two sentences, plain and specific, in the owner's tone. No greeting, no sign-off, no link or web address, no price, no promise, no flattery the record cannot back.`,
    `Tag it with its angle: ${ANGLE_WORDS_MAX} words or fewer naming what it leans on, such as "their reviews", "booking page" or "open late".`,
    "List in facts_used every record field your sentence relies on.",
    DATA_NOT_INSTRUCTIONS,
  ].join("\n");
}

/** Which part of What it's told (told.ts) a line of the writer's input is. */
export type OpeningPart = "listing" | "website" | "reason" | "searched" | "business" | "words";
export interface OpeningLine {
  part: OpeningPart;
  text: string;
}

/** Lines of one part, with those that say nothing (null) left out. */
const partLines = (part: OpeningPart, ...texts: readonly (string | null)[]): OpeningLine[] =>
  texts.flatMap((text) => (text === null ? [] : [{ part, text }]));

/**
 * One line per field, whatever the field holds: a line break in a listing's about text never starts a line of our own,
 * and a tag in a website's title closes no fence (defang). The one fence rule for what others wrote: the check's record
 * here, and a reply's words (reach-out/replies.ts).
 */
export const fenceLine = (key: string, value: string | number | null | undefined): string | null => {
  const v = value === null || value === undefined ? "" : defang(String(value)).replace(/\s+/g, " ").trim();
  return v ? `${key}: ${v}` : null;
};

/**
 * The business's record, fenced: everything inside is data written by others. Its name is the one it is called by
 * (leadCalledByOf), as every email says it; how its listing writes it follows where that is more, since those words are
 * the business's own about itself.
 */
function recordLines(opening: OpeningRecord): OpeningLine[] {
  const name = leadCalledByOf(opening);
  return [
    ...partLines(
      "listing",
      "<record>",
      fenceLine("name", name),
      name === opening.business_name.replace(/\s+/g, " ").trim() ? null : fenceLine("listed_as", opening.business_name),
      fenceLine("category", opening.category),
      fenceLine("city", [opening.city, opening.region].filter(Boolean).join(", ") || null),
      fenceLine("rating", opening.rating),
      fenceLine("reviews", opening.reviews),
      fenceLine("website", opening.website),
      fenceLine("hours", opening.hours),
      fenceLine("about", opening.about),
    ),
    ...partLines("reason", fenceLine("why_it_fits", opening.why_it_fits)),
    ...partLines("website", fenceLine("website_says", opening.website_says)),
    ...partLines("listing", "</record>"),
  ];
}

/**
 * What an owner asked when they pressed Rewrite the opening (00505 sequence_sends.rewrite_asked): the opening they turned
 * down, where there was one, and what should change in their own words, or none.
 */
export interface OpeningAsked {
  was: string | null;
  change: string | null;
}

/** A send's rewrite_asked as the check reads it: null where nobody asked, or where it holds nothing of that shape. */
export function openingAskedOf(stored: unknown): OpeningAsked | null {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  const s = stored as { change?: unknown; was?: unknown };
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const was = s.was && typeof s.was === "object" ? text((s.was as { opening?: unknown }).opening) : null;
  return { was, change: text(s.change) };
}

/** What an owner asked, as the writer is told it: what they turned down, and their words, fenced as the record's are. */
function askedLines(a: OpeningAsked): string[] {
  const was = fenceLine("The owner turned this opening down", a.was);
  const change = fenceLine("The owner asks", a.change);
  if (!was && !change) return [];
  return [
    "",
    ...(was ? [was, "Write a different one: not the same fact said again."] : []),
    ...(change ? [change, "Do what the owner asks within the rules: a fact the record does not state stays out."] : []),
  ];
}

interface OpeningInput {
  record: OpeningRecord;
  workspace: OpeningWorkspace;
  words: { subject: string | null; body: string };
  asked?: OpeningAsked | null;
  retry?: { opening: string; why: string };
}

/** The writer's input, line by line, each with the part of What it's told it is. */
export function openingUserLines(params: OpeningInput): OpeningLine[] {
  const { record, workspace, words, asked, retry } = params;
  return [
    ...partLines("listing", "The business's record:"),
    ...recordLines(record),
    ...partLines("listing", ""),
    ...partLines("searched", fenceLine("What the owner searched for (not about this business)", record.what_you_asked)),
    ...partLines(
      "business",
      `The owner's business: ${workspace.name}`,
      // Fenced, on one line: where the owner wrote nothing these are the words of their website (db findWorkspaceWords). Never
      // a second <record>: the writer is told the lines inside it are the facts about the business it writes to.
      workspace.what_we_do
        ? `What they do: ${fencedInline("note", workspace.what_we_do.replace(/\s+/g, " ").trim())}`
        : null,
      workspace.tone ? `Their tone: ${workspace.tone}` : null,
      "",
    ),
    ...partLines(
      "words",
      "The owner's email, where {{opening}} is your sentence:",
      words.subject ? `Subject: ${words.subject}` : null,
      words.body,
      ...(asked ? askedLines(asked) : []),
      ...(retry
        ? [
            "",
            fenceLine("Your last opening was", retry.opening) ?? "",
            `It could not be sent: ${defang(retry.why)}. Write it again from the record only.`,
          ]
        : []),
    ),
  ];
}

export function openingUserContent(params: OpeningInput): string {
  return openingUserLines(params)
    .map((l) => l.text)
    .join("\n");
}

export function readingSystemPrompt(): string {
  return [
    "You check one sentence that opens a cold email, against the record of the business it was written for.",
    `backed: true only if every claim in the sentence is stated in the record. A claim about ${OPENING_UNSTATED} is not stated unless the record says it.`,
    `A guess is a claim: a sentence that supposes or infers anything about the business (${HEDGES_QUOTED}, or a conclusion drawn from its rating, reviews or hours) is not backed unless the record states it.`,
    "unbacked: when backed is false, the shortest part of the sentence that is not in the record; otherwise an empty string.",
    `kind: when backed is false, what that part is about: ${CLAIM_KINDS_SAID}; "none" when backed is true.`,
    WEBSITE_SAYS_LINE,
    "pitch: true if the sentence names a price, a discount, a guarantee, or a result it promises.",
    "language: the ISO 639-1 code of the language the record's about text is written in; \"unknown\" when there is no about text or it is too short to tell. Never judge it from the business's name, category or city: a business with a name in one language often writes in another.",
    DATA_NOT_INSTRUCTIONS,
  ].join("\n");
}

/** The sentence holds a listing's name where a listing's own fields said it (leadFactOf), so it is held as the record is. */
export function readingUserContent(params: { record: OpeningRecord; opening: string }): string {
  const sentence = fenceLine("The sentence", params.opening) ?? "";
  return ["The business's record:", ...recordLines(params.record).map((l) => l.text), "", sentence].join("\n");
}

/** Words a tag never ends on: a cut that leaves one ("their reviews and") drops it. */
const ANGLE_TAIL = new Set(["and", "or", "the", "a", "an", "of", "with", "is", "are", "to", "for"]);

/**
 * An angle as the tag it is (Reports' replies by angle): its first phrase, at most ANGLE_WORDS_MAX words, never ending
 * on a joining word. A longer one is cut here, where every answer is read, so it never holds an email on its own (29 Oct
 * 2026: "independent shop, own site" held a true sentence).
 */
function angleOf(raw: string): string {
  const phrase =
    raw
      .trim()
      .replace(/\s+/g, " ")
      .split(/\s*(?:,|;|—|–|·|&|\+|\band\b)\s*/i)
      .find((x) => x.trim()) ?? "";
  const words = phrase.split(" ").filter(Boolean).slice(0, ANGLE_WORDS_MAX);
  while (words.length > 1 && ANGLE_TAIL.has((words.at(-1) ?? "").toLowerCase())) words.pop();
  return words.join(" ");
}

export function parseOpening(first: unknown): WrittenOpening | null {
  if (!first || typeof first !== "object") return null;
  const value = first as Record<string, unknown>;
  if (typeof value.opening !== "string" || typeof value.angle !== "string" || !Array.isArray(value.facts_used))
    return null;
  // A name that is no field of the record is kept as written: checkOpening refuses it (unnamed_fact), never drops it.
  const facts = value.facts_used.filter((k): k is string => typeof k === "string").map((k) => k.trim());
  return {
    opening: value.opening.trim().replace(/\s+/g, " "),
    angle: angleOf(value.angle),
    facts_used: [...new Set(facts)],
  };
}

export interface Reading {
  backed: boolean;
  unbacked: string;
  pitch: boolean;
  language: string;
  /** What an unbacked part is about; null where backed, or the answer names none of the set. */
  kind: OpeningClaimKind | null;
}

const isClaimKind = (k: unknown): k is OpeningClaimKind => typeof k === "string" && isOneOf(OPENING_CLAIM_KINDS, k);

export function parseReading(first: unknown): Reading | null {
  if (!first || typeof first !== "object") return null;
  const value = first as Record<string, unknown>;
  // An answer missing a part is no reading: the check fails closed (asked again, then held), never open.
  if (typeof value.backed !== "boolean" || typeof value.pitch !== "boolean" || typeof value.language !== "string")
    return null;
  return {
    backed: value.backed,
    unbacked: typeof value.unbacked === "string" ? value.unbacked.trim() : "",
    pitch: value.pitch,
    language: value.language.trim().toLowerCase(),
    // The kind is how a hold says it, never whether it holds: one out of the set is none.
    kind: isClaimKind(value.kind) ? value.kind : null,
  };
}

export type OpeningVerdict =
  | { ok: true }
  | {
      ok: false;
      hold: "language" | "unbacked_fact" | "reads_like_spam" | "check_unavailable";
      /** Stored beside the reason (holdWords reads it): a language's code, the unbacked words, or the code rule broken. */
      detail: string | null;
      /** Whether one rewrite may answer it: another language cannot, the owner's words being in one. */
      rewrite: boolean;
      /** What the writer is told when it is asked again. */
      why: string;
    };

/**
 * What one written opening comes to, given its words, code's reading of them (checkOpening) and the reader's (F2).
 *   - A language that is not the step's holds it with no rewrite. Both sides are compared as base codes ("en_US" is
 *     "en"), and a reader's answer that names no language ("english", "und") is no language hold.
 *   - A claim or a number the record does not hold, or a guess: unbacked_fact, a guess with the clause it said.
 *   - A link, a line in capitals, a price, or the reader's pitch: reads_like_spam, with the rule it broke.
 *   - Empty, too long, a brace, an angle out of bounds: the writer failed, not the business; check_unavailable, with
 *     the rule it broke, so the owner reads what happened and never "a pitch".
 * Each asks for one rewrite, told why, then holds.
 */
export function openingVerdict(
  code: OpeningProblem | null,
  reading: Reading,
  stepLanguage: string,
  written: string,
): OpeningVerdict {
  const theirs = languageBase(reading.language);
  const ours = languageBase(stepLanguage);
  if (theirs && ours && theirs !== ours)
    return { ok: false, hold: "language", detail: theirs, rewrite: false, why: "" };
  if (!reading.backed) {
    const sentence = reading.unbacked.slice(0, 120) || null;
    return {
      ok: false,
      hold: "unbacked_fact",
      // Its kind beside its words (30 Oct 2026), so the held email says what it guessed at.
      detail: heldClaimDetail(reading.kind ?? "detail", sentence),
      rewrite: true,
      // The kind of claim, not only its words: told the words alone, a rewrite made the same guess in others.
      why: `${sentence ? `it said “${sentence}”, which the record does not hold` : "it said something the record does not hold"}; no record holds ${OPENING_UNSTATED}`,
    };
  }
  if (code === "guess") {
    const sentence = (openingGuess(written) ?? written).slice(0, 120);
    return {
      ok: false,
      hold: "unbacked_fact",
      detail: heldClaimDetail("guess", sentence),
      rewrite: true,
      why: `it guessed (“${sentence}”), and a guess is a claim the record does not hold; no record holds ${OPENING_UNSTATED}`,
    };
  }
  if (code === "unnamed_fact" || code === "unbacked_number")
    return { ok: false, hold: "unbacked_fact", detail: null, rewrite: true, why: openingProblemWords(code) };
  if (code === "link" || code === "shouting" || code === "price")
    return { ok: false, hold: "reads_like_spam", detail: code, rewrite: true, why: openingProblemWords(code) };
  if (code)
    return { ok: false, hold: "check_unavailable", detail: code, rewrite: true, why: openingProblemWords(code) };
  if (reading.pitch)
    return {
      ok: false,
      hold: "reads_like_spam",
      detail: null,
      rewrite: true,
      why: "it named a price or made a promise",
    };
  return { ok: true };
}
