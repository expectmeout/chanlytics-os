/**
 * What a held email may become, said once for the record's rail, a sequence's Leads tab, the lead sheet's dock and a
 * run's screen (the lead-to-sequence canvas's one meaning each). A module of its own, so a page that draws a held email's
 * choices (the Inbox's run rows through sequence-tab-words) loads none of a lead's place (sequence-place) or the schedule
 * beneath it.
 */
import {
  HOLD_DOOR_WORDS,
  heldClaimOf,
  holdDoors,
  holdWords,
  isReachOutHold,
  openingClaimWords,
  type HeldClaimKind,
  type HoldDoor,
  type ReachOutHold,
} from "../reach-out/reach-out-words";
import { capitalize } from "../shared/words";

/**
 * Why a held email waits, as its row says it (a run's, a sequence's Needs you, a lead's place): the check's words, and,
 * where the check could not run and broke no rule, that it is tried again by itself an hour on (the edge's
 * CHECK_RELEASE_AFTER_MS), so nobody presses for what is coming anyway.
 */
export function heldWhyOf(reason: ReachOutHold, detail: string | null): string {
  const why = capitalize(holdWords(reason, detail));
  return reason === "check_unavailable" && !detail ? `${why}; it tries again on its own within the hour` : why;
}

/** Taking a lead out of the sequence their place stands in: the leave verb, which Put back undoes. */
export const HELD_TAKE_OUT = "Take out";

/** An answer to a held email: one of the decide verb's doors, or Take out, the leave verb (sequence_leave). */
export type HeldChoice = HoldDoor | "take_out";

/** One answer as a held email's row draws it: what it does, its words, and whether it is the one the hold points to. */
export interface HeldAnswer {
  door: HeldChoice;
  words: string;
  /** The answer the reason points to (drawn filled): a rewrite where the words are the problem, leaving out a customer. */
  lead: boolean;
}

/**
 * Every answer a held email's row offers (a run's screen, a sequence's Needs you, the lead sheet's dock): its hold's doors,
 * and the no at every step, Take out where Skip would end their place, which at step 1 it would (00459). A check that could not run and broke no rule is tried again by the clock and by
 * the run's Check the held again, so nothing asks to rewrite words nobody faulted. Only the reason's own fix leads: a
 * rewrite for the words, leaving out a customer's colleague; a hold about who they are suggests nothing.
 */
export function heldAnswersOf(h: { reason: string | null; detail: string | null }, place: number | null): HeldAnswer[] {
  const doors: HoldDoor[] = isReachOutHold(h.reason) ? holdDoors(h.reason) : ["include", "skip"];
  const tried = h.reason === "check_unavailable" && !h.detail ? doors.filter((d) => d !== "rewrite") : doors;
  const first = (place ?? 1) <= 1;
  return tried.map((d, at): HeldAnswer => {
    const door: HeldChoice = d === "skip" && first ? "take_out" : d;
    const fixes = d === "rewrite" || (h.reason === "customer_domain" && d === "skip");
    return { door, words: door === "take_out" ? HELD_TAKE_OUT : HOLD_DOOR_WORDS[d], lead: at === 0 && fixes };
  });
}

/**
 * The answers an email waiting for an OK offers, read before its batch goes (30 Oct 2026; a sequence's Leads tab and a
 * run's Who gets it, one rule): Rewrite the opening where it has one and the check is not writing it, then the no at its
 * step, Take out at step 1 and Skip this email after, as a held email's. None leads: nothing is wrong with it.
 */
export function waitingAnswersOf(e: { opening: string | null; checking: boolean }, place: number | null): HeldAnswer[] {
  const rewrite: HeldAnswer[] =
    e.opening && !e.checking ? [{ door: "rewrite", words: HOLD_DOOR_WORDS.rewrite, lead: false }] : [];
  const no = heldAnswersOf({ reason: null, detail: null }, place)
    .filter((a) => a.door !== "include")
    .map((a) => ({ ...a, lead: false }));
  return [...rewrite, ...no];
}

/** A held email's opening as its row draws it: the words before what the check refused, those words, and the rest. */
export interface MarkedOpening {
  before: string;
  /** The words the check refused, as the opening writes them; null where none is marked. */
  said: string | null;
  after: string;
}

/** Quotes read alike: the reader quotes an opening's curly apostrophe as a straight one. */
const plainQuotes = (t: string): string => t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase();

/**
 * The opening a held email would send, with the words an unbacked hold quoted marked in it (30 Oct 2026: an owner read a
 * fragment and could not judge it). Found as the reader quoted them, whatever their case or quotes; words it does not
 * hold, or any other hold, show the opening whole. Null where the email has none.
 */
export function markedOpeningOf(
  opening: string | null | undefined,
  h: { reason: string | null; detail: string | null },
): MarkedOpening | null {
  const text = opening?.trim();
  if (!text) return null;
  const said = h.reason === "unbacked_fact" ? heldClaimOf(h.detail).said : null;
  const at = said ? plainQuotes(text).indexOf(plainQuotes(said)) : -1;
  if (!said || at < 0) return { before: text, said: null, after: "" };
  return { before: text.slice(0, at), said: text.slice(at, at + said.length), after: text.slice(at + said.length) };
}

/** What a rewrite does, said over the emails held for their words. */
export const HELD_REWRITE_ADVICE = "A rewrite says only what we found on them.";

/**
 * One reason two or more emails held for their words share, said once over them: "Same reason for all 7: the opening
 * guesses at their calls." A hold stored before its kind was is a detail. Null where they share none.
 */
export function heldCauseOf(held: readonly { reason: string | null; detail: string | null }[]): string | null {
  const words = held.filter((h) => h.reason === "unbacked_fact");
  if (words.length < 2) return null;
  const kinds = new Set<HeldClaimKind>(words.map((h) => heldClaimOf(h.detail).kind ?? "detail"));
  if (kinds.size !== 1) return null;
  const [kind] = kinds;
  const n = words.length;
  return `Same reason for ${n === held.length ? `all ${n}` : `${n} of ${held.length}`}: ${openingClaimWords(kind ?? null)}.`;
}

/**
 * Why a person in a sequence stands where they do, as People's line and Ask's read say it, one rule: a held email in the
 * words its row says (heldWhyOf; its stored detail carries the check's kind, 30 Oct 2026), anything else as it came, the
 * detail first. Null where there is none.
 */
export function sequencePersonWhyOf(p: {
  group: string;
  why: string | null;
  hold_detail: string | null;
}): string | null {
  if (p.group === "held" && isReachOutHold(p.why)) return heldWhyOf(p.why, p.hold_detail);
  return p.hold_detail ?? p.why ?? null;
}
