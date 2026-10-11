// src/shared/time.ts
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
function formatterOnUse(locales, options) {
  let built = null;
  return { format: (date) => (built ??= new Intl.DateTimeFormat(locales, options)).format(date) };
}
var DATE_FMT = formatterOnUse([], { month: "short", day: "numeric" });

// src/calendar/day-keys.ts
function keyParts(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m ?? 1, d: d ?? 1 };
}
function shiftKey(key, n) {
  const { y, m, d } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}
function mondayOf(key) {
  const { y, m, d } = keyParts(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shiftKey(key, -((dow + 6) % 7));
}
function shiftMonth(key, n) {
  const { y, m } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// src/shared/words.ts
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// src/config/no-booking-link.ts
var NO_LINK_DETAILS = "their name, what they need, and where and when";
var NO_WAY_TO_SEND_LINK = `Booking: the booking link can only be sent by WhatsApp, and this business has no WhatsApp line, so never use send_booking_link and never promise a link or a message. When the caller wants to book, change or cancel a booking, take ${NO_LINK_DETAILS}, and say the team will follow up. If they would rather book themselves and a website is listed above, they can book there.`;

// src/reports/reports.ts
var REPORT_RANGES = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" },
  { days: null, id: "month", label: "Month" }
];
function dayDate(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function fmtDay(day) {
  return DATE_FMT.format(dayDate(day));
}
var daysWords = (from, to) => from === to ? fmtDay(to) : `${fmtDay(from)} \u2013 ${fmtDay(to)}`;

// src/reports/report-periods.ts
var REPORT_PERIOD_IDS = REPORT_RANGES.map((r) => r.id);
var MOST_DAYS = Math.max(...REPORT_RANGES.map((r) => r.days ?? 0));
function fixedDaysOf(period) {
  return REPORT_RANGES.find((r) => r.id === period)?.days ?? null;
}
var monthDaysAt = (dayKey) => Number(dayKey.slice(8, 10));
var periodSince = (today, days) => shiftKey(today, -(days - 1));
var REPORT_MOST_DAYS = MOST_DAYS;
var dayOrdinal = (day) => {
  const { y, m, d } = keyParts(day);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
var reportDaysCount = (days) => dayOrdinal(days.to) - dayOrdinal(days.from) + 1;
var reportRangeKey = (range) => typeof range === "string" ? range : `${range.from}~${range.to}`;

// src/reports/report-window.ts
function reportShortcuts(today) {
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
function reportWindowOf(range, today) {
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
function reportPickWords(first, band, refused) {
  if (refused?.why === "to-come") return `${fmtDay(refused.day)} is still to come. Press today or a day before.`;
  if (refused && first !== null)
    return `${fmtDay(refused.day)} is more than ${REPORT_MOST_DAYS} days from ${fmtDay(first)}. Press a nearer day.`;
  if (first === null) return `Press a first day, then a last. ${REPORT_MOST_DAYS} days at most.`;
  const days = reportDaysCount(band);
  if (days === 1) return `From ${fmtDay(first)}. Press the last day, or this one again for the day alone.`;
  return `${daysWords(band.from, band.to)}, ${plural(days, "day")}. Press to choose.`;
}
export {
  reportPickWords,
  reportShortcuts,
  reportWindowOf
};
