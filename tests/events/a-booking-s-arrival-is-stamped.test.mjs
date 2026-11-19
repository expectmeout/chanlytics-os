/**
 * The subscriber `visit_arrival` (decision 0141, 00647): a booking that arrived is stamped on its visit with the event's
 * own moment, by the rule the bell tells it by (contracts bookingArriving), so a day's bookings are counted from the
 * record. Core's verb over fakes for its ports: what it stamps, and everything it leaves alone. The harness in
 * an-event-is-delivered-to-its-subscriber.test.mjs runs it twice through the real job and the record in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_SUBSCRIBERS } from "@chanlytics/contracts";
import { SUBSCRIBERS } from "../../packages/core/src/events/subscribers.ts";
import { TENANT } from "../_rows.mjs";

const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const AT = "2026-10-06T14:03:11.482913+00:00";

/** An appointment.changed event as a delivery hands it over. */
const event = (data, over = {}) => ({
  id: "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0",
  tenant_id: TENANT,
  kind: "appointment.changed",
  subject_type: "appointment",
  subject_id: APPT,
  data,
  created_at: AT,
  version: 1,
  ...over,
});

/** The one port it acts through, keeping what it was asked. */
function ports() {
  const kept = [];
  return {
    kept,
    keepArrival: async (tenantId, appointmentId, at) => {
      kept.push([tenantId, appointmentId, at]);
    },
  };
}

const FEED = { source: "calendar_feed", change: "added", named: true, series: false, twin: false, first: false };

test("visit_arrival is a subscriber a delivery can name", () => {
  assert.ok(EVENT_SUBSCRIBERS.includes("visit_arrival"));
  assert.equal(typeof SUBSCRIBERS.visit_arrival, "function");
});

test("a booking that arrived is stamped on its visit with the event's own moment, however late the delivery runs", async () => {
  for (const data of [
    { source: "booking_email", change: "added" },
    { source: "booking_tool", change: "added" },
    { source: "booking_email", change: "confirmed" },
    FEED,
  ]) {
    const world = ports();
    await SUBSCRIBERS.visit_arrival(event(data), world);
    assert.deepEqual(world.kept, [[TENANT, APPT, AT]], JSON.stringify(data));
  }
});

test("what the bell's rule calls no booking is stamped nowhere: a move, a cancellation, a member's word, their own entry, the owner's diary, a calendar's first read", async () => {
  for (const data of [
    { source: "booking_email", change: "moved" },
    { source: "booking_email", change: "cancelled", by: "service" },
    { source: "booking_tool", change: "kept" },
    { source: "booking_tool", change: "missed" },
    { source: "person", change: "added" },
    { source: "receptionist", change: "added" },
    { source: "calendar_feed", change: "vanished" },
    { source: "calendar_feed", change: "back" },
    { ...FEED, named: false },
    { ...FEED, series: true },
    { ...FEED, twin: true },
    { ...FEED, first: true },
    // An addition from before the calendar's facts were stamped on it (00419) says none of them.
    { source: "calendar_feed", change: "added" },
  ]) {
    const world = ports();
    await SUBSCRIBERS.visit_arrival(event(data), world);
    assert.deepEqual(world.kept, [], JSON.stringify(data));
  }
  const other = ports();
  await SUBSCRIBERS.visit_arrival(event({ by: "invite", role: "operator" }, { kind: "member.joined" }), other);
  await SUBSCRIBERS.visit_arrival(event({ source: "booking_email", change: "added" }, { subject_id: null }), other);
  assert.deepEqual(other.kept, [], "another kind, and an event about no visit");
});

test("a stamp that could not be written fails the delivery, so it is tried again", async () => {
  const failing = {
    keepArrival: async () => {
      throw new Error("the record did not answer");
    },
  };
  await assert.rejects(
    () => SUBSCRIBERS.visit_arrival(event({ source: "booking_email", change: "added" }), failing),
    /did not answer/,
  );
});
