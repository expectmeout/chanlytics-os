/** Support queue: waits. */

import type { Tone } from "../../shell/tone";
import { dayInZone, dayPlusInZone, localToUtcMs } from "../../shared/zone/math";
import { clockDate, clockTime } from "../../shared/clock";
import { DAY_MS, WEEK_MS, spanLabel } from "../../shared/time";
import { staffName, type ConsoleAct } from "../staff";

// ------------------------------------------------------------------------------------------- the promise's clock

/**
 * Where the promise's business days are counted (Ruben, 21 Oct 2026: "We answer within 24 hours on business days"):
 * Monday to Friday in New York. One constant; holidays are not counted yet.
 */
export const SUPPORT_ZONE = "America/New_York";

/** The promise: a person answers within this much of the business days' time. */
const SUPPORT_PROMISE_MS = DAY_MS;

/** At this share of the promise a row turns amber. */
const SUPPORT_SOON = 0.75;

/** The longest span the clock walks, in days: a row older than the Console reads is past its day long since. */
const CLOCK_DAYS_MAX = 400;

const isBusinessDay = (weekday: string) => weekday !== "sat" && weekday !== "sun";

/** The midnight that ends the day `atMs` falls on, in the promise's zone. */
function midnightAfter(atMs: number): number {
  const next = dayPlusInZone(SUPPORT_ZONE, atMs, 1);
  return localToUtcMs(SUPPORT_ZONE, next.y, next.m, next.d, 0, 0);
}

/** How much business time lies between two instants: their Monday-to-Friday hours in the promise's zone. */
export function businessMsBetween(fromMs: number, toMs: number): number {
  let at = fromMs;
  let sum = 0;
  for (let i = 0; i < CLOCK_DAYS_MAX && at < toMs; i += 1) {
    const end = Math.min(midnightAfter(at), toMs);
    if (isBusinessDay(dayInZone(SUPPORT_ZONE, at).weekday)) sum += end - at;
    at = end;
  }
  return sum;
}

/**
 * When a person must have answered: 24 hours of business days after it came in. A Friday 3 PM question is due Monday
 * 3 PM; one sent on a Saturday, by the end of Monday. Days are stepped by the calendar, so a clock change moves nothing.
 */
export function supportDueAt(createdMs: number): number {
  let at = createdMs;
  let left = SUPPORT_PROMISE_MS;
  for (let i = 0; i < CLOCK_DAYS_MAX; i += 1) {
    const end = midnightAfter(at);
    if (isBusinessDay(dayInZone(SUPPORT_ZONE, at).weekday)) {
      if (end - at >= left) return at + left;
      left -= end - at;
    }
    at = end;
  }
  return at;
}

/** A row's Waiting cell: how long, the promise's moment in the reader's zone, and its share of the day used. */
export interface SupportWaitVM {
  words: string;
  tone: Tone | null;
  /** The share of the promise used, 0 to 1; null on a row with no promise left to keep. */
  part: number | null;
}

const WEEKDAY_WORDS: Record<string, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

/** "by 9:12 AM tomorrow", "by 3:00 PM Mon": the promise's moment as the reader's own calendar says it. */
function byWords(dueMs: number, nowMs: number, zone: string): string {
  const due = dayInZone(zone, dueMs);
  const when =
    due.key === dayInZone(zone, nowMs).key
      ? "today"
      : due.key === dayPlusInZone(zone, nowMs, 1).key
        ? "tomorrow"
        : dueMs - nowMs < WEEK_MS
          ? (WEEKDAY_WORDS[due.weekday] ?? clockDate(dueMs, zone, nowMs))
          : clockDate(dueMs, zone, nowMs);
  return `by ${clockTime(dueMs, zone)} ${when}`;
}

/** "3h · by 9:12 AM tomorrow" over its bar, amber at three quarters of the day; "past its day by 5h" in red. */
export function supportWaitOf(createdMs: number, nowMs: number, zone: string): SupportWaitVM {
  const due = supportDueAt(createdMs);
  if (nowMs >= due) return { words: `past its day by ${spanLabel(nowMs - due)}`, tone: "danger", part: 1 };
  const part = Math.min(1, businessMsBetween(createdMs, nowMs) / SUPPORT_PROMISE_MS);
  return {
    words: `${spanLabel(nowMs - createdMs)} · ${byWords(due, nowMs, zone)}`,
    tone: part >= SUPPORT_SOON ? "warn" : null,
    part,
  };
}

