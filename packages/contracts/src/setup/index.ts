/** Setup and the first run: the rows, the steps, the check's chips, the connections, and the capabilities they unlock. */
export {
  lineStuckProvisioning,
  lineRetryRefusal,
  textingWords,
  setupPhoneWantOf,
  setupChoicesOf,
  forwardedLineOf,
  keptPhoneKind,
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
} from "./setup";
export {
  setupLaterOf,
  setupRestsOf,
  setupPutOffNext,
  putOffEnds,
  SETUP_REST_MS,
  TRY_SKIPPED,
  RECEPTIONIST_MET,
  CHANNELS_SEEN,
  REHEARSE_SKIPPED,
  GOOGLE_CONNECT_LATER,
  REMIND_SKIPPED,
  KEEP_ROW,
  SETUP_LATER_REFUSED,
} from "./setup-put-off";
/** The fold over the rows' table lives with the table (setup-rows.ts); the name is the one the page has always read. */
export { setupSteps } from "./setup-rows";
/** The kept number's row in Settings › How it answers, from Setup's own (setup-rows-phone.ts keepRow). */
export { keptNumberRowOf } from "./setup-rows-phone";
export type { KeptNumberRowVM } from "./setup-rows-phone";
export type {
  SetupDto,
  LineDto,
  SetupInputs,
  SetupState,
  SetupVerb,
  SetupRowVM,
  SetupVM,
  SetupRequestKind,
  SetupPhoneWant,
  SetupChoices,
  WhatsappChoice,
} from "./setup";
export type { SetupRests, SetupPutOff, SetupPutOffWhy, SetupPutOffChange } from "./setup-put-off";
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
  unsureHoursWords,
  firstRunKicker,
  firstRunOf,
  FIRST_RUN_ROUTE,
  firstRunStepRoute,
  FIRST_RUN_FIND_ROUTE,
  FIRST_RUN_STEPS,
  FIRST_RUN_WORDS,
} from "./first-run";
export { setupCardOf, SETUP_CARD_WORDS } from "./first-run-card";
export type { SetupCardVM, SetupCardRowVM, SetupCardWho } from "./first-run-card";
export { businessNameOf, receptionistCardOf, soundsWords } from "./first-run-receptionist";
export type { ReceptionistCardInputs, ReceptionistCardVM } from "./first-run-receptionist";
export { FIRST_RUN_HELPERS } from "./first-run-helpers";
export { firstRunChannelsOf, FIRST_RUN_CHANNELS_WORDS, lineLookupOf } from "./first-run-channels";
export type { ChannelsInput, FirstRunChannelsVM, LineLookupDto } from "./first-run-channels";
export { firstRunGoLiveOf, FIRST_RUN_GOLIVE_WORDS } from "./first-run-golive";
export type { FirstRunGoLiveVM, GoLiveInput, GoLiveItemVM, GoLiveStartVM } from "./first-run-golive";
export { FIRST_RUN_TITLE, FINISH_SETTING_UP, FIRST_RUN_LANDED_KEY, shouldLandOnFirstRun } from "./first-run-route";
export { firstRunStepOf } from "./first-run-route";
export type { FirstRunStepKey } from "./first-run-route";
export type { FirstRunStepState, FirstRunCheckVM, FirstRunStepVM, FirstRunVM, FirstRunWho } from "./first-run";
export { firstRunPhoneOf, FIRST_RUN_PHONE_WORDS } from "./first-run-phone";
export type {
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
export {
  CALENDAR_SETTING_ROUTE,
  bookingEmailsHeldWords,
  bookingEmailsStep,
  calendarSourceOf,
  calendarSourceFacts,
  forwardStillAsked,
  BOOKS_WITH_CALENDAR,
  BOOKS_BY_HAND,
  BOOKING_TOOL_WORDS,
  booksWithOptions,
  booksWithOf,
  booksWithName,
  calendarLinkShown,
  calendarLinkNote,
  BOOKED_NEEDS_A_LINK,
} from "./calendar-source";
export type {
  BookingEmailsFacts,
  BookingEmailsStep,
  CalendarSourceFacts,
  CalendarSourceState,
  CalendarSourceVM,
} from "./calendar-source";
