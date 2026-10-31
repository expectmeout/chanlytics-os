/** Setup and the first run: the rows, the steps, the check's chips, the connections, and the capabilities they unlock. */
export {
  BOOKED_NEEDS_A_LINK,
  BOOKING_TOOL_WORDS,
  bookingEmailsHeldWords,
  bookingEmailsStep,
  BOOKS_BY_HAND,
  BOOKS_WITH_CALENDAR,
  booksWithName,
  booksWithOf,
  booksWithOptions,
  CALENDAR_SETTING_ROUTE,
  calendarLinkNote,
  calendarLinkShown,
  calendarSourceFacts,
  calendarSourceOf,
  forwardStillAsked,
} from "./calendar-source";
export type {
  BookingEmailsFacts,
  BookingEmailsStep,
  CalendarSourceFacts,
  CalendarSourceState,
  CalendarSourceVM,
} from "./calendar-source";
export { CAPABILITY_KINDS, capabilityStatus } from "./capabilities";
export type {
  ActivationRecord,
  CapabilityBlocker,
  CapabilityInputs,
  CapabilityKind,
  CapabilityStatus,
} from "./capabilities";
export { checkChipsOf, SERVICE_SUGGESTION_TYPES, serviceSuggestionsOf } from "./check-chips";
export type { CheckChipSetVM, CheckChipsVM, CheckChipVM } from "./check-chips";
export { CONNECTION_GROUP_WORDS, CONNECTION_KINDS, connectionRows, smsStateRow } from "./connections";
export type {
  ConnectionGroup,
  ConnectionInputs,
  ConnectionKind,
  ConnectionRow,
  ConnectionState,
  ConnectionTone,
  ConnectionVerb,
  ConnectionWho,
} from "./connections";
export {
  FIRST_RUN_FIND_ROUTE,
  FIRST_RUN_ROUTE,
  FIRST_RUN_STEPS,
  FIRST_RUN_WORDS,
  firstRunKicker,
  firstRunOf,
  firstRunStepRoute,
  unsureHoursWords,
} from "./first-run";
export type { FirstRunCheckVM, FirstRunStepState, FirstRunStepVM, FirstRunVM, FirstRunWho } from "./first-run";
export { SETUP_CARD_WORDS, setupCardOf } from "./first-run-card";
export type { SetupCardPutOff, SetupCardRowVM, SetupCardVM, SetupCardWho } from "./first-run-card";
export { FIRST_RUN_CHANNELS_WORDS, firstRunChannelsOf, lineLookupOf } from "./first-run-channels";
export type { ChannelsInput, FirstRunChannelsVM, LineLookupDto } from "./first-run-channels";
export { FIRST_RUN_GOLIVE_WORDS, firstRunGoLiveOf } from "./first-run-golive";
export type { FirstRunGoLiveVM, GoLiveInput, GoLiveItemVM, GoLiveStartVM } from "./first-run-golive";
export { FIRST_RUN_HELPERS } from "./first-run-helpers";
export { FIRST_RUN_LIVE_WORDS, firstRunLiveOf, youAreLiveEmail } from "./first-run-live";
export type { FirstRunLiveInput, FirstRunLiveVM, YouAreLiveInput } from "./first-run-live";
export { FIRST_RUN_PHONE_WORDS, firstRunPhoneOf } from "./first-run-phone";
export type {
  FirstRunPhoneCodeVM,
  FirstRunPhoneInput,
  FirstRunPhoneQuestion,
  FirstRunPhoneStage,
  FirstRunPhoneVM,
  FirstRunPhoneWayVM,
} from "./first-run-phone";
export { businessNameOf, receptionistCardOf, soundsWords } from "./first-run-receptionist";
export type { ReceptionistCardInputs, ReceptionistCardVM } from "./first-run-receptionist";
export { FINISH_SETTING_UP, FIRST_RUN_LANDED_KEY, FIRST_RUN_TITLE, shouldLandOnFirstRun } from "./first-run-route";
export { firstRunStepOf } from "./first-run-route";
export type { FirstRunStepKey } from "./first-run-route";
export { FIRST_RUN_TRY_WORDS, firstRunTryOf, TRY_QUIET_AFTER_MS } from "./first-run-try";
export type { FirstRunTryInput, FirstRunTryStage, FirstRunTryVM, TryTransferKey } from "./first-run-try";
export {
  BROKEN_CONFIG_WORDS,
  forwardedLineOf,
  keptPhoneKind,
  LINE_CREDENTIALS_SENTENCE,
  LINE_STEP_WORDS,
  lineCredentialFailure,
  lineRetryRefusal,
  lineStuckProvisioning,
  MOCK_TEXTING_SENTENCE,
  PROVISIONING_DEADLINE_MS,
  SETUP_REQUEST_KINDS,
  SETUP_STATE_WORDS,
  setupChoicesOf,
  setupPhoneWantOf,
  SOLE_PROP_CEILING_SENTENCE,
  SOLE_PROP_TEXTING_SENTENCE,
  TEXTING_NEEDS_RECORD_CLAUSE,
  TEXTING_NEEDS_RECORD_SENTENCE,
  textingWords,
} from "./setup";
export type {
  LineDto,
  SetupChoices,
  SetupDto,
  SetupInputs,
  SetupPhoneWant,
  SetupRequestKind,
  SetupRowVM,
  SetupState,
  SetupVerb,
  SetupVM,
  WhatsappChoice,
} from "./setup";
export {
  CHANNELS_SEEN,
  GOOGLE_CONNECT_LATER,
  KEEP_ROW,
  putOffEnds,
  RECEPTIONIST_MET,
  REHEARSE_SKIPPED,
  REMIND_SKIPPED,
  restEndsDay,
  SETUP_LATER_REFUSED,
  SETUP_REST_MS,
  setupLaterOf,
  setupPutOffNext,
  setupRestsOf,
  TRY_SKIPPED,
} from "./setup-put-off";
export type { SetupPutOff, SetupPutOffChange, SetupPutOffWhy, SetupRests } from "./setup-put-off";
/** The fold over the rows' table lives with the table (setup-rows.ts); the name is the one the page has always read. */
export { setupSteps } from "./setup-rows";
/** The kept number's row in Settings › How it answers, from Setup's own (setup-rows-phone.ts keepRow). */
export { keptNumberRowOf } from "./setup-rows-phone";
export type { KeptNumberRowVM } from "./setup-rows-phone";
