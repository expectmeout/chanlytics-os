/**
 * A time zone is read in one place: contracts' calendar/zone-math.ts (zoneParts, dayInZone, clockInZone,
 * dayPlusInZone, usableZone). Until 29 October 2026 it was read in three engines and a dozen modules of their own,
 * each with its own answer to a zone Intl cannot use and three of them counting a day as 24 hours. Here the engine is
 * run, every reader is held to say the same day at the edges of a day and of a clock change, each keeps its own answer
 * to a zone that is none, and the three days that were 24 hours are the calendar's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayFromQuestion,
  dayInZone,
  leadTodayLine,
  localDate,
  localHour,
  tzClock,
  usableZone,
  zoneDayKey,
  zoneParts,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { stamp } = await importSrc("apps/dashboard/src/server/export/export.ts");

test("an instant's parts in a zone, remembered and shared, so no caller can change another's", () => {
  // 14:57 UTC on 13 October 2026 is 10:57 in New York, and 3:57 the next morning, a Wednesday, in Auckland.
  const at = Date.parse("2026-10-13T14:57:09.000Z");
  const ny = zoneParts("America/New_York", at);
  assert.deepEqual({ ...ny }, { y: 2026, m: 10, d: 13, hh: 10, mm: 57, ss: 9, weekday: "tue", key: "2026-10-13" });
  assert.deepEqual(
    { ...zoneParts("Pacific/Auckland", new Date(at)) },
    { y: 2026, m: 10, d: 14, hh: 3, mm: 57, ss: 9, weekday: "wed", key: "2026-10-14" },
    "a Date and its milliseconds are one instant",
  );
  assert.equal(zoneParts("America/New_York", at), ny, "asked again, the same parts");
  assert.ok(Object.isFrozen(ny), "and frozen");
  assert.equal(zoneParts("UTC", Date.parse("2026-10-13T00:00:00.000Z")).hh, 0, "midnight is 0, never 24");
});

test("a zone Intl cannot use throws in the engine, and reads as UTC where a page must say something", () => {
  assert.throws(() => zoneParts("Mars/Olympus", 0), RangeError);
  assert.throws(() => dayInZone("Mars/Olympus", 0), RangeError);
  for (const z of ["Mars/Olympus", "", null, undefined]) assert.equal(usableZone(z), "UTC", String(z));
  assert.equal(usableZone("America/Chicago"), "America/Chicago");
  const late = Date.parse("2026-10-13T23:30:00.000Z");
  assert.equal(zoneDayKey(late, "Mars/Olympus"), "2026-10-13", "the clock's words: UTC's day");
  assert.equal(localDate("Mars/Olympus", new Date(late)), "2026-10-13", "a playbook's day: UTC's");
  assert.equal(localHour("Mars/Olympus", new Date(late)), 23);
  assert.equal(dayFromQuestion("what's open today?", late, "Mars/Olympus"), "2026-10-13", "Ask's fast path: UTC's");
  assert.equal(stamp("2026-10-13T23:30:00.000Z", "Mars/Olympus"), "2026-10-13 23:30", "an export: UTC's, never a 500");
  assert.equal(tzClock("2026-10-13T23:30:00.000Z", "Mars/Olympus", new Date(late)), null, "Today's words: none");
});

test("every reader says the same day at the edges of a day and of a clock change", () => {
  const edges = [
    // New York: midnight, the hour the clocks go forward (8 March 2026) and the hour they go back (1 November).
    ["America/New_York", "2026-10-14T03:59:00.000Z"],
    ["America/New_York", "2026-10-14T04:00:00.000Z"],
    ["America/New_York", "2026-03-08T06:59:00.000Z"],
    ["America/New_York", "2026-03-08T07:00:00.000Z"],
    ["America/New_York", "2026-11-01T05:30:00.000Z"],
    ["America/New_York", "2026-11-01T06:30:00.000Z"],
    // Auckland: its clocks go back on 5 April 2026 and forward on 27 September.
    ["Pacific/Auckland", "2026-04-04T13:30:00.000Z"],
    ["Pacific/Auckland", "2026-04-04T14:30:00.000Z"],
    ["Pacific/Auckland", "2026-09-26T13:59:00.000Z"],
    ["Pacific/Auckland", "2026-09-26T14:00:00.000Z"],
  ];
  for (const [tz, iso] of edges) {
    const ms = Date.parse(iso);
    const day = dayInZone(tz, ms).key;
    const said = {
      clock: zoneDayKey(ms, tz),
      playbook: localDate(tz, new Date(ms)),
      ask: dayFromQuestion("what's open today?", ms, tz),
      export: stamp(iso, tz).slice(0, 10),
    };
    assert.deepEqual(said, { clock: day, playbook: day, ask: day, export: day }, `${tz} ${iso}`);
    assert.equal(localHour(tz, new Date(ms)), zoneParts(tz, ms).hh, `${tz} ${iso}: the hour`);
  }
});

test("tomorrow and yesterday are the calendar's, never now and 24 hours, the night before a 23-hour day too", () => {
  // 23:30 on Saturday 7 March 2026 in New York, the eve of a 23-hour day: now plus 24 hours was Monday 00:30, so
  // Sunday morning's moment read as "Sun 11:00 AM" beside today's.
  const eve = new Date("2026-03-08T04:30:00.000Z");
  assert.equal(tzClock("2026-03-08T15:00:00.000Z", "America/New_York", eve), "tomorrow 11:00 AM");
  assert.equal(dayFromQuestion("what's open tomorrow?", eve.getTime(), "America/New_York"), "2026-03-08");
  // 00:30 on Monday 9 March: now less 24 hours was Saturday night, so a bar open Sunday "5 PM to 2 AM" read as by
  // Saturday's hours, closed, though it is open until two.
  const monday = new Date("2026-03-09T04:30:00.000Z");
  const hours = [
    { day: "Saturday", hours: "Closed" },
    { day: "Sunday", hours: "5 PM to 2 AM" },
    { day: "Monday", hours: "9 AM to 5 PM" },
  ];
  assert.equal(leadTodayLine(hours, "America/New_York", monday), "Open until 2 AM");
});
