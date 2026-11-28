/**
 * A wall-clock time read as an instant on the days the clocks change (contracts localToUtcMs, the one reading of a
 * zone), the same on either side of UTC: a time the clocks skip falls just past the gap, as Postgres reads it, and an
 * hour that happens twice is its first. Every expected instant is a literal, worked by hand from the zone's rule, so a
 * runtime with other zone data cannot agree with itself and pass: the rules used here are the same in Node 22's and
 * Node 24's data (New York, London, Santiago, Havana and Cairo, 2026).
 *
 * Red before 28 Nov 2026: in Santiago and Havana a day's midnight on the day the clocks skip it came back as 11 PM on
 * the day before, and the doubled 1:30 was the first in New York and the second in London.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayInZone, localToUtcMs, wallClockAt, zoneMidnight } from "@chanlytics/contracts";

const at = (tz, key, hh, mm) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(localToUtcMs(tz, y, m, d, hh, mm)).toISOString();
};

test("an ordinary time is the one instant it names, the day before a change and the day after it", () => {
  assert.equal(at("America/New_York", "2026-03-07", 9, 0), "2026-03-07T14:00:00.000Z", "EST");
  assert.equal(at("America/New_York", "2026-03-09", 9, 0), "2026-03-09T13:00:00.000Z", "EDT");
  assert.equal(at("Europe/London", "2026-03-28", 9, 0), "2026-03-28T09:00:00.000Z", "GMT");
  assert.equal(at("Europe/London", "2026-03-30", 9, 0), "2026-03-30T08:00:00.000Z", "BST");
  // On the change day itself, an hour clear of the change.
  assert.equal(at("America/New_York", "2026-03-08", 10, 0), "2026-03-08T14:00:00.000Z");
  assert.equal(at("America/New_York", "2026-11-01", 10, 0), "2026-11-01T15:00:00.000Z");
  assert.equal(at("Europe/London", "2026-10-25", 10, 0), "2026-10-25T10:00:00.000Z");
  assert.equal(at("America/Santiago", "2026-09-06", 10, 0), "2026-09-06T13:00:00.000Z");
});

test("a time the clocks skip falls just past the gap, west of UTC and east of it", () => {
  // New York, 8 March 2026: 2:00 AM EST becomes 3:00 AM EDT. 2:30 is read with the offset before (-5): 3:30 EDT.
  assert.equal(at("America/New_York", "2026-03-08", 2, 30), "2026-03-08T07:30:00.000Z");
  // London, 29 March 2026: 1:00 AM GMT becomes 2:00 AM BST. 1:30 is read with GMT: 2:30 BST.
  assert.equal(at("Europe/London", "2026-03-29", 1, 30), "2026-03-29T01:30:00.000Z");
});

test("a day whose midnight the clocks skip starts at its first instant, never on the day before", () => {
  const days = [
    // Santiago, 6 September 2026: midnight (-4) becomes 1:00 AM (-3). The day starts at 04:00 UTC.
    ["America/Santiago", "2026-09-06", "2026-09-06T04:00:00.000Z"],
    // Havana, 8 March 2026: midnight (-5) becomes 1:00 AM (-4).
    ["America/Havana", "2026-03-08", "2026-03-08T05:00:00.000Z"],
    // Cairo, 24 April 2026: midnight (+2) becomes 1:00 AM (+3), east of UTC.
    ["Africa/Cairo", "2026-04-24", "2026-04-23T22:00:00.000Z"],
  ];
  for (const [tz, key, iso] of days) {
    assert.equal(new Date(zoneMidnight(tz, key)).toISOString(), iso, `${tz} ${key}`);
    assert.equal(dayInZone(tz, zoneMidnight(tz, key)).key, key, `${tz}: the day's start is on the day`);
    assert.equal(new Date(wallClockAt(tz, key, 0, 0)).toISOString(), iso, `${tz}: the same reading by the clock`);
  }
});

test("an hour that happens twice is its first, west of UTC and east of it", () => {
  // New York, 1 November 2026: 2:00 AM EDT becomes 1:00 AM EST. The first 1:30 is EDT (-4).
  assert.equal(at("America/New_York", "2026-11-01", 1, 30), "2026-11-01T05:30:00.000Z");
  // London, 25 October 2026: 2:00 AM BST becomes 1:00 AM GMT. The first 1:30 is BST (+1).
  assert.equal(at("Europe/London", "2026-10-25", 1, 30), "2026-10-25T00:30:00.000Z");
  // Santiago, 5 April 2026: midnight (-3) becomes 11:00 PM on the 4th (-4). The first 11:30 PM on the 4th is -3.
  assert.equal(at("America/Santiago", "2026-04-04", 23, 30), "2026-04-05T02:30:00.000Z");
  // And the day after it starts once, at its own midnight.
  assert.equal(new Date(zoneMidnight("America/Santiago", "2026-04-05")).toISOString(), "2026-04-05T04:00:00.000Z");
});

test("each day of a clock-change week is its own: one day's start to the next holds every hour of it and no other", () => {
  for (const [tz, from] of [
    ["America/New_York", "2026-03-05"],
    ["America/New_York", "2026-10-29"],
    ["Europe/London", "2026-03-26"],
    ["Europe/London", "2026-10-22"],
    ["America/Santiago", "2026-09-03"],
    ["America/Santiago", "2026-04-02"],
  ]) {
    const [y, m, d] = from.split("-").map(Number);
    for (let i = 0; i < 7; i++) {
      const key = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
      const next = new Date(Date.UTC(y, m - 1, d + i + 1)).toISOString().slice(0, 10);
      const start = zoneMidnight(tz, key);
      const end = zoneMidnight(tz, next);
      const hours = (end - start) / 3_600_000;
      assert.ok([23, 24, 25].includes(hours), `${tz} ${key}: ${hours} hours`);
      assert.equal(dayInZone(tz, start).key, key, `${tz} ${key} starts on itself`);
      assert.equal(dayInZone(tz, end - 1).key, key, `${tz} ${key}'s last instant is on itself`);
    }
  }
});
