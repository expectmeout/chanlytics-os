/** Notes on a person (decision 0007): a note, when the receptionist suggests one, a next step and its sheet. */
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
