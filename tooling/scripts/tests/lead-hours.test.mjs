import { test } from "node:test";
import assert from "node:assert/strict";
import { weekHoursOf, DEFAULT_WEEK } from "@chanlytics/contracts";

const h = (hh, mm = 0) => hh * 60 + mm;

test("a listing's week, as Maps words it: ranges, split days, closed days, all day, past midnight", () => {
  const { week, read } = weekHoursOf([
    { day: "Monday", hours: "9 AM to 6 PM" },
    { day: "Tuesday", hours: "9:30 AM to 12 PM, 1 to 5:30 PM" },
    { day: "Wednesday", hours: "Closed" },
    { day: "Thursday", hours: "Open 24 hours" },
    { day: "Friday", hours: "6 PM to 2 AM" },
    { day: "Saturday", hours: "10 AM–4 PM" },
  ]);
  assert.equal(read, true);
  assert.deepEqual(week.mon, [{ from: h(9), to: h(18) }]);
  assert.deepEqual(week.tue, [
    { from: h(9, 30), to: h(12) },
    { from: h(13), to: h(17, 30) },
  ]);
  assert.deepEqual(week.wed, []);
  assert.deepEqual(week.thu, [{ from: 0, to: h(24) }]);
  assert.deepEqual(week.fri, [{ from: h(18), to: h(26) }], "past midnight runs on");
  assert.deepEqual(week.sat, [{ from: h(10), to: h(16) }], "an en dash is a range too");
  assert.deepEqual(week.sun, [], "a day the listing does not name is closed");
});

test("noon and midnight, and a range whose start borrows its end's meridiem", () => {
  const { week } = weekHoursOf([
    { day: "Monday", hours: "12 PM to 12 AM" },
    { day: "Tuesday", hours: "8 to 11 AM" },
  ]);
  assert.deepEqual(week.mon, [{ from: h(12), to: h(24) }]);
  assert.deepEqual(week.tue, [{ from: h(8), to: h(11) }]);
});

test("hours nobody can read are the default week, and say so", () => {
  for (const hours of [null, [], [{ day: "Monday", hours: "Hours might differ" }], "9-5", { mon: "9-5" }]) {
    const out = weekHoursOf(hours);
    assert.equal(out.read, false, JSON.stringify(hours));
    assert.deepEqual(out.week, DEFAULT_WEEK);
  }
  assert.deepEqual(DEFAULT_WEEK.mon, [{ from: h(9), to: h(17) }]);
  assert.deepEqual(DEFAULT_WEEK.sat, []);
});

test("the shapes the finder has stored (production, 25 Sep 2026) read as a person reads them", () => {
  const read = (hours) => weekHoursOf([{ day: "Monday", hours }]).week.mon;
  assert.deepEqual(
    read("12 to 6:30 AM, 10 AM to 8 PM"),
    [
      { from: 0, to: h(6, 30) },
      { from: h(10), to: h(20) },
    ],
    "a start with no meridiem borrows AM",
  );
  assert.deepEqual(read("12 to 5 PM"), [{ from: h(12), to: h(17) }], "noon, borrowed");
  assert.deepEqual(read("1 to 7:30 PM"), [{ from: h(13), to: h(19, 30) }]);
  assert.deepEqual(read("10 AM to 12 AM"), [{ from: h(10), to: h(24) }], "midnight at the end is the day's end");
  assert.deepEqual(read("12 AM to 5 PM"), [{ from: 0, to: h(17) }]);
  assert.deepEqual(read("10:10 AM to 8 PM"), [{ from: h(10, 10), to: h(20) }]);
  assert.deepEqual(read("9\u202fAM\u2009to\u20095\u202fPM"), [{ from: h(9), to: h(17) }], "Maps' narrow spaces");
});
