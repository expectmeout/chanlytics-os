/**
 * A person's notes: what a note is, the words the notes panel says, and the notes as the page shows them. Moved
 * whole from people.ts (Reach out Part 2.5), which re-exports it.
 */
import { clockDateYear, clockShort, clockTime } from "../shared/clock";
import { forWords, stepDayOf, type StepDayVM, type StepDue } from "./steps";

/** One note on a person, as the person read sends it (0007, 00157): its words, who wrote it and when, who it is for. */
export interface PersonNoteDto {
  id: string;
  body: string;
  author_kind: "member" | "receptionist";
  /** The author's name on the team; null for the receptionist, and for a member no longer on the team. */
  author_name: string | null;
  /** The reader wrote it. */
  mine: boolean;
  for_user_id: string | null;
  /** The name of the member it is for; null when it is for everyone, or they have left the team. */
  for_name: string | null;
  /** It is for the reader. */
  for_me: boolean;
  /** For the team only: the receptionist never reads it. */
  team_only: boolean;
  /** The receptionist's own note waits for a member to keep it or dismiss it. */
  state: "kept" | "suggested";
  source: "page" | "bulk" | "moved" | "call" | "thread" | "reach_out";
  version: number;
  created_at: string;
  updated_at: string;
  /** Its day, when it is a step (00166): by the business's calendar. Absent on a read before the column existed. */
  due_on?: string | null;
  /** When the step was done, and by whom: their name on the team, and whether it was the reader. */
  done_at?: string | null;
  done_by_name?: string | null;
  done_by_me?: boolean;
  /** The deal it moves, when it names one. */
  deal_id?: string | null;
}

/** A member of the team a note can be for, the reader marked. */
export interface PersonNoteTeamDto {
  id: string;
  name: string;
  me: boolean;
}

/** One note on the person's page. Every word is here; the page composes. */
export interface PersonNoteVM {
  id: string;
  body: string;
  /** "You", their name on the team, "A former teammate", or "The receptionist". */
  who: string;
  /** "2:10 PM" on the business's today, "Sep 23" before it; `whenFull` is the date with its year and the time. */
  when: string;
  whenFull: string;
  /** "For you", or "For Maria"; null when it is for everyone. */
  forWho: string | null;
  forMe: boolean;
  forUserId: string | null;
  teamOnly: boolean;
  /** The receptionist's suggestion, waiting for Keep or Dismiss; `from` says what it came out of. */
  suggested: boolean;
  from: string | null;
  /** The reader wrote it, so the reader may change it. An owner may take away any note; the page knows its role. */
  mine: boolean;
  /** Changed after it was written. */
  edited: boolean;
  version: number;
  /**
   * Its day, when it is a step (0007, amended): the day as every page says it, "Due Thu" or "Done", and, done, who
   * did it and when. Null for a note.
   */
  step: { day: StepDayVM; due: StepDue; words: string; done: boolean; doneWords: string | null } | null;
  /** The deal it moves, when it names one. */
  dealId: string | null;
}

/** How long a note may be, in characters: the table's CHECK (00157). */
export const NOTE_MAX = 600;

/** The notes card's words, once. */
export const NOTE_WORDS = {
  title: "Notes",
  placeholder: "Add a note…",
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
  teamOnly: "Team only",
  teamOnlyHint: "The receptionist won't read it",
  readsHint: "The receptionist uses notes as facts and never reads them aloud.",
  none: "No notes yet.",
  suggested: "Suggested by the receptionist",
  keep: "Keep",
  dismiss: "Dismiss",
  added: "Note added",
  saved: "Note saved",
  removed: "Note deleted",
  kept: "Kept: the receptionist uses it from now on",
  dismissed: "Dismissed",
  showAll: (n: number) => `Show all ${n}`,
  showFewer: "Show fewer",
  left: (n: number) => `${n} left`,
  // A note with a day is a step (0007, amended).
  addDay: "Add a day",
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
  setTheNext: "Set the next one",
  /** Done's name for a screen reader, where a header holds more than the step. */
  markDone: (words: string) => `Mark “${words}” done`,
} as const;

/** A door's refusal, in the owner's words (00157's error keys). */
export const NOTE_REFUSALS: Record<string, string> = {
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
};

const NOTE_FROM: Record<PersonNoteDto["source"], string | null> = {
  page: null,
  bulk: null,
  moved: null,
  call: "After a call",
  thread: "After a conversation",
  // A step a reach-out's reply made (Reach out Part 5, 00220 person_step_from_playbook): the words say which.
  reach_out: "From a reach-out",
};

/** A note's step: its day, and once done, who did it and when ("Done by Maria · Sep 24"). Null for a note. */
function noteStepOf(n: PersonNoteDto, tz: string, nowMs: number): PersonNoteVM["step"] {
  const day = stepDayOf(n.due_on, tz, nowMs);
  if (!day) return null;
  const doneMs = n.done_at ? Date.parse(n.done_at) : NaN;
  if (!Number.isFinite(doneMs)) return { day, due: day.due, words: day.words, done: false, doneWords: null };
  const who = n.done_by_me ? "you" : (n.done_by_name ?? "").trim() || "a former teammate";
  return {
    day,
    due: day.due,
    words: NOTE_WORDS.done,
    done: true,
    doneWords: `${NOTE_WORDS.done} by ${who} · ${clockShort(doneMs, tz, nowMs)}`,
  };
}

/**
 * A person's notes for their page (0007): the receptionist's suggestions first, since they wait for someone, then
 * every note newest first. Who wrote each is the reader ("You"), a name on the team, a member who has left, or the
 * receptionist; who it is for is the reader ("For you") or a name.
 */
export function personNotesVM(
  notes: readonly PersonNoteDto[] | null | undefined,
  tz: string,
  nowMs: number,
): PersonNoteVM[] {
  const at = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : nowMs;
  };
  return [...(notes ?? [])]
    .sort(
      (a, b) =>
        Number(b.state === "suggested") - Number(a.state === "suggested") || at(b.created_at) - at(a.created_at),
    )
    .map((n) => {
      const t = at(n.created_at);
      return {
        id: n.id,
        body: n.body,
        who:
          n.author_kind === "receptionist"
            ? "The receptionist"
            : n.mine
              ? "You"
              : (n.author_name ?? "").trim() || "A former teammate",
        when: clockShort(t, tz, nowMs),
        whenFull: `${clockDateYear(t, tz)} · ${clockTime(t, tz)}`,
        forWho: forWords(n.for_me, n.for_user_id, n.for_name),
        forMe: n.for_me,
        forUserId: n.for_user_id,
        teamOnly: n.team_only,
        suggested: n.state === "suggested",
        from: n.author_kind === "receptionist" ? NOTE_FROM[n.source] : null,
        mine: n.mine && n.author_kind === "member",
        edited: n.version > 1 && n.state === "kept" && n.author_kind === "member",
        version: n.version,
        step: noteStepOf(n, tz, nowMs),
        dealId: n.deal_id ?? null,
      };
    });
}
