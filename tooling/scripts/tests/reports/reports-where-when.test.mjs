/**
 * Reports v3, the view model EXECUTED: counts compared in counts (and only against a period someone reached the
 * business in), the answered share and the one before, the week (Monday first, a weekday's average over a longer
 * period), the hours and their busiest window, the channels in their fixed order, a caller's mood in its own order,
 * reply speed a day or a week at a time from the replies themselves, and new people adding up. A v2 payload still maps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toReportVM,
  compareWords,
  weekOf,
  speedOf,
  hoursOf,
  channelsOf,
  runningTotal,
  reportHourWords,
  callMoodTone,
  REPORT_CHANNELS,
} from "@chanlytics/contracts";

const day = (d, over = {}) => ({
  day: d,
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
  ...over,
});

/** Seven quiet days (Aug 22-28), then seven busy ones (Sat Aug 29 to Fri Sep 4, 2026). */
const dto = (over = {}) => ({
  timezone: "America/New_York",
  days: 7,
  span_days: 14,
  today: "2026-09-04",
  series: [
    ...["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"].map((d) =>
      day(d, { messages_in: 1, answered_ai: 1, conversations: 1 }),
    ),
    day("2026-08-29", {
      messages_in: 4,
      conversations: 2,
      answered_ai: 3,
      answered_you: 1,
      calls: 1,
      call_seconds: 90,
      new_contacts: 1,
    }),
    day("2026-08-30", { messages_in: 2, conversations: 1, answered_ai: 2 }),
    day("2026-08-31"),
    day("2026-09-01", {
      messages_in: 5,
      conversations: 3,
      answered_ai: 3,
      answered_you: 1,
      unanswered: 1,
      escalations: 2,
      calls: 2,
      call_seconds: 300,
    }),
    day("2026-09-02", { messages_in: 1, conversations: 1, answered_you: 1, new_contacts: 1 }),
    day("2026-09-03", { messages_in: 3, conversations: 2, answered_ai: 3, escalations: 1 }),
    day("2026-09-04", { messages_in: 2, conversations: 1, answered_ai: 2 }),
  ],
  reasons: { human_token: 2, policy_block: 1 },
  reply_seconds: [4, 8, 12, 15, 40, 70, 400, 2000],
  sentiments: { Positive: 2, Neutral: 1 },
  voicemail: 1,
  ...over,
});

/** `n` days ending `today`, oldest first; `per(weekday)` gives each day's counts (Monday 0). */
const span = (n, today, per) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return day(d.toISOString().slice(0, 10), per((d.getUTCDay() + 6) % 7));
  });

test("a v2 payload maps as before, and the parts it cannot know are null rather than invented", () => {
  const vm = toReportVM(dto());
  assert.equal(vm.speed, null);
  assert.equal(vm.hours, null);
  assert.equal(vm.channels, null);
  assert.equal(vm.lines.channels, null, "no channels, no sentence about them");
  assert.equal(vm.tiles.length, 6, "the tiles Ask reads are all still there");
  assert.deepEqual(vm.answered.totals, { in: 17, ai: 13, you: 3, none: 1 });
});

test("a count is compared in counts, and only against a period someone reached the business in", () => {
  assert.equal(compareWords(17, 7, "7 days", true), "up from 7");
  assert.equal(compareWords(4, 9, "7 days", true), "down from 9");
  assert.equal(compareWords(5, 5, "7 days", true), "same as the 7 days before");
  assert.equal(
    compareWords(3, 0, "30 days", true),
    "none the 30 days before",
    "the period before was lived in and had none of this",
  );
  assert.equal(compareWords(0, 0, "7 days", true), null, "nothing against nothing says nothing");
  assert.equal(compareWords(3, 0, "7 days", false), null, "a workspace too young to have a period before");
  assert.equal(compareWords(3, 2, "7 days", false), null, "the gate is the period's traffic, not this count's");
  const by = Object.fromEntries(toReportVM(dto()).tiles.map((t) => [t.id, t.compare]));
  assert.equal(by.messages, "up from 7");
  // The week before had seven messages: its zero escalations, calls and new people are counts.
  assert.equal(by.needed, "none the 7 days before");
  assert.equal(by.calls, "none the 7 days before");
  assert.equal(by.people, "none the 7 days before");
  assert.equal(by.answered, null, "a share is the hero's, compared there");
  assert.equal(by.reply, null);
  const young = toReportVM(dto({ series: dto().series.map((d, i) => (i < 7 ? day(d.day) : d)) }));
  assert.deepEqual(
    young.tiles.map((t) => t.compare),
    [null, null, null, null, null, null],
    "nobody before: no comparison at all",
  );
});

