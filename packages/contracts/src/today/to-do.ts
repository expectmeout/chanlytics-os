/**
 * To do's rows on Today (decision 0076; Today in three zones, 2 Nov 2026): the steps due (0007, amended), whose next
 * step's day has come or gone, the oldest first, as steps.ts judges them; and yesterday's visits nobody has marked (0047).
 * Each as rows of the queue's own grammar (0047, task 1.3 of the wiring plan), which To do draws three at most across them.
 */
import { addressOf } from "../activity/record-address";
import { visitDoor } from "../calendar/appointment-key";
import {
  VISIT_ASK_WORDS,
  VISITS_KEPT_MAX,
  VISIT_WORDS,
  visitLineOfBlock,
  type VisitLineVM,
} from "../calendar/words/visit";
import { initialsOf } from "../conversations/thread-contact";
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import type { PersonRowVM } from "../people/person-row/row-facts";
import { NOTE_WORDS } from "../notes/person-notes";
import { TODAY_STEPS_MAX, todayStepsDue, type StepDue } from "../notes/steps";
import { plural } from "../shared/words";
import type { CalendarLike, DayFrameLike } from "./day/frame";
import type { TodayQueueRowVM } from "./vm";

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
  /** Whose it is, where it is someone else's ("For Maria"): a step of your own says nothing (his read, 9 Nov 2026). */
  /** Whose it is, where it is someone else's ("For Maria"): a step of your own says nothing (his read, 9 Nov 2026). */
  forWho: string | null;
  /** The member it is for, or null: Not now's move of its day sends it again (the edit sets it from what it is sent). */
  forUserId: string | null;
  /** The deal it moves, when it names one: what the next step is set against. */
  dealId: string | null;
}

