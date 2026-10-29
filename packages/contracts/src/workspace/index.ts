/** The workspace itself: sign-up, the password, billing, what is kept how long, the activity log, and the back office. */
export { ACTIVATION_MILESTONES } from "./activation";
export type { ActivationMilestone } from "./activation";
export {
  activityKindWords,
  activityWords,
  CALL_MISSED_WORDS,
  CALL_UNANSWERED_WORDS,
  REACH_OUT_EMAILED_WORDS,
} from "./activity";
export type { ActivityMemberDto, ActivityPageDto, ActivityRowDto, ActivityVerb } from "./activity";
export {
  ACTIVITY_KINDS,
  ACTIVITY_NOISE_KINDS,
  ACTIVITY_NOISE_PREFIXES,
  activityRowOfDecision,
  activityRowOfEvent,
  isActivityMoney,
  isActivityNoise,
} from "./activity-rows";
export type { ActivityDecisionRow, ActivityEventRow } from "./activity-rows";
export {
  BILLING_MODES,
  BILLING_STATUSES,
  BILLING_TEST_MODE_CLAUSE,
  BILLING_TRIAL_DAYS,
  billingAccountDto,
  billingDoorOpen,
  billingPill,
  CAMPAIGNS_PAUSED_WORDS,
  CHECKOUT_OUTCOME_WORDS,
  CHECKOUT_RETURN_ROUTE,
  CHECKOUT_RETURNS,
  dayWords,
  FIRST_RUN_TRIAL_DAYS,
  hasPublicPages,
  INVOICE_STATUS_WORDS,
  invoiceStatusWords,
  isCheckoutReturn,
  maySpend,
  mayUseModels,
  moneyWords,
  openToCustomersOf,
  PAUSED_WORDS,
  pausedVoiceFacts,
  planBilling,
  priceWords,
  receptionistOn,
  SPEND_LEADS,
  SPEND_NUMBER,
  SPEND_TEXTING,
  START_PLAN_WORDS,
  takesSignUps,
  tenantStatusFor,
  toBillingVM,
  TRIAL_COVERS,
  trialOffer,
  trialWords,
  whyCannotSpend,
} from "./billing";
export type {
  BillingAccountDto,
  BillingBell,
  BillingDto,
  BillingInvoiceDto,
  BillingMode,
  BillingPlan,
  BillingPriceDto,
  BillingStatus,
  BillingVM,
  CheckoutReturn,
  OpenToCustomers,
  SetupBillingFacts,
  SpendWords,
  SubscriptionFacts,
} from "./billing";
export {
  ContactAddedData,
  ContactConsentChangedData,
  PlatformActedData,
  SHARED_EVENT_SHAPES,
  SHARED_EVENT_VERSIONS,
} from "./event-data";
export type { SharedEventKind } from "./event-data";
export {
  HANDOVER_DAYS,
  HANDOVER_WAITING_MAX,
  HANDOVER_WORDS,
  handoverInviteEmail,
  handoverRoom,
  handoverUntilWords,
  maskedEmail,
  partnerHandoverVM,
} from "./handover";
export type { HandoverState, OpenHandoverDto, PartnerHandoverDto, PartnerHandoverVM } from "./handover";
export { HandoverCreateSchema, HandoverResendSchema } from "./handover-schema";
export {
  broughtWords,
  cleanPartnerCode,
  isPartnerCode,
  PARTNER_CODE_MAX,
  PARTNER_CODE_MIN,
  PARTNER_CODES_RESERVED,
  PARTNER_COOKIE,
  PARTNER_COOKIE_DAYS,
  PARTNER_EARNING_KINDS,
  PARTNER_EARNING_STATES,
  PARTNER_HOLD_DAYS,
  PARTNER_SHARE_BP_DEFAULT,
  PARTNER_STANDING_WORDS,
  PARTNER_STANDINGS,
  PARTNER_STATUSES,
  PARTNER_WORDS,
  partnerCodeFromCookie,
  partnerEarningsWords,
  partnerLinkFor,
  partnerPathFor,
  partnerVM,
  partnerWorkspacesVM,
  shareWords,
} from "./partner";
export {
  PARTNER_REVERSAL_KINDS,
  PARTNER_STANDING_VERBS,
  PARTNER_STATUS_VERBS,
  partnerPayoutOutcomeWords,
  partnerStandingChoices,
  partnerStandingOutcomeWords,
  partnerStatusChoices,
  partnerStatusOutcomeWords,
  platformPartnerRows,
  platformPartnerStanding,
  platformPartnerSummary,
} from "./partner";
export { partnerLetter, partnerPaneUrl } from "./partner";
export type {
  PartnerBalanceRow,
  PartnerDto,
  PartnerEarningsVM,
  PartnerVM,
  PartnerWorkspaceMoneyDto,
  PartnerWorkspacesVM,
  PartnerWorkspaceVM,
} from "./partner";
export type {
  PlatformPartnerBalanceDto,
  PlatformPartnerRowVM,
  PlatformPartnerStandingVM,
  PlatformPartnerWorkspaceDto,
} from "./partner";
export {
  PARTNER_INVITE_DAYS,
  PARTNER_INVITE_WORDS,
  partnerCodeFrom,
  partnerInvitationWords,
  partnerInviteEmail,
  partnerJoinedWords,
  workspacePartnerVM,
} from "./partner-invite";
export type {
  PartnerInvitationDto,
  WorkspacePartnerDto,
  WorkspacePartnerState,
  WorkspacePartnerVM,
} from "./partner-invite";
export { PartnerInviteSchema } from "./partner-invite-schema";
export { PartnerBecomeSchema } from "./partner-schema";
export { PartnerLetterNewsSchema, PartnerLettersSchema } from "./partner-schema";
export type { PartnerLetterNews } from "./partner-schema";
export { isUsablePassword, PASSWORD_MAX_BYTES, PASSWORD_MIN, PASSWORD_WORDS, passwordProblem } from "./password";
export {
  PLATFORM_NEW_DAYS,
  PLATFORM_QUIET_DAYS,
  PLATFORM_VERDICTS,
  platformActionWarning,
  platformHealthOf,
  platformHealthWords,
  platformLineActions,
  platformNumber,
  platformQueue,
  platformRows,
  platformSummary,
  QUEUE_SENDS_NOTHING,
  QUEUE_SHOWN,
} from "./platform";
export type {
  PlatformHealth,
  PlatformLineAction,
  PlatformLineActionVM,
  PlatformQueue,
  PlatformQueueVM,
  PlatformRowVM,
  PlatformTenantDto,
  PlatformVerdict,
  PlatformVerdictWords,
  SweepHealthRow,
  WaitingPersonDto,
  WaitingRowVM,
} from "./platform";
export { pastTarget, pastTargetPage, PLATFORM_DAYS_READ, PLATFORM_NUMBERS, platformDaysWords } from "./platform-days";
export type { PlatformDayLineVM, PlatformDayRowDto, PlatformDaysVM } from "./platform-days";
export {
  EVENT_EVIDENCE_KINDS,
  RATE_HITS_RETENTION_HOURS,
  RECORDING_PURGED_WORDS,
  RECORDING_RETENTION_DAYS,
  RETENTION_DAYS,
  retentionWords,
} from "./retention";
export {
  cleanFactorCode,
  enrolRefusalWords,
  factorCodeWords,
  factorStepNeeded,
  seatNeedsSecondFactor,
  SECOND_FACTOR_LEVEL,
  SECOND_FACTOR_PATH,
  SECOND_FACTOR_REQUIRED_PATH,
  SECOND_FACTOR_STAFF_PATH,
  SECOND_FACTOR_WORDS,
  secondFactorAsked,
  secondFactorResetWords,
  secondFactorShown,
} from "./second-factor";
export type { AssuranceLevels } from "./second-factor";
export {
  addressAlreadyKnown,
  deviceTimezone,
  emailNotConfirmed,
  firstWorkspaceDoor,
  googleCallbackUrl,
  PENDING_WORKSPACE_KEY,
  requestCodeWords,
  resendLeft,
  sendFailureIsOurs,
  SIGNIN_RESEND_COOLDOWN_S,
  SIGNUP_NAME_MAX,
  SIGNUP_NAME_MIN,
  SIGNUP_WAITLIST,
  SIGNUP_WORDS,
  signupPosture,
  verifyCodeWords,
} from "./signup";
export type { FirstWorkspaceDoor, SignupPosture } from "./signup";
export {
  InviteCodeSchema,
  pendingCodeOf,
  pendingWorkspaceOf,
  PendingWorkspaceSchema,
  SignupSchema,
} from "./signup-schema";
export type { PendingWorkspace, SignupInput } from "./signup-schema";
export {
  cleanTimezone,
  cleanWorkspaceName,
  DEFAULT_TIMEZONE,
  isTimezone,
  knownTimezones,
  timezoneWords,
  usableDeviceTimezone,
  zoneSearchWords,
} from "./workspace";
