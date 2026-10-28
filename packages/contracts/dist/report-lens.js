// src/shared/time.ts
var MIN_MS = 6e4;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
function formatterOnUse(locales, options) {
  let built = null;
  return { format: (date) => (built ??= new Intl.DateTimeFormat(locales, options)).format(date) };
}
var DATE_FMT = formatterOnUse([], { month: "short", day: "numeric" });

// src/broadcasts/run-words.ts
var REPLY_WINDOW_HOURS = 72;
var REPLY_WINDOW_MS = REPLY_WINDOW_HOURS * HOUR_MS;
var REPLY_DAYS = `${REPLY_WINDOW_HOURS / 24} days`;
var REPLY_WINDOW_WORDS = `within ${REPLY_DAYS}`;
var STUCK_DAYS = "30 days";
var BREATH_WHY = "from you within a week of it";
var HEARD_UNREAD_WORDS = `Who hears ${BREATH_WHY} could not be read just now: the send still leaves them out, so it may go to fewer.`;
var HELD_REASONS = {
  opted_out: "asked to stop",
  not_opted_in: "no recorded yes",
  // The reason the send job writes when the OTHER yes is the missing one. It was
  // added to the wire (00095) and not to these words, so the owner read the raw
  // enum `no_marketing_consent` on the broadcast's own detail pane -- and the
  // distinction it draws is the entire point of the split, so it is the last one
  // that should have arrived untranslated.
  no_marketing_consent: "no yes to offers",
  no_phone: "no number",
  // The channel picked was email and no address is on file (step 3), or no channel the send ticks could carry it.
  no_address: "no email address",
  no_channel: "no channel it can go by",
  sms_line_not_active: "the texting line is not active",
  // The workspace's month of emails or texts is used up (CAMPAIGN_MONTH_ALLOWANCE): held on its channel, never moved.
  month_allowance: "this month's allowance is used up",
  // A send by hand left them out: another message from a campaign or a broadcast reaches them within a week of it, before
  // or after (the week's breath), and they were never sent it. Spelled out rather than computed from
  // RECIPIENT_REASON_HEARD, as outcome_unknown is below; run-report.test.mjs holds the two spellings together.
  heard_this_week: "not sent: they hear from you within a week of it",
  // The message's WhatsApp version is no longer one a send can use: it holds the people who go by WhatsApp, and only them.
  template_not_approved: "its WhatsApp version is no longer approved",
  // The number is on file but no thread answers to it on this line: a stored
  // number that does not normalise, or one no contact row matches.
  no_thread: "no thread for that number",
  human_has_it: "a person had the thread",
  paused: "the workspace was paused",
  superseded_by_human: "a person answered first",
  // The receptionist's held reply, past the reply horizon after the message it answers: a person answers instead.
  too_late: "too late to send automatically",
  sms_carries_no_promotions: "no offers by text",
  // The campaigns domain offers leave from is not this deployment's to use, or the provider does not verify it: the business's
  // news by email is an offer at the door (decision D2), so it waits as an offer does. Each person's own skip, final.
  email_marketing_disabled: "offers and news by email can't leave yet: the campaigns domain isn't switched on",
  // The workspace's offers by email are paused while complaints or bounces settle (email-offers.ts), and the business's news
  // by email with them (decision D2); a visit's reminder and a reply still go.
  email_offers_paused: "offers and news by email are paused",
  // An offer's foot names the business's address, and it has none on file: the person is held until it does.
  no_business_address: "no business address on file",
  email_suppressed: "their email address stopped accepting mail",
  recipient_changed: "their email address changed",
  erased: "deleted",
  // The provider refused the send, on whichever channel the person was reached by: a page that knows the channel says
  // it by SEND_REFUSED_WORDS, and a row that does not (a person's own page, a run made before rows kept theirs) says this.
  send_failed: "the provider refused it",
  missing_value: "a value was missing",
  // A reminder's appointment moved, was cancelled or marked missed, or left the calendar between the run and the send
  // (calendar/feed-appointments.ts appointmentHolds): held, never sent for a time that no longer stands.
  appointment_changed: "their booking moved or was cancelled",
  // Spelled out rather than computed from OUTCOME_UNKNOWN: a computed key makes
  // this object opaque to the bundler, which then carries the whole map into
  // every package that imports anything from here. core-broadcast.test.mjs
  // holds the two spellings together.
  outcome_unknown: "a run that did not finish",
  // Reach out's (a cold email), short, for a run's line.
  unsubscribed: "unsubscribed",
  outreach_is_email_only: "cold email goes by email only",
  outreach_not_a_lead: "not a business your searches found",
  outreach_lead_closed: "no longer being written to",
  outreach_suppressed: "on the never-again list",
  outreach_wrote_back: "wrote back or called",
  outreach_away: "away until the day they're back",
  outreach_stopped: "you stopped writing to them",
  outreach_without_unsubscribe: "no unsubscribe link",
  outreach_needs_own_mailbox: "not from a mailbox you connected",
  sending_mailbox_not_ready: "the mailbox isn't sending",
  sending_mailbox_at_cap: "the mailbox's day is full"
};
var DELIVERY_RECEIPTS_WORDS = "each channel's own receipts";

// src/consent/consent-channels.ts
var CONSENT_CHANNELS = ["whatsapp", "sms", "email"];

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

// src/conversations/standing.ts
var NEEDS_YOU_WORD = "Needs you";

// src/reports/receptionist/receptionist-record.ts
var MISSED_CALL_TOUCH_WORDS = "an hour";

// src/reports/report-metrics.ts
var METRIC_WORDS = {
  customer_messages: "Messages your customers sent you, on every channel. A call, a message sent to them, and history brought in from before Chanlytics are not counted.",
  answered_share: "Of the customer messages that came in, the share whose first reply was the receptionist's. A message you answered first, and one nobody answered, are not the receptionist's; a campaign message is nobody's answer.",
  reply_median: "The middle time from a customer's message to the receptionist's first reply, including the hold you set before replies go out. A message you answered first, or that nobody answered, is not counted.",
  handovers: "How many times the receptionist stopped and held a conversation for you, counted when it stopped, whatever the reason. A conversation held twice counts twice.",
  calls: "Calls to the receptionist that connected. A call that rang out or dropped before anyone spoke is not counted.",
  new_people: "People whose first message in their own words, or first connected call to you, fell in this period, counted once. A message you or the receptionist sent, an automatic reply or a list's mail, a call you placed, people brought in with their history, people who asked to be forgotten, and people who have not written or phoned yet are not counted.",
  booked: "Of the people who wrote or called in this period, how many have a booking on your calendar, ahead or begun no more than a day before they asked. It is a dash where no calendar is connected or it could not be read.",
  delivered_share: `Of the messages sent, the share the channel reports as delivered or read (${DELIVERY_RECEIPTS_WORDS}). A message with no receipt yet is not counted as delivered.`,
  said_yes: `People who said yes to being messaged ${REPLY_WINDOW_WORDS} of a campaign reaching them, in their own words or recorded at the desk, counted once in the period. A yes with no campaign before it, a merge restating an answer and a person who asked to be forgotten are not counted.`,
  asked_to_stop: `People who asked to stop being messaged ${REPLY_WINDOW_WORDS} of a campaign reaching them, by STOP, a carrier's report or at the desk, and for email by the unsubscribe in the message however late it is used, counted once in the period. A stop with no campaign before it, a merge restating an answer and a person who asked to be forgotten are not counted.`,
  rating: "Your Google rating as of the last check: the average of every rating Google holds for your listing, not only this period's.",
  reviews: "How many ratings Google counts for your listing as of the last check, with words or without.",
  ratings_gained: "How many ratings Google's count rose by in this period, from the daily checks Chanlytics keeps: new ratings, with words or without. It needs two days of readings.",
  newest_review: "The newest of the five reviews Google shows for your listing, and when it was written. Google shows five at most.",
  reviews_written: "Reviews written in this period, with words or without, by the day Google dates them, from your Business Profile. A review Google later removes stays on record and is still counted.",
  reviews_answered: "Of the reviews written in this period, how many have a reply on Google, from you or the receptionist. A review with no reply yet is not answered. A reply counts as the receptionist's where the last reply Chanlytics recorded under the review was its own; every other reply is yours, written here or on Google.",
  review_reply_time: "The middle time from a review being written to its reply, over this period's reviews that have one. A reply you changed later counts from the change. It needs three replies to be said.",
  handover_first_reply: "The middle time from the receptionist handing a conversation to you, over the handovers that wanted a message, to the first message a person sent in it that went out. A handover for an opt-out or a call-back (which wants none), one nobody has replied to yet, and a message the system sent are not counted.",
  handover_settled: "The middle time from the receptionist handing a conversation to you to its being settled, over this period's handovers that have been. A handover for an opt-out or a call-back, one still open, and one settled before settling was recorded are not counted.",
  missed_calls_answered: `Of the people who rang in this period and found nobody (the call never connected, or reached voicemail), how many you or the receptionist reached within ${MISSED_CALL_TOUCH_WORDS}, by a message that went out or a call that got through. A person counts once, at their first such call; a call the receptionist placed, a person whose call is under ${MISSED_CALL_TOUCH_WORDS} old, and a call with no caller on record are not counted.`,
  answered_while_closed: "Of the customer messages that came in while your opening hours and closures say you were closed, how many the receptionist answered first. A message that came while you were open, one you answered first, and one nobody answered are not counted as answered. It is a dash until you set your opening hours.",
  waiting_on_you: "Conversations the receptionist flagged for a person that nobody has taken, as of now, whatever period is picked. One you or a teammate has taken over, and one put aside until later, are not counted.",
  call_backs: "Of the conversations that need you, the ones where the customer asked to be rung back, as of now, whatever period is picked. A call-back someone has taken over, or put aside until later, is not counted.",
  replies_held_back: "Replies the receptionist wrote in this period that the send door refused, such as a person having the thread or the customer having asked to stop. A reply you cancelled or a person answered first, which the hold counts, and a campaign message the door held are not counted.",
  people_reached: "People who wrote in their own words, or phoned and were spoken to, in this period, counted once however often they did. An automatic reply, a message or call you placed, a call that rang out, people brought in with their history, and people who asked to be forgotten are not counted.",
  yeses_won: "The yeses people gave in this period, one for each person and each kind of message (messages, offers, offers by email), in their own words or recorded at the desk. A merge restating a yes, a client list imported, which never records a yes, a person who asked to be forgotten, and a record merged into another are not counted.",
  stops_recorded: "The stops people gave in this period, one for each person and each kind of message they stopped, by their own STOP, an unsubscribe link, a complaint, the carrier or at the desk. A merge restating a stop, the end of a yes to offers that a STOP brings with it, a person who asked to be forgotten, and a record merged into another are not counted.",
  steps_overdue: "People whose earliest open step has a day before today, as of now, whatever period is picked. A step with no day, a step already done, and a later step of the same person are not counted.",
  steps_due_today: "People whose earliest open step has today for its day, as of now, whatever period is picked. A step with no day, a step already done, and a later step of the same person are not counted.",
  email_stopped_now: "People whose email address bounced for good, drew a complaint or was stopped by the email provider, as of now, whatever period is picked, so mail to it is no longer sent. A phone number that does not work, which Chanlytics does not record, is not counted.",
  said_yes_messages: "People on your Said yes to messages list, as of now, whatever period is picked: the answer People shows them, whenever it was given. A person who has asked to stop since, one on do-not-contact, and one who has not answered are not counted.",
  can_receive_offers: "People on your Can receive offers list, as of now, whatever period is picked: they said yes to offers and can be reached on a channel you send on now. A yes with no number or address to send to, a channel you have not connected, and a person who asked to stop are not counted.",
  opted_out_now: "People on your Opted out list, as of now, whatever period is picked: they asked to stop being messaged, or are on do-not-contact, whenever that was. A person who has said yes again since and is not on do-not-contact is not counted.",
  quiet_now: "People whose last message or call to you was more than 30 days ago, as of now, whatever period is picked. Your own messages are not theirs, and a person who has never written or phoned is not counted.",
  emails_written: "Emails your sequences to leads wrote in this period, one for each email that left, however many went to the same business. A call or a note handed to you, and an email that never left, are not counted.",
  emails_landed: "Of the emails your sequences to leads wrote in this period, the share the email provider reports as delivered. An email with no receipt yet is not counted as delivered.",
  emails_bounced: "Emails your sequences to leads wrote in this period that bounced for good: the address refused them and will go on refusing. A complaint, and an email that is only late, are not counted.",
  people_sent_to: "People a campaign sent a message to in this period, counted once however many it sent them. A person a run held back, a message that failed before it left and an email to a lead are not counted.",
  people_wrote_back: `Of the people sent a message in this period, how many answered in their own words ${REPLY_WINDOW_WORDS}, on any channel, counted once. A note the system wrote, an automatic reply, a booking tool's notice and an answer that came later are not counted; people sent to in the last ${REPLY_DAYS} may still answer.`,
  runs_waiting: "Runs waiting for your OK, as of now, whatever period is picked: a campaign's, a one-off send's or a step to leads. A run you approved, skipped or that already went is not counted; one whose day has passed is counted, and can only be skipped.",
  runs_failed: `Runs that ended as failed in the last ${STUCK_DAYS}, as of now, whatever period is picked: a campaign's, a one-off send's or a step to leads. A run you canceled or skipped, and a person held back from a run that went, are not counted.`,
  campaign_replies_waiting: `People who answered a campaign in the last ${STUCK_DAYS} whose conversation waits for a person, as of now, whatever period is picked. One a teammate or you have taken over, and one put aside until later, are not counted.`,
  templates_paused: "WhatsApp messages Meta paused, turned off or rejected, as of now, whatever period is picked. A message hidden from the library and one only waiting for review are not counted.",
  number_health: "How WhatsApp rates your sending number, its quality and what Meta holds against it, as of now, whatever period is picked. A text line and a mailbox are not counted."
};
var metricWordsOf = (metric) => METRIC_WORDS[metric];

// src/calendar/zone-math.ts
var WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

