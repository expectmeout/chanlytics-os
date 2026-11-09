/** A deal is a record (decisions 0004, 0008): the deal, its sheet, the Pipeline, and the pace of yeses. */
export { amountTotalsWords, amountWords, parseAmount } from "./amount";
export type { AmountFact } from "./amount";
export { DealMoveBody } from "./body";
export type { DealMove } from "./body";
export {
  CONSULT_FOLLOW_DAYS,
  consultationHappened,
  consultationHeld,
  consultationsWithoutProposal,
  consultServiceOf,
  consultsHeldWords,
  dealStageOf,
  isConsultationTitle,
  noProposalSince,
} from "./consultations";
export type { DealStandingStage } from "./consultations";
export { dealPaceFrom, medianWait, SAME_SITTING_MS, yesWaits } from "./pace";
export type { DealWaitRow } from "./pace";
export { pipelineOf, pipelineWorth } from "./pipeline/pipeline";
export {
  isPipelineView,
  parsePipelineRoute,
  PIPELINE_RAIL_SERVICES,
  pipelineRail,
  pipelineRoute,
  pipelineViewLabel,
} from "./pipeline/views";
export type { PipelineRailRow, PipelineRailSection, PipelineView } from "./pipeline/views";
export { PIPELINE_GROUPS, pipelinePersonOf, pipelineRowId, pipelineRowNow } from "./pipeline/vm";
export type {
  PipelineChip,
  PipelineFilter,
  PipelineGroupKey,
  PipelineGroupVM,
  PipelineLinePart,
  PipelineNextVM,
  PipelineRowVM,
  PipelineSource,
  PipelineStep,
  PipelineVM,
} from "./pipeline/vm";
export { PIPELINE_WORDS } from "./pipeline/words";
export { GROUP_WORDS } from "./pipeline/words";
export { toDealReportVM } from "./report";
export type { DealOutcomeVM, DealReportDto, DealReportLineId, DealReportVM } from "./report";
export {
  calendarPeekDeal,
  DEAL_ACT_HINTS,
  DEAL_SEND_WHY,
  DEAL_SHEET_MODES,
  dealMenuActs,
  dealNextAct,
  dealSendOf,
  isDealSheetMode,
  proposalFollowUp,
} from "./sheet/deal-acts";
export { act, consultedService } from "./sheet/deal-acts";
export type { CalendarPeekDealVM, DealAct, DealPerson, DealSend, DealSheetMode } from "./sheet/deal-acts";
export { DEAL_CARD_WORDS, dealCardsOf, dealStepOf } from "./sheet/deal-card";
export { consultationStepOf } from "./sheet/deal-card";
export type { DealCardStepVM, DealCardVM, DealQuietVM, DealStepVM, PersonDealsVM } from "./sheet/deal-card";
export {
  DEAL_NOTE_MAX,
  DEAL_SHEET_WORDS,
  dealSheetDirty,
  dealSheetFor,
  dealSheetMerge,
  dealSheetMessage,
} from "./sheet/deal-sheet";
export type { DealSheetDraft, DealSheetField, DealSheetVM } from "./sheet/deal-sheet";
export {
  dealFactsOf,
  dealIsOpen,
  dealOf,
  dealSentence,
  dealSinceMs,
  openDealsFromJson,
  openDealsOf,
  pickCurrentDeal,
  proposalLinkOf,
  toDealVM,
  wholeDaysSince,
} from "./vm";
export type { DealColumns, DealDto, DealFacts, DealVM, OpenDealDto } from "./vm";
export {
  dealPaceOf,
  dealPaceWords,
  heardSinceProposal,
  isYes,
  PACE_AFTER_YESES,
  PACE_WINDOW_DAYS,
  proposalsWaiting,
  waitAfterDays,
  WAITING_AFTER_DAYS,
  waitingOnProposal,
  yesWaitWords,
} from "./waits";
export { eachOpenProposal } from "./waits";
export type { DealPaceDto, DealPaceVM } from "./waits";
export {
  DEAL_ACT_WORDS,
  DEAL_CLEARABLE,
  DEAL_LINE_NONE,
  DEAL_LOST_REASON_WORDS,
  DEAL_LOST_REASONS,
  DEAL_PER_WORDS,
  DEAL_PERS,
  DEAL_REFUSALS,
  DEAL_SOURCES,
  DEAL_STAGE_WORDS,
  DEAL_STAGES,
  isDealLostReason,
  isDealPer,
  isDealStage,
} from "./words";
export type { DealActId, DealClearable, DealLostReason, DealPer, DealSource, DealStage } from "./words";