/** Someone else's step as a row says it, by first name, never an address: "For Dana Ortiz" is "For Dana". */
const forOther = (forWho: string): string => {
  const name = forWho.replace(/^For\s+/i, "").trim();
  return `For ${(name.split("@")[0] ?? name).split(/\s+/)[0] ?? name}`;
};

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
export function todayStepsSub(count: number): string {
  return `${plural(count, "step")} due`;
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
      forWho: step.forMe || !step.forWho ? null : forOther(step.forWho),
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
function stepRow(todayStep: TodayStepVM): TodayQueueRowVM {
  return {
    id: `q-step-${todayStep.noteId}`,
    kind: "step",
    conversationId: null,
    callId: null,
    person_id: todayStep.personId,
    who: todayStep.name,
    initials: initialsOf(todayStep.name),
    channel: NOTE_WORDS.next,
    when: "",
    sentence: todayStep.words,
    quoted: false,
    status: [todayStep.when, ...(todayStep.forWho ? [todayStep.forWho] : [])],
    tone: "warn",
    warn: todayStep.due === "past",
    cta: { label: NOTE_WORDS.done, to: addressOf({ kind: "step", personId: todayStep.personId }) },
    also: null,
    step: {
      person_id: todayStep.personId,
      note_id: todayStep.noteId,
      deal_id: todayStep.dealId,
      for_user_id: todayStep.forUserId,
    },
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

/* ------------------------------ yesterday's visits to mark (decision 0047, D1-visit-mark) ---------------------------- */

/** Yesterday's visits the queue names: three, as the steps due are; the rest are one row. */
const TODAY_VISITS_MAX = 3;

/** One of yesterday's visits nobody has marked, as the one visit line, with the record's row a press is said on. */
export interface TodayVisitAskVM {
  line: VisitLineVM;
  /** The record's row (VisitMark.id): what POST calendar/visits/[id] says Kept or Missed on. */
  markId: string;
  /** The person it is for: the row wears their face. */
  person: { id: string; name: string };
  /** The visit on the Calendar (visitDoor): the row's door. */
  to: string;
}

/** Yesterday's unmarked visits: the ones Today names, how many in all, the workspace's word for one, and where the rest are. */
export interface TodayVisitsAskedVM {
  items: TodayVisitAskVM[];
  count: number;
  /** Every one of them by the record's row (VisitMark.id), the ones past `items` among them: what Mark all kept says. */
  markIds: string[];
  word: AppointmentWord;
  /** The Calendar on yesterday, where every one of them is. */
  to: string;
}

/** What the rows say that a visit line's own words do not. */
const VISITS_ASKED_WORDS = {
  rest: (n: number, words: ReturnType<typeof appointmentWords>) =>
    `${n} more ${n === 1 ? words.one : words.many} to mark`,
  restSentence: "Nobody has said whether they came, yesterday.",
  open: "Open",
  calendar: "on the Calendar",
} as const;

/** Visits to mark in a count, for To do's line: "3 appointments to mark". */
export function todayVisitsSub(count: number, word: AppointmentWord): string {
  const words = appointmentWords(word);
  return `${count} ${count === 1 ? words.one : words.many} to mark`;
}

/**
 * Yesterday's visits nobody has said whether they came to (product call of 11 Oct 2026, approved): a visit of the day
 * before today's that has ended, that the record keeps a row for (so a word can be said on it) and that is for a person
 * the board matched. Their lines are the one visit line (visitLineOfBlock), judged at `nowMs`; the first three are named,
 * in the day's order, and the count is all of them. Null with none, and without the day before today in the calendar the
 * page holds (a board moved to another span holds none of it). An event nobody is matched to is not asked about: a lunch
 * on the owner's calendar is no visit, and the Calendar's panel says it for the rest.
 */
export function todayVisitsAsked(
  cal: CalendarLike | null,
  nowMs: number,
  word: AppointmentWord,
  max = TODAY_VISITS_MAX,
): TodayVisitsAskedVM | null {
  if (!cal) return null;
  const idx = cal.days.findIndex((d) => d.today);
  const yesterday = idx > 0 ? cal.days[idx - 1] : null;
  if (!yesterday) return null;
  const unmarkedVisits = unmarkedVisitsOf(yesterday, nowMs, "Yesterday");
  if (!unmarkedVisits.length) return null;
  return {
    items: unmarkedVisits.slice(0, max),
    count: unmarkedVisits.length,
    markIds: unmarkedVisits.slice(0, VISITS_KEPT_MAX).map((v) => v.markId),
    word,
    to: `calendar/${yesterday.key}`,
  };
}

/**
 * A day's visits that have ended with nobody's word on whether they came, in the day's order: for a person the board
 * matched, on the record (so a word can be said), over by the clock, by the one visit line (visitLineOfBlock `unmarked`),
 * which `day` names ("Yesterday"). The one rule To do asks yesterday's by and the day's foot counts today's by, once the day
 * has turned (today/day/zone.ts). A lunch on the owner's calendar, matched to nobody, is no visit to mark.
 */
export function unmarkedVisitsOf(
  frame: Pick<DayFrameLike, "key" | "blocks">,
  nowMs: number,
  day: string,
): TodayVisitAskVM[] {
  const todayVisitAsks: TodayVisitAskVM[] = [];
  for (const block of [...frame.blocks].sort((x, y) => x.t - y.t)) {
    if (!block.person || !block.visit || !block.visit.id || !block.start || !block.end) continue;
    const to = visitDoor(frame.key, block.visit.id);
    const line = visitLineOfBlock(
      {
        id: block.id,
        title: block.title,
        time: block.time,
        start: block.start,
        end: block.end,
        visit: { id: block.visit.id, status: block.visit.status },
        person: block.person,
      },
      nowMs,
      day,
      to,
    );
    if (line.unmarked)
      todayVisitAsks.push({
        line,
        markId: block.visit.id,
        person: { id: block.person.id, name: block.person.name },
        to,
      });
  }
  return todayVisitAsks;
}

/** One visit to mark as a row: the person and the question, the visit on the Calendar as the door and Kept and Missed as the verbs. */
function visitRow(todayVisitAsk: TodayVisitAskVM): TodayQueueRowVM {
  const { line, person } = todayVisitAsk;
  return {
    id: `q-visit-${todayVisitAsk.markId}`,
    kind: "visit",
    conversationId: null,
    callId: null,
    person_id: person.id,
    who: person.name,
    initials: initialsOf(person.name),
    channel: "Calendar",
    when: [line.day, line.time].filter(Boolean).join(", "),
    sentence: VISIT_ASK_WORDS.question,
    quoted: false,
    status: [VISIT_ASK_WORDS.unmarked, line.title],
    tone: "warn",
    warn: false,
    cta: { label: VISIT_WORDS.kept, to: todayVisitAsk.to },
    also: null,
    visit: { id: todayVisitAsk.markId, asks: line.asks },
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/** The row for the visits past the named ones: how many, and the door to the Calendar on yesterday. */
function visitsRestRow(todayVisitsAsked: TodayVisitsAskedVM): TodayQueueRowVM {
  const rest = todayVisitsAsked.count - todayVisitsAsked.items.length;
  const words = appointmentWords(todayVisitsAsked.word);
  return {
    id: "q-visits-more",
    kind: "visits",
    conversationId: null,
    callId: null,
    person_id: null,
    who: VISITS_ASKED_WORDS.rest(rest, words),
    initials: `+${rest}`,
    channel: "Calendar",
    when: "",
    sentence: VISITS_ASKED_WORDS.restSentence,
    quoted: false,
    status: [VISIT_ASK_WORDS.unmarked, VISITS_ASKED_WORDS.calendar],
    tone: "warn",
    warn: false,
    cta: { label: VISITS_ASKED_WORDS.open, to: todayVisitsAsked.to },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/**
 * Today's queue with yesterday's visits to mark among its rows (0047): a row for each of those named (three at most) and one
 * for the rest, after everyone who waits on a person and the steps due, before a call worth a listen. They are the team's
 * to-do as a step is: nobody waits on them, so they never take a seat from a person (the card draws the queue in order),
 * they are not counted in the head's number (it is who needs you), and the queue the brief built, which Ask, the widget
 * and the away card read, is left as it was. With none to mark, the rows as they were.
 */
export function withVisitsAsked(
  rows: TodayQueueRowVM[],
  todayVisitsAsked: TodayVisitsAskedVM | null,
): TodayQueueRowVM[] {
  if (!todayVisitsAsked) return rows;
  const mine = todayVisitsAsked.items.map(visitRow);
  if (todayVisitsAsked.count > todayVisitsAsked.items.length) mine.push(visitsRestRow(todayVisitsAsked));
  const firstCall = rows.findIndex((r) => r.kind === "call");
  const at = firstCall < 0 ? rows.length : firstCall;
  return [...rows.slice(0, at), ...mine, ...rows.slice(at)];
}
