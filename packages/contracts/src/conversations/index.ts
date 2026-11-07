/** A thread as the pages draw it: the view models, and who has it. */
export {
  ABANDONED_MS,
  abandonedCall,
  CALL_TRANSCRIPT,
  callAttemptWords,
  DISCONNECTION_LABELS,
  MISSED_CALL_LINE,
  missedCall,
  neverConnected,
  reachedVoicemail,
  UNCONNECTED_DIAL_LINE,
} from "./call-dto";
export type { CallDto } from "./call-dto";
export { callEndedWords, spokenDuration, toCallVM, unansweredCallTodo } from "./call-vm";
export type { CallVM } from "./call-vm";
export { DRAFT_DOOR, STEER_DOOR } from "./edge-doors";
export {
  dockLineOf,
  DRAFTED_TODO,
  ESCALATION_ACTS,
  ESCALATION_REASON_LABELS,
  ESCALATION_REASON_SHORT,
  ESCALATION_SUMMARIES,
  HAND_BACK_REASONS,
  HOLD_ACT_WORDS,
  holdActOf,
  holdToDoOf,
  holdWaits,
  OPEN_HOLDS_READ_MAX,
  PITCH_TODO,
  reasonLabelOf,
  reasonShort,
  reasonSummaryOf,
  WAITING_REASONS,
  waitsOnAPerson,
} from "./escalations";
export type { BookingRequestDto, EscalationDto, HoldAct, OpenHold } from "./escalations";
export { HANDLED_OUTCOMES } from "./handled";
export type { Handled } from "./handled";
export type { InboxThreadVM } from "./inbox-thread-vm";
export { countdownClock, theyWroteLast, toInboxThreadVM } from "./inbox-thread/thread-vm";
export {
  conversationWaitsOnYou,
  HELD_BY_ID_MAX,
  heldDraftWaits,
  heldThreadIds,
  snoozedThreadWords,
  THREAD_PANE_WORDS,
  threadStanding,
  threadsWaitingOnYou,
  threadWaitsOf,
} from "./inbox-thread/waits";
export { EMAIL_CLAIMS, isAutomatedSend, isPersonsWords, messageAuthor, messageVia, messageWhy } from "./message-author";
export { lastWordLine } from "./message-author";
export type { EmailClaim, MessageAuthor } from "./message-author";
export {
  emailLeftOutOf,
  type EmailParts,
  emailPartsOf,
  emailPreviewOf,
  emailSignatureLine,
  emailSignedLine,
  emailSubjectsOf,
  repairMojibake,
  splitQuotedReply,
  tidyEmailWords,
} from "./message-email";
export { mediaKind, mediaVM } from "./message-media";
export type { MediaVM } from "./message-media";
export {
  clipAtWord,
  draftSendsAtMs,
  failureWordsOf,
  heldDraftOf,
  isHeldDraft,
  messageStatusLabel,
  messageText,
  messageWords,
  providerCodeOf,
  reachedCustomer,
  sendFailureWords,
} from "./message-words";
export { lastExchanged, sentFactsOf } from "./message-words";
export { CONVERSATION_MOVES, conversationMoveAllowed, conversationPatch } from "./moves";
export type { ConversationMoveName, ConversationPatch } from "./moves";
export {
  HELD_WORDS,
  heldPill,
  INBOX_BUCKET_WORDS,
  inboxBucketWord,
  isUnseen,
  NEEDS_YOU_LIST_END,
  NEEDS_YOU_WORD,
  readingOf,
  replyWaitsOnYou,
  seenBy,
  standingOf,
  standingOfThread,
} from "./standing";
export type {
  SeenMarksDto,
  SeenOf,
  SeenReading,
  Standing,
  StandingInput,
  StandingVerdict,
  ThreadMoveKey,
} from "./standing";
export {
  agentFor,
  answerWireOf,
  isChatMessage,
  isFromTheirSide,
  isTheirOwnWords,
  lastWroteOn,
  THREAD_CHANNEL_WORDS,
  threadChannelOf,
  threadChannelWords,
  writtenChannelOf,
} from "./thread-channel";
export type { ThreadChannel, WrittenChannel } from "./thread-channel";
export { formatWaited, inboxThreadClock, shortTime, waitedSaid, waitedSince } from "./thread-clock";
export { bubbleTime } from "./thread-clock";
export {
  contactMeta,
  contactName,
  emailStoppedWords,
  initialsOf,
  isEmailStopped,
  isIdentifierName,
  personFaceOf,
  shortName,
} from "./thread-contact";
export type { EmailStopBearing } from "./thread-contact";
export { inReadingOrder, isOptedOut, LIST_MESSAGES_EACH, memberMetaOf, messageAt } from "./thread-dto";
export type { ConversationDto, LastHoldDto, MessageDto } from "./thread-dto";
