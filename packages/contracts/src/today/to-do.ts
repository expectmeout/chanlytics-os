/**
 * To do's rows on Today (decision 0076; Today in three zones, 2 Nov 2026): the steps due (0007, amended), whose next
 * step's day has come or gone, the oldest first, as steps.ts judges them; and the past week's visits nobody has marked (0047).
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
import { shortDate } from "../calendar/words/labels";
import { plural } from "../shared/words";
import { dayInZone } from "../shared/zone/math";
import { DOW, keyParts, shiftKey } from "../shared/zone/day-keys";
import type { DayFrameLike } from "./day/frame";
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
  /** The day as a chip says it near today: "today", "Mon", "Sep 30" (steps.ts StepDayVM.near). */
  near: string;
  due: StepDue;
  /** The day it was due, as a day key ("2026-11-12"). */
  dueOn: string;
  /** Whose it is, where it is someone else's ("For Maria"): a step of your own says nothing (his read, 9 Nov 2026). */
  /** Whose it is, where it is someone else's ("For Maria"): a step of your own says nothing (his read, 9 Nov 2026). */
  forWho: string | null;
  /** The member it is for, or null: Not now's move of its day sends it again (the edit sets it from what it is sent). */
  forUserId: string | null;
  /** The deal it moves, when it names one: what the next step is set against. */
  dealId: string | null;
}

/**
 * Someone else's step as a row says it, by first name, never an address: "For Dana Ortiz" is "For Dana", and a member
 * known by an address alone is named by it as a name is written, "ruben@" is "For Ruben" (the second look, L2).
 */
const forOther = (forWho: string): string => {
  const name = forWho.replace(/^For\s+/i, "").trim();
  const first = (name.split("@")[0] ?? name).split(/\s+/)[0] ?? name;
  return `For ${first.charAt(0).toUpperCase()}${first.slice(1)}`;
};

/**
 * How long a step stays named on Today once its day has gone: a week, as a person who has waited past a week is Older
 * and in no count (need-you/groups.ts). Past it the step is counted with the rest, never named (Today, calm, D23): the
 * oldest three stood on the page every morning until someone cleared them.
 */
const STEP_NAMED_DAYS = 7;

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
 * The steps due, in every workspace, calendar or not: whose next step's day has come or gone, how many in all, and
 * People's Steps due for the rest. Three at most are named: your own before the team's, each the oldest first, and none
 * more than a week overdue (D23), so a page of old steps says how many there are and names none. Null with none due.
 * Each day is judged at `nowMs`: the page passes the moment People's rows were published, as every page judges a
 * step (steps.ts dueStepDay), so these rows and the list the rest's row opens say one thing.
 */
