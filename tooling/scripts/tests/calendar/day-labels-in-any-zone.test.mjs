/**
 * A calendar day's words are that day's for every viewer (the scorecard's defect 28). A day key is already the
 * business's day; its words were its UTC noon said in the viewer's own zone, so east of UTC+12 a Tuesday's key read
 * "Wednesday", Nov 17 read "Nov 18" and a month's first could name the month after it.
 *
 * This file runs in a zone where that went wrong: the test runner gives each file a process of its own, and the zone
 * is set here before contracts is loaded (its formatters are made when the module loads). Only this file sets it.
 */
process.env.TZ = "Pacific/Auckland";

import { test } from "node:test";
import assert from "node:assert/strict";

const { closureDatesLabel, frameOf, monthLabelOf } = await import("@chanlytics/contracts");

test("this process is in a zone where a day key's UTC noon is already the next day", () => {
  // 2026-11-17 12:00 UTC is 01:00 on the 18th in Auckland (UTC+13 in its summer).
  assert.equal(new Date(Date.UTC(2026, 10, 17, 12)).getDate(), 18);
});

test("a day key says its own day, month and weekday, whatever the viewer's zone", () => {
  // 2026-11-17 is a Tuesday: the board's frame of the day, as every view draws it.
  const day = frameOf("2026-11-17", "2026-11-16");
  assert.deepEqual([day.dow, day.date, day.long], ["Tue", "Nov 17", "Tuesday, November 17"]);
  assert.equal(closureDatesLabel({ date: "2026-11-17" }), "Nov 17");
  assert.equal(closureDatesLabel({ date: "2026-11-30", until: "2026-12-02" }), "Nov 30 – Dec 2");
  assert.equal(monthLabelOf("2026-11-01"), "November 2026");
  assert.equal(monthLabelOf("2026-12-01"), "December 2026");
});
