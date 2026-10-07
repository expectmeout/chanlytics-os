export { answerOf, refusalOf, estimateForRound } from "./lead-answers";
export {
  searchRow,
  answerPlanOf,
  leadScope,
  leadSearchScope,
  waitingQuestionOf,
  toSearchDto,
  renameSearch,
  removeSearch,
  undoSearch,
  leadOfPerson,
} from "./lead-searches";
export type { SearchViewRow } from "./lead-searches";
export { planFacts } from "./lead-plan-facts";
export { setStage, bulkStage, checkAgain, eraseLead } from "./lead-work";
export { draftFor } from "./lead-draft";
export { suggestionsFor, setBusinessLine } from "./lead-suggestions";
export { exportLeads } from "./lead-export";

/**
 * The lead finder's routes share these: the door's answer read once, its
 * refusals said in sentences, the estimate the route computes for the door to
 * store (00140's create and more take p_estimate_usd), and the search's latest
 * round from lead_searches_view.
 */
