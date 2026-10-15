/**
 * The cards Ask proposes, one spec per kind (Ask Rewired, Phase 3, D6): the whole table (proposals.ts), the verbs the
 * pages press and the readings of a spec (page-specs.ts), and each family's spec. Ask's own kinds come by their own
 * entry (`@chanlytics/contracts/ask-only`).
 */
export { PROPOSAL_SPECS, ASK_SENDS, proposalBelowNeeds } from "./proposals";
export { PROPOSAL_GATE, addProposalSpecs, askUndoOpen, cardOpenRoute, proposalSpec, verbSpec } from "./page-specs";
export type { ProposalKindAboveOperator } from "./proposals";
export type { VerbKind } from "./page-specs";
export { ASK_THREAD_ROUTES } from "./inbox";
export {
  RUN_VERBS,
  PLAYBOOK_CARD_REFUSALS,
  PLAYBOOK_CARD_WORDS,
  MESSAGE_WORDS,
  proposalChannelsWords,
  stepOfferWords,
  twinRunsWords,
} from "./campaigns";
export { answerSaidOf } from "./people-verbs";
export {
  ASK_VIEW_PAGE,
  ASK_FOLLOW_UPS_MAX,
  FOLLOW_UP_SAID_MAX,
  FOLLOW_UP_PROMPT_MAX,
  FOLLOW_UP_WAKES,
  followUpsOf,
  followUpDue,
} from "./follow-ups";
export type { AskFollowUp, FollowUpWake, FollowUpWorld } from "./follow-ups";
export { ASK_GUIDE_PAGES, ASK_PAGE_ONLY_VERBS } from "./guide";
export type { GuidePage } from "./guide";
export { PERSON_DETAIL_WORDS } from "./person";
export { PROPOSAL_WORDS } from "./spec";
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
