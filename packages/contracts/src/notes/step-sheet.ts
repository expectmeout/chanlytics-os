/**
 * The note sheet (0007, amended; 00166): where a note or a next step is written from outside the notes card -- the deal
 * card's "Set a next step" and its Change, every surface that shows a step after it, a visit's "Add a note", and a
 * selection's "Add a note". A step is a note with a day, so they are one sheet: opened as a note, its first choice of
 * day is "No day", and a note with none says whether the receptionist reads it; opened for many people, it takes one
 * line that each of them gets as a note of their own (the sheets as verbs, 14 Oct 2026). What it says, what it opens
 * with, the days it offers, and the body the notes route takes; the page composes (surfaces/people/step-sheet).
 */
import { NOTE_LINE_MAX, NOTE_MAX, NOTE_REFUSALS, type PersonNoteTeamDto, type PersonNoteVM } from "./person-notes";
import { stepDays, type StepDayChoice } from "./steps";
import { isRealDate } from "../config/workspace-config/config-rules";

/** Every word the sheet says. */
export const STEP_SHEET_WORDS = {
  titles: { add: "Set a next step", edit: "Change the step", note: "Add a note", editNote: "Change the note" },
  what: { label: "What to do", placeholder: "Call about the timeline" },
  /** A note's words, where the sheet opened as one. */
  noteWhat: { label: "Note", placeholder: "What they said, what to remember" },
  when: { label: "When", pick: "The day", none: "No day" },
  for: { label: "For", anyone: "Anyone on the team", me: "Me" },
  teamOnly: "Only your team sees it.",
  /** A note with no day: whether the receptionist reads it (it uses notes as facts, never aloud). */
  reads: { label: "Team only", hint: "The receptionist won't read it" },
  save: { add: "Set it", edit: "Save", note: "Add it" },
  saving: "Saving…",
  reading: "Reading…",
  gone: "This person is not in your workspace.",
  noStep: "This step is no longer here.",
  done: { add: "Next step set", edit: "Step saved", note: "Note added", editNote: "Note saved" },
  failed: "Could not save this step.",
  /** Many people at once: one line, each of them given it as a note of their own. */
  many: {
    sub: (n: number) => `${n} ${n === 1 ? "person" : "people"}`,
    placeholder: "One line, under each of their notes",
    rule: "Each of them gets it as a note of their own, signed by you.",
    failed: "Could not add the note.",
  },
  // The limit is passed in rather than read here: a literal that reads another module's constant is kept by every
  // package that bundles contracts, as tone.ts's tables were (people.ts NOTE_MAX is the one spelling of it).
  problems: {
    what: "Say what to do.",
    note: "Write the note first.",
    day: "Pick a day.",
    tooLong: (max: number) => `At most ${max} characters.`,
  },
  discard: {
    question: "Discard changes?",
    detail: null,
    yes: "Discard",
    no: "Keep editing",
  },
} as const;

/** The person as the sheet reads them: a PersonVM fits. */
export interface StepPerson {
  id: string;
  name: string;
  noteList?: readonly Pick<
    PersonNoteVM,
    "id" | "version" | "body" | "step" | "dealId" | "forUserId" | "mine" | "teamOnly"
  >[];
  noteTeam?: readonly PersonNoteTeamDto[];
  deals?: readonly { id: string | null; service: string | null }[];
}

/** The choice of day that says it is a note: no day, so not a step. */
export const NO_DAY = "none";

/** What is typed in the sheet. */
export interface StepDraft {
  what: string;
  /** "2026-09-26", NO_DAY for a note, or null before a day is picked. */
  day: string | null;
  /** The date field is open (Pick a day, or a day none of the choices is). */
  picking: boolean;
  /** The member it is for; null for anyone. */
  forId: string | null;
  /** A note with no day kept from the receptionist; a step is the team's whatever this says. */
  teamOnly: boolean;
}

export interface StepSheetVM {
  mode: "add" | "edit";
  /** How it opened: a step (a day to pick), or a note (no day first; a day makes it a step). */
  kind: "step" | "note";
  title: string;
  /** Who it is about, and the deal's service when it names one: "Tove Lind · Website". */
  sub: string;
  days: StepDayChoice[];
  /** Who it can be for: anyone first, then the team, the reader as "Me". */
  team: { id: string; label: string }[];
  /** What it opens with. */
  draft: StepDraft;
  /** The step it changes, with the version its Save is sent with; null for a new one. */
  note: { id: string; version: number } | null;
  /** The deal it names; null for a step about the person. */
  dealId: string | null;
  /** Why it cannot be drawn: the step it was asked to change is gone, or is someone else's to change. */
  blocked: string | null;
  save: string;
}

/** What the sheet opens with: a step's or a note's own, or a new one's (a note's day is No day, a step's unpicked). */
function openedWith(
  note: NonNullable<StepPerson["noteList"]>[number] | null,
  kind: StepSheetVM["kind"],
  days: readonly StepDayChoice[],
): StepDraft {
  const day = note?.step ? note.step.day.day : kind === "note" ? NO_DAY : null;
  return {
    what: note ? note.body : "",
    day,
    picking: !!day && !days.some((c) => c.key === day),
    forId: note ? note.forUserId : null,
    teamOnly: note?.teamOnly === true,
  };
}

/** The sheet's title, by how it opened. */
const titleKey = (mode: StepSheetVM["mode"], kind: StepSheetVM["kind"]) =>
  kind === "note" ? (mode === "add" ? "note" : "editNote") : mode;

/**
 * The sheet for a person: a new step (naming a deal, or not), a new note (`note`: no day first), or a change to one of
 * theirs; a note of theirs with no day opens as a note.
 */
