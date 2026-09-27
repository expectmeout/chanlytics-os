/** Reach out: the campaign email's words and rules, its timetable, and the hours and time zones the window keeps. */
export {
  whyFrom,
  campaignFooter,
  campaignFooterHtml,
  isCampaignEmail,
  unsubscribePageWords,
  WHY_FROM_MAPS,
  MARKETING_LINE,
  UNSUBSCRIBE_PAGE_HEADER,
} from "./reach-out";
export type { UnsubscribeView, UnsubscribePageWords } from "./reach-out";
export { zoneOfRegion, US_STATE_ZONES } from "./us-zones";
export type { UsStateCode } from "./us-zones";
export { weekHoursOf, DEFAULT_WEEK } from "./lead-hours";
export type { WeekdayKey, OpenWindow, WeekHours } from "./lead-hours";
export {
  sendWindowsOf,
  timetable,
  SEND_WINDOW_MARGIN_MIN,
  SEND_DAY_FRAME,
  TIMETABLE_HORIZON_DAYS,
} from "./reach-out-timetable";
export type { TimetableSend, TimetableDomain, TimetableInput, Placed, TimetableResult } from "./reach-out-timetable";
export {
  outreachRefusalOf,
  isWaitRefusal,
  isReachOutRun,
  reachOutSlots,
  OUTREACH_WAIT_REFUSALS,
  REACH_OUT_MONTH_EMAILS,
} from "./reach-out-rules";
export type { OutreachLeadFacts, SlotLead } from "./reach-out-rules";
export {
  REACH_OUT_MODEL,
  OPENING_SCHEMA,
  READING_SCHEMA,
  openingSystemPrompt,
  openingUserContent,
  readingSystemPrompt,
  readingUserContent,
  parseOpening,
  parseReading,
  openingVerdict,
} from "./reach-out-opening";
export type { OpeningWorkspace, Reading, OpeningVerdict } from "./reach-out-opening";
export { REACH_OUT_CHECKS_PER_DAY } from "./reach-out-rules";
export type { SlotWorkspace } from "./reach-out-rules";
export {
  REACH_OUT_SLOTS,
  REACH_OUT_SLOT_WORDS,
  REACH_OUT_SUBJECT_MAX,
  REACH_OUT_BODY_MAX,
  REACH_OUT_WORDS_MAX,
  OPENING_WORDS_MAX,
  OPENING_CHARS_MAX,
  ANGLE_WORDS_MAX,
  REACH_OUT_STEPS_MAX,
  REACH_OUT_NAME_MAX,
  SIGNED_BY_MAX,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_AFTER_DAYS,
  slotKey,
  isReachOutSlot,
  slotsNamed,
  replaceSlots,
  slotCount,
  wordsNeedOpening,
  wordCount,
  emailWordCount,
  linksIn,
  linkCount,
  shoutingLine,
  validateReachOutWords,
  wordsIssueWords,
  ReachOutStepSchema,
  ReachOutChainSchema,
  validateReachOutChain,
  chainIssueWords,
  OPENING_FACT_KEYS,
  isOpeningFactKey,
  factValue,
  OPENING_PROBLEMS,
  isOpeningProblem,
  checkOpening,
  openingProblemWords,
  CHAIN_MIN_LISTINGS,
  chainOf,
  customerDomainOf,
  REACH_OUT_HOLDS,
  isReachOutHold,
  holdWords,
  holdDoors,
  HOLD_DOOR_WORDS,
} from "./reach-out-words";
export type {
  ReachOutSlot,
  WordsProblem,
  WordsIssue,
  ReachOutChainInput,
  ChainProblem,
  ChainIssue,
  OpeningFactKey,
  OpeningRecord,
  WrittenOpening,
  OpeningProblem,
  ReachOutHold,
  HoldDoor,
} from "./reach-out-words";
export {
  REACH_OUT_PREVIEW_INDEX_MAX,
  ReachOutPreviewSchema,
  REACH_OUT_DECISIONS,
  ReachOutDecideSchema,
} from "./reach-out-dtos";
export type {
  ReachOutStepDto,
  ReachOutNextFacts,
  ReachOutChainDto,
  ReachOutStepCounts,
  ReachOutRunLine,
  ReachOutChainReportDto,
  ReachOutReachDto,
  ReachOutPreviewDto,
  ReachOutStartDto,
  ReachOutSavedDto,
  ReachOutPreviewInput,
  ReachOutDecision,
  ReachOutHeldSend,
  ReachOutRunDto,
} from "./reach-out-dtos";
export {
  REACH_OUT_SHEET_WORDS,
  REACH_OUT_REFUSALS,
  isReachOutRefusal,
  reachLineOf,
  paceWords,
  sheetFootWords,
  stepLabel,
  stepWhenWords,
  startWords,
  nextRunWords,
  approvalWordsOf,
  chainHintOf,
  chainReportWordsOf,
  emailTemplateWords,
} from "./reach-out-sheet";
