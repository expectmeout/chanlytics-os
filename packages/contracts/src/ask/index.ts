/** Ask, the workspace assistant: its limits, the answer as the Line draws it, the model it runs on and a turn's shape. */
export {
  scopeFromRoute,
  ASK_MAX_CHARS,
  ASK_MAX_ROUNDS,
  ASK_TURN_BUDGET_MS,
  ASK_MAX_TOKENS,
  ASK_TOKENS_DAY,
  ASK_CAPS,
  ASK_THREAD_VERBS,
  ASK_UNDO_MS,
  AskProposalOutcomeSchema,
  ASK_SURFACES,
  ASK_SCOPE_KINDS,
} from "./ask";
export type {
  AskRole,
  AskThreadVerb,
  AskProposal,
  AskProposalOutcome,
  AskMessageVM,
  AskThreadVM,
  AskScope,
  AskSurface,
} from "./ask";
export { detectLanguage, ASK_LANGUAGES } from "./ask-language";
export type { AskLanguage } from "./ask-language";
export { cleanAnswer, isUngrounded, sameQuestion, navigateLabel, FOLLOWUP_ECHO } from "./answer-text";
export { askJump, askPages, ASK_PAGES } from "./ask-jump";
export type { JumpEntry } from "./ask-jump";
export { buildAskSuggestions } from "./ask-suggestions";
export type { AskSuggestion, SuggestionInput } from "./ask-suggestions";
export { dayFromQuestion, askIntent, callsToday } from "./ask-fast-paths";
export type { FastCall, AskIntent } from "./ask-fast-paths";
export { applySettingsChange, describeSettingsChange, AskSettingsChangeSchema } from "./ask-settings-change";
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
export { askModelProfile, ASK_MODELS, ASK_MODEL_PROFILES, ASK_MODEL } from "./ask-model";
export type { AskModelId, AskModelProfile } from "./ask-model";
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
export { ASK_CONTEXT_MAX_ROWS, ASK_CONTEXT_ROW_KINDS, PageContextSchema, itemFocus } from "./ask-context";
export type { AskContextRowKind, PageContextRow, PageContext } from "./ask-context";
export type { AskScopeKind } from "./ask";
