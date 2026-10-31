/**
 * A freed time (decision 0082): the time a cancellation, a move or a vanished calendar entry freed, as the receptionist
 * would offer it, or why there is none. One rule (contracts calendar/visit/freed-time.ts freedTimeOf) over the receptionist's own open
 * windows (freeWindows), so a freed time is never a time the receptionist would not offer a caller: inside the hours, past
 * the least notice, inside the booking window, not on a closure, and free on the record now. And the words a message says
 * it in, by the business's clock at the moment it is read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FREED_TIME_REFUSALS, freedTimeOf, freedTimeTaken, freedTimeWords } from "@chanlytics/contracts";

const TZ = "America/New_York";
const MIN = 60_000;
const H = 60 * MIN;
/** Monday 19 October 2026, 2:00 PM in New York (EDT, UTC-4). */
const NOW = new Date("2026-10-19T18:00:00Z");
/** A wall-clock time in New York in October (EDT): the day of the month and the hour. */
const oct = (day, hh, mm = 0) => Date.UTC(2026, 9, day, hh + 4, mm);

const open = { open: "09:00", close: "18:00" };
const HOURS = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: { open: null, close: null } };
/** Saturday the 24th is closed for a holiday. */
const CLOSURES = [{ date: "2026-10-24" }];
const calendar = (over = {}) => ({
  tz: TZ,
  hours: HOURS,
  closures: CLOSURES,
  standing: [],
  rules: { lead_hours: 2, buffer_min: 0, max_days_ahead: 14, slot_min: 30 },
  ...over,
});
const cancelled = { change: "cancelled", by: "service", source: "booking_email" };
/** The row an event is about, as the record holds it now. */
const row = (start, end = start + H, over = {}) => ({
  id: "appt-1",
  contactId: "person-1",
  startsAt: new Date(start).toISOString(),
  endsAt: new Date(end).toISOString(),
  allDay: false,
  ...over,
});
const refused = (verdict) => (verdict.ok ? null : verdict.why);

test("a client's cancellation by the service frees its time: offered whole where it is free and inside the hours", () => {
  assert.deepEqual(freedTimeOf(cancelled, row(oct(20, 15)), calendar(), NOW), {
    ok: true,
    start: oct(20, 15),
    end: oct(20, 16),
  });
  // The feed's own changes are the service's: a vanished entry frees its time, as a booking tool's cancel does.
  assert.equal(
    freedTimeOf({ change: "vanished", source: "calendar_feed" }, row(oct(21, 10)), calendar(), NOW).ok,
    true,
  );
});

test("only the service's cancel, move or vanish frees a time to offer, and only a person's appointment", () => {
  assert.equal(
    refused(freedTimeOf({ ...cancelled, by: "member" }, row(oct(20, 15)), calendar(), NOW)),
    "not_a_service_change",
  );
  for (const change of ["added", "confirmed", "kept", "missed", "back"])
    assert.equal(
      refused(freedTimeOf({ ...cancelled, change }, row(oct(20, 15)), calendar(), NOW)),
      "not_a_service_change",
      change,
    );
  assert.equal(
    refused(freedTimeOf(cancelled, row(oct(20, 15), oct(20, 16), { contactId: null }), calendar(), NOW)),
    "no_person",
  );
  assert.equal(
    refused(freedTimeOf(cancelled, row(oct(20, 0), oct(21, 0), { allDay: true }), calendar(), NOW)),
    "all_day",
  );
});

test("a move frees the time it left (was_at), as long as the row is; an event that does not say it offers nothing", () => {
  const moved = { change: "moved", by: "service", source: "booking_tool" };
  // Moved from Tuesday 11:00 to Wednesday 15:00, an hour long: Tuesday 11:00 to 12:00 is free.
  const now = row(oct(21, 15));
  assert.deepEqual(freedTimeOf({ ...moved, was_at: new Date(oct(20, 11)).toISOString() }, now, calendar(), NOW), {
    ok: true,
    start: oct(20, 11),
    end: oct(20, 12),
  });
  assert.equal(refused(freedTimeOf(moved, now, calendar(), NOW)), "no_was_at", "an event from before 00498");
});

test("the least notice and the booking window are the receptionist's: too soon, part too soon, past the window", () => {
  // Today 3:00 to 4:00 PM ends by 4:00, the first moment two hours' notice allows: too soon.
  assert.equal(refused(freedTimeOf(cancelled, row(oct(19, 15)), calendar(), NOW)), "too_soon");
  // Today 3:30 to 5:00 PM: the part from 4:00 is offered.
  assert.deepEqual(freedTimeOf(cancelled, row(oct(19, 15, 30), oct(19, 17)), calendar(), NOW), {
    ok: true,
    start: oct(19, 16),
    end: oct(19, 17),
  });
  // Seventeen days on, past fourteen days ahead.
  assert.equal(refused(freedTimeOf(cancelled, row(Date.UTC(2026, 10, 5, 15)), calendar(), NOW)), "past_window");
});

test("a closed day, a closure and a time past closing are closed; a business with no hours offers nothing", () => {
  assert.equal(refused(freedTimeOf(cancelled, row(oct(24, 11)), calendar(), NOW)), "closed", "the holiday");
  assert.equal(refused(freedTimeOf(cancelled, row(oct(25, 11)), calendar(), NOW)), "closed", "Sunday");
  assert.equal(refused(freedTimeOf(cancelled, row(oct(20, 19)), calendar(), NOW)), "closed", "after six");
  // Half an hour before closing to half an hour after: the half before is offered.
  assert.deepEqual(freedTimeOf(cancelled, row(oct(20, 17, 30), oct(20, 18, 30)), calendar(), NOW), {
    ok: true,
    start: oct(20, 17, 30),
    end: oct(20, 18),
  });
  assert.equal(refused(freedTimeOf(cancelled, row(oct(20, 15)), calendar({ hours: {} }), NOW)), "no_hours");
});

