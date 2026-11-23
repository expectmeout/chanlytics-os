/**
 * When a post's numbers are read, and what one number read is (the content loop PRD's 9.1): an hour, a day, 3, 7 and 28
 * days after it went up, each step one read of every number Chanlytics names, kept as read. A number is a running total
 * since the post went up, so a day's change is the difference of two reads, never the number itself. A story is up for
 * a day, and Instagram answers for an ended one as for nothing and says nothing when it ends: so it is read at an hour
 * and once more before its day is out, and never after. The database's due list (post_observations_due) keeps the same
 * schedule.
 */
import { DAY_MS, HOUR_MS } from "../../shared/time";
import type { PostKind } from "../posts";
import { OBSERVE_STEPS, type MetricAvailability, type ObserveStep, type PostMetric } from "./sets";

/** How long after a post went up each step reads it. */
const OBSERVE_STEP_MS: Readonly<Record<ObserveStep, number>> = {
  "1h": HOUR_MS,
  "1d": DAY_MS,
  "3d": 3 * DAY_MS,
  "7d": 7 * DAY_MS,
  "28d": 28 * DAY_MS,
};

/**
 * A story's day read, 22 hours after it went up: two hours before it ends, so four of the health sweep's half-hour
 * passes are left to ask for it (results-upkeep.ts).
 */
const STORY_DAY_READ_MS = 22 * HOUR_MS;

/** The steps a story is read at: its hour, and its day before it ends. */
const STORY_STEPS = ["1h", "1d"] as const satisfies readonly ObserveStep[];

/** The steps a post of this kind is read at, in order. */
export function observeStepsOf(kind: PostKind): readonly [ObserveStep, ...ObserveStep[]] {
  return kind === "story" ? STORY_STEPS : OBSERVE_STEPS;
}

/** When a step reads a post of this kind that went up at `publishedAt`. */
export function observeDueAt(publishedAt: string, step: ObserveStep, kind: PostKind): string {
  const after = kind === "story" && step === "1d" ? STORY_DAY_READ_MS : OBSERVE_STEP_MS[step];
  return new Date(Date.parse(publishedAt) + after).toISOString();
}

/** The step after this one for a post of this kind, the first where none was read yet, or null once the last was. */
export function nextObserveStep(step: ObserveStep | null, kind: PostKind): ObserveStep | null {
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