test("each counted tile sets its own count beside the same count the period before", () => {
  // The week before: 7 messages, 1 escalation, 4 calls and 5 new people, four different counts.
  const before = [{ escalations: 1, calls: 2 }, { calls: 2, new_contacts: 3 }, { new_contacts: 2 }];
  const vm = toReportVM(dto({ series: dto().series.map((d, i) => ({ ...d, ...before[i] })) }));
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  const ids = ["messages", "needed", "calls", "people"];
  assert.deepEqual(
    ids.map((id) => by[id].compare),
    ["up from 7", "up from 1", "down from 4", "down from 5"],
  );
  assert.deepEqual(
    ids.map((id) => by[id].delta),
    [
      { text: "+143% vs prior 7 days", tone: "pos" },
      { text: "+200% vs prior 7 days", tone: "neg" },
      { text: "-25% vs prior 7 days", tone: "neg" },
      { text: "-60% vs prior 7 days", tone: "neg" },
    ],
    "more escalations is worse; fewer calls and new people are too",
  );
});

test("the answered share and the one before, as fractions of the answered", () => {
  const vm = toReportVM(dto());
  assert.equal(vm.answered.share, 13 / 17);
  assert.equal(vm.answered.priorShare, 1, "seven of seven the week before");
  const quiet = toReportVM(dto({ series: dto().series.map((d) => day(d.day)) }));
  assert.equal(quiet.answered.share, null);
  assert.equal(quiet.answered.priorShare, null);
});

test("the two periods are named once, the way every legend, tooltip and table says them", () => {
  assert.deepEqual(toReportVM(dto()).period, { now: "Last 7 days", before: "The 7 days before" });
  assert.deepEqual(toReportVM({ ...dto(), days: 30, series: span(60, "2026-09-18", () => ({})) }).period, {
    now: "Last 30 days",
    before: "The 30 days before",
  });
});

