/**
 * Their last words (canvas A, Overview): the newest thing they said and the newest thing we said to them, oldest first,
 * as two bubbles that are the doors to the thread. Nothing of ours that never reached them, and nothing the page says
 * elsewhere (a call is History's, a visit Coming up's).
 */
import type { PersonTimelineItemVM } from "../people/person-timeline";

/** The pane's title. */
export const LAST_WORDS_TITLE = "Their last words";

/** One bubble: who said it and when, what was said, and whether it was ours. */
export interface LastWordVM {
  id: string;
  mine: boolean;
  who: string;
  when: string;
  text: string;
}

/** The most characters a bubble says before it ends in an ellipsis: the thread holds the rest. */
const BUBBLE = 280;

/** Their newest message and our newest, from the History (newest first), oldest first; none where neither exists. */
export function lastWordsOf(timeline: readonly PersonTimelineItemVM[]): LastWordVM[] {
  const theirs = timeline.find((t) => t.kind === "customer" && !!t.text);
  const ours = timeline.find((t) => (t.kind === "receptionist" || t.kind === "team") && !t.unsent && !!t.text);
  return [theirs, ours]
    .filter((t): t is PersonTimelineItemVM => !!t)
    .sort((a, b) => a.ts - b.ts)
    .map((t) => ({
      id: t.id,
      mine: t.kind !== "customer",
      who: t.who,
      when: [t.day, t.time].filter(Boolean).join(" · "),
      text: t.text.length > BUBBLE ? `${t.text.slice(0, BUBBLE - 1).trimEnd()}…` : t.text,
    }));
}