// src/shared/clock.ts
var FORMATS = /* @__PURE__ */ new Map();
function formatsFor(tz) {
  const hit = FORMATS.get(tz);
  if (hit) return hit;
  let zone = tz || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const made = {
    zone,
    time: new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }),
    date: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }),
    dateYear: new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", year: "numeric" }),
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }),
    parts: new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  };
  FORMATS.set(tz, made);
  return made;
}
var WALLS = /* @__PURE__ */ new Map();
var WALLS_MAX = 2048;
function wall(atMs, tz) {
  const id = `${tz}|${atMs}`;
  const hit = WALLS.get(id);
  if (hit) return hit;
  const p = {};
  for (const x of formatsFor(tz).parts.formatToParts(new Date(atMs))) p[x.type] = x.value;
  const made = {
    key: `${p.year}-${p.month}-${p.day}`,
    year: Number(p.year),
    hh: Number(p.hour) % 24,
    mm: Number(p.minute)
  };
  if (WALLS.size >= WALLS_MAX) WALLS.clear();
  WALLS.set(id, made);
  return made;
}
function zoneDayKey(atMs, tz) {
  return wall(atMs, tz).key;
}
function clockDate(atMs, tz, nowMs) {
  const f = formatsFor(tz);
  return wall(atMs, tz).year === wall(nowMs, tz).year ? f.date.format(new Date(atMs)) : f.dateYear.format(new Date(atMs));
}
function daysBetween(fromKey, toKey) {
  const at = (key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.round((at(toKey) - at(fromKey)) / DAY_MS);
}
function daysFromToday(atMs, tz, nowMs) {
  return daysBetween(zoneDayKey(nowMs, tz), zoneDayKey(atMs, tz));
}
function clockNear(atMs, tz, nowMs) {
  const gap = daysFromToday(atMs, tz, nowMs);
  if (gap === 0) return "today";
  if (gap === -1) return "yesterday";
  if (gap === 1) return "tomorrow";
  if (Math.abs(gap) <= 6) return formatsFor(tz).weekday.format(new Date(atMs));
  return clockDate(atMs, tz, nowMs);
}
function durationWords(seconds) {
  const v = Math.max(0, Math.round(seconds));
  if (v < 60) return `${v}s`;
  if (v < 600) {
    const m2 = Math.floor(v / 60);
    const r = v % 60;
    return r ? `${m2}m ${r}s` : `${m2}m`;
  }
  const minutes = Math.round(v / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// src/config/workspace-config/config-rules.ts
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// src/calendar/availability.ts
function hhmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function dayIntervals(h) {
  const raw = [];
  if (h?.open && h?.close) raw.push([h.open, h.close]);
  for (const iv of h?.intervals ?? []) if (iv?.open && iv?.close) raw.push([iv.open, iv.close]);
  const usable = raw.filter(([o, c]) => c > o).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const merged = [];
  for (const [o, c] of usable) {
    const last = merged[merged.length - 1];
    if (last && o <= last[1]) {
      if (c > last[1]) last[1] = c;
    } else {
      merged.push([o, c]);
    }
  }
  return merged;
}
function closedOn(closures, key) {
  return !!closures?.some((c) => c.date <= key && key <= (c.until && c.until >= c.date ? c.until : c.date));
}
var minutesOf = (s) => {
  const t = hhmm(s);
  return t ? t[0] * 60 + t[1] : null;
};
function openAt(hours, closures, dateKey, minute) {
  if (closedOn(closures, dateKey)) return false;
  const { y, m, d } = keyParts(dateKey);
  const weekday = WEEKDAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  if (!weekday) return false;
  return dayIntervals(hours?.[weekday]).some(([o, c]) => {
    const from = minutesOf(o);
    const to = minutesOf(c);
    return from !== null && to !== null && from <= minute && minute < to;
  });
}
function hasHours(hours) {
  return DAYS.some((d) => dayIntervals(hours?.[d]).length > 0);
}

// src/reports/report-closed.ts
function closedOf(arrivals, profile) {
  if (!arrivals || !profile || !hasHours(profile.hours)) return null;
  return arrivals.reduce((s, a) => s + (openAt(profile.hours, profile.closures, a.d, a.q * 15) ? 0 : a.n), 0);
}
function hoursUnsetOf(arrivals, profile) {
  return arrivals !== void 0 && profile != null && !hasHours(profile.hours);
}

// src/shared/numbers.ts
var sumOf = (xs) => xs.reduce((a, b) => a + b, 0);
var pct = (n, of) => of > 0 ? Math.round(n / of * 100) : null;

// src/shared/words.ts
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
var joinWords = (items) => items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// src/reports/report-tiles.ts
var REPORT_MIN_N = 5;
var isThinShare = (n, minN) => n > 0 && n < minN;
var shareSaid = (share, count, of) => share === null ? null : of >= REPORT_MIN_N ? `${share}%` : `${count} of ${of}`;
function fmtSeconds(s) {
  if (s == null || !Number.isFinite(s)) return "\u2014";
  return durationWords(s);
}
var beforeWords = (rangeLabel) => `the ${rangeLabel === plural(1, "day") ? "day" : rangeLabel} before`;
function compareWords(current, previous, rangeLabel, priorHadAny) {
  if (!priorHadAny || current === 0 && previous === 0) return null;
  if (previous === 0) return `none ${beforeWords(rangeLabel)}`;
  if (current === previous) return `same as ${beforeWords(rangeLabel)}`;
  return `${current > previous ? "up" : "down"} from ${previous}`;
}
function shareWasWords(nowOf, was, rangeLabel) {
  if (nowOf === 0) return null;
  const said = shareSaid(pct(was.part, was.of), was.part, was.of);
  return said === null ? null : `was ${said} ${beforeWords(rangeLabel)}`;
}
var messagesAnsweredWords = (answered, of) => `${answered} of ${of} ${answered === 1 ? "was" : "were"} answered`;

// src/reports/reports.ts
var REPORT_CHANNELS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "voice", label: "Calls" },
  { key: "email", label: "Email" },
  { key: "sms", label: "Text" }
];
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
var endedOn = (report) => report.end && report.end < report.today ? report.end : null;
function dayPointOf(day) {
  return { day, label: fmtDay(day), short: String(dayDate(day).getDate()) };
}
var rangeLabelOf = (days) => REPORT_RANGES.find((r) => r.days === days)?.label ?? plural(days, "day");
var periodWords = (days, until) => {
  const rangeLabel = rangeLabelOf(days);
  const before = capitalize(beforeWords(rangeLabel));
  if (until === null) return { now: `Last ${rangeLabel}`, before, within: `in the last ${rangeLabel}` };
  return {
    now: daysWords(shiftKey(until, -(days - 1)), until),
    before,
    within: days === 1 ? `on ${fmtDay(until)}` : `in the ${rangeLabel} to ${fmtDay(until)}`
  };
};
var withinWords = (days, until) => days === 1 && until === null ? "today" : periodWords(days, until).within;

// src/reports/report-mix.ts
var ownWord = (words, key) => Object.hasOwn(words, key) ? words[key] : void 0;
function rankedEntries(counts, labelOf) {
  return Object.entries(counts).filter(([, n]) => n > 0).map(([key, n]) => [key, labelOf(key), n]).sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1));
}
function barsOf(entries) {
  const max = Math.max(1, ...entries.map(([, , value]) => value));
  return entries.map(([id, label, value]) => ({ id, label, value, share: value / max }));
}
var mixOf = (entries, line) => ({ rows: barsOf(entries), line, empty: null });
var noMix = (empty) => ({ rows: [], line: null, empty });

// src/config/intent-labels.ts
var INTENT_LABELS = {
  booking: "Booking",
  pricing: "Pricing question",
  money: "Money question",
  hours: "Hours",
  services: "Services",
  location: "Location",
  complaint: "Complaint",
  smalltalk: "Small talk",
  other: "Other"
};

// src/conversations/call-dto.ts
var DISCONNECTION_LABELS = {
  user_hangup: "Customer hung up",
  agent_hangup: "Receptionist ended the call",
  call_transfer: "Transferred to a person",
  voicemail_reached: "Reached voicemail",
  dial_no_answer: "No answer",
  dial_busy: "Line was busy",
  dial_failed: "Call couldn't connect",
  inactivity: "Ended after silence",
  max_duration_reached: "Hit the call length limit",
  concurrency_limit_reached: "Line was busy \u2014 all agents in use",
  user_declined: "Customer declined the call",
  marked_as_spam: "Flagged as spam by the carrier",
  // The endings the Live page's own controls produce, and the provider's
  // newer names for a transfer.
  manual_stopped: "Ended from the dashboard",
  call_take_over: "A person took over the call",
  transfer_bridged: "Transferred to a person",
  transfer_cancelled: "Transfer did not go through"
};

// src/lines/registration-path.ts
var SOLE_PROP_LIMITS = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
var REGISTRATION_COST_WORDS = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second.`
};

// src/setup/setup.ts
var PROVISIONING_DEADLINE_MS = 5 * MIN_MS;
var SETUP_STATE_WORDS = {
  not_started: "Not started",
  waiting_you: "Waiting on you",
  waiting_them: "Waiting on us",
  ready: "Ready"
};
var SOLE_PROP_CEILING_SENTENCE = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE}`;

// src/setup/calendar-source.ts
var CALENDAR_OWED_WORD = SETUP_STATE_WORDS.waiting_you;
var FORWARD_CONFIRM_SHOWN_MS = 3 * DAY_MS;
var BOOKED_NEEDS_A_LINK = "Add a calendar link under Settings \u203A Hours & booking to see who booked.";

// src/reports/booking-report.ts
var BOOKED_NEEDS_TODAY = "It follows people as they stand today, so it is only true of a period that ends today.";

// src/reports/receptionist/receptionist-words.ts
var HOLD_OUTCOMES = [
  ["sent", "Went out as the hold ended"],
  ["canceled", "You cancelled"],
  ["steered", "You changed"],
  ["overtaken", "A newer message came first"],
  ["person_first", "A person answered first"],
  ["waiting", "Still waiting"],
  ["other", "Did not go out"]
];
var HOLD_EMPTY = "No reply waited in a hold in this period.";
var holdEntries = (now) => HOLD_OUTCOMES.map(([key, label]) => [key, label, now[key]]).filter(([, , n]) => n > 0);
function holdLine(now) {
  const out = `${now.sent} of ${now.total} went out as the hold ended.`;
  const n = now.low_confidence;
  return n > 0 ? `${out} ${n} ${n === 1 ? "was" : "were"} held back as not sure enough to send alone.` : out;
}
function topicsEmpty(of, stamped) {
  if (of === 0) return "Topics are read from texts and WhatsApp messages. None came in this period.";
  if (stamped === 0) return `No topic is recorded for the ${plural(of, "message")} that came by text or WhatsApp.`;
  return null;
}
var topicEntries = (byIntent) => rankedEntries(byIntent, (key) => ownWord(INTENT_LABELS, key) ?? key);
var topicsLine = (stamped, of) => `${stamped} of ${of} text and WhatsApp messages had a topic.`;
var LANGUAGE_LABELS = { en: "English", es: "Spanish", other: "Another language" };
var languageEntries = (byLanguage) => rankedEntries(byLanguage, (key) => ownWord(LANGUAGE_LABELS, key) ?? key);
var languagesLine = (stamped, of) => `${stamped} of ${of} replies say the language they were written in.`;
var CALLS_EMPTY = "Nobody phoned in this period.";
var CALLS_NONE_CONNECTED = "No call connected in this period.";
var callEndingWords = (key) => key === "unknown" ? "Not recorded" : ownWord(DISCONNECTION_LABELS, key) ?? key.replace(/_/g, " ");
var callEndingEntries = (byReason) => rankedEntries(byReason, callEndingWords);
var callEndingsLine = (total) => `${plural(total, "call")} that connected.`;
function bookedReason(calendar) {
  if (calendar === "ended") return BOOKED_NEEDS_TODAY;
  if (calendar === "none") return BOOKED_NEEDS_A_LINK;
  if (calendar === "unavailable") return "Your calendar could not be read.";
  return null;
}
function linkLine(sent, booked, calendar) {
  if (sent === 0) return "Nobody was sent the booking link in this period.";
  const was = `${sent} ${sent === 1 ? "person was" : "people were"} sent the booking link`;
  if (booked !== null) return `${was}; ${booked} ${booked === 1 ? "has" : "have"} booked since.`;
  const reason = bookedReason(calendar);
  return reason === null ? `${was}.` : `${was}. ${reason}`;
}
var HANDOVER_NONE = "nothing was handed over in this period";
var handoverReplyMeta = (replied, n) => n === 0 ? HANDOVER_NONE : `${replied} of ${plural(n, "handover")} that wanted a message had a reply from you`;
var handoverSettledMeta = (settled, n) => n === 0 ? HANDOVER_NONE : `${settled} of ${n} settled`;
var MISSED_LABEL = `Missed calls answered within ${MISSED_CALL_TOUCH_WORDS}`;
function missedMeta(m) {
  const left = [
    m.pending > 0 ? `${m.pending} under ${MISSED_CALL_TOUCH_WORDS} old, not counted yet` : null,
    m.unknown > 0 ? `${m.unknown} with no caller on record not counted` : null
  ].filter((part) => part !== null);
  if (left.length > 0) return left.join(" \xB7 ");
  return m.n === 0 ? "no call went unanswered at the phone" : `${plural(m.n, "person", "people")} rang and found nobody`;
}
var CLOSED_UNSET = "set your opening hours to see this";
var CLOSED_NONE = "no message came while you were closed";
var closedMeta = (came, answered) => `${plural(came, "message")} came while you were closed; the receptionist answered ${answered}.`;
function waitedWords(oldestAt, nowMs) {
  const seconds = oldestAt === null ? NaN : (nowMs - Date.parse(oldestAt)) / 1e3;
  return Number.isFinite(seconds) ? durationWords(seconds) : null;
}
function waitingMeta(waiting, oldestAt, nowMs) {
  if (waiting === 0) return "nobody is waiting for you";
  const waited = waitedWords(oldestAt, nowMs);
  return waited === null ? "waiting for you now" : `the oldest has waited ${waited}`;
}
var callbacksMeta = (callbacks) => callbacks === 0 ? "no call-back is waiting" : `people to ring, counted in ${NEEDS_YOU_WORD}`;
var refusalWords = (key) => ownWord(HELD_REASONS, key) ?? key.replace(/_/g, " ");
function heldBackMeta(byReason) {
  const top = rankedEntries(byReason, refusalWords).slice(0, 2);
  return top.length > 0 ? top.map(([, words, n]) => `${words} ${n}`).join(" \xB7 ") : "none were held at the door in this period";
}
var heldBackEntries = (byReason) => rankedEntries(byReason, (key) => capitalize(refusalWords(key)));

// src/reports/receptionist/receptionist-report.ts
function holdPart({ hold }) {
  return hold.now.total === 0 ? noMix(HOLD_EMPTY) : mixOf(holdEntries(hold.now), holdLine(hold.now));
}
function topicsPart({ topics }) {
  const empty = topicsEmpty(topics.of, topics.stamped);
  return empty === null ? mixOf(topicEntries(topics.by_intent), topicsLine(topics.stamped, topics.of)) : noMix(empty);
}
function languagesPart({ languages }) {
  const entries = languageEntries(languages.by_language);
  return entries.length < 2 ? null : mixOf(entries, languagesLine(languages.stamped, languages.of));
}
function callEndingsPart({ call_endings, missed }) {
  if (call_endings.total > 0)
    return mixOf(callEndingEntries(call_endings.by_reason), callEndingsLine(call_endings.total));
  const rang = missed.now.n + missed.now.pending + missed.now.unknown > 0;
  return noMix(rang ? CALLS_NONE_CONNECTED : CALLS_EMPTY);
}
function wasWords(now, before, days) {
  return now === null || before === null ? null : `was ${fmtSeconds(before)} ${beforeWords(rangeLabelOf(days))}`;
}
function handoverFigures({ handover }, days) {
  const { now, before } = handover;
  return [
    {
      id: "handover-reply",
      metric: "handover_first_reply",
      label: "Your first reply after a handover",
      value: fmtSeconds(now.replied.median_s),
      meta: handoverReplyMeta(now.replied.n, now.n),
      compare: wasWords(now.replied.median_s, before.replied.median_s, days),
      n: now.replied.n,
      minN: REPORT_MIN_N
    },
    {
      id: "handover-settled",
      metric: "handover_settled",
      label: "Time to settle a handover",
      value: fmtSeconds(now.settled.median_s),
      meta: handoverSettledMeta(now.settled.n, now.n),
      compare: wasWords(now.settled.median_s, before.settled.median_s, days),
      n: now.settled.n,
      minN: REPORT_MIN_N
    }
  ];
}
function missedFigure({ missed }, days) {
  const { now, before } = missed;
  return {
    id: "missed-calls",
    metric: "missed_calls_answered",
    label: MISSED_LABEL,
    value: now.n === 0 ? "\u2014" : `${now.touched} of ${now.n}`,
    meta: missedMeta(now),
    // Set against the period before only beside a figure: nothing is set against a dash.
    compare: now.n > 0 && before.n > 0 ? `was ${before.touched} of ${before.n} ${beforeWords(rangeLabelOf(days))}` : null,
    n: now.n,
    minN: REPORT_MIN_N
  };
}
function closedFigure({ after_hours }, profile) {
  const tile = {
    id: "closed",
    metric: "answered_while_closed",
    label: "Answered while you were closed",
    compare: null
  };
  if (hoursUnsetOf(after_hours, profile)) {
    return { ...tile, value: "\u2014", meta: CLOSED_UNSET, door: "admin/hours", unset: true };
  }
  if (profile === null) return null;
  const came = closedOf(after_hours, profile) ?? 0;
  if (came === 0) return { ...tile, value: "0", meta: CLOSED_NONE, unset: false };
  const answered = closedOf(
    after_hours.map(({ d, q, a }) => ({ d, q, n: a })),
    profile
  ) ?? 0;
  return {
    ...tile,
    value: `${answered} of ${came}`,
    meta: closedMeta(came, answered),
    n: came,
    minN: REPORT_MIN_N,
    unset: false
  };
}
function stuckFigures({ stuck, blocked }, nowMs) {
  return [
    {
      id: "waiting",
      metric: "waiting_on_you",
      // The Inbox's name for a thread flagged that nobody has taken, which is what this counts (standingOfThread): the tile
      // said "Waiting on you", which People used for a thread you have, so 3 here and 1 there were both right.
      label: NEEDS_YOU_WORD,
      // A list cut at the database's limit is a floor: the Inbox is where the rest is.
      value: stuck.capped ? `${stuck.waiting}+` : String(stuck.waiting),
      meta: waitingMeta(stuck.waiting, stuck.oldest_at, nowMs),
      compare: null,
      door: "inbox"
    },
    {
      id: "call-backs",
      metric: "call_backs",
      label: "Call-backs",
      value: String(stuck.callbacks),
      meta: callbacksMeta(stuck.callbacks),
      compare: null,
      door: "today"
    },
    {
      id: "held-back",
      metric: "replies_held_back",
      label: "Replies held back",
      value: String(blocked.total),
      meta: heldBackMeta(blocked.by_reason),
      compare: null,
      door: "inbox"
    }
  ];
}
function unavailableVM() {
  return {
    available: false,
    hold: noMix(null),
    topics: noMix(null),
    languages: null,
    callEndings: noMix(null),
    link: { sent: 0, booked: null, line: "" },
    handover: [],
    missed: {
      id: "missed-calls",
      metric: "missed_calls_answered",
      label: MISSED_LABEL,
      value: "\u2014",
      meta: "",
      compare: null
    },
    closed: null,
    stuck: [],
    heldBack: []
  };
}
function toReceptionistReportVM(dto, opts) {
  const { series } = dto;
  if (series === null) return unavailableVM();
  const { links } = series;
  return {
    available: true,
    hold: holdPart(series),
    topics: topicsPart(series),
    languages: languagesPart(series),
    callEndings: callEndingsPart(series),
    link: { sent: links.sent, booked: links.booked, line: linkLine(links.sent, links.booked, links.calendar) },
    handover: handoverFigures(series, dto.days),
    missed: missedFigure(series, dto.days),
    closed: closedFigure(series, dto.profile),
    stuck: stuckFigures(series, opts.nowMs),
    heldBack: barsOf(heldBackEntries(series.blocked.by_reason))
  };
}

// src/people/person-words.ts
var REPLY_VIA = {
  whatsapp: "WhatsApp",
  sms: "Text",
  email: "Email",
  instagram: "Instagram"
};
var PERSON_CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  sms: "Text",
  voice: "Phone",
  email: "Email",
  instagram: "Instagram"
};
var PERSON_CAME_FROM_WORDS = {
  whatsapp: REPLY_VIA.whatsapp,
  sms: REPLY_VIA.sms,
  email: REPLY_VIA.email,
  instagram: REPLY_VIA.instagram,
  call: PERSON_CHANNEL_WORDS.voice,
  calendar: "Your calendar",
  manual: "Added by hand",
  import: "Imported",
  lead: "A lead you found",
  ad: "An ad",
  website: "Your website"
};

