/** Context: context. */

import "server-only";
import { randomUUID } from "node:crypto";
import {
  FIX_CARD_WORDS,
  type AskProposal,
  type PlanLead,
  PROPOSAL_SPECS,
  type ProposalKindAboveOperator,
} from "@chanlytics/contracts";
import type { ProposalOutcome } from "./tool-defs";

/**
 * Who may approve a card of this kind, and what to tell a member who may not, for its tool's description: one whole
 * clause, read from the spec's `needs` (contracts ask-proposals/), the same role the builder refuses below
 * (proposalBelowNeeds), so a description never says a second thing about who may approve. A partner's door is the
 * owner's and the partner's; an owner's is the owner's alone. A tool with actions says it in the action's own words
 * (D2), so a role the action is not offered to never reads it.
 */
export function approvalWords(kind: ProposalKindAboveOperator): string {
  return PROPOSAL_SPECS[kind].needs === "partner"
    ? "Only an owner or a partner can approve it: for anyone else, say so and that one of them can ask"
    : "Only an owner can approve it: for anyone else, say so and that an owner can ask";
}

/**
 * A card's id, which is also the key its write is kept under (route.ts onceForKey, `card:<id>`, with no hash of the
 * request): two cards must never share one, or the second's Approve is answered with the first's receipt and changes
 * nothing. It was the millisecond and a counter each server instance started at zero, so two instances proposing in
 * one millisecond for one workspace minted the same id.
 */
const nextId = () => `p-${randomUUID()}`;

export const refuse = (reason: string): ProposalOutcome => ({
  proposal: null,
  result: JSON.stringify({ error: reason }),
  isError: true,
  refusal: reason,
});

/**
 * A card, from what its builder made of the input. The role it needs and its undo's words are its kind's spec's
 * (contracts ask-proposals/), the same spec the palette commits it by, so a builder cannot say a second thing about
 * either (D7). A builder whose kind needs more than an operator refuses a member below it first, in its route's words
 * (`roleAtLeast`, `proposalBelowNeeds`).
 */
/**
 * What holds a card, as the model is told it beside the card's title (decision 0088, item 5): the card's own holds
 * (AskCardSheet.holds), where it has any, so the answer written beside the card leaves them out, as the setup rule asks
 * of it. Nothing where the card holds nothing, or has no sheet. One rule for a card alone and for a plan's step
 * (act/plan.ts), which carries no summary.
 */
export const holdsSaid = (askProposal: Pick<AskProposal, "sheet"> | undefined): { holds?: string[] } =>
  askProposal?.sheet?.holds.length ? { holds: askProposal.sheet.holds } : {};

export const propose = (
  askProposal: Omit<AskProposal, "id" | "needs" | "undo" | "made_at">,
  noted?: string,
): ProposalOutcome => {
  const spec = PROPOSAL_SPECS[askProposal.kind];
  const proposal: AskProposal = {
    id: nextId(),
    ...askProposal,
    needs: spec.needs,
    undo: spec.undo?.label(askProposal) ?? null,
    // When it was made: a card is approved while it is fresh (contracts askCardLapsed), never days on.
    made_at: new Date().toISOString(),
  };
  return {
    proposal,
    isError: false,
    ...(noted ? { noted } : {}),
    result: JSON.stringify({
      proposed: true,
      id: proposal.id,
      card: proposal.title,
      summary: proposal.summary,
      ...holdsSaid(proposal),
      ...(noted ? { also_say: `${noted}: say so in the answer beside the card` } : {}),
      note:
        askProposal.kind === "fix"
          ? FIX_CARD_WORDS.note
          : "Nothing has happened yet. This is a card the person can approve, edit or dismiss. Say what you proposed; never say it is done.",
    }),
  };
};

/** The cards one call made, in order, as the loop keeps them: a plan's several (proposeMany), else its one, else none. */
export const cardsOf = (proposalOutcome: ProposalOutcome): AskProposal[] =>
  proposalOutcome.proposals ?? (proposalOutcome.proposal ? [proposalOutcome.proposal] : []);

/**
 * Several cards from one call, in order, each made by `propose` (a plan's steps, act/plan.ts): the loop keeps every one
 * (loop.ts, cardsOf), and the model is told what `said` says of them, the plan's `words`, and that nothing has happened
 * yet, and how a plan's cards are pressed. The words ride with the outcome too, for the round that answers with them.
 */
export const proposeMany = (
  proposals: AskProposal[],
  fields: Record<string, unknown>,
  words: string | null,
  lead: PlanLead | null,
): ProposalOutcome => ({
  proposal: null,
  proposals,
  isError: false,
  ...(words ? { words } : {}),
  ...(lead ? { lead } : {}),
  result: JSON.stringify({
    proposed: true,
    ...fields,
    ...(lead ? { headline: lead.headline } : {}),
    ...(words ? { words } : {}),
    note: "Nothing has happened yet. These are cards the person approves, edits or dismisses; a plan's steps that send nothing are one press, and each send its own after them. Say what you proposed; never say any of it is done.",
  }),
});
