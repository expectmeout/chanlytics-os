/**
 * Ask's follow-up card (the operator, 15 Oct 2026, D3): a follow-up kept, or follow-ups cleared once Ask came back to
 * them, through the door a member's own views are saved by (PUT views/:page, `ask`), which replaces the page's view whole.
 * So the builder writes the whole list the view will hold (its follow-ups, contracts ask/follow-ups.ts), and the undo
 * puts back the list it held. It changes nothing of the business: a plan approves it with its other silent steps.
 */
import { ASK_VIEW_PAGE } from "./follow-ups";
import { PROPOSAL_WORDS, asText, refuseWith, type ProposalSpec } from "./spec";

const listIn = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);

export const followUpSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const list = listIn(pl.follow_ups);
    return list
      ? { route: "PUT views/[page]", params: { page: ASK_VIEW_PAGE }, body: { view: { follow_ups: list } } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) =>
    pl.cleared === true ? "Done with it" : `I'll come back to it: ${asText(pl.said) || "when it happens"}`,
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    record: ({ payload: pl }) => {
      const was = listIn(pl.previous);
      return was ? { follow_ups: was } : null;
    },
    call: (u) => ({
      route: "PUT views/[page]",
      params: { page: ASK_VIEW_PAGE },
      body: { view: { follow_ups: listIn(u.follow_ups) ?? [] } },
    }),
    receipt: () => "As it was",
  },
  open: () => null,
};
