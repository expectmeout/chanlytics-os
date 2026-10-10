/**
 * The one sentence under each Reports chart, EXECUTED: each comes from the view model (the page composes none), adds
 * the next thing rather than a number a tile, the hero or a legend already gives, and is said only when it is true:
 * the busiest date, how slow the slowest replies were (a "nine in ten" only with ten to say it of), the length of a
 * call, where people reach the business against the period before, and the quiet side of the week.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lensAnswerOf, toReportVM } from "@chanlytics/contracts";

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
const ZEROS = { whatsapp: 0, voice: 0, email: 0, sms: 0, instagram: 0 };

/** `n` days ending `today`, oldest first; `per(weekday)` gives each day's counts (Monday 0). */
const span = (n, today, per) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return day(d.toISOString().slice(0, 10), per((d.getUTCDay() + 6) % 7));
  });
/** A week (Sat Aug 29 to Fri Sep 4, 2026) after a quiet one, whose weekdays Monday first bring `week`. */
const weekDto = (week, over = {}) => ({
  timezone: "UTC",
  days: 7,
  span_days: 14,
  today: "2026-09-04",
  series: span(14, "2026-09-04", () => ({})).map((d, i) =>
    i < 7 ? day(d.day, { messages_in: 1 }) : day(d.day, { messages_in: week[(i - 7 + 5) % 7] }),
  ),
  reasons: {},
  reply_seconds: [],
  sentiments: {},
  voicemail: 0,
  ...over,
});
const lines = (over) => toReportVM(weekDto([0, 7, 1, 3, 2, 5, 2], over)).lines;
const thirty = (per, over = {}) =>
  toReportVM({
    timezone: "UTC",
    days: 30,
    span_days: 60,
    today: "2026-09-18",
    series: span(60, "2026-09-18", per),
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
    ...over,
  }).lines;

/** Seven answered by the receptionist the week before; this week 13 of 17 (3 by you, 1 with no reply yet). */
function busyWeek() {
  const busy = { ...weekDto([0, 7, 1, 3, 2, 5, 2]), reply_seconds: [4, 8, 12, 15, 40, 70, 400, 2000] };
  busy.series = busy.series.map((d, i) => (i < 7 ? { ...d, answered_ai: 1 } : d));
  const answers = [
    [3, 1, 0],
    [2, 0, 0],
    [0, 0, 0],
    [3, 1, 1],
    [0, 1, 0],
    [3, 0, 0],
    [2, 0, 0],
  ];
  busy.series = busy.series.map((d, i) =>
    i < 7
      ? d
      : {
          ...d,
          messages_in: answers[i - 7].reduce((a, b) => a + b, 0),
          answered_ai: answers[i - 7][0],
          answered_you: answers[i - 7][1],
          unanswered: answers[i - 7][2],
        },
  );
  return busy;
}

test("the headline: how many of how many without you, how fast half the replies went, and the share the period before", () => {
  const busy = busyWeek();
  const vm = toReportVM(busy);
  // The median of the eight replies sits between 15 and 40: 27.5, said as 28s.
  assert.equal(vm.lines.hero, "13 of 17 customer messages, without you. Half of its replies went out within 28s.");
  assert.equal(vm.lines.heroBefore, "100% the 7 days before");
  assert.equal(
    toReportVM({ ...busy, reply_seconds: [] }).lines.hero,
    "13 of 17 customer messages, without you.",
    "no reply to time, no second sentence",
  );
  const quiet = toReportVM(weekDto([0, 0, 0, 0, 0, 0, 0]));
  assert.equal(quiet.lines.hero, "No customer wrote in this period.");
  assert.equal(quiet.lines.heroBefore, null, "the week before had messages but nothing answered in this fixture");
});

