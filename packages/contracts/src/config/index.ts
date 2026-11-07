/** The workspace's config and the receptionist it composes: the schemas, the policy, the structured answer, the Business tab. */
export {
  BRAIN_INTENTS,
  BRAIN_LANGUAGES,
  BRAIN_OUTPUT_JSON_SCHEMA,
  brainMetaOf,
  brainOutputSchemaFor,
  CONFIDENCE_STEPS,
  replyWhy,
} from "./brain";
export type { BrainIntent, BrainMeta, BrainStamp, ReplyWhyVM } from "./brain";
export { BrainOutputSchema, parseBrainOutput } from "./brain-schema";
export type { BrainOutput } from "./brain-schema";
export { abilityRows, cannotFoldWords, cannotRows, VISION_SWITCH_WORDS } from "./business-tab/abilities";
export type { AbilitiesVM, AbilityInputs, AbilityRowVM, CannotRowVM } from "./business-tab/abilities";
export { BOOKING_LINK_ROW_WORDS, businessGap } from "./business-tab/business-gap";
export type { BusinessGap, StandingInputs } from "./business-tab/business-gap";
export {
  BOOKING_CHOICE_WORDS,
  BOOKING_CHOICES,
  bookingChoiceNeeds,
  bookingChoiceOf,
  bookingChoiceWrites,
  PRICE_CHOICE_WORDS,
  PRICE_CHOICES,
  priceChoiceOf,
  priceChoiceWrites,
  WALK_IN_WORDS,
  WALK_INS_CHOICES,
  walkInsChoiceOf,
} from "./business-tab/choices";
export type {
  BookingChoice,
  BookingFacts,
  ChoiceWrite,
  PriceChoice,
  PriceFacts,
  WalkInsChoice,
} from "./business-tab/choices";
export { CHIPS_SHOWN, chipsMoreWords } from "./business-tab/counts";
export { count, pluralGrouped } from "./business-tab/counts";
export {
  HANDOFF_ANYWAY,
  handoffCallRow,
  type HandoffCallRowVM,
  handoffChatRow,
  handoffChatWords,
  type HandoffRowVM,
  handoffWords,
} from "./business-tab/handoff-words";
export type { HandoffWordsVM } from "./business-tab/handoff-words";
export {
  ASSISTANT_NAME_WORDS,
  COMMON_LANGUAGES,
  fallbacksWords,
  instructionsWords,
  noteEndedWords,
  notesWords,
  personalityOf,
  TONE_PRESETS,
} from "./business-tab/how-it-answers";
export type { FallbacksWordsVM, InstructionsWordsVM, NotesWordsVM, Personality } from "./business-tab/how-it-answers";
export { closuresAheadWords, hoursZoneWords, openWeekWords } from "./business-tab/open-week";
export type { ClosuresAheadVM } from "./business-tab/open-week";
export {
  blockShareWords,
  PROMPT_NOW,
  PROMPT_READERS,
  promptCostWords,
  promptTotalWords,
} from "./business-tab/prompt-cost-words";
export {
  lengthWords,
  SERVICE_PRICE_EMPTY,
  serviceLineWords,
  servicesFoundWords,
  servicesToldWords,
  servicesWords,
  serviceUndoName,
} from "./business-tab/services-words";
export type { ServicesWordsVM, ServiceWordsInput } from "./business-tab/services-words";
export { SPEND_TRY, TRY_IT_MAX_CHARS, TRY_IT_MAX_EXCHANGES, TRY_IT_WORDS, tryItVM } from "./business-tab/try-it";
export type { TryItAnswer, TryItThen, TryItVM } from "./business-tab/try-it";
export {
  changedConfigFields,
  factConflicts,
  knownForwarding,
  resolveFacts,
  sameAddress,
  sameName,
  SOURCE_WORDS,
} from "./facts";
export type { ConflictSeverity, Fact, FactConflict, FactSource, KnownFacts, ResolvedFacts, TypedFacts } from "./facts";
export { firstReceptionistOf, googleFillsOf } from "./first-receptionist";
export type { FirstReceptionistKnown } from "./first-receptionist";
export { INTENT_LABELS } from "./intent-labels";
export { BUDGET_WORDS, budgetDial, tokenBudgetSpent, tokenCapOf, TOKENS_DAY_DEFAULT, tokensPerReply } from "./limits";
export type { BudgetDial } from "./limits";
export {
  cannotSendLink,
  NO_LINK_DETAILS,
  NO_WAY_TO_SEND_LINK,
  offersBookingLink,
  offersLinkOn,
  priceNextStep,
} from "./no-booking-link";
export {
  guardSpokenTurns,
  heldLine,
  namesMoney,
  priceBreach,
  priceFigures,
  replyWindow,
  spokenBreach,
  spokenBreachDetails,
  violatesNoPrices,
  WA_WINDOW_MS,
  waWindow,
} from "./policy/prices";
export type { HeldLineKind, SpokenBreach, SpokenGuardVerdict, SpokenRule, SpokenTurn, WaWindow } from "./policy/prices";
export {
  ANSWER_WITHIN_HOURS_DEFAULT,
  answerWithinHoursOf,
  answerWithinMsOf,
  CALL_HEARTBEAT_MS,
  hardLimitsWords,
  isLiveCall,
  MEMBER_REPLY_STALE_MS,
  PAUSE_HOURS_DEFAULT,
  pauseHoursOf,
  pauseMsOf,
  REPLY_CAP_DEFAULT,
  REPLY_DELAY_DEFAULT_MS,
  REPLY_DELAY_MAX_MS,
  REPLY_DELAY_MIN_MS,
  REPLY_LIMITS,
  REPLY_MAX_ANY,
  replyDelayMs,
  SEND_GRACE_MS,
  windowClockOf,
} from "./policy/reply-limits";
export { promptBlocks } from "./prompt-blocks";
export type { PromptBlockVM, PromptSource } from "./prompt-blocks";
export { roleAtLeast } from "./roles";
export {
  ALERT_ADDRESSES_MAX,
  ALERT_ADDRESSES_MIN,
  ALERT_REFUSED_WORDS,
  alertAddressesOf,
  memberGetsAlerts,
  withAlertAddress,
} from "./workspace-config/alerts";
export type { AlertRefusal } from "./workspace-config/alerts";
export { CONVERSATION_GAP_MS, CONVERSATION_UNDER_WAY, disclosureFacts } from "./workspace-config/assistant-disclosure";
export { isBaselinePrompt, newReceptionistDefaults } from "./workspace-config/brain-config";
export { BrainConfigSchema } from "./workspace-config/brain-config-schema";
export type { BrainConfig } from "./workspace-config/brain-config-schema";
export {
  BookingRulesSchema,
  BusinessProfileSchema,
  ClosureSchema,
  GuardrailsSchema,
  HoursSchema,
  IntervalSchema,
  NoteSchema,
  ServiceSchema,
  WALK_INS,
} from "./workspace-config/business-profile";
export type {
  BookingRules,
  BusinessProfile,
  Closure,
  Hours,
  Interval,
  Note,
  Service,
  WalkIns,
} from "./workspace-config/business-profile";
export {
  composeSystemPrompt,
  describeNow,
  noteAsTold,
  notesInForce,
  PROMPT_OPENINGS,
} from "./workspace-config/compose";
export type { PromptWire } from "./workspace-config/compose";
export {
  ASK_GOAL_MAX,
  DAY_NAMES,
  dayProblems,
  DAYS,
  GUARDRAIL_KEYS,
  guardrailsInForce,
  INSTRUCTIONS_MAX,
  isE164,
  isRealDate,
  MAX_CLOSURES,
  MAX_INTERVALS_PER_DAY,
  PROFILE_LIMITS,
  REACH_OUT_LIMITS,
  REPLY_OFFERS,
} from "./workspace-config/config-rules";
export { BOOKING_RULE_BOUNDS } from "./workspace-config/config-rules";
export type {
  BookingRuleKey,
  GuardrailKey,
  GuardrailsInForce,
  ProfileLimitKey,
  ReplyOffer,
} from "./workspace-config/config-rules";
export {
  applyReachOutChange,
  ASK_REACH_OUT_ROWS,
  describeReachOutChange,
  isReachOutChange,
} from "./workspace-config/reach-out-change";
export type { AskReachOutChange } from "./workspace-config/reach-out-change";
export {
  CalendarConfigSchema,
  configReceptionistOf,
  FeaturesConfigSchema,
  NotificationsConfigSchema,
  parseTenantConfig,
  parseTenantConfigResult,
  ReachOutConfigSchema,
  TenantConfigSchema,
  TenantConfigWriteSchema,
  withFirstAlertAddress,
  withOwnerAlertAddress,
  withStoredKeysKept,
} from "./workspace-config/config-schema";
export type {
  CalendarConfig,
  CalendarGrantConfig,
  FeaturesConfig,
  NotificationsConfig,
  ReachOutConfig,
  ReceptionistState,
  TenantConfig,
  TenantConfigParse,
} from "./workspace-config/config-schema";
export {
  EARLIER_FALLBACK_DEFAULTS,
  FALLBACK_DEFAULTS,
  FALLBACK_DETAILS,
  FALLBACK_ROWS,
  fallbackMessages,
  isProductFallback,
  unknownDetails,
} from "./workspace-config/fallbacks";
export type { FallbackDetail } from "./workspace-config/fallbacks";
export { offersAfterStart, offersFacts } from "./workspace-config/offers-ask";
export type { LeadChannel } from "./workspace-config/offers-ask";
export {
  bookingHeld,
  HELD_DRAFTS_DAYS,
  heldDraftsByClass,
  heldDraftsLine,
  POLICY_CLASS_MODES,
  POLICY_CLASS_WORDS,
  POLICY_CLASSES,
  POLICY_COVERS,
  POLICY_MODE_WORDS,
  POLICY_MODES,
  policyAskClass,
  policyClassLabel,
  policyClassOfIntent,
  policyClassQuestion,
  policyModeOffered,
  policyModeRefusal,
  policyRules,
} from "./workspace-config/policy-classes";
export type {
  HeldDraftsByIntent,
  HeldDraftsClass,
  HeldDraftsCount,
  PolicyClass,
  PolicyMode,
  PolicyRow,
} from "./workspace-config/policy-classes";
export { PolicyLimitsSchema } from "./workspace-config/policy-limits-schema";
export type { PolicyLimits } from "./workspace-config/policy-limits-schema";
export { allowedPrices, priceAllowance } from "./workspace-config/price-allowance";
export type { AllowedPrice } from "./workspace-config/price-allowance";
export { hoursRuns } from "./workspace-config/prompt-hours";
export type { HoursRun } from "./workspace-config/prompt-hours";
export {
  hasProfile,
  instructionsDraft,
  NO_FIELDS_COMPOSED_WORDS,
  ownWordsOf,
  resolveSystemPrompt,
  whoseWords,
} from "./workspace-config/resolve";
export type { WhoseWords } from "./workspace-config/resolve";
export { ROLE_PERMS, ROLE_SAYS, ROLES, roleSays, roleTable, TEAM_ROLES } from "./workspace-config/role-perms";
export type { Role, RoleSays, RoleTableRow } from "./workspace-config/role-perms";
