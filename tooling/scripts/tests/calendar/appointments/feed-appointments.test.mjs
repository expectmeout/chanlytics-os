/**
 * An appointment is a record (decision 0002): the key each event of the owner's calendar is kept under, the rows a read
 * becomes, and the question a reminder asks at its send. Executed against the built contracts; the table, its guard and
 * the sync door are proved on Postgres in appointments.db.test.mjs, the sweep that writes them in
 * cron/cron-calendar-door.test.mjs, and the send that asks them in broadcasts/core-broadcast.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPOINTMENT_STATUSES,
  appointmentHolds,
  appointmentKeyOf,
  appointmentKeysOf,
  asksTheFeed,
  feedAppointmentRows,
  feedNamesOf,
  feedStillNames,
  parseIcs,
  serviceNamedIn,
} from "@chanlytics/contracts";

const D = 86_400_000;
const T0 = Date.parse("2026-10-12T14:00:00Z"); // a Monday, 10:00 in New York
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, "");
const ics = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flat(), "END:VCALENDAR"].join("\r\n");
const event = (lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
const horizon = { from: T0 - 30 * D, to: T0 + 60 * D };

test("the key: a single event's own UID; one occurrence of a series its UID and when it was due; a moved occurrence keeps the key of the one it replaced; no UID, its start", () => {
  const feed = parseIcs(
    ics(
      event(["UID:single-1", `DTSTART:${stamp(T0)}`, `DTEND:${stamp(T0 + 3600_000)}`, "SUMMARY:Haircut"]),
      event([
        "UID:weekly-1",
        `DTSTART:${stamp(T0 + D)}`,
        `DTEND:${stamp(T0 + D + 3600_000)}`,
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "SUMMARY:Standing trim",
      ]),
      // The second week's occurrence moved two hours later.
      event([
        "UID:weekly-1",
        `RECURRENCE-ID:${stamp(T0 + 8 * D)}`,
        `DTSTART:${stamp(T0 + 8 * D + 2 * 3600_000)}`,
        `DTEND:${stamp(T0 + 8 * D + 3 * 3600_000)}`,
        "SUMMARY:Standing trim",
      ]),
      event([`DTSTART:${stamp(T0 + 2 * D)}`, `DTEND:${stamp(T0 + 2 * D + 3600_000)}`, "SUMMARY:No uid"]),
    ),
    "UTC",
    { horizon },
  );
  const keys = feed.items.map((it) => [it.title, appointmentKeyOf(it)]);
  assert.deepEqual(keys, [
    ["Haircut", "single-1"],
    ["Standing trim", `weekly-1:${T0 + D}`],
    ["No uid", `ev:${T0 + 2 * D}`],
    ["Standing trim", `weekly-1:${T0 + 8 * D}`],
    ["Standing trim", `weekly-1:${T0 + 15 * D}`],
  ]);
  const moved = feed.items.find((it) => it.occurrence === T0 + 8 * D);
  assert.equal(moved.start, T0 + 8 * D + 2 * 3600_000, "the moved occurrence stands where it moved, under its old key");
  assert.equal(
    feed.items.find((it) => it.uid === "single-1").occurrence,
    undefined,
    "a single event carries no occurrence",
  );
});

test("the rows: inside the window the read covered only, one per key, the person the board would name, the service the title names, a consultation by its words", () => {
  const items = [
    {
      start: T0,
      end: T0 + 3600_000,
      title: "Maria Lopez - Balayage",
      allDay: false,
      uid: "a1",
      description: "Client: +1 305 555 0142",
      location: null,
      attendees: [],
      organizer: null,
    },
    {
      start: T0 + D,
      end: T0 + D + 3600_000,
      title: "Kitchen remodel consult with Tom Baker",
      allDay: false,
      uid: "a2",
      description: null,
      location: null,
      attendees: [],
      organizer: null,
    },
    // The same key twice (a feed that repeats an event): the first is the row.
    {
      start: T0 + 2 * D,
      end: T0 + 2 * D + 3600_000,
      title: "Duplicate",
      allDay: false,
      uid: "a1",
      description: null,
      location: null,
      attendees: [],
      organizer: null,
    },
    // A key past what the record keeps: left out, never cut short (a cut key is never found again).
    {
      start: T0 + 2 * D,
      end: T0 + 2 * D + 3600_000,
      title: "Long key",
      allDay: false,
      uid: "u".repeat(513),
      description: null,
      location: null,
      attendees: [],
      organizer: null,
    },
    // Outside the window: not written, and so never vanished either.
    {
      start: T0 + 90 * D,
      end: T0 + 90 * D + 3600_000,
      title: "Far ahead",
      allDay: false,
      uid: "a3",
      description: null,
      location: null,
      attendees: [],
      organizer: null,
    },
  ];
  const people = [
    { id: "p-maria", name: "", phone: "+13055550142", email: null },
    { id: "p-tom", name: "Tom Baker", phone: null, email: null },
  ];
  const services = [{ name: "Balayage" }, { name: "Kitchen remodel" }];
  const rows = feedAppointmentRows(items, {
    people,
    own: new Set(),
    services,
    rules: { consult_first: ["Kitchen remodel"] },
    window: horizon,
  });
  assert.deepEqual(
    rows.map((r) => [r.external_id, r.service, r.consultation, r.contact_id, r.starts_at]),
    [
      ["a1", "Balayage", false, "p-maria", new Date(T0).toISOString()],
      ["a2", "Kitchen remodel", true, "p-tom", new Date(T0 + D).toISOString()],
    ],
  );
  assert.ok(
    rows.every((r) => !("title" in r)),
    "the owner's words about a visit are read for its service and left: they name the person",
  );
  assert.equal(serviceNamedIn("Haircut and colour", [{ name: "Colour" }, { name: "Haircut" }]), "Haircut");
  assert.equal(serviceNamedIn("", services), null);
  assert.equal(
    serviceNamedIn("Kitchen remodel and Balayage", services, (name) => name === "Balayage"),
    "Balayage",
    "the longest of those the caller keeps: a consultation's service is the same rule over consult-first services",
  );
});

test("the question a reminder asks at its send: a person's cancellation or a missed visit holds it; a row the feed stopped naming, or that moved, holds it only when the row read the calendar after the run did; a run drawn with no key, or an appointment the sync has not written, goes", () => {
  const start = new Date(T0).toISOString();
  const READ = T0 - 12 * 3600_000; // the run read the calendar the evening before
  const before = new Date(READ - 3600_000).toISOString();
  const after = new Date(READ + 3600_000).toISOString();
  const facts = {
    visit_when: "tomorrow at 10:00 AM",
    visit_service: "Balayage",
    appointment: "a1",
    visit_start: start,
    appointment_read_at: new Date(READ).toISOString(),
  };
  const row = (o = {}) =>
    new Map([["a1", { status: "booked", starts_at: start, vanished_at: null, updated_at: before, ...o }]]);
  const moved = new Date(T0 + 3600_000).toISOString();
  assert.equal(appointmentHolds(row(), facts), true, "booked, at the time it was drawn for");
  assert.equal(appointmentHolds(row({ status: "kept" }), facts), true, "a thank-you after it happened");
  assert.equal(appointmentHolds(row({ status: "proposed" }), facts), true);
  assert.equal(appointmentHolds(row({ status: "cancelled" }), facts), false, "a person's word, whenever it was said");
  assert.equal(appointmentHolds(row({ status: "missed", updated_at: before }), facts), false);
  assert.equal(
    appointmentHolds(row({ vanished_at: after, updated_at: after }), facts),
    false,
    "the feed stopped naming it after the run read it",
  );
  assert.equal(
    appointmentHolds(row({ vanished_at: before }), facts),
    true,
    "vanished at an older read, and on the calendar when the run read it: back before the next sync",
  );
  assert.equal(
    appointmentHolds(row({ starts_at: moved, updated_at: after }), facts),
    false,
    "moved an hour after the run: the words would name the wrong time",
  );
  assert.equal(
    appointmentHolds(row({ starts_at: moved, updated_at: before }), facts),
    true,
    "the row is the older read: the run saw the visit at its new time, and its words say that time",
  );
  const unread = { ...facts, appointment_read_at: undefined };
  assert.equal(
    appointmentHolds(row({ status: "cancelled" }), unread),
    false,
    "no read time: a cancellation still holds",
  );
  assert.equal(
    appointmentHolds(row({ starts_at: moved, updated_at: after }), unread),
    true,
    "no read time: nothing else",
  );
  assert.equal(appointmentHolds(row({ vanished_at: after }), unread), true);
  assert.equal(appointmentHolds(new Map(), facts), true, "not written yet: the run read the live calendar");
  assert.equal(appointmentHolds(row({ status: "cancelled" }), { visit_when: "x" }), true, "a run before the record");
  assert.deepEqual(
    appointmentKeysOf([{ facts }, { facts: { appointment: "a1" } }, { facts: null }, { facts: { appointment: "b2" } }]),
    ["a1", "b2"],
    "one read for the batch, each key once",
  );
  assert.deepEqual([...APPOINTMENT_STATUSES], ["proposed", "booked", "kept", "missed", "cancelled"]);
});

test("the question a reminder asks the calendar feed at its send (S1-05): a calendar event the feed, read now over a span that holds the visit, no longer names holds it; a booking from the record, a visit outside the span, a run drawn with no key and a feed that names it go", () => {
  const start = new Date(T0).toISOString();
  const items = [
    { uid: "a1@cal.example", start: T0, occurrence: undefined },
    { uid: "series@cal.example", start: T0 + D, occurrence: T0 + D },
    { uid: null, start: T0 + 2 * D, occurrence: undefined },
  ];
  const names = feedNamesOf(items, horizon);
  assert.deepEqual(
    [...names.keys].sort(),
    [`ev:${T0 + 2 * D}`, "a1@cal.example", `series@cal.example:${T0 + D}`].sort(),
    "each event under the key the record keeps it under (appointmentKeyOf), a repeating one by the occurrence it was due",
  );
  assert.deepEqual([names.from, names.to], [horizon.from, horizon.to]);

  const facts = (key, over = {}) => ({ appointment: key, visit_start: start, ...over });
  assert.equal(feedStillNames(names, facts("a1@cal.example")), true, "the feed names it");
  assert.equal(
    feedStillNames(names, facts("cancelled@cal.example")),
    false,
    "cancelled in the calendar: the feed drops it at once, whatever the record still says",
  );
  assert.equal(
    feedStillNames(names, facts(`series@cal.example:${T0 + D}`, { visit_start: new Date(T0 + D).toISOString() })),
    true,
  );
  assert.equal(
    feedStillNames(names, facts("cancelled@cal.example", { visit_start: new Date(T0 + 90 * D).toISOString() })),
    true,
    "outside the span the feed was read over, it is not looked for there: not gone",
  );
  assert.equal(
    feedStillNames(names, facts("cancelled@cal.example", { visit_start: new Date(T0 - 60 * D).toISOString() })),
    true,
    "before the span too",
  );
  assert.equal(
    feedStillNames(names, facts("appt:6c5e")),
    true,
    "a booking from the record is no event of the calendar",
  );
  assert.equal(feedStillNames(names, { visit_when: "tomorrow" }), true, "a run drawn before the record");
  assert.equal(feedStillNames(names, { appointment: "x", visit_start: "not a time" }), true, "no start to look for");
  assert.equal(feedStillNames(names, { appointment: "", visit_start: start }), true, "no key");

  // Which reminders must ask the feed at all.
  assert.equal(asksTheFeed(facts("a1@cal.example")), true);
  assert.equal(asksTheFeed(facts("appt:6c5e")), false);
  assert.equal(asksTheFeed({ visit_when: "tomorrow" }), false);
  assert.equal(asksTheFeed({ appointment: "x" }), false, "no start");
});
