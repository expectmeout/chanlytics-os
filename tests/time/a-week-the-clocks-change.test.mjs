/**
 * Everything that happens at a time, in the weeks the clocks change (lane 15 of the whole-system plan, R1.17): a booking
 * asked for, its reminders, a post set for a time and the week that goes at 8:00 AM, the sending hours and a cold
 * email's window in the lead's own zone, the day a post is good until, a story's day, a sequence's history and the
 * month's allowance at the month's end. In New York (8 March and 1 November 2026), in London (29 March and 25 October),
 * which changes on other days, and in Santiago, where the clocks skip midnight itself (6 September) and repeat the hour
 * before it (5 April). The workspace keeps one zone and its customer or lead may be in another.
 *
 * Every expected instant is a literal, worked by hand from the zone's rule, so no runtime's zone data can agree with
 * itself and pass: the rules used are the same in Node 22's data and Node 24's. Red before 28 Nov 2026 where a case says
 * so: a skipped time was read an hour back in a zone west of UTC, and three clocks counted tomorrow as 24 hours on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_REQUEST_WORDS,
  DEFAULT_WEEK,
  fromZonedInput,
  goodUntilOf,
  historySince,
  lateReminderAt,
  monthSentAt,
  nextMonthStart,
  nextOpenMoment,
  requestedBookingOf,
  sendingEndsAt,
  slotShort,
  storyRanItsDay,
  timetable,
  visitMomentDay,
  weekGoesAtOf,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { nextSettleOf } = await importSrc("apps/edge/lib/ads/adopt.ts");

const NY = "America/New_York";
const LONDON = "Europe/London";
const SANTIAGO = "America/Santiago";
const ms = (iso) => Date.parse(iso);
const iso = (n) => new Date(n).toISOString();

/* ------------------------------------------------------------ a booking */

const termsOf = (tz, key, startIso, endIso) => ({
  openings: [{ key, weekday: "sun", label: key, windows: [{ start: ms(startIso), end: ms(endIso) }] }],
  tz,
  services: [{ name: "Cut", duration_min: 30 }],
  slotMin: 30,
});

test("a time asked for on a change day is the hour the business means, and one the clocks skip is no time", () => {
  const cases = [
    // 10:00 on the spring day is EDT (-4); on the autumn day, EST (-5).
    [NY, "2026-03-08", "2026-03-08T14:00:00.000Z", "2026-03-08T16:00:00.000Z", "2026-03-08 10:00"],
    [NY, "2026-11-01", "2026-11-01T15:00:00.000Z", "2026-11-01T17:00:00.000Z", "2026-11-01 10:00"],
    // London is BST (+1) from 29 March; Santiago -3 from 6 September.
    [LONDON, "2026-03-29", "2026-03-29T09:00:00.000Z", "2026-03-29T11:00:00.000Z", "2026-03-29 10:00"],
    [SANTIAGO, "2026-09-06", "2026-09-06T13:00:00.000Z", "2026-09-06T15:00:00.000Z", "2026-09-06 10:00"],
  ];
  for (const [tz, key, start, end, slot] of cases) {
    const asked = requestedBookingOf({ slot, service: "cut", ...termsOf(tz, key, start, end) });
    assert.deepEqual(asked, { ok: true, startMs: ms(start), endMs: ms(start) + 30 * 60_000, service: "Cut" }, slot);
  }
  const santiago = termsOf(SANTIAGO, "2026-09-06", "2026-09-06T03:00:00.000Z", "2026-09-06T15:00:00.000Z");
  assert.deepEqual(
    requestedBookingOf({ slot: "2026-09-06 00:30", service: "", ...santiago }),
    { ok: false, why: "unreadable" },
    "half past midnight on the day Santiago skips midnight was never on a clock",
  );
  const ny = termsOf(NY, "2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-08T16:00:00.000Z");
  assert.deepEqual(requestedBookingOf({ slot: "2026-03-08 02:30", service: "", ...ny }), {
    ok: false,
    why: "unreadable",
  });
});

