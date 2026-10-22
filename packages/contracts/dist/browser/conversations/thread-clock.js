import { MIN_MS, waitedLabel } from "../shared/time.js";
import { clockShort, clockStamp } from "../shared/clock.js";
export function shortTime(iso, tz, now) {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? clockShort(ms, tz, now.getTime()) : "";
}
export function bubbleTime(iso, tz, now) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockStamp(ms, tz, now.getTime()) : "";
}
export function formatWaited(ms) {
  return waitedLabel(ms);
}
export function waitedSince(sinceMs, nowMs) {
  return formatWaited(Math.max(0, nowMs - sinceMs));
}
export function inboxThreadClock(t, tz, nowMs) {
  const lastAt = t.lastAtMs > 0 ? clockShort(t.lastAtMs, tz, nowMs) : "";
  const words = { lastAt, lastAtFull: lastAt };
  if (t.escalatedAtMs !== void 0) {
    words.waitingMin = Math.max(1, Math.round((nowMs - t.escalatedAtMs) / MIN_MS));
    if (words.waitingMin) words.waited = formatWaited(words.waitingMin * MIN_MS);
  }
  if (t.wakeAtMs !== void 0) words.wake = clockShort(t.wakeAtMs, tz, nowMs);
  if (t.unanswered) words.unanswered = { ...t.unanswered, waited: waitedSince(t.unanswered.sinceMs, nowMs) };
  return words;
}