test("the week: messages and calls per weekday, Monday first; over a week the counts, the one busiest and quietest", () => {
  const vm = toReportVM(dto());
  assert.deepEqual(vm.week.axes, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  // Sat 29: 4+1, Sun 30: 2, Mon 31: 0, Tue 1: 5+2, Wed 2: 1, Thu 3: 3, Fri 4: 2
  assert.deepEqual(vm.week.current, [0, 7, 1, 3, 2, 5, 2]);
  assert.equal(vm.week.unit, "count");
  assert.deepEqual(vm.week.prior, [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(vm.week.busiest, 1, "Tuesday");
  assert.equal(vm.week.quietest, 0, "Monday");
  assert.deepEqual(weekOf([day("2026-08-31", { messages_in: 2, calls: 1 })]), [3, 0, 0, 0, 0, 0, 0]);
  const tied = toReportVM(
    dto({ series: dto().series.map((d) => (d.day === "2026-09-01" ? day(d.day, { messages_in: 5 }) : d)) }),
  );
  assert.deepEqual(tied.week.current, [0, 5, 1, 3, 2, 5, 2]);
  assert.equal(tied.week.busiest, null, "Tuesday and Saturday tie: neither is the busiest");
  const empty = toReportVM(dto({ series: dto().series.map((d) => day(d.day)) }));
  assert.equal(empty.week.busiest, null);
  assert.equal(empty.week.quietest, null);
  assert.equal(empty.week.prior, null, "a week before with nothing in it is not drawn");
});

test("over 30 days a weekday is its own average, so the weekdays the window holds five of are not counted as busier", () => {
  // Aug 20 (Thu) to Sep 18 (Fri): five Thursdays and Fridays, four of every other weekday. Mondays bring five a day
  // (twenty over four), Thursdays four a day (twenty over five), the rest one a day.
  const series = span(60, "2026-09-18", (w) => ({ messages_in: w === 0 ? 5 : w === 3 ? 4 : 1 }));
  const vm = toReportVM({ ...dto(), days: 30, span_days: 60, today: "2026-09-18", series });
  assert.equal(vm.week.unit, "average");
  assert.deepEqual(vm.week.current, [5, 1, 1, 4, 1, 1, 1]);
  assert.equal(vm.week.busiest, 0, "Monday; summed, Monday and Thursday would tie at twenty");
  assert.equal(vm.week.quietest, null, "five weekdays share the least");
  assert.deepEqual(vm.week.prior, [5, 1, 1, 4, 1, 1, 1], "the period before, averaged the same way");
  assert.deepEqual(weekOf(span(30, "2026-09-18", () => ({ messages_in: 1, calls: 2 }))), [3, 3, 3, 3, 3, 3, 3]);
  assert.deepEqual(weekOf(span(30, "2026-09-18", (w) => ({ messages_in: w === 0 ? 1 : 0 }))), [1, 0, 0, 0, 0, 0, 0]);
  // Two Mondays with 1 and 2, two with nothing: 3 over 4 is 0.75, said to one decimal.
  let monday = 0;
  assert.equal(weekOf(span(28, "2026-09-18", (w) => ({ messages_in: w === 0 ? [1, 2, 0, 0][monday++] : 0 })))[0], 0.8);
});

test("the hours: summed over the period, the busiest two-hour window, and what came in before 8am or from 8pm", () => {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  grid[0][10] = 3;
  grid[0][11] = 2;
  grid[1][18] = 4;
  grid[2][7] = 1;
  grid[4][21] = 2;
  const h = hoursOf(grid);
  assert.equal(h.values[10], 3);
  assert.equal(h.values[18], 4);
  assert.equal(h.peak, 10, "10 to 12 holds five, more than 18 to 20 with four");
  assert.equal(h.outside, 3, "one at 7am and two at 9pm");
  assert.deepEqual([h.labels[0], h.labels[13], h.labels.length], ["12am", "1pm", 24]);
  assert.equal(hoursOf(undefined), null);
  const none = hoursOf(Array.from({ length: 7 }, () => Array(24).fill(0)));
  assert.equal(none.peak, null);
  assert.equal(none.outside, 0);
  assert.equal(reportHourWords(0), "12am");
  assert.equal(reportHourWords(9), "9am");
  assert.equal(reportHourWords(12), "12pm");
  assert.equal(reportHourWords(17), "5pm");
  assert.equal(reportHourWords(24), "12am");
  assert.deepEqual(toReportVM(dto({ hours: grid })).hours, h);
});

test("the channels keep their order and their colour's place, and a channel that fell to nothing stays for the comparison", () => {
  assert.deepEqual(
    REPORT_CHANNELS.map((c) => c.key),
    ["whatsapp", "voice", "email", "sms", "instagram"],
  );
  const ch = channelsOf({
    current: { whatsapp: 5, voice: 2, email: 0, sms: 1, instagram: 0 },
    previous: { whatsapp: 3, voice: 0, email: 2, sms: 0, instagram: 0 },
  });
  assert.deepEqual(ch, [
    { key: "whatsapp", label: "WhatsApp", value: 5, prior: 3 },
    { key: "voice", label: "Calls", value: 2, prior: 0 },
    { key: "email", label: "Email", value: 0, prior: 2 },
    { key: "sms", label: "SMS", value: 1, prior: 0 },
  ]);
  assert.equal(channelsOf(undefined), null);
});

test("a caller's mood reads in its own order, good then neither then bad, each with its status", () => {
  assert.deepEqual(["Positive", "Neutral", "Negative", "Unknown"].map(callMoodTone), ["ok", "", "danger", ""]);
  const vm = toReportVM(dto({ sentiments: { Negative: 5, Unknown: 1, Positive: 1, Neutral: 2 } }));
  assert.deepEqual(
    vm.calls.sentiments.map((s) => [s.id, s.value, s.tone]),
    [
      ["Positive", 1, "ok"],
      ["Neutral", 2, ""],
      ["Unknown", 1, ""],
      ["Negative", 5, "danger"],
    ],
    "never by count: the largest is not the first",
  );
  assert.deepEqual(
    toReportVM(dto()).calls.sentiments.map((s) => s.tone),
    ["ok", ""],
  );
});

test("reply speed: a day at a time up to two weeks, the median and slowest tenth from the replies themselves", () => {
  const days = ["2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
  const s = speedOf(
    [
      { day: "2026-08-29", s: 10 },
      { day: "2026-08-29", s: 20 },
      { day: "2026-08-29", s: 90 },
    ],
    days,
  );
  assert.equal(s.unit, "day");
  assert.equal(s.points.length, 7);
  // [10, 20, 90]: the median is 20; the ninetieth percentile sits at 1.8 of the way, 20 + 70 x 0.8 = 76.
  assert.deepEqual([s.points[0].p50, s.points[0].p90, s.points[0].count], [20, 76, 3]);
  assert.deepEqual(
    [s.points[0].p50Label, s.points[0].p90Label, s.points[1].p50Label],
    ["20s", "1m 16s", "—"],
    "said by fmtSeconds, once",
  );
  assert.deepEqual([s.points[1].p50, s.points[1].count], [null, 0], "a day with no reply is a gap, not a zero");
  assert.equal(toReportVM(dto({ replies: [{ day: "2026-09-04", s: 12 }] })).speed.points.at(-1).p50, 12);
});

test("past two weeks, a week at a time ending on the last day, and a short first week joins the next", () => {
  const days = (n) => span(n, "2026-09-18", () => ({})).map((d) => d.day);
  const thirty = speedOf([], days(30));
  assert.equal(thirty.unit, "week");
  assert.equal(thirty.points.length, 4, "2 + 7 joined, then three whole weeks");
  assert.equal(thirty.points[0].day, days(30)[0]);
  const ninety = speedOf([], days(90));
  assert.equal(ninety.points.length, 13, "a first week of six days stands on its own");
});

test("new people add up over the period, beside the period before's own running total", () => {
  assert.deepEqual(runningTotal([1, 0, 2, 0]), [1, 1, 3, 3]);
  const vm = toReportVM(dto());
  assert.deepEqual(
    vm.people.cumulative.points.map((p) => p.total),
    [1, 1, 1, 1, 2, 2, 2],
  );
  assert.equal(vm.people.cumulative.prior, null, "nobody new before: nothing to set beside it");
  const before = toReportVM(dto({ series: dto().series.map((d, i) => (i < 7 ? { ...d, new_contacts: 1 } : d)) }));
  assert.deepEqual(before.people.cumulative.prior, [1, 2, 3, 4, 5, 6, 7]);
});
