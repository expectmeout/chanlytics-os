/**
 * The steps due on Today (0007, amended): whose next step's day has come or gone, the oldest first, as steps.ts judges
 * them, and the rows they are in the queue. The day pane that held them was dropped (canvas E3, 1 October 2026) and the
 * steps went with it; they came back as rows of the queue's own grammar (0047, task 1.3 of the wiring plan).
 */
import { addressOf } from "../activity/record-address";
import { initialsOf } from "../conversations/thread-contact";
import type { PersonRowVM } from "../people/person-row";
import { NOTE_WORDS } from "../notes/person-notes";
import { TODAY_STEPS_MAX, todayStepsDue, type StepDue } from "../notes/steps";
import { plural } from "../shared/words";
import type { TodayQueueRowVM } from "./today-vm";

/* ------------------------------------------------ the steps due (0007, amended) */

/** One step due as Today names it: who, what, and when it was due, the oldest first. */
export interface TodayStepVM {
  personId: string;
  name: string;
  /** The note the step is: what Done marks. */
  noteId: string;
  words: string;
  /** "Due today", "Overdue since Mon". */
  when: string;
  due: StepDue;
  forWho: string | null;
  /** The member it is for, or null: Not now's move of its day sends it again (the edit sets it from what it is sent). */
  forUserId: string | null;
  /** The deal it moves, when it names one: what the next step is set against. */
  dealId: string | null;
}

/** The steps due: the ones Today names (three at most), how many in all, and where the rest are. */
export interface TodayStepsVM {
  items: TodayStepVM[];
  /** How many are due in all, the ones named and the rest. */
  count: number;
  /** People's Steps due, the list every step due is on. */
  to: string;
}

/** People's Steps due (lists.ts BUILTIN_LISTS steps_due): where the rest of the steps are, and what a line about them opens. */
const STEPS_DUE_ROUTE = "clients/seg:steps_due";

/** Steps due in a count, for To do's line: "6 steps due". */
export function todayStepsSub(n: number): string {
  return `${plural(n, "step")} due`;
}

/**
 * The steps due, in every workspace, calendar or not: whose next step's day has come or gone, the oldest first, three at
 * most, how many in all, and People's Steps due for the rest. Null with none due.
 * Each day is judged at `nowMs`: the page passes the moment People's rows were published, as every page judges a
 * step (steps.ts dueStepDay), so these rows and the list the rest's row opens say one thing.
 */
export function todaySteps(
  rows: readonly Pick<PersonRowVM, "id" | "name" | "nextStep">[] | null | undefined,
  nowMs: number,
  tz: string,
  max = TODAY_STEPS_MAX,
): TodayStepsVM | null {
  const due = todayStepsDue(rows ?? [], nowMs, tz, max);
  if (!due.count) return null;
  return {
    items: due.rows.map(({ row, step }) => ({
      personId: row.id,
      name: row.name,
      noteId: step.id,
      words: step.words,
      when: step.day.words,
      due: step.due,
      forWho: step.forWho,
      forUserId: step.forUserId,
      dealId: step.dealId,
    })),
    count: due.count,
    to: STEPS_DUE_ROUTE,
  };
}

/* ------------------------------------------------ the steps, as rows of the queue */

/** What the rows say that a step's own words do not: the row for the rest, and what its state line leads with. */
const STEP_ROW = {
  rest: (n: number) => `${plural(n, "more step")} due`,
  restSentence: "Their next step's day has come, or gone by.",
  restState: [NOTE_WORDS.stepsDue, "in People"],
  open: "Open",
} as const;

/** One step as a row: the person and the step's words, its day and whose it is, the person as the door and Done as the verb. */
function stepRow(s: TodayStepVM): TodayQueueRowVM {
  return {
    id: `q-step-${s.noteId}`,
    kind: "step",
    conversationId: null,
    callId: null,
    person_id: s.personId,
    who: s.name,
    initials: initialsOf(s.name),
    channel: NOTE_WORDS.next,
    when: "",
    sentence: s.words,
    quoted: false,
    status: [s.when, ...(s.forWho ? [s.forWho] : [])],
    tone: "warn",
    warn: s.due === "past",
    cta: { label: NOTE_WORDS.done, to: addressOf({ kind: "step", personId: s.personId }) },
    also: null,
    step: { person_id: s.personId, note_id: s.noteId, deal_id: s.dealId, for_user_id: s.forUserId },
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/** The row for the steps past the named ones: how many, and the door to People's Steps due. */
function restRow(count: number, to: string): TodayQueueRowVM {
  return {
    id: "q-steps-more",
    kind: "steps",
    conversationId: null,
    callId: null,
    person_id: null,
    who: STEP_ROW.rest(count),
    initials: `+${count}`,
    channel: NOTE_WORDS.next,
    when: "",
    sentence: STEP_ROW.restSentence,
    quoted: false,
    status: [...STEP_ROW.restState],
    tone: "warn",
    warn: false,
    cta: { label: STEP_ROW.open, to },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/**
 * Today's queue with the steps due among its rows (0007, 0047): a row for each of the steps named (three at most, the oldest
 * first) and one for the rest, after everyone who waits on a person and before a call worth a listen. A step is the
 * team's to-do, so it does not wait on anyone: it never takes a seat from a person (the card draws the queue in order) and
 * the queue the brief built, which Ask, the widget and the away card read, is left as it was. With none due, the rows as
 * they were.
 */
export function withSteps(rows: TodayQueueRowVM[], steps: TodayStepsVM | null): TodayQueueRowVM[] {
  if (!steps) return rows;
  const mine = steps.items.map(stepRow);
  const rest = steps.count - steps.items.length;
  if (rest > 0) mine.push(restRow(rest, steps.to));
  const firstCall = rows.findIndex((r) => r.kind === "call");
  const at = firstCall < 0 ? rows.length : firstCall;
  return [...rows.slice(0, at), ...mine, ...rows.slice(at)];
}
