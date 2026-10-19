import { PROPOSAL_WORDS, asText, idIn, rec, refuseWith } from "./spec.js";
export const reviewReplySpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => idIn(pl, "review_id") && asText(pl.comment).trim() ? {
    route: "POST google/reviews/[id]/reply",
    params: { id: asText(pl.review_id) },
    body: { comment: asText(pl.comment).trim() }
  } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) => `Replied to ${asText(pl.who) || "the review"} on Google`,
  open: () => "reports/reviews"
};
export const reviewReplyStopSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => idIn(pl, "review_id") ? { route: "POST google/reviews/[id]/stop", params: { id: asText(pl.review_id) }, body: {} } : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: (_p, data) => rec(data).held === true ? "Stopped. The reply waits for your OK, under the review." : "Nothing to stop: that reply had already gone, or was stopped.",
  open: () => "reports/reviews"
};