test("the customer is told the time on the business's clock, wherever they write from", () => {
  // A customer in London asks a New York business for 10:00 on the spring day: they are told 10:00, the business's.
  const words = BOOKING_REQUEST_WORDS.hold(slotShort(ms("2026-03-08T14:00:00.000Z"), NY), "Cut");
  assert.match(words, /Mar 8/);
  assert.match(words, /10:00/);
  assert.doesNotMatch(words, /2:00|14:00/, "never London's 2 PM");
});

/* ------------------------------------------------------------ its reminders */

test("the day-before reminder names the next calendar day, never the day 24 hours on", () => {
  // 11:30 PM on 7 March (EST) is 23 hours from the end of the 8th: tomorrow is the 8th.
  assert.equal(visitMomentDay("visit_tomorrow", NY, ms("2026-03-08T04:30:00.000Z")), "2026-03-08");
  // 11:30 PM on 5 September in Santiago (-4): tomorrow is the 6th, the day with no midnight.
  assert.equal(visitMomentDay("visit_tomorrow", SANTIAGO, ms("2026-09-06T03:30:00.000Z")), "2026-09-06");
  // The first 1:30 AM of 1 November in New York (EDT): yesterday is 31 October.
  assert.equal(visitMomentDay("visited", NY, ms("2026-11-01T05:30:00.000Z")), "2026-10-31");
});

test("a late booking's reminder goes at 8 PM the evening before, or the morning of, by the business's clock", () => {
  const late = (tz, visit, now, lastRunFor) =>
    lateReminderAt({ startsAt: ms(visit), tz, nowMs: ms(now), runHour: 9, lastRunFor });
  // Booked at 7:30 PM EDT on the spring day for 10 AM the next morning, after the day's look ran: 8 PM EDT is 00:00 UTC.
  assert.deepEqual(late(NY, "2026-03-09T14:00:00.000Z", "2026-03-08T23:30:00.000Z", "2026-03-08"), {
    at: ms("2026-03-09T00:00:00.000Z"),
    day: "2026-03-09",
  });
  // Booked at 9 PM EST on the autumn day for noon the next day: the morning of, 9 AM EST.
  assert.deepEqual(late(NY, "2026-11-02T17:00:00.000Z", "2026-11-02T02:00:00.000Z", "2026-11-01"), {
    at: ms("2026-11-02T14:00:00.000Z"),
    day: "2026-11-02",
  });
  // Booked at 9:30 PM (-4) on the 5th in Santiago for noon on the 6th: 9 AM on the 6th is -3, 12:00 UTC.
  assert.deepEqual(late(SANTIAGO, "2026-09-06T15:00:00.000Z", "2026-09-06T01:30:00.000Z", "2026-09-05"), {
    at: ms("2026-09-06T12:00:00.000Z"),
    day: "2026-09-06",
  });
  // The same booking for 10 AM leaves an hour after 9 AM: less than two, so no reminder.
  assert.equal(late(SANTIAGO, "2026-09-06T13:00:00.000Z", "2026-09-06T01:30:00.000Z", "2026-09-05"), null);
});

/* ------------------------------------------------------------ a post set for a time, and the held week */

test("a post set for a time the clocks skip goes just after the gap, and one set in the doubled hour at its first", () => {
  // Red before 28 Nov 2026: New York's 2:30 AM on 8 March was 1:30 EST, an hour before the time picked.
  assert.equal(iso(fromZonedInput("2026-03-08T02:30", NY)), "2026-03-08T07:30:00.000Z");
  assert.equal(iso(fromZonedInput("2026-11-01T01:30", NY)), "2026-11-01T05:30:00.000Z");
  // Red before: London's doubled 1:30 was its second (GMT), New York's its first.
  assert.equal(iso(fromZonedInput("2026-10-25T01:30", LONDON)), "2026-10-25T00:30:00.000Z");
  assert.equal(iso(fromZonedInput("2026-03-29T09:00", LONDON)), "2026-03-29T08:00:00.000Z");
});

