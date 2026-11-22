/**
 * Content's verbs: the seven checks a post is held to, at the three moments (the content loop PRD's 6.1, 6.2), asked
 * through `evaluate`, which every moment calls with the facts it read. Every public name, named.
 */
export { wordsNeedAbout } from "./policy/checks";
export type { PolicyRefusal } from "./policy/checks";
export { evaluate, verdictWords } from "./policy/evaluate";
export type { PolicyFacts, PolicyVerdict } from "./policy/evaluate";
