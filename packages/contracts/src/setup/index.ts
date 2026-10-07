/** Setup and the first run: the rows, the steps, the check's chips, the connections, and the capabilities they unlock. */
export {
  lineStuckProvisioning,
  lineRetryRefusal,
  textingWords,
  setupLaterOf,
  forwardedLineOf,
  PROVISIONING_DEADLINE_MS,
  lineCredentialFailure,
  LINE_CREDENTIALS_SENTENCE,
  LINE_STEP_WORDS,
  SETUP_STATE_WORDS,
  SOLE_PROP_CEILING_SENTENCE,
  SOLE_PROP_TEXTING_SENTENCE,
  MOCK_TEXTING_SENTENCE,
  TEXTING_NEEDS_RECORD_SENTENCE,
  TEXTING_NEEDS_RECORD_CLAUSE,
  BROKEN_CONFIG_WORDS,
  SETUP_REQUEST_KINDS,
  TRY_SKIPPED,
  SETUP_LATER_REFUSED,
} from "./setup";
/** The fold over the rows' table lives with the table (setup-rows.ts); the name is the one the page has always read. */
export { setupSteps } from "./setup-rows";
export type {
  SetupDto,
  LineDto,
  SetupInputs,
  SetupState,
  SetupVerb,
  SetupRowVM,
  SetupVM,
  SetupRequestKind,
} from "./setup";
export { capabilityStatus, CAPABILITY_KINDS } from "./capabilities";
export type {
  CapabilityKind,
  ActivationRecord,
  CapabilityBlocker,
  CapabilityStatus,
  CapabilityInputs,
} from "./capabilities";
export {
  googleAudienceWords,
  smsStateRow,
  connectionRows,
  CONNECTION_KINDS,
  CONNECTION_GROUP_WORDS,
} from "./connections";
export type {
  ConnectionKind,
  ConnectionGroup,
  ConnectionState,
  ConnectionTone,
  ConnectionWho,
  ConnectionVerb,
  ConnectionRow,
  ConnectionInputs,
} from "./connections";
export {
  businessNameOf,
  unsureHoursWords,
  firstRunStepOf,
  firstRunKicker,
  firstRunOf,
  setupCardOf,
  receptionistCardOf,
  shouldLandOnFirstRun,
  FIRST_RUN_ROUTE,
  firstRunStepRoute,
  FIRST_RUN_FIND_ROUTE,
  FIRST_RUN_LANDED_KEY,
  FINISH_SETTING_UP,
  FIRST_RUN_STEPS,
  SETUP_CARD_ORDER,
  FIRST_RUN_WORDS,
  FIRST_RUN_HELPERS,
} from "./first-run";
export type {
  FirstRunStepKey,
  FirstRunStepState,
  FirstRunCheckVM,
  FirstRunStepVM,
  FirstRunVM,
  FirstRunWho,
  SetupCardVM,
  ReceptionistCardInputs,
  ReceptionistCardVM,
} from "./first-run";
export {
  forwardingCarrierOf,
  areaCodeOf,
  firstRunPhoneOf,
  PHONE_WAYS,
  PHONE_RINGS,
  FIRST_RUN_PHONE_WORDS,
} from "./first-run-phone";
export type {
  PhoneWay,
  PhonePick,
  PhoneRings,
  PhoneChoice,
  PhoneCompany,
  FirstRunPhoneStage,
  FirstRunPhoneQuestion,
  FirstRunPhoneCodeVM,
  FirstRunPhoneWayVM,
  FirstRunPhoneVM,
  FirstRunPhoneInput,
} from "./first-run-phone";
export { firstRunTryOf, TRY_QUIET_AFTER_MS, FIRST_RUN_TRY_WORDS } from "./first-run-try";
export type { FirstRunTryStage, TryTransferKey, FirstRunTryVM, FirstRunTryInput } from "./first-run-try";
export { firstRunLiveOf, youAreLiveEmail, FIRST_RUN_LIVE_WORDS } from "./first-run-live";
export type { FirstRunLiveVM, FirstRunLiveInput, YouAreLiveInput } from "./first-run-live";
export { serviceSuggestionsOf, checkChipsOf, SERVICE_SUGGESTION_TYPES } from "./check-chips";
export type { CheckChipVM, CheckChipSetVM, CheckChipsVM } from "./check-chips";
