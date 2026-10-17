import { mondayOf, shiftKey } from "../calendar/day-keys.js";
import { zoneDayKey } from "../shared/clock.js";
import { pct, sumOf } from "../shared/numbers.js";
import { isoMs } from "../shared/time.js";
import { plural } from "../shared/words.js";
import {
  reviewsFromProfile
} from "../google/google.js";
import { periodSince } from "./report-periods.js";
import { dayPointOf, fmtDay, quantile } from "./reports.js";
export const REVIEW_REPLY_TIME_MIN = 3;
export function isReviewsLedgerDto(answer) {
  return typeof answer === "object" && answer !== null && "timezone" in answer && typeof answer.timezone === "string" && "today" in answer && typeof answer.today === "string" && "days" in answer && typeof answer.days === "number" && "on_record" in answer && typeof answer.on_record === "object" && "written" in answer && Array.isArray(answer.written) && "waiting" in answer && Array.isArray(answer.waiting);
}
export function reviewsAreOnRecord(google) {
  return google.listing !== null && reviewsFromProfile(google.connection);
}
export function reviewsWindowOf(last, days) {
  const since = periodSince(last, days);
  return { since, priorSince: periodSince(shiftKey(since, -1), days) };
}
export function reviewsHistoryOf(ledger, connection, tz) {
  if (ledger.on_record.complete) return { complete: true, from: null };
  const began = isoMs(connection?.connected_at);
  return { complete: false, from: began === null ? null : zoneDayKey(began, tz) };
}
const historyReaches = (h, day) => h.complete || h.from !== null && h.from <= day;
export const historyWords = (h) => h.complete ? null : h.from ? `history on record starts ${fmtDay(h.from)}` : "no review history on record yet";
const STARS = [5, 4, 3, 2, 1];
function reviewsStarMixOf(current) {
  const counts = STARS.map((n) => ({ n, value: current.filter((r) => r.rating === n).length }));
  const rated = sumOf(counts.map((c) => c.value));
  const share = (value) => `${pct(value, rated) ?? 0}%`;
  return {
    rated,
    good: sumOf(counts.filter((c) => c.n >= 4).map((c) => c.value)),
    rows: counts.map(({ n, value }) => ({
      id: String(n),
      label: plural(n, "star"),
      value,
      display: `${value} \xB7 ${share(value)}`
    })),
    table: {
      columns: ["Stars", "Reviews", "Share"],
      rows: counts.map((c) => [plural(c.n, "star"), c.value, share(c.value)])
    }
  };
}
function reviewsWeeksOf(perDay, since, today, h) {
  const weeks = [];
  for (let monday = mondayOf(since); monday <= today; monday = shiftKey(monday, 7)) {
    const first = monday < since ? since : monday;
    if (!historyReaches(h, first)) continue;
    const sunday = shiftKey(monday, 6);
    const last = sunday > today ? today : sunday;
    let written = 0;
    for (let day = first; day <= last; day = shiftKey(day, 1)) written += perDay.get(day) ?? 0;
    weeks.push({ ...dayPointOf(first), written });
  }
  return weeks;
}
export function reviewsPeriodOf(ledger, history, { last, days, until }) {
  const { since, priorSince } = reviewsWindowOf(last, days);
  const current = ledger.written.filter((r) => r.d >= since && r.d <= last);
  const perDay = /* @__PURE__ */ new Map();
  for (const r of current) perDay.set(r.d, (perDay.get(r.d) ?? 0) + 1);
  const weeks = reviewsWeeksOf(perDay, since, last, history);
  if (!historyReaches(history, since)) return { period: { exact: false, days, until, history }, weeks };
  const answered = current.filter((r) => r.replied);
  const waits = answered.flatMap((r) => r.secs === null ? [] : [r.secs]).sort((a, b) => a - b);
  const mix = reviewsStarMixOf(current);
  return {
    period: {
      exact: true,
      days,
      until,
      history,
      written: current.length,
      prior: historyReaches(history, priorSince) ? ledger.written.filter((r) => r.d >= priorSince && r.d < since).length : null,
      answered: answered.length,
      receptionist: answered.filter((r) => r.by === "receptionist").length,
      timed: waits.length,
      replySeconds: waits.length >= REVIEW_REPLY_TIME_MIN ? quantile(waits, 0.5) : null,
      rated: mix.rated,
      good: mix.good,
      mix,
      daily: Array.from({ length: days }, (_, i) => perDay.get(shiftKey(since, i)) ?? 0)
    },
    weeks
  };
}
