import { ASK_STYLE_PAGE, ASK_VIEW_PAGE } from "./follow-ups.js";
import { PROPOSAL_WORDS, asText, refuseWith } from "./spec.js";
const listIn = (v) => Array.isArray(v) ? v : null;
export const followUpSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const list = listIn(pl.follow_ups);
    return list ? { route: "PUT views/[page]", params: { page: ASK_VIEW_PAGE }, body: { view: { follow_ups: list } } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => pl.cleared === true ? "Done with it" : `I'll come back to it: ${asText(pl.said) || "when it happens"}`,
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
      body: { view: { follow_ups: listIn(u.follow_ups) ?? [] } }
    }),
    receipt: () => "As it was"
  },
  open: () => null
};
export const answerStyleSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "PUT views/[page]",
    params: { page: ASK_STYLE_PAGE },
    body: { view: { words: asText(pl.words) } }
  }),
  receipt: ({ payload: pl }) => asText(pl.words) ? "Kept for your answers" : "Cleared",
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    record: ({ payload: pl }) => ({ words: asText(pl.previous) }),
    call: (u) => ({
      route: "PUT views/[page]",
      params: { page: ASK_STYLE_PAGE },
      body: { view: { words: asText(u.words) } }
    }),
    receipt: () => "As it was"
  },
  open: () => "admin/profile"
};
