// The Console (decision 0066): the platform's staff, their acts and reasons, requests, support, Find.
export {
  ACT_LOG_PAGE,
  ACT_OUTCOMES,
  ACT_TARGETS,
  actRowOf,
  actsCsv,
  CONSOLE_SCREEN_WORDS,
  CONSOLE_SCREENS,
  CONSOLE_WORKSPACE_TAB_WORDS,
  CONSOLE_WORKSPACE_TABS,
  consoleAddressOf,
  consolePathOf,
  staffSeesScreen,
} from "./acts";
export type {
  ActOutcome,
  ActTarget,
  ConsoleAddress,
  ConsoleScreen,
  ConsoleWorkspaceTab,
  PlatformActDto,
  PlatformActVM,
} from "./acts";
export {
  CLAIM_MS,
  claimWords,
  CONSOLE_GROUP_WORDS,
  CONSOLE_WORDS,
  consoleGroupOf,
  consoleGroups,
  consoleNumbersFrom,
  consoleNumbersOf,
  homeSentence,
  verdictPill,
} from "./console";
export type { ClaimDto, ConsoleGroup, ConsoleNumbersDto, ConsoleNumberVM } from "./console";
export { INTAKE_REPLAY_DOOR, SUPPORT_REPORT_DOOR } from "./edge-doors";
export { healthAskOf } from "./health-ask";
export type { HealthAskStageVM, HealthAskVM } from "./health-ask";
export {
  clocksOf,
  failureReadingOf,
  jobWords,
  pageKeyWords,
  pagesOf,
  scheduleWords,
  subscriberWords,
} from "./health-clocks";
export type { ClockState, ClockVM, HealthClockDto, OperatorPageDto, PageVM } from "./health-clocks";
export { connectionsOf, deliveriesOf, draftUsesOf, modelCallsOf } from "./health-parts/models-connections";
export type { ConnectionVM, DeliveriesVM, ModelCallsVM } from "./health-parts/models-connections";
export { callsOf, sendsOf, webhooksOf } from "./health-parts/sends-calls";
export type { CallsVM, HealthPartsDto, SendChannelVM, SendsVM, WebhooksVM } from "./health-parts/sends-calls";
export { promiseDaysOf } from "./health-promises";
export type { PromiseCellState, PromiseCellVM, PromiseRowVM } from "./health-promises";
export { HEALTH_SCOPE_WORDS, HEALTH_SCOPES, inScope, oursOf, workspaceNamer } from "./health-scope";
export type { HealthScope, HealthWorkspaceDto } from "./health-scope";
export {
  dollarsWords,
  HEALTH_STATE_WORDS,
  HEALTH_TAB_WORDS,
  HEALTH_TABS,
  HEALTH_WINDOWS,
  healthPathOf,
  healthTabOf,
  healthTilesOf,
  secondsWords,
} from "./health/dtos";
export type {
  ClientErrorDto,
  FailedJobDto,
  HealthAct,
  HealthDto,
  HealthSeverity,
  HealthState,
  HealthTab,
  HealthTileVM,
  HealthWindow,
} from "./health/dtos";
export { actedOnProfileWho, HEALTH_WORDS, healthQuietWords } from "./health/looks";
export type { HealthLookVM } from "./health/looks";
export { healthCounts, healthLooksOf, healthSentence } from "./health/summary";
export { LEDGER_LANE_WORDS } from "./ledger";
export type { LedgerKindDto, LedgerLaneDto, LedgerNowDto } from "./ledger";
export { CONSOLE_PATH } from "./path";
export {
  privacyRequestOf,
  REQUEST_KIND_WORDS,
  REQUEST_KINDS,
  REQUEST_STEP_KEYS,
  REQUEST_STEPS,
  REQUEST_WORDS,
  requestClock,
  requestCode,
  requestDayWords,
  requestDueAt,
  requestsInOrder,
  requestStepChange,
} from "./requests";
export type { PrivacyRequestDto, PrivacyRequestVM, RequestKind, RequestStep, RequestStepVM } from "./requests";
export {
  ActsQuerySchema,
  ClaimSchema,
  ConsoleWhySchema,
  DeliveryRedriveSchema,
  FindQuerySchema,
  HealthQuerySchema,
  JobKindPauseSchema,
  JobRequeueKindSchema,
  JobRequeueSchema,
  LineActSchema,
  PartnerPayoutSchema,
  PartnerSecondFactorSchema,
  PartnerStandingSchema,
  PartnerStatusSchema,
  RequestFileSchema,
  RequestStepSchema,
  SupportKindSchema,
  SupportMarkSchema,
  SupportQuerySchema,
  SupportResendSchema,
  WaitlistInvitedSchema,
} from "./schema";
export type { ConsoleWhyInput } from "./schema";
export {
  CONSOLE_ACT_KEYS,
  CONSOLE_ACTS,
  LINE_ACTS,
  REASON_KINDS,
  REASON_LIMITS,
  REASON_WORDS,
  STAFF_ROLE_WORDS,
  STAFF_ROLES,
  STAFF_STATES,
  staffCannotSeeWords,
  staffCannotWords,
  staffMay,
  staffName,
  staffSees,
  whyWords,
} from "./staff";
export type { ConsoleAct, ConsoleSight, ConsoleWhy, ReasonKind, StaffRole, StaffState } from "./staff";
export { playbookOf, setupAskMail, supportMeanwhile } from "./support-playbooks";
export type { PlaybookFill, SupportPlaybook } from "./support-playbooks";
export {
  answeredMedianMs,
  supportDue,
  supportPageOf,
  supportQueueOf,
  supportQuietWords,
  supportSentence,
  supportViewOf,
  supportWorkspaceOf,
} from "./support-queue/queue";
export type { SupportBookDto, SupportCounts, SupportFilter, SupportRowVM } from "./support-queue/queue";
export {
  businessMsBetween,
  firstNameOfAddress,
  SUPPORT_KIND_FILTER_WORDS,
  SUPPORT_KIND_FILTERS,
  SUPPORT_PAGE,
  SUPPORT_READ_DAYS,
  SUPPORT_VIEW_WORDS,
  SUPPORT_VIEWS,
  SUPPORT_ZONE,
  supportDueAt,
  supportWaitOf,
} from "./support-queue/waits";
export type {
  SupportActDto,
  SupportKindFilter,
  SupportRowKind,
  SupportState,
  SupportView,
  SupportWaitVM,
} from "./support-queue/waits";
export {
  askCode,
  askDoneOf,
  cameInOf,
  FIND_KINDS,
  FIND_LIMITS,
  findDigits,
  findGroups,
  inboxHomeUrl,
  inboxSearchUrl,
  SUPPORT_KIND_WORDS,
  SUPPORT_TOPICS,
  SUPPORT_WORDS,
  supportPathOf,
  supportTopicOf,
} from "./support/asks";
export type { AskSignalsDto, CameInVM, FindKind, FindRowDto, SetupAskDto, SupportTopic } from "./support/asks";
export { pageWords, reportCode, reportOf, SETUP_ASK_WORDS, supportClusters } from "./support/reports";
export type { SupportClusterVM, SupportReportDto, SupportReportVM, SupportWhoDto } from "./support/reports";