// src/reports/people/people-words.ts
var PEOPLE_RHYTHM_UNIT = "messages and calls";
var PEOPLE_RHYTHM_EMPTY = "Nobody wrote or called in this period.";
var listDoor = (id) => `clients/seg:${id}`;
var HEAD_NOBODY = "Nobody reached you in this period";
function newBeforeWords(before, days, priorHad) {
  if (!priorHad) return "";
  return ` (${before.new === 0 ? "none" : before.new} ${beforeWords(rangeLabelOf(days))})`;
}
function bookYesWords(book) {
  return book !== null && book.people >= REPORT_MIN_N ? `; ${book.lists.opted_in} of ${book.people} have said yes to messages` : "";
}
function headWords(reached, days, book, priorHad) {
  const { now, before } = reached;
  const reachedWords = now.people === 0 ? HEAD_NOBODY : `${plural(now.people, "person", "people")} reached you, ${now.new} new${newBeforeWords(before, days, priorHad)}`;
  return `${reachedWords}${bookYesWords(book)}.`;
}
var happened = (parts) => parts.filter(([n]) => n > 0).map(([n, words]) => `${n} ${words}`).join(" \xB7 ");
var reachedMeta = (people, fresh) => people === 0 ? "nobody wrote or called in this period" : `${fresh} new \xB7 ${people - fresh} you knew already`;
var newMeta = (people, fresh) => fresh === 0 ? "nobody new" : `of the ${people} who reached you`;
var yesesMeta = (by) => happened([
  [by.messages, "to messages"],
  [by.offers, "to offers"],
  [by.email_offers, "to email offers"]
]) || "nobody said yes in this period";
var stopsMeta = (by) => happened([
  [by.messages, "stopped all messages"],
  [by.offers, "stopped offers"],
  [by.email_offers, "stopped email offers"]
]) || "nobody asked to stop in this period";
var keptAsWords = (key) => capitalize(key.replace(/_/g, " "));
function ranked(counts, words) {
  const order = Object.keys(words);
  const place = (key) => {
    const at = order.indexOf(key);
    return at === -1 ? order.length : at;
  };
  return rankedEntries(counts, (key) => ownWord(words, key) ?? keptAsWords(key)).sort(
    (a, b) => b[2] - a[2] || place(a[0]) - place(b[0])
  );
}
var lastOf = (entries, id) => [
  ...entries.filter(([key]) => key !== id),
  ...entries.filter(([key]) => key === id)
];
var channelEntries = (byChannel) => ranked(byChannel, PERSON_CHANNEL_WORDS);
var CHANNELS_LINE = "A person who reached you more than one way is counted in each.";
var CHANNELS_EMPTY = "Nobody reached you in this period.";
var UNRECORDED = "unknown";
var FIRST_CAME_WORDS = { ...PERSON_CAME_FROM_WORDS, ad: "An ad", [UNRECORDED]: "Not recorded" };
var firstCameEntries = (byVia) => lastOf(ranked(byVia, FIRST_CAME_WORDS), UNRECORDED);
var firstCameKnown = (entries) => entries.filter(([id]) => id !== UNRECORDED).reduce((n, [, , value]) => n + value, 0);
var firstCameLine = (known, fresh) => `${known} of ${fresh} new people have a recorded way in.`;
var FIRST_CAME_NOBODY = "Nobody new reached you in this period.";
var firstCameNone = (fresh) => `No way in is recorded for the ${plural(fresh, "new person", "new people")}.`;
var OTHER = "other";
var MEMBER = "member";
var YES_ROWS = {
  customer_message: "Their own message",
  form: "A form",
  in_person: "In person",
  phone: "By phone",
  [OTHER]: "Another way"
};
var STOP_ROWS = {
  customer_message: "Their own STOP",
  carrier: "The carrier",
  unsubscribe: "An unsubscribe",
  complaint: "A complaint",
  reply: "A reply",
  whatsapp: "WhatsApp's offers stop",
  [MEMBER]: "Recorded by a member",
  [OTHER]: "Another way"
};
var MEMBER_SOURCES = ["in_person", "phone", "form", "operator"];
function answerEntries(bySource, rowWords, rowOf) {
  const rows = {};
  for (const [source, n] of Object.entries(bySource)) {
    const row = rowOf(source);
    rows[row] = (rows[row] ?? 0) + n;
  }
  return lastOf(ranked(rows, rowWords), OTHER);
}
var rowIn = (rowWords, source) => Object.hasOwn(rowWords, source) ? source : OTHER;
var yesEntries = (bySource) => answerEntries(bySource, YES_ROWS, (source) => rowIn(YES_ROWS, source));
var stopEntries = (bySource) => answerEntries(bySource, STOP_ROWS, (source) => MEMBER_SOURCES.includes(source) ? MEMBER : rowIn(STOP_ROWS, source));
var YESES_LINE = "Each person is counted once for each kind of message they said yes to.";
var YESES_EMPTY = "Nobody said yes in this period.";
var STOPS_LINE = "Each person is counted once for each kind of message they stopped.";
var STOPS_EMPTY = "Nobody asked to stop in this period.";
function stepsDoneEntries(steps) {
  const rows = [
    ["on_time", "Done on or before their day", steps.on_time],
    ["late", "Done after their day", Math.max(0, steps.done - steps.on_time)]
  ];
  return rows.filter(([, , n]) => n > 0);
}
var stepsDoneLine = (steps) => steps.done >= REPORT_MIN_N ? `${steps.on_time} of ${steps.done} were done on or before their day.` : `${plural(steps.done, "step was", "steps were")} done in this period.`;
var STEPS_DONE_EMPTY = "No step was done in this period.";
var EMAIL_STOP_WORDS = {
  hard_bounce: "Bounced for good",
  complaint: "Marked as spam",
  provider: "Stopped by the email provider",
  [UNRECORDED]: "Reason not recorded"
};
var emailStoppedEntries = (byReason) => lastOf(ranked(byReason, EMAIL_STOP_WORDS), UNRECORDED);
var emailStoppedLine = (total) => `${plural(total, "address", "addresses")} stopped working in this period.`;
var EMAIL_STOPPED_EMPTY = "No address stopped working in this period.";
var BOOK_EMPTY = "Nobody is in your book yet.";
var WIRE_ROWS = [
  ["whatsapp_only", `${PERSON_CHANNEL_WORDS.whatsapp} only`],
  ["sms_only", `${PERSON_CHANNEL_WORDS.sms} only`],
  ["phone_only", `${PERSON_CHANNEL_WORDS.voice} only`],
  ["email_only", `${PERSON_CHANNEL_WORDS.email} only`],
  ["instagram_only", `${PERSON_CHANNEL_WORDS.instagram} only`],
  ["several", "More than one way"],
  ["none", "None yet"]
];
var wireEntries = (wires) => WIRE_ROWS.map(([key, label]) => [key, label, wires[key]]).filter(([, , n]) => n > 0);
var wiresLine = (several, people) => `${several} of ${people} have reached you more than one way, as of today.`;
var FRESH_ROWS = [
  ["under_7", "Under 7 days"],
  ["d7_30", "7 to 30 days"],
  ["d31_60", "31 to 60 days"],
  ["d61_90", "61 to 90 days"],
  ["d91_up", "91 days or more"],
  ["never", "Never heard from"]
];
var freshEntries = (fresh) => FRESH_ROWS.map(([key, label]) => [key, label, fresh[key]]);
var freshLine = (people) => `Of ${plural(people, "person", "people")} as of today: the days since they last wrote or called. Your own messages do not count.`;
function quietDoor(quiet) {
  if (quiet === 0) return null;
  return {
    line: `${plural(quiet, "person has", "people have")} been quiet for more than 30 days.`,
    door: listDoor("quiet"),
    label: "Quiet 30+ days"
  };
}
var stepsOverdueMeta = (overdue) => overdue === 0 ? "no next step is past its day" : "people whose next step is past its day";
var stepsDueTodayMeta = (due) => due === 0 ? "no next step is due today" : "people whose next step is due today";
var emailStoppedNowMeta = (stopped) => stopped === 0 ? "every address works" : "people whose address no longer receives your email";
var standMeta = (people) => people === 0 ? "nobody is in your book yet" : `of ${plural(people, "person", "people")}`;

// src/reports/people/people-report.ts
var priorHadOf = ({ reached, consent }) => reached.before.people > 0 || consent.before.yes > 0 || consent.before.stop > 0;
function stripOf({ reached, consent }, days, priorHad) {
  const { now, before } = reached;
  const against = (current, previous) => compareWords(current, previous, rangeLabelOf(days), priorHad);
  const { yes, stop } = consent.now;
  return [
    {
      id: "people-reached",
      metric: "people_reached",
      label: "People who reached you",
      value: String(now.people),
      meta: reachedMeta(now.people, now.new),
      compare: against(now.people, before.people)
    },
    {
      id: "new-people",
      metric: "new_people",
      label: "New people",
      value: String(now.new),
      meta: newMeta(now.people, now.new),
      compare: against(now.new, before.new),
      // A share of those who reached you: of fewer than five, it says nothing (the kit greys it).
      ...now.people > 0 ? { n: now.people, minN: REPORT_MIN_N } : {}
    },
    {
      id: "yeses-won",
      metric: "yeses_won",
      label: "Yeses won",
      value: String(yes.total),
      meta: yesesMeta(yes.by_purpose),
      compare: against(yes.total, consent.before.yes)
    },
    {
      id: "stops",
      metric: "stops_recorded",
      label: "Stops",
      value: String(stop.total),
      meta: stopsMeta(stop.by_purpose),
      compare: against(stop.total, consent.before.stop)
    }
  ];
}
var partOf = (entries, line, empty) => entries.length === 0 ? noMix(empty) : mixOf(entries, line);
function firstCamePart({ reached, first_came }) {
  const fresh = reached.now.new;
  if (fresh === 0) return noMix(FIRST_CAME_NOBODY);
  const entries = firstCameEntries(first_came.by_via);
  const known = firstCameKnown(entries);
  return known === 0 ? noMix(firstCameNone(fresh)) : mixOf(entries, firstCameLine(known, fresh));
}
function windowOf(series, days, book) {
  const { consent, steps, email_stopped } = series;
  const priorHad = priorHadOf(series);
  return {
    head: headWords(series.reached, days, book, priorHad),
    strip: stripOf(series, days, priorHad),
    // Spread: the DTO's `ByChannelDto` is an interface, which has no index signature to pass as a count by key.
    channels: partOf(channelEntries({ ...series.by_channel.now }), CHANNELS_LINE, CHANNELS_EMPTY),
    firstCame: firstCamePart(series),
    yeses: partOf(yesEntries(consent.now.yes.by_source), YESES_LINE, YESES_EMPTY),
    stops: partOf(stopEntries(consent.now.stop.by_source), STOPS_LINE, STOPS_EMPTY),
    stepsDone: partOf(stepsDoneEntries(steps), stepsDoneLine(steps), STEPS_DONE_EMPTY),
    emailStopped: partOf(
      emailStoppedEntries(email_stopped.by_reason),
      emailStoppedLine(email_stopped.total),
      EMAIL_STOPPED_EMPTY
    )
  };
}
function noWindow() {
  return {
    head: null,
    strip: [],
    channels: noMix(null),
    firstCame: noMix(null),
    yeses: noMix(null),
    stops: noMix(null),
    stepsDone: noMix(null),
    emailStopped: noMix(null)
  };
}
function wiresPart(book) {
  if (book.people === 0) return noMix(BOOK_EMPTY);
  const { several } = book.wires;
  return {
    rows: barsOf(wireEntries(book.wires)),
    line: several > 0 ? wiresLine(several, book.people) : null,
    empty: null
  };
}
function freshPart(book) {
  if (book.people === 0) return { ...noMix(BOOK_EMPTY), quiet: null };
  return { ...mixOf(freshEntries(book.fresh), freshLine(book.people)), quiet: quietDoor(book.lists.quiet) };
}
var toned = (count, tone) => count > 0 ? { tone } : {};
function stuckNowFigures({ steps, email_stopped }) {
  return [
    {
      id: "steps-overdue",
      metric: "steps_overdue",
      label: "Steps overdue",
      value: String(steps.overdue),
      meta: stepsOverdueMeta(steps.overdue),
      compare: null,
      door: listDoor("steps_due"),
      ...toned(steps.overdue, "warn")
    },
    {
      id: "steps-due-today",
      metric: "steps_due_today",
      label: "Steps due today",
      value: String(steps.due_today),
      meta: stepsDueTodayMeta(steps.due_today),
      compare: null,
      door: listDoor("steps_due")
    },
    {
      id: "email-stopped",
      metric: "email_stopped_now",
      label: "Email stopped working",
      value: String(email_stopped),
      meta: emailStoppedNowMeta(email_stopped),
      compare: null,
      ...toned(email_stopped, "fail")
    }
  ];
}
var STAND_LISTS = [
  { id: "said-yes-messages", metric: "said_yes_messages", label: "Said yes to messages", list: "opted_in" },
  { id: "can-receive-offers", metric: "can_receive_offers", label: "Can receive offers", list: "offers_ok" },
  { id: "opted-out", metric: "opted_out_now", label: STOP_WORDS.pill, list: "opted_out" },
  { id: "quiet-30", metric: "quiet_now", label: "Quiet 30+ days", list: "quiet" }
];
function standFigures({ people, lists }) {
  return STAND_LISTS.map(({ id, metric, label, list }) => ({
    id,
    metric,
    label,
    value: String(lists[list]),
    meta: standMeta(people),
    compare: null,
    door: listDoor(list),
    n: people,
    minN: REPORT_MIN_N
  }));
}
function bookOf(book) {
  return { wires: wiresPart(book), fresh: freshPart(book), stuck: stuckNowFigures(book), stand: standFigures(book) };
}
function noBook() {
  return { wires: noMix(null), fresh: { ...noMix(null), quiet: null }, stuck: [], stand: [] };
}
function toPeopleReportVM(dto) {
  const { series, now } = dto;
  return {
    windowAvailable: series !== null,
    nowAvailable: now !== null,
    ...series === null ? noWindow() : windowOf(series, dto.days, now),
    ...now === null ? noBook() : bookOf(now)
  };
}

// src/email/mailbox-standing.ts
var HOLD_WORDS = {
  bounces: "more than 3% of its recent emails bounced or were refused",
  complaint: "someone marked an email from it as spam",
  unsubscribes: "more than 3% of the businesses it wrote to unsubscribed"
};
function mailboxHoldWords(why) {
  return why && HOLD_WORDS[why] || "it was held";
}

