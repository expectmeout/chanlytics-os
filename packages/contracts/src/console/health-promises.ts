/**
 * Health's promises (decision 0068): the seven targets the platform wrote down (decision 0031, PLATFORM_NUMBERS), judged
 * a day at a time over the nightly roll-up's days, for customers, for ours, or for every workspace. A cell is kept,
 * missed, or nothing to judge that day; never kept for a day with no number. The pager reads the same targets through
 * pastTarget, so the grid and the page cannot disagree. Pure.
 */
import { PLATFORM_NUMBERS, pastTarget, type PlatformDayRowDto } from "../workspace/platform-days";
import { DAY_MS, HOUR_MS, MIN_MS } from "../shared/time";
import { PLATFORM_WHERE, inScope, type HealthScope } from "./health-scope";

type PromiseName = {
  [K in keyof typeof PLATFORM_NUMBERS]: (typeof PLATFORM_NUMBERS)[K] extends { promise: true } ? K : never;
}[keyof typeof PLATFORM_NUMBERS];

/** Each promise in a person's words: its line, how it is measured, and the tile's short name for it. */
const PROMISE_WORDS: Record<PromiseName, { title: string; small: string; short: string }> = {
  brain_p95_ms: { title: "The receptionist answers within 10 s", small: "95th percentile", short: "the receptionist" },
  job_lag_ms: {
    title: "A job is claimed on time",
    small: "a reply 10 s, a waiting person 30 s, bulk 5 min",
    short: "jobs",
  },
  first_answer_ms: {
    title: "A customer's first answer comes fast",
    small: "30 s by text, 15 min by email · shown, not paged",
    short: "first answer",
  },
  duplicate_sends: {
    title: "Nobody gets the same words twice",
    small: "sends of one text within a minute",
    short: "duplicates",
  },
  dead_letters: { title: "No job dies", small: "jobs that failed for good", short: "dead jobs" },
  relay_lag_ms: {
    title: "An event reaches its deliveries within 15 s",
    small: "95th percentile",
    short: "event relay",
  },
  intake_lag_ms: {
    title: "A provider's delivery is kept within a minute",
    small: "95th percentile",
    short: "intake",
  },
};

const PROMISES = Object.keys(PROMISE_WORDS) as PromiseName[];

/** A second, for the figures a cell says in seconds. */
const MS_PER_SECOND = 1_000;

export type PromiseCellState = "kept" | "missed" | "none";

export interface PromiseCellVM {
  day: string;
  state: PromiseCellState;
  /** A missed day's worst figure against its target: "168 h, target 15 s". */
  words: string | null;
}

export interface PromiseRowVM {
  key: PromiseName;
  title: string;
  small: string;
  short: string;
  /** Whether the platform is paged on a day past it. */
  alarm: boolean;
  /** Missed on any day of the window; kept when every day with a number kept it; unjudged with no number at all. */
  state: "kept" | "missed" | "unjudged";
  missedDays: number;
  cells: PromiseCellVM[];
  /** The row's last word: its worst miss, "kept", or "not judged". */
  last: string;
  /** The worst miss in words, with its workspace. */
  worst: string | null;
  lastMissMs: number | null;
  /** The workspaces that missed it. */
  where: string;
}

/** A figure as a cell says it: a time in s, min or h; a count as it is. */
function promiseFigureWords(name: PromiseName, v: number): string {
  if (PLATFORM_NUMBERS[name].unit === "count") return String(v);
  if (v >= 2 * HOUR_MS) return `${Math.round(v / HOUR_MS)} h`;
  if (v >= MIN_MS) return `${(v / MIN_MS).toFixed(1)} min`;
  return `${(v / MS_PER_SECOND).toFixed(1)} s`;
}

/** Whether a day's row has the number at all: a figure, or a map with a key in it. */
function holds(row: PlatformDayRowDto, name: PromiseName): boolean {
  const v: unknown = row[name];
  if (typeof v === "number") return true;
  return !!v && typeof v === "object" && Object.keys(v).length > 0;
}

/** The roll-up's days in the window, oldest first, ending at the newest day it counted. */
function windowDays(rows: readonly PlatformDayRowDto[], days: number): string[] {
  const newest = rows.reduce((m, r) => (r.day > m ? r.day : m), "");
  if (!newest) return [];
  const end = Date.parse(`${newest}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

/**
 * The grid: one row per promise, a cell per rolled day, in the scope. A day missed when any workspace in the scope went
 * past the target; its words are the worst figure that day. Null rows (the roll-up unread) give no grid.
 */
export function promiseDaysOf(
  rows: readonly PlatformDayRowDto[] | null,
  ours: ReadonlySet<string>,
  scope: HealthScope,
  days: number,
): { days: string[]; rows: PromiseRowVM[] } {
  const inView = (rows ?? []).filter((r) => inScope(ours.has(r.tenant_id), scope));
  const span = windowDays(rows ?? [], days);
  const byDay = new Map<string, PlatformDayRowDto[]>();
  for (const r of inView) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  const out = PROMISES.map((name): PromiseRowVM => {
    const target = PLATFORM_NUMBERS[name];
    let worst: { v: number; most: number; key: string | null; name: string; day: string } | null = null;
    const missedBy = new Set<string>();
    let lastMissMs: number | null = null;
    const cells = span.map((day): PromiseCellVM => {
      const dayRows = byDay.get(day) ?? [];
      if (!dayRows.some((r) => holds(r, name))) return { day, state: "none", words: null };
      let dayWorst: { v: number; most: number; key: string | null } | null = null;
      for (const r of dayRows)
        for (const b of pastTarget(r, { all: true }).filter((x) => x.number === name)) {
          missedBy.add(r.name);
          if (!dayWorst || b.value > dayWorst.v) dayWorst = { v: b.value, most: b.most, key: b.key };
          if (!worst || b.value > worst.v) worst = { v: b.value, most: b.most, key: b.key, name: r.name, day };
        }
      if (!dayWorst) return { day, state: "kept", words: null };
      lastMissMs = Date.parse(`${day}T23:59:59Z`);
      return {
        day,
        state: "missed",
        words: `${dayWorst.key ? `${dayWorst.key} ` : ""}${promiseFigureWords(name, dayWorst.v)}, target ${promiseFigureWords(name, dayWorst.most)}`,
      };
    });
    const missedDays = cells.filter((c) => c.state === "missed").length;
    const judged = cells.some((c) => c.state !== "none");
    const w = worst as { v: number; most: number; key: string | null; name: string; day: string } | null;
    return {
      key: name,
      ...PROMISE_WORDS[name],
      alarm: target.alarm,
      state: missedDays ? "missed" : judged ? "kept" : "unjudged",
      missedDays,
      cells,
      last: w ? `${w.key ? `${w.key} ` : ""}${promiseFigureWords(name, w.v)}` : judged ? "kept" : "not judged",
      worst: w
        ? `${w.name}: ${w.key ? `${w.key} ` : ""}${promiseFigureWords(name, w.v)} on ${w.day}, target ${promiseFigureWords(name, w.most)}`
        : null,
      lastMissMs,
      where: [...missedBy].join(", ") || PLATFORM_WHERE,
    };
  });
  return { days: span, rows: out };
}
