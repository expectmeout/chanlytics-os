/**
 * The sample's day: the one clock every builder under today-sample/ reads, so every moment is said relative to
 * `nowMs` and the day is always today. Built once per sample by today-sample.ts and handed to each surface's builder.
 */
import { zoneDayKey, zoneMidnight } from "@chanlytics/contracts";

export const ZONE = "America/New_York";
export const MIN = 60_000;

/**
 * Which day the sample is: the usual one the tests walk, a busy one that overflows every cap on the page, or
 * a day whose calendar could not be read — the state that used to draw nothing at all, so there was nothing
 * to look at and no way to find out.
 */
export type SampleDay = "usual" | "busy" | "unreadable";

export interface SampleClock {
  nowMs: number;
  now: Date;
  /** The business's day, "YYYY-MM-DD". */
  today: string;
  /** Local midnight of that day, in ms. */
  midnight: number;
  /** An instant `min` minutes before now. */
  ago: (min: number) => string;
  /** An instant at h:mm today on the business's clock. */
  at: (h: number, m?: number, dayOffset?: number) => string;
}

export function sampleClock(nowMs: number): SampleClock {
  const today = zoneDayKey(nowMs, ZONE);
  const midnight = zoneMidnight(ZONE, today);
  return {
    nowMs,
    now: new Date(nowMs),
    today,
    midnight,
    ago: (min: number) => new Date(nowMs - min * MIN).toISOString(),
    at: (h: number, m = 0, dayOffset = 0) =>
      new Date(midnight + dayOffset * 24 * 60 * MIN + (h * 60 + m) * MIN).toISOString(),
  };
}

export const phone = (last4: string) => `+1305555${last4}`;