// src/playbooks/playbook-triggers.ts
var PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", kind: "list", hint: "Nothing heard in 30 days" },
  {
    id: "new_week",
    label: "Welcome",
    list: "new_week",
    cls: "campaign",
    kind: "list",
    hint: "First contact in the last 7 days"
  },
  {
    id: "phoned_only",
    label: "Save our number",
    list: "phoned_only",
    cls: "reengage",
    kind: "list",
    hint: "Only ever phoned, never texted"
  },
  {
    id: "everyone_monthly",
    label: "The month's offer",
    list: null,
    cls: "campaign",
    kind: "cadence",
    hint: "Everyone who said yes, on a cadence"
  },
  {
    id: "visit_tomorrow",
    label: "Appointment reminder",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day before an appointment on the calendar"
  },
  // Under the Booking row since 2 Oct 2026, as the reminder is: its message asks how the appointment went and offers
  // nothing, so it reaches a yes to texts. The labels here are the default word's (contracts appointmentWords, D42); a
  // page and a new campaign's name say the workspace's own (triggerWords), and a name already stored keeps its words
  // until its owner renames it (D43). The id never changes.
  {
    id: "visited",
    label: "After the appointment",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day after an appointment, when nothing is booked next"
  },
  // People's Lapsed list, by visits rather than silence (00155). Since 2 Oct 2026 it IS the win-back where a calendar is
  // connected, and the quiet one is the win-back where none is: one moment, read the one way the workspace can
  // (momentOffered), so both are called Win-back and their hints say which.
  {
    id: "lapsed",
    label: "Win-back",
    list: "lapsed",
    cls: "reengage",
    kind: "list",
    hint: "No appointment in 45 days, and nothing booked"
  },
  // Any list (decision 0009): one of People's (list_key, 00168) or one of the workspace's own (list_id, 00155), kept by
  // hand or by a rule; the card says which. The id stays: playbooks made before any list could be named keep running.
  {
    id: "saved_list",
    label: "On a list",
    list: null,
    cls: "campaign",
    kind: "saved",
    hint: "Everyone on a list: one of People's, or one you keep"
  },
  // A proposal out that has waited past the workspace's pace with nothing back (0006): one nudge per proposal, with
  // its link, under its own class, in every workspace. Conversational: it answers the person's own request.
  {
    id: "proposal_waiting",
    label: "Proposal follow-up",
    list: null,
    cls: "follow_up",
    kind: "deal",
    hint: "A proposal waiting with nothing back"
  },
  // Reach out (Part 3): a chain's first email, over a lead search, and a step days after the one before it. Made by
  // the reach-out sheet (Part 4), never offered among the moments (triggerOffered).
  {
    id: "lead_first",
    label: "Businesses a search found",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "The first email to a lead"
  },
  {
    id: "after_step",
    label: "After the step before",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "A nudge, days after the step before"
  }
];
var MOMENT_TRIGGERS = PLAYBOOK_TRIGGERS.filter(
  (t) => t.kind !== "reach_out"
);
var PLAYBOOK_HOURS = { min: 9, max: 20 };
var SENDING_HOURS_END = PLAYBOOK_HOURS.max + 1;
var PLAYBOOK_LIMITS = {
  run_hour: { min: PLAYBOOK_HOURS.min, max: PLAYBOOK_HOURS.max, what: "The hour" },
  cap_per_run: { min: 1, max: 500, what: "The cap" },
  gap_days: { min: 7, max: 365, what: "The gap" },
  cadence_days: { min: 1, max: 90, what: "The cadence" }
};
var SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00\u2013${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`,
  end: `${SENDING_HOURS_END}:00`
};
var PLAYBOOK_VETO_DELAY_MS = 30 * MIN_MS;
var SEND_ONCE_STOP_MS = 10 * MIN_MS;
function delayWords(ms) {
  const minutes = Math.round(ms / MIN_MS);
  if (minutes < 60 || minutes % 60) return plural(minutes, "minute");
  return minutes === 60 ? "an hour" : plural(minutes / 60, "hour");
}
var PLAYBOOK_VETO_DELAY_WORDS = delayWords(PLAYBOOK_VETO_DELAY_MS);
var SEND_ONCE_STOP_WORDS = delayWords(SEND_ONCE_STOP_MS);
var VISIT_TRIGGERS = PLAYBOOK_TRIGGERS.filter((t) => t.kind === "visit").map((t) => t.id);

// src/templates/template-languages.ts
var L = (id, name, region, native) => ({
  id,
  label: region ? `${name} (${region})` : name,
  name,
  region,
  native
});
var WHATSAPP_LANGUAGES = [
  L("af", "Afrikaans", null, "Afrikaans"),
  L("sq", "Albanian", null, "Shqip"),
  L("ar", "Arabic", null, "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_EG", "Arabic", "Egypt", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_LB", "Arabic", "Lebanon", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_MA", "Arabic", "Morocco", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_QA", "Arabic", "Qatar", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("ar_AE", "Arabic", "UAE", "\u0627\u0644\u0639\u0631\u0628\u064A\u0629"),
  L("az", "Azerbaijani", null, "Az\u0259rbaycan"),
  L("be_BY", "Belarusian", null, "\u0411\u0435\u043B\u0430\u0440\u0443\u0441\u043A\u0430\u044F"),
  L("bn", "Bengali", null, "\u09AC\u09BE\u0982\u09B2\u09BE"),
  L("bn_IN", "Bengali", "India", "\u09AC\u09BE\u0982\u09B2\u09BE"),
  L("bg", "Bulgarian", null, "\u0411\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438"),
  L("ca", "Catalan", null, "Catal\xE0"),
  L("zh_CN", "Chinese", "China", "\u7B80\u4F53\u4E2D\u6587"),
  L("zh_HK", "Chinese", "Hong Kong", "\u7E41\u9AD4\u4E2D\u6587\uFF08\u9999\u6E2F\uFF09"),
  L("zh_TW", "Chinese", "Taiwan", "\u7E41\u9AD4\u4E2D\u6587\uFF08\u53F0\u7063\uFF09"),
  L("hr", "Croatian", null, "Hrvatski"),
  L("cs", "Czech", null, "\u010Ce\u0161tina"),
  L("da", "Danish", null, "Dansk"),
  L("prs_AF", "Dari", null, "\u062F\u0631\u06CC"),
  L("nl", "Dutch", null, "Nederlands"),
  L("nl_BE", "Dutch", "Belgium", "Nederlands"),
  L("en", "English", null, "English"),
  L("en_AU", "English", "Australia", "English"),
  L("en_CA", "English", "Canada", "English"),
  L("en_GH", "English", "Ghana", "English"),
  L("en_IN", "English", "India", "English"),
  L("en_IE", "English", "Ireland", "English"),
  L("en_JM", "English", "Jamaica", "English"),
  L("en_MY", "English", "Malaysia", "English"),
  L("en_NZ", "English", "New Zealand", "English"),
  L("en_QA", "English", "Qatar", "English"),
  L("en_SG", "English", "Singapore", "English"),
  L("en_ZA", "English", "South Africa", "English"),
  L("en_AE", "English", "UAE", "English"),
  L("en_UG", "English", "Uganda", "English"),
  L("en_GB", "English", "UK", "English"),
  L("en_US", "English", "US", "English"),
  L("et", "Estonian", null, "Eesti"),
  L("fil", "Filipino", null, "Filipino"),
  L("fi", "Finnish", null, "Suomi"),
  L("fr", "French", null, "Fran\xE7ais"),
  L("fr_BE", "French", "Belgium", "Fran\xE7ais"),
  L("fr_CA", "French", "Canada", "Fran\xE7ais"),
  L("fr_CI", "French", "C\xF4te d\u2019Ivoire", "Fran\xE7ais"),
  L("fr_MA", "French", "Morocco", "Fran\xE7ais"),
  L("fr_CH", "French", "Switzerland", "Fran\xE7ais"),
  L("ka", "Georgian", null, "\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8"),
  L("de", "German", null, "Deutsch"),
  L("de_AT", "German", "Austria", "Deutsch"),
  L("de_CH", "German", "Switzerland", "Deutsch"),
  L("el", "Greek", null, "\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC"),
  L("gu", "Gujarati", null, "\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0"),
  L("ha", "Hausa", null, "Hausa"),
  L("he", "Hebrew", null, "\u05E2\u05D1\u05E8\u05D9\u05EA"),
  L("hi", "Hindi", null, "\u0939\u093F\u0928\u094D\u0926\u0940"),
  L("hu", "Hungarian", null, "Magyar"),
  L("id", "Indonesian", null, "Bahasa Indonesia"),
  L("ga", "Irish", null, "Gaeilge"),
  L("it", "Italian", null, "Italiano"),
  L("ja", "Japanese", null, "\u65E5\u672C\u8A9E"),
  L("kn", "Kannada", null, "\u0C95\u0CA8\u0CCD\u0CA8\u0CA1"),
  L("kk", "Kazakh", null, "\u049A\u0430\u0437\u0430\u049B \u0442\u0456\u043B\u0456"),
  L("rw_RW", "Kinyarwanda", null, "Ikinyarwanda"),
  L("ko", "Korean", null, "\uD55C\uAD6D\uC5B4"),
  L("ky_KG", "Kyrgyz", "Kyrgyzstan", "\u041A\u044B\u0440\u0433\u044B\u0437\u0447\u0430"),
  L("lo", "Lao", null, "\u0EA5\u0EB2\u0EA7"),
  L("lv", "Latvian", null, "Latvie\u0161u"),
  L("lt", "Lithuanian", null, "Lietuvi\u0173"),
  L("mk", "Macedonian", null, "\u041C\u0430\u043A\u0435\u0434\u043E\u043D\u0441\u043A\u0438"),
  L("ms", "Malay", null, "Bahasa Melayu"),
  L("ml", "Malayalam", null, "\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02"),
  L("mr", "Marathi", null, "\u092E\u0930\u093E\u0920\u0940"),
  L("nb", "Norwegian", null, "Norsk bokm\xE5l"),
  L("ps_AF", "Pashto", null, "\u067E\u069A\u062A\u0648"),
  L("fa", "Persian", null, "\u0641\u0627\u0631\u0633\u06CC"),
  L("pl", "Polish", null, "Polski"),
  L("pt_BR", "Portuguese", "Brazil", "Portugu\xEAs"),
  L("pt_PT", "Portuguese", "Portugal", "Portugu\xEAs"),
  L("pa", "Punjabi", null, "\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40"),
  L("ro", "Romanian", null, "Rom\xE2n\u0103"),
  L("ru", "Russian", null, "\u0420\u0443\u0441\u0441\u043A\u0438\u0439"),
  L("sr", "Serbian", null, "\u0421\u0440\u043F\u0441\u043A\u0438"),
  L("si_LK", "Sinhala", null, "\u0DC3\u0DD2\u0D82\u0DC4\u0DBD"),
  L("sk", "Slovak", null, "Sloven\u010Dina"),
  L("sl", "Slovenian", null, "Sloven\u0161\u010Dina"),
  L("es", "Spanish", null, "Espa\xF1ol"),
  L("es_AR", "Spanish", "Argentina", "Espa\xF1ol"),
  L("es_CL", "Spanish", "Chile", "Espa\xF1ol"),
  L("es_CO", "Spanish", "Colombia", "Espa\xF1ol"),
  L("es_CR", "Spanish", "Costa Rica", "Espa\xF1ol"),
  L("es_DO", "Spanish", "Dominican Republic", "Espa\xF1ol"),
  L("es_EC", "Spanish", "Ecuador", "Espa\xF1ol"),
  L("es_HN", "Spanish", "Honduras", "Espa\xF1ol"),
  L("es_MX", "Spanish", "Mexico", "Espa\xF1ol"),
  L("es_PA", "Spanish", "Panama", "Espa\xF1ol"),
  L("es_PE", "Spanish", "Peru", "Espa\xF1ol"),
  L("es_ES", "Spanish", "Spain", "Espa\xF1ol"),
  L("es_UY", "Spanish", "Uruguay", "Espa\xF1ol"),
  L("sw", "Swahili", null, "Kiswahili"),
  L("sv", "Swedish", null, "Svenska"),
  L("ta", "Tamil", null, "\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD"),
  L("te", "Telugu", null, "\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41"),
  L("th", "Thai", null, "\u0E44\u0E17\u0E22"),
  L("tr", "Turkish", null, "T\xFCrk\xE7e"),
  L("uk", "Ukrainian", null, "\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430"),
  L("ur", "Urdu", null, "\u0627\u0631\u062F\u0648"),
  L("uz", "Uzbek", null, "O\u02BBzbek"),
  L("vi", "Vietnamese", null, "Ti\u1EBFng Vi\u1EC7t"),
  L("zu", "Zulu", null, "isiZulu")
];
var BY_ID = new Map(WHATSAPP_LANGUAGES.map((l) => [l.id.toLowerCase(), l]));
var keyOf = (code) => String(code ?? "").trim().replace(/-/g, "_").toLowerCase();
function templateLanguage(code) {
  return BY_ID.get(keyOf(code)) ?? null;
}
function languageName(code) {
  const known = templateLanguage(code);
  if (known) return known.name;
  const base = String(code ?? "").split(/[-_]/)[0];
  const Names = Intl.DisplayNames;
  try {
    const name = base && Names ? new Names(["en"], { type: "language" }).of(base) : void 0;
    return name && name !== base ? name : String(code ?? "");
  } catch {
    return String(code ?? "");
  }
}
function languageLabel(code) {
  return templateLanguage(code)?.label ?? languageName(code);
}

// src/templates/sender-words.ts
var SENDER_WORDS = {
  en: {
    textStop: "Reply STOP to opt out",
    linkAsked: (who, link) => `${who}: here's the link to book, as you asked on the phone: ${link}`,
    emailStop: "Reply STOP to stop these emails.",
    marketing: "This is a marketing email.",
    noThanks: `Not interested? Reply "no thanks" and I won't write again`,
    unsubscribe: "Unsubscribe",
    us: "us",
    offerAsked: (who) => `You asked for offers from ${who}.`,
    offerCustomer: (who) => `You're a customer of ${who}.`,
    visitProposal: (who) => `You're getting this about your proposal from ${who}.`,
    visitBooked: (who) => `You're getting this because of your appointment with ${who}.`,
    visitInTouch: (who) => `You're getting this because you've been in touch with ${who}.`
  },
  es: {
    textStop: "Responde STOP para darte de baja",
    linkAsked: (who, link) => `${who}: aqu\xED tienes el enlace para reservar, como pediste por tel\xE9fono: ${link}`,
    emailStop: "Responde STOP para dejar de recibir estos correos.",
    marketing: "Este es un correo de marketing.",
    noThanks: `\xBFNo te interesa? Responde "no, gracias" y no volver\xE9 a escribirte`,
    unsubscribe: "Darme de baja",
    us: "nosotros",
    offerAsked: (who) => `Pediste recibir ofertas de ${who}.`,
    offerCustomer: (who) => `Eres cliente de ${who}.`,
    visitProposal: (who) => `Recibes esto sobre tu propuesta de ${who}.`,
    visitBooked: (who) => `Recibes esto por tu cita con ${who}.`,
    visitInTouch: (who) => `Recibes esto porque has estado en contacto con ${who}.`
  }
};

// src/shared/unknown.ts
var isCount = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;

// src/templates/templates.ts
var TEMPLATE_STATUS_WORDS = {
  approved: "Approved",
  pending: "In review",
  rejected: "Refused",
  paused: "Paused",
  disabled: "Disabled"
};
var TEMPLATE_BODY_MAX = 1024;
var TEMPLATE_BODY_WORDS = `The message must be under ${TEMPLATE_BODY_MAX} characters.`;

// src/reach-out/reach-out-rules.ts
var REACH_OUT_DRAFTS_PER_DAY = 30;
var REACH_OUT_DRAFTS_OPEN_MAX = 2 * REACH_OUT_DRAFTS_PER_DAY;

// src/reach-out/reach-out-sheet.ts
var REACH_OUT_SHEET_WORDS = {
  sub: "Your email, opened for each business, from your own mailbox. Replies come back to it, and to your Inbox.",
  who: "Ready, with a checked address, never written to. Keeps itself current.",
  opening: "The receptionist opens each email from the finder's record. It never invents a fact: anything it can't back is held.",
  stops: "Stops when they reply, book, unsubscribe, bounce or say no.",
  stopOne: "To stop one business, press Stop writing to them on its lead.",
  first: `Starts today. You approve the first run; after that you have ${PLAYBOOK_VETO_DELAY_WORDS} to stop each one.`,
  slotsHint: "each is filled for each business, or the email is held",
  foot: "Why they're hearing from you, your address, Unsubscribe",
  footHint: "as the law asks",
  repliesHint: "into your Inbox",
  checkLater: "Each email is checked before it goes. The first run waits for you.",
  noMailbox: "Connect the mailbox you'll write from first: Google or Microsoft, here or in Settings \u203A Connections.",
  /** From, when its owner sends it (00429): what they are handed, and how. */
  ownerSends: `Each email is handed to you written and checked, to send from your own inbox: Gmail, Outlook or your mail app. Up to ${REACH_OUT_DRAFTS_PER_DAY} a day.`,
  /** From, with no mailbox connected: the owner sends, and a mailbox would send for them. */
  ownerNoMailbox: "Or connect Google or Microsoft, and your mailbox sends them for you.",
  anotherStep: "Another step",
  anotherStepHint: "\xB7 another email",
  /** The last step may hand each business it reaches to you instead (Part 5, G20). */
  anotherCall: "A call for you",
  anotherNote: "A note for you",
  handHint: "\xB7 ends the chain: each business it reaches is a step on your Today",
  handWords: "What to do",
  handPlaceholder: "Ask whether our quote suited them",
  remove: "Remove",
  removeNote: "Only before its first email goes; after that, pause it.",
  recheck: "Check the held again",
  /** A business on a run's sheet, held, ready or to send, opens its lead over the page (the name's tip). */
  openLead: "Open this business's lead"
};
var REACH_OUT_REFUSALS = {
  exists: "This search has a reach-out already.",
  wrote: "This reach-out has written already. Pause it instead.",
  stepWrote: "That step has written already. Pause the reach-out instead.",
  /** 00228's: a call or a note anywhere but last, and a step changed from one to the other once it has run. */
  handLast: "A call or a note ends the chain.",
  stepRan: "That step has run already. Add a new step instead.",
  outOfPlace: "A step is out of its place. Open the reach-out again.",
  notFound: "Reach-out not found.",
  workspaceNotFound: "Workspace not found.",
  oneEmail: "A reach-out has at least one email.",
  /** lead_set_stage's own, when Not a fit finds its lead missing or erased. */
  leadNotFound: "Lead not found.",
  leadGone: "This lead is gone.",
  /** 00241 reach_out_lead_stop: a lead no chain ever planned (Part 6, H10). */
  nothingWritten: "Nothing has been written to them yet.",
  /** reach_out_report (00241, 00360): any count of days Reports reads, as its other functions take them. */
  period: "A period is 1 to 90 days.",
  searchNotFound: "Search not found.",
  mailboxNotFound: "Mailbox not found.",
  sendNotFound: "Email not found.",
  runNotFound: "Run not found.",
  runOver: "That run is over.",
  gone: "That email has gone.",
  includeHeld: "Only an email the check held for a reason is included.",
  givenUp: "This email waited two weeks for your answer and was given up.",
  decision: "Include, rewrite, skip or not a fit.",
  /** A row's CHECK refused what the words' rules let through: never expected, said plainly. */
  unsaved: "That sequence could not be saved as it is. Check its steps and try again.",
  /** DELETE playbooks/[id] on a reach-out (R16): its history is never deleted there. */
  notHere: "A sequence to leads is removed from its own row, and only before its first email goes. After that, pause it.",
  /** The preview on a deployment that runs nothing. */
  preview: "Previews only work on the production dashboard.",
  previewDown: "The preview could not be written just now. Try again in a moment.",
  budget: "Today's assistant budget is spent, so the preview waits until tomorrow."
};
var REFUSAL_SET = new Set(Object.values(REACH_OUT_REFUSALS));
function stepLabel(n) {
  return n === 0 ? "Your email" : n === 1 ? "A short nudge" : `Email ${n + 1}`;
}
function stepLabelOf(s) {
  if (!s.hand) return stepLabel(s.n);
  return s.hand.kind === "call" ? REACH_OUT_SHEET_WORDS.anotherCall : REACH_OUT_SHEET_WORDS.anotherNote;
}

