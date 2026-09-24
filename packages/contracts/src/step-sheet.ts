/**
 * The step sheet (0007, amended; 00166): where a next step is set or changed from outside the notes card -- the deal
 * card's "Set a next step" and its Change, and every surface that shows a step after it. What it says, what it opens
 * with, the days it offers, and the body the notes route takes; the page composes (components/step-sheet.jsx).
 */
import { NOTE_MAX, NOTE_REFUSALS, type PersonNoteTeamDto, type PersonNoteVM } from "./people";
import { stepDays, type StepDayChoice } from "./steps";
import { isRealDate } from "./config";

/** Every word the sheet says. */
export const STEP_SHEET_WORDS = {
  titles: { add: "Set a next step", edit: "Change the step" },
  what: { label: "What to do", placeholder: "Call about the timeline" },
  when: { label: "When", pick: "The day" },
  for: { label: "For", anyone: "Anyone on the team", me: "Me" },
  teamOnly: "A step is for the team only: the receptionist never reads it.",
  save: { add: "Set it", edit: "Save" },
  saving: "Saving…",
  reading: "Reading…",
  gone: "This person is not in your workspace.",
  noStep: "This step is no longer here.",
  done: { add: "Next step set", edit: "Step saved" },
  failed: "Could not save this step.",
  // The limit is passed in rather than read here: a literal that reads another module's constant is kept by every
  // package that bundles contracts, as tone.ts's tables were (people.ts NOTE_MAX is the one spelling of it).
  problems: { what: "Say what to do.", day: "Pick a day.", tooLong: (max: number) => `At most ${max} characters.` },
  discard: {
    question: "Discard your changes?",
    detail: "Nothing here has been saved.",
    yes: "Yes, discard",
    no: "Keep editing",
  },
} as const;

/** The person as the sheet reads them: a PersonVM fits. */
export interface StepPerson {
  id: string;
  name: string;
  noteList?: readonly Pick<PersonNoteVM, "id" | "version" | "body" | "step" | "dealId" | "forUserId" | "mine">[];
  noteTeam?: readonly PersonNoteTeamDto[];
  deals?: readonly { id: string | null; service: string | null }[];
}

/** What is typed in the sheet. */
export interface StepDraft {
  what: string;
  /** "2026-09-26", or null before a day is picked. */
  day: string | null;
  /** The date field is open (Pick a day, or a day none of the choices is). */
  picking: boolean;
  /** The member it is for; null for anyone. */
  forId: string | null;
}

export interface StepSheetVM {
  mode: "add" | "edit";
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

/** The sheet for a person: a new step (naming a deal, or not), or a change to one of theirs. */
export function stepSheetFor(
  p: StepPerson,
  ask: { noteId?: string | null; dealId?: string | null },
  nowMs: number,
  tz: string,
): StepSheetVM {
  const W = STEP_SHEET_WORDS;
  const note = ask.noteId ? ((p.noteList ?? []).find((n) => n.id === ask.noteId) ?? null) : null;
  const mode = ask.noteId ? "edit" : "add";
  const dealId = note ? note.dealId : (ask.dealId ?? null);
  const service = dealId ? ((p.deals ?? []).find((d) => d.id === dealId)?.service ?? null) : null;
  const days = stepDays(nowMs, tz);
  const day = note?.step ? note.step.day.day : null;
  return {
    mode,
    title: W.titles[mode],
    sub: service ? `${p.name} · ${service}` : p.name,
    days,
    team: [
      { id: "", label: W.for.anyone },
      ...(p.noteTeam ?? []).map((m) => ({ id: m.id, label: m.me ? W.for.me : m.name })),
    ],
    draft: {
      what: note ? note.body : "",
      day,
      picking: !!day && !days.some((c) => c.key === day),
      forId: note ? note.forUserId : null,
    },
    note: note ? { id: note.id, version: note.version } : null,
    dealId,
    blocked: ask.noteId && !note ? W.noStep : note && !note.mine ? (NOTE_REFUSALS.not_yours ?? null) : null,
    save: W.save[mode],
  };
}

/** What the notes route takes for a step (POST contacts/[id]/notes). */
export interface StepNoteBody {
  body: string;
  due_on: string;
  for_user_id: string | null;
  team_only: true;
  deal_id?: string;
  note_id?: string;
  version?: number;
}

/** The body a Save sends, or the problem that stops it before a round trip, said under the field it names. */
export function stepSheetBody(
  sheet: Pick<StepSheetVM, "note" | "dealId">,
  draft: StepDraft,
): { body: StepNoteBody; problem: null } | { body: null; problem: { field: "what" | "day"; words: string } } {
  const P = STEP_SHEET_WORDS.problems;
  const what = draft.what.trim();
  if (!what) return { body: null, problem: { field: "what", words: P.what } };
  if (what.length > NOTE_MAX) return { body: null, problem: { field: "what", words: P.tooLong(NOTE_MAX) } };
  if (!draft.day || !isRealDate(draft.day)) return { body: null, problem: { field: "day", words: P.day } };
  return {
    problem: null,
    body: {
      body: what,
      due_on: draft.day,
      for_user_id: draft.forId || null,
      team_only: true,
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
    (draft.forId || null) !== (opened.forId || null)
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
  };
}
