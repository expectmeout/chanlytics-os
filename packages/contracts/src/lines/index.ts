/** Phone numbers and their carrier registration: the record, the path, the public page the carriers require, a line's failure and release. */
export {
  BUSINESS_INDUSTRIES,
  BUSINESS_TYPES,
  businessTypeOf,
  COMPANY_TYPES,
  companyTypeOf,
  DEFAULT_BUSINESS_TYPE,
  DEFAULT_COMPANY_TYPE,
  DEFAULT_INDUSTRY,
  industryOf,
  industryWords,
} from "./a2p-enums";
export type { BusinessIndustry, BusinessType, CompanyType } from "./a2p-enums";
export {
  businessPageMetadata,
  businessPageVM,
  dataSentences,
  publishesBusinessPage,
  registrationPreflight,
  SMS_CLAUSES,
  smsConsentSentence,
  textingTermsMetadata,
  textingTermsVM,
} from "./business-page";
export type {
  BusinessPageFacts,
  BusinessPageVM,
  PreflightFacts,
  PreflightProblem,
  TextingTermsVM,
} from "./business-page";
export {
  ABOUT_MAX,
  ABOUT_MIN,
  businessFieldsFor,
  businessGroupWordsFor,
  businessRecordForPath,
  businessRecordLine,
  businessRecordProblems,
  emptyBusinessRecord,
} from "./business-record";
export type { BusinessFieldVM, BusinessRecordDto, RecordCheckFacts } from "./business-record";
export { callerSentence, lineOffGets, PHONE_LINE_OFF, WORKSPACE_ENDED_WORDS, WORKSPACE_PAUSED } from "./caller-gets";
export type { CallerGets } from "./caller-gets";
export {
  CHANNEL_ANSWERED,
  CHANNEL_KIND_WORDS,
  channelFor,
  channelKindWords,
  channelNoun,
  toChannelVM,
} from "./channels";
export type { ChannelDto, ChannelHealth, ChannelPickable, ChannelVM } from "./channels";
export { LINE_CODES_EVERY_MS, LINE_CODES_MAX, LINE_CODES_WITHIN_MS } from "./line-codes";
export type { LineCodeDto } from "./line-codes";
export { lineDtoOf } from "./line-dto";
export type { LineFacts } from "./line-dto";
export { LINE_CREDENTIALS_SENTENCE, lineCredentialFailure } from "./line-failure";
export {
  billingEndedAt,
  LINE_RELEASE_MIN_DAYS,
  LINE_RELEASE_REPORT_DAYS,
  LINE_RELEASE_WARN_DAYS,
  lineReleaseAfterDays,
  lineReleaseDay,
  lineReleasedWords,
  lineReleaseStep,
  lineReleaseWarning,
} from "./line-release";
export type { LineReleaseBilling, LineReleaseStep, LineReleaseWarned, LineReleaseWordsInput } from "./line-release";
export {
  nameDecisionWords,
  numberHealthOfConfig,
  numberHealthWithStanding,
  PAYMENT_HOLD_WORD,
  standingAfterNameDecision,
  standingAlertWords,
  standingFromConfig,
  standingNeedsRead,
} from "./number-standing";
export type { NumberStanding } from "./number-standing";
export {
  BUSINESS_PAGE_NOTE,
  changedRecordFields,
  isPublishedFact,
  LINE_FILED_NAMES,
  PUBLIC_FIELD_MARK,
  publicPagePath,
  RECORD_REVIEW_CONFIRM,
  recordFilingOf,
  recordSavedOf,
  recordSavedWords,
  RENAME_WORDS,
  SERVICES_ON_PUBLIC_PAGE,
} from "./published-facts";
export type { BusinessRecordColumn, PublishedRecordColumn, RecordFiling, RecordSavedDto } from "./published-facts";
export {
  REGISTRATION_COST_WORDS,
  REGISTRATION_PATH_WORDS,
  REGISTRATION_PATHS,
  REGISTRATION_QUESTION,
  registrationPathOf,
  SOLE_PROP_LIMITS,
  soleProprietorLimits,
} from "./registration-path";
export type { RegistrationPath, RegistrationPathWords } from "./registration-path";
export { WHATSAPP_COST_WORDS } from "./whatsapp-cost";
export { tryItLink } from "./whatsapp-try-it";
