/**
 * The times a thread says, by the business's clock: a row's time, a bubble's time with its day, and how long a
 * request has waited. The thread and call view models beside it read them here.
 */
import { MIN_MS, waitedLabel } from "../shared/time";
import { clockShort, clockStamp } from "../shared/clock";
import type { InboxThreadVM } from "./inbox-thread-vm";

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

/** How long since a moment, in the wait's one family. */
export function waitedSince(sinceMs: number, nowMs: number): string {
  return formatWaited(Math.max(0, nowMs - sinceMs));
}

/** The moments a thread's times are said from, epoch ms: they do not move with the clock, where the words do. */
export type ThreadMoments = Pick<InboxThreadVM, "lastAtMs" | "escalatedAtMs" | "wakeAtMs">;

/** What a thread says of the clock: the words its moments come to at one moment. */
type ThreadClockWords = Pick<InboxThreadVM, "lastAt" | "lastAtFull" | "waitingMin" | "waited" | "wake"> &
  Partial<Pick<InboxThreadVM, "unanswered">>;

/**
 * What a thread says of the clock as of `nowMs`, by the business's (`tz`): when it last moved, how long its hold has
 * waited, when a snooze wakes, and, given the question it handed back, how long that has gone unanswered. The view model
 * says them as it is read (inbox-thread.ts), and a page that paints a thread read earlier says them again here from the
 * moments the thread keeps: a refresh painted the tab's cached words, "9:00 AM" on yesterday's thread and "waiting 2h" on
 * a wait of 22, until the read landed a beat later and moved the rows (Ruben, 21 Oct 2026).
 */
export function inboxThreadClock(
  t: ThreadMoments & Partial<Pick<InboxThreadVM, "unanswered">>,
  tz: string,
  nowMs: number,
): ThreadClockWords {
  const lastAt = t.lastAtMs > 0 ? clockShort(t.lastAtMs, tz, nowMs) : "";
  const words: ThreadClockWords = { lastAt, lastAtFull: lastAt };
  if (t.escalatedAtMs !== undefined) {
    // A minute at the least: a hold opened this minute has waited, where "0m" would say it has not.
    words.waitingMin = Math.max(1, Math.round((nowMs - t.escalatedAtMs) / MIN_MS));
    if (words.waitingMin) words.waited = formatWaited(words.waitingMin * MIN_MS);
  }
  if (t.wakeAtMs !== undefined) words.wake = clockShort(t.wakeAtMs, tz, nowMs);
  if (t.unanswered) words.unanswered = { ...t.unanswered, waited: waitedSince(t.unanswered.sinceMs, nowMs) };
  return words;
}