export function todaySteps(
  rows: readonly Pick<PersonRowVM, "id" | "name" | "nextStep">[] | null | undefined,
  nowMs: number,
  tz: string,
  max = TODAY_STEPS_MAX,
): TodayStepsVM | null {
  const due = todayStepsDue(rows ?? [], nowMs, tz, Number.POSITIVE_INFINITY);
  if (!due.count) return null;
  const oldest = shiftKey(dayInZone(tz, nowMs).key, -STEP_NAMED_DAYS);
  const fresh = due.rows.filter(({ step }) => step.day.day >= oldest);
  const named = [...fresh.filter(({ step }) => step.forMe), ...fresh.filter(({ step }) => !step.forMe)];
  return {
    items: named.slice(0, Math.max(0, max)).map(({ row, step }) => ({
      personId: row.id,
      name: row.name,
      noteId: step.id,
      words: step.words,
      when: step.day.words,
      near: step.day.near,
      due: step.due,
      dueOn: step.day.day,
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
      due_on: todayStep.dueOn,
      late: todayStep.due === "past" ? todayStep.near : null,
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

/* ------------------------------ the past week's visits to mark (decision 0047, D1-visit-mark) ------------------------ */

/** The visits to mark the queue names: three, as the steps due are; the rest are one row. */
const TODAY_VISITS_MAX = 3;

/**
 * How many days back the visits to mark reach, yesterday the first of them (Ruben, 15 Nov 2026: "The last 7 days"). The
 * call of 11 Oct asked of yesterday's alone, so a visit nobody had marked by the next morning was never asked about again:
 * its record, and a Missed's follow-up while one still goes (three days, decision 0119), waited on a word nobody was asked
 * for. The board around today always holds a week back (contracts windowFor starts a week before the month's first Monday).
 */
const TODAY_VISITS_REACH_DAYS = 7;

/** One of the past week's visits nobody has marked, as the one visit line, with the record's row a press is said on. */
export interface TodayVisitAskVM {
  line: VisitLineVM;
  /** The record's row (VisitMark.id): what POST calendar/visits/[id] says Kept or Missed on. */
  markId: string;
  /** The person it is for: the row wears their face. */
  person: { id: string; name: string };
  /** The visit on the Calendar (visitDoor): the row's door. */
  to: string;
}

/**
 * The past week's unmarked visits: the ones Today names, how many in all, whether any is older than yesterday, the
 * workspace's word for one, and where the rest are.
 */
export interface TodayVisitsAskedVM {
  items: TodayVisitAskVM[];
  count: number;
  /** Every one of them by the record's row (VisitMark.id), the ones past `items` among them: what Mark all kept says. */
  markIds: string[];
  /** One of them is older than yesterday: a Kept said on it now thanks nobody (decision 0123), so Mark all says whose are. */
  older: boolean;
  word: AppointmentWord;
  /** The first of them the rows do not name (else the first): the rest row opens it, and its sheet's Next walks on. */
  to: string;
}

/** What the rows say that a visit line's own words do not. */
const VISITS_ASKED_WORDS = {
  rest: (n: number, words: ReturnType<typeof appointmentWords>) =>
    `${n} more ${n === 1 ? words.one : words.many} to mark`,
  restSentence: (older: boolean) =>
    older ? "Nobody has said whether they came, this past week." : "Nobody has said whether they came, yesterday.",
  yesterday: "Yesterday",
  open: "Open",
  calendar: "on the Calendar",
} as const;

/** A day of the past week as a visit line says one (calendar/people/visits.ts visitDay): "Tue, Nov 10", from its key. */
function pastDayWord(key: string): string {
  const { y, m, d } = keyParts(key);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ""}, ${shortDate(key)}`;
}

/** Visits to mark in a count, for To do's line: "3 appointments to mark". */
export function todayVisitsSub(count: number, word: AppointmentWord): string {
  const words = appointmentWords(word);
  return `${count} ${count === 1 ? words.one : words.many} to mark`;
}

/**
 * The past week's visits nobody has said whether they came to (the call of 11 Oct 2026 asked of yesterday's; a week back
 * since 15 Nov 2026, TODAY_VISITS_REACH_DAYS): a visit of one of the seven days before today's that has ended, that the
 * record keeps a row for (so a word can be said on it) and that is for a person the board matched. Their lines are the one
 * visit line (visitLineOfBlock), judged at `nowMs`, yesterday's first and then each day further back, each day in its
 * order; the first `max` are named and the count is all of them. Null with none, and without today in the calendar the
 * page holds (a board moved to another span holds none of it); a day of the week the page does not hold is passed over.
 * An event nobody is matched to is not asked about: a lunch on the owner's calendar is no visit, and the Calendar's panel
 * says it for the rest. The Calendar's sheet walks them by the same rule (its Next), with `max` all of them.
 */
export function todayVisitsAsked(
  cal: { days: ReadonlyArray<Pick<DayFrameLike, "key" | "today" | "blocks">> } | null,
  nowMs: number,
  word: AppointmentWord,
  max = TODAY_VISITS_MAX,
): TodayVisitsAskedVM | null {
  if (!cal) return null;
  const todayKey = cal.days.find((d) => d.today)?.key;
  if (!todayKey) return null;
  const unmarkedVisits: TodayVisitAskVM[] = [];
  let older = false;
  for (let back = 1; back <= TODAY_VISITS_REACH_DAYS; back++) {
    const key = shiftKey(todayKey, -back);
    const day = cal.days.find((d) => d.key === key);
    if (!day) continue;
    const found = unmarkedVisitsOf(day, nowMs, back === 1 ? VISITS_ASKED_WORDS.yesterday : pastDayWord(key));
    if (back > 1 && found.length) older = true;
    unmarkedVisits.push(...found);
  }
  const first = unmarkedVisits.at(0);
  if (!first) return null;
  return {
    items: unmarkedVisits.slice(0, max),
    count: unmarkedVisits.length,
    markIds: unmarkedVisits.slice(0, VISITS_KEPT_MAX).map((v) => v.markId),
    older,
    word,
    to: (unmarkedVisits.at(max) ?? first).to,
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

/** The row for the visits past the named ones: how many, and the door to the first of them on the Calendar. */
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
    sentence: VISITS_ASKED_WORDS.restSentence(todayVisitsAsked.older),
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
 * Today's queue with the past week's visits to mark among its rows (0047): a row for each of those named (three at most) and one
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
