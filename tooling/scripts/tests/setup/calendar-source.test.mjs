/**
 * What the calendar is fed by, said once (packages/contracts/src/setup/calendar-source.ts): the one answer Setup,
 * Connections, the Calendar page, Ask and the Business row read, and the words of the Booking tool fold.
 *
 * Each of those worked it out for itself until 7 Oct 2026, most from the calendar link alone, so a business whose
 * bookings arrive by email was told "Not connected" and "Paste the address" on four pages. These run the rule over
 * every state a workspace can be in and hold the two rows to it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const {
  CALENDAR_SETTING_ROUTE,
  BOOKING_TOOL_WORDS,
  BOOKS_BY_HAND,
  BOOKS_WITH_CALENDAR,
  bookingEmailsHeldWords,
  bookingEmailsStep,
  booksWithName,
  booksWithOf,
  booksWithOptions,
  calendarLinkNote,
  calendarLinkShown,
  calendarSourceFacts,
  calendarSourceOf,
  forwardStillAsked,
} = await importSrc("packages/contracts/src/setup/calendar-source.ts");
const { BOOKING_TOOL_IDS, bookingToolCalendar } = await importSrc("packages/contracts/src/calendar/booking-notice.ts");
const { BOOKING_PLATFORM_TOOLS, bookingToolOfLink } = await importSrc("packages/contracts/src/google/booking-page.ts");
const { connectionRows } = await importSrc("packages/contracts/src/setup/connections.ts");
const { TenantConfigSchema, TenantConfigWriteSchema } = await importSrc(
  "packages/contracts/src/config/workspace-config/config-schema.ts",
);

/** Emails that work: an address, nothing waiting, one arrived two hours ago. */
const WORKING = { address: true, forwarding: false, lastAt: "2026-10-07T14:00:00.000Z", held: 0 };
const facts = (over = {}) => ({ link: "none", tool: null, byHand: false, emails: null, bookingLink: true, ...over });

test("nothing said yet: not connected, and the next press is the Business row that connects it", () => {
  const s = calendarSourceOf(facts());
  assert.equal(s.by, "nothing");
  assert.equal(s.state, "none");
  assert.equal(s.words, "Not connected");
  assert.equal(s.lead, "No calendar connected.");
  assert.equal(s.sentence, `${s.lead} ${s.rest}`);
  assert.equal(s.times, false);
  assert.deepEqual(s.next, { label: "Connect your calendar", to: CALENDAR_SETTING_ROUTE });
  assert.equal(CALENDAR_SETTING_ROUTE, "admin/workspace/calendar");
});

test("REGRESSION: bookings that arrive by email are a calendar that works, never one to connect", () => {
  // The row read the link alone: this business was told "Not connected" and "Paste the address", for good.
  const s = calendarSourceOf(facts({ tool: "booksy", emails: WORKING }));
  assert.equal(s.by, "emails");
  assert.equal(s.state, "ready");
  assert.equal(s.tone, "ok");
  assert.equal(s.words, "By email");
  assert.equal(s.lead, "Bookings arrive by email from Booksy.");
  // And it says what does not follow from emails: open times are read from a link alone.
  assert.equal(s.rest, "The receptionist sends your booking link instead of naming open times.");
  assert.equal(s.times, false);
  assert.deepEqual(s.next, { label: "Open Calendar", to: "calendar" });
  // With no booking link to send, it does not say it sends one.
  assert.equal(
    calendarSourceOf(facts({ tool: "booksy", emails: WORKING, bookingLink: false })).rest,
    "The receptionist does not name open times.",
  );
});

