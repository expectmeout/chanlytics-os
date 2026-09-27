/** Ask, the workspace assistant: its limits, the answer as the Line draws it, the model it runs on and a turn's shape. */
export {
  cleanAnswer,
  isUngrounded,
  scopeFromRoute,
  detectLanguage,
  askJump,
  buildAskSuggestions,
  dayFromQuestion,
  askIntent,
  callsToday,
  applySettingsChange,
  describeSettingsChange,
  sameQuestion,
  navigateLabel,
  ASK_MAX_CHARS,
  ASK_MAX_ROUNDS,
  ASK_TURN_BUDGET_MS,
  ASK_MAX_TOKENS,
  ASK_TOKENS_DAY,
  ASK_RETENTION_DAYS,
  ASK_CAPS,
  ASK_LANGUAGES,
  ASK_THREAD_VERBS,
  ASK_UNDO_MS,
  AskProposalOutcomeSchema,
  ASK_PAGES,
  ASK_SURFACES,
  ASK_SCOPE_KINDS,
  AskSettingsChangeSchema,
  FOLLOWUP_ECHO,
} from "./ask";
export type {
  AskLanguage,
  AskRole,
  AskThreadVerb,
  AskProposal,
  AskProposalOutcome,
  AskMessageVM,
  AskThreadVM,
  AskScope,
  JumpEntry,
  AskSurface,
  AskSuggestion,
  SuggestionInput,
  FastCall,
  AskIntent,
  AskSettingsChange,
} from "./ask";
export {
  emptyReadSet,
  noteRows,
  groundCitations,
  citationRoute,
  ASK_CITATION_KINDS,
  ASK_PAGE_ROUTES,
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
export { ASK_CONTEXT_MAX_ROWS, ASK_CONTEXT_ROW_KINDS, PageContextSchema } from "./ask-context";
export type { AskContextRowKind, PageContextRow, PageContext } from "./ask-context";
export type { AskScopeKind } from "./ask";
