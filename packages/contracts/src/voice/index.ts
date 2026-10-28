/** The phone receptionist: calls right now, the whisper, the greeting, a call's outcome in words, and forwarding. */
export {
  CALL_OUTCOME_WORDS,
  CALL_OUTCOMES,
  callNoteLines,
  callNotesOf,
  callOutcomeOf,
  callOutcomeWords,
  callTodoWords,
  tidyCallSummary,
} from "./call-words";
export type { CallNotes, CallOutcome } from "./call-words";
export {
  CARRIER_WORDS,
  CARRIERS,
  divertedNumbers,
  FORWARDING_MODE_WORDS,
  FORWARDING_MODES,
  FORWARDING_TEST_WINDOW_MS,
  forwardingCarrierOf,
  forwardingCodes,
  forwardingDialLabel,
  forwardingMatch,
  forwardingProof,
  forwardingTestOpen,
  isCarrier,
  isForwardingMode,
  PHONE_RINGS,
  PHONE_WAYS,
  telHref,
} from "./forwarding";
export type {
  Carrier,
  ForwardingCode,
  ForwardingCodes,
  ForwardingFacts,
  ForwardingMode,
  ForwardingProof,
  PhoneChoice,
  PhoneCompany,
  PhonePick,
  PhoneRings,
  PhoneWay,
} from "./forwarding";
export { GREETING_DEFAULT, greetingFor, pausedGreetingFor } from "./greeting";
export {
  deniesAutomated,
  GREETING_TEMPLATE,
  greetingNotes,
  greetingOf,
  spokenNameOf,
  statesAutomated,
} from "./greeting-owner";
export type { GreetingNote, GreetingNoteKey, GreetingSource } from "./greeting-owner";
export {
  ANALYSIS_GRACE_MS,
  callsStillUp,
  fmtClock,
  LIVE_OVERLONG_MS,
  LIVE_STALE_MS,
  liveBar,
  liveStillUp,
  missedCallIsNews,
  RECENT_MAX,
  toLiveCallVM,
  toLiveVM,
} from "./live";
export type { LiveBarCall, LiveBarVM, LiveCallVM, LiveLineVM, LiveTurnVM, LiveVM } from "./live";
export { PHONE_PACE_WORDS, PHONE_PACES, phonePaceOf, phonePaceShown, phonePaceSpeed } from "./phone-pace";
export type { PhonePace } from "./phone-pace";
export {
  PHONE_VOICE_DEFAULT,
  PHONE_VOICE_SAMPLES_ORIGIN,
  PHONE_VOICE_WORDS,
  PHONE_VOICES,
  PHONE_VOICES_NATIVE_TO,
  phoneVoiceOf,
  phoneVoiceShown,
} from "./phone-voices";
export type { PhoneVoice } from "./phone-voices";
export { frameGuardrail, frameHandOver, frameSteer, frameWhisper, injectedTurn, whisperText } from "./whisper";
