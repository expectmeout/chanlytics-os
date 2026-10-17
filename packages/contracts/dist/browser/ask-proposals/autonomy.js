import { FACT_SUGGEST_WORDS } from "../notes/fact-words.js";
import { asText } from "./spec.js";
export const factSuggestionSpec = {
  needs: "partner",
  doing: "keep a note for the receptionist",
  gate: "settings",
  commit: (p) => ({
    route: "POST fact-suggestions/[id]",
    params: { id: asText(p.payload.suggestion_id) },
    body: { keep: p.payload.keep === true }
  }),
  receipt: (p) => p.payload.keep === true ? FACT_SUGGEST_WORDS.kept(asText(p.payload.title)) : FACT_SUGGEST_WORDS.dismissed,
  open: () => "admin/autonomy"
};