test("free on the record now: taken whole is not free, half taken offers the half, and less than a slot is too short", () => {
  const taken = (start, end) => calendar({ standing: [{ start, end }] });
  assert.equal(refused(freedTimeOf(cancelled, row(oct(20, 15)), taken(oct(20, 15), oct(20, 16)), NOW)), "not_free");
  assert.deepEqual(freedTimeOf(cancelled, row(oct(20, 15)), taken(oct(20, 15), oct(20, 15, 30)), NOW), {
    ok: true,
    start: oct(20, 15, 30),
    end: oct(20, 16),
  });
  assert.equal(
    refused(freedTimeOf(cancelled, row(oct(20, 15)), taken(oct(20, 15), oct(20, 15, 40)), NOW)),
    "too_short",
    "twenty minutes left of a thirty-minute slot",
  );
  // The buffer around a standing appointment is the receptionist's too.
  assert.equal(
    refused(
      freedTimeOf(
        cancelled,
        row(oct(20, 15)),
        calendar({
          standing: [{ start: oct(20, 14), end: oct(20, 15) }],
          rules: { buffer_min: 45, slot_min: 30, lead_hours: 2 },
        }),
        NOW,
      ),
    ),
    "too_short",
    "a 45-minute buffer leaves fifteen minutes",
  );
});

test("the freed visit's other sighting holds none of its time; another person's visit, or the moved row itself, does", () => {
  // The calendar's copy of a cancelled booking: the same person, starting as the visit did, until the feed's next read.
  const copy = { id: "appt-2", contactId: "person-1", start: oct(20, 15), end: oct(20, 16) };
  assert.equal(freedTimeOf(cancelled, row(oct(20, 15)), calendar({ standing: [copy] }), NOW).ok, true);
  assert.equal(
    refused(
      freedTimeOf(cancelled, row(oct(20, 15)), calendar({ standing: [{ ...copy, contactId: "person-2" }] }), NOW),
    ),
    "not_free",
  );
  // A move of a quarter hour: the row stands at its new time, so the time it left is all but taken.
  const moved = {
    change: "moved",
    by: "service",
    source: "booking_email",
    was_at: new Date(oct(20, 15)).toISOString(),
  };
  const now = { id: "appt-1", contactId: "person-1", start: oct(20, 15, 15), end: oct(20, 16, 15) };
  assert.equal(
    refused(freedTimeOf(moved, row(oct(20, 15, 15)), calendar({ standing: [now] }), NOW)),
    "too_short",
    "fifteen minutes left, never the hour",
  );
});

test("a time offered is taken when anything stands over it now, but for the freed visit's own sightings", () => {
  const offered = { start: oct(20, 15), end: oct(20, 16) };
  const freedRow = row(oct(20, 15));
  assert.equal(freedTimeTaken(offered, freedRow, []), false, "nothing stands: still free");
  // Someone booked half of it since: taken.
  assert.equal(
    freedTimeTaken(offered, freedRow, [
      { id: "appt-9", contactId: "person-2", start: oct(20, 15, 30), end: oct(20, 16, 30) },
    ]),
    true,
  );
  // The calendar's copy of the cancelled visit, still on the feed's last read: the visit itself, not a booking.
  assert.equal(
    freedTimeTaken(offered, freedRow, [{ id: "appt-2", contactId: "person-1", start: oct(20, 15), end: oct(20, 16) }]),
    false,
  );
  // The same person booked at that time again, through the receptionist an hour later: theirs, and taken.
  assert.equal(
    freedTimeTaken(offered, freedRow, [{ id: "appt-1", contactId: "person-1", start: oct(20, 15), end: oct(20, 16) }]),
    true,
  );
  // Next to it, not over it: free.
  assert.equal(
    freedTimeTaken(offered, freedRow, [{ id: "appt-9", contactId: "person-2", start: oct(20, 16), end: oct(20, 17) }]),
    false,
  );
});

test("every refusal is one of the closed set the log line says", () => {
  assert.deepEqual([...FREED_TIME_REFUSALS].sort(), [
    "all_day",
    "closed",
    "no_hours",
    "no_person",
    "no_was_at",
    "not_a_service_change",
    "not_free",
    "past_window",
    "too_short",
    "too_soon",
  ]);
});

test("the words a message says the time in, as it reads at the moment it goes: today, tomorrow, the weekday, else the date", () => {
  assert.equal(freedTimeWords(oct(19, 16, 30), TZ, NOW), "today at 4:30 PM");
  assert.equal(freedTimeWords(oct(20, 14), TZ, NOW), "tomorrow at 2:00 PM");
  assert.equal(freedTimeWords(oct(22, 15), TZ, NOW), "on Thursday at 3:00 PM");
  // Fifteen days on, a weekday would be ambiguous: the date.
  assert.equal(freedTimeWords(Date.UTC(2026, 10, 3, 15), TZ, NOW), "on Nov 3 at 10:00 AM");
  // Across the clock's change (1 November): read on Saturday evening, Monday 9:00 AM EST is two days on.
  assert.equal(
    freedTimeWords(Date.UTC(2026, 10, 2, 14), TZ, new Date(Date.UTC(2026, 10, 1, 0))),
    "on Monday at 9:00 AM",
  );
  // A batch made at night goes at nine: tomorrow's time read then is today's.
  assert.equal(freedTimeWords(oct(20, 15), TZ, new Date(oct(20, 9))), "today at 3:00 PM");
});