test("a held week goes at the next 8:00 AM, the calendar's tomorrow, on the night before a 23-hour day", () => {
  // Red before 28 Nov 2026: ready at 11:30 PM EST on 7 March, it went at 8:00 AM on the 9th, a day late.
  assert.equal(weekGoesAtOf("veto", NY, ms("2026-03-08T04:30:00.000Z")), "2026-03-08T12:00:00.000Z");
  // Ready at 11:30 PM (-4) on 5 September in Santiago: 8:00 AM on the 6th, which is -3.
  assert.equal(weekGoesAtOf("veto", SANTIAGO, ms("2026-09-06T03:30:00.000Z")), "2026-09-06T11:00:00.000Z");
  // Before 8 AM it is today's 8 AM, on the 25-hour day too.
  assert.equal(weekGoesAtOf("veto", NY, ms("2026-11-01T06:30:00.000Z")), "2026-11-01T13:00:00.000Z");
});

test("an ad account's daily look back falls due at the next 4:00 AM by the calendar", () => {
  // Red before 28 Nov 2026: read at 11:30 PM EST on 7 March, the next look was set for 4 AM on the 9th.
  assert.equal(nextSettleOf(NY, ms("2026-03-08T04:30:00.000Z")), "2026-03-08T08:00:00.000Z");
  assert.equal(nextSettleOf(LONDON, ms("2026-10-24T23:30:00.000Z")), "2026-10-25T04:00:00.000Z");
});

/* ------------------------------------------------------------ quiet hours and the email window */

test("a send asked for outside the sending hours waits for 9 AM, the business's, on a change day", () => {
  // 3:30 AM EDT on the spring day: 9 AM EDT.
  assert.deepEqual(nextOpenMoment(NY, new Date("2026-03-08T07:30:00.000Z")), {
    at: new Date("2026-03-08T13:00:00.000Z"),
    moved: true,
  });
  // The first 1:30 AM on the autumn day (EDT): 9 AM EST.
  assert.equal(nextOpenMoment(NY, new Date("2026-11-01T05:30:00.000Z")).at.toISOString(), "2026-11-01T14:00:00.000Z");
  // 1:30 AM on the day Santiago skipped midnight: 9 AM (-3).
  assert.equal(
    nextOpenMoment(SANTIAGO, new Date("2026-09-06T04:30:00.000Z")).at.toISOString(),
    "2026-09-06T12:00:00.000Z",
  );
  // 9:30 PM BST on 24 October, past the hours: 9 AM GMT on the 25th.
  assert.equal(
    nextOpenMoment(LONDON, new Date("2026-10-24T20:30:00.000Z")).at.toISOString(),
    "2026-10-25T09:00:00.000Z",
  );
  // And the day's hours end at 9 PM EST on the 25-hour day.
  assert.equal(sendingEndsAt(NY, new Date("2026-11-01T17:00:00.000Z"))?.toISOString(), "2026-11-02T02:00:00.000Z");
});

test("a cold email goes in the lead's own working day, in their zone, in the week only one side has changed", () => {
  // Monday 26 October 2026: London is on GMT since the 25th, New York still on EDT until 1 November.
  const first = (zone, nowIso) =>
    timetable({
      sends: [{ id: "lead", zone, week: DEFAULT_WEEK }],
      senders: [{ id: "box", cap: 20, recent: [] }],
      gapMinutes: 10,
      nowMs: ms(nowIso),
      jitter: () => 0,
    }).placed[0]?.sendAtMs;
  // The window is 9:30 to 4:30, half an hour in from the lead's nine to five.
  assert.equal(iso(first(LONDON, "2026-10-26T06:00:00.000Z")), "2026-10-26T09:30:00.000Z", "a lead in London");
  assert.equal(iso(first(NY, "2026-10-26T06:00:00.000Z")), "2026-10-26T13:30:00.000Z", "a lead in New York");
  assert.equal(iso(first("America/Los_Angeles", "2026-10-26T06:00:00.000Z")), "2026-10-26T16:30:00.000Z");
  // From Sunday 1 November, the day New York changes: Monday's 9:30 is EST.
  assert.equal(iso(first(NY, "2026-11-01T12:00:00.000Z")), "2026-11-02T14:30:00.000Z");
});

