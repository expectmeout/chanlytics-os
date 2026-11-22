/**
 * AI's card to take a piece down (00692; the content loop PRD's 12.1 act/take_down). Apart from the take-down's own
 * words and rules (take-down.ts): the frame holds every card's spec, and a page that draws no piece carries none of them.
 */
import { asText, type ProposalSpecAboveOperator } from "../../ask/proposals/spec";
import { contentRouteOf } from "../address";

/** AI's card to take a piece down (the PRD's 12.1 act/take_down): the same press as the sheet's, and its receipt. */
export const takeDownSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "take a post down",
  gate: "settings",
  commit: ({ payload }) => ({ route: "DELETE files/[id]/posts", params: { id: asText(payload.file_id) } }),
  receipt: () => "Asked. Each place says here when it's gone.",
  open: ({ payload }) => {
    const id = asText(payload.file_id);
    return id ? contentRouteOf({ list: "made", view: "all", open: id }) : null;
  },
};
