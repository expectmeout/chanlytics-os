/**
 * A reminder already queued asks its visit again at the send (contracts appointmentHolds; lane 15's item 2): a visit of
 * the record cancelled after the run read it sends nothing, whoever cancelled it (a later email from the booking tool, a
 * member, a request that ran out with no answer), and so does one a later email moved to another time; a visit restated
 * at its own time (the same booking said again, which moves the row's updated_at) still goes; a word older than the
 * run's read is the older word. A day reminder drawn the night before a clock change is held to the same rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { appointmentHolds, recordKeyOf } from "@chanlytics/contracts";

const ID = "4b9c1c1e-0000-4000-8000-000000000001";
/** The run read the calendar at 9 AM EST on 7 March 2026 and drew the reminder for 10 AM EDT on the 8th. */
const READ = "2026-03-07T14:00:00.000Z";
const START = "2026-03-08T14:00:00.000Z";
const facts = { appointment: recordKeyOf(ID), visit_start: START, appointment_read_at: READ };
const rows = (row) =>
  new Map([[recordKeyOf(ID), { status: "booked", starts_at: START, vanished_at: null, updated_at: READ, ...row }]]);
const after = "2026-03-07T22:00:00.000Z";
const before = "2026-03-07T13:00:00.000Z";

test("a visit cancelled after the run read it sends no reminder, whoever said so", () => {
  // The booking tool's cancellation email, a member's word on the board, a request let go with no answer: all cancelled.
  assert.equal(appointmentHolds(rows({ status: "cancelled", updated_at: after }), facts), false);
  // Said before the run read it, it is held all the same: a cancellation is never the older word.
  assert.equal(appointmentHolds(rows({ status: "cancelled", updated_at: before }), facts), false);
  assert.equal(appointmentHolds(rows({ status: "missed", updated_at: after }), facts), false);
});

test("a visit a later email moved sends no reminder for its old time; one restated at its own time still goes", () => {
  assert.equal(appointmentHolds(rows({ starts_at: "2026-03-09T14:00:00.000Z", updated_at: after }), facts), false);
  // The same booking said again (booked_again restates its words, and moves updated_at): the time is the same.
  assert.equal(appointmentHolds(rows({ updated_at: after }), facts), true);
  // Moved before the run read it: the run drew what it saw, which is the newer word.
  assert.equal(appointmentHolds(rows({ starts_at: "2026-03-09T14:00:00.000Z", updated_at: before }), facts), true);
});

test("a visit the record does not hold, or a recipient drawn before the record, goes as it was drawn", () => {
  assert.equal(appointmentHolds(new Map(), facts), true);
  assert.equal(appointmentHolds(rows({ status: "cancelled", updated_at: after }), { visit_start: START }), true);
});
