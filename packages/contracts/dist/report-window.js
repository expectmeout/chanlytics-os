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

// src/consent/consent.ts
var ASKED_TO_STOP_SHORT = "asked to stop";
var ASKED_TO_STOP = `${ASKED_TO_STOP_SHORT} receiving messages`;
var STOP_WORDS = {
  pill: "Opted out",
  mark: "Stopped",
  short: ASKED_TO_STOP_SHORT,
  /** The short words as a heading over a count ("Asked to stop · 3"): a run's figure. */
  heading: `${ASKED_TO_STOP_SHORT.charAt(0).toUpperCase()}${ASKED_TO_STOP_SHORT.slice(1)}`,
  line: ASKED_TO_STOP,
  tone: "plain",
  /** The clause after a name ("Dana asked to stop receiving messages"), or on its own with a capital when none is given. */
  said: (who) => who ? `${who} ${ASKED_TO_STOP}` : `${ASKED_TO_STOP.charAt(0).toUpperCase()}${ASKED_TO_STOP.slice(1)}`
};
var OPT_OUT_REFUSAL = `This customer ${STOP_WORDS.line}. They can text START to opt back in.`;

// src/conversations/escalations.ts
var ESCALATION_REASON_LABELS = {
  human_token: "Customer asked for a person",
  refusal: "Assistant declined to answer",
  brain_error: "The receptionist hit an error \u2014 a holding message went out",
  non_text: "Sent a voice note / photo",
  send_failed: "Reply failed to deliver",
  policy_block: "Held by your reply setting \u2014 nothing was sent",
  policy_ask: "Set to Ask me first \u2014 a person answers this one",
  person_hold: "You handle this person \u2014 the receptionist stays out",
  rate_cap: "Too many replies too fast \u2014 the receptionist paused itself",
  deadman: "Nobody picked this up \u2014 flagged after silence",
  manual: "Flagged manually",
  opt_out: STOP_WORDS.said(),
  state_unavailable: "The receptionist could not read this thread \u2014 needs a human",
  stale: "Arrived hours late \u2014 too old to answer automatically",
  budget: "The day's model budget is used up \u2014 the receptionist paused itself",
  callback: "Needs a call back \u2014 the phone receptionist could not finish it",
  paused: "Held \u2014 the workspace is paused until billing resumes",
  carriers: "Held \u2014 the carriers have not approved this line for texting yet",
  email_review: "Wrote by email \u2014 a person answers"
};
var ESCALATION_REASON_SHORT = {
  human_token: "asked for a person",
  refusal: "the receptionist declined to answer",
  brain_error: "the receptionist hit an error",
  non_text: "sent a voice note or photo",
  send_failed: "reply failed to deliver",
  policy_block: "held by your reply setting",
  policy_ask: "set to Ask me first",
  person_hold: "you handle this person",
  rate_cap: "too many replies too fast",
  deadman: "nobody picked this up",
  manual: "flagged by hand",
  opt_out: STOP_WORDS.short,
  state_unavailable: "the receptionist could not read this thread",
  stale: "arrived hours late",
  budget: "the day's model budget is used up",
  callback: "needs a call back",
  paused: "the workspace is paused until billing resumes",
  carriers: "the carriers have not approved this line",
  email_review: "wrote by email"
};
var ESCALATION_REASON_WHY = {
  human_token: "because a customer asked for a person",
  refusal: "because it declined to answer",
  brain_error: "because it hit an error",
  non_text: "for something it can't read",
  send_failed: "because a reply failed to send",
  policy_block: "because your reply setting held it",
  policy_ask: "for a booking or a question set to Ask me first",
  person_hold: "because you handle this person",
  rate_cap: "because the reply limit was reached",
  deadman: "because no answer came in time",
  manual: "because it was flagged by hand",
  opt_out: `because they ${STOP_WORDS.short}`,
  state_unavailable: "because it could not read the thread",
  stale: "because a message arrived too late to answer",
  budget: "because the day's model budget ran out",
  callback: "because they need a call back",
  paused: "because the workspace is paused",
  carriers: "while waiting on carriers",
  email_review: "because they wrote by email"
};
var ESCALATION_SUMMARIES = {
  human_token: "They asked for a person. A holding message went out \u2014 they're waiting on you.",
  refusal: "The receptionist wouldn't answer this one. A holding message went out.",
  brain_error: "The receptionist errored and sent a holding message. They're waiting on a real answer.",
  non_text: "They sent a voice note or photo the receptionist can't read. Open it and reply yourself.",
  send_failed: "The reply never reached them \u2014 as far as the customer knows, nobody answered.",
  policy_block: "Your reply setting holds every message for a person. Nothing was sent \u2014 answer them yourself.",
  policy_ask: "Your Autonomy setting hands bookings or service questions to a person. The receptionist told them someone will follow up \u2014 that someone is you.",
  person_hold: "You set the receptionist to stay out of this person's thread. Nothing was sent \u2014 answer them yourself.",
  rate_cap: "The receptionist hit its daily reply limit and stopped. NOTHING was sent \u2014 they're waiting in silence.",
  deadman: "This sat unanswered long enough to flag. Nobody has replied.",
  manual: "Flagged by hand for a human.",
  opt_out: `${STOP_WORDS.said("They")}. Nothing was sent, and nothing may be.`,
  state_unavailable: "The receptionist couldn't read this thread, so it stayed quiet. No reply went out.",
  stale: "This reached us hours after they sent it, too late to answer automatically. NOTHING was sent \u2014 they have been waiting since.",
  budget: "The day's model budget is used up, so the receptionist paused itself. NOTHING was sent \u2014 answer them yourself, or raise the budget under Settings \u203A Autonomy.",
  callback: "They phoned and the receptionist couldn't finish it.",
  paused: "The workspace is paused because billing stopped, so the receptionist did not answer. Resume from Settings \u203A Billing, or answer this one yourself.",
  carriers: "This text arrived before the carriers approved your line for texting, so the receptionist did not answer. Answer it yourself, or wait for the approval on Setup.",
  email_review: "They wrote by email. The receptionist does not answer email yet, so nothing was sent. Read it and reply from here."
};
var ESCALATION_ACTS = {
  human_token: "reply",
  refusal: "reply",
  brain_error: "reply",
  non_text: "reply",
  send_failed: "reply",
  policy_block: "reply",
  policy_ask: "reply",
  person_hold: "reply",
  rate_cap: "reply",
  deadman: "reply",
  manual: "reply",
  opt_out: "hand_back",
  state_unavailable: "reply",
  stale: "reply",
  budget: "reply",
  callback: "call_back",
  paused: "reply",
  carriers: "reply",
  email_review: "reply"
};
function holdActOf(reason) {
  return ESCALATION_ACTS[reason ?? ""] ?? "reply";
}
var HAND_BACK_REASONS = Object.keys(ESCALATION_ACTS).filter((r) => ESCALATION_ACTS[r] === "hand_back");
var WAITING_REASONS = Object.keys(ESCALATION_ACTS).filter(
  (r) => waitsOnAPerson(r)
);
function waitsOnAPerson(reason) {
  return holdActOf(reason) !== "hand_back";
}

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
