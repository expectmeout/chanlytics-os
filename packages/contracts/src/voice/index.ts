/** The phone receptionist: calls right now, the whisper, the greeting, a call's outcome in words, and forwarding. */
export { frameWhisper, frameGuardrail, frameSteer, whisperText, frameHandOver, injectedTurn } from "./whisper";
export { callOutcomeOf, callOutcomeWords, tidyCallSummary, CALL_OUTCOMES, CALL_OUTCOME_WORDS } from "./call-words";
export type { CallOutcome } from "./call-words";
export {
  fmtClock,
  liveStillUp,
  liveBar,
  toLiveCallVM,
  toLiveVM,
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
