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
var REPLY_WINDOW_WORDS = `within ${REPLY_WINDOW_HOURS / 24} days`;
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
  // The message's WhatsApp version is no longer one a send can use: it holds the people who go by WhatsApp, and only them.
  template_not_approved: "its WhatsApp version is no longer approved",
  // The number is on file but no thread answers to it on this line: a stored
  // number that does not normalise, or one no contact row matches.
  no_thread: "no thread for that number",
  human_has_it: "a person had the thread",
  paused: "the workspace was paused",
  superseded_by_human: "a person answered first",
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
  appointment_changed: "their appointment moved or was cancelled",
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
  outreach_needs_own_domain: "not from your own domain",
  sending_domain_not_ready: "the domain isn't sending",
  sending_domain_at_cap: "the domain's day is full"
};
var DELIVERY_RECEIPTS_WORDS = "each channel's own receipts";

// src/reports/receptionist/receptionist-record.ts
var MISSED_CALL_TOUCH_WORDS = "an hour";

// src/reports/report-metrics.ts
var METRIC_WORDS = {
  customer_messages: "Messages your customers sent you, on every channel. A call, a message sent to them, and history brought in from before Chanlytics are not counted.",
  answered_share: "Of the customer messages that came in, the share whose first reply was the receptionist's. A message you answered first, and one nobody answered, are not the receptionist's; a broadcast or a campaign message is nobody's answer.",
  reply_median: "The middle time from a customer's message to the receptionist's first reply, including the hold you set before replies go out. A message you answered first, or that nobody answered, is not counted.",
  handovers: "How many times the receptionist stopped and held a conversation for you, counted when it stopped, whatever the reason. A conversation held twice counts twice.",
  calls: "Calls to the receptionist that connected. A call that rang out or dropped before anyone spoke is not counted.",
  new_people: "People whose first message in their own words, or first connected call to you, fell in this period, counted once. A message you or the receptionist sent, an automatic reply or a list's mail, a call you placed, people brought in with their history, people who asked to be forgotten, and people who have not written or phoned yet are not counted.",
  booked: "Of the people who wrote or called in this period, how many have an appointment ahead on your calendar, or one that began no more than a day before they asked. It is a dash where no calendar is connected or it could not be read.",
  messages_sent: "Messages your broadcasts and campaign runs sent in this period, on every channel, one for each person reached. A reply you or the receptionist wrote is not counted.",
  delivered_share: `Of the messages sent, the share the channel reports as delivered or read (${DELIVERY_RECEIPTS_WORDS}). A message with no receipt yet is not counted as delivered.`,
  replied_share: `Of the messages sent, the share the person answered in their own words ${REPLY_WINDOW_WORDS}. A note the system wrote, and a program writing from their address, are not their words.`,
  said_yes: "People who said yes to being messaged in this period, in their own words or recorded at the desk, counted once a day each.",
  asked_to_stop: "People who asked to stop being messaged in this period, by STOP, an unsubscribe link or at the desk, counted once a day each.",
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
  call_backs: "Of the conversations waiting on you, the ones where the customer asked to be rung back, as of now, whatever period is picked. A call-back someone has taken over, or put aside until later, is not counted.",
  replies_held_back: "Replies the receptionist wrote in this period that the send door refused, such as a person having the thread or the customer having asked to stop. A reply you cancelled or a person answered first, which the hold counts, and a broadcast or campaign message the door held are not counted.",
  people_reached: "People who wrote in their own words, or phoned and were spoken to, in this period, counted once however often they did. An automatic reply, a message or call you placed, a call that rang out, people brought in with their history, and people who asked to be forgotten are not counted.",
  yeses_won: "The yeses people gave in this period, one for each person and each kind of message (their visit, offers, offers by email), in their own words or recorded at the desk. A merge restating a yes, a client list imported, which never records a yes, a person who asked to be forgotten, and a record merged into another are not counted.",
  stops_recorded: "The stops people gave in this period, one for each person and each kind of message they stopped, by their own STOP, an unsubscribe link, a complaint, the carrier or at the desk. A merge restating a stop, the end of a yes to offers that a STOP brings with it, a person who asked to be forgotten, and a record merged into another are not counted.",
  steps_overdue: "People whose earliest open step has a day before today, as of now, whatever period is picked. A step with no day, a step already done, and a later step of the same person are not counted.",
  steps_due_today: "People whose earliest open step has today for its day, as of now, whatever period is picked. A step with no day, a step already done, and a later step of the same person are not counted.",
  email_stopped_now: "People whose email address bounced for good, drew a complaint or was stopped by the email provider, as of now, whatever period is picked, so mail to it is no longer sent. A phone number that does not work, which Chanlytics does not record, is not counted.",
  said_yes_messages: "People on your Said yes to messages list, as of now, whatever period is picked: the answer People shows them, whenever it was given. A person who has asked to stop since, one on do-not-contact, and one who has not answered are not counted.",
  can_receive_offers: "People on your Can receive offers list, as of now, whatever period is picked: they said yes to offers and can be reached on a channel you send on now. A yes with no number or address to send to, a channel you have not connected, and a person who asked to stop are not counted.",
  opted_out_now: "People on your Opted out list, as of now, whatever period is picked: they asked to stop being messaged, or are on do-not-contact, whenever that was. A person who has said yes again since and is not on do-not-contact is not counted.",
  quiet_now: "People whose last message or call to you was more than 30 days ago, as of now, whatever period is picked. Your own messages are not theirs, and a person who has never written or phoned is not counted."
};
var metricWordsOf = (metric) => METRIC_WORDS[metric];

