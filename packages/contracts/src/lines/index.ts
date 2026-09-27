/** Phone numbers and their carrier registration: the record, the path, the public page the carriers require, a line's failure and release. */
export { lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "./line-failure";
export { channelFor, channelKindWords, toChannelVM, CHANNEL_KIND_WORDS, CHANNEL_ANSWERED } from "./channels";
export type { ChannelDto, ChannelPickable, ChannelHealth, ChannelVM } from "./channels";
export {
  dataSentences,
  smsConsentSentence,
  businessPageVM,
  textingTermsVM,
  businessPageMetadata,
  textingTermsMetadata,
  registrationPreflight,
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
