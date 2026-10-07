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
  feedAppointmentRows,
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
    rows.map((r) => [r.external_id, r.title, r.service, r.consultation, r.contact_id, r.starts_at]),
    [
      ["a1", "Maria Lopez - Balayage", "Balayage", false, "p-maria", new Date(T0).toISOString()],
      [
        "a2",
        "Kitchen remodel consult with Tom Baker",
        "Kitchen remodel",
        true,
        "p-tom",
        new Date(T0 + D).toISOString(),
      ],
    ],
  );
  assert.equal(serviceNamedIn("Haircut and colour", [{ name: "Colour" }, { name: "Haircut" }]), "Haircut");
  assert.equal(serviceNamedIn("", services), null);
});

test("the question a reminder asks at its send: a run drawn with no key, or an appointment the sync has not written, goes; one cancelled, missed, gone from the calendar or moved is held", () => {
  const start = new Date(T0).toISOString();
  const facts = {
    visit_when: "tomorrow at 10:00 AM",
    visit_service: "Balayage",
    appointment: "a1",
    visit_start: start,
  };
  const row = (o = {}) => new Map([["a1", { status: "booked", starts_at: start, vanished_at: null, ...o }]]);
  assert.equal(appointmentHolds(row(), facts), true, "booked, at the time it was drawn for");
  assert.equal(appointmentHolds(row({ status: "kept" }), facts), true, "a thank-you after it happened");
  assert.equal(appointmentHolds(row({ status: "proposed" }), facts), true);
  assert.equal(appointmentHolds(row({ status: "cancelled" }), facts), false);
  assert.equal(appointmentHolds(row({ status: "missed" }), facts), false);
  assert.equal(appointmentHolds(row({ vanished_at: new Date(T0 - D).toISOString() }), facts), false);
  assert.equal(
    appointmentHolds(row({ starts_at: new Date(T0 + 3600_000).toISOString() }), facts),
    false,
    "moved an hour: the words would name the wrong time",
  );
  assert.equal(appointmentHolds(new Map(), facts), true, "not written yet: the run read the live calendar");
  assert.equal(appointmentHolds(row({ status: "cancelled" }), { visit_when: "x" }), true, "a run before the record");
  assert.deepEqual(
    appointmentKeysOf([{ facts }, { facts: { appointment: "a1" } }, { facts: null }, { facts: { appointment: "b2" } }]),
    ["a1", "b2"],
    "one read for the batch, each key once",
  );
  assert.deepEqual([...APPOINTMENT_STATUSES], ["proposed", "booked", "kept", "missed", "cancelled"]);
});
