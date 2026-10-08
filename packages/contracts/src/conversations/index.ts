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
  reachedCustomer,
  isHeldDraft,
  draftSendsAtMs,
  messageWords,
  messageText,
  clipAtWord,
} from "./message-words";
export { isAutomatedSend, isPersonsWords, messageVia, messageAuthor, messageWhy } from "./message-author";
export { HANDLED_OUTCOMES } from "./handled";
export type { Handled } from "./handled";
export { REFERRAL_ID_MAX } from "./first-touch";
export type { MessageAuthor } from "./message-author";
export {
  ESCALATION_REASON_LABELS,
  ESCALATION_REASON_SHORT,
  ESCALATION_SUMMARIES,
  reasonShort,
  reasonLabelOf,
  reasonSummaryOf,
} from "./escalations";
export type { EscalationDto } from "./escalations";
export type { InboxThreadVM } from "./inbox-thread-vm";
export {
  threadStanding,
  conversationWaitsOnYou,
  threadsWaitingOnYou,
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
  reachedVoicemail,
  DISCONNECTION_LABELS,
} from "./call-dto";
export type { CallDto } from "./call-dto";
export { spokenDuration, toCallVM } from "./call-vm";
export type { CallVM } from "./call-vm";
export { standingOf, replyWaitsOnYou, HELD_WORDS, seenBy, isUnseen } from "./standing";
export type { StandingInput, Standing, StandingVerdict, SeenMarksDto, SeenOf, SeenReading } from "./standing";
export { CONVERSATION_MOVES, conversationPatch, conversationMoveAllowed } from "./conversation-moves";
export type { ConversationMoveName, ConversationPatch } from "./conversation-moves";
