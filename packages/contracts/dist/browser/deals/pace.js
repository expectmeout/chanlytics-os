import { isYes, PACE_WINDOW_DAYS } from "./deal-waits.js";
import { quantile } from "../reports/reports.js";
import { DAY_MS, HOUR_MS } from "../shared/time.js";
export const SAME_SITTING_MS = HOUR_MS;
export function yesWaits(rows) {
  return rows.filter(isYes).map((d) => d.decided_at ? Date.parse(d.decided_at) - Date.parse(d.proposed_at) : Number.NaN).filter((ms) => Number.isFinite(ms) && ms >= SAME_SITTING_MS).map((ms) => Math.floor(ms / DAY_MS)).sort((a, b) => a - b);
}
export function medianWait(waits) {
  const m = quantile([...waits], 0.5);
  return m === null ? null : Math.round(m);
}
export function dealPaceFrom(rows, nowMs) {
  const since = nowMs - PACE_WINDOW_DAYS * DAY_MS;
  const waits = yesWaits(rows.filter((d) => d.decided_at !== null && Date.parse(d.decided_at) >= since));
  return { median_days: medianWait(waits), yeses: waits.length };
}
