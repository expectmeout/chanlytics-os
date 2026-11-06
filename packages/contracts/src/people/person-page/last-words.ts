/**
 * Their last words (canvas A, Overview): the newest thing they said and the newest thing we said to them, oldest first,
 * as two bubbles that are the doors to the thread. Nothing of ours that never reached them, and nothing the page says
 * elsewhere (a call is History's, a visit Coming up's).
 */
import type { PersonTimelineItemVM } from "../person-timeline";

/** The pane's title: it holds ours as well as theirs, so never "Their last words" (3 Nov 2026: it titled our email). */
export const LAST_WORDS_TITLE = "Latest";

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
      // Theirs is "They": the page's head names them right above, and a team's whole name broke the line in two.
      who: t.kind === "customer" ? "They" : t.who,
      // The day once, then its time: "Yesterday, 10:06 AM" (the phone pass, 3 Nov 2026: "Yesterday · Nov 3 · 10:06 AM" said
      // the day twice, and broke the receptionist's line in two). A day beyond the week is its date alone ("Oct 28").
      when: [t.day.split(" · ")[0], t.time].filter(Boolean).join(", "),
      text: t.text.length > BUBBLE ? `${t.text.slice(0, BUBBLE - 1).trimEnd()}…` : t.text,
    }));
}
