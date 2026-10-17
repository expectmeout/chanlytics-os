import { isDayKey, keyParts, shiftKey } from "../calendar/day-keys.js";
import { DAY_MS } from "../shared/time.js";
import { REPORT_RANGES } from "./reports.js";
export const REPORT_PERIOD_IDS = REPORT_RANGES.map((r) => r.id);
export const REPORT_PERIOD_DEFAULT = "30d";
export const CAMPAIGNS_RESULTS_PERIOD = "30d";
export const REPORT_PERIOD_STORAGE = "chanlytics.report.period";
const MOST_DAYS = Math.max(...REPORT_RANGES.map((r) => r.days ?? 0));
export const isReportPeriod = (value) => REPORT_RANGES.some((r) => r.id === value);
export function fixedDaysOf(period) {
  return REPORT_RANGES.find((r) => r.id === period)?.days ?? null;
}
export const monthDaysAt = (dayKey) => Number(dayKey.slice(8, 10));
export const periodSince = (today, days) => shiftKey(today, -(days - 1));
export function reportPeriodOf(asked) {
  if (asked.period !== void 0) return isReportPeriod(asked.period) ? asked.period : null;
  return REPORT_PERIOD_DEFAULT;
}
export function reportDaysAsked(view) {
  const asked = Number(view);
  return Number.isInteger(asked) && asked >= 1 && asked <= MOST_DAYS ? asked : null;
}
export const REPORT_MOST_DAYS = MOST_DAYS;
const isRealDay = (value) => isDayKey(value) && shiftKey(value, 0) === value;
export const isReportDays = (value) => typeof value === "object" && value !== null && isRealDay(value.from) && isRealDay(value.to);
const dayOrdinal = (day) => {
  const { y, m, d } = keyParts(day);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
export const reportDaysCount = (days) => dayOrdinal(days.to) - dayOrdinal(days.from) + 1;
export const reportRangeKey = (range) => typeof range === "string" ? range : `${range.from}~${range.to}`;
export function reportRangeOfKey(key) {
  if (isReportPeriod(key)) return key;
  const [from, to, more] = String(key ?? "").split("~");
  return more === void 0 && isRealDay(from) && isRealDay(to) && from <= to ? { from, to } : null;
}
export const sameReportRange = (a, b) => reportRangeKey(a) === reportRangeKey(b);
export function reportDaysRefusal(days, today) {
  if (!isReportDays(days)) return "from and to are days, written YYYY-MM-DD.";
  if (days.from > days.to) return "from is after to.";
  if (days.to > today) return "A report ends today at the latest.";
  if (reportDaysCount(days) > MOST_DAYS) return `A report covers ${MOST_DAYS} days at most.`;
  return null;
}
export function reportRangeAsked(asked) {
  if (asked.from === void 0 && asked.to === void 0) return reportPeriodOf(asked);
  if (asked.period !== void 0) return null;
  return isRealDay(asked.from) && isRealDay(asked.to) ? { from: asked.from, to: asked.to } : null;
}
