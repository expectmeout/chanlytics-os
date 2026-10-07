/**
 * A reach-out's hand step (Reach out Part 5, G20): a chain's last step may hand each lead it reaches to the team instead
 * of writing to them, as a call to make or a note, a dated step on the lead's person due the day the step runs. Its
 * shape is the database's (00228 playbooks.hand); its words are here.
 */

/** What a hand step hands over: a call to make, or a note. */
export const HAND_KINDS = ["call", "note"] as const;
export type HandKind = (typeof HAND_KINDS)[number];

/** A hand step's own words, in characters (00228's CHECK holds the same). */
export const HAND_WORDS_MAX = 280;

/** A step's hand, as the row holds it. */
export interface StepHand {
  kind: HandKind;
  words: string;
}

/** A row's hand, read: null for an email step, or for anything the row should not hold. */
export function handOf(v: unknown): StepHand | null {
  if (!v || typeof v !== "object") return null;
  const h = v as { kind?: unknown; words?: unknown };
  if (!HAND_KINDS.includes(h.kind as HandKind) || typeof h.words !== "string") return null;
  const words = h.words.trim();
  return words ? { kind: h.kind as HandKind, words } : null;
}

/**
 * The step the team is handed for one business, as the person's page and Today show it: "Call Brightwater & Co.: ask
 * whether the quote suited them" for a call, "Brightwater & Co.: send the price list" for a note.
 */
export function handStepWords(kind: HandKind, business: string, words: string): string {
  const who = business.trim() || "This business";
  return kind === "call" ? `Call ${who}: ${words.trim()}` : `${who}: ${words.trim()}`;
}
