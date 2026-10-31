/** A thread as the pages draw it: the view models, and who has it. */
export {
  ABANDONED_MS,
  abandonedCall,
  callAttemptWords,
  DISCONNECTION_LABELS,
  missedCall,
  neverConnected,
  reachedVoicemail,
} from "./call-dto";
export type { CallDto } from "./call-dto";
export { callEndedWords, spokenDuration, toCallVM, unansweredCallTodo } from "./call-vm";
export type { CallVM } from "./call-vm";
export { CONVERSATION_MOVES, conversationMoveAllowed, conversationPatch } from "./conversation-moves";
export type { ConversationMoveName, ConversationPatch } from "./conversation-moves";
export { toConversationVM } from "./conversation-vm";
export type { ConversationMessageVM, ConversationVM } from "./conversation-vm";
export {
  ESCALATION_ACTS,
  ESCALATION_REASON_LABELS,
  ESCALATION_REASON_SHORT,
  ESCALATION_SUMMARIES,
  HAND_BACK_REASONS,
  HOLD_ACT_WORDS,
  holdActOf,
  holdWaits,
  OPEN_HOLDS_READ_MAX,
  reasonLabelOf,
  reasonShort,
  reasonSummaryOf,
  WAITING_REASONS,
  waitsOnAPerson,
} from "./escalations";
export type { EscalationDto, HoldAct, OpenHold } from "./escalations";
export { REFERRAL_ID_MAX } from "./first-touch";
export { HANDLED_OUTCOMES } from "./handled";
export type { Handled } from "./handled";
export {
  conversationWaitsOnYou,
  HELD_BY_ID_MAX,
  heldDraftWaits,
  heldThreadIds,
  snoozedThreadWords,
  theyWroteLast,
  THREAD_PANE_WORDS,
  threadStanding,
  threadsWaitingOnYou,
  threadWaitsOf,
  toInboxThreadVM,
} from "./inbox-thread";
export type { InboxThreadVM } from "./inbox-thread-vm";
export { EMAIL_CLAIMS, isAutomatedSend, isPersonsWords, messageAuthor, messageVia, messageWhy } from "./message-author";
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
export {
  HELD_WORDS,
  heldPill,
  INBOX_BUCKET_WORDS,
  inboxBucketWord,
  isUnseen,
  NEEDS_YOU_WORD,
  readingOf,
  replyWaitsOnYou,
  seenBy,
  standingOf,
  standingOfThread,
} from "./standing";
export type { SeenMarksDto, SeenOf, SeenReading, Standing, StandingInput, StandingVerdict } from "./standing";
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
export { formatWaited, inboxThreadClock, shortTime } from "./thread-clock";
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
export { isOptedOut, memberMetaOf, messageAt } from "./thread-dto";
export type { ConversationDto, LastHoldDto, MessageDto } from "./thread-dto";
