/**
 * What Today draws of Reports, built the way the surface builds it and never typed by hand: a report's series through contracts'
 * headlineOf and toHeadlineVM (the wire's shape and the words it becomes). The period's counts sit on the series' last day, so
 * the sums are exactly what is asked for; `before` is the period before's customer messages (null: nothing was lived then, and
 * nothing is compared); `booking` is the calendar's line over the same days (null: none counted).
 */
import { DAY_MS, REPORT_RANGES, dayInZone, headlineOf, toHeadlineVM } from "@chanlytics/contracts";

/**
 * The week's card, already answered (Working for you, W9): the rest a member's Got it keeps, by this week's Monday in the
 * business's zone, until the next. A day with anything answered in its last seven draws that card first while nobody
 * waits; a test of what stands after it puts this in its morning's `rested`.
 */
export function weekSeen(zone = "America/New_York", nowMs = Date.now()) {
  const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const weekOf = (atMs) => {
    const day = dayInZone(zone, atMs);
    const at = Date.UTC(day.y, day.m - 1, day.d);
    const back = (new Date(at).getUTCDay() + 6) % 7;
    return [`week:${keyOf(at - back * DAY_MS)}`, keyOf(at + (7 - back) * DAY_MS)];
  };
  // The week of the day before and the day after too: a page on another zone's clock (a test's Chicago) is a day off at
  // most, and on a Sunday night with the clock twelve hours on the two stood in different weeks (CI, 22 Nov 2026).
  return Object.fromEntries([nowMs - DAY_MS, nowMs, nowMs + DAY_MS].map(weekOf));
}

const dayKey = (n) => new Date(Date.UTC(2026, 7, 1 + n)).toISOString().slice(0, 10);
const empty = (day) => ({
  day,
  messages_in: 0,
  conversations: 0,
  answered_ai: 0,
  answered_you: 0,
  unanswered: 0,
  out_ai: 0,
  out_you: 0,
  escalations: 0,
  calls: 0,
  call_seconds: 0,
  new_contacts: 0,
});

export function headline({
  days = 7,
  in: messages = 0,
  ai = 0,
  you = 0,
  none = 0,
  calls = 0,
  before = null,
  booking = null,
} = {}) {
  const period = REPORT_RANGES.find((r) => r.days === days)?.id ?? "month";
  const series = Array.from({ length: days * 2 }, (_, i) => empty(dayKey(i)));
  const last = days * 2 - 1;
  series[last] = {
    ...series[last],
    messages_in: messages,
    answered_ai: ai,
    answered_you: you,
    unanswered: none,
    calls,
  };
  if (before !== null) series[0] = { ...series[0], messages_in: before };
  const dto = {
    timezone: "America/New_York",
    days,
    span_days: days * 2,
    today: dayKey(last),
    series,
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  };
  return toHeadlineVM(headlineOf(dto, period, booking));
}
