/** Ask, the workspace assistant: its limits, the answer as the Line draws it, the model it runs on and a turn's shape. */
export {
  scopeFromRoute,
  ASK_MAX_CHARS,
  ASK_MAX_ROUNDS,
  ASK_TURN_BUDGET_MS,
  ASK_TOOLS_CHARS_CEILING,
  ASK_VOICE_CLAIM_STALE_MS,
  ASK_VOICE_FIRST_WORDS_MS,
  ASK_VOICE_PULSE_MS,
  ASK_VOICE_TOKEN_MIN_MS,
  ASK_VOICE_ID,
  ASK_VOICE_MODEL,
  ASK_SPEECH_MAX_CHARS,
  SPEECH_PURPOSES,
  ASK_VOICE_TIMING_MAX_MS,
  ASK_VOICE_IDLE_MS,
  ASK_VOICE_UP_WAIT_MS,
  VOICE_END_REASONS,
  isVoiceEndReason,
  ASK_MAX_TOKENS,
  ASK_WARM_MAX_TOKENS,
  ASK_TOKENS_DAY,
  ASK_CAPS,
  ASK_THREAD_VERBS,
  ASK_UNDO_MS,
  askCardLapsed,
  ASK_SURFACES,
  ASK_SCOPE_KINDS,
} from "./ask";
export type { SpeechPurpose, VoiceEndReason } from "./ask";
export { AskProposalOutcomeSchema } from "./ask-schemas";
export type {
  AskRole,
  AskThreadVerb,
  AskProposal,
  AskPlanStamp,
  AskProposalOutcome,
  AskMessageVM,
  AskThreadVM,
  AskScope,
  AskSurface,
  MessageRead,
} from "./ask";
export { detectLanguage, ASK_LANGUAGES } from "./ask-language";
export type { AskLanguage } from "./ask-language";
export {
  cleanAnswer,
  isUngrounded,
  sameQuestion,
  navigateLabel,
  FOLLOWUP_ECHO,
  claimsWrite,
  unquoted,
} from "./answer-text";
export { askJump, askPages, ASK_PAGES } from "./ask-jump";
export type { JumpEntry } from "./ask-jump";
export { buildAskSuggestions } from "./ask-suggestions";
export type { AskSuggestion, SuggestionInput } from "./ask-suggestions";
export { dayFromQuestion, askIntent, callsToday } from "./ask-fast-paths";
export type { FastCall, AskIntent } from "./ask-fast-paths";
export { callJumpSub, askCallOutcome } from "./ask-calls";
export { applySettingsChange, describeSettingsChange } from "./ask-settings-change";
export { AskSettingsChangeSchema } from "./ask-schemas";
export type { AskSettingsChange } from "./ask-settings-change";
export {
  emptyReadSet,
  noteRows,
  groundCitations,
  citationRoute,
  ASK_CITATION_KINDS,
  ASK_PAGE_ROUTES,
  ASK_ROW_WORDS,
} from "./citations";
export type { AskCitationKind, AskCitation, AskReadSet, AskRowRef } from "./citations";
export { cacheHitOf } from "./ask-shape";
export type { AskTurnShape, AskTurnTokens } from "./ask-shape";
export { askModelProfile, ASK_EFFORT, ASK_MODEL } from "./ask-model";
export type { AskModelProfile } from "./ask-model";
export {
  answerText,
  cardOpenRoute,
  oneDoor,
  answerFromV1,
  rightNowLine,
  rightNowCounts,
  needsAnswer,
  callsAnswer,
  openingsAnswer,
  normalizeAnswer,
  answerWords,
  partialSay,
  answerForCards,
  failedAnswer,
  proseAnswer,
  v1FromAnswer,
  clip,
  ASK_ANSWER_CAPS,
} from "./ask-answer";
export type {
  AskSource,
  AskFigure,
  AskItem,
  AskBreakdownPart,
  AskBreakdown,
  AskOpen,
  AskAnswer,
  AskWaiting,
  AskOpeningsView,
  AskSourceRef,
  AskAnswerRead,
} from "./ask-answer";
export { ASK_ANSWER_FORMAT } from "./answer-format";
export { planOf, resolveSteps, stepToken, STEP_TOKEN, PLAN_WORDS } from "./plan";
export type { PlanIntent, PlanWorld, PlanStep, PlanMade } from "./plan";
export { ASK_CONTEXT_MAX_ROWS, ASK_CONTEXT_ROW_KINDS, itemFocus } from "./ask-context";
export { PageContextSchema } from "./ask-schemas";
export type { AskContextRowKind, PageContextRow, PageContext } from "./ask-context";
export type { AskScopeKind } from "./ask";
