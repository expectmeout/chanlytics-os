/**
 * A review's card (the operator, 15 Oct 2026): the business answers a Google review in words the member approves, through
 * the door Reports' Reviews lens presses (POST google/reviews/:id/reply), which keeps one reply per review and posts it on
 * Google. Public once it lands, so its card is approved on its own and never in a plan's silent press.
 */
import { PROPOSAL_WORDS, asText, idIn, rec, refuseWith, type ProposalSpec } from "./spec";

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

/**
 * A reply the receptionist holds under a review, stopped before the hourly sync posts it (decision 0064, step 6): the Stop
 * Reports' Reviews lens draws under the review (POST google/reviews/:id/stop). It then waits for an OK with its words kept
 * for the composer, so nothing is posted and nothing is undone: the reply is sent, or not, from there. One with no time
 * left to clear (it went, or was stopped already) changes nothing, and says so.
 */
export const reviewReplyStopSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) =>
    idIn(pl, "review_id")
      ? { route: "POST google/reviews/[id]/stop", params: { id: asText(pl.review_id) }, body: {} }
      : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: (_p, data) =>
    rec(data).held === true
      ? "Stopped. The reply waits for your OK, under the review."
      : "Nothing to stop: that reply had already gone, or was stopped.",
  open: () => "reports/reviews",
};
