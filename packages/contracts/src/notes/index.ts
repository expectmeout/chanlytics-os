/**
 * Notes on a person (decision 0007): a note, when the receptionist suggests one, a next step and its sheet. And a note for
 * the receptionist an owner's correction suggests (decision 0063).
 */
export {
  customerWords,
  whyNotLook,
  noteSuggestSystemPrompt,
  noteSuggestUserContent,
  checkNoteSuggestion,
  NOTE_SUGGEST_MODEL,
  NOTE_SUGGEST_LIMITS,
  NOTE_SUGGEST_KINDS,
  NOTE_SUGGEST_SCHEMA,
} from "./note-suggest";
export type { NoteSuggestKind, NoteTurn, NoteLookFacts, NoteCheck } from "./note-suggest";
export {
  whyNotFactLook,
  factSuggestSystemPrompt,
  factSuggestUserContent,
  checkFactSuggestion,
  factAlreadyNoted,
  FACT_SUGGEST_MODEL,
  FACT_SUGGEST_LIMITS,
  FACT_SUGGEST_SCHEMA,
} from "./fact-suggest";
export type { FactLookFacts, FactCorrection, FactCheck } from "./fact-suggest";
export { factNoteChange, FACT_SUGGEST_WORDS } from "./fact-words";
export type { CorrectionSource, FactSuggestionDto } from "./fact-words";
export {
  stepDayOf,
  stepIsDue,
  dueStepDay,
  forWords,
  nextStepOf,
  stepDays,
  callDays,
  composerDays,
  stepDayName,
  todayStepsDue,
  TODAY_STEPS_MAX,
} from "./steps";
export type { StepDue, StepDayVM, PersonNextStepVM, StepColumns, StepDayChoice } from "./steps";
export {
  NO_DAY,
  noteManyLine,
  stepSheetFor,
  stepSheetBody,
  stepSheetDirty,
  stepSheetDone,
  stepSheetMerge,
  STEP_SHEET_WORDS,
} from "./step-sheet";
export type { StepPerson, StepDraft, StepSheetVM, StepNoteBody } from "./step-sheet";
