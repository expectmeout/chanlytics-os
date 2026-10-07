/**
 * The times a thread says, by the business's clock: a row's time, a bubble's time with its day, and how long a
 * request has waited. The thread and call view models beside it read them here.
 */
import { waitedLabel } from "../shared/time";
import { clockShort, clockStamp } from "../shared/clock";

/**
 * A time in a thread or a call, by the business's clock (clock.ts). The two
 * formatters here were built without a zone, so a message read in the browser's
 * zone and "the same day" meant the browser's day: one call read as two times
 * (the 12 September audit's D5). The formatters are built once per zone there,
 * which keeps what these hoisted ones were for: these mappers run twice per
 * refresh over every message, and constructing a formatter per call froze the
 * page when a message arrived.
 */
export function shortTime(iso: string | null, tz: string, now: Date): string {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? clockShort(ms, tz, now.getTime()) : "";
}

/** Transcript bubbles keep day context across multi-day threads. */
export function bubbleTime(iso: string, tz: string, now: Date): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockStamp(ms, tz, now.getTime()) : "";
}

/** "8m" / "3h" / "2d". An overnight wait is the NORMAL case for a morning
 *  brief, and "561 min" is not a number anyone reads as half a day. */
/** A wait, in the one family every surface reads (time.ts): "1m" at the least, "3h", "2d". */
export function formatWaited(ms: number): string {
  return waitedLabel(ms);
}
