/** Email: the workspace's own address, the free-mail providers, and the mailboxes it writes from (decision 0056). */
export {
  emailDomainOf,
  normalizeLocalPart,
  whyNotALocalPart,
  whyNotAFromName,
  suggestLocalPart,
  MAILBOX_RESERVED,
  MAILBOX_LOCAL_PART_MAX,
  MAILBOX_FROM_NAME_MAX,
  EMAIL_NOT_ANSWERED_SENTENCE,
  EMAIL_ELSEWHERE_SENTENCE,
} from "./mailbox";
export type { MailboxDto, EmailSetupDto } from "./mailbox";
export {
  MAILBOX_HOLDS,
  MAILBOX_DAILY_CAP_MAX,
  CUSTOMER_DOMAIN_DAILY_MAX,
  MAILBOX_RAMP,
  mailboxRampShare,
  mailboxDailyCap,
  mailboxHoldWords,
  mailboxHoldFixWords,
} from "./mailbox-standing";
export type { MailboxHold } from "./mailbox-standing";
export {
  MAILBOX_PROVIDERS,
  MAILBOX_CONNECTION_STATES,
  MAILBOX_CONNECTIONS_MAX,
  mailboxSendsNow,
  reachOutWritesFrom,
  mailboxConnectionDtoOf,
  mailboxHoldOf,
  MAILBOX_PROVIDER_WORDS,
  mailboxHealthWords,
  mailboxWords,
  mailboxActs,
  DMARC_RECOMMENDED,
  mailboxRecordRows,
  SPF_LOOKUPS_MAX,
  SPF_RECORD_MAX,
  SPF_RECORDS_JOIN,
  MAILBOX_CONNECT_WORDS,
  mailboxConnectOk,
  mailboxConnectWords,
  mailboxesFootWords,
  customerDomainWords,
} from "./mailbox-connections";
export type {
  MailboxProvider,
  MailboxConnectionState,
  DnsRecordState,
  MailboxDnsRecord,
  MailboxConnectionDto,
  MailboxCounts,
  MailboxWords,
  MailboxRecordRow,
} from "./mailbox-connections";
export { isFreeMail } from "./free-mail";
export { posesAsReply } from "./email-subject";
export {
  senderVerdictOf,
  senderDomainOffered,
  senderSortRefusal,
  MAILBOX_LEFT_WHY_WORDS,
  MAILBOX_SENDERS_WORDS,
} from "./mailbox-senders";
export type {
  MailboxLeftWhy,
  MailboxSenderVerdict,
  MailboxLeftDto,
  MailboxSaidDto,
  MailboxSendersDto,
} from "./mailbox-senders";
