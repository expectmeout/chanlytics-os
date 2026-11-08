/** Reach out: the campaign email's words and rules, its timetable, and the hours and time zones the window keeps. */
export {
  heldNoticeWords,
  REACH_OUT_RUN_REREAD_MS,
  REACH_OUT_TO_SEND_LABELS,
  reachOutRunMoving,
  reachOutRunWordsOf,
  TO_SEND_ALL_WORDS,
  toSendRowOf,
  toSendSaidWords,
  toSendWordsOf,
  waitingRunsDoor,
} from "./approval";
export type { ToSendRowVM } from "./approval";
export {
  chainFirstSender,
  previewLinesOf,
  previewRefusedWords,
  REACH_OUT_FIRST_WORDS,
  REACH_OUT_GAP_FIRST,
  REACH_OUT_NEW_LIST_WORDS,
  REACH_OUT_PREVIEW_WORDS,
  REACH_OUT_SHEET_PARTS,
  reachOutAddHandStep,
  reachOutAddStep,
  reachOutAfterDayChoices,
  reachOutChainBodyOf,
  reachOutDefaultName,
  reachOutDoorOf,
  reachOutDraftIssues,
  reachOutDraftOf,
  reachOutDropStep,
  reachOutEditedWords,
  reachOutMayAddStep,
  reachOutMayPickMailbox,
  reachOutPreviewOf,
  reachOutSavedWords,
  reachOutSetHandWords,
  reachOutSheetPaceOf,
  reachOutSheetUnreadOf,
  reachOutVersionDraftOf,
  reachOutWhoWords,
} from "./draft";
export type { ReachOutDraft, ReachOutDraftIssues, ReachOutDraftStep } from "./draft";
export { REACH_OUT_DECISIONS, REACH_OUT_PREVIEW_INDEX_MAX, REACH_OUT_SAID_OUTCOMES } from "./dtos";
export type {
  ReachOutChainDto,
  ReachOutChainReportDto,
  ReachOutCheckLine,
  ReachOutDecideDto,
  ReachOutDecision,
  ReachOutDraftedSend,
  ReachOutHeldSend,
  ReachOutMailboxChoice,
  ReachOutMailboxFacts,
  ReachOutNextFacts,
  ReachOutOpeningDto,
  ReachOutPeopleCountsDto,
  ReachOutPreviewDto,
  ReachOutReachDto,
  ReachOutRunDto,
  ReachOutRunLine,
  ReachOutSaidDto,
  ReachOutSaidOutcome,
  ReachOutSavedDto,
  ReachOutStartDto,
  ReachOutStepCounts,
  ReachOutStepDto,
} from "./dtos";
export { REACH_OUT_CHECK_DOOR, REACH_OUT_PREVIEW_DOOR } from "./edge-doors";
export { HAND_KINDS, HAND_WORDS_MAX, handOf, handStepWords, personHandWords } from "./hand";
export type { HandKind, StepHand } from "./hand";
export { DEFAULT_WEEK, leadFactOf, leadOpeningOf, listingPeriodsOf, weekHoursOf } from "./lead-hours";
export type { FactListing, OpenWindow, WeekHours } from "./lead-hours";
export { reachOutStripOf, reachOutTimelineOf } from "./leads/lines";
export type {
  ReachOutChainStepDto,
  ReachOutFedBy,
  ReachOutLeadLineDto,
  ReachOutLeadsDto,
  ReachOutLeadTimelineDto,
  ReachOutLineReplyDto,
  ReachOutPersonVM,
  ReachOutSearchLinesDto,
  ReachOutStoryLine,
  ReachOutStripVM,
  ReachOutTimelineChainDto,
  ReachOutTimelineReadingDto,
  ReachOutTimelineSendDto,
  ReachOutTimelineVM,
} from "./leads/lines";
export {
  askedDayOf,
  REACH_OUT_ADD_WORDS,
  REACH_OUT_WHY_NOT,
  REACH_OUT_WHY_NOT_WORDS,
  reachOutAddWords,
  reachOutCameWords,
  reachOutLineOf,
  reachOutPersonOf,
  reachOutStandingOf,
  reachOutWhenOf,
} from "./leads/standing";
export type {
  ReachOutAddDto,
  ReachOutAddLeadDto,
  ReachOutChainPeopleDto,
  ReachOutSourceDto,
  ReachOutStandingVM,
  ReachOutWhyNot,
} from "./leads/standing";
export {
  OPENING_SCHEMA,
  OPENING_UNSTATED,
  openingAskedOf,
  openingSystemPrompt,
  openingUserContent,
  openingVerdict,
  parseOpening,
  parseReading,
  REACH_OUT_MODEL,
  READING_SCHEMA,
  readingSystemPrompt,
  readingUserContent,
} from "./opening";
export type { OpeningAsked, OpeningVerdict, OpeningWorkspace, Reading } from "./opening";
export { composeLinksOf, mailtoOf } from "./owner/compose";
export type { ComposeLinks } from "./owner/compose";
export { REACH_OUT_SAID_WORDS, REACH_OUT_STOP_WORDS, REACH_OUT_UNDO_WORDS } from "./owner/lead-doors";
export type { ReachOutStopDto } from "./owner/lead-doors";
export {
  CAMPAIGN_EMAIL_TAG,
  isCampaignEmail,
  UNSUBSCRIBE_PAGE_HEADER,
  unsubscribePageWords,
  WHY_FROM_MAPS,
  whyFrom,
} from "./reach-out";
export type { UnsubscribePageWords, UnsubscribeView } from "./reach-out";
export { REACH_OUT_REFUSAL_WORDS, reachOutPhoneProblem, reachOutSignatureProblem } from "./refusals";
export type { PhoneProblem, SignatureProblem } from "./refusals";
export {
  isReplyIntent,
  isUnread,
  OWNER_SAID_INTENTS,
  REACH_OUT_READS_PER_DAY,
  REACH_OUT_REPLY_DAYS,
  REPLY_INTENT_WORDS,
  REPLY_INTENTS,
  REPLY_UNREADS,
} from "./replies/intents";
export type { OwnerSaidIntent, ReplyIntent, ReplyReading, Unread } from "./replies/intents";
export { ownedDomainOf, readingPlan, replyNoticeWords, replyStepWords, UNREAD_READING } from "./replies/reading";
export type { ReadingPlan, ReplyClaim, ReplyContext, ReplyStep } from "./replies/reading";
export {
  awayUntilOf,
  notNowDayOf,
  parseReplyReading,
  REACH_OUT_AWAY_DAYS,
  REACH_OUT_AWAY_MAX_DAYS,
  REPLY_ANSWERED_MAX,
  REPLY_NOT_NOW_DAYS,
  REPLY_QUOTE_MAX,
  REPLY_READ_MAX_TOKENS,
  REPLY_REFER_TO_MAX,
  REPLY_REREAD_DAYS,
  REPLY_REREADS,
  REPLY_SCHEMA,
  REPLY_SUBJECT_MAX,
  REPLY_SUMMARY_WORDS,
  REPLY_WORDS_MAX,
  replyIntentQuestion,
  replySystemPrompt,
  replyTextOf,
  replyUserContent,
  rereadAt,
  stepDayFor,
} from "./replies/words";
export {
  DRAFT_NEEDS_MS,
  DRAFT_NOTICE_MAX,
  DRAFT_WHYS,
  draftExcerpt,
  draftRefusal,
  isDraftWhy,
  leadReplyNote,
  replyOfferSteer,
} from "./reply-draft";
export type { DraftWhy } from "./reply-draft";
export {
  isReplyUndoRefusal,
  REPLIES_PAGE,
  REPLY_UNDO_REFUSALS,
  replyChipOf,
  replyChipStateOf,
  replyFromLineOf,
  replyLeftAsOf,
  replyStripOf,
} from "./reply-words";
export type {
  ReachOutRepliesDto,
  ReachOutReplyDto,
  ReplyDoor,
  ReplyFrom,
  ReplyStrip,
  ReplyUndoRefusal,
} from "./reply-words";
export {
  chainOfMoment,
  coldEndingOf,
  coldSignedOff,
  draftRefusalOf,
  isReachOutRun,
  isWaitRefusal,
  OUTREACH_WAIT_REFUSALS,
  outreachRefusalOf,
  REACH_OUT_DRAFTS_OPEN_MAX,
  REACH_OUT_DRAFTS_PER_DAY,
  REACH_OUT_LANGUAGE,
  REACH_OUT_MONTH_EMAILS,
  REACH_OUT_SIGNS_WITH,
  reachOutEmailOf,
  reachOutExampleLead,
  reachOutExampleValues,
  reachOutRootOf,
} from "./rules";
export { REACH_OUT_CHECKS_AHEAD_PER_DAY, REACH_OUT_CHECKS_PER_DAY } from "./rules";
export type { ColdEnding, DraftLeadFacts, OutreachLeadFacts, ReachOutSignsWith, SlotLead } from "./rules";
export type { SlotWorkspace } from "./rules";
export { ReachOutChainSchema, ReachOutStepSchema } from "./schemas";
export {
  ReachOutCheckSchema,
  ReachOutDecideSchema,
  ReachOutPreviewSchema,
  ReachOutReplySaidSchema,
  ReachOutSaidSchema,
  ReachOutToldQuerySchema,
} from "./schemas";
export { ReachOutAddSchema, ReachOutRepliesQuerySchema } from "./schemas";
export type { ReachOutChainInput } from "./schemas";
export type { ReachOutReplySaidInput } from "./schemas";
export type { ReachOutPreviewInput } from "./schemas";
export type { ReachOutAddInput, ReachOutRepliesQuery } from "./schemas";
export { reachOutBackingOf, reachOutOfferOf, reachOutSignatureOf, reachOutSignedByOf, reachOutToneOf } from "./section";
export {
  REACH_OUT_SETTINGS_WORDS,
  reachOutRuleLines,
  REPLY_OFFER_WORDS,
  replyModeHint,
  tryCheckLine,
  writesBackRows,
} from "./settings";
export type { ReachOutSettingsDto, ReachOutSettingsMailbox, ReachOutSettingsSequence, WritesBackRow } from "./settings";
export {
  approvalWordsOf,
  chainHintOf,
  chainPaceOf,
  chainPathWords,
  chainReportWordsOf,
  EMAIL_TEMPLATE_LIST_WORDS,
  emailRowWrittenOf,
  emailTemplateRowsOf,
  emailTemplateWords,
  REACH_OUT_ROW_WORDS,
} from "./sheet/chain";
export {
  isReachOutRefusal,
  nextRunWords,
  ownerPaceWords,
  paceWords,
  REACH_OUT_REFUSALS,
  REACH_OUT_SHEET_WORDS,
  reachLineOf,
  sheetFootWords,
  startWords,
  stepLabel,
  stepLabelOf,
  stepWhenWords,
} from "./sheet/words";
export type { RunPartVM } from "./sheet/words";
export { SEND_DAY_FRAME, SEND_WINDOW_MARGIN_MIN, sendWindowsOf, timetable, TIMETABLE_HORIZON_DAYS } from "./timetable";
export type { Placed, TimetableInput, TimetableResult, TimetableSend, TimetableSender } from "./timetable";
export { openingToldParts, reachOutExampleRecord, replyToldParts, toldPart, toldShares, tryPartsOf } from "./told";
export type { ReachOutToldDto, ToldKind, ToldPart, ToldPartId, TryPart, TrySource } from "./told";
export { US_STATE_ZONES, zoneOfRegion } from "./us-zones";
export type { UsStateCode } from "./us-zones";
export {
  CHAIN_MIN_LISTINGS,
  chainOf,
  customerDomainOf,
  heldClaimOf,
  HOLD_DOOR_WORDS,
  holdDoors,
  HOLDS_INCLUDED_FOR_CHAIN,
  holdWords,
  isReachOutHold,
  OPENING_CLAIM_KINDS,
  openingClaimWords,
  REACH_OUT_COUNTRIES_FREE,
  REACH_OUT_COUNTRIES_REFUSED,
  REACH_OUT_HOLDS,
  reachOutCountryOf,
} from "./words/claims";
export type { HeldClaimKind, HoldDoor, ReachOutHold } from "./words/claims";
export {
  ANGLE_WORDS_MAX,
  ASK_FIRST_WORDS_MAX,
  ASK_LATER_WORDS_MAX,
  emailWordCount,
  linkCount,
  linksIn,
  OPENING_CHARS_MAX,
  OPENING_WORDS_MAX,
  REACH_OUT_AFTER_DAYS,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_NAME_MAX,
  REACH_OUT_STEPS_MAX,
  REACH_OUT_WORDS_MAX,
  reachOutRules,
  reachOutSlotFault,
  shoutingLine,
  SIGNED_BY_MAX,
  slotCount,
  validateReachOutWords,
  wordCount,
  wordsIssueWords,
  wordsNeedOpening,
} from "./words/limits";
export type { WordsIssue, WordsProblem } from "./words/limits";
export {
  chainIssueWords,
  checkOpening,
  factValue,
  isOpeningFactKey,
  isOpeningProblem,
  OPENING_FACT_KEYS,
  OPENING_PROBLEMS,
  openingProblemWords,
  validateReachOutChain,
} from "./words/opening";
export type {
  ChainIssue,
  ChainProblem,
  OpeningFactKey,
  OpeningProblem,
  OpeningRecord,
  WrittenOpening,
} from "./words/opening";
export { REACH_OUT_BODY_MAX, REACH_OUT_SLOT_SET, REACH_OUT_SLOTS, REACH_OUT_SUBJECT_MAX } from "./words/slots";
export type { ReachOutSlot } from "./words/slots";
