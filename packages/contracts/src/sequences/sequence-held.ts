/**
 * What a held email may become, said once for the record's rail, a sequence's Leads tab and the lead sheet's dock (the
 * lead-to-sequence canvas's one meaning each). A module of its own, so a page that draws a held email's choices (the
 * Inbox's run rows through sequence-tab-words) loads none of a lead's place (sequence-place) or the schedule beneath it.
 */
import { holdDoors, isReachOutHold, type HoldDoor } from "../reach-out/reach-out-words";

/** What a held email may become, in the doors' words: Send as written, Skip this email. */
const HELD_CHOICE_WORDS: Record<HoldDoor, string> = {
  include: "Send as written",
  rewrite: "Rewrite the opening",
  skip: "Skip this email",
  not_a_fit: "Not a fit",
};

/**
 * The choices a held email offers, by why it was held (contracts holdDoors) and its step: Skip this email from step 2,
 * where the lead goes on to the next step (00459); at step 1 skipping would end their place, which Take out says.
 */
export function heldChoicesOf(hold: string | null, place: number | null): [HoldDoor, string][] {
  const doors: HoldDoor[] = isReachOutHold(hold) ? holdDoors(hold) : ["include", "skip"];
  return doors.filter((d) => d !== "skip" || (place ?? 1) > 1).map((d) => [d, HELD_CHOICE_WORDS[d]]);
}
