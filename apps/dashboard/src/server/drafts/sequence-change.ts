/**
 * A draft changed by a line (POST sequences/draft with `stands`; decision 0129 step 2): New's draft keeps a line under
 * it, and what its owner says there changes the draft that stands, in place of buttons that each change one thing one
 * way. The drafter is told the draft as it stands, in the shape it answers in (who and each held message by the keys the
 * request lists them under, the words as data), and what to change; its answer is the whole draft again, judged as any
 * draft is (draft-judge.ts). Nothing is written (decision 0017).
 */
import "server-only";
import { fenced, fencedInline, type NewDraftAsk } from "@chanlytics/contracts";
import type { DraftKnown } from "../campaigns/sequences/draft-judge";
import { stoodStepsOf } from "../campaigns/sequences/draft-stands";

type Stands = NonNullable<NewDraftAsk["stands"]>;

/** The one rule a change adds to the drafter's own: only what was asked changes. */
export const CHANGE_RULE =
  "Where the request holds a draft as it stands, its owner is changing it: answer the whole draft again with what they ask changed, and every other part exactly as it stands, word for word: its kind, audience, who, name, hour and when, and each step they did not ask about, with its wait, what must still hold and its words. A step whose `message` is a key keeps that key: a message the business holds is never changed in place, and a change that names no step (warmer, shorter) is made to the messages written in `write` alone. Only where the owner names that step or its message and asks for other words there, write its message new in `write`, from the held one's words, and leave `message` empty. Where a change they asked of every message left a held one as it is, say so in `cannot`: “Step N is one of your own messages, so it stays as it is. Name the step to have it written again.” On a change, `cannot` says what of this change could not be done, and again what the draft as it stands was said to leave out, where it still leaves it out. A part of the draft as it stands that says otherwise than what the owner first said, and that this note does not name, is the owner's own change since (a new figure, another audience): never say it is left out.";

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
 * never instructions), what it says it leaves out (so what its owner changed since is never said to be: the live run of
 * 13 Nov 2026), who it is for where the request lists no key for them (picked on Leads, say: kept by an empty `who`), and
 * what to change.
 */
export function standsAsked(stands: Stands, change: string, known: DraftKnown): Array<string | null> {
  const unlisted = stands.who && !whoKeyOf(stands.who, known) ? stands.who.label : null;
  const leftOut = stands.cannot?.trim() ?? "";
  return [
    stands.said.trim() ? `What the owner first said it should do: ${stands.said.trim()}` : null,
    `The draft as it stands, in the shape you answer in:\n${fenced("record", JSON.stringify(standsAnswerOf(stands, known)))}`,
    leftOut ? `What the draft leaves out as it stands: ${fencedInline("record", leftOut)}` : null,
    unlisted
      ? `Who it is for is already chosen, ${fencedInline("record", unlisted)}: leave \`who\` empty and it stays.`
      : null,
    `What the owner wants changed: ${change.trim()}`,
  ];
}
