/** The workspace itself: sign-up, the password, billing, what is kept how long, the activity log, and the back office. */
export { ACTIVATION_MILESTONES } from "./activation";
export type { ActivationMilestone } from "./activation";
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
export type { ActivityMemberDto, ActivityPageDto, ActivityRowDto } from "./activity/dtos";
export { activityKindWords, CALL_MISSED_WORDS, CALL_UNANSWERED_WORDS, REACH_OUT_EMAILED_WORDS } from "./activity/kinds";
export { activityWords } from "./activity/words";
export type { ActivityVerb } from "./activity/words";
export {
  billingAccountDto,
  CHECKOUT_OUTCOME_WORDS,
  CHECKOUT_RETURN_ROUTE,
  CHECKOUT_RETURNS,
  INVOICE_STATUS_WORDS,
  invoiceStatusWords,
  isCheckoutReturn,
  moneyWords,
  pausedVoiceFacts,
} from "./billing/checkout";
export type { CheckoutReturn, SetupBillingFacts } from "./billing/checkout";
export {
  BILLING_MODES,
  BILLING_STATUSES,
  BILLING_TRIAL_DAYS,
  billingDoorOpen,
  callMinutesWords,
  hasPublicPages,
  maySpend,
  mayUseModels,
  openToCustomersOf,
  receptionistOn,
  SPEND_KINDS,
  SPEND_LEADS,
  SPEND_NUMBER,
  SPEND_TEXTING,
  takesSignUps,
  trialDaysFor,
  whyCannotSpend,
} from "./billing/dtos";
export type {
  BillingAccountDto,
  BillingDto,
  BillingInvoiceDto,
  BillingMode,
  BillingPriceDto,
  BillingStatus,
  OpenToCustomers,
  SpendKind,
  SpendWords,
} from "./billing/dtos";
export {
  BILLING_TEST_MODE_CLAUSE,
  billingDayWords,
  billingPill,
  CAMPAIGNS_PAUSED_WORDS,
  PAUSED_WORDS,
  planBilling,
  priceWords,
  START_PLAN_WORDS,
  tenantStatusFor,
  toBillingVM,
  TRIAL_COVERS,
  TRIAL_INCLUDES,
  TRIAL_SPENT_WORDS,
  trialOffer,
  trialSpentOf,
  trialUseWords,
  trialWords,
} from "./billing/plans";
export type { BillingBell, BillingPlan, BillingVM, SubscriptionFacts } from "./billing/plans";
export {
  BILLING_DOOR,
  HANDOVER_INVITE_DOOR,
  PARTNER_INVITE_DOOR,
  SETUP_REQUEST_DOOR,
  SIGNUP_NOTIFY_DOOR,
  YOU_ARE_LIVE_DOOR,
} from "./edge-doors";
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
export {
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
  PARTNER_STANDINGS,
  PARTNER_STATUSES,
  PARTNER_WORDS,
  partnerCodeFromCookie,
  partnerLinkFor,
  partnerPathFor,
} from "./partner/dtos";
export { PARTNER_REVERSAL_KINDS } from "./partner/dtos";
export type { PartnerDto } from "./partner/dtos";
export {
  broughtWords,
  PARTNER_STANDING_WORDS,
  partnerEarningsWords,
  partnerVM,
  partnerWorkspacesVM,
  shareWords,
} from "./partner/earnings";
export {
  PARTNER_STANDING_VERBS,
  PARTNER_STATUS_VERBS,
  partnerStandingChoices,
  partnerStatusChoices,
  partnerStatusOutcomeWords,
  platformPartnerRows,
} from "./partner/earnings";
export type {
  PartnerBalanceRow,
  PartnerEarningsVM,
  PartnerVM,
  PartnerWorkspaceMoneyDto,
  PartnerWorkspacesVM,
  PartnerWorkspaceVM,
} from "./partner/earnings";
export type { PlatformPartnerBalanceDto, PlatformPartnerRowVM, PlatformPartnerWorkspaceDto } from "./partner/earnings";
export {
  partnerPayoutOutcomeWords,
  partnerStandingOutcomeWords,
  platformPartnerStanding,
  platformPartnerSummary,
} from "./partner/platform";
export { partnerLetter, partnerPaneUrl } from "./partner/platform";
export type { PlatformPartnerStandingVM } from "./partner/platform";
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
  signupPostureFor,
  verifyCodeWords,
} from "./signup";
export type { FirstWorkspaceDoor, SignupPosture } from "./signup";
export {
  InviteCodeSchema,
  pendingCodeOf,
  pendingWorkspaceOf,
  PendingWorkspaceSchema,
  PreviewTokenSchema,
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