/* ------------------------------------------------------------ the day a post is good until, and a story's */

test("a post about a day is good until that day's last instant, the day the clocks skip midnight too", () => {
  const until = (day, zone) =>
    goodUntilOf({ goal: null, opportunity_id: null, call_to_action: null, day, offer: null, service: null }, zone);
  assert.equal(until("2026-03-08", NY), "2026-03-09T03:59:59.999Z", "the 23-hour day ends at midnight EDT");
  assert.equal(until("2026-11-01", NY), "2026-11-02T04:59:59.999Z", "the 25-hour day ends at midnight EST");
  assert.equal(until("2026-10-25", LONDON), "2026-10-25T23:59:59.999Z");
  // Red before 28 Nov 2026: the 5th ended at 11 PM, because the 6th had no midnight and was read as starting an hour early.
  assert.equal(until("2026-09-05", SANTIAGO), "2026-09-06T03:59:59.999Z");
});

test("a story is up for 24 hours across a change, never for a day of the clock", () => {
  // Up at 10 PM EST on 7 March: it ends at 10 PM UTC-4 + 1 h, 24 hours on, not at 10 PM on the 8th by the clock.
  const story = { kind: "story", published_at: "2026-03-08T03:00:00.000Z", scheduled_for: "2026-03-08T03:00:00.000Z" };
  assert.equal(storyRanItsDay(story, ms("2026-03-09T02:00:00.000Z")), false, "10 PM EDT on the 8th is 23 hours on");
  assert.equal(storyRanItsDay(story, ms("2026-03-09T03:00:00.000Z")), true);
});

/* ------------------------------------------------------------ a sequence's history, and the month's allowance */

test("a sequence's history period starts on its first calendar day, the morning after a 23-hour day too", () => {
  // Red before 28 Nov 2026: at 12:30 AM EDT on 9 March, thirty days back by 24 hours was 7 February, a day too many.
  assert.equal(historySince("30", NY, ms("2026-03-09T04:30:00.000Z")), "2026-02-08");
  assert.equal(historySince("30", NY, ms("2026-11-02T05:30:00.000Z")), "2026-10-04");
});

test("a month's allowance turns over at midnight on the 1st, in the workspace's own zone", () => {
  // 11:30 PM EDT on 31 October: the next month starts at midnight EDT, 04:00 UTC, not at UTC's midnight before it.
  assert.equal(iso(nextMonthStart(NY, ms("2026-11-01T03:30:00.000Z"))), "2026-11-01T04:00:00.000Z");
  // London is on GMT by 31 October: midnight is UTC's.
  assert.equal(iso(nextMonthStart(LONDON, ms("2026-10-31T23:30:00.000Z"))), "2026-11-01T00:00:00.000Z");
  assert.equal(iso(nextMonthStart(SANTIAGO, ms("2026-08-31T12:00:00.000Z"))), "2026-09-01T04:00:00.000Z");
  // A send set for 11:30 PM EDT on 31 October counts against October; one at 12:30 AM on 1 November, November.
  const read = {
    month_sent: { email: 1999, sms: 0 },
    month_sent_next: { from: nextMonthStart(NY, ms("2026-10-31T16:00:00.000Z")), sent: { email: 0, sms: 0 } },
  };
  assert.equal(monthSentAt(read, ms("2026-11-01T03:30:00.000Z"))?.email, 1999);
  assert.equal(monthSentAt(read, ms("2026-11-01T04:30:00.000Z"))?.email, 0);
});