test("a named tool's emails say the next thing to do, first: an address, a forward, emails to look at, the first email", () => {
  const of = (emails) => calendarSourceOf(facts({ tool: "booksy", emails: { ...WORKING, lastAt: null, ...emails } }));
  const noAddress = of({ address: false });
  assert.equal(noAddress.state, "needs_you");
  assert.equal(noAddress.sentence, "Booksy needs an address to send its booking emails to.");
  assert.equal(noAddress.next.label, "Finish setting up");
  const forward = of({ forwarding: true });
  assert.equal(forward.state, "needs_you");
  assert.equal(forward.sentence, "Gmail is waiting for you to confirm the forward.");
  // Held before any became an appointment is still setting up; held after is a thing that works asking for a look.
  const heldFirst = of({ held: 1 });
  assert.equal(heldFirst.state, "needs_you");
  assert.equal(heldFirst.sentence, "One booking email needs a look.");
  assert.equal(heldFirst.next.label, "Look at it");
  const heldLater = calendarSourceOf(facts({ tool: "booksy", emails: { ...WORKING, held: 2 } }));
  assert.equal(heldLater.state, "attention");
  assert.equal(heldLater.words, "2 to look at");
  assert.equal(heldLater.sentence, "2 booking emails need a look.");
  assert.equal(heldLater.next.label, "Look at them");
  const waiting = of({});
  assert.equal(waiting.state, "waiting");
  assert.equal(waiting.tone, "plain");
  assert.equal(waiting.sentence, "Waiting for the first booking email from Booksy.");
  assert.equal(waiting.next.label, "See the steps");
  // Every one of them opens the one row.
  for (const s of [noAddress, forward, heldFirst, heldLater, waiting]) assert.equal(s.next.to, CALENDAR_SETTING_ROUTE);
  // The order, as the Business row's phrase asks it too.
  assert.equal(bookingEmailsStep({ address: false, forwarding: true, lastAt: null, held: 3 }), "address");
  assert.equal(bookingEmailsStep({ address: true, forwarding: true, lastAt: null, held: 3 }), "forwarding");
  assert.equal(
    bookingEmailsStep({ address: true, forwarding: false, lastAt: "2026-10-07T14:00:00Z", held: 3 }),
    "held",
  );
  assert.equal(bookingEmailsStep({ address: true, forwarding: false, lastAt: null, held: 0 }), "waiting");
  assert.equal(bookingEmailsStep(WORKING), "working");
});

test("a calendar link that reads is what offers open times, with what the tool's emails add beside it", () => {
  const link = calendarSourceOf(facts({ link: "ok" }));
  assert.equal(link.by, "link");
  assert.equal(link.state, "ready");
  assert.equal(link.words, "Readable");
  assert.equal(link.sentence, "The receptionist offers open times from it.");
  assert.equal(link.times, true);
  const both = calendarSourceOf(facts({ link: "ok", tool: "square", emails: WORKING }));
  assert.equal(both.by, "both");
  assert.equal(
    both.sentence,
    "The receptionist offers open times from it. Booking emails from Square add the client and the service.",
  );
  // REGRESSION: a read that could not be refreshed was said "Readable" to Setup and Connections.
  const stale = calendarSourceOf(facts({ link: "stale" }));
  assert.equal(stale.words, "Last good read");
  assert.equal(stale.state, "ready");
  // The emails' own asks still come first beside a link that reads: they are the owner's to do.
  const held = calendarSourceOf(facts({ link: "ok", tool: "square", emails: { ...WORKING, held: 1 } }));
  assert.equal(held.state, "attention");
  assert.equal(held.times, true);
});

test("a link that could not be read is the owner's to check, whatever else arrives", () => {
  const s = calendarSourceOf(
    facts({ link: "unavailable", problem: "The address answered with an error.", tool: "square", emails: WORKING }),
  );
  assert.equal(s.state, "attention");
  assert.equal(s.tone, "warn");
  assert.equal(s.words, "Could not be read");
  assert.equal(s.lead, "Your calendar could not be read.");
  assert.equal(s.rest, "The address answered with an error. Booking emails still arrive.");
  assert.equal(s.times, false);
  assert.deepEqual(s.next, { label: "Check the link", to: CALENDAR_SETTING_ROUTE });
});

test("a business that books by hand said so, and is offered nothing to connect", () => {
  const s = calendarSourceOf(facts({ byHand: true }));
  assert.equal(s.by, "hand");
  assert.equal(s.state, "hand");
  assert.equal(s.words, "Booked by hand");
  assert.equal(s.lead, "You take bookings yourself, so there is nothing to connect.");
  assert.deepEqual(s.next, { label: "Change", to: CALENDAR_SETTING_ROUTE });
  // A link that reads outranks the word: a calendar that is read is what every page says.
  assert.equal(calendarSourceOf(facts({ byHand: true, link: "ok" })).by, "link");
});

test("a reader that holds only the settings is told the tool is named, and no more", () => {
  // Ask's facts read the stored config, never the emails' health.
  const s = calendarSourceOf(facts({ tool: "booksy" }));
  assert.equal(s.by, "emails");
  assert.equal(s.state, "ready");
  assert.equal(s.lead, "Bookings arrive by email from Booksy.");
});

