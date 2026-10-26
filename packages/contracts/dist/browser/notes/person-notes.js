import { clockDateYear, clockShort, clockTime } from "../shared/clock.js";
import { forWords, stepDayOf } from "./steps.js";
export const NOTE_MAX = 600;
export const NOTE_LINE_MAX = 200;
export const NOTE_WORDS = {
  title: "Notes",
  placeholder: "Add a note\u2026",
  add: "Add note",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  remove: "Delete",
  askRemove: "Delete this note?",
  more: "More for this note",
  edited: "edited",
  forAnyone: "For anyone",
  forLabel: "For",
  /** The composer's For, as choices under its label (0052's composer): Anyone · Me · Jo Park. */
  anyone: "Anyone",
  me: "Me",
  /** The composer's button once a day is chosen: it says what pressing it makes (the motion grammar's label). */
  addStepFor: (day) => `Add step for ${day}`,
  teamOnly: "Team only",
  teamOnlyHint: "The receptionist won't read it",
  readsHint: "The receptionist uses notes as facts and never reads them aloud.",
  none: "No notes yet.",
  suggested: "Suggested by the receptionist",
  /** A suggestion's eyebrow, said on every screen: who, where it was heard, and when ("… · after a call · 2:10 PM"). */
  suggestedLine: (from, when) => ["Suggested by the receptionist", from ? `${from.charAt(0).toLowerCase()}${from.slice(1)}` : null, when].filter(Boolean).join(" \xB7 "),
  keep: "Keep",
  dismiss: "Dismiss",
  added: "Note added",
  saved: "Note saved",
  removed: "Note deleted",
  kept: "Kept: the receptionist uses it from now on",
  dismissed: "Dismissed",
  showAll: (n) => `Show all ${n}`,
  showFewer: "Show fewer",
  left: (n) => `${n} left`,
  // A note with a day is a step (0007, amended).
  addDay: "Add a day",
  /** The composer's day row's word, over its chips (canvas A, M4). */
  day: "Day",
  due: "Due",
  noDay: "No day",
  pickDay: "Pick a day",
  done: "Done",
  undo: "Undo",
  change: "Change",
  stepTeamOnly: "A step is for the team only",
  setNext: "Set a next step",
  next: "Next step",
  stepsDue: "Steps due",
  stepAdded: "Step added",
  stepSaved: "Step saved",
  stepDone: "Step done",
  stepReopened: "Step open again",
  /** Done's name for a screen reader, where a header holds more than the step. */
  markDone: (words) => `Mark \u201C${words}\u201D done`,
  /** The Overview's Notes (canvas A): the door to every note, History's Notes, at the pane's head. */
  all: "All notes",
  /** Over the newest note on the Overview, in the mono eyebrow: "Note · Marisa · Sep 21"; a step says its day. */
  eyebrow: (who, when) => `Note \xB7 ${who} \xB7 ${when}`,
  stepEyebrow: (who, due) => `Step \xB7 ${who} \xB7 ${due}`
};
export const NOTE_REFUSALS = {
  empty: "Write something first.",
  too_long: `A note is at most ${NOTE_MAX} characters.`,
  not_found: "This person or this note is no longer here.",
  not_a_member: "That person is not on the team.",
  not_yours: "Only the person who wrote this note can change it.",
  moved: "Someone changed this note since you opened it. Read it again, then save.",
  decided: "Someone already decided on this suggestion.",
  bad_source: "Could not save this note.",
  bad_deal: "That deal is not this person's.",
  not_a_step: "Only a note with a day can be done.",
  not_for_you: "This note is for someone else."
};
const NOTE_FROM = {
  page: null,
  bulk: null,
  moved: null,
  call: "After a call",
  thread: "After a conversation",
  // A step a reach-out's reply made (Reach out Part 5, 00220 person_step_from_playbook): the words say which.
  reach_out: "From a sequence to leads"
};
function noteStepOf(n, tz, nowMs) {
  const day = stepDayOf(n.due_on, tz, nowMs);
  if (!day) return null;
  const doneMs = n.done_at ? Date.parse(n.done_at) : NaN;
  if (!Number.isFinite(doneMs)) return { day, due: day.due, words: day.words, done: false, doneWords: null };
  const who = n.done_by_me ? "you" : (n.done_by_name ?? "").trim() || "a former teammate";
  const byWriter = n.author_kind === "member" && (n.mine ? !!n.done_by_me : !n.done_by_me && !!n.done_by_name && n.done_by_name.trim() === n.author_name?.trim());
  const when = clockShort(doneMs, tz, nowMs);
  return {
    day,
    due: day.due,
    words: NOTE_WORDS.done,
    done: true,
    doneWords: byWriter ? `${NOTE_WORDS.done} \xB7 ${when}` : `${NOTE_WORDS.done} by ${who} \xB7 ${when}`
  };
}
export function personNotesVM(notes, tz, nowMs) {
  const at = (iso) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : nowMs;
  };
  return [...notes ?? []].sort(
    (a, b) => Number(b.state === "suggested") - Number(a.state === "suggested") || at(b.created_at) - at(a.created_at)
  ).map((n) => {
    const t = at(n.created_at);
    return {
      id: n.id,
      body: n.body,
      who: n.author_kind === "receptionist" ? "The receptionist" : n.mine ? "You" : (n.author_name ?? "").trim() || "A former teammate",
      when: clockShort(t, tz, nowMs),
      whenFull: `${clockDateYear(t, tz)} \xB7 ${clockTime(t, tz)}`,
      forWho: forWords(n.for_me, n.for_user_id, n.for_name),
      forMe: n.for_me,
      forSeen: n.for_me && !!n.for_seen,
      forUserId: n.for_user_id,
      teamOnly: n.team_only,
      suggested: n.state === "suggested",
      from: n.author_kind === "receptionist" ? NOTE_FROM[n.source] : null,
      mine: n.mine && n.author_kind === "member",
      edited: n.version > 1 && n.state === "kept" && n.author_kind === "member",
      version: n.version,
      step: noteStepOf(n, tz, nowMs),
      dealId: n.deal_id ?? null
    };
  });
}