test("the head: how many of how many without you, and how many went out as the hold ended", () => {
  const busy = busyWeek();
  const held = (n, s, hold = 60) => Array.from({ length: n }, () => ({ day: "2026-09-04", s, hold }));
  const head = (replies) => toReportVM({ ...busy, replies }).lines.receptionist;
  assert.equal(head(undefined), "13 of 17 messages answered without you.");
  assert.equal(head(held(8, 61)), "13 of 17 messages answered without you, 8 as your 1-minute hold ended.");
  assert.equal(
    head([...held(6, 61), ...held(2, 200)]),
    "13 of 17 messages answered without you, 6 as your 1-minute hold ended.",
  );
  assert.equal(
    head([...held(2, 61), ...held(6, 200)]),
    "13 of 17 messages answered without you, 6 later than your 1-minute hold.",
  );
  assert.equal(
    head(held(8, 30, 0)),
    "13 of 17 messages answered without you.",
    "most had no hold: it says nothing of one",
  );
  assert.equal(toReportVM(weekDto([0, 0, 0, 0, 0, 0, 0])).lines.receptionist, null, "nobody wrote");
  assert.equal(
    lensAnswerOf("receptionist", { vm: toReportVM({ ...busy }), campaigns: null, deals: null, reviews: null }),
    "13 of 17 messages answered without you.",
  );
  assert.equal(
    toReportVM(busy).lines.answered,
    "Most messages on Sep 1: 5.",
    "the busiest day stays the answered card's own line, no longer the head",
  );
});

test("the reply dots: each reply's seconds past its own hold, in the order given, the last five hundred at most", () => {
  const busy = busyWeek();
  const dots = (replies) => toReportVM({ ...busy, replies }).replyTime.dots;
  assert.deepEqual(
    dots([
      { day: "d1", s: 61, hold: 60 },
      { day: "d1", s: 30, hold: 60 },
      { day: "d2", s: 200 },
      { day: "d2", s: Number.NaN, hold: 0 },
    ]),
    [
      { day: "d1", past: 1, held: true },
      { day: "d1", past: 0, held: true },
      { day: "d2", past: 200, held: false },
    ],
    "a reply before its hold ended is on the line (0), a reply with no hold counts from the question, a NaN is no dot",
  );
  assert.deepEqual(
    dots([
      { day: "d1", s: 40, hold: 0 },
      { day: "d1", s: 41, hold: -5 },
      { day: "d1", s: 42, hold: Number.NaN },
      { day: "d1", s: 43, hold: 60 },
    ]).map((d) => [d.past, d.held]),
    [
      [40, false],
      [41, false],
      [42, false],
      [0, true],
    ],
    "held is the hold's one reading: a hold above nothing; a zero, a negative or a hold that is no number is none, and its dot is the whole time",
  );
  assert.deepEqual(dots([{ day: "d1", s: 90.6, hold: 60 }]), [{ day: "d1", past: 31, held: true }], "whole seconds");
  const many = dots(Array.from({ length: 600 }, (_, i) => ({ day: "d1", s: i + 1 })));
  assert.equal(many.length, 500);
  assert.equal(many[0].past, 101, "the last 500: the first dot is the 101st reply");
  assert.equal(many.at(-1)?.past, 600);
  assert.deepEqual(dots(undefined), []);
});

test("who answered: the date with the most customer messages, the first of a tie; none in a quiet period", () => {
  // Sat Aug 29 is the week's first day (index 5 of the Monday-first week), Tue Sep 1 its fourth.
  assert.equal(lines().answered, "Most messages on Sep 1: 7.");
  assert.equal(
    toReportVM(weekDto([0, 5, 1, 3, 2, 5, 2])).lines.answered,
    "Most messages on Aug 29: 5.",
    "Saturday and Tuesday tie: the earlier day",
  );
  assert.equal(toReportVM(weekDto([0, 0, 0, 0, 0, 0, 0])).lines.answered, null);
});

test("how fast: nine in ten only with ten replies to say it of, else the slowest one, and nothing with no reply", () => {
  // [10 .. 100]: the ninetieth percentile sits at 8.1, 90 + 10 x 0.1 = 91 seconds.
  assert.equal(lines({ reply_seconds: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] }).reply, "Nine in ten within 1m 31s.");
  assert.equal(
    lines({ reply_seconds: [4, 8, 12, 15, 40, 70, 400, 2000] }).reply,
    "The slowest took 33m.",
    "eight replies: no tenth to speak of",
  );
  assert.equal(lines({ reply_seconds: [45] }).reply, "The slowest took 45s.");
  assert.equal(lines().reply, null);
});