test("a wire shape is read into the rule's own facts, and an older one says what the link alone says", () => {
  assert.deepEqual(calendarSourceFacts({ state: "ok", stale: true }), {
    link: "stale",
    problem: null,
    tool: null,
    byHand: false,
    emails: null,
    bookingLink: false,
  });
  assert.deepEqual(
    calendarSourceFacts({
      state: "none",
      tool: "booksy",
      by_hand: false,
      emails: { address: true, forwarding: false, last_at: "2026-10-07T14:00:00.000Z", held: 2 },
      booking_link: true,
    }),
    { link: "none", problem: null, tool: "booksy", byHand: false, emails: { ...WORKING, held: 2 }, bookingLink: true },
  );
});

test("Gmail's confirmation of a forward is asked for three days, and no longer", () => {
  const now = new Date("2026-10-07T16:00:00.000Z");
  assert.equal(forwardStillAsked("2026-10-06T16:00:00.000Z", now), true);
  assert.equal(forwardStillAsked("2026-10-04T15:59:00.000Z", now), false);
  assert.equal(forwardStillAsked(null, now), false);
});

test("Connections' row is the one answer: its state, its words, its sentence and its door", () => {
  const row = (calendar) =>
    connectionRows({
      channels: [],
      whatsapp: null,
      lines: { rows: [], ready: false },
      lineRequestedAt: null,
      google: null,
      calendar,
    }).find((r) => r.kind === "calendar");
  const none = row({ state: "none" });
  assert.equal(none.state, "none");
  assert.equal(none.stateWords, "Not connected");
  assert.deepEqual(none.verb, { label: "Connect your calendar", to: CALENDAR_SETTING_ROUTE, who: "owner" });
  // REGRESSION: emails working read "Not connected · Paste the address" here.
  const emails = row({
    state: "none",
    tool: "booksy",
    emails: { address: true, forwarding: false, last_at: "2026-10-07T14:00:00.000Z", held: 0 },
    booking_link: true,
  });
  assert.equal(emails.state, "connected");
  assert.equal(emails.group, "connected");
  assert.equal(emails.detail, "Booksy");
  assert.equal(emails.stateWords, "By email");
  assert.deepEqual(emails.verb, { label: "Open Calendar", to: "calendar", who: "operator" });
  const both = row({
    state: "ok",
    tool: "square",
    emails: { address: true, forwarding: false, last_at: "2026-10-07T14:00:00.000Z", held: 0 },
  });
  assert.equal(both.detail, "Square · calendar link");
  assert.equal(both.stateWords, "Readable");
  const broken = row({ state: "unavailable" });
  assert.equal(broken.state, "attention");
  assert.deepEqual(broken.verb, { label: "Check the link", to: CALENDAR_SETTING_ROUTE, who: "owner" });
  const hand = row({ state: "none", by_hand: true });
  assert.equal(hand.state, "none");
  // Its own word is the row's state, said once: beside the name too, the row read "Booked by hand" twice.
  assert.deepEqual([hand.detail, hand.stateWords], [null, "Booked by hand"]);
  assert.deepEqual(hand.verb, { label: "Change", to: CALENDAR_SETTING_ROUTE, who: "owner" });
  // A read from before any of it (no calendar at all) is still a row, not connected.
  assert.equal(row(null).stateWords, "Not connected");
});

test("what the owner books with: the picker's choices, what the stored settings say, and the row's name for each", () => {
  const options = booksWithOptions().map((o) => o.value);
  assert.deepEqual(options, [...BOOKING_TOOL_IDS, BOOKS_WITH_CALENDAR, BOOKS_BY_HAND]);
  assert.equal(booksWithOf({ tool: "booksy", ical_url: "https://calendar.example.com/a.ics" }), "booksy");
  assert.equal(booksWithOf({ ical_url: "https://calendar.example.com/a.ics", by_hand: true }), BOOKS_WITH_CALENDAR);
  assert.equal(booksWithOf({ by_hand: true }), BOOKS_BY_HAND);
  assert.equal(booksWithOf({}), "");
  assert.equal(booksWithName("booksy"), "Booksy");
  assert.equal(booksWithName(BOOKS_WITH_CALENDAR), "Calendar link");
  assert.equal(booksWithName(BOOKS_BY_HAND), "Booked by hand");
  assert.equal(booksWithName(""), null);
});

