/**
 * A booking notice, from the intake's claim to the row's identity (docs/plans/2026-10-07-bookings-arrive-by-email.md):
 * which emails are a tool's, what the model's answer must hold to be a booking, how a repeat meets its row, and how a
 * row is drawn beside the feed. The notice fixtures copy the shape the tools really write (a Booksy notice's lines in
 * their order; an Acuity copy of the client's confirmation), with made-up people: 555-01xx numbers, example.com.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const {
  bookingNoticeOf,
  bookingToolOfAddress,
  bookingToolName,
  NOTICE_SCHEMA,
  noticePrompt,
  noticeAnswerOf,
  appointmentKey,
  clientKeyOf,
  NOTICE_DEFAULT_LENGTH_MS,
  BOOKING_TOOL_IDS,
  bookingToolOptions,
  isBookingTool,
  BOOKING_TOOL_STEPS,
} = await importSrc("packages/contracts/src/calendar/booking-notice.ts");
const {
  appointmentTitle,
  busyOfAppointments,
  feedItemOfAppointment,
  itemOfAppointment,
  personOfAppointment,
  withoutVisitsRowsDraw,
} = await importSrc("packages/contracts/src/calendar/appointment-item.ts");

test("a row is taken time from its start to its end, the one rule every reader that names an open time subtracts by", () => {
  // The board, Ask, the prompt's preview and the receptionist each hand their rows here (00345), so none offers a
  // time another draws as taken.
  assert.deepEqual(
    busyOfAppointments([
      { starts_at: "2026-10-08T19:00:00.000Z", ends_at: "2026-10-08T20:00:00.000Z" },
      { starts_at: "2026-10-09T14:30:00.000Z", ends_at: "2026-10-09T15:15:00.000Z" },
    ]),
    [
      { start: Date.parse("2026-10-08T19:00:00.000Z"), end: Date.parse("2026-10-08T20:00:00.000Z") },
      { start: Date.parse("2026-10-09T14:30:00.000Z"), end: Date.parse("2026-10-09T15:15:00.000Z") },
    ],
  );
  assert.deepEqual(busyOfAppointments([]), []);
});

test("the tools an owner may pick are the tools the intake recognises, in one order, each with its name, its sender and its steps", () => {
  // The picker's ids (BOOKING_TOOL_IDS, which the config schema holds config.bookings.tool to) and the senders' list
  // are declared apart, so the compiler can hold each row to an id: this holds the list to every id, in its order.
  assert.deepEqual(
    bookingToolOptions().map((o) => o.value),
    [...BOOKING_TOOL_IDS],
    "every id has its row, in the ids' order, and no row is without an id",
  );
  for (const id of BOOKING_TOOL_IDS) {
    assert.ok(isBookingTool(id), `${id} is a tool`);
    assert.notEqual(bookingToolName(id), id, `${id} has a name of its own`);
    assert.ok(BOOKING_TOOL_STEPS[id].steps.length > 0, `${id} has its steps`);
  }
  assert.equal(isBookingTool("outlook"), false);
});

const TZ = "America/New_York";
/** A Tuesday noon in New York, 6 Oct 2026. */
const NOW = Date.parse("2026-10-06T16:00:00Z");

/** A Booksy "new booking" notice as the tool writes it, line for line, with a made-up client. */
const BOOKSY_NEW = [
  " https://booksy.com/biz/en-us/ - \t",
  "Dana Rivera: new booking",
  "",
  "Dana Rivera",
  "",
  "(305) 555-0144",
  "",
  " mailto:dana.rivera@example.com - dana.rivera@example.com",
  "",
  "Thursday, October 8, 2026, 3:00 PM - 5:00 PM",
  "",
  "\tHair Color: Partial highlight",
  "",
  "Varies,",
  "",
  "                        3:00 PM - 5:00 PM",
  "",
  "with",
  "                        Sam Ortiz",
  "",
  "Add-ons:Trim   $20.00",
  "",
  "A note from the customer:",
  "",
  "Layers :)",
  "",
  "Better you. https://refer.booksy.com/systememail - Refer a friend, Get paid",
].join("\n");

test("a tool's own sender is a notice, and so is a filter's forward of it, which keeps the tool's From line", () => {
  assert.deepEqual(
    bookingNoticeOf({
      from: { address: "no-reply@booksy.com" },
      subject: "Dana Rivera: new booking",
      text: BOOKSY_NEW,
    }),
    { tool: "booksy", forwarded: false },
  );
  assert.deepEqual(
    bookingNoticeOf({ from: { address: "No-Reply@Mail.Acuityscheduling.com" }, subject: "New appointment", text: "x" }),
    { tool: "acuity", forwarded: false },
  );
  assert.equal(bookingToolOfAddress("notify@squareup.com"), "square");
  assert.equal(bookingToolOfAddress("someone@notbooksy.com"), null);
  assert.equal(bookingToolName("booksy"), "Booksy");
  assert.equal(bookingToolName("other-tool"), "other-tool");
  assert.equal(bookingToolName(null), null);
});

