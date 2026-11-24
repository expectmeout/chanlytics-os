/**
 * Content's verbs: the seven checks a post is held to, at the three moments (the content loop PRD's 6.1, 6.2), asked
 * through `evaluate`, which every moment calls with the facts it read. Every public name, named.
 */
export { weekApprovalOf } from "./plan/approve";
export type { WeekApproval } from "./plan/approve";
export type { FootageFact, GoalFact } from "./plan/candidates";
export { contentPatternsOf } from "./plan/patterns";
export { planWeek } from "./plan/week";
export type { DraftedSlot, WeekAsked, WeekDrafted } from "./plan/week";
export { wordsNeedAbout } from "./policy/checks";
export type { ClaimsAsked, PolicyRefusal } from "./policy/checks";
export { claimProblemOf, saidWithClaims } from "./policy/claims";
export type { ClaimProblem } from "./policy/claims";
export { evaluate, verdictWords } from "./policy/evaluate";
export type { PolicyFacts, PolicyVerdict } from "./policy/evaluate";
