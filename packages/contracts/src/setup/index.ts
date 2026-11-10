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
export {
  INSTAGRAM_ACCOUNT_DOOR,
  META_CONNECTION_DOOR,
  WHATSAPP_CONNECT_DOOR,
  WHATSAPP_SIGNUP_CONFIG_DOOR,
  WHATSAPP_STANDING_DOOR,
} from "./edge-doors";
export { FIRST_RUN_CHANNELS_WORDS, firstRunChannelsOf, lineLookupOf } from "./first-run-channels";
export type { ChannelsInput, FirstRunChannelsVM, LineLookupDto } from "./first-run-channels";
export { FIRST_RUN_LIVE_WORDS, firstRunLiveOf, youAreLiveEmail } from "./first-run-live";
export type { FirstRunLiveInput, FirstRunLiveVM, YouAreLiveInput } from "./first-run-live";
export { firstRunPhoneOf } from "./first-run-phone/phone";
export type { FirstRunPhoneInput } from "./first-run-phone/steps";
export { FIRST_RUN_PHONE_WORDS } from "./first-run-phone/vm";
export type {
  FirstRunPhoneCodeVM,
  FirstRunPhoneQuestion,
  FirstRunPhoneStage,
  FirstRunPhoneVM,
  FirstRunPhoneWayVM,
} from "./first-run-phone/vm";
export { businessNameOf, receptionistCardOf, soundsWords } from "./first-run-receptionist";
export type { ReceptionistCardInputs, ReceptionistCardVM } from "./first-run-receptionist";
export { FINISH_SETTING_UP, FIRST_RUN_LANDED_KEY, FIRST_RUN_TITLE, shouldLandOnFirstRun } from "./first-run-route";
export { firstRunStepOf } from "./first-run-route";
export {
  FIND_PARAM,
  FIRST_RUN_FIND_ROUTE,
  FIRST_RUN_ROUTE,
  FIRST_RUN_STEP_KEYS,
  firstRunStepRoute,
} from "./first-run-route";
export type { FirstRunStepKey } from "./first-run-route";
export {
  BROKEN_CONFIG_WORDS,
  LINE_STEP_WORDS,
  lineRetryRefusal,
  lineStuckProvisioning,
  MOCK_TEXTING_SENTENCE,
  PROVISIONING_DEADLINE_MS,
  SETUP_REQUEST_KINDS,
  SETUP_STATE_WORDS,
  SOLE_PROP_CEILING_SENTENCE,
  SOLE_PROP_TEXTING_SENTENCE,
  TEXTING_NEEDS_RECORD_CLAUSE,
  TEXTING_NEEDS_RECORD_SENTENCE,
  textingWords,
} from "./lines";
export type {
  LineDto,
  SetupDto,
  SetupRequestKind,
  SetupRowVM,
  SetupState,
  SetupVerb,
  SetupWorkspaceChoicesDto,
} from "./lines";
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
  WORKSPACE_MARKS,
} from "./put-off";
export { FORWARDING_WAIT_WORDS } from "./put-off";
export type { SetupPutOff, SetupPutOffChange, SetupPutOffWhy, SetupRests } from "./put-off";
/** The kept number's row in Settings › How it answers, from Setup's own (setup/rows-phone.ts keepRow). */
export { keptNumberRowOf } from "./rows-phone";
export { ownLineStandOf } from "./rows-phone";
export type { KeptNumberRowVM } from "./rows-phone";
/** The fold over the rows' table lives with the table (setup/rows/steps.ts); the name is the one the page has always read. */
export { setupSteps } from "./rows/steps";
export {
  callsNotByPhone,
  forwardedLineOf,
  keptPhoneKind,
  LINE_CREDENTIALS_SENTENCE,
  lineCredentialFailure,
  setupChoicesOf,
  setupPhoneWantOf,
  withWorkspaceChoices,
} from "./setup";
export type { SetupChoices, SetupInputs, SetupPhoneWant, SetupVM, WhatsappChoice } from "./setup";
