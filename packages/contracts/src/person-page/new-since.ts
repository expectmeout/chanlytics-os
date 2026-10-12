/**
 * New since you last looked (decision 0052, canvas A's History): the rows of a person's history the reader has not seen,
 * marked by a dot on the row and on the History tab, and nothing else. What the reader had seen is their own mark on the
 * person as this visit began (00349's contact_marks, which their page writes on every open): their words and calls after
 * what the mark had seen of them (seen_at), and everything else, the receptionist's, the team's and the system's, after
 * the mark was last written (marked_at). Nothing this visit brought (the page shows it as it lands), and nothing on a first
 * open, when there is no mark to be new against.
 */
import type { PersonTimelineItemVM } from "../people/person-timeline";

/** What the reader had seen of a person when this visit began, and when it began; epoch ms, 0 for none. */
export interface LookedAt {
  /** How far they had seen the person's own words and calls (the mark's seen_at). */
  seenAtMs: number;
  /** When they last opened the person (the mark's marked_at). */
  markedAtMs: number;
  /** When this visit began: what came after it is the visit's own. */
  visitAtMs: number;
}

/** The dot's words, for a screen reader: on a row, and on the History tab. */
export const NEW_SINCE_WORDS = "New since you last looked";

/** The person's own moments: what they wrote, and the calls, which their mark's seen_at is measured in. */
const theirs = (kind: PersonTimelineItemVM["kind"]) => kind === "customer" || kind === "call";

/** The ids of the rows new since the reader last looked: none on a first open, none from this visit. */
export function newSinceOf(
  items: readonly Pick<PersonTimelineItemVM, "id" | "ts" | "kind">[],
  looked: LookedAt | null,
): Set<string> {
  if (!looked || !looked.markedAtMs) return new Set();
  return new Set(
    items
      .filter(
        (e) =>
          e.ts <= looked.visitAtMs &&
          e.ts > (theirs(e.kind) ? looked.seenAtMs || looked.markedAtMs : looked.markedAtMs),
      )
      .map((e) => e.id),
  );
}
