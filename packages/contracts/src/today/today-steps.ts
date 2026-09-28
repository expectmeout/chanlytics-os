/**
 * The steps due at the head of the day (0007, amended): whose next step's day has come or gone, the oldest first,
 * as steps.ts judges them.
 */
import { NOTE_WORDS, type PersonRowVM } from "../people/people";
import { TODAY_STEPS_MAX, todayStepsDue, type StepDue } from "../notes/steps";

/* ------------------------------------------------ the steps due (0007, amended) */

/** One step due as Today names it: who, what, and when it was due, the oldest first. */
export interface TodayStepVM {
  personId: string;
  name: string;
  words: string;
  /** "Due today", "Overdue since Mon". */
  when: string;
  due: StepDue;
  forWho: string | null;
}

export interface TodayStepsVM {
  title: string;
  items: TodayStepVM[];
  /** "and 2 more", to People's Steps due; null when every one is named. */
  more: { words: string; to: string } | null;
}

/**
 * The steps due at the head of the day (0007, amended), in every workspace, calendar or not: whose next step's day has
 * come or gone, the oldest first, three at most, and a line to People's Steps due for the rest. Null with none due.
 * Each day is judged at `nowMs`: the page passes the moment People's rows were published, as every page judges a
 * step (steps.ts dueStepDay), so this block and the list its line opens say one thing.
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
    title: NOTE_WORDS.stepsDue,
    items: due.rows.map(({ row, step }) => ({
      personId: row.id,
      name: row.name,
      words: step.words,
      when: step.day.words,
      due: step.due,
      forWho: step.forWho,
    })),
    more: due.more ? { words: due.more, to: "clients/seg:steps_due" } : null,
  };
}
