/**
 * The Autonomy pane's own verb (decision 0063): a note suggested from an owner's correction, kept or dismissed. Apart from
 * the workspace's cards (workspace.ts), which only Ask commits, because every page's route loads the verbs a page presses
 * (page-specs.ts) and this one's words are all it needs.
 */
import { FACT_SUGGEST_WORDS } from "../notes/fact-words";
import { asText, type ProposalSpecAboveOperator } from "./spec";

/**
 * Keep adds the note to what the receptionist reads through the settings' own write, Dismiss sets it aside (POST
 * fact-suggestions/:id). A change to the settings, so the settings' rung. Nothing undoes a Keep here: the note is taken
 * away in Settings › Business, as any other.
 */
export const factSuggestionSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "keep a note for the receptionist",
  gate: "settings",
  commit: (p) => ({
    route: "POST fact-suggestions/[id]",
    params: { id: asText(p.payload.suggestion_id) },
    body: { keep: p.payload.keep === true },
  }),
  receipt: (p) =>
    p.payload.keep === true ? FACT_SUGGEST_WORDS.kept(asText(p.payload.title)) : FACT_SUGGEST_WORDS.dismissed,
  open: () => "admin/autonomy",
};
