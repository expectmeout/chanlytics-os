/**
 * A review's card (the operator, 15 Oct 2026): the business answers a Google review in words the member approves, through
 * the door Reports' Reviews lens presses (POST google/reviews/:id/reply), which keeps one reply per review and posts it on
 * Google. Public once it lands, so its card is approved on its own and never in a plan's silent press.
 */
import { PROPOSAL_WORDS, asText, idIn, refuseWith, type ProposalSpec } from "./spec";

export const reviewReplySpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) =>
    idIn(pl, "review_id") && asText(pl.comment).trim()
      ? {
          route: "POST google/reviews/[id]/reply",
          params: { id: asText(pl.review_id) },
          body: { comment: asText(pl.comment).trim() },
        }
      : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) => `Replied to ${asText(pl.who) || "the review"} on Google`,
  open: () => "reports/reviews",
};
