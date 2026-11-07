/**
 * The email domain: `@chanlytics/db/email`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  connectMailbox,
  dropMailboxCredentials,
  findLiveMailboxByAddress,
  findMailboxConnection,
  getMailboxCounts,
  getMailboxCredentials,
  listMailboxConnectionsOf,
  listMailboxesToTend,
  noteCalendarGrant,
  patchMailboxConnection,
  putMailboxCredentials,
  stampEmailFromMailbox,
} from "./connections";
export type { ConnectRefusal, MailboxConnectionRow } from "./connections";
export {
  clearForwardingConfirmation,
  findAnsweredReachOutEmail,
  findLastInboundEmail,
  findLastOutboundEmailSubject,
  findMailbox,
  findMailboxById,
  findMailboxOfTenant,
  findSentEmail,
  getEmailFoundSent,
  getEmailNeverLeft,
  getSentEmailWithMessageId,
  ingestInboundEmail,
  keepForwardingConfirmation,
  recordEmailNo,
  recordEmailStatus,
  stampEmailComplaint,
  stampEmailLeftAs,
  stampEmailSent,
  stampMailboxReceived,
  suppressEmailOf,
} from "./email";
export type { InboundEmailFacts, IngestEmailParams, MailboxRow } from "./email";
export { findEmailThreadOf, markMailboxIntakeFailed } from "./intake";
export { listUnknownMailboxEmails, requestMailboxesSweep } from "./reconcile";
export type { UnknownMailboxEmail } from "./reconcile";
export { getMailboxLeftSince, keepSenderReading, recordDomainSaidAutomated } from "./senders";
export { getMailboxPeopleSince, getMailboxSenderVerdicts, listMailboxSendersOf } from "./senders";
export { findSenderReading, getTalksWith, noteMailboxLeft, sortMailboxSender } from "./senders";
export {
  endMailboxSync,
  findMailboxConnectionById,
  findSentEmailIdByMessageId,
  getKnownThreads,
  keepMailboxWatch,
  keepOwnerEmail,
  takeMailboxSync,
} from "./sync";
