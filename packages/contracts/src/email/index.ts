/** Email: the workspace's own address, the free-mail providers, and the mailboxes it writes from (decision 0056). */
export { coldEmailOf } from "./cold-email";
export type { ColdEmail } from "./cold-email";
export { ALERT_TEST_DOOR, EMAIL_WIRE_DOOR, MAILBOXES_DOOR, SIGNUP_CONFIRM_DOOR, TEST_TO_SELF_DOOR } from "./edge-doors";
export { isFreeMail } from "./free-mail";
export {
  EMAIL_ELSEWHERE_SENTENCE,
  EMAIL_NOT_ANSWERED_SENTENCE,
  emailDomainOf,
  MAILBOX_FROM_NAME_MAX,
  MAILBOX_LOCAL_PART_MAX,
  MAILBOX_RESERVED,
  normalizeLocalPart,
  suggestLocalPart,
  whyNotAFromName,
  whyNotALocalPart,
} from "./mailbox";
export type { EmailSetupDto, MailboxDto } from "./mailbox";
export {
  MAILBOX_CONNECT_WORDS,
  MAILBOX_HISTORY_WORDS,
  mailboxConnectOk,
  mailboxConnectWords,
  mailboxHistoryLine,
} from "./mailbox-connect";
export type { MailboxHistory, MailboxHistoryAct, MailboxHistoryLine } from "./mailbox-connect";
export {
  customerDomainWords,
  DMARC_RECOMMENDED,
  MAILBOX_CARD_WORDS,
  MAILBOX_DNS_WORDS,
  MAILBOX_SIGNATURE_WORDS,
  mailboxActs,
  mailboxDnsOf,
  mailboxesFootWords,
  mailboxGmailSignsWords,
  mailboxRecordRows,
  mailboxRecordStateWords,
  mailboxRowWords,
  mailboxSendingLines,
  mailboxSignsAsWords,
  mailboxSignsChoiceOf,
  SPF_LOOKUPS_MAX,
} from "./mailbox-connections/rows";
export type { MailboxRecordRow, MailboxRowWords, MailboxSignsChoice } from "./mailbox-connections/rows";
export {
  MAILBOX_CONNECTION_STATES,
  MAILBOX_CONNECTIONS_MAX,
  MAILBOX_PROVIDER_WORDS,
  MAILBOX_PROVIDERS,
  mailboxConnectionDtoOf,
  mailboxHealthWords,
  mailboxHoldOf,
  mailboxSendsNow,
  mailboxSignsOf,
  mailboxWords,
  reachOutWritesFrom,
  SPF_RECORD_MAX,
  SPF_RECORDS_JOIN,
} from "./mailbox-connections/states";
export type {
  DnsRecordState,
  MailboxConnectionDto,
  MailboxConnectionState,
  MailboxCounts,
  MailboxDnsRecord,
  MailboxProvider,
  MailboxSigns,
  MailboxSignsFrom,
  MailboxWords,
} from "./mailbox-connections/states";
export {
  MAILBOX_LEFT_WHY_WORDS,
  MAILBOX_SENDERS_WORDS,
  mailboxLeftLine,
  senderDomainOffered,
  senderSortRefusal,
  senderVerdictOf,
} from "./mailbox-senders";
export type {
  MailboxLeftDto,
  MailboxLeftWhy,
  MailboxSaidDto,
  MailboxSendersDto,
  MailboxSenderVerdict,
} from "./mailbox-senders";
export {
  CUSTOMER_DOMAIN_DAILY_MAX,
  MAILBOX_DAILY_CAP_MAX,
  MAILBOX_HOLDS,
  MAILBOX_RAMP,
  mailboxDailyCap,
  mailboxHoldFixWords,
  mailboxHoldWords,
  mailboxRampShare,
} from "./mailbox-standing";
export type { MailboxHold } from "./mailbox-standing";
export {
  SENDER_KINDS,
  SENDER_READ_MAX_TOKENS,
  SENDER_READING_SCHEMA,
  senderLeftWhy,
  senderReadingAsk,
  senderReadingOf,
  senderReadingSystem,
} from "./sender-reading";
export type { SenderFacts, SenderKind, SenderReading } from "./sender-reading";
export { firstSubject, oneLine, posesAsReply, replySubject } from "./subject";
export { emailTextOf } from "./text";
