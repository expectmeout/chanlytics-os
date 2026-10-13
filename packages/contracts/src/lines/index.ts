/** Phone numbers and their carrier registration: the record, the path, the public page the carriers require, a line's failure and release. */
export { lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "./line-failure";
export {
  channelFor,
  channelKindWords,
  channelNoun,
  toChannelVM,
  CHANNEL_KIND_WORDS,
  CHANNEL_ANSWERED,
} from "./channels";
export { callerSentence, lineOffGets, PHONE_LINE_OFF, WORKSPACE_ENDED_WORDS, WORKSPACE_PAUSED } from "./caller-gets";
export type { CallerGets } from "./caller-gets";
export type { ChannelDto, ChannelPickable, ChannelHealth, ChannelVM } from "./channels";
export {
  standingFromConfig,
  standingNeedsRead,
  standingAlertWords,
  standingAfterNameDecision,
  nameDecisionWords,
  numberHealthWithStanding,
  numberHealthOfConfig,
  PAYMENT_HOLD_WORD,
} from "./number-standing";
export type { NumberStanding } from "./number-standing";
export { LINE_CODES_WITHIN_MS, LINE_CODES_MAX, LINE_CODES_EVERY_MS } from "./line-codes";
export type { LineCodeDto } from "./line-codes";
export { WHATSAPP_COST_WORDS } from "./whatsapp-cost";
export { tryItLink } from "./whatsapp-try-it";
export {
  dataSentences,
  smsConsentSentence,
  businessPageVM,
  textingTermsVM,
  businessPageMetadata,
  textingTermsMetadata,
  registrationPreflight,
  publishesBusinessPage,
  SMS_CLAUSES,
} from "./business-page";
export type {
  BusinessPageFacts,
  BusinessPageVM,
  TextingTermsVM,
  PreflightFacts,
  PreflightProblem,
} from "./business-page";
export {
  industryOf,
  businessTypeOf,
  companyTypeOf,
  industryWords,
  BUSINESS_INDUSTRIES,
  DEFAULT_INDUSTRY,
  BUSINESS_TYPES,
  DEFAULT_BUSINESS_TYPE,
  COMPANY_TYPES,
  DEFAULT_COMPANY_TYPE,
} from "./a2p-enums";
export type { BusinessIndustry, BusinessType, CompanyType } from "./a2p-enums";
export {
  registrationPathOf,
  soleProprietorLimits,
  REGISTRATION_PATHS,
  SOLE_PROP_LIMITS,
  REGISTRATION_QUESTION,
  REGISTRATION_PATH_WORDS,
  REGISTRATION_COST_WORDS,
} from "./registration-path";
export type { RegistrationPath, RegistrationPathWords } from "./registration-path";
export {
  businessFieldsFor,
  businessGroupWordsFor,
  emptyBusinessRecord,
  businessRecordProblems,
  businessRecordForPath,
  businessRecordLine,
  ABOUT_MIN,
  ABOUT_MAX,
} from "./business-record";
export type { BusinessRecordDto, BusinessFieldVM, RecordCheckFacts } from "./business-record";
export {
  isPublishedFact,
  changedRecordFields,
  publicPagePath,
  recordFilingOf,
  recordSavedOf,
  recordSavedWords,
  RECORD_REVIEW_CONFIRM,
  PUBLIC_FIELD_MARK,
  BUSINESS_PAGE_NOTE,
  SERVICES_ON_PUBLIC_PAGE,
} from "./published-facts";
export type { BusinessRecordColumn, PublishedRecordColumn, RecordFiling, RecordSavedDto } from "./published-facts";
export {
  lineReleaseAfterDays,
  billingEndedAt,
  lineReleaseStep,
  lineReleaseDay,
  lineReleaseWarning,
  lineReleasedWords,
  LINE_RELEASE_WARN_DAYS,
  LINE_RELEASE_MIN_DAYS,
  LINE_RELEASE_REPORT_DAYS,
} from "./line-release";
export type { LineReleaseBilling, LineReleaseWarned, LineReleaseStep, LineReleaseWordsInput } from "./line-release";
