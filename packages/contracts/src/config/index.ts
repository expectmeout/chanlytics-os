/** The workspace's config and the receptionist it composes: the schemas, the policy, the structured answer, the Business tab. */
export {
  violatesNoPrices,
  priceFigures,
  priceBreach,
  namesMoney,
  heldLine,
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
export { ROLES, ROLE_PERMS, ROLE_SAYS, TEAM_ROLES, roleSays, roleTable } from "./workspace-config/role-perms";
export type { Role, RoleSays, RoleTableRow } from "./workspace-config/role-perms";
export {
  ALERT_ADDRESSES_MAX,
  ALERT_ADDRESSES_MIN,
  ALERT_REFUSED_WORDS,
  alertAddressesOf,
  memberGetsAlerts,
  withAlertAddress,
} from "./workspace-config/alerts";
export type { AlertRefusal } from "./workspace-config/alerts";
export {
  policyClassOfIntent,
  policyClassLabel,
  policyClassQuestion,
  policyAskClass,
  bookingHeld,
  policyRules,
  POLICY_CLASSES,
  POLICY_CLASS_WORDS,
  POLICY_COVERS,
  POLICY_MODES,
  POLICY_MODE_WORDS,
  POLICY_CLASS_MODES,
  policyModeOffered,
  policyModeRefusal,
  heldDraftsByClass,
  heldDraftsLine,
  HELD_DRAFTS_DAYS,
} from "./workspace-config/policy-classes";
export { PolicyLimitsSchema } from "./workspace-config/policy-limits-schema";
export type {
  PolicyClass,
  PolicyMode,
  PolicyRow,
  HeldDraftsByIntent,
  HeldDraftsCount,
  HeldDraftsClass,
} from "./workspace-config/policy-classes";
export type { PolicyLimits } from "./workspace-config/policy-limits-schema";
export { tokenCapOf, tokenBudgetSpent, TOKENS_DAY_DEFAULT } from "./limits";
export {
  DAYS,
  DAY_NAMES,
  isRealDate,
  dayProblems,
  MAX_INTERVALS_PER_DAY,
  MAX_CLOSURES,
  E164,
  isE164,
  INSTRUCTIONS_MAX,
  PROFILE_LIMITS,
  GUARDRAIL_KEYS,
  guardrailsInForce,
} from "./workspace-config/config-rules";
export type { ProfileLimitKey, BookingRuleKey, GuardrailKey, GuardrailsInForce } from "./workspace-config/config-rules";
export {
  IntervalSchema,
  HoursSchema,
  ClosureSchema,
  ServiceSchema,
  GuardrailsSchema,
  NoteSchema,
  BookingRulesSchema,
  BusinessProfileSchema,
} from "./workspace-config/business-profile";
export type {
  Note,
  BookingRules,
  BusinessProfile,
  Hours,
  Service,
  Interval,
  Closure,
} from "./workspace-config/business-profile";
export { newReceptionistDefaults, isBaselinePrompt } from "./workspace-config/brain-config";
export { BrainConfigSchema } from "./workspace-config/brain-config-schema";
export type { BrainConfig } from "./workspace-config/brain-config-schema";
export {
  parseTenantConfigResult,
  receptionistOf,
  parseTenantConfig,
  withFirstAlertAddress,
  withStoredKeysKept,
  NotificationsConfigSchema,
  CalendarConfigSchema,
  FeaturesConfigSchema,
  ASK_GOAL_MAX,
  TenantConfigSchema,
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
export {
  describeNow,
  composeSystemPrompt,
  PROMPT_OPENINGS,
  notesInForce,
  noteAsTold,
} from "./workspace-config/compose";
export { offersAfterStart, offersFacts } from "./workspace-config/offers-ask";
export { allowedPrices, priceAllowance } from "./workspace-config/price-allowance";
export type { AllowedPrice } from "./workspace-config/price-allowance";
export { disclosureFacts, CONVERSATION_UNDER_WAY, CONVERSATION_GAP_MS } from "./workspace-config/assistant-disclosure";
export type { LeadChannel } from "./workspace-config/offers-ask";
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
  ABILITY_CHANNEL_WORDS,
  VISION_STRENGTH,
  RULES_AT_REST_WORDS,
  RULES_WITHOUT_FIELDS_WORDS,
  ALWAYS_TOLD,
  pricesWrittenWords,
} from "./business-tab/rule-strengths";
export type { RuleStrength, RuleStrengthVM, RulesKeptInputs } from "./business-tab/rule-strengths";
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
  serviceLineWords,
  lengthWords,
  SERVICE_PRICE_EMPTY,
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
export type { BookingRulesWordsInput, BookingRulesWordsVM } from "./business-tab/booking-rules-words";
export { profileRefusal, writtenOutDetail, PROFILE_CROSSING_WORDS } from "./business-tab/fold-limits";
export type { ProfileCrossing, ProfileRefusalKey } from "./business-tab/fold-limits";
export {
  notesWords,
  noteEndedWords,
  instructionsWords,
  fallbacksWords,
  COMMON_LANGUAGES,
  TONE_PRESETS,
} from "./business-tab/how-it-answers";
export type { NotesWordsVM, InstructionsWordsVM, FallbacksWordsVM } from "./business-tab/how-it-answers";
export { TRY_IT_WORDS, TRY_IT_MAX_CHARS, TRY_IT_MAX_EXCHANGES, SPEND_TRY, tryItVM } from "./business-tab/try-it";
export type { TryItAnswer, TryItThen, TryItVM } from "./business-tab/try-it";
export {
  handoffChatWords,
  handoffChatRow,
  handoffCallRow,
  HANDOFF_ANYWAY,
  handoffWords,
  type HandoffRowVM,
  type HandoffCallRowVM,
} from "./business-tab/handoff-words";
export type { HandoffWordsVM } from "./business-tab/handoff-words";
export { abilityRows, cannotFoldWords, cannotRows } from "./business-tab/abilities";
export type { AbilityInputs, AbilityRowVM, AbilitiesVM, CannotRowVM } from "./business-tab/abilities";
export {
  offersBookingLink,
  offersLinkOn,
  priceNextStep,
  NO_LINK_DETAILS,
  NO_WAY_TO_SEND_LINK,
} from "./no-booking-link";
export {
  brainMetaOf,
  replyWhy,
  BRAIN_INTENTS,
  BRAIN_LANGUAGES,
  BRAIN_OUTPUT_JSON_SCHEMA,
  brainOutputSchemaFor,
  CONFIDENCE_STEPS,
} from "./brain";
export { INTENT_LABELS } from "./intent-labels";
export { parseBrainOutput, BrainOutputSchema } from "./brain-schema";
export type { BrainIntent, BrainMeta, BrainStamp, ReplyWhyVM } from "./brain";
export type { BrainOutput } from "./brain-schema";
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