// src/calendar/zone-math.ts
var WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// src/calendar/day-keys.ts
function keyParts(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m ?? 1, d: d ?? 1 };
}

// src/shared/clock.ts
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

// src/shared/words.ts
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

// src/reports/report-tiles.ts
var REPORT_MIN_N = 5;
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

// src/reports/reports.ts
var REPORT_RANGES = [
  { days: 7, id: "7d", label: "7 days" },
  { days: 30, id: "30d", label: "30 days" },
  { days: 90, id: "90d", label: "90 days" },
  { days: null, id: "month", label: "Month" }
];
var rangeLabelOf = (days) => REPORT_RANGES.find((r) => r.days === days)?.label ?? plural(days, "day");

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

// src/shared/email-address.ts
var LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
var LOCAL = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
var SHAPE = new RegExp(`^(${LOCAL})@(${LABEL}(?:\\.${LABEL})+)$`);

// src/calendar/booking-notice.ts
var NOTICE_LENGTH_MAX_MS = 12 * HOUR_MS;
var NOTICE_TIME_REACH_MS = 400 * DAY_MS;
var SAME_VISIT_MS = 15 * MIN_MS;

// src/calendar/calendar-words.ts
var SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
var LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

// src/setup/calendar-source.ts
var FORWARD_CONFIRM_SHOWN_MS = 3 * DAY_MS;
var BOOKED_NEEDS_A_LINK = "Add a calendar link under Settings \u203A Business to see who booked.";

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
function holdLine2(now) {
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
var callbacksMeta = (callbacks) => callbacks === 0 ? "no call-back is waiting" : "people to ring, counted in waiting on you";
var refusalWords = (key) => ownWord(HELD_REASONS, key) ?? key.replace(/_/g, " ");
function heldBackMeta(byReason) {
  const top = rankedEntries(byReason, refusalWords).slice(0, 2);
  return top.length > 0 ? top.map(([, words, n]) => `${words} ${n}`).join(" \xB7 ") : "none were held at the door in this period";
}
var heldBackEntries = (byReason) => rankedEntries(byReason, (key) => capitalize(refusalWords(key)));

// src/reports/receptionist/receptionist-report.ts
function holdPart({ hold }) {
  return hold.now.total === 0 ? noMix(HOLD_EMPTY) : mixOf(holdEntries(hold.now), holdLine2(hold.now));
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
    return { ...tile, value: "\u2014", meta: CLOSED_UNSET, door: "admin/workspace", unset: true };
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
      label: "Waiting on you",
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
  email: "Email"
};
var PERSON_CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  sms: "Text",
  voice: "Phone",
  email: "Email"
};
var PERSON_CAME_FROM_WORDS = {
  whatsapp: REPLY_VIA.whatsapp,
  sms: REPLY_VIA.sms,
  email: REPLY_VIA.email,
  call: PERSON_CHANNEL_WORDS.voice,
  calendar: "Your calendar",
  manual: "Added by hand",
  import: "Imported",
  lead: "A lead you found"
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
  { id: "opted-out", metric: "opted_out_now", label: "Opted out", list: "opted_out" },
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
export {
  FIRST_CAME_NOBODY,
  PEOPLE_RHYTHM_EMPTY,
  PEOPLE_RHYTHM_UNIT,
  metricWordsOf,
  toPeopleReportVM,
  toReceptionistReportVM
};
