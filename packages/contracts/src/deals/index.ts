/** A deal is a record (decisions 0004, 0008): the deal, its sheet, the Pipeline, and the pace of yeses. */
export { amountTotalsWords, amountWords, parseAmount } from "./deal-amount";
export type { AmountFact } from "./deal-amount";
export { DealMoveBody } from "./deal-body";
export type { DealMove } from "./deal-body";
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
} from "./deal-consultations";
export type { DealStandingStage } from "./deal-consultations";
export { toDealReportVM } from "./deal-report";
export type { DealOutcomeVM, DealReportDto, DealReportLineId, DealReportVM } from "./deal-report";
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
} from "./deal-vm";
export type { DealColumns, DealDto, DealFacts, DealVM, OpenDealDto } from "./deal-vm";
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
} from "./deal-waits";
export type { DealPaceDto, DealPaceVM } from "./deal-waits";
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
} from "./deal-words";
export type { DealActId, DealClearable, DealLostReason, DealPer, DealSource, DealStage } from "./deal-words";
export { dealPaceFrom, medianWait, SAME_SITTING_MS, yesWaits } from "./pace";
export type { DealWaitRow } from "./pace";
export { pipelineOf, pipelineWorth } from "./pipeline/pipeline";
export {
  PIPELINE_BOARD_CAP,
  PIPELINE_PASS_MAX,
  PIPELINE_PHONE_SORTS,
  PIPELINE_SORTS,
  pipelineBoardMore,
  pipelineCsv,
  pipelineMove,
  pipelinePassDone,
  pipelinePassMany,
  pipelineSorted,
} from "./pipeline/pipeline-board";
export type { PipelineMove, PipelinePassManyVM, PipelineSort } from "./pipeline/pipeline-board";
export { pipelinePeekOf, pipelineSheetOf } from "./pipeline/pipeline-peek";
export type { PipelinePeekFact, PipelinePeekVM, PipelineSheetAct, PipelineSheetVM } from "./pipeline/pipeline-peek";
export {
  isPipelineView,
  parsePipelineRoute,
  PIPELINE_RAIL_SERVICES,
  pipelineRail,
  pipelineRoute,
  pipelineViewLabel,
} from "./pipeline/pipeline-views";
export type { PipelineRailRow, PipelineRailSection, PipelineView } from "./pipeline/pipeline-views";
export { PIPELINE_GROUPS, pipelinePersonOf, pipelineRowId, pipelineRowNow } from "./pipeline/pipeline-vm";
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
} from "./pipeline/pipeline-vm";
export { PIPELINE_WORDS } from "./pipeline/pipeline-words";
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
export type { CalendarPeekDealVM, DealAct, DealPerson, DealSend, DealSheetMode } from "./sheet/deal-acts";
export { DEAL_CARD_WORDS, dealCardsOf, dealStepOf } from "./sheet/deal-card";
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
export { dealSheetBody, dealSheetRefusal } from "./sheet/deal-sheet-body";
export type { DealSheetBody, DealSheetOutcome, DealSheetProblem } from "./sheet/deal-sheet-body";
