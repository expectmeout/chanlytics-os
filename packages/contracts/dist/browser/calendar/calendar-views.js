import { DOW, keyParts, mondayOf, monthSpan, shiftKey } from "./day-keys.js";
import { longDate, shortDate } from "./calendar-words.js";
export function spanForView(view, anchor) {
  if (view === "month") return monthSpan(anchor);
  if (view === "agenda") return { from: anchor, days: 14 };
  return { from: mondayOf(anchor), days: 7 };
}
export function windowFor(anchor) {
  return { from: shiftKey(mondayOf(`${anchor.slice(0, 7)}-01`), -7), days: 63 };
}
export function coversSpan(days, from, count) {
  if (!days.length || count < 1) return false;
  return days[0].key <= from && days[days.length - 1].key >= shiftKey(from, count - 1);
}
export function frameOf(key, todayKey) {
  const { y, m, d } = keyParts(key);
  return {
    key,
    dow: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
    date: shortDate(key),
    long: longDate(key),
    dayNum: String(d),
    today: key === todayKey,
    past: key < todayKey
  };
}