// src/sequences/sequence-address.ts
var SEQUENCES_ROUTE = "campaigns/sequences";
var sequenceRoute = (id, tab = "steps") => tab === "steps" ? `${SEQUENCES_ROUTE}/${id}` : `${SEQUENCES_ROUTE}/${id}/${tab}`;
var TO_SEND_PARAM = "to-send";
var TO_SEND_ROUTE = `inbox/${TO_SEND_PARAM}`;

// src/reports/campaigns/reach-out-lens.ts
var NO_BUSINESSES = "This database does not count businesses yet.";
var MAILBOXES_LINE = "Where it left from, and how it landed. Past 3% bounced, a mailbox holds itself.";
var STANDS_NOW = "as they stand now";
var SOURCES_LINE = "A business counts once, at the last email that wrote to it. What came of each is as it stands now.";
var DASH = "\u2014";
var NO_EMAILS = {
  written: 0,
  delivered: 0,
  bounced: 0,
  wrote_back: 0,
  interested: 0,
  booked: 0,
  said_no: 0,
  handed: 0
};
var pctText = (n, d) => {
  const share = pct(n, d);
  return share === null ? DASH : `${share}%`;
};
var tenthOf = (n, d) => d > 0 ? Math.round(n / d * 1e3) / 10 : null;
var countedBusinesses = (c) => isCount(c.businesses) ? c.businesses : void 0;
function wholeOf(raw) {
  const { businesses, ...counts } = raw.totals ?? {};
  return {
    timezone: raw.timezone || "UTC",
    days: raw.days ?? 30,
    today: raw.today ?? "",
    end: raw.end ?? raw.today ?? "",
    since: raw.since ?? "",
    has_reach_out: raw.has_reach_out === true,
    totals: { ...NO_EMAILS, ...counts, ...isCount(businesses) ? { businesses } : {} },
    ...raw.before ? { before: raw.before } : {},
    series: raw.series ?? [],
    chains: raw.chains ?? [],
    angles: raw.angles ?? [],
    other_angles: raw.other_angles ?? { written: 0, wrote_back: 0 },
    no_angle: raw.no_angle ?? 0,
    mailboxes: raw.mailboxes ?? []
  };
}
function whenOf(dto) {
  const until = endedOn(dto);
  const oneDay = dto.days === 1 ? withinWords(1, until) : null;
  return { until, within: oneDay ?? `in these ${plural(dto.days, "day")}`, these: oneDay ?? "in these days" };
}
function writtenMeta(counts) {
  const { written } = counts;
  const businesses = countedBusinesses(counts);
  if (businesses !== void 0) return `${plural(businesses, "business", "businesses")} written to`;
  return written === 0 ? "none in this period" : plural(written, "email");
}
function stripFigures(dto) {
  const { written, delivered, bounced } = dto.totals;
  const range = rangeLabelOf(dto.days);
  const prior = dto.before !== void 0 && dto.before.written > 0 ? dto.before : null;
  const emails = plural(written, "email");
  return [
    {
      id: "emails-written",
      metric: "emails_written",
      label: "Emails written",
      value: String(written),
      meta: writtenMeta(dto.totals),
      compare: prior && compareWords(written, prior.written, range, true)
    },
    {
      id: "emails-landed",
      metric: "emails_landed",
      label: "Landed",
      value: pctText(delivered, written),
      meta: written > 0 ? `${delivered} of ${emails} delivered` : "nothing written",
      compare: prior && shareWasWords(written, { part: prior.delivered, of: prior.written }, range),
      // A share of the emails written: of fewer than five, it says nothing (the kit greys it).
      n: written,
      minN: REPORT_MIN_N
    },
    {
      id: "emails-bounced",
      metric: "emails_bounced",
      label: "Bounced",
      value: String(bounced),
      meta: bounced > 0 ? `${bounced} of ${emails} bounced` : "none bounced",
      compare: prior && compareWords(bounced, prior.bounced, range, true)
    }
  ];
}
function emailsPart(dto, when) {
  const { written, delivered, bounced } = dto.totals;
  if (written === 0) return noMix(`Nothing was written ${when.these}.`);
  const entries = [
    ["written", "Written", written],
    ["delivered", "Delivered", delivered],
    ["bounced", "Bounced", bounced]
  ];
  const shares = written >= REPORT_MIN_N ? `: ${pct(delivered, written)}% were delivered and ${pct(bounced, written)}% bounced` : "";
  return mixOf(
    entries,
    `Of ${plural(written, "email")} written ${when.within}${shares}. No opens: only what came back.`
  );
}
function businessesPart(dto, when) {
  const { wrote_back, interested, booked, won, said_no } = dto.totals;
  const businesses = countedBusinesses(dto.totals);
  if (businesses === void 0) return noMix(NO_BUSINESSES);
  if (businesses === 0) return noMix(`No business was written to ${when.these}.`);
  const entries = [
    ["written_to", "Written to", businesses],
    ["wrote_back", "Wrote back", wrote_back],
    ["interested", "Interested", interested],
    ["booked", "Booked", booked],
    // Won (00426): a deal naming the business, won; not said where the database does not count it.
    ...isCount(won) ? [["won", "Won", won]] : [],
    ["said_no", "Said no", said_no]
  ];
  const shares = businesses >= REPORT_MIN_N ? `: ${pct(wrote_back, businesses)}% wrote back and ${pct(interested, businesses)}% were interested` : "";
  const line = `Of ${plural(businesses, "business", "businesses")} written to ${when.within}${shares}. Each counts once, at the last email that wrote to it; a question counts as interested. Who wrote back, was interested, booked${isCount(won) ? ", won" : ""} or said no is as it stands now.`;
  return mixOf(entries, line);
}
function angleRow(id, label, businesses, wroteBack) {
  const of = `${wroteBack} of ${businesses}`;
  const display = businesses === 0 ? DASH : businesses >= REPORT_MIN_N ? `${of}  ${pctText(wroteBack, businesses)}` : of;
  return { id, label, value: pct(wroteBack, businesses) ?? 0, display, n: businesses, minN: REPORT_MIN_N };
}
function anglesPart(dto, when) {
  const other = dto.other_angles;
  const listed = dto.angles.map((a) => ({
    id: a.angle,
    label: a.angle,
    businesses: countedBusinesses(a),
    wroteBack: a.wrote_back
  }));
  if (other.written > 0)
    listed.push({
      id: "other",
      label: "Other angles",
      businesses: countedBusinesses(other),
      wroteBack: other.wrote_back
    });
  if (listed.length === 0)
    return {
      rows: [],
      line: null,
      empty: `No email ${when.these} had an opening, so there is no angle to compare.`
    };
  if (listed.some((a) => a.businesses === void 0)) return { rows: [], line: null, empty: NO_BUSINESSES };
  const unangled = dto.no_angle ? ` ${plural(dto.no_angle, "email")} had no opening, so no angle.` : "";
  return {
    rows: listed.map((a) => angleRow(a.id, a.label, a.businesses ?? 0, a.wroteBack)),
    line: `The opening written for each business, and who answered, ${STANDS_NOW}.${unangled}`,
    empty: null
  };
}
function answeredCell(wroteBack, businesses) {
  if (businesses === void 0 || businesses === 0) return String(wroteBack);
  const said = shareSaid(pct(wroteBack, businesses), wroteBack, businesses) ?? String(wroteBack);
  return isThinShare(businesses, REPORT_MIN_N) ? said : `${said} (${wroteBack})`;
}
function cellsOf(c, businesses) {
  const landed = shareSaid(pct(c.delivered, c.written), c.delivered, c.written) ?? DASH;
  const answered = answeredCell(c.wrote_back, businesses);
  return {
    written: String(c.written),
    delivered: landed,
    businesses: businesses === void 0 ? DASH : String(businesses),
    wroteBack: answered,
    interested: String(c.interested),
    booked: String(c.booked),
    won: isCount(c.won) ? String(c.won) : DASH,
    saidNo: String(c.said_no),
    bounced: String(c.bounced)
  };
}
var HAND_CELLS = {
  written: DASH,
  delivered: DASH,
  businesses: DASH,
  wroteBack: DASH,
  interested: DASH,
  booked: DASH,
  won: DASH,
  saidNo: DASH,
  bounced: DASH
};
function summed(steps) {
  const total = { ...NO_EMAILS };
  for (const s of steps) {
    total.written += s.written;
    total.delivered += s.delivered;
    total.bounced += s.bounced;
    total.wrote_back += s.wrote_back;
    total.interested += s.interested;
    total.booked += s.booked;
    total.said_no += s.said_no;
    total.handed += s.handed;
  }
  return steps.every((s) => isCount(s.won)) ? { ...total, won: sumOf(steps.map((s) => s.won ?? 0)) } : total;
}
function chainBusinesses(steps) {
  if (!steps.every((s) => s.hand !== null || countedBusinesses(s) !== void 0)) return void 0;
  return sumOf(steps.map((s) => countedBusinesses(s) ?? 0));
}
function chainSourceLine(c, nowMs, tz) {
  const last = c.last_at ? Date.parse(c.last_at) : NaN;
  const meta = [
    "To leads",
    plural(c.steps.length, "step"),
    plural(c.runs, "run"),
    c.search ? c.search.name : null,
    c.state === "running" ? null : "paused"
  ];
  return {
    id: c.root_id,
    kind: "chain",
    name: c.name,
    meta: meta.filter(Boolean).join(" \xB7 "),
    to: sequenceRoute(c.root_id),
    ...cellsOf(summed(c.steps), chainBusinesses(c.steps)),
    last: Number.isFinite(last) ? clockDate(last, tz, nowMs) : ""
  };
}
function stepSourceLine(root, s) {
  const line = {
    id: `${root}:${s.id}`,
    kind: "step",
    name: `${s.n + 1} \xB7 ${stepLabelOf({ n: s.n, hand: s.hand ? { kind: s.hand } : null })}`,
    to: null,
    last: ""
  };
  if (s.hand) return { ...line, meta: `${s.handed} handed to you`, ...HAND_CELLS };
  return { ...line, meta: "", ...cellsOf(s, countedBusinesses(s)) };
}
function sourceLines(dto, nowMs) {
  return dto.chains.flatMap((c) => [
    chainSourceLine(c, nowMs, dto.timezone),
    ...c.steps.map((s) => stepSourceLine(c.root_id, s))
  ]);
}
function mailboxStateWords(d, nowMs, tz) {
  if (d.yours) return "You send these";
  if (d.address === null || d.state === "removed") return "Since removed";
  if (d.state === "connected") return "Connected";
  if (d.state === "held") {
    const held = d.held_at ? Date.parse(d.held_at) : NaN;
    const since = Number.isFinite(held) ? ` since ${clockNear(held, tz, nowMs)}` : "";
    return `Held${since}: ${mailboxHoldWords(d.held_why)}`;
  }
  if (d.state === "reconnect") return "Signed out: reconnect it";
  return "Paused";
}
function mailboxCell(n, sent, share) {
  return shareSaid(share(n, sent), n, sent) ?? DASH;
}
function mailboxRows(dto, nowMs) {
  return dto.mailboxes.map(
    (d) => d.yours ? (
      // Sent from their own inbox (00429): a bounce or a complaint reaches them, never us, so no share is said.
      {
        id: "your-inbox",
        address: "Your own inbox",
        state: mailboxStateWords(d, nowMs, dto.timezone),
        held: false,
        sent: d.sent,
        landed: DASH,
        bounced: DASH,
        complained: DASH
      }
    ) : {
      id: d.address ?? "removed",
      address: d.address ?? "A mailbox since removed",
      state: mailboxStateWords(d, nowMs, dto.timezone),
      held: d.state === "held",
      sent: d.sent,
      landed: mailboxCell(d.delivered, d.sent, pct),
      bounced: mailboxCell(d.bounced, d.sent, tenthOf),
      complained: mailboxCell(d.complained, d.sent, tenthOf)
    }
  );
}
function periodLines(dto, when) {
  const handed = dto.totals.handed;
  return {
    written: handed ? `${plural(handed, "business", "businesses")} handed to you as a call or a note, too.` : "",
    mailboxes: MAILBOXES_LINE,
    empty: `No sequence to leads wrote ${withinWords(dto.days, when.until)}.`,
    sources: SOURCES_LINE
  };
}
function toReachOutLensVM(raw, nowMs = Date.now()) {
  const dto = wholeOf(raw);
  const when = whenOf(dto);
  const points = dto.series.map((d) => {
    const point = dayPointOf(d.day);
    return { ...point, written: d.written, writtenWords: `${point.label}: ${d.written} written` };
  });
  return {
    present: dto.has_reach_out,
    empty: dto.totals.written === 0 && dto.totals.handed === 0,
    days: dto.days,
    totals: dto.totals,
    strip: stripFigures(dto),
    emails: emailsPart(dto, when),
    businesses: businessesPart(dto, when),
    angles: anglesPart(dto, when),
    mailboxes: mailboxRows(dto, nowMs),
    points,
    table: { columns: ["Day", "Written"], rows: points.map((p) => [p.label, p.written]) },
    sources: sourceLines(dto, nowMs),
    lines: periodLines(dto, when)
  };
}

