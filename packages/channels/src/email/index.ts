/**
 * The email domain: `@chanlytics/channels/email`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export { checkedWordsOf, reachOutDraft, reachOutRequest, reachOutWords } from "./cold-request";
export type { RequestRefusal } from "./cold-request";
export { addressOf, messageIdHeader, oneLine } from "./header-values";
export {
  campaignsIdentity,
  connectedIdentity,
  hostedAddress,
  hostedIdentity,
  replyRouteAddress,
  requestLeavesAs,
  sendsAs,
  sendsAsCampaigns,
  sendsAsConnected,
} from "./identity";
export type { EmailSendsAs } from "./identity";
export {
  classifyReceived,
  emailReceivedEventFrom,
  messageIdsIn,
  platformRecipient,
  receivedEmailFrom,
  senderAuthenticated,
} from "./intake";
export type { EmailClaim, EmailReceivedEvent, PlatformRecipient, ReceivedEmail } from "./intake";
export {
  calendarIcs,
  listGoogleCalendarIds,
  listGoogleEvents,
  listGraphCalendarIds,
  listGraphEvents,
} from "./mailbox/calendar";
export type { CalendarEvent, CalendarIds, EventsPage } from "./mailbox/calendar";
export {
  DKIM_SELECTORS,
  dkimOf,
  dmarcOf,
  SPF_INCLUDES,
  spfNamesProvider,
  spfRecordsOf,
  spfTermsOf,
} from "./mailbox/dns";
export type { TxtAnswer } from "./mailbox/dns";
export {
  findGmailSent,
  findGmailThread,
  gmailDayUsed,
  gmailNoMailbox,
  gmailReadVerdict,
  gmailSignedOut,
  listGmailReports,
  listGmailSentIds,
  readGmailHead,
  readGmailHistory,
  readGmailMessage,
  readGmailProfile,
  readGmailSignature,
  sendGmail,
  stopGmailWatch,
  watchGmail,
} from "./mailbox/gmail";
export type { GmailHistory, GmailSent } from "./mailbox/gmail";
export {
  deleteGraphMessage,
  findGraphSent,
  graphDayUsed,
  graphNoMailbox,
  graphReadVerdict,
  graphSignedOut,
  listGraphInbox,
  listGraphJunkSince,
  readGraphDelta,
  readGraphMe,
  readGraphMessage,
  renewGraph,
  sendGraph,
  subscribeGraph,
  unsubscribeGraph,
} from "./mailbox/graph";
export type { GraphDelta, GraphSent } from "./mailbox/graph";
export { listGmailSince, listGraphSince } from "./mailbox/history";
export type { ListedMail, MailPage, MailWindow } from "./mailbox/history";
export { buildMime, mailboxMessageId } from "./mailbox/mime";
export {
  grantHolds,
  grantScopes,
  grantScopesMissing,
  MAILBOX_SCOPES,
  mailboxAdminConsentUrl,
  mailboxAuthorizeUrl,
  mailboxRefreshRequest,
  mailboxRevokeRequest,
  mailboxTokenRequest,
  makeMailboxPkceChallenge,
  makeMailboxPkceVerifier,
  parseMailboxGrant,
} from "./mailbox/oauth";
export type { MailboxGrant, MailboxOAuthClient, MailboxReach, MailboxRequest } from "./mailbox/oauth";
export { listGoogleContacts, listGraphContacts } from "./mailbox/people";
export type { KnownPerson, PeoplePage } from "./mailbox/people";
export { clientStateMatches, gmailPushOf, graphNotificationsOf, verifyGooglePushToken } from "./mailbox/push";
export type { PushTokenRefusal } from "./mailbox/push";
export {
  deliveryReportOf,
  filedAsBulk,
  filedUnderUpdates,
  gmailEmailOf,
  graphEmailOf,
  rowIdOfMessageId,
} from "./mailbox/read";
export type { BounceClass, DeliveryReport, FoundSent, MailboxEmail, ReadVerdict } from "./mailbox/read";
export { sendFromMailbox } from "./mailbox/send";
export type { MailboxSendInput, MailboxSendResult } from "./mailbox/send";
export { gmailHeadOf, replyToElsewhere, sentByAService } from "./mailbox/sender";
export { cleanGmailSignature, gmailSignatureWords, mailboxDtoOf, mailboxSignatureOf } from "./mailbox/signature";
export { mailDomainsFrom, resendLimitOf } from "./provider-answers";
export type { MailCapability, MailDomainFacts, ResendLimit } from "./provider-answers";
export { emailReceiptEffect, emailReceiptFrom } from "./receipts";
export type { EmailReceipt, EmailReceiptEffect, EmailReceiptType, EmailSuppressionReason } from "./receipts";
export { buildEmailRequest, emailHtml, isEmailRequest, mailboxHeader, referencesFor, replySubject } from "./request";
export type { EmailCampaign, EmailIdentity, EmailParent, EmailRequest, EmailRequestInput } from "./request";
export { fetchMailDomains, fetchReceivedEmail, SEND_DEADLINE_MS, SEND_MIN_MS, sendEmail } from "./resend";
export type { ResendAnswer, ResendConfig, SendEmailOptions } from "./resend";
export { emailPlainText } from "./text";
export { resendWebhookSignature, verifyResendWebhook, WEBHOOK_TOLERANCE_S } from "./webhook-signature";
export type { SvixHeaders } from "./webhook-signature";
