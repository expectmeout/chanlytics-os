/** The workspace's config and the receptionist it composes: the schemas, the policy, the structured answer, the Business tab. */
export {
  violatesNoPrices,
  namesMoney,
  heldLine,
  HELD_LINE_KINDS,
  spokenBreach,
  spokenBreachDetails,
  guardSpokenTurns,
  waWindow,
  replyWindow,
  isLiveCall,
  hardLimitsWords,
  replyDelayMs,
  WA_WINDOW_MS,
  REPLY_LIMITS,
  REPLY_MAX_ANY,
  CALL_HEARTBEAT_MS,
  REPLY_DELAY_DEFAULT_MS,
  REPLY_DELAY_MIN_MS,
  REPLY_DELAY_MAX_MS,
  REPLY_CAP_DEFAULT,
  PAUSE_HOURS_DEFAULT,
  pauseHoursOf,
  pauseMsOf,
} from "./policy";
export type { SpokenRule, SpokenBreach, SpokenTurn, SpokenGuardVerdict, WaWindow, HeldLineKind } from "./policy";
export { ROLES, ROLE_PERMS, TEAM_ROLES } from "./workspace-config/role-perms";
export type { Role } from "./workspace-config/role-perms";
export {
  policyClassOfIntent,
  policyClassLabel,
  policyClassQuestion,
  POLICY_CLASS_NONE,
  policyAskClass,
  bookingHeld,
  policyRules,
  POLICY_CLASSES,
  POLICY_CLASS_WORDS,
  POLICY_MODES,
  POLICY_MODE_WORDS,
  POLICY_CLASS_MODES,
  policyModeOffered,
  policyModeRefusal,
  PolicyLimitsSchema,
} from "./workspace-config/policy-classes";
export type { PolicyClass, PolicyMode, PolicyLimits, PolicyRow } from "./workspace-config/policy-classes";
export { tokenCapOf, tokenBudgetSpent, TOKENS_DAY_DEFAULT } from "./limits";
export {
  guardrailsInForce,
  IntervalSchema,
  HoursSchema,
  ClosureSchema,
  DAYS,
  ServiceSchema,
  GuardrailsSchema,
  NoteSchema,
  BookingRulesSchema,
  E164,
  isE164,
  INSTRUCTIONS_MAX,
  BusinessProfileSchema,
} from "./workspace-config/business-profile";
export type {
  GuardrailsInForce,
  Note,
  BookingRules,
  BusinessProfile,
  Hours,
  Service,
  Interval,
  Closure,
} from "./workspace-config/business-profile";
export { newReceptionistDefaults, isBaselinePrompt, BrainConfigSchema } from "./workspace-config/brain-config";
export type { BrainConfig } from "./workspace-config/brain-config";
export {
  isRealDate,
  dayProblems,
  parseTenantConfigResult,
  receptionistOf,
  parseTenantConfig,
  withFirstAlertAddress,
  withStoredKeysKept,
  NotificationsConfigSchema,
  CalendarConfigSchema,
  FeaturesConfigSchema,
  TenantConfigSchema,
  MAX_INTERVALS_PER_DAY,
  MAX_CLOSURES,
  DAY_NAMES,
  TenantConfigWriteSchema,
} from "./workspace-config/config-schema";
export type {
  NotificationsConfig,
  CalendarConfig,
  FeaturesConfig,
  TenantConfig,
  TenantConfigParse,
  ReceptionistState,
} from "./workspace-config/config-schema";
export { hoursRuns } from "./workspace-config/prompt-hours";
export type { HoursRun } from "./workspace-config/prompt-hours";
export { describeNow, composeSystemPrompt, PROMPT_OPENINGS } from "./workspace-config/compose";
export {
  instructionsDraft,
  hasProfile,
  resolveSystemPrompt,
  ownWordsOf,
  whoseWords,
  NO_FIELDS_COMPOSED_WORDS,
} from "./workspace-config/resolve";
export type { WhoseWords } from "./workspace-config/resolve";
export {
  isProductFallback,
  fallbackMessages,
  unknownDetails,
  FALLBACK_DETAILS,
  FALLBACK_DEFAULTS,
  EARLIER_FALLBACK_DEFAULTS,
} from "./workspace-config/fallbacks";
export type { FallbackDetail } from "./workspace-config/fallbacks";
export {
  ruleStrength,
  rulesKept,
  rulesWithoutFieldsWords,
  GUARDRAIL_KEYS,
  ABILITY_CHANNEL_WORDS,
  VISION_STRENGTH,
  RULES_AT_REST_WORDS,
  RULES_WITHOUT_FIELDS_WORDS,
} from "./business-tab/rule-strengths";
export type { GuardrailKey, RuleStrength, RuleStrengthVM, RulesKeptInputs } from "./business-tab/rule-strengths";
export { bookingLinkRowWords, businessGap } from "./business-tab/business-gap";
export type { StandingInputs, BusinessGap } from "./business-tab/business-gap";
export { openWeekWords, hoursZoneWords, closuresAheadWords } from "./business-tab/open-week";
export type { ClosuresAheadVM } from "./business-tab/open-week";
export { chipsMoreWords, CHIPS_SHOWN } from "./business-tab/counts";
export {
  servicesWords,
  servicesToldWords,
  serviceUndoName,
  servicesFoundWords,
  servicesSaveWords,
} from "./business-tab/services-words";
export type { ServiceWordsInput, ServicesWordsVM } from "./business-tab/services-words";
export {
  blockShareWords,
  promptCostWords,
  promptTotalWords,
  PROMPT_READERS,
  PROMPT_NOW,
} from "./business-tab/prompt-cost-words";
export { bookingRulesWords, bookingRuleRefusal, BOOKING_RULE_HINTS } from "./business-tab/booking-rules-words";
export type { BookingRulesWordsInput, BookingRulesWordsVM, BookingRuleKey } from "./business-tab/booking-rules-words";
export { profileRefusal, writtenOutDetail, PROFILE_CROSSING_WORDS, PROFILE_LIMITS } from "./business-tab/fold-limits";
export type { ProfileCrossing, ProfileLimitKey, ProfileRefusalKey } from "./business-tab/fold-limits";
export {
  notesWords,
  instructionsWords,
  fallbacksWords,
  COMMON_LANGUAGES,
  TONE_PRESETS,
} from "./business-tab/how-it-answers";
export type { NotesWordsVM, InstructionsWordsVM, FallbacksWordsVM } from "./business-tab/how-it-answers";
export { handoffChatWords, handoffCallWords, handoffWords } from "./business-tab/handoff-words";
export type { HandoffWordsVM } from "./business-tab/handoff-words";
export { abilityRows, cannotRows } from "./business-tab/abilities";
export type { AbilityInputs, AbilityRowVM, AbilitiesVM, CannotRowVM } from "./business-tab/abilities";
export { offersBookingLink, priceNextStep, NO_LINK_DETAILS } from "./no-booking-link";
export {
  parseBrainOutput,
  brainMetaOf,
  replyWhy,
  BRAIN_INTENTS,
  INTENT_LABELS,
  BRAIN_LANGUAGES,
  BRAIN_OUTPUT_JSON_SCHEMA,
  BrainOutputSchema,
  CONFIDENCE_STEPS,
} from "./brain";
export type { BrainIntent, BrainOutput, BrainMeta, BrainStamp, ReplyWhyVM } from "./brain";
export {
  knownForwarding,
  sameAddress,
  sameName,
  resolveFacts,
  factConflicts,
  changedConfigFields,
  SOURCE_WORDS,
} from "./facts";
export type { FactSource, Fact, KnownFacts, TypedFacts, ResolvedFacts, ConflictSeverity, FactConflict } from "./facts";
export { promptBlocks } from "./prompt-blocks";
export type { PromptBlockVM, PromptSource } from "./prompt-blocks";
export { firstReceptionistOf, googleFillsOf } from "./first-receptionist";
export type { FirstReceptionistKnown } from "./first-receptionist";
export { roleAtLeast } from "./roles";
