/** The cards Ask proposes, one spec per kind (Ask Rewired, Phase 3, D6): what proposals.ts says, and each family's spec. */
export {
  PROPOSAL_SPECS,
  VERB_SPECS,
  proposalSpec,
  verbSpec,
  proposalBelowNeeds,
  PROPOSAL_GATE,
  askUndoOpen,
} from "./proposals";
export type { ProposalKindAboveOperator, VerbKind } from "./proposals";
export { answerSaid, manySaid } from "./people-verbs";
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
