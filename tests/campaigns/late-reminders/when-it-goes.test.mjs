/**
 * When a late booking's reminder goes (contracts lateReminderAt, decision 0118), run as it is over bookings written here.
 * The reminder's daily look names tomorrow's visits once, at its hour; a booking that lands after it is reminded at 8:00 PM
 * the evening before, at once when that has just passed, else the visit's own morning where that leaves two hours. A
 * booking the look will still name gets nothing extra, and neither does one nobody owes a reminder: booked today for
 * today, or at night for the next morning.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lateReminderAt } from "@chanlytics/contracts";

/** Monday 9 November 2026 in New York is on standard time, five hours behind UTC. */
const TZ = "America/New_York";
const at = (iso) => Date.parse(iso);
/** The rule over one booking: the reminder step runs at 10:00 AM, and ran last on `lastRunFor`. */
const ask = (now, starts, lastRunFor = "2026-11-09") =>
  lateReminderAt({ startsAt: at(starts), tz: TZ, nowMs: at(now), runHour: 10, lastRunFor });

test("booked at 3:12 PM, after the day's look, for 9:00 tomorrow: 8:00 PM tonight", () => {
  assert.deepEqual(ask("2026-11-09T20:12:00Z", "2026-11-10T14:00:00Z"), {
    at: at("2026-11-10T01:00:00Z"),
    day: "2026-11-10",
  });
});

test("booked before the day's look: the look names it, nothing extra", () => {
  assert.equal(ask("2026-11-09T14:00:00Z", "2026-11-10T14:00:00Z", "2026-11-08"), null);
});

test("a look that has not run yet today is still to come, whatever the hour, until the sending hours end", () => {
  assert.equal(ask("2026-11-09T20:12:00Z", "2026-11-10T14:00:00Z", "2026-11-08"), null);
  // Past the last sending hour with no look made: nothing of today's will name it, so the morning of the visit does.
  assert.deepEqual(ask("2026-11-10T03:00:00Z", "2026-11-10T19:00:00Z", "2026-11-08"), {
    at: at("2026-11-10T15:00:00Z"),
    day: "2026-11-10",
  });
});

test("booked between 8:00 and 8:59 PM: now", () => {
  assert.deepEqual(ask("2026-11-10T01:30:00Z", "2026-11-10T14:00:00Z"), {
    at: at("2026-11-10T01:30:00Z"),
    day: "2026-11-10",
  });
});

test("booked at 9:30 PM for 9:00 AM: nothing, they booked hours ago", () => {
  assert.equal(ask("2026-11-10T02:30:00Z", "2026-11-10T14:00:00Z"), null);
});

test("booked at 10:00 PM for 2:00 PM: the morning of, at the reminder's hour", () => {
  assert.deepEqual(ask("2026-11-10T03:00:00Z", "2026-11-10T19:00:00Z"), {
    at: at("2026-11-10T15:00:00Z"),
    day: "2026-11-10",
  });
});

test("the morning of leaves two hours, or nothing goes", () => {
  // 11:30 AM is an hour and a half after the 10:00 reminder would go.
  assert.equal(ask("2026-11-10T03:00:00Z", "2026-11-10T16:30:00Z"), null);
  assert.deepEqual(ask("2026-11-10T03:00:00Z", "2026-11-10T17:00:00Z"), {
    at: at("2026-11-10T15:00:00Z"),
    day: "2026-11-10",
  });
});

test("two days out: the eve's look names it", () => {
  assert.equal(ask("2026-11-09T20:00:00Z", "2026-11-11T14:00:00Z"), null);
});

test("booked today for today, and a visit already past: nothing", () => {
  assert.equal(ask("2026-11-09T13:00:00Z", "2026-11-09T20:00:00Z"), null);
  assert.equal(ask("2026-11-09T20:00:00Z", "2026-11-09T19:00:00Z"), null);
});
