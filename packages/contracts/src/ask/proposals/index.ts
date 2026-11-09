/**
 * The cards Ask proposes, one spec per kind (Ask Rewired, Phase 3, D6): the whole table (proposals.ts), the verbs the
 * pages press and the readings of a spec (page-specs.ts), and each family's spec. Ask's own kinds come by their own
 * entry (`@chanlytics/contracts/ask-only`).
 */
export {
  FIX_CARD_WORDS,
  MESSAGE_WORDS,
  PLAYBOOK_CARD_REFUSALS,
  PLAYBOOK_CARD_WORDS,
  proposalChannelsWords,
  RUN_VERBS,
  stepOfferWords,
  twinRunsWords,
} from "./campaigns";
export {
  answerStyleOf,
  ASK_FOLLOW_UPS_MAX,
  ASK_STYLE_MAX,
  ASK_STYLE_PAGE,
  ASK_VIEW_PAGE,
  FOLLOW_UP_PROMPT_MAX,
  FOLLOW_UP_SAID_MAX,
  FOLLOW_UP_WAKES,
  followUpDue,
  followUpsOf,
} from "./follow-ups";
export type { AskFollowUp, FollowUpWake, FollowUpWorld } from "./follow-ups";
export { ASK_THREAD_ROUTES } from "./inbox";
export { addProposalSpecs, askUndoOpen, cardOpenRoute, PROPOSAL_GATE, proposalSpec, verbSpec } from "./page-specs";
export { PAGE_SPECS } from "./page-specs";
export type { VerbKind } from "./page-specs";
export { answerSaidOf } from "./people-verbs";
export { PERSON_DETAIL_WORDS } from "./person";
export { PROPOSAL_SPECS, proposalBelowNeeds } from "./proposals";
export type { ProposalKindAboveOperator } from "./proposals";
export {
  ASK_ALONE_MANY_MAX,
  ASK_CARD_SHAPES,
  ASK_KIND_TRAITS,
  ASK_PRESS_WORDS,
  ASK_PUBLIC_HOLD_MS,
  ASK_REACHES,
  askCardHasWords,
  askPressCount,
  askPressOf,
  askTraitsOf,
} from "./shapes";
export type { AskAlone, AskCardShape, AskKindTraits, AskPressWord, AskReach } from "./shapes";
export { CARD_MOVED_WORDS, errorMessageOf, failureDoorOf, PROPOSAL_WORDS } from "./spec";
export { ASK_SENDS } from "./spec";
export type {
  ProposalCall,
  ProposalEvent,
  ProposalGate,
  ProposalNeeds,
  ProposalRefusal,
  ProposalSpec,
  ProposalSpecAboveOperator,
  ProposalTab,
  ProposalThen,
  ProposalUndo,
  VerbCard,
} from "./spec";
