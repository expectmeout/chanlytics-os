/** A deal is a record (decisions 0004, 0008): the deal, its sheet, the Pipeline, and the pace of yeses. */
export {
  isDealStage,
  isDealLostReason,
  isDealPer,
  DEAL_STAGES,
  DEAL_PERS,
  DEAL_SOURCES,
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  DEAL_STAGE_WORDS,
  DEAL_PER_WORDS,
  DEAL_LINE_NONE,
  DEAL_CLEARABLE,
  DEAL_ACT_WORDS,
  DEAL_REFUSALS,
} from "./deal-words";
export type { DealStage, DealPer, DealSource, DealLostReason, DealClearable, DealActId } from "./deal-words";
export {
  isSellsBy,
  dealsAreOn,
  bookingLinkOptional,
  sellsByVM,
  sellsBySaved,
  SELLS_BY,
  SELLS_BY_QUESTION,
  SELLS_BY_WORDS,
  SELLS_BY_REFUSAL,
  BOOKING_LINK_NEEDED,
  SELLS_BY_FIRST,
  CONSULT_FIRST_DEAL_HINT,
} from "./sells-by";
export type { SellsBy, SellsByVM } from "./sells-by";
export { amountWords, parseAmount, amountTotalsWords } from "./deal-amount";
export type { AmountFact } from "./deal-amount";
export {
  dealFactsOf,
  pickCurrentDeal,
  dealIsOpen,
  proposalLinkOf,
  wholeDaysSince,
  dealSinceMs,
  toDealVM,
  dealOf,
  dealSentence,
} from "./deal-vm";
export type { DealColumns, DealDto, DealFacts, DealVM } from "./deal-vm";
export {
  heardSinceProposal,
  isYes,
  waitAfterDays,
  yesWaitWords,
  dealPaceWords,
  dealPaceOf,
  waitingOnProposal,
  proposalsWaiting,
  WAITING_AFTER_DAYS,
  PACE_AFTER_YESES,
  PACE_WINDOW_DAYS,
} from "./deal-waits";
export type { DealPaceDto, DealPaceVM } from "./deal-waits";
export {
  consultServiceOf,
  isConsultationTitle,
  noProposalSince,
  consultationHeld,
  dealStageOf,
  consultationsWithoutProposal,
  consultsHeldWords,
  CONSULT_FOLLOW_DAYS,
} from "./deal-consultations";
export type { DealStandingStage } from "./deal-consultations";
export { toDealReportVM } from "./deal-report";
export type { DealReportDto, DealOutcomeVM, DealReportLineId, DealReportVM } from "./deal-report";
export { yesWaits, medianWait, dealPaceFrom, SAME_SITTING_MS } from "./pace";
export type { DealWaitRow } from "./pace";
export {
  isDealSheetMode,
  dealSendOf,
  proposalFollowUp,
  dealNextAct,
  dealMenuActs,
  calendarPeekDeal,
  DEAL_SHEET_MODES,
  DEAL_SEND_WHY,
  DEAL_ACT_HINTS,
} from "./sheet/deal-acts";
export type { DealSheetMode, DealPerson, DealSend, DealAct, CalendarPeekDealVM } from "./sheet/deal-acts";
export { dealStepOf, dealCardsOf, DEAL_CARD_WORDS } from "./sheet/deal-card";
export type { DealStepVM, DealCardVM, DealCardStepVM, DealQuietVM, PersonDealsVM } from "./sheet/deal-card";
export {
  dealSheetFor,
  dealSheetMessage,
  dealSheetDirty,
  dealSheetMerge,
  DEAL_SHEET_WORDS,
  DEAL_NOTE_MAX,
} from "./sheet/deal-sheet";
export type { DealSheetField, DealSheetDraft, DealSheetVM } from "./sheet/deal-sheet";
export { dealSheetBody, dealSheetRefusal } from "./sheet/deal-sheet-body";
export type { DealSheetBody, DealSheetProblem, DealSheetOutcome } from "./sheet/deal-sheet-body";
export { PIPELINE_GROUPS } from "./pipeline/pipeline-vm";
export type {
  PipelineGroupKey,
  PipelineSource,
  PipelineChip,
  PipelineRowVM,
  PipelineNextVM,
  PipelineStep,
  PipelineGroupVM,
  PipelineLinePart,
  PipelineVM,
} from "./pipeline/pipeline-vm";
export { PIPELINE_WORDS } from "./pipeline/pipeline-words";
export { pipelineOf } from "./pipeline/pipeline";
export {
  isPipelineView,
  pipelineViewLabel,
  pipelineRoute,
  parsePipelineRoute,
  pipelineRail,
  PIPELINE_RAIL_SERVICES,
} from "./pipeline/pipeline-views";
export type { PipelineView, PipelineRailRow, PipelineRailSection } from "./pipeline/pipeline-views";
export { pipelinePeekOf, pipelinePeekDetail } from "./pipeline/pipeline-peek";
export type {
  PipelinePeekFact,
  PipelinePeekVM,
  PipelinePeekReachVM,
  PipelinePeekDetailVM,
} from "./pipeline/pipeline-peek";
export {
  pipelineMove,
  pipelineSorted,
  pipelinePassMany,
  pipelinePassDone,
  pipelineBoardMore,
  PIPELINE_SORTS,
  PIPELINE_PASS_MAX,
  PIPELINE_BOARD_CAP,
} from "./pipeline/pipeline-board";
export type { PipelineMove, PipelineSort, PipelinePassManyVM } from "./pipeline/pipeline-board";
