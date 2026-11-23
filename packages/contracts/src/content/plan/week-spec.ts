/**
 * AI's cards for a week of posts (00702; the content loop PRD's 12.1 act/plan and act/claims, 12.2 planWeekSpec and
 * claimSpec). Apart from the Week's own words and rules: the frame holds every card's spec, and a page that draws no week
 * carries none of them. Each card does one thing, which its payload's `act` names, through the same doors the Week's and
 * Settings › Content's presses use.
 */
import { asText, type ProposalSpecAboveOperator } from "../../ask/proposals/spec";
import { CONTENT_WEEK_ROUTE } from "../address";

/** AI's card for the week (PRD 12.1 act/plan): one press, through the Week's own door for what it does. */
export const planWeekSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "change this week's posts",
  gate: "settings",
  commit: ({ payload }) => {
    const act = asText(payload.act);
    if (act === "approve")
      return {
        route: "POST content/plan/approve",
        body: { plan_id: asText(payload.plan_id), week_of: asText(payload.week_of) },
      };
    if (act === "slot")
      return { route: "POST content/plan/slots", body: { slot_id: asText(payload.slot_id), change: payload.change } };
    if (act === "aims") return { route: "PUT content/aims", body: payload.aims };
    return { route: "POST content/plan", body: payload.week_of ? { week_of: asText(payload.week_of) } : {} };
  },
  receipt: ({ payload }) => {
    const act = asText(payload.act);
    if (act === "approve") return "Approved. Each goes up at its time.";
    if (act === "slot") return "Done. The Week says it.";
    if (act === "aims") return "Kept. The next week is planned with it.";
    return "AI is making the week. It's ready in a few minutes.";
  },
  open: () => CONTENT_WEEK_ROUTE,
};

/** AI's card for a claim (PRD 12.1 act/claims): an offer, a price, a guarantee or a fact the owner states, kept or withdrawn. */
export const claimSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "keep what your posts may say",
  gate: "settings",
  commit: ({ payload }) =>
    asText(payload.act) === "withdraw"
      ? { route: "DELETE content/claims", body: { claim_id: asText(payload.claim_id) } }
      : { route: "POST content/claims", body: payload.claim },
  receipt: ({ payload }) =>
    asText(payload.act) === "withdraw"
      ? "Withdrawn. A post that says it waits for you."
      : "Kept. Posts may say it now.",
  open: () => CONTENT_WEEK_ROUTE,
};
