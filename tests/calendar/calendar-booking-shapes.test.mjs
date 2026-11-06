/**
 * A real booking does not arrive tidy. The name may be the whole title, or buried in a noisy one; the phone
 * may be in the notes a booking tool wrote, or in the location field; the address may be on an attendee and
 * nowhere else. The day on Today links an appointment to the person it is for, so every one of those shapes
 * has to find them — and the two that must NOT find anyone (the business's own address, and a stranger) must
 * stay unmatched, because a wrong link sends an owner to the wrong thread.
 *
 * Ruben asked whether this parses cleanly when live bookings come in. It does; this is what holds it true.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPerson, extractContacts } from "@chanlytics/contracts";

const PEOPLE = [
  { id: "p1", name: "Daniela Reyes", phone: "+19175550101", email: "daniela@example.com" },
  { id: "p2", name: "Marcus Bell", phone: "+19175550102", email: null },
];
const OWN = new Set(["salon@marisa.example.com"]);
const event = (over) => ({
  title: "",
  description: null,
  location: null,
  attendees: [],
  organizer: "salon@marisa.example.com",
  ...over,
});

test("an appointment finds its person wherever the booking put them", () => {
  const cases = [
    ["the name is the title", { title: "Cut · Daniela Reyes" }, "p1", "name"],
    ["the name is in a noisy title", { title: "Color treatment - Daniela Reyes (deposit paid)" }, "p1", "name"],
    ["the name is lower case", { title: "gloss with daniela reyes" }, "p1", "name"],
    [
      "the phone is in the notes",
      { title: "Appointment", description: "Client: +1 917 555 0101, wants a gloss" },
      "p1",
      "phone",
    ],
    [
      "a booking tool wrote the notes",
      { title: "New booking", description: "Name: Daniela Reyes\nPhone: (917) 555-0101\nService: Gloss" },
      "p1",
      "phone",
    ],
    [
      "the address is in the notes",
      { title: "Booking", description: "confirmed with daniela@example.com" },
      "p1",
      "email",
    ],
    [
      "the address is on an attendee",
      { title: "Consultation", attendees: [{ name: null, email: "daniela@example.com" }] },
      "p1",
      "email",
    ],
    [
      "an attendee carries only a name",
      { title: "Consultation", attendees: [{ name: "Marcus Bell", email: null }] },
      "p2",
      "name",
    ],
    ["the phone is in the location", { title: "Call back", location: "+19175550102" }, "p2", "phone"],
  ];
  for (const [what, over, id, via] of cases) {
    const m = matchPerson(event(over), PEOPLE, OWN);
    assert.ok(m, `${what}: found nobody`);
    assert.equal(m.id, id, what);
    assert.equal(m.via, via, `${what}: matched the wrong way`);
  }
});

test("and never finds one who is not there", () => {
  // The business's own address is on the event because it is the business's calendar.
  assert.equal(
    matchPerson(
      event({ title: "Team meeting", attendees: [{ name: null, email: "salon@marisa.example.com" }] }),
      PEOPLE,
      OWN,
    ),
    null,
    "the salon is not a customer",
  );
  assert.equal(matchPerson(event({ title: "Stock count" }), PEOPLE, OWN), null, "a task is not a person");
  assert.equal(
    matchPerson(event({ title: "Gloss — Reyes" }), PEOPLE, OWN),
    null,
    "a surname alone is too little to send an owner anywhere",
  );
});

test("the contacts come off the title, the notes, the location and the attendees, and the organiser is dropped", () => {
  const c = extractContacts(
    event({
      title: "Gloss · Daniela Reyes",
      description: "Phone: (917) 555-0101 · daniela@example.com · booked by salon@marisa.example.com",
      location: "+1 917 555 0102",
      attendees: [{ name: "Marcus Bell", email: "salon@marisa.example.com" }],
    }),
    OWN,
  );
  assert.deepEqual(c.phones.slice().sort(), ["+19175550101", "+19175550102"], "both wires, wherever they were written");
  assert.deepEqual(c.emails, ["daniela@example.com"], "the salon's own address is not a customer's");
  // A number that is really a date, and digits inside an address, are not phones.
  const none = extractContacts(event({ title: "Review 2026-09-20", description: "maria2026@gmail.com" }), OWN);
  assert.deepEqual(none.phones, [], "a date is not a phone, and the digits in an address are not one either");
});