export function stepSheetFor(
  p: StepPerson,
  ask: { noteId?: string | null; dealId?: string | null; note?: boolean },
  nowMs: number,
  tz: string,
): StepSheetVM {
  const W = STEP_SHEET_WORDS;
  const note = ask.noteId ? ((p.noteList ?? []).find((n) => n.id === ask.noteId) ?? null) : null;
  const mode = ask.noteId ? "edit" : "add";
  const kind = (note ? !note.step : ask.note === true) ? "note" : "step";
  const dealId = note ? note.dealId : (ask.dealId ?? null);
  const service = dealId ? ((p.deals ?? []).find((d) => d.id === dealId)?.service ?? null) : null;
  const stepChoices = stepDays(nowMs, tz);
  const days =
    kind === "note" ? [{ key: NO_DAY, label: W.when.none, title: W.when.none }, ...stepChoices] : stepChoices;
  return {
    mode,
    kind,
    title: W.titles[titleKey(mode, kind)],
    sub: service ? `${p.name} · ${service}` : p.name,
    days,
    team: [
      { id: "", label: W.for.anyone },
      ...(p.noteTeam ?? []).map((m) => ({ id: m.id, label: m.me ? W.for.me : m.name })),
    ],
    draft: openedWith(note, kind, days),
    note: note ? { id: note.id, version: note.version } : null,
    dealId,
    blocked: ask.noteId && !note ? W.noStep : note && !note.mine ? (NOTE_REFUSALS.not_yours ?? null) : null,
    save: mode === "edit" ? W.save.edit : W.save[kind === "note" ? "note" : "add"],
  };
}

/** What it says once saved: a note or a step, new or changed, by the day it was saved with. */
export function stepSheetDone(sheet: Pick<StepSheetVM, "mode">, draft: Pick<StepDraft, "day" | "picking">): string {
  const W = STEP_SHEET_WORDS.done;
  const step = draft.day !== NO_DAY || draft.picking;
  if (sheet.mode === "edit") return step ? W.edit : W.editNote;
  return step ? W.add : W.note;
}

/** What the notes route takes for a note or a step (POST contacts/[id]/notes). */
export interface StepNoteBody {
  body: string;
  /** Its day, which makes it a step; absent for a note. */
  due_on?: string;
  for_user_id: string | null;
  team_only: boolean;
  deal_id?: string;
  note_id?: string;
  version?: number;
}

/** The body a Save sends, or the problem that stops it before a round trip, said under the field it names. */
export function stepSheetBody(
  sheet: Pick<StepSheetVM, "note" | "dealId"> & Partial<Pick<StepSheetVM, "kind">>,
  draft: StepDraft,
): { body: StepNoteBody; problem: null } | { body: null; problem: { field: "what" | "day"; words: string } } {
  const P = STEP_SHEET_WORDS.problems;
  const what = draft.what.trim();
  const dayless = draft.day === NO_DAY && !draft.picking;
  if (!what) return { body: null, problem: { field: "what", words: sheet.kind === "note" ? P.note : P.what } };
  if (what.length > NOTE_MAX) return { body: null, problem: { field: "what", words: P.tooLong(NOTE_MAX) } };
  if (!dayless && (!draft.day || !isRealDate(draft.day)))
    return { body: null, problem: { field: "day", words: P.day } };
  return {
    problem: null,
    body: {
      body: what,
      ...(dayless || !draft.day ? {} : { due_on: draft.day }),
      for_user_id: draft.forId || null,
      // A step is the team's (00166); a note is the receptionist's to read unless it is kept from it.
      team_only: dayless ? draft.teamOnly : true,
      ...(sheet.dealId ? { deal_id: sheet.dealId } : {}),
      ...(sheet.note ? { note_id: sheet.note.id, version: sheet.note.version } : {}),
    },
  };
}

/** Whether anything was typed since the sheet opened: Cancel asks once when so. */
export function stepSheetDirty(draft: StepDraft, opened: StepDraft): boolean {
  return (
    draft.what.trim() !== opened.what.trim() ||
    draft.day !== opened.day ||
    (draft.forId || null) !== (opened.forId || null) ||
    draft.teamOnly !== opened.teamOnly
  );
}

/**
 * The sheet read again while it is open -- after a refusal, or over the tab's held copy of the person: what was typed
 * stays, and every field left as it opened takes the fresh value, as the deal sheet's dealSheetMerge does. The day and
 * whether the date field is open are one field. With the step's fresh version, a second Save after a refusal changes
 * only what was typed here.
 */
export function stepSheetMerge(draft: StepDraft, opened: StepDraft, fresh: StepDraft): StepDraft {
  const dayTyped = draft.day !== opened.day || draft.picking !== opened.picking;
  return {
    what: draft.what !== opened.what ? draft.what : fresh.what,
    day: dayTyped ? draft.day : fresh.day,
    picking: dayTyped ? draft.picking : fresh.picking,
    forId: (draft.forId || null) !== (opened.forId || null) ? draft.forId : fresh.forId,
    teamOnly: draft.teamOnly !== opened.teamOnly ? draft.teamOnly : fresh.teamOnly,
  };
}

/** One line for many people: what each of them gets, or what is wrong with it before a round trip. */
export function noteManyLine(what: string): { line: string; problem: null } | { line: null; problem: string } {
  const P = STEP_SHEET_WORDS.problems;
  const line = what.trim();
  if (!line) return { line: null, problem: P.note };
  if (line.length > NOTE_LINE_MAX) return { line: null, problem: P.tooLong(NOTE_LINE_MAX) };
  return { line, problem: null };
}