test("a person's forward by hand is a notice only when its quoted head names the tool as the sender", () => {
  const forwarded = [
    "FYI",
    "",
    "---------- Forwarded message ---------",
    "From: Booksy <no-reply@booksy.com>",
    "Date: Tue, Oct 6, 2026 at 4:09 PM",
    "Subject: Dana Rivera: new booking Thursday, October 8, 2026 3:00 PM",
    "",
    BOOKSY_NEW,
  ].join("\n");
  assert.deepEqual(
    bookingNoticeOf({
      from: { address: "owner@example.com" },
      subject: "Fwd: Dana Rivera: new booking",
      text: forwarded,
    }),
    {
      tool: "booksy",
      forwarded: true,
    },
  );
  // A customer who mentions the tool's site, even in a forward, is a person writing.
  assert.equal(
    bookingNoticeOf({
      from: { address: "ana@example.com" },
      subject: "Fwd: my appointment",
      text: "I found you on booksy.com and booked for Thursday, is that still on?",
    }),
    null,
  );
  // Not a forward at all: a person's email naming the tool in a quoted From line of their own is still not the tool's sender.
  assert.equal(
    bookingNoticeOf({
      from: { address: "ana@example.com" },
      subject: "my appointment",
      text: "From: no-reply@booksy.com",
    }),
    null,
  );
  assert.equal(bookingNoticeOf({ from: null, subject: "Fwd: x", text: "From: no-reply@booksy.com" }), null);
});

