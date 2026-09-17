/**
 * A day is a calendar day, on the two days a year that it is not 24 hours.
 *
 * Every one of these used to be `dayInZone(tz, now + n * 86_400_000)`: add a
 * fixed span of time, then ask what local day it landed on. New York loses an
 * hour on 8 March 2026 and gains one on 1 November, so twice a year that
 * answer is the wrong date — and nothing errors. The receptionist simply says
 * the wrong days out loud, the Calendar draws the wrong horizon, and "what is
 * open tomorrow?" is answered about the day after.
 *
 * The dates here are real: 2026's US transitions, in the zone every workspace
 * on the database is still defaulted to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayInZone, dayPlusInZone, freeWindows, dayFromQuestion, visitDay, toCalendarVM } from "@chanlytics/contracts";

const TZ = "America/New_York";

/**
 * The instants below are written as UTC, with the local wall time they mean in
 * the name, because that is the whole point: on these two days the offset is
 * not what it was an hour earlier.
 */
// 7 March 2026, 23:30 EST (UTC-5) — the evening before the clocks go forward.
const EVE_OF_SPRING = Date.parse("2026-03-08T04:30:00Z");
// 1 November 2026, 00:30 EDT (UTC-4) — ninety minutes before the clocks go back.
const DAWN_OF_AUTUMN = Date.parse("2026-11-01T04:30:00Z");

const OPEN = { open: "09:00", close: "17:00" };
const EVERY_DAY = { mon: OPEN, tue: OPEN, wed: OPEN, thu: OPEN, fri: OPEN, sat: OPEN, sun: OPEN };
const offered = (now, days) =>
  freeWindows({ hours: EVERY_DAY, tz: TZ, busy: [], rules: { lead_hours: 2, max_days_ahead: days }, now: new Date(now) })
    .map((o) => o.key);

/* ------------------------------------------------------------ the stepper */

test("the day after is the next date, whether the clock moved forward, back, or not at all", () => {
  assert.equal(dayInZone(TZ, EVE_OF_SPRING).key, "2026-03-07", "the fixture is the evening it says it is");
  assert.equal(dayPlusInZone(TZ, EVE_OF_SPRING, 1).key, "2026-03-08", "the 23-hour day is still one day away");
  assert.equal(dayPlusInZone(TZ, EVE_OF_SPRING, 2).key, "2026-03-09");

  assert.equal(dayInZone(TZ, DAWN_OF_AUTUMN).key, "2026-11-01");
  assert.equal(dayPlusInZone(TZ, DAWN_OF_AUTUMN, 1).key, "2026-11-02", "the 25-hour day does not repeat itself");

  // A zone that never changes, and one whose offset is not a whole hour.
  assert.equal(dayPlusInZone("UTC", Date.parse("2026-03-07T23:30:00Z"), 1).key, "2026-03-08");
  assert.equal(dayPlusInZone("Asia/Kolkata", Date.parse("2026-03-07T20:00:00Z"), 1).key, "2026-03-09",
    "20:00 UTC is already the 8th in Kolkata, so tomorrow there is the 9th");
});

test("the weekday comes with the date, and month, year and backwards all hold", () => {
  assert.deepEqual(
    [dayPlusInZone(TZ, EVE_OF_SPRING, 1).weekday, dayPlusInZone(TZ, EVE_OF_SPRING, 2).weekday],
    ["sun", "mon"],
    "7 March 2026 is a Saturday",
  );
  const newYearsEve = Date.parse("2026-12-31T17:00:00Z"); // 12:00 EST
  assert.equal(dayPlusInZone(TZ, newYearsEve, 1).key, "2027-01-01");
  assert.equal(dayPlusInZone(TZ, Date.parse("2028-02-28T17:00:00Z"), 1).key, "2028-02-29", "a leap day is a day");
  assert.equal(dayPlusInZone(TZ, DAWN_OF_AUTUMN, -1).key, "2026-10-31", "backwards is the same arithmetic");
  assert.deepEqual(dayPlusInZone(TZ, DAWN_OF_AUTUMN, 0), dayInZone(TZ, DAWN_OF_AUTUMN), "nought days later is today");
});

