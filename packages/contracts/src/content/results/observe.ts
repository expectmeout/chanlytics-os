/**
 * When a post's numbers are read, and what one number read is (the content loop PRD's 9.1): an hour, a day, 3, 7 and 28
 * days after it went up, each step one read of every number Chanlytics names, kept as read. A number is a running total
 * since the post went up, so a day's change is the difference of two reads, never the number itself.
 */
import { DAY_MS, HOUR_MS } from "../../shared/time";
import { TIMED_OBSERVE_STEPS, type MetricAvailability, type PostMetric, type TimedObserveStep } from "./sets";

/** How long after a post went up each of the clock's steps reads it. */
const OBSERVE_STEP_MS: Readonly<Record<TimedObserveStep, number>> = {
  "1h": HOUR_MS,
  "1d": DAY_MS,
  "3d": 3 * DAY_MS,
  "7d": 7 * DAY_MS,
  "28d": 28 * DAY_MS,
};

/** When a step reads a post that went up at `publishedAt`. */
export function observeDueAt(publishedAt: string, step: TimedObserveStep): string {
  return new Date(Date.parse(publishedAt) + OBSERVE_STEP_MS[step]).toISOString();
}

/**
 * The clock's step after this one, the first where none was read yet, or null once its last was. The clock never asks
 * for `last`: a take-down does.
 */
export function nextObserveStep(step: TimedObserveStep | null): TimedObserveStep | null {
  if (step === null) return TIMED_OBSERVE_STEPS[0];
  return TIMED_OBSERVE_STEPS[TIMED_OBSERVE_STEPS.indexOf(step) + 1] ?? null;
}

/** One number as a read gave it: a value only where it was there (a missing number is never zero). */
export interface Observation {
  metric: PostMetric;
  value: number | null;
  availability: MetricAvailability;
}