test("the shape the model answers names every field, none optional, and the prompt shows the notice with the zone and the day", () => {
  assert.deepEqual(Object.keys(NOTICE_SCHEMA.properties).sort(), [...NOTICE_SCHEMA.required].sort());
  assert.equal(NOTICE_SCHEMA.additionalProperties, false);
  const p = noticePrompt({
    tool: "booksy",
    subject: "Dana Rivera: new booking",
    text: BOOKSY_NEW,
    tz: TZ,
    receivedAtMs: NOW,
  });
  assert.match(p.user, /Booking tool: Booksy\./);
  assert.match(p.user, /Received on 2026-10-06; the business's zone is America\/New_York\./);
  assert.match(p.user, /Hair Color: Partial highlight/);
  assert.match(p.system, /Invent nothing/);
  // An email written to the client about a visit of their own somewhere is not this business's booking: an owner's
  // filter forwards those too (their own appointment at another business, booked on the same tool), and anyone may
  // have a tool write one here.
  assert.match(p.system, /other when it is written TO THE CLIENT about a booking of their own at a business/);
  // The same system words for every notice: one prompt hash on the ledger.
  assert.equal(
    p.system,
    noticePrompt({ tool: "acuity", subject: null, text: "x", tz: "Europe/Madrid", receivedAtMs: 0 }).system,
  );
});

const answer = (over = {}) => ({
  kind: "booked",
  client_name: "Dana Rivera",
  client_phone: "(305) 555-0144",
  client_email: "Dana.Rivera@Example.com",
  service: "Hair Color: Partial highlight",
  staff: "Sam Ortiz",
  starts_at: "2026-10-08T15:00",
  ends_at: "2026-10-08T17:00",
  previous_starts_at: null,
  price: "Varies",
  note: "Layers :)",
  ...over,
});

test("the answer is read strictly: instants in the business's zone, the number and the address in one spelling, the rest trimmed", () => {
  const r = noticeAnswerOf(answer(), TZ, NOW);
  assert.equal(r.hold, null);
  assert.equal(r.reading.kind, "booked");
  // 3 PM in New York in October is 19:00Z.
  assert.equal(new Date(r.reading.start).toISOString(), "2026-10-08T19:00:00.000Z");
  assert.equal(new Date(r.reading.end).toISOString(), "2026-10-08T21:00:00.000Z");
  assert.deepEqual(r.reading.client, { name: "Dana Rivera", phone: "+13055550144", email: "dana.rivera@example.com" });
  assert.equal(r.reading.staff, "Sam Ortiz");
  assert.equal(r.reading.previousStart, null);
});

test("no end is the default length; an end before its start is too; a change keeps the old start; a year off is no time", () => {
  const noEnd = noticeAnswerOf(answer({ ends_at: null }), TZ, NOW).reading;
  assert.equal(noEnd.end - noEnd.start, NOTICE_DEFAULT_LENGTH_MS);
  const backwards = noticeAnswerOf(answer({ ends_at: "2026-10-08T14:00" }), TZ, NOW).reading;
  assert.equal(backwards.end - backwards.start, NOTICE_DEFAULT_LENGTH_MS);
  const moved = noticeAnswerOf(answer({ kind: "changed", previous_starts_at: "2026-10-07T11:00" }), TZ, NOW).reading;
  assert.equal(new Date(moved.previousStart).toISOString(), "2026-10-07T15:00:00.000Z");
  // A previous start is a change's alone.
  assert.equal(noticeAnswerOf(answer({ previous_starts_at: "2026-10-07T11:00" }), TZ, NOW).reading.previousStart, null);
  assert.deepEqual(noticeAnswerOf(answer({ starts_at: "2031-10-08T15:00" }), TZ, NOW), {
    reading: null,
    hold: "no_time",
  });
});

test("REGRESSION: an answer is held to what the table takes and a day lasts -- a number with a leading zero threw the whole notice away, and an end a year off took every open time", () => {
  // The table keeps a number as a plus, no leading zero, seven to fifteen digits (00345's check). A national number
  // written with its zero is read as +0..., which the row refuses: the notice's write threw, and nothing was kept of
  // it. It is no number, and the visit is kept by the name and the address.
  const zero = noticeAnswerOf(answer({ client_phone: "07911 123456" }), TZ, NOW);
  assert.equal(zero.hold, null);
  assert.deepEqual(zero.reading.client, { name: "Dana Rivera", phone: null, email: "dana.rivera@example.com" });
  // With nothing else to name the client, there is no client.
  assert.equal(
    noticeAnswerOf(answer({ client_phone: "07911 123456", client_name: null, client_email: null }), TZ, NOW).hold,
    "no_client",
  );
  // A number the table takes is kept as it was.
  assert.equal(
    noticeAnswerOf(answer({ client_phone: "+44 7700 900123" }), TZ, NOW).reading.client.phone,
    "+447700900123",
  );

  // An end is believed up to half a day. Past it, the visit is the default length: one row a year long would be
  // taken time for every day it spans.
  const hour = 60 * 60 * 1000;
  const long = noticeAnswerOf(answer({ ends_at: "2027-10-08T15:00" }), TZ, NOW).reading;
  assert.equal(long.end - long.start, hour);
  const day = noticeAnswerOf(answer({ starts_at: "2026-10-08T08:00", ends_at: "2026-10-08T20:00" }), TZ, NOW).reading;
  assert.equal(day.end - day.start, 12 * hour, "twelve hours is still a visit");
  const over = noticeAnswerOf(answer({ starts_at: "2026-10-08T08:00", ends_at: "2026-10-08T20:01" }), TZ, NOW).reading;
  assert.equal(over.end - over.start, hour);

  // A day its month does not have is no time, never the month after's.
  assert.equal(noticeAnswerOf(answer({ starts_at: "2026-02-31T15:00" }), TZ, NOW).hold, "no_time");
  assert.equal(noticeAnswerOf(answer({ starts_at: "2026-11-31T15:00" }), TZ, NOW).hold, "no_time");
  assert.equal(noticeAnswerOf(answer({ starts_at: "2026-10-31T15:00" }), TZ, NOW).hold, null);
  // And an end on such a day is no end: the default length.
  const badEnd = noticeAnswerOf(answer({ ends_at: "2026-02-30T17:00" }), TZ, NOW).reading;
  assert.equal(badEnd.end - badEnd.start, hour);
});

test("what is held, and why: not a booking, no time, no client, an answer that is not the shape", () => {
  assert.deepEqual(noticeAnswerOf(answer({ kind: "other" }), TZ, NOW), { reading: null, hold: "not_a_booking" });
  assert.deepEqual(noticeAnswerOf(answer({ kind: "paid" }), TZ, NOW), { reading: null, hold: "unreadable" });
  assert.deepEqual(noticeAnswerOf(answer({ starts_at: "Thursday 3pm" }), TZ, NOW), { reading: null, hold: "no_time" });
  assert.deepEqual(noticeAnswerOf(answer({ starts_at: null }), TZ, NOW), { reading: null, hold: "no_time" });
  assert.deepEqual(noticeAnswerOf(answer({ client_name: " ", client_phone: "x", client_email: "nope" }), TZ, NOW), {
    reading: null,
    hold: "no_client",
  });
  assert.deepEqual(noticeAnswerOf(null, TZ, NOW), { reading: null, hold: "unreadable" });
  assert.deepEqual(noticeAnswerOf("{}", TZ, NOW), { reading: null, hold: "unreadable" });
  assert.deepEqual(noticeAnswerOf([], TZ, NOW), { reading: null, hold: "unreadable" });
});

test("a visit's key is the tool, the client by number else address else folded name, and the start to the minute", () => {
  const start = Date.parse("2026-10-08T19:00:12.000Z");
  const byPhone = appointmentKey(
    "booksy",
    { name: "Dana Rivera", phone: "+13055550144", email: "dana@example.com" },
    start,
  );
  assert.equal(byPhone, `booksy:+13055550144:${Date.parse("2026-10-08T19:00:00.000Z")}`);
  assert.equal(clientKeyOf({ name: "Dana Rivera", phone: null, email: "Dana@Example.com" }), "dana@example.com");
  assert.equal(clientKeyOf({ name: "  Zoë  O'Neil ", phone: null, email: null }), "zoe o neil");
  // The same visit named twice, seconds apart, is one key.
  assert.equal(appointmentKey("booksy", { name: null, phone: "+13055550144", email: null }, start + 20_000), byPhone);
});

const row = (over = {}) => ({
  id: "a1",
  tool: "booksy",
  status: "booked",
  starts_at: "2026-10-08T19:00:00.000Z",
  ends_at: "2026-10-08T21:00:00.000Z",
  all_day: false,
  title: null,
  service: "Hair Color: Partial highlight",
  staff: "Sam Ortiz",
  price: "Varies",
  note: "Layers :)",
  client_name: "Dana Rivera",
  client_phone: "+13055550144",
  client_email: "dana.rivera@example.com",
  contact_id: null,
  ...over,
});

test("a row is drawn with the notice's words, its person by the number or the address, never by name", () => {
  assert.equal(appointmentTitle(row()), "Hair Color: Partial highlight · Dana Rivera");
  assert.equal(appointmentTitle(row({ service: null })), "Dana Rivera");
  assert.equal(appointmentTitle(row({ service: null, client_name: null })), "Booked");
  assert.equal(appointmentTitle(row({ title: "Dana, highlights" })), "Dana, highlights");
  const people = [
    { id: "p1", name: "Dana R.", phone: "+13055550144", email: null, thread: "c1", waInboundAt: null },
    { id: "p2", name: "Dana Rivera", phone: null, email: null },
  ];
  const it = itemOfAppointment(row(), people);
  assert.equal(it.id, "appt:a1");
  assert.deepEqual(it.person, { id: "p1", name: "Dana R.", via: "phone", thread: "c1", wa_inbound_at: null });
  assert.equal(it.source, "notice");
  assert.equal(it.tool, "Booksy");
  assert.deepEqual(it.contacts, { phones: ["+13055550144"], emails: ["dana.rivera@example.com"] });
  // The linked contact first; then the address; a name alone links nobody.
  assert.equal(personOfAppointment(row({ contact_id: "p2" }), people).id, "p2");
  assert.equal(personOfAppointment(row({ client_phone: null, client_email: "x@example.com" }), people), null);
  assert.equal(
    personOfAppointment(row({ client_phone: null }), [
      { id: "p3", name: "", phone: null, email: "dana.rivera@example.com" },
    ]).via,
    "email",
  );
  const feedItem = feedItemOfAppointment(row());
  assert.equal(feedItem.uid, "appt:a1");
  assert.deepEqual(feedItem.attendees, [{ name: "Dana Rivera", email: "dana.rivera@example.com" }]);
});

test("a feed event that is a row's visit is left to the row: same client, a start within fifteen minutes", () => {
  const own = new Set();
  const ev = (title, startIso, over = {}) => ({
    start: Date.parse(startIso),
    end: Date.parse(startIso) + 3_600_000,
    title,
    allDay: false,
    uid: title,
    description: null,
    location: null,
    attendees: [],
    organizer: null,
    ...over,
  });
  const items = [
    ev("Dana 305-555-0144 highlights", "2026-10-08T19:05:00.000Z"),
    ev("Dana 305-555-0144 next week", "2026-10-15T19:00:00.000Z"),
    ev("Someone else", "2026-10-08T19:00:00.000Z"),
    ev("By address", "2026-10-08T18:50:00.000Z", { attendees: [{ name: null, email: "Dana.Rivera@example.com" }] }),
  ];
  const kept = withoutVisitsRowsDraw(items, [row()], own);
  assert.deepEqual(
    kept.map((i) => i.title),
    ["Dana 305-555-0144 next week", "Someone else"],
  );
  assert.equal(withoutVisitsRowsDraw(items, [], own), items);
});