test("calls: about how long a call lasts, said by fmtSeconds; nothing with no call", () => {
  const withCalls = weekDto([0, 7, 1, 3, 2, 5, 2]);
  withCalls.series[7] = { ...withCalls.series[7], calls: 1, call_seconds: 90 };
  withCalls.series[10] = { ...withCalls.series[10], calls: 2, call_seconds: 300 };
  // 390 seconds over 3 calls is 130: 2m 10s.
  assert.equal(toReportVM(withCalls).lines.calls, "About 2m 10s a call.");
  assert.equal(lines().calls, null);
});

test("where: mostly one channel or one leading, as before or taking over, with calls and email said as nouns", () => {
  const where = (current, previous = ZEROS) =>
    lines({ channels: { current: { ...ZEROS, ...current }, previous: { ...ZEROS, ...previous } } }).channels;
  assert.equal(
    where({ whatsapp: 12, voice: 3, email: 4, sms: 1 }, { whatsapp: 7 }),
    "Mostly WhatsApp, as the 7 days before.",
  );
  assert.equal(
    where({ whatsapp: 4, voice: 3, email: 3 }),
    "WhatsApp leads.",
    "four of ten is no majority; nothing before",
  );
  assert.equal(where({ voice: 4, whatsapp: 3, email: 3 }), "Calls lead.");
  assert.equal(where({ email: 6, whatsapp: 2 }), "Mostly email.");
  assert.equal(where({ sms: 4, whatsapp: 3, email: 3 }), "Texts lead.", "a text is a common noun, and plural");
  assert.equal(where({ email: 6, whatsapp: 2 }, { whatsapp: 8, email: 1 }), "Email took over from WhatsApp.");
  assert.equal(where({ whatsapp: 6, voice: 2 }, { voice: 5, whatsapp: 1 }), "WhatsApp took over from calls.");
  assert.equal(where({ sms: 6, voice: 1 }, { voice: 5, sms: 1 }), "Texts took over from calls.");
  assert.equal(where({}, { whatsapp: 3 }), null, "nobody reached it this period");
  assert.equal(lines().channels, null, "a v2 payload counted no channel");
});

test("when, over a week: the days nothing came in, or the one quietest day, as days", () => {
  assert.equal(lines().rhythm, "Nothing on Monday.");
  assert.equal(toReportVM(weekDto([0, 7, 1, 3, 2, 5, 0])).lines.rhythm, "Nothing on Monday or Sunday.");
  assert.equal(
    toReportVM(weekDto([0, 7, 0, 3, 0, 5, 0])).lines.rhythm,
    "Only on Tuesday, Thursday and Saturday.",
    "four days of nothing: the days something came in are fewer to say",
  );
  assert.equal(toReportVM(weekDto([2, 5, 3, 4, 6, 7, 1])).lines.rhythm, "Sunday was the quietest day.");
  assert.equal(toReportVM(weekDto([2, 5, 3, 4, 6, 7, 2])).lines.rhythm, null, "Monday and Sunday tie for the least");
  assert.equal(toReportVM(weekDto([0, 0, 0, 0, 0, 0, 0])).lines.rhythm, null);
});

test("when, over 30 days: weekdays, from each weekday's own average", () => {
  assert.equal(thirty((w) => ({ messages_in: w === 6 ? 1 : 3 })).rhythm, "Quietest on Sundays.");
  assert.equal(thirty((w) => ({ messages_in: w === 0 || w === 6 ? 0 : 2 })).rhythm, "Nothing on Mondays or Sundays.");
  assert.equal(thirty((w) => ({ messages_in: w === 1 || w === 5 ? 3 : 0 })).rhythm, "Only on Tuesdays and Saturdays.");
});
