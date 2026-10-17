import { recordOrNull } from "../../shared/unknown.js";
const SERIES_RECORDS = [
  ["reached", "now"],
  ["reached", "before"],
  ["by_channel", "now"],
  ["by_channel", "before"],
  ["first_came", "by_via"],
  ["consent", "now", "yes", "by_source"],
  ["consent", "now", "yes", "by_purpose"],
  ["consent", "now", "stop", "by_source"],
  ["consent", "now", "stop", "by_purpose"],
  ["consent", "before"],
  ["email_stopped", "by_reason"],
  ["steps"]
];
const hasRecordAt = (from, path) => path.reduce((at, key) => at === null ? null : recordOrNull(at[key]), from) !== null;
export function isPeopleSeriesDto(answer) {
  const a = recordOrNull(answer);
  return a !== null && typeof a.timezone === "string" && typeof a.today === "string" && typeof a.days === "number" && SERIES_RECORDS.every((path) => hasRecordAt(a, path));
}
export function peopleDtoOf(series, parts) {
  const asked = series ?? parts.head;
  return {
    timezone: asked.timezone,
    today: asked.today,
    ...asked.end === void 0 ? {} : { end: asked.end },
    days: asked.days,
    series,
    now: parts.now
  };
}
