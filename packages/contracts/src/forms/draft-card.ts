/**
 * AI's card for a new form (Campaigns in three tabs, the plan's B4; the canvas's Forms board 10): asked in its own turn
 * for a form, AI hands the owner's sentence to Forms on one card, "Draft it in Forms". Its press drafts the form on
 * Forms' own press (POST forms, act make), with the same drafter Forms' own line uses, and opens Forms on the draft,
 * where the owner changes it; it goes live only on the owner's Publish there. AI writes none of the form in the
 * conversation, so the sentence is never said twice.
 *
 * Its press waits the drafter's whole minute (`waitMs`, FORM_PRESS_WAIT_MS) on each leg it takes: Ask's act door calls Forms
 * with it (server ask/act/run.ts), the tab waits the door's own limit (ASK_ACT_WAIT_MS), and a door that cannot act hands
 * the press back to the tab, which calls Forms under the same key with the same wait. Pressed again (a second tab, or Try
 * again after a press that ran out), the card is one press: every write keeps a card's press under the card's own id
 * (server shared/route.ts onceForKey), so the second is answered with the first's form and opens that draft, never a
 * second one. The card's Open goes to the form it made.
 *
 * What the card carries: the sentence, in the owner's own words, as Forms' line takes it (2 to 600 characters). Pure.
 */
import type { ProposalSpec } from "../ask/proposals/spec";
import { recordOrEmpty, textOrEmpty } from "../shared/unknown";
import { FORMS_ROUTE, formsRouteOf } from "./address";
import { FORM_LIMITS, FORM_PRESS_WAIT_MS } from "./limits";

/** What the press answered: the form made, or AI's one question back, or that no draft could be made. */
function draftedOf(data: unknown): { formId: string | null; question: string | null } {
  const answer = recordOrEmpty(data);
  const formId = typeof answer.form_id === "string" && answer.form_id ? answer.form_id : null;
  const question = answer.asked === true ? textOrEmpty(answer.said) || null : null;
  return { formId, question };
}

/** What the card's receipt says, by what the press answered. */
const FORM_CARD_WORDS = {
  drafted: "Drafted. Forms is open on it.",
  asked: (question: string) => `AI asks first: ${question}`,
  failed: "AI couldn't draft this one, and nothing was made. Say it in Forms' own line, or try again.",
} as const;

/** A form card commits Forms' own press: the sentence, drafted into a form, and Forms opened on it. */
export const formDraftSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload }) => ({
    route: "POST forms",
    body: { act: "make", sentence: textOrEmpty(payload.sentence).trim().slice(0, FORM_LIMITS.sentence) },
    waitMs: FORM_PRESS_WAIT_MS,
  }),
  receipt: (_card, data) => {
    const drafted = draftedOf(data);
    if (drafted.formId) return FORM_CARD_WORDS.drafted;
    return drafted.question ? FORM_CARD_WORDS.asked(drafted.question) : FORM_CARD_WORDS.failed;
  },
  made: (_card, data) => draftedOf(data).formId,
  open: (_card, outcome) => (outcome?.made?.id ? formsRouteOf({ form: outcome.made.id }) : FORMS_ROUTE),
};
