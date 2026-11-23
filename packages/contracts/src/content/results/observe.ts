/**
 * When a post's numbers are read, and what one number read is (the content loop PRD's 9.1): an hour, a day, 3, 7 and 28
 * days after it went up, each step one read of every number Chanlytics names, kept as read. A number is a running total
 * since the post went up, so a day's change is the difference of two reads, never the number itself.
 */
import { DAY_MS, HOUR_MS } from "../../shared/time";
import { OBSERVE_STEPS, type MetricAvailability, type ObserveStep, type PostMetric } from "./sets";

/** How long after a post went up each step reads it. */
const OBSERVE_STEP_MS: Readonly<Record<ObserveStep, number>> = {
  "1h": HOUR_MS,
  "1d": DAY_MS,
  "3d": 3 * DAY_MS,
  "7d": 7 * DAY_MS,
  "28d": 28 * DAY_MS,
};

/** When a step reads a post that went up at `publishedAt`. */
export function observeDueAt(publishedAt: string, step: ObserveStep): string {
  return new Date(Date.parse(publishedAt) + OBSERVE_STEP_MS[step]).toISOString();
}

/** The step after this one, the first where none was read yet, or null once the last was. */
export function nextObserveStep(step: ObserveStep | null): ObserveStep | null {
  if (step === null) return OBSERVE_STEPS[0];
  return OBSERVE_STEPS[OBSERVE_STEPS.indexOf(step) + 1] ?? null;
}

/** One number as a read gave it: a value only where it was there (a missing number is never zero). */
export interface Observation {
  metric: PostMetric;
  value: number | null;
  availability: MetricAvailability;
}
