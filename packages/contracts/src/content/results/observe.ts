/**
 * When a post's numbers are read, and what one number read is (the content loop PRD's 9.1): an hour, a day, 3, 7 and 28
 * days after it went up, each step one read of every number Chanlytics names, kept as read. A number is a running total
 * since the post went up, so a day's change is the difference of two reads, never the number itself. A story is up for
 * a day, and Instagram answers for an ended one as for nothing and says nothing when it ends: so it is read at an hour
 * and once more before its day is out, and never after. The database's due list (post_observations_due) keeps the same
 * schedule.
 */
import { DAY_MS, HOUR_MS } from "../../shared/time";
import { STORY_DAY_MS } from "../placements/story-day";
import type { PostKind } from "../posts";
import { TIMED_OBSERVE_STEPS, type MetricAvailability, type PostMetric, type TimedObserveStep } from "./sets";

/** How long after a post went up each of the clock's steps reads it. */
const OBSERVE_STEP_MS: Readonly<Record<TimedObserveStep, number>> = {
  "1h": HOUR_MS,
  "1d": DAY_MS,
  "3d": 3 * DAY_MS,
  "7d": 7 * DAY_MS,
  "28d": 28 * DAY_MS,
};

/**
 * A story's day read, two hours before its day ends (placements/story-day.ts: 22 hours after it went up), so four of
 * the health sweep's half-hour passes are left to ask for it (results-upkeep.ts).
 */
const STORY_DAY_READ_MS = STORY_DAY_MS - 2 * HOUR_MS;

/** The clock's steps a story is read at: its hour, and its day before it ends. */
const STORY_STEPS = ["1h", "1d"] as const satisfies readonly TimedObserveStep[];

/** The clock's steps a post of this kind is read at, in order. */
function observeStepsOf(kind: PostKind): readonly [TimedObserveStep, ...TimedObserveStep[]] {
  return kind === "story" ? STORY_STEPS : TIMED_OBSERVE_STEPS;
}

/** When one of the clock's steps reads a post of this kind that went up at `publishedAt`. */
export function observeDueAt(publishedAt: string, step: TimedObserveStep, kind: PostKind): string {
  const after = kind === "story" && step === "1d" ? STORY_DAY_READ_MS : OBSERVE_STEP_MS[step];
  return new Date(Date.parse(publishedAt) + after).toISOString();
}

/**
 * The clock's step after this one for a post of this kind, the first where none was read yet, or null once its last
 * was. The clock never asks for `last`: a take-down does.
 */
export function nextObserveStep(step: TimedObserveStep | null, kind: PostKind): TimedObserveStep | null {
  const steps = observeStepsOf(kind);
  if (step === null) return steps[0];
  const at = steps.indexOf(step);
  return at < 0 ? null : (steps[at + 1] ?? null);
}

/** One number as a read gave it: a value only where it was there (a missing number is never zero). */
export interface Observation {
  metric: PostMetric;
  value: number | null;
  availability: MetricAvailability;
}