test("the fold draws the calendar link's box only where the answer has a link to give, and hides one it holds only under 'by hand', which takes it away", () => {
  assert.equal(calendarLinkShown("", false), "hidden");
  assert.equal(calendarLinkShown(BOOKS_BY_HAND, false), "hidden");
  assert.equal(calendarLinkShown(BOOKS_WITH_CALENDAR, false), "shown");
  // A tool known to give no calendar keeps the box behind one press: an owner may still keep a calendar of their own.
  assert.equal(bookingToolCalendar("booksy"), "none");
  assert.equal(calendarLinkShown("booksy", false), "offered");
  assert.equal(calendarLinkShown("square", false), "shown");
  // A tool not verified is asked, never told.
  assert.equal(bookingToolCalendar("setmore"), null);
  assert.equal(calendarLinkShown("setmore", false), "shown");
  // A link typed or stored is on screen under every answer but one. "By hand" is the owner's word that nothing is
  // read: it has no box, and saving it takes the link away, which the fold says first. It kept the box and the link,
  // and a link outranks the word on the next read: the owner said "by hand", saved, and was told "Calendar link".
  for (const w of ["", BOOKS_WITH_CALENDAR, "booksy", "square"]) assert.equal(calendarLinkShown(w, true), "shown");
  assert.equal(calendarLinkShown(BOOKS_BY_HAND, true), "hidden");
  assert.equal(BOOKING_TOOL_WORDS.link.goes, "Saving this removes your calendar link.");
  // The emails held for a look, counted in one sentence: the status's lead and the fold's line over its list.
  assert.equal(bookingEmailsHeldWords(1), "One booking email needs a look.");
  assert.equal(bookingEmailsHeldWords(3), "3 booking emails need a look.");
  assert.equal(
    calendarSourceOf(facts({ tool: "booksy", emails: { ...WORKING, held: 3 } })).lead,
    bookingEmailsHeldWords(3),
  );
  assert.equal(
    calendarLinkNote("booksy", true),
    "Booksy offers no calendar link. The receptionist sends your booking link instead of naming open times.",
  );
  assert.match(calendarLinkNote("square", true), /^Square writes your bookings into your own calendar\./);
  assert.match(calendarLinkNote("acuity", true), /^Acuity offers a calendar link of its own\./);
  assert.match(calendarLinkNote("setmore", true), /^If Setmore offers a calendar link/);
  assert.match(
    calendarLinkNote(BOOKS_BY_HAND, false),
    /^Nothing to connect\. The receptionist does not name open times\.$/,
  );
  assert.equal(calendarLinkNote("", true), "");
});

test("a booking link names its tool, and every tool the product reads has a platform that names it", () => {
  assert.equal(bookingToolOfLink("https://booksy.com/en-us/000_bright-studio"), "booksy");
  assert.equal(bookingToolOfLink("https://brightstudio.as.me/"), "acuity");
  assert.equal(bookingToolOfLink("book.squareup.com/appointments/abc"), "square");
  assert.equal(bookingToolOfLink("https://www.vagaro.com/brightstudio"), "vagaro");
  // A platform whose emails are not read names no tool; neither does the business's own site, or nothing.
  assert.equal(bookingToolOfLink("https://brightstudio.youcanbook.me"), null);
  assert.equal(bookingToolOfLink("https://brightstudio.example.com/book"), null);
  assert.equal(bookingToolOfLink(""), null);
  assert.equal(bookingToolOfLink("not an address"), null);
  // The two lists are declared apart: a tool added to one and not the other would never be offered by name.
  for (const id of BOOKING_TOOL_IDS) assert.ok(BOOKING_PLATFORM_TOOLS.includes(id), `${id} is named by a platform`);
});

test("REGRESSION: a booking tool this build does not know is read, and refused only on the way in", () => {
  // The read held the tool to the list's own enum: the first build to offer a thirteenth tool would have stored a word
  // the build beside it could not parse, and a config that does not parse is a receptionist that says nothing.
  const read = TenantConfigSchema.safeParse({ bookings: { tool: "a-tool-from-a-later-build", by_hand: true } });
  assert.equal(read.success, true);
  assert.equal(read.data.bookings.tool, "a-tool-from-a-later-build");
  assert.equal(read.data.bookings.by_hand, true);
  const typo = TenantConfigWriteSchema.safeParse({ bookings: { tool: "booksie" } });
  assert.equal(typo.success, false);
  assert.deepEqual(typo.error.issues[0].path, ["bookings", "tool"]);
  assert.equal(TenantConfigWriteSchema.safeParse({ bookings: { tool: "booksy" } }).success, true);
  assert.equal(TenantConfigWriteSchema.safeParse({ bookings: { by_hand: true } }).success, true);
});
