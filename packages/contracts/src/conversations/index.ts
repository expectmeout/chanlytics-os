/** A thread as the pages draw it: the view models, and who has it. */
export { messageAt, isOptedOut } from "./thread-dto";
export type { MessageDto, ConversationDto } from "./thread-dto";
export { agentFor, writtenChannelOf, threadChannelOf, threadChannelWords } from "./thread-channel";
export { contactName, isIdentifierName, contactMeta, initialsOf } from "./thread-contact";
export { shortTime, formatWaited } from "./thread-clock";
export { mediaKind, mediaVM } from "./message-media";
export type { MediaVM } from "./message-media";
export { emailLeftOutOf, splitQuotedReply } from "./message-email";
export {
  messageStatusLabel,
  reachedCustomer,
  isHeldDraft,
  draftSendsAtMs,
  messageWords,
  messageText,
  clipAtWord,
} from "./message-words";
export { messageVia, messageAuthor } from "./message-author";
export type { MessageAuthor } from "./message-author";
export { ESCALATION_REASON_LABELS } from "./escalations";
export type { EscalationDto } from "./escalations";
export type { InboxThreadVM } from "./inbox-thread-vm";
export { threadStanding, toInboxThreadVM } from "./inbox-thread";
export { toConversationVM } from "./conversation-vm";
export type { ConversationMessageVM, ConversationVM } from "./conversation-vm";
export { ABANDONED_MS, abandonedCall, DISCONNECTION_LABELS } from "./call-dto";
export type { CallDto } from "./call-dto";
export { spokenDuration, toCallVM } from "./call-vm";
export type { CallVM } from "./call-vm";
export { standingOf, replyWaitsOnYou } from "./standing";
export type { StandingInput, Standing, StandingVerdict } from "./standing";
