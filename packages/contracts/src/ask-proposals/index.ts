/** The cards Ask proposes, one spec per kind (Ask Rewired, Phase 3, D6): what proposals.ts says, and each family's spec. */
export {
  PROPOSAL_SPECS,
  ASK_SENDS,
  proposalSpec,
  verbSpec,
  proposalBelowNeeds,
  PROPOSAL_GATE,
  askUndoOpen,
} from "./proposals";
export type { ProposalKindAboveOperator, VerbKind } from "./proposals";
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
