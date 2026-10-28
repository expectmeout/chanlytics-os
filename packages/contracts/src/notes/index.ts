/**
 * Notes on a person (decision 0007): a note, when the receptionist suggests one, a next step and its sheet. And a note for
 * the receptionist an owner's correction suggests (decision 0063).
 */
export {
  checkFactSuggestion,
  FACT_SUGGEST_LIMITS,
  FACT_SUGGEST_MODEL,
  FACT_SUGGEST_SCHEMA,
  factAlreadyNoted,
  factSuggestSystemPrompt,
  factSuggestUserContent,
  whyNotFactLook,
} from "./fact-suggest";
export type { FactCheck, FactCorrection, FactLookFacts } from "./fact-suggest";
export { FACT_SUGGEST_WORDS, factNoteChange } from "./fact-words";
export type { CorrectionSource, FactSuggestionDto } from "./fact-words";
export {
  checkNoteSuggestion,
  customerWords,
  NOTE_SUGGEST_KINDS,
  NOTE_SUGGEST_LIMITS,
  NOTE_SUGGEST_MODEL,
  NOTE_SUGGEST_SCHEMA,
  noteSuggestSystemPrompt,
  noteSuggestUserContent,
  whyNotLook,
} from "./note-suggest";
export type { NoteCheck, NoteLookFacts, NoteSuggestKind, NoteTurn } from "./note-suggest";
export {
  NO_DAY,
  noteManyLine,
  STEP_SHEET_WORDS,
  stepSheetBody,
  stepSheetDirty,
  stepSheetDone,
  stepSheetFor,
  stepSheetMerge,
} from "./step-sheet";
export type { StepDraft, StepNoteBody, StepPerson, StepSheetVM } from "./step-sheet";
export {
  callDays,
  composerDays,
  dueStepDay,
  forWords,
  nextStepOf,
  stepDayName,
  stepDayOf,
  stepDays,
  stepIsDue,
  TODAY_STEPS_MAX,
  todayStepsDue,
} from "./steps";
export type { PersonNextStepVM, StepColumns, StepDayChoice, StepDayVM, StepDue } from "./steps";