// -------------------------------------------------------------------------------------------------- the queue

/** Support's views: what needs a person, what waits on the workspace, and what was answered in the last thirty days. */
export const SUPPORT_VIEWS = ["needs", "waiting", "done"] as const;

export type SupportView = (typeof SUPPORT_VIEWS)[number];

export const SUPPORT_VIEW_WORDS: Record<SupportView, string> = {
  needs: "Needs a person",
  waiting: "Waiting on them",
  done: "Done, 30 days",
};

/** How long Done remembers an answer, and how far back the queue reads. */
export const SUPPORT_DONE_DAYS = 30;

export const SUPPORT_READ_DAYS = 90;

/** A page of the queue: Older reads the next. */
export const SUPPORT_PAGE = 50;

/** The queue's two kinds of row. */
const SUPPORT_ROW_KINDS = ["question", "ask"] as const;

export type SupportRowKind = (typeof SUPPORT_ROW_KINDS)[number];

export const SUPPORT_KIND_FILTERS = ["all", ...SUPPORT_ROW_KINDS] as const;

export type SupportKindFilter = (typeof SUPPORT_KIND_FILTERS)[number];

export const SUPPORT_KIND_FILTER_WORDS: Record<SupportKindFilter, string> = {
  all: "All",
  question: "Questions",
  ask: "Setup asks",
};

/** Where a row stands: nobody yet, someone on it, answered and waiting on the workspace, or finished. */
export type SupportState = "new" | "taken" | "waiting" | "done";

/** The acts that mark a row, by what each leaves it as. Sending again and moving it to Health change no state. */
const MARKS: Partial<Record<ConsoleAct, "open" | "answered" | "done">> = {
  report_answered: "answered",
  report_reopened: "open",
  ask_answered: "answered",
  ask_done: "done",
  ask_reopened: "open",
};

/** One of the team's marks on a row, as the log keeps it. */
export interface SupportActDto {
  act: ConsoleAct;
  target_kind: "report" | "ask";
  target_id: string;
  at: string;
  actor_email: string | null;
}

/** The latest mark of each row, by its target's id: what it is left as, when, and by whom. */
export function lastMarks(
  acts: readonly SupportActDto[],
): Map<string, { mark: "open" | "answered" | "done"; at: number; by: string }> {
  const out = new Map<string, { mark: "open" | "answered" | "done"; at: number; by: string }>();
  for (const a of acts) {
    const mark = MARKS[a.act];
    const at = Date.parse(a.at);
    if (!mark || !Number.isFinite(at)) continue;
    const was = out.get(a.target_id);
    if (!was || at > was.at) out.set(a.target_id, { mark, at, by: staffName(a.actor_email) });
  }
  return out;
}

/** The first answer each row had, by its target's id: how fast we answered, once. */
export function firstAnswers(acts: readonly SupportActDto[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of acts) {
    if (a.act !== "report_answered" && a.act !== "ask_answered") continue;
    const at = Date.parse(a.at);
    if (!Number.isFinite(at)) continue;
    const was = out.get(a.target_id);
    if (was === undefined || at < was) out.set(a.target_id, at);
  }
  return out;
}

/** The parts of an address that name a desk, not a person: "info@" is nobody's first name. */
const DESK_WORDS = new Set([
  "info",
  "hello",
  "hi",
  "hey",
  "contact",
  "admin",
  "support",
  "team",
  "office",
  "sales",
  "booking",
  "bookings",
  "frontdesk",
  "reception",
  "mail",
  "email",
  "enquiries",
  "inquiries",
  "help",
  "service",
  "billing",
  "accounts",
  "owner",
  "manager",
  "noreply",
]);

/**
 * A first name from an address, where it starts with one: "ruben@" and "dana.kim@" say a name; "info@", "j@" and
 * "x92@" do not. Only when they gave no name of their own.
 */
export function firstNameOfAddress(email: string | null | undefined): string | null {
  const word = ((email ?? "").split("@")[0] ?? "").split(/[._+-]/)[0] ?? "";
  if (!/^[a-z]{2,}$/i.test(word) || DESK_WORDS.has(word.toLowerCase())) return null;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
