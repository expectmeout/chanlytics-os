import { NOTE_LINE_MAX, NOTE_MAX, NOTE_REFUSALS } from "./person-notes.js";
import { stepDays } from "./steps.js";
import { isRealDate } from "../config/workspace-config/config-rules.js";
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
  saving: "Saving\u2026",
  reading: "Reading\u2026",
  gone: "This person is not in your workspace.",
  noStep: "This step is no longer here.",
  done: { add: "Next step set", edit: "Step saved", note: "Note added", editNote: "Note saved" },
  failed: "Could not save this step.",
  /** Many people at once: one line, each of them given it as a note of their own. */
  many: {
    sub: (n) => `${n} ${n === 1 ? "person" : "people"}`,
    placeholder: "One line, under each of their notes",
    rule: "Each of them gets it as a note of their own, signed by you.",
    failed: "Could not add the note."
  },
  // The limit is passed in rather than read here: a literal that reads another module's constant is kept by every
  // package that bundles contracts, as tone.ts's tables were (people.ts NOTE_MAX is the one spelling of it).
  problems: {
    what: "Say what to do.",
    note: "Write the note first.",
    day: "Pick a day.",
    tooLong: (max) => `At most ${max} characters.`
  },
  discard: {
    question: "Discard changes?",
    detail: null,
    yes: "Discard",
    no: "Keep editing"
  }
};
export const NO_DAY = "none";
function openedWith(note, kind, days) {
  const day = note?.step ? note.step.day.day : kind === "note" ? NO_DAY : null;
  return {
    what: note ? note.body : "",
    day,
    picking: !!day && !days.some((c) => c.key === day),
    forId: note ? note.forUserId : null,
    teamOnly: note?.teamOnly === true
  };
}
const titleKey = (mode, kind) => kind === "note" ? mode === "add" ? "note" : "editNote" : mode;
export function stepSheetFor(p, ask, nowMs, tz) {
  const W = STEP_SHEET_WORDS;
  const note = ask.noteId ? (p.noteList ?? []).find((n) => n.id === ask.noteId) ?? null : null;
  const mode = ask.noteId ? "edit" : "add";
  const kind = (note ? !note.step : ask.note === true) ? "note" : "step";
  const dealId = note ? note.dealId : ask.dealId ?? null;
  const service = dealId ? (p.deals ?? []).find((d) => d.id === dealId)?.service ?? null : null;
  const stepChoices = stepDays(nowMs, tz);
  const days = kind === "note" ? [{ key: NO_DAY, label: W.when.none, title: W.when.none }, ...stepChoices] : stepChoices;
  return {
    mode,
    kind,
    title: W.titles[titleKey(mode, kind)],
    sub: service ? `${p.name} \xB7 ${service}` : p.name,
    days,
    team: [
      { id: "", label: W.for.anyone },
      ...(p.noteTeam ?? []).map((m) => ({ id: m.id, label: m.me ? W.for.me : m.name }))
    ],
    draft: openedWith(note, kind, days),
    note: note ? { id: note.id, version: note.version } : null,
    dealId,
    blocked: ask.noteId && !note ? W.noStep : note && !note.mine ? NOTE_REFUSALS.not_yours ?? null : null,
    save: mode === "edit" ? W.save.edit : W.save[kind === "note" ? "note" : "add"]
  };
}
export function stepSheetDone(sheet, draft) {
  const W = STEP_SHEET_WORDS.done;
  const step = draft.day !== NO_DAY || draft.picking;
  if (sheet.mode === "edit") return step ? W.edit : W.editNote;
  return step ? W.add : W.note;
}
export function stepSheetBody(sheet, draft) {
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
      ...dayless || !draft.day ? {} : { due_on: draft.day },
      for_user_id: draft.forId || null,
      // A step is the team's (00166); a note is the receptionist's to read unless it is kept from it.
      team_only: dayless ? draft.teamOnly : true,
      ...sheet.dealId ? { deal_id: sheet.dealId } : {},
      ...sheet.note ? { note_id: sheet.note.id, version: sheet.note.version } : {}
    }
  };
}
export function stepSheetDirty(draft, opened) {
  return draft.what.trim() !== opened.what.trim() || draft.day !== opened.day || (draft.forId || null) !== (opened.forId || null) || draft.teamOnly !== opened.teamOnly;
}
export function stepSheetMerge(draft, opened, fresh) {
  const dayTyped = draft.day !== opened.day || draft.picking !== opened.picking;
  return {
    what: draft.what !== opened.what ? draft.what : fresh.what,
    day: dayTyped ? draft.day : fresh.day,
    picking: dayTyped ? draft.picking : fresh.picking,
    forId: (draft.forId || null) !== (opened.forId || null) ? draft.forId : fresh.forId,
    teamOnly: draft.teamOnly !== opened.teamOnly ? draft.teamOnly : fresh.teamOnly
  };
}
export function noteManyLine(what) {
  const P = STEP_SHEET_WORDS.problems;
  const line = what.trim();
  if (!line) return { line: null, problem: P.note };
  if (line.length > NOTE_LINE_MAX) return { line: null, problem: P.tooLong(NOTE_LINE_MAX) };
  return { line, problem: null };
}