/* -------------------------------------------- what a customer is offered */

test("REGRESSION: the day the clocks go forward was never offered at all", () => {
  // Asked at 23:30 the night before. Today has nothing left on it — the shop
  // shut at five — so the horizon begins tomorrow, and tomorrow is the 8th.
  assert.deepEqual(offered(EVE_OF_SPRING, 5), ["2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11"],
    "adding 24h used to land on the 9th and the 8th was skipped, with the 12th offered in its place");
});

test("REGRESSION: the day the clocks go back was offered twice, and a day fell off the far end", () => {
  assert.deepEqual(offered(DAWN_OF_AUTUMN, 6),
    ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"],
    "adding 24h to 00:30 on a 25-hour day lands back on the same date");
});

test("an ordinary week is unchanged, which is what makes the two above worth having", () => {
  // 9 September 2026, 09:00 EDT. No transition within reach.
  const ordinary = Date.parse("2026-09-09T13:00:00Z");
  assert.deepEqual(offered(ordinary, 4), ["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"]);
});

test("the day's label is read from an hour the day owns however the clock moved", () => {
  const spring = freeWindows({ hours: EVERY_DAY, tz: TZ, busy: [], rules: { lead_hours: 2, max_days_ahead: 2 }, now: new Date(EVE_OF_SPRING) });
  assert.equal(spring[0].key, "2026-03-08");
  assert.equal(spring[0].label, "Sunday, March 8", "midnight on a spring-forward day is a time that may not exist");
  assert.equal(spring[0].weekday, "sun");
});

/* ------------------------------------------- what the rest of it is told */

test('"what is open tomorrow?" names the next day, not the one after it', () => {
  assert.equal(dayFromQuestion("what's open tomorrow?", EVE_OF_SPRING, TZ), "2026-03-08");
  assert.equal(dayFromQuestion("¿qué hay mañana?", EVE_OF_SPRING, TZ), "2026-03-08");
  assert.equal(dayFromQuestion("what's open tomorrow?", DAWN_OF_AUTUMN, TZ), "2026-11-02");
  // A workspace with no usable zone still gets an answer rather than a throw.
  assert.equal(dayFromQuestion("tomorrow?", Date.parse("2026-03-07T12:00:00Z"), null), "2026-03-08");
  assert.equal(dayFromQuestion("tomorrow?", Date.parse("2026-03-07T12:00:00Z"), "Mars/Olympus"), "2026-03-08");
  assert.equal(dayFromQuestion("what's open today?", EVE_OF_SPRING, TZ), "2026-03-07", "today never moved");
});

test('a visit on the 8th is labelled "Tomorrow" on the evening of the 7th', () => {
  const noonOnTheEighth = Date.parse("2026-03-08T16:00:00Z"); // 12:00 EDT, the day after the change
  assert.equal(visitDay(noonOnTheEighth, TZ, EVE_OF_SPRING), "Tomorrow");
  assert.equal(visitDay(Date.parse("2026-03-09T16:00:00Z"), TZ, EVE_OF_SPRING), "Mon, Mar 9", "and the day after that is a date");
});

test("the Calendar's horizon is the one the receptionist actually walks", () => {
  // The two are computed in different files and must agree, or a day shows as
  // "not offered yet" while the receptionist is busy offering it.
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: dayPlusInZone(TZ, EVE_OF_SPRING, i).key, items: [], windows: [] });
  const vm = toCalendarVM({
    timezone: TZ, from: days[0].key, to: days[6].key,
    feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
    hours: EVERY_DAY, closures: [], rules: { lead_hours: 2, max_days_ahead: 5 },
    booking_link: null, next_opening: null, days,
  }, new Date(EVE_OF_SPRING));
  assert.equal(vm.offer.until, "2026-03-11", "five days from the 7th, counted as days");
  assert.deepEqual(offered(EVE_OF_SPRING, 5).filter((k) => k > vm.offer.until), [],
    "nothing the engine offers may fall outside the horizon the page draws");
});
