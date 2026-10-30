/**
 * What a held email may become, said once for the record's rail, a sequence's Leads tab, the lead sheet's dock and a
 * run's screen (the lead-to-sequence canvas's one meaning each). A module of its own, so a page that draws a held email's
 * choices (the Inbox's run rows through sequence-tab-words) loads none of a lead's place (sequence-place) or the schedule
 * beneath it.
 */
import {
  HOLD_DOOR_WORDS,
  holdDoors,
  holdWords,
  isReachOutHold,
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

/**
 * The choices a held email offers, by why it was held (contracts holdDoors) and its step: Skip this email from step 2,
 * where the lead goes on to the next step (00459); at step 1 skipping would end their place, which Take out says.
 */
export function heldChoicesOf(hold: string | null, place: number | null): [HoldDoor, string][] {
  const doors: HoldDoor[] = isReachOutHold(hold) ? holdDoors(hold) : ["include", "skip"];
  return doors.filter((d) => d !== "skip" || (place ?? 1) > 1).map((d) => [d, HOLD_DOOR_WORDS[d]]);
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
 * Every answer a held email's row offers where it stands alone, with no Take out of its own beside it (a run's screen, a
 * sequence's Needs you; the lead sheet keeps its own in the place's pane): heldChoicesOf's, and the no at every step, Take
 * out where Skip would end their place. A check that could not run and broke no rule is tried again by the clock and by
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
