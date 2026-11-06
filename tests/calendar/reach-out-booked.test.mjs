/**
 * What the calendar sweep hands the booking door (bookedSeenOf, reach-out-booked.ts): each address and number of each
 * appointment with its start, at most BOOKED_SEEN_CAP of them, the NEWEST appointments first.
 *
 * The cap is what decides who the door hears about. The door (00227 reach_out_booked) converts a lead on an
 * appointment starting after an email left, so what matters is what is to come and what just happened. Earliest first,
 * a feed that carries its history (the parser keeps a single event whatever its date) spent the five hundred on
 * appointments from long before any reach-out, and a booking made last week never reached the door (the wiring trace,
 * 5 October 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookedSeenOf, BOOKED_SEEN_CAP } from "@chanlytics/contracts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-06T12:00:00Z");

/** One appointment with one guest, `daysFromNow` days from now (negative: that long ago). */
const visit = (uid, email, daysFromNow) => ({
  uid,
  title: "Consultation",
  allDay: false,
  start: NOW + daysFromNow * DAY,
  end: NOW + daysFromNow * DAY + 3_600_000,
  description: null,
  location: null,
  attendees: [{ name: null, email }],
  organizer: null,
});

test("newest first: a booking to come leads, then the most recent, and history past the cap is what is left out", () => {
  const history = Array.from({ length: BOOKED_SEEN_CAP + 20 }, (_, i) =>
    visit(`h${i}`, `guest-${i}@example.com`, -(i + 1)),
  );
  const soon = visit("soon", "booked-next-week@example.com", 2);
  const yesterday = visit("y", "booked-yesterday@example.com", -0.5);
  // Handed in oldest first, as a feed is read: the order of the items must not be the order of the answer.
  const seen = bookedSeenOf([...history].reverse().concat([yesterday, soon]), new Set());

  assert.equal(seen.length, BOOKED_SEEN_CAP, "at most the cap");
  assert.deepEqual(
    seen.slice(0, 3).map((s) => s.email),
    ["booked-next-week@example.com", "booked-yesterday@example.com", "guest-0@example.com"],
    "what is to come first, then yesterday, then the day before",
  );
  assert.equal(seen[0].start, new Date(soon.start).toISOString(), "each with when its appointment starts");
  assert.ok(
    !seen.some((s) => s.email === `guest-${BOOKED_SEEN_CAP + 19}@example.com`),
    "the oldest appointment is the one the cap leaves out",
  );
});

test("the business's own addresses are left out, and an appointment with nobody in it hands nothing", () => {
  const own = new Set(["owner@business.example.com"]);
  const seen = bookedSeenOf(
    [
      visit("a", "owner@business.example.com", 1),
      visit("b", "client@example.com", 3),
      { ...visit("c", "nobody@example.com", 4), attendees: [] },
    ],
    own,
  );
  assert.deepEqual(
    seen.map((s) => s.email),
    ["client@example.com"],
  );
});
