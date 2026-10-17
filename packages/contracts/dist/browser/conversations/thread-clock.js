import { waitedLabel } from "../shared/time.js";
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
