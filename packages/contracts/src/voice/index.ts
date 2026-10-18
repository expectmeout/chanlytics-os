/** The phone receptionist: calls right now, the whisper, the greeting, a call's outcome in words, and forwarding. */
export { frameWhisper, frameGuardrail, frameSteer, whisperText, frameHandOver, injectedTurn } from "./whisper";
export {
  callOutcomeOf,
  callOutcomeWords,
  callNoteLines,
  callNotesOf,
  callTodoWords,
  tidyCallSummary,
  CALL_OUTCOMES,
  CALL_OUTCOME_WORDS,
} from "./call-words";
export type { CallNotes, CallOutcome } from "./call-words";
export {
  fmtClock,
  liveStillUp,
  callsStillUp,
  liveBar,
  toLiveCallVM,
  toLiveVM,
  missedCallIsNews,
  LIVE_STALE_MS,
  LIVE_OVERLONG_MS,
  ANALYSIS_GRACE_MS,
  RECENT_MAX,
} from "./live";
export type { LiveTurnVM, LiveCallVM, LiveLineVM, LiveVM, LiveBarVM } from "./live";
export {
  telHref,
  forwardingDialLabel,
  forwardingCodes,
  forwardingMatch,
  divertedNumbers,
  forwardingProof,
  forwardingTestOpen,
  CARRIERS,
  FORWARDING_MODES,
  CARRIER_WORDS,
  FORWARDING_MODE_WORDS,
  FORWARDING_TEST_WINDOW_MS,
  isCarrier,
  isForwardingMode,
} from "./forwarding";
export type {
  Carrier,
  ForwardingMode,
  ForwardingCode,
  ForwardingCodes,
  ForwardingFacts,
  ForwardingProof,
} from "./forwarding";
export { greetingFor, pausedGreetingFor, GREETING_DEFAULT } from "./greeting";
export {
  PHONE_VOICES,
  PHONE_VOICE_DEFAULT,
  PHONE_VOICE_SAMPLES_ORIGIN,
  PHONE_VOICE_WORDS,
  phoneVoiceOf,
  phoneVoiceShown,
} from "./phone-voices";
export type { PhoneVoice } from "./phone-voices";
export {
  greetingOf,
  greetingNotes,
  statesAutomated,
  deniesAutomated,
  spokenNameOf,
  GREETING_TEMPLATE,
} from "./greeting-owner";
export type { GreetingSource, GreetingNote, GreetingNoteKey } from "./greeting-owner";
