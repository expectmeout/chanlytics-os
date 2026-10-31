export { BROADCAST_STALL_RETRY_MS, BROADCAST_STALLS_MAX, sendBroadcastBatch } from "./broadcast";
export { EMAIL_BODY_MAX, EMAIL_REVIEW_WORDS, ingestEmail } from "./email-ingest";
export type { EmailClaim, EmailIngestOutcome, EmailIngestPorts, IncomingEmail } from "./email-ingest";
export { raiseLateFailure } from "./late-failure";
export type { LateFailureCommand, LateFailureFacts, LateFailureOutcome, LateFailurePorts } from "./late-failure";
export { outboundGate, refusalScript } from "./outbound-gate";
export type { OutboundRefusal } from "./outbound-gate";
export type {
  BatchCarry,
  BroadcastBatchCommand,
  BroadcastBatchPorts,
  BroadcastRow,
  ContactRow,
  Door,
  ProvisionLinePorts,
  RecipientMark,
  RecipientRow,
  SendQueuedPorts,
} from "./ports";
export { provisionLine } from "./provision-line";
export { readReply } from "./reply-read";
export type {
  DraftMark,
  DraftState,
  KeptReading,
  ReadReplyCommand,
  ReadReplyOutcome,
  ReplyAsked,
  ReplyFacts,
  ReplyNotice,
  ReplyReadPorts,
} from "./reply-read";
export { SEND_RETRY_WAITS_MS, sendQueued } from "./send";
export type { SendQueuedCommand } from "./send";
