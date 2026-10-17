import { keyParts, mondayOf, shiftKey, shiftMonth } from "../calendar/day-keys.js";
import { plural } from "../shared/words.js";
import {
  REPORT_MOST_DAYS,
  fixedDaysOf,
  monthDaysAt,
  periodSince,
  reportDaysCount,
  reportRangeKey
} from "./report-periods.js";
import { REPORT_RANGES, daysWords, fmtDay } from "./reports.js";
export function reportShortcuts(today) {
  const yesterday = shiftKey(today, -1);
  const monday = mondayOf(today);
  return [
    { id: "yesterday", label: "Yesterday", days: { from: yesterday, to: yesterday } },
    { id: "last-week", label: "Last week", days: { from: shiftKey(monday, -7), to: shiftKey(monday, -1) } },
    {
      id: "last-month",
      label: "Last month",
      days: { from: shiftMonth(today, -1), to: shiftKey(shiftMonth(today, 0), -1) }
    }
  ];
}
function shortDates(from, to) {
  if (from === to) return fmtDay(to);
  return from.slice(0, 7) === to.slice(0, 7) ? `${fmtDay(from)} \u2013 ${keyParts(to).d}` : daysWords(from, to);
}
export function reportWindowOf(range, today) {
  const picked = typeof range === "string" ? null : range;
  const period = typeof range === "string" ? range : null;
  const fixed = period === null ? null : fixedDaysOf(period);
  const to = picked?.to ?? today;
  const from = picked?.from ?? periodSince(today, fixed ?? monthDaysAt(today));
  const days = reportDaysCount({ from, to });
  const label = REPORT_RANGES.find((r) => r.id === period)?.label ?? "";
  const shortcut = picked ? reportShortcuts(today).find((s) => s.days.from === from && s.days.to === to) : void 0;
  const before = { from: shiftKey(from, -days), to: shiftKey(from, -1) };
  const dated = period === null && shortcut === void 0;
  return {
    range,
    period,
    key: reportRangeKey(range),
    from,
    to,
    days,
    live: to === today,
    dates: daysWords(from, to),
    said: period === null ? shortcut?.label ?? plural(days, "day") : fixed === null ? "This month so far" : `Last ${label}`,
    short: period === null ? shortcut?.label ?? shortDates(from, to) : label,
    beside: dated ? plural(days, "day") : daysWords(from, to),
    before: { ...before, dates: daysWords(before.from, before.to) }
  };
}
export function reportPickWords(first, band, refused) {
  if (refused?.why === "to-come") return `${fmtDay(refused.day)} is still to come. Press today or a day before.`;
  if (refused && first !== null)
    return `${fmtDay(refused.day)} is more than ${REPORT_MOST_DAYS} days from ${fmtDay(first)}. Press a nearer day.`;
  if (first === null) return `Press a first day, then a last. ${REPORT_MOST_DAYS} days at most.`;
  const days = reportDaysCount(band);
  if (days === 1) return `From ${fmtDay(first)}. Press the last day, or this one again for the day alone.`;
  return `${daysWords(band.from, band.to)}, ${plural(days, "day")}. Press to choose.`;
}
