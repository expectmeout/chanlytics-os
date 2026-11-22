/**
 * Content's verbs: the seven checks a post is held to, at the three moments (the content loop PRD's 6.1, 6.2). Every
 * public name, named.
 */
export {
  automationAllows,
  budgetAllows,
  datedPhraseIn,
  evaluateClaimPolicy,
  mayAct,
  placeAllows,
  reasonStands,
  rightsFor,
} from "./policy/checks";
export type { PlaceAsked, PolicyRefusal, ReasonAsked } from "./policy/checks";
export { evaluate, verdictWords } from "./policy/evaluate";
export type { PolicyFacts, PolicyVerdict } from "./policy/evaluate";
