/**
 * How it answers: the languages and the voices offered, and the owner's own words at rest (the notes, the
 * instructions and the three messages sent in the business's name). The hand-off's words are handoff-words.ts.
 */
import { INSTRUCTIONS_MAX } from "../workspace-config/business-profile";
import { FALLBACK_DEFAULTS, isProductFallback } from "../workspace-config/fallbacks";
import { CHIPS_SHOWN, chipsMoreWords, count } from "./counts";

/* ---- How it answers ---- */

/**
 * The languages offered rather than typed, the commonest first: the Business tab's languages box
 * (business-tab-answers.jsx) and the first run's chips (check-chips.ts) offer this one list. A comma-separated box asks
 * someone to guess both the spelling and the separator, and "Espanol" and "Spanish" would then be two different
 * languages to anything reading this later. Anything not listed can still be added by hand.
 */
export const COMMON_LANGUAGES: readonly string[] = [
  "English",
  "Spanish",
  "Portuguese",
  "French",
  "Haitian Creole",
  "Mandarin",
  "Cantonese",
  "Arabic",
  "Russian",
  "Polish",
  "Italian",
  "Hindi",
];

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

/** The notes row at rest: the first titles as chips, and how many more. */
export interface NotesWordsVM {
  count: number;
  /** The first three titles, in the stored order, which is the order the receptionist reads them in. */
  chips: string[];
  /** "+3" past the three; null when every one is a chip. */
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
    return t !== "" && !isProductFallback(k, t);
  }).length;
  return { line: `${count(keys.length)} messages, ${differ ? "in your words" : "the product's wording"}` };
}
