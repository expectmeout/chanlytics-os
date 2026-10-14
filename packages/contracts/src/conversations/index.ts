/** A thread as the pages draw it: the view models, and who has it. */
export { messageAt, isOptedOut, memberMetaOf } from "./thread-dto";
export type { MessageDto, ConversationDto } from "./thread-dto";
export {
  agentFor,
  answerWireOf,
  isChatMessage,
  isFromTheirSide,
  isTheirOwnWords,
  lastWroteOn,
  writtenChannelOf,
  threadChannelOf,
  threadChannelWords,
  THREAD_CHANNEL_WORDS,
} from "./thread-channel";
export {
  contactName,
  isIdentifierName,
  shortName,
  contactMeta,
  initialsOf,
  personFaceOf,
  isEmailStopped,
  emailStoppedWords,
} from "./thread-contact";
export type { EmailStopBearing } from "./thread-contact";
export { shortTime, formatWaited } from "./thread-clock";
export { mediaKind, mediaVM } from "./message-media";
export type { MediaVM } from "./message-media";
export { emailLeftOutOf, splitQuotedReply } from "./message-email";
export {
  messageStatusLabel,
  sendFailureWords,
  failureWordsOf,
  providerCodeOf,
  reachedCustomer,
  isHeldDraft,
  heldDraftOf,
  draftSendsAtMs,
  messageWords,
  messageText,
  clipAtWord,
} from "./message-words";
export { EMAIL_CLAIMS, isAutomatedSend, isPersonsWords, messageVia, messageAuthor, messageWhy } from "./message-author";
export { HANDLED_OUTCOMES } from "./handled";
export type { Handled } from "./handled";
export { REFERRAL_ID_MAX } from "./first-touch";
export type { EmailClaim, MessageAuthor } from "./message-author";
export {
  ESCALATION_REASON_LABELS,
  ESCALATION_REASON_SHORT,
  ESCALATION_SUMMARIES,
  reasonShort,
  reasonLabelOf,
  reasonSummaryOf,
  ESCALATION_ACTS,
  HAND_BACK_REASONS,
  OPEN_HOLDS_READ_MAX,
  HOLD_ACT_WORDS,
  holdActOf,
  holdWaits,
  waitsOnAPerson,
} from "./escalations";
export type { EscalationDto, HoldAct, OpenHold } from "./escalations";
export type { InboxThreadVM } from "./inbox-thread-vm";
export {
  threadStanding,
  conversationWaitsOnYou,
  threadsWaitingOnYou,
  threadWaitsOf,
  heldThreadIds,
  HELD_BY_ID_MAX,
  snoozedThreadWords,
  heldDraftWaits,
  toInboxThreadVM,
} from "./inbox-thread";
export { toConversationVM } from "./conversation-vm";
export type { ConversationMessageVM, ConversationVM } from "./conversation-vm";
export {
  ABANDONED_MS,
  abandonedCall,
  callAttemptWords,
  missedCall,
  neverConnected,
  reachedVoicemail,
  DISCONNECTION_LABELS,
} from "./call-dto";
export type { CallDto } from "./call-dto";
export { callEndedWords, spokenDuration, toCallVM } from "./call-vm";
export type { CallVM } from "./call-vm";
export {
  standingOf,
  standingOfThread,
  replyWaitsOnYou,
  HELD_WORDS,
  NEEDS_YOU_WORD,
  INBOX_BUCKET_WORDS,
  inboxBucketWord,
  heldPill,
  seenBy,
  isUnseen,
} from "./standing";
export type { StandingInput, Standing, StandingVerdict, SeenMarksDto, SeenOf, SeenReading } from "./standing";
export { CONVERSATION_MOVES, conversationPatch, conversationMoveAllowed } from "./conversation-moves";
export type { ConversationMoveName, ConversationPatch } from "./conversation-moves";