// src/templates/message-languages.ts
function languageWords(code) {
  return languageName(code);
}
function languageLabels(codes) {
  const seen = /* @__PURE__ */ new Map();
  for (const c of codes) {
    const w = languageWords(c);
    seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  const out = {};
  for (const c of codes) {
    const w = languageWords(c);
    out[c] = (seen.get(w) ?? 0) > 1 ? templateLanguage(c) ? languageLabel(c) : `${w} (${c})` : w;
  }
  return out;
}

// src/templates/starter-templates.ts
var FIRST = { kind: "first_name", label: "First name", example: "Dani" };
var BUSINESS = { kind: "business_name", label: "Business name", example: "Luna Studio" };
var LINK = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
var FIRST_ES = { ...FIRST, label: "Nombre" };
var BUSINESS_ES = { ...BUSINESS, label: "Nombre del negocio" };
var LINK_ES = { ...LINK, label: "Enlace de reservas" };
var WHEN = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
var SERVICE = { kind: "visit_service", label: "Service", example: "a consultation" };
var WHEN_ES = { ...WHEN, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
var SERVICE_ES = { ...SERVICE, label: "Servicio", example: "una consulta" };
var PROPOSAL = {
  kind: "proposal_link",
  label: "Proposal link",
  example: "https://docs.example.com/proposal"
};
var PROPOSAL_ES = { ...PROPOSAL, label: "Enlace de la propuesta" };
var REVIEW = { kind: "review_link", label: "Review link", example: "https://g.page/r/example/review" };
var REVIEW_ES = { ...REVIEW, label: "Enlace de rese\xF1as" };
var OFFER = { kind: "text", label: "The offer", example: "20% off any service booked before Friday." };
var OFFER_ES = {
  kind: "text",
  label: "La oferta",
  example: "20% de descuento en cualquier servicio reservado antes del viernes."
};
var STOP_EN = SENDER_WORDS.en.textStop;
var STOP_ES = SENDER_WORDS.es.textStop;
var STARTER_TEMPLATES = [
  /* ---- The set (2 Oct 2026), in the order a composer opens on ---- */
  {
    // An offer, and honest about it: it waits for a yes to offers. It asks for a reply rather than sending them to a
    // link, so it needs no booking link on file, and what comes back is a conversation the receptionist can carry.
    key: "winback_reply",
    name: "winback_reply",
    title: "Win-back",
    purpose: "for anyone who has gone quiet",
    category: "marketing",
    trigger: "quiet_30",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's been a while since we last saw you at {{2}}. We'd love to see you again: reply with a day that suits you and we'll find you a time.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS]
      },
      es: {
        body: "Hola {{1}}, hace tiempo que no te vemos en {{2}}. Nos encantar\xEDa volver a verte: responde con el d\xEDa que mejor te venga y te buscamos una hora.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES]
      }
    },
    email: {
      en_US: {
        subject: "It's been a while",
        body: "Hi {{1}},\n\nIt's been a while since we last saw you at {{2}}, and we'd love to see you again.\n\nReply with a day that suits you and we'll find you a time."
      },
      es: {
        subject: "Hace tiempo que no te vemos",
        body: "Hola {{1}}:\n\nHace tiempo que no te vemos en {{2}}, y nos encantar\xEDa volver a verte.\n\nResponde con el d\xEDa que mejor te venga y te buscamos una hora."
      }
    }
  },
  {
    key: "this_months_offer",
    name: "this_months_offer",
    title: "This month's offer",
    purpose: "for everyone who said yes to offers, once a month",
    category: "marketing",
    trigger: "everyone_monthly",
    texts: {
      en_US: {
        body: "Hi {{1}}, this month at {{2}}: {{3}} Book here: {{4}} or reply with a day that suits you.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, OFFER, LINK]
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aqu\xED: {{4}} o responde con el d\xEDa que mejor te venga.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, OFFER_ES, LINK_ES]
      }
    },
    email: {
      en_US: {
        subject: "This month at {{2}}",
        body: "Hi {{1}},\n\nThis month at {{2}}: {{3}}\n\nBook here: {{4}}, or reply with a day that suits you."
      },
      es: {
        subject: "Este mes en {{2}}",
        body: "Hola {{1}}:\n\nEste mes en {{2}}: {{3}}\n\nReserva aqu\xED: {{4}}, o responde con el d\xEDa que mejor te venga."
      }
    }
  },
  {
    key: "visit_reminder",
    name: "visit_reminder",
    title: "Visit reminder",
    purpose: "for the day before an appointment",
    category: "utility",
    trigger: "visit_tomorrow",
    texts: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. A reminder of your appointment {{3}} for {{4}}. If you need to change it, just reply here.",
        footer: null,
        slots: [FIRST, BUSINESS, WHEN, SERVICE]
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Te recordamos tu cita {{3}} para {{4}}. Si necesitas cambiarla, responde aqu\xED.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, WHEN_ES, SERVICE_ES]
      }
    },
    email: {
      en_US: {
        subject: "Your appointment {{3}}",
        body: "Hi {{1}},\n\nA reminder of your appointment at {{2}} {{3}} for {{4}}.\n\nIf you need to change it, just reply to this email."
      },
      es: {
        subject: "Tu cita {{3}}",
        body: "Hola {{1}}:\n\nTe recordamos tu cita en {{2}} {{3}} para {{4}}.\n\nSi necesitas cambiarla, responde a este correo."
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. A reminder of your appointment {{3}} for {{4}}. Reply here if you need to change it."
      },
      es: {
        // Spanish texts keep to the letters the carriers send plainly (é, ñ, ¿ but not á, í, ó, ú), so each goes as one part.
        body: "Hola {{1}}, te escribimos de {{2}}. Te recordamos tu cita {{3}} para {{4}}. Si necesitas cambiarla, responde a este mensaje."
      }
    }
  },
  {
    // About the visit they just had, and nothing else: no offer and no booking push, so it is utility and reaches a
    // yes to texts. Their reply opens WhatsApp's 24 hours, inside which the receptionist may say anything.
    key: "after_visit_check",
    name: "after_visit_check",
    title: "How did it go",
    purpose: "for the day after a visit",
    category: "utility",
    trigger: "visited",
    texts: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. How did everything go? If anything isn't right, reply here and we'll sort it out.",
        footer: null,
        slots: [FIRST, BUSINESS]
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. \xBFQu\xE9 tal fue todo? Si algo no est\xE1 bien, responde aqu\xED y lo solucionamos.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES]
      }
    },
    email: {
      en_US: {
        subject: "How did everything go?",
        body: "Hi {{1}},\n\nThanks for coming to {{2}} yesterday. How did everything go?\n\nIf anything isn't right, just reply to this email and we'll sort it out."
      },
      es: {
        subject: "\xBFQu\xE9 tal fue todo?",
        body: "Hola {{1}}:\n\nGracias por venir ayer a {{2}}. \xBFQu\xE9 tal fue todo?\n\nSi algo no est\xE1 bien, responde a este correo y lo solucionamos."
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. How did everything go? If anything isn't right, reply here and we'll sort it out."
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. \xBFQu\xE9 tal fue todo? Si algo no te ha gustado, responde a este mensaje y lo solucionamos."
      }
    }
  },
  {
    // The day after's other message (10 Oct 2026): the thank-you with a review ask, the link the Google listing keeps.
    // About the appointment they just had, with no offer and no booking push, so it is utility like How did it go. It is
    // offered only where the listing keeps a review link (startersOffered), as its slot is filled from nothing else, and
    // How did it go stays the moment's own: what a composer opens on, and what a campaign picks when nothing is picked.
    key: "after_visit_review",
    name: "after_visit_review",
    title: "After the appointment, with a review ask",
    purpose: "for the day after an appointment, asking for a review",
    category: "utility",
    trigger: "visited",
    texts: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. If you have a minute, a review helps others find us: {{3}}. If anything wasn't right, reply here and we'll sort it out.",
        footer: null,
        slots: [FIRST, BUSINESS, REVIEW]
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. Si tienes un minuto, tu rese\xF1a ayuda a otros a encontrarnos: {{3}}. Si algo no estuvo bien, responde aqu\xED y lo solucionamos.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, REVIEW_ES]
      }
    },
    email: {
      en_US: {
        subject: "Thanks for coming to {{2}}",
        body: "Hi {{1}},\n\nThanks for coming to {{2}} yesterday. If you have a minute, a review helps others find us: {{3}}\n\nIf anything wasn't right, just reply to this email and we'll sort it out."
      },
      es: {
        subject: "Gracias por venir a {{2}}",
        body: "Hola {{1}}:\n\nGracias por venir ayer a {{2}}. Si tienes un minuto, tu rese\xF1a ayuda a otros a encontrarnos: {{3}}\n\nSi algo no estuvo bien, responde a este correo y lo solucionamos."
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, thanks for coming to {{2}} yesterday. A review helps others find us: {{3}} If anything wasn't right, reply here."
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}}. Tu rese\xF1a ayuda a otros a encontrarnos: {{3}} Si algo no estuvo bien, responde a este mensaje."
      }
    }
  },
  {
    // 0006: one nudge per proposal, with its link. Utility, as a reminder of a person's own request is; it names no
    // price, date, amount or offer, and Meta's category decides the yes it needs at the wire (deliver.ts).
    key: "proposal_follow_up",
    name: "proposal_follow_up",
    title: "Proposal follow-up",
    purpose: "for a proposal waiting with nothing back",
    category: "utility",
    trigger: "proposal_waiting",
    texts: {
      en_US: {
        body: "Hi {{1}}, just making sure the proposal from {{2}} reached you: {{3}}. Reply here with any questions.",
        footer: null,
        slots: [FIRST, BUSINESS, PROPOSAL]
      },
      es: {
        body: "Hola {{1}}, solo queremos confirmar que te lleg\xF3 la propuesta de {{2}}: {{3}}. Responde aqu\xED con cualquier pregunta.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, PROPOSAL_ES]
      }
    },
    email: {
      en_US: {
        subject: "Your proposal from {{2}}",
        body: "Hi {{1}},\n\nJust making sure the proposal from {{2}} reached you: {{3}}\n\nReply to this email with any questions."
      },
      es: {
        subject: "Tu propuesta de {{2}}",
        body: "Hola {{1}}:\n\nSolo queremos confirmar que te lleg\xF3 la propuesta de {{2}}: {{3}}\n\nResponde a este correo con cualquier pregunta."
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, just making sure the proposal from {{2}} reached you: {{3}} Reply here with any questions."
      },
      es: {
        body: "Hola {{1}}, queremos confirmar que recibiste la propuesta de {{2}}: {{3}} Responde a este mensaje con cualquier pregunta."
      }
    }
  },
  {
    key: "quick_note",
    name: "quick_note",
    title: "A quick note",
    purpose: "for any one-off send: news, hours, a heads-up",
    category: "marketing",
    trigger: null,
    texts: {
      en_US: {
        body: "Hi {{1}}, a quick note from {{2}}: {{3}} Write back here if you have any questions.",
        footer: STOP_EN,
        slots: [
          FIRST,
          BUSINESS,
          { kind: "text", label: "The note", example: "we're open late on Thursdays this month." }
        ]
      },
      es: {
        body: "Hola {{1}}, una nota r\xE1pida de {{2}}: {{3}} Escr\xEDbenos aqu\xED si tienes alguna pregunta.",
        footer: STOP_ES,
        slots: [
          FIRST_ES,
          BUSINESS_ES,
          { kind: "text", label: "La nota", example: "este mes abrimos hasta tarde los jueves." }
        ]
      }
    },
    email: {
      en_US: {
        subject: "A quick note from {{2}}",
        body: "Hi {{1}},\n\nA quick note from {{2}}: {{3}}\n\nReply to this email if you have any questions."
      },
      es: {
        subject: "Una nota r\xE1pida de {{2}}",
        body: "Hola {{1}}:\n\nUna nota r\xE1pida de {{2}}: {{3}}\n\nResponde a este correo si tienes alguna pregunta."
      }
    }
  },
  {
    // The one a caller asks for OUT LOUD, mid-call: the phone agent texts it when somebody wants to book (edge
    // retell-fn.ts), with the business's WhatsApp named, so a caller who only ever phoned learns where to write.
    //
    // UTILITY, and that is the whole point of writing it down here. It answers a request the person just made, so it
    // needs no separate yes to offers -- and because the category is Meta's own word for that, purposeOfTemplate reads
    // it correctly and nothing has to override the purpose at a call site. It is LAST on purpose: the order is what a
    // composer opens on, and this is the one a caller asks for rather than one anybody broadcasts.
    key: "call_text",
    name: "call_text",
    title: "The call's text",
    purpose: "for a caller who asks to book",
    category: "utility",
    trigger: null,
    texts: {
      en_US: {
        // The first name every starter opens with, and here it is usually "there": the phone agent texts somebody
        // whose name nobody has yet, and resolveParams says so rather than leaving a gap.
        body: "Hi {{1}}, it's {{2}}, thanks for calling. Here's the link to book: {{3}}. This is our WhatsApp too: write to us here any time to book, move or ask about an appointment.",
        footer: null,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}, gracias por llamar. Aqu\xED tienes el enlace para reservar: {{3}}. Este tambi\xE9n es nuestro WhatsApp: escr\xEDbenos aqu\xED cuando quieras para reservar, cambiar o preguntar por una cita.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    },
    sms: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}, thanks for calling. Here's the link to book: {{3}}. You can text us here any time too."
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}, gracias por llamar. Este es el enlace para reservar: {{3}}. Puedes responder a este mensaje cuando quieras."
      }
    }
  },
  /* ---- Retired (2 Oct 2026): never offered again, kept so a workspace that added one still reads it ---- */
  {
    key: "winback_offer",
    name: "winback_offer",
    // Called apart from the set's own Win-back, which a workspace that has this one sees listed beside it.
    title: "Win-back (earlier)",
    purpose: "for anyone quiet 30 days",
    category: "marketing",
    trigger: "quiet_30",
    retired: { by: "winback_reply", why: "It sent people to a link; its place asks for a reply." },
    texts: {
      en_US: {
        body: "Hi {{1}}, it's been a while since we last saw you at {{2}}. We'd love to have you back \u2014 pick a time that suits you here: {{3}} and we'll take care of the rest.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, hace tiempo que no te vemos en {{2}}. Nos encantar\xEDa volver a atenderte \u2014 elige la hora que mejor te venga aqu\xED: {{3}} y nosotros nos ocupamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
  },
  {
    key: "welcome_new",
    name: "welcome_new",
    title: "Welcome",
    purpose: "for anyone new this week",
    category: "marketing",
    trigger: "new_week",
    retired: {
      by: null,
      why: "The receptionist answers a first contact itself; as an offer, a welcome reached nobody new."
    },
    texts: {
      en_US: {
        body: "Hi {{1}}, welcome to {{2}}! This is our WhatsApp \u2014 message us here any time to book, move or ask about an appointment. Book whenever you're ready: {{3}} and we'll take it from there.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, \xA1bienvenido/a a {{2}}! Este es nuestro WhatsApp \u2014 escr\xEDbenos aqu\xED cuando quieras para reservar, cambiar o preguntar por una cita. Reserva cuando quieras: {{3}} y nosotros nos encargamos del resto.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
  },
  {
    key: "save_our_number",
    name: "save_our_number",
    title: "Save our number",
    purpose: "for anyone who only ever phoned",
    category: "marketing",
    trigger: "phoned_only",
    retired: {
      by: "call_text",
      why: "Its people only ever phoned, so none could have said yes to offers; the call's text does its work during the call."
    },
    texts: {
      en_US: {
        body: "Hi {{1}}, thanks for calling {{2}}. Save this number \u2014 on WhatsApp you can book, reschedule or ask us anything in a message, and we answer fast. Book any time: {{3}} or just write to us here.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, gracias por llamar a {{2}}. Guarda este n\xFAmero \u2014 por WhatsApp puedes reservar, cambiar tu cita o preguntarnos lo que quieras, y respondemos r\xE1pido. Reserva cuando quieras: {{3}} o escr\xEDbenos aqu\xED.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
  },
  {
    key: "monthly_offer",
    name: "monthly_offer",
    title: "This month's offer (earlier)",
    purpose: "for everyone who said yes, once a month",
    category: "marketing",
    trigger: "everyone_monthly",
    retired: { by: "this_months_offer", why: "It promised that spaces were limited, which a business may not mean." },
    texts: {
      en_US: {
        body: "Hi {{1}}, this month at {{2}}: {{3}} Book here: {{4}} \u2014 spaces are limited.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, OFFER, LINK]
      },
      es: {
        body: "Hola {{1}}, este mes en {{2}}: {{3}} Reserva aqu\xED: {{4}} \u2014 las plazas son limitadas.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, OFFER_ES, LINK_ES]
      }
    }
  },
  {
    key: "after_visit",
    name: "after_visit",
    title: "After the visit",
    purpose: "for the day after a visit",
    category: "marketing",
    trigger: "visited",
    retired: {
      by: "after_visit_check",
      why: "Asking them to book again made it an offer, which reached only a yes to offers; its place asks how it went."
    },
    texts: {
      en_US: {
        body: "Hi {{1}}, thank you for coming to {{2}} yesterday \u2014 we hope you love the result. When you're ready for your next appointment, pick a time here: {{3}}.",
        footer: STOP_EN,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, gracias por venir ayer a {{2}} \u2014 esperamos que te encante el resultado. Cuando quieras tu pr\xF3xima cita, elige la hora aqu\xED: {{3}}.",
        footer: STOP_ES,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
  },
  {
    // The row this replaced was hand-written straight into one workspace's database, marked approved, with no
    // meta_id: an approval Meta had never given, so every send of it failed, and it failed for every other workspace
    // by not existing at all.
    key: "booking_link",
    name: "booking_link",
    title: "Booking link",
    purpose: "for a caller who asks to book",
    category: "utility",
    trigger: null,
    retired: { by: "call_text", why: "The call's text sends the link and names the business's WhatsApp too." },
    texts: {
      en_US: {
        body: "Hi {{1}}, it's {{2}}. Here's the link to book your appointment: {{3}} \u2014 pick any time that suits you.",
        footer: null,
        slots: [FIRST, BUSINESS, LINK]
      },
      es: {
        body: "Hola {{1}}, te escribimos de {{2}}. Aqu\xED tienes el enlace para reservar tu cita: {{3}} \u2014 elige la hora que mejor te venga.",
        footer: null,
        slots: [FIRST_ES, BUSINESS_ES, LINK_ES]
      }
    }
  }
];

// src/templates/starter-lookup.ts
function starterByName(name) {
  return STARTER_TEMPLATES.find((s) => s.name === name) ?? null;
}

// src/templates/template-titles.ts
var TEMPLATE_TITLE_MAX = 60;
function templateTitle(name, title) {
  const given = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  if (given) return given.slice(0, TEMPLATE_TITLE_MAX);
  const s = starterByName(name);
  if (s) return s.title;
  const words = String(name ?? "").replace(/_v\d+$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : String(name ?? "");
}

// src/reports/campaign-report.ts
var CAMPAIGN_CHANNELS = REPORT_CHANNELS.filter(
  (c) => c.key !== "voice"
);
var WHEN2 = formatterOnUse([], { month: "short", day: "numeric" });
var campaignPriorHadAny = (before) => before.sent + before.optIns + before.optOuts > 0;
function campaignChannelsOf(rows) {
  return (rows ?? []).flatMap((r) => {
    const known = CAMPAIGN_CHANNELS.find((c) => c.key === r.channel);
    if (!known || !(r.sent > 0)) return [];
    const whatsapp = known.key === "whatsapp";
    const deliveredPct = pct(r.delivered, r.sent);
    return [
      {
        channel: known.key,
        label: known.label,
        sent: r.sent,
        delivered: r.delivered,
        deliveredPct,
        read: whatsapp ? r.read : null,
        readPct: whatsapp ? pct(r.read, r.sent) : null,
        replied: r.replied,
        repliedPct: pct(r.replied, r.sent),
        display: `${r.sent} \xB7 ${shareSaid(deliveredPct, r.delivered, r.sent) ?? "\u2014"} delivered`
      }
    ];
  });
}
function columnWords(d) {
  return {
    sentWords: `${dayPointOf(d.day).label}: ${d.sent} sent`,
    answeredWords: d.replied > 0 ? `${d.replied} answered` : null
  };
}
function sourceWords(s) {
  const delivered = shareSaid(pct(s.delivered, s.sent), s.delivered, s.sent);
  const replied = shareSaid(pct(s.replied, s.sent), s.replied, s.sent);
  return {
    deliveredWords: delivered ?? "\u2014",
    repliedWords: replied === null ? "\u2014" : s.sent >= REPORT_MIN_N ? `${replied} (${s.replied})` : replied
  };
}
function channelsLine(channels) {
  if (channels.length < 2) return null;
  const whatsapp = channels.find((c) => c.channel === "whatsapp");
  return whatsapp ? `Read receipts are WhatsApp's alone: ${whatsapp.read} of its ${whatsapp.sent} were read.` : "A text or an email keeps no read receipt.";
}
function toCampaignReportVM(dto) {
  const days = dto.days;
  const series = dto.series ?? [];
  const current = series.slice(-days);
  const previous = series.slice(0, Math.max(0, series.length - days));
  const points = current.map((d) => ({
    ...dayPointOf(d.day),
    sent: d.sent,
    delivered: d.delivered,
    replied: d.replied,
    optIns: d.opt_ins,
    optOuts: d.opt_outs,
    ...columnWords(d)
  }));
  const tot = {
    sent: sumOf(current.map((d) => d.sent)),
    delivered: sumOf(current.map((d) => d.delivered)),
    read: sumOf(current.map((d) => d.read)),
    replied: sumOf(current.map((d) => d.replied)),
    optIns: sumOf(current.map((d) => d.opt_ins)),
    optOuts: sumOf(current.map((d) => d.opt_outs))
  };
  const prev = {
    sent: sumOf(previous.map((d) => d.sent)),
    delivered: sumOf(previous.map((d) => d.delivered)),
    replied: sumOf(previous.map((d) => d.replied)),
    optIns: sumOf(previous.map((d) => d.opt_ins)),
    optOuts: sumOf(previous.map((d) => d.opt_outs))
  };
  const channels = campaignChannelsOf(dto.by_channel);
  const whatsapp = channels.find((c) => c.channel === "whatsapp");
  const read = dto.by_channel ? whatsapp?.read ?? 0 : tot.read;
  const readOf = dto.by_channel ? whatsapp?.sent ?? 0 : tot.sent;
  const rawSources = dto.sources ?? [];
  const sends = sumOf(rawSources.map((s) => s.runs));
  const sources = rawSources.map((s) => ({
    id: s.id,
    kind: s.kind,
    kindLabel: s.kind === "playbook" ? "Campaign" : "Sent once",
    name: s.name,
    templateName: s.template_name,
    template: s.template_name ? templateTitle(s.template_name) : "",
    runs: s.runs,
    sent: s.sent,
    delivered: s.delivered,
    read: s.read,
    replied: s.replied,
    deliveredPct: pct(s.delivered, s.sent),
    repliedPct: pct(s.replied, s.sent),
    ...sourceWords(s),
    lastLabel: s.last_at ? WHEN2.format(new Date(s.last_at)) : ""
  }));
  return {
    days,
    points,
    totals: { ...tot, read, readOf, sends },
    before: prev,
    sources,
    empty: tot.sent === 0 && tot.optIns === 0 && tot.optOuts === 0,
    table: {
      columns: ["Day", "Sent", "Delivered", "Answered", "Said yes", "Asked to stop"],
      rows: points.map((p) => [p.label, p.sent, p.delivered, p.replied, p.optIns, p.optOuts])
    },
    channels,
    channelTable: {
      columns: ["Channel", "Sent", "Delivered", "Read", "Answered"],
      rows: channels.map((c) => [c.label, c.sent, c.delivered, c.read, c.replied])
    },
    lines: {
      sent: sends ? sends === 1 ? "From one run." : `From ${sends} runs.` : null,
      channels: channelsLine(channels)
    }
  };
}

// src/broadcasts/broadcast-failure-words.ts
var BROADCAST_FAILURES = [
  "paused",
  "template_not_approved",
  "wire_unavailable",
  "run_interrupted",
  "throttled",
  "stalled",
  "people_unreadable",
  "after_hours",
  "provider_limit",
  "campaigns_domain_unverified",
  "email_offers_paused"
];
var WIRE_FAILURES = ["wire_unavailable", "throttled", "stalled"];
var isFailure = (code) => BROADCAST_FAILURES.includes(code);
var isWireFailure = (code) => WIRE_FAILURES.includes(code);
function readFailure(stored) {
  const [code, named, ...rest] = stored.split(":");
  if (code === void 0 || !isFailure(code) || rest.length > 0) return null;
  if (named === void 0) return { code, channel: "whatsapp" };
  const channel = CONSENT_CHANNELS.find((c) => c === named);
  return channel && isWireFailure(code) ? { code, channel } : null;
}
var wordsFor = (w, channel) => typeof w === "string" ? w : w[channel];
var BROADCAST_FAILURE_WORDS = {
  paused: "the workspace was paused",
  template_not_approved: "its WhatsApp version is no longer approved",
  wire_unavailable: {
    whatsapp: "WhatsApp could not be reached",
    sms: "the texting provider could not be reached",
    email: "the mail provider could not be reached"
  },
  run_interrupted: "its send stopped partway and did not start again",
  throttled: {
    whatsapp: "WhatsApp kept limiting how fast this number may send",
    sms: "the texting provider kept limiting how fast this line may send",
    email: "the mail provider kept limiting how fast this workspace may send"
  },
  stalled: {
    whatsapp: "its people or its number's credentials could not be read for half an hour",
    sms: "its line's credentials could not be read for half an hour",
    email: "its mailbox could not be read for half an hour"
  },
  people_unreadable: "its people could not be read for half an hour",
  after_hours: "the day's sending hours ran out before it was done",
  provider_limit: "the mail provider's limit for the day or the month was reached",
  campaigns_domain_unverified: "the domain offers by email leave from is not verified with the mail provider",
  email_offers_paused: "the workspace's offers by email were paused while complaints and bounces settled"
};
function broadcastFailureWords(failure) {
  if (!failure) return "no reason was recorded";
  const read = readFailure(failure);
  return read ? wordsFor(BROADCAST_FAILURE_WORDS[read.code], read.channel) : "it could not finish";
}

// src/conversations/thread-channel.ts
function writtenChannelOf(channel) {
  return channel === "sms" || channel === "email" || channel === "instagram" ? channel : "whatsapp";
}

// src/conversations/message-words.ts
var WHATSAPP_FAILURES = {
  130429: "Your number has reached WhatsApp's message limit for now",
  131026: "WhatsApp couldn't deliver it: their number may not be on WhatsApp, or they haven't accepted its latest terms or updated the app",
  131031: "Your WhatsApp Business account is restricted or disabled, or WhatsApp couldn't verify its details",
  131042: "WhatsApp reports a problem with your payment method",
  131047: "WhatsApp wouldn't send it: more than 24 hours have passed since they last replied, so only a template message can reach them now",
  131048: "WhatsApp is limiting how many messages your number can send, because earlier ones were blocked or flagged as spam",
  131049: "WhatsApp held it back: Meta limits marketing messages to each person, and isn't delivering marketing messages to US numbers at all for now",
  131050: "They've chosen to stop receiving marketing messages from your business on WhatsApp",
  131053: "WhatsApp couldn't upload the attachment, for a reason such as a file type it doesn't support",
  131056: "Your number sent them too many messages in a short while, and WhatsApp asks you to wait before sending more to them",
  132e3: "The template's variable values didn't match the ones it defines",
  132001: "That template doesn't exist in this language, or hasn't been approved",
  132012: "The template's variable values were formatted wrongly",
  132015: "That template is paused because of its low quality",
  132016: "That template was permanently disabled for low quality"
};
var SMS_FAILURES = {
  21211: "That isn't a valid phone number",
  21408: "Texts to that region are turned off for your account",
  21610: "They've opted out of texts from your number",
  21614: "That number isn't a valid mobile number",
  30003: "Their phone couldn't be reached: it may be off, out of signal, or unable to receive texts",
  30004: "The text was blocked from reaching this number",
  30005: "The carrier says this number is unknown and may no longer exist",
  30006: "This number can't receive texts, which is typical of a landline",
  30007: "The text was filtered as a possible policy violation",
  30008: "The carrier gave no reason for not delivering it",
  30034: "Your texting line isn't registered with the carriers yet, so they blocked it"
};
var SMS_STATUS_WORDS = {
  undelivered: "The carrier didn't deliver it.",
  failed: "The text couldn't be sent.",
  canceled: "The text was canceled before it left."
};
var EMAIL_FAILURES = {
  bounced: "The email bounced: their address didn't accept it.",
  failed: "The mail provider couldn't send it.",
  suppressed: "The mail provider has stopped sending to this address after an earlier bounce or complaint."
};
var SETTLED_FAILURES = {
  never_delivered: "It was never sent: the job that would have sent it never ran.",
  run_interrupted: "It may not have gone: the run that was sending it did not finish.",
  orphaned: "It was never sent: no job was left to send it."
};
var record = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
function tableWord(table, key) {
  return Object.hasOwn(table, key) ? table[key] : void 0;
}
function codeOf(v) {
  if (typeof v === "number") return Number.isInteger(v) && v > 0 ? v : null;
  return typeof v === "string" && /^\d{3,6}$/.test(v.trim()) ? Number(v.trim()) : null;
}
function providerCodeOf(error) {
  const listed = Array.isArray(error.errors) ? record(error.errors[0]) : null;
  const direct = codeOf(listed?.code) ?? codeOf(error.code);
  if (direct !== null) return direct;
  const body = error.body;
  if (typeof body === "string") {
    const graph = /"code"\s*:\s*(\d{3,6})/.exec(body);
    if (graph) return Number(graph[1]);
    const twilio = /^Twilio (\d{5})$/.exec(body.trim());
    return twilio ? Number(twilio[1]) : null;
  }
  return codeOf(record(record(body)?.error)?.code);
}
function sendFailureWords(error, channel) {
  const e = record(error);
  if (!e) return null;
  const wire = writtenChannelOf(channel);
  if (wire === "email") {
    const provider = typeof e.provider === "string" ? e.provider : "";
    return tableWord(EMAIL_FAILURES, provider) ?? settledWords(e);
  }
  const code = providerCodeOf(e);
  const sms = wire === "sms";
  if (code !== null) {
    const meaning = tableWord(sms ? SMS_FAILURES : WHATSAPP_FAILURES, code);
    if (meaning) return `${meaning} (${sms ? "Twilio" : "WhatsApp"} error ${code}).`;
    return sms ? `Twilio didn't deliver it (error ${code}).` : `WhatsApp didn't deliver it (error ${code}).`;
  }
  const carrier = typeof e.carrier === "string" ? tableWord(SMS_STATUS_WORDS, e.carrier) : void 0;
  return carrier ?? settledWords(e);
}
var OUTCOME_UNKNOWN_KIND = "outcome_unknown";
function failureWordsOf(channel, key) {
  if (key.code !== null) return sendFailureWords({ code: key.code }, channel);
  if (key.kind === null) return null;
  if (key.kind === OUTCOME_UNKNOWN_KIND) return sendFailureWords({ outcome: "unknown" }, channel);
  const wire = writtenChannelOf(channel);
  const own = wire === "email" ? { provider: key.kind } : wire === "sms" ? { carrier: key.kind } : {};
  return sendFailureWords({ ...own, reason: key.kind }, channel);
}
function settledWords(e) {
  const settled = typeof e.reason === "string" ? tableWord(SETTLED_FAILURES, e.reason) : void 0;
  if (settled) return settled;
  return e.outcome === "unknown" ? "The provider didn't answer in time, so it may have gone: check the thread before sending it again." : null;
}

// src/reports/campaigns/campaign-words.ts
var NO_FIGURE = "\u2014";
var NOTHING_WENT_OUT = "Nothing went out in this period.";
function reachOutsWroteWords(emails, businesses) {
  if (emails === 0) return "";
  const to = businesses === void 0 ? "" : ` to ${plural(businesses, "business", "businesses")}`;
  return ` Your sequences to leads wrote ${plural(emails, "email")}${to}.`;
}
function peopleHeadWords({ messages, people, runs, wroteBack, before, range }) {
  const sentence = `${plural(messages, "message")} to ${plural(people, "person", "people")} over ${plural(runs, "run")}`;
  if (people < REPORT_MIN_N || wroteBack === null) return `${sentence}.`;
  const hadPeople = before.sentTo !== null && before.sentTo > 0 && before.wroteBack !== null;
  const was = hadPeople ? ` (${before.wroteBack === 0 ? "none" : before.wroteBack} ${beforeWords(range)})` : "";
  return `${sentence}; ${wroteBack} of ${people} wrote back${was}.`;
}
function sendsHeadWords(sent) {
  const sentence = `${plural(sent.messages, "message")} over ${plural(sent.runs, "run")}`;
  return sent.messages >= REPORT_MIN_N ? `${sentence}; people wrote back to ${sent.replied} of them.` : `${sentence}.`;
}
var NO_MESSAGE_SENT = "no message went out in this period";
var NOTHING_SENT = "nothing sent";
var NOBODY_SENT_TO = "nobody was sent a message in this period";
var NOBODY_IN_PERIOD = "nobody in this period";
var ANSWER_META = `after a message of yours, ${REPLY_WINDOW_WORDS}`;
function sentToMeta(messages, runs) {
  if (messages === null) return plural(runs, "run");
  return messages === 0 ? NO_MESSAGE_SENT : `${plural(messages, "message")} over ${plural(runs, "run")}`;
}
function deliveredMeta(delivered, sent) {
  return sent === 0 ? NOTHING_SENT : `${delivered} of ${sent} \xB7 ${DELIVERY_RECEIPTS_WORDS}`;
}
function wroteBackMeta(facts) {
  if (facts.people === 0) return NOBODY_SENT_TO;
  const still = facts.counting !== null && facts.counting > 0 ? `, ${facts.counting} sent to in the last ${REPLY_DAYS} may still answer` : "";
  return `${facts.wroteBack} of ${plural(facts.people, "person", "people")} ${REPLY_WINDOW_WORDS}${still}`;
}
var NO_MESSAGE_WENT_OUT = "No message went out in this period.";
var wasWere = (n) => n === 1 ? "was" : "were";
function funnelLine(f) {
  if (f.sent < REPORT_MIN_N) {
    return `Of ${plural(f.sent, "message")}, ${f.delivered} ${wasWere(f.delivered)} delivered and ${f.replied} ${wasWere(f.replied)} answered.`;
  }
  const read = f.readOf >= REPORT_MIN_N ? `, ${pct(f.read, f.readOf)}% of WhatsApp's were read` : "";
  return `${pct(f.delivered, f.sent)}% were delivered${read} and ${pct(f.replied, f.sent)}% were answered ${REPLY_WINDOW_WORDS}, of ${plural(f.sent, "message")}.`;
}
var HELD_EMPTY = "Nobody was held back in this period.";
var HELD_OTHER = "Another reason";
var heldKeyOf = (key) => ownWord(HELD_REASONS, key) === void 0 ? "other" : key;
var heldReasonWords = (key) => capitalize(ownWord(HELD_REASONS, key) ?? HELD_OTHER);
var heldBackLine = (held, sent) => `${held} of the ${plural(sent + held, "message")} planned ${wasWere(held)} held back or could not be sent.`;
var REACH_OUTS_UNDER = "Runs to leads are not counted here.";
var STOPPED_EMPTY = `No run failed or was canceled in this period. ${REACH_OUTS_UNDER}`;
var CANCELED_KEY = "canceled";
var stoppedKeyOf = (key) => readFailure(key) === null ? "other" : key;
var stoppedWords = (key) => key === CANCELED_KEY ? "Canceled" : capitalize(broadcastFailureWords(key));
var stoppedLine = (failed, canceled) => `${plural(failed, "run")} failed and ${canceled} ${wasWere(canceled)} canceled. ${REACH_OUTS_UNDER}`;
var FAILED_WHY_EMPTY = "No sent message failed in this period.";
var UNRECORDED_REASON = "Reason not recorded";
function failedReasonWords(row) {
  const words = failureWordsOf(row.channel, { code: row.code ?? null, kind: row.kind ?? null });
  return words === null ? UNRECORDED_REASON : words.replace(/\.$/, "");
}
var failedWhyLine = (total) => `${plural(total, "message")} failed after ${total === 1 ? "it was" : "they were"} sent, for the provider's own reason.`;
var BY_MESSAGE_LINE = `A reply is counted only for messages sent more than ${REPLY_DAYS} ago, so each has had its time.`;
var byMessageLine = (tooNew) => tooNew === 0 ? BY_MESSAGE_LINE : `${BY_MESSAGE_LINE} ${tooNew} sent since ${tooNew === 1 ? "is" : "are"} not counted yet.`;
function messageRateWords(m) {
  if (m.mature === 0) return `${m.sent} sent in the last ${REPLY_DAYS}, too new to say`;
  const said = messagesAnsweredWords(m.replied, m.mature);
  return isThinShare(m.mature, REPORT_MIN_N) ? said : `${said}  ${pct(m.replied, m.mature)}%`;
}
function runsLineWords(moment, broadcast) {
  const kinds = [
    moment > 0 ? plural(moment, "campaign run") : null,
    broadcast > 0 ? plural(broadcast, "one-off send") : null
  ].filter((kind) => kind !== null);
  return kinds.length === 0 ? null : `From ${joinWords(kinds)}.`;
}
var FIRST_REPLY_EMPTY = "No message was answered in this period.";
var FIRST_REPLY_ROWS = [
  ["m15", "Within 15 minutes"],
  ["h1", "Within an hour"],
  ["h4", "Within 4 hours"],
  ["h24", "Within a day"],
  ["h72", `Within ${REPLY_DAYS}`]
];
var APPROVAL_EMPTY = "No run waited for your OK in this period.";
var APPROVAL_ROWS = [
  ["h1", "An hour or less"],
  ["h4", "Up to 4 hours"],
  ["h24", "Up to a day"],
  ["over", "More than a day"]
];
function firstReplyLine(n, medianS) {
  if (n < REPORT_MIN_N)
    return `${plural(n, "message")} ${n === 1 ? "has" : "have"} been answered so far: too few for a middle.`;
  if (medianS === null) return null;
  return `The middle one was answered ${durationWords(medianS)} after it was sent, of ${plural(n, "answered message")}.`;
}
function approvalLine(n, medianS, skipped = 0) {
  const unanswered = skipped > 0 ? ` ${approvalSkippedLine(skipped)}` : "";
  if (n < REPORT_MIN_N) return `${plural(n, "run")} you approved: too few for a middle.${unanswered}`;
  if (medianS === null) return null;
  return `The middle wait for your OK was ${durationWords(medianS)}, over ${plural(n, "run")} you approved.${unanswered}`;
}
function approvalSkippedLine(skipped) {
  return `${plural(skipped, "run was", "runs were")} skipped: nobody answered before ${skipped === 1 ? "its" : "their"} day ended.`;
}
function runsWaitingMeta(n, late) {
  if (n === 0) return "nothing is waiting for your OK";
  const one = n === 1;
  if (late === 0) return one ? "it can still be approved" : "they can still be approved";
  if (late >= n) return one ? "it is past its day: skip it" : "they are past their day: skip them";
  return `${late} past their day (skip those), ${n - late} can still be approved`;
}
var RUNS_FAILED_NONE = `no run failed in the last ${STUCK_DAYS}`;
var REACH_OUT_STEP_COUNTS = "a step to leads counts too";
function failedRunMeta(failed) {
  if (failed.n === 0) return RUNS_FAILED_NONE;
  const what = failed.latest === null ? `${plural(failed.n, "run")} failed in the last ${STUCK_DAYS}` : `the latest: ${failed.latest.name}, ${broadcastFailureWords(failed.latest.failure)}`;
  return `${what} \xB7 ${REACH_OUT_STEP_COUNTS}`;
}
var REPLIES_NONE = "nobody who answered a campaign is waiting";
var REPLIES_WAITING = `people who answered a campaign in the last ${STUCK_DAYS} and wait for a person`;
var TEMPLATES_NONE = "every WhatsApp message is approved";
var TEMPLATES_TITLED = 2;
function templatesMeta(templates) {
  if (templates.n === 0) return TEMPLATES_NONE;
  return templates.items.slice(0, TEMPLATES_TITLED).map((t) => `${templateTitle(t.name)} ${TEMPLATE_STATUS_WORDS[t.status].toLowerCase()}`).join(", ");
}
var NUMBER_HEALTH_WORDS = { ok: "Good", warn: "Medium", danger: "Flagged", unknown: "Not reported" };
var NUMBER_HEALTH_TONES = {
  ok: {},
  warn: { tone: "warn" },
  danger: { tone: "fail" },
  unknown: {}
};
var NUMBER_NONE = "no WhatsApp number is connected";
var NUMBER_UNREAD = "this number could not be read";
function numberMeta(number, tz, nowMs) {
  const at = number.checked_at === null ? NaN : Date.parse(number.checked_at);
  return Number.isNaN(at) ? number.label : `${number.label} \xB7 checked ${clockNear(at, tz, nowMs)}`;
}
var FAILED_WHAT = {
  campaigns: "the campaign numbers",
  ledger: "who it reached and what is stuck",
  stuck: "what is stuck now",
  reach_outs: "the numbers for leads"
};
var STILL_READ = {
  campaigns: "the sends and their channels",
  ledger: "who it reached",
  stuck: "what is stuck now",
  reach_outs: "the sequences to leads"
};
var REST_IS_CURRENT = "The rest of this page is current.";
var NOTHING_ELSE_READ = "Nothing else on this page could be read either.";
var onlyReadWords = (landed) => `Only ${joinWords(landed.map((part) => STILL_READ[part]))} could be read.`;

// src/shell/address.ts
var MESSAGES_ROUTE = "campaigns/messages";

// src/reports/campaigns/campaign-lens.ts
var knownCount = (v) => isCount(v) ? v : null;
function readsOf({ campaigns, ledger, reachOuts }) {
  return {
    campaigns: campaigns === null ? "failed" : "ok",
    ledger: ledger === null ? "failed" : ledger.series === null ? "missing" : "ok",
    stuck: ledger === null || ledger.stuck_failed === true ? "failed" : ledger.stuck === null ? "missing" : "ok",
    reachOuts: reachOuts === void 0 ? "none" : reachOuts === null ? "failed" : "ok"
  };
}
function failedReads(reads) {
  const status = [
    ["campaigns", reads.campaigns],
    ["ledger", reads.ledger],
    ["stuck", reads.stuck],
    ["reach_outs", reads.reachOuts]
  ];
  const failing = status.filter(([part, is]) => is === "failed" && !(part === "stuck" && reads.ledger === "failed"));
  const landed = status.filter(([, is]) => is === "ok").map(([part]) => part);
  const others = failing.length === 1 ? REST_IS_CURRENT : landed.length === 0 ? NOTHING_ELSE_READ : onlyReadWords(landed);
  return failing.map(([part]) => ({ part, what: FAILED_WHAT[part], body: others }));
}
function reachedPeopleOf({ people }) {
  return {
    sentTo: knownCount(people.now.sent_to),
    wroteBack: knownCount(people.now.wrote_back),
    counting: knownCount(people.now.counting),
    before: { sentTo: knownCount(people.before.sent_to), wroteBack: knownCount(people.before.wrote_back) }
  };
}
function runsOf({ runs }) {
  const moment = knownCount(runs.now.moment);
  const broadcast = knownCount(runs.now.broadcast);
  return { moment, broadcast, total: moment === null || broadcast === null ? null : moment + broadcast };
}
function isQuiet(report, series) {
  if (report === null) return false;
  const { sent, optIns, optOuts } = report.totals;
  if (sent + optIns + optOuts > 0) return false;
  if (series === null) return true;
  const { held, stopped, failed_sends, approval, people } = series;
  return [held.total, stopped.failed, stopped.canceled, failed_sends.total, approval.n, people.now.wrote_back].every(
    (n) => n === 0
  );
}
function campaignHead(report, series, reach) {
  const { sent, replied, sends } = report.totals;
  if (sent === 0) {
    return `${NOTHING_WENT_OUT}${reach === null ? "" : reachOutsWroteWords(reach.totals.written, reach.totals.businesses)}`;
  }
  const people = series === null ? null : reachedPeopleOf(series);
  const runs = series === null ? null : runsOf(series).total;
  if (series === null || people === null || people.sentTo === null || runs === null) {
    return sendsHeadWords({ messages: sent, runs: sends, replied });
  }
  return peopleHeadWords({
    messages: sent,
    people: people.sentTo,
    runs,
    wroteBack: people.wroteBack,
    before: people.before,
    range: rangeLabelOf(series.days)
  });
}
function sentToFigures(report, series) {
  if (series === null) return [];
  const { sentTo, before } = reachedPeopleOf(series);
  const runs = runsOf(series).total;
  if (sentTo === null || runs === null) return [];
  return [
    {
      id: "people-sent-to",
      metric: "people_sent_to",
      label: "People sent to",
      value: String(sentTo),
      meta: sentToMeta(report === null ? null : report.totals.sent, runs),
      compare: before.sentTo === null ? null : compareWords(sentTo, before.sentTo, rangeLabelOf(series.days), before.sentTo > 0)
    }
  ];
}
function deliveredShareFigure({ totals, before, days }) {
  const share = pct(totals.delivered, totals.sent);
  return {
    id: "delivered",
    metric: "delivered_share",
    label: "Delivered",
    value: share === null ? NO_FIGURE : `${share}%`,
    meta: deliveredMeta(totals.delivered, totals.sent),
    compare: shareWasWords(totals.sent, { part: before.delivered, of: before.sent }, rangeLabelOf(days)),
    n: totals.sent,
    minN: REPORT_MIN_N
  };
}
function wroteBackFigures(series) {
  if (series === null) return [];
  const { sentTo, wroteBack, counting, before } = reachedPeopleOf(series);
  if (sentTo === null || wroteBack === null) return [];
  const share = pct(wroteBack, sentTo);
  const was = before.sentTo === null || before.wroteBack === null ? null : shareWasWords(sentTo, { part: before.wroteBack, of: before.sentTo }, rangeLabelOf(series.days));
  return [
    {
      id: "wrote-back",
      metric: "people_wrote_back",
      label: "Wrote back",
      value: share === null ? NO_FIGURE : `${share}%`,
      meta: wroteBackMeta({ wroteBack, people: sentTo, counting }),
      compare: was,
      n: sentTo,
      minN: REPORT_MIN_N
    }
  ];
}
function answerFigures({ totals, before, days }) {
  const priorHadAny = campaignPriorHadAny(before);
  const range = rangeLabelOf(days);
  return [
    {
      id: "said-yes",
      metric: "said_yes",
      label: "Said yes",
      value: String(totals.optIns),
      meta: totals.optIns > 0 ? ANSWER_META : NOBODY_IN_PERIOD,
      compare: compareWords(totals.optIns, before.optIns, range, priorHadAny)
    },
    {
      id: "asked-to-stop",
      metric: "asked_to_stop",
      label: "Asked to stop",
      value: String(totals.optOuts),
      meta: totals.optOuts > 0 ? ANSWER_META : NOBODY_IN_PERIOD,
      compare: compareWords(totals.optOuts, before.optOuts, range, priorHadAny)
    }
  ];
}
function campaignStrip(report, series) {
  return [
    ...sentToFigures(report, series),
    ...report === null ? [] : [deliveredShareFigure(report)],
    ...wroteBackFigures(series),
    ...report === null ? [] : answerFigures(report)
  ];
}
function sumUnder(counts, keyOf2) {
  const sums = /* @__PURE__ */ new Map();
  for (const [key, n] of Object.entries(counts)) {
    if (isCount(n)) sums.set(keyOf2(key), (sums.get(keyOf2(key)) ?? 0) + n);
  }
  return Object.fromEntries(sums);
}
function funnelPart(report) {
  if (report === null) return noMix(null);
  const { sent, delivered, read, readOf, replied } = report.totals;
  if (sent === 0) return noMix(NO_MESSAGE_WENT_OUT);
  const entries = [
    ["sent", "Sent", sent],
    ["delivered", "Delivered", delivered]
  ];
  if (readOf > 0) entries.push(["read", "Read", read]);
  entries.push(["replied", "Answered", replied]);
  return { rows: barsOf(entries), line: funnelLine({ sent, delivered, read, readOf, replied }), empty: null };
}
function heldPart(report, series) {
  if (series === null) return noMix(null);
  const { total, by_reason } = series.held;
  if (!isCount(total)) return noMix(null);
  if (total === 0) return noMix(HELD_EMPTY);
  const rows = barsOf(rankedEntries(sumUnder(by_reason, heldKeyOf), heldReasonWords));
  return { rows, line: report === null ? null : heldBackLine(total, report.totals.sent), empty: null };
}
function stoppedPart(series) {
  if (series === null) return noMix(null);
  const { failed, canceled, by_failure } = series.stopped;
  if (!isCount(failed) || !isCount(canceled)) return noMix(null);
  if (failed + canceled === 0) return noMix(STOPPED_EMPTY);
  const counts = { ...sumUnder(by_failure, stoppedKeyOf), [CANCELED_KEY]: canceled };
  return { rows: barsOf(rankedEntries(counts, stoppedWords)), line: stoppedLine(failed, canceled), empty: null };
}
function failedWhyPart(series) {
  if (series === null) return noMix(null);
  const { total, by_code } = series.failed_sends;
  if (!isCount(total)) return noMix(null);
  if (total === 0) return noMix(FAILED_WHY_EMPTY);
  const counts = /* @__PURE__ */ new Map();
  for (const row of by_code) {
    if (!isCount(row.n)) continue;
    const why = failedReasonWords(row);
    counts.set(why, (counts.get(why) ?? 0) + row.n);
  }
  const rows = barsOf(rankedEntries(Object.fromEntries(counts), (why) => why));
  return { rows, line: failedWhyLine(total), empty: null };
}
var isWholeMessage = (m) => typeof m.name === "string" && typeof m.language === "string" && isCount(m.sent) && isCount(m.mature) && isCount(m.replied);
function titledMessages(messages) {
  return messages.map((message) => {
    const title = templateTitle(message.name);
    const alike = messages.filter((m) => templateTitle(m.name) === title);
    if (alike.length === 1) return { message, title };
    const language = languageLabels(alike.map((m) => m.language))[message.language] ?? message.language;
    return { message, title: `${title} (${language})` };
  });
}
function byMessagePart(series) {
  const none = { rows: [], line: null, empty: null };
  if (series === null) return none;
  if (series.by_message.length === 0) return { ...none, empty: NO_MESSAGE_WENT_OUT };
  const messages = series.by_message.filter(isWholeMessage);
  if (messages.length === 0) return none;
  const tooNew = sumOf(messages.map((m) => Math.max(0, m.sent - m.mature)));
  return {
    rows: titledMessages(messages).map(({ message: m, title }) => ({
      id: `${m.name}:${m.language}`,
      label: title,
      value: pct(m.replied, m.mature) ?? 0,
      display: messageRateWords(m),
      n: m.mature,
      minN: REPORT_MIN_N
    })),
    line: byMessageLine(tooNew),
    empty: null
  };
}
function runsLineOf(series) {
  if (series === null) return null;
  const { moment, broadcast } = runsOf(series);
  return moment === null || broadcast === null ? null : runsLineWords(moment, broadcast);
}
function waitPart(dist, words) {
  if (dist === null || !isCount(dist.n)) return noMix(null);
  const skipped = "skipped" in dist && isCount(dist.skipped) ? dist.skipped : 0;
  if (dist.n === 0) return noMix(skipped > 0 ? approvalSkippedLine(skipped) : words.empty);
  const buckets = dist.buckets;
  const entries = [];
  for (const [key, label] of words.rows) {
    const count = buckets[key];
    if (!isCount(count)) return noMix(null);
    entries.push([key, label, count]);
  }
  const median = typeof dist.median_s === "number" && Number.isFinite(dist.median_s) ? dist.median_s : null;
  return { rows: barsOf(entries), line: words.line(dist.n, median, skipped), empty: null };
}
var FIRST_REPLY_WORDS = { rows: FIRST_REPLY_ROWS, empty: FIRST_REPLY_EMPTY, line: firstReplyLine };
var APPROVAL_WORDS = { rows: APPROVAL_ROWS, empty: APPROVAL_EMPTY, line: approvalLine };
var stuckValue = (n, capped) => capped ? `${n}+` : String(n);
var stuckTone = (n, tone) => n > 0 ? { tone } : {};
function stuckFiguresOf(stuck, tz, nowMs) {
  const { waiting, failed, replies, templates, number } = stuck;
  const figure = { compare: null };
  const health = number.state === "read" ? number.tone : null;
  const standing = number.state === "read" ? number.standing ?? null : null;
  return [
    {
      ...figure,
      id: "runs-waiting",
      metric: "runs_waiting",
      label: "Runs waiting for you",
      value: stuckValue(waiting.n, waiting.capped),
      meta: runsWaitingMeta(waiting.n, waiting.late),
      door: SEQUENCES_ROUTE,
      ...stuckTone(waiting.n, "warn")
    },
    {
      ...figure,
      id: "runs-failed",
      metric: "runs_failed",
      label: "Failed runs",
      value: stuckValue(failed.n, failed.capped),
      meta: failedRunMeta(failed),
      door: SEQUENCES_ROUTE,
      ...stuckTone(failed.n, "fail")
    },
    {
      ...figure,
      id: "replies-waiting",
      metric: "campaign_replies_waiting",
      label: "Replies that need you",
      value: stuckValue(replies.n, replies.capped),
      meta: replies.n === 0 ? REPLIES_NONE : REPLIES_WAITING,
      door: "inbox",
      ...stuckTone(replies.n, "warn")
    },
    {
      ...figure,
      id: "templates-paused",
      metric: "templates_paused",
      label: "Messages Meta stopped",
      value: String(templates.n),
      meta: templatesMeta(templates),
      door: MESSAGES_ROUTE,
      ...stuckTone(templates.n, "fail")
    },
    {
      ...figure,
      id: "number-health",
      metric: "number_health",
      label: "Your WhatsApp number",
      // What Meta holds against the number is said in the WhatsApp row's own word and sentence, as Connections says it; the
      // rating's word only where nothing is held (the live walk's REP-1: "Flagged" over a payment method).
      value: standing ? standing.word : health === null ? NO_FIGURE : NUMBER_HEALTH_WORDS[health],
      meta: standing ? standing.sentence : number.state === "read" ? numberMeta(number, tz, nowMs) : number.state === "none" ? NUMBER_NONE : NUMBER_UNREAD,
      door: "admin/integrations",
      ...health === null ? {} : NUMBER_HEALTH_TONES[health]
    }
  ];
}
function toCampaignLensVM(input, nowMs) {
  const reads = readsOf(input);
  const report = input.campaigns === null ? null : toCampaignReportVM(input.campaigns);
  const series = input.ledger?.series ?? null;
  const stuck = reads.stuck === "ok" ? input.ledger?.stuck ?? null : null;
  const reachOuts = input.reachOuts ? toReachOutLensVM(input.reachOuts, nowMs) : null;
  return {
    head: report === null ? null : campaignHead(report, series, reachOuts),
    reads,
    failed: failedReads(reads),
    quiet: isQuiet(report, series),
    report,
    strip: campaignStrip(report, series),
    funnel: funnelPart(report),
    held: heldPart(report, series),
    stopped: stoppedPart(series),
    failedWhy: failedWhyPart(series),
    byMessage: byMessagePart(series),
    runsLine: runsLineOf(series),
    firstReply: waitPart(series?.first_reply ?? null, FIRST_REPLY_WORDS),
    approval: waitPart(series?.approval ?? null, APPROVAL_WORDS),
    stuck: stuck === null || input.ledger === null ? [] : stuckFiguresOf(stuck, input.ledger.timezone, nowMs),
    reachOuts
  };
}
export {
  FIRST_CAME_NOBODY,
  PEOPLE_RHYTHM_EMPTY,
  PEOPLE_RHYTHM_UNIT,
  metricWordsOf,
  toCampaignLensVM,
  toPeopleReportVM,
  toReachOutLensVM,
  toReceptionistReportVM
};
