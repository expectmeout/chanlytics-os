import "server-only";
import { z } from "zod";
import { FORM_LIMITS } from "@chanlytics/contracts";
import { defineAct, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { propose, refuse } from "../../context/context";

/**
 * A new form, asked for in AI's own turn (Campaigns in three tabs, the plan's B4; the canvas's Forms board 10). AI hands
 * the owner's sentence to Forms on one card, "Draft it in Forms": its press drafts the form on Forms' own press (POST
 * forms, act make), with the same drafter as Forms' own line (server ask/skills/form), and opens Forms on the draft,
 * where the owner changes it and publishes it. AI writes none of the form in the conversation, so nothing of it is
 * said twice and the drafter's rules (no payment, no yes to offers, nothing booked) hold as they do on the page. A card
 * pressed twice is one press, and opens the one draft it made (contracts forms/draft-card.ts). The act never acts, as
 * every act.
 */

/** What the model is told where no card is made. Said to the model only. */
const FORM_REFUSED = {
  short: "Say in a few words what the form should collect, in the owner's own words, then propose it.",
} as const;

/** The card's words, as the member reads them on it (the canvas's board 10). */
const FORM_CARD = {
  /** The heading a sentence too long to be one leaves the card. */
  untitled: "A new form",
  summary:
    "AI drafts it in Forms, from your services and the way you write. You change it there, and it goes live only when you publish it.",
  /** The owner's sentence, said under the heading where it was too long to be one. */
  asked: (sentence: string) => `You asked for: ${sentence}`,
} as const;

/** The longest sentence a card's heading holds, as a form's own heading does (contracts FORM_LIMITS.heading). */
const TITLE_MAX = FORM_LIMITS.heading;

/** The card's heading and summary: the owner's sentence as the heading where it fits, else said under it. */
function formCardWordsOf(sentence: string): { title: string; summary: string } {
  if (sentence.length <= TITLE_MAX)
    return { title: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`, summary: FORM_CARD.summary };
  return { title: FORM_CARD.untitled, summary: `${FORM_CARD.asked(sentence)} ${FORM_CARD.summary}` };
}

function formDraftOutcome(_toolContext: ToolContext, input: { sentence: string }): Promise<ProposalOutcome> {
  const sentence = input.sentence.trim().replace(/\s+/gu, " ").slice(0, FORM_LIMITS.sentence);
  if (sentence.length < 2) return Promise.resolve(refuse(FORM_REFUSED.short));
  return Promise.resolve(propose({ kind: "form_draft", ...formCardWordsOf(sentence), payload: { sentence } }));
}

export const formDraftAct = defineAct({
  name: "propose_form",
  description:
    "Hand a form the person asked for to Campaigns › Forms: its press drafts it there and opens the draft, where they change it and publish it. It takes their sentence alone, in their own words, of what the form should collect. Never write the form's questions yourself.",
  kind: "form_draft",
  input: z.object({
    sentence: z
      .string()
      .min(2)
      .max(FORM_LIMITS.sentence)
      .describe(
        "What the form should collect, in the person's own words: 'a consultation form for new colour clients'.",
      ),
  }),
  label: "Handing it to Forms",
  build: formDraftOutcome,
});
