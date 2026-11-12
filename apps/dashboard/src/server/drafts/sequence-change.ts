/**
 * A draft changed by a line (POST sequences/draft with `stands`; decision 0129 step 2): New's draft keeps a line under
 * it, and what its owner says there changes the draft that stands, in place of buttons that each change one thing one
 * way. The drafter is told the draft as it stands, in the shape it answers in (who and each held message by the keys the
 * request lists them under, the words as data), and what to change; its answer is the whole draft again, judged as any
 * draft is (draft-judge.ts). Nothing is written (decision 0017).
 */
import "server-only";
import { fenced, fencedInline, type NewDraftAsk } from "@chanlytics/contracts";
import { stoodStepsOf, type DraftKnown } from "../campaigns/sequences/draft-judge";

type Stands = NonNullable<NewDraftAsk["stands"]>;

/** The one rule a change adds to the drafter's own: only what was asked changes. */
export const CHANGE_RULE =
  "Where the request holds a draft as it stands, its owner is changing it: answer the whole draft again with what they ask changed, and every other part exactly as it stands, word for word: its kind, audience, who, name, hour and when, and each step they did not ask about, with its wait, what must still hold and its words. A step whose `message` is a key keeps that key; a message the business holds is never changed in place, so where they ask for other words on such a step, write its message new in `write`, from the held one's words, and leave `message` empty. `cannot` then says only what of the change could not be done.";

/** Who a draft that stands is for, by the key the request lists them under; "" where it lists none for them. */
function whoKeyOf(chosen: Stands["who"], known: DraftKnown): string {
  if (!chosen) return "";
  if (chosen.kind === "moment") return known.moments.find((moment) => moment.trigger === chosen.trigger)?.key ?? "";
  if (chosen.kind === "list") return known.lists.find((list) => list.token === chosen.token)?.key ?? "";
  if (chosen.kind === "search") return known.searches.find((search) => search.id === chosen.id)?.key ?? "";
  return chosen.kind === "everyone" ? "everyone" : "";
}

/** The draft as it stands, in the shape Ask answers in: who and each held message by the request's keys. */
function standsAnswerOf(stands: Stands, known: DraftKnown) {
  return {
    kind: stands.kind,
    audience: stands.audience,
    who: whoKeyOf(stands.who, known),
    name: stands.name,
    hour: stands.hour,
    when: stands.when,
    steps: stoodStepsOf(stands, known),
  };
}

/**
 * What the drafter is told where the line changes a draft: what its owner first asked for, the draft as it stands (data,
 * never instructions), who it is for where the request lists no key for them (picked on Leads, say: kept by an empty
 * `who`), and what to change.
 */
export function standsAsked(stands: Stands, change: string, known: DraftKnown): Array<string | null> {
  const unlisted = stands.who && !whoKeyOf(stands.who, known) ? stands.who.label : null;
  return [
    stands.said.trim() ? `What the owner first said it should do: ${stands.said.trim()}` : null,
    `The draft as it stands, in the shape you answer in:\n${fenced("record", JSON.stringify(standsAnswerOf(stands, known)))}`,
    unlisted
      ? `Who it is for is already chosen, ${fencedInline("record", unlisted)}: leave \`who\` empty and it stays.`
      : null,
    `What the owner wants changed: ${change.trim()}`,
  ];
}
