/**
 * A next step (0007, amended; 00166): a note with a day. What every page says of its day, the days a picker offers,
 * whose steps are due, and who a step is for -- one derivation each, for the person's page, the deal card, the
 * Pipeline, Today and the thread. The day is the business's calendar's. A step is the team's (the table holds it), so
 * none of this ever reaches the receptionist.
 */
import { clockDate, clockNear, wallClockAt, zoneDayKey } from "../shared/clock";
import { isRealDate } from "../config/config";

/** How a step's day stands against the business's today. */
export type StepDue = "past" | "today" | "ahead";

/** A step's day, as every page says it. */
export interface StepDayVM {
  /** The day itself by the business's calendar: "2026-09-26". */
  day: string;
  due: StepDue;
  /** The day near today, as a chip says it (clockNear): "today", "tomorrow", "Thu", "Sep 30". */
  near: string;
  /** "Due today" · "Due tomorrow" · "Due Thu" · "Due Sep 30" · "Overdue since Mon" · "Overdue since Sep 20". */
  words: string;
}

/** A step's day said against the business's today; null for a day that is not one. */
export function stepDayOf(day: string | null | undefined, tz: string, nowMs: number): StepDayVM | null {
  if (!day || !isRealDate(day)) return null;
  const at = wallClockAt(tz, day, 12, 0);
  if (!Number.isFinite(at)) return null;
  const today = zoneDayKey(nowMs, tz);
  const due: StepDue = day < today ? "past" : day === today ? "today" : "ahead";
  const near = clockNear(at, tz, nowMs);
  return { day, due, near, words: due === "past" ? `Overdue since ${near}` : `Due ${near}` };
}

/** Whether a step's day has come: today, or before it. The one rule, wherever a step is called due. */
export function stepIsDue(step: { due: StepDue } | null | undefined): boolean {
  return !!step && step.due !== "ahead";
}

/**
 * A step's day said at `nowMs`, once it has come; null while it is ahead, or for a step with no real day. The pages
 * judge a step at the moment People's rows were published (the surface's `fetchedAt`), as People's own Steps due
 * does, so Today, the thread, the Pipeline and that list say one thing of it.
 */
export function dueStepDay(
  step: { day: { day: string } } | null | undefined,
  tz: string,
  nowMs: number,
): StepDayVM | null {
  const day = step ? stepDayOf(step.day.day, tz, nowMs) : null;
  return stepIsDue(day) ? day : null;
}

/** Who a note or a step is for, in the page's words: "For you", "For Maria"; null when it is for anyone. */
export function forWords(
  forMe: boolean | null | undefined,
  forUserId: string | null | undefined,
  forName: string | null | undefined,
): string | null {
  if (forMe) return "For you";
  const name = (forName ?? "").trim();
  return forUserId && name ? `For ${name}` : null;
}

/** A person's next step, as a row carries it: the earliest open one (people_list's step_* columns). */
export interface PersonNextStepVM {
  id: string;
  /** The step's own words. */
  words: string;
  day: StepDayVM;
  due: StepDue;
  /** "For you", "For Maria"; null when it is for anyone. */
  forWho: string | null;
  forMe: boolean;
  /** The deal it moves, when it names one. */
  dealId: string | null;
}

/** The columns a row carries a step in (people_list v5, with who it is for attached by the API). */
export interface StepColumns {
  step_id?: string | null;
  step_body?: string | null;
  step_due_on?: string | null;
  step_for_user_id?: string | null;
  step_deal_id?: string | null;
  step_for_name?: string | null;
  step_for_me?: boolean | null;
}

/** A row's next step; null without one, or on a row read before the columns existed. */
export function nextStepOf(r: StepColumns, tz: string, nowMs: number): PersonNextStepVM | null {
  const words = r.step_body?.trim();
  if (!r.step_id || !words) return null;
  const day = stepDayOf(r.step_due_on, tz, nowMs);
  if (!day) return null;
  return {
    id: r.step_id,
    words,
    day,
    due: day.due,
    forWho: forWords(r.step_for_me, r.step_for_user_id, r.step_for_name),
    forMe: !!r.step_for_me,
    dealId: r.step_deal_id ?? null,
  };
}

/** One choice in a step's day picker: a day ("2026-09-26"), or `pick` for the date field. */
export interface StepDayChoice {
  key: string;
  /** "Today", "Tomorrow", "Thu", "Next week", "Pick a day". */
  label: string;
  /** The day in full, for its title: "Thursday, Sep 26". */
  title: string;
}

/** The day `n` days after a day, by the date alone. */
function dayPlus(key: string, n: number): string {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + n))
    .toISOString()
    .slice(0, 10);
}

/** A day's weekday, 0 for Sunday, by the date alone: a calendar day has one weekday wherever it is read. */
function weekdayOf(key: string): number {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))).getUTCDay();
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * The days a step's picker offers (0007, amended): Today, Tomorrow, the weekdays after it to this week's Friday, Next
 * week (its Monday), and Pick a day, each by the business's calendar. A day already offered is not offered again, so
 * on a Sunday tomorrow is next week.
 */
export function stepDays(nowMs: number, tz: string): StepDayChoice[] {
  const today = zoneDayKey(nowMs, tz);
  const wd = weekdayOf(today);
  const out: StepDayChoice[] = [];
  const add = (key: string, label: string) => {
    if (out.some((c) => c.key === key)) return;
    const long = WEEKDAYS[weekdayOf(key)];
    out.push({ key, label, title: `${long}, ${clockDate(wallClockAt(tz, key, 12, 0), tz, nowMs)}` });
  };
  add(today, "Today");
  add(dayPlus(today, 1), "Tomorrow");
  // Monday to Friday, the days after tomorrow up to Friday; a weekend's Friday has passed.
  const toFriday = wd >= 1 && wd <= 5 ? 5 - wd : -1;
  for (let i = 2; i <= toFriday; i++) add(dayPlus(today, i), WEEKDAYS[weekdayOf(dayPlus(today, i))].slice(0, 3));
  add(dayPlus(today, wd === 0 ? 1 : 8 - wd), "Next week");
  out.push({ key: "pick", label: "Pick a day", title: "Choose any day" });
  return out;
}

/** How many steps due Today names at the head of the day, the rest a line to People's Steps due. */
export const TODAY_STEPS_MAX = 3;

/**
 * The people whose next step is due, today or before, for Today's day panel: the oldest day first, then by name, at
 * most `max`, and how many more there are. Each day is judged again at `nowMs`, so a row read yesterday says today's.
 */
export function todayStepsDue<T extends { name: string; nextStep: PersonNextStepVM | null }>(
  rows: readonly T[],
  nowMs: number,
  tz: string,
  max = TODAY_STEPS_MAX,
): { rows: { row: T; step: PersonNextStepVM }[]; count: number; more: string | null } {
  const due = rows
    .map((row): { row: T; step: PersonNextStepVM } | null => {
      const s = row.nextStep;
      const day = dueStepDay(s, tz, nowMs);
      return s && day ? { row, step: { ...s, day, due: day.due } } : null;
    })
    .filter((x): x is { row: T; step: PersonNextStepVM } => x !== null)
    .sort((a, b) => a.step.day.day.localeCompare(b.step.day.day) || a.row.name.localeCompare(b.row.name));
  const cap = Math.max(0, max);
  return {
    rows: due.slice(0, cap),
    count: due.length,
    more: due.length > cap ? `and ${due.length - cap} more` : null,
  };
}
