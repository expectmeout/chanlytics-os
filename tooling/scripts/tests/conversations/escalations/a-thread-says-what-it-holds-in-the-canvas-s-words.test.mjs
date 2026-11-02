/**
 * The thread canvas's words (1 Nov 2026), from contracts: what a hold's dock says at 600 and what it says after its dash,
 * a booking request as its card draws it, a draft's clock, the one fact a thread's head says of the person, the files an
 * email came with, and the slots of a template written for this person. Every one is read from what the thread or the
 * person's row holds; none is made up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const contracts = await import("@chanlytics/contracts");

test("a dock's line is what is owed at 600 and the clause after its dash, and a line with no dash is all lead", () => {
  const { dockLineOf } = contracts;
  assert.deepEqual(dockLineOf("They wrote by email — nothing has been sent"), {
    lead: "They wrote by email",
    rest: "nothing has been sent",
  });
  assert.deepEqual(dockLineOf("Confirm the time — they're waiting to hear"), {
    lead: "Confirm the time",
    rest: "they're waiting to hear",
  });
  assert.deepEqual(dockLineOf("They're owed a call back"), { lead: "They're owed a call back", rest: null });
});

test("a booking request is drawn on the business's clock: its day on a tile, its hours, whether it still holds its time", () => {
  const { bookingRequestCardOf, BOOKING_REQUEST_WORDS } = contracts;
  const tz = "America/New_York";
  // Thursday 6 November 2026, 3 to 4 in the afternoon in New York.
  const r = {
    id: "a1",
    starts_at: "2026-11-06T20:00:00.000Z",
    ends_at: "2026-11-06T21:00:00.000Z",
    service: " Consultation ",
    expires_at: "2026-11-06T19:00:00.000Z",
  };
  const before = Date.parse("2026-11-05T12:00:00.000Z");
  const card = bookingRequestCardOf(r, tz, before);
  assert.deepEqual(
    [card.weekday, card.date, card.dayLong, card.hours, card.service, card.holds],
    ["FRI", "6", "Friday, November 6", "3:00 – 4:00 PM", "Consultation", true],
  );
  assert.equal(card.to, "calendar/2026-11-06:a-a1", "the door opens its day, the request's panel over it");
  assert.equal(bookingRequestCardOf(r, tz, Date.parse("2026-11-06T19:30:00.000Z")).holds, false, "past its hold");
  // Across noon the day's halves are both said.
  const noon = bookingRequestCardOf(
    { ...r, starts_at: "2026-11-06T16:30:00.000Z", ends_at: "2026-11-06T17:30:00.000Z", service: null },
    tz,
    before,
  );
  assert.deepEqual([noon.hours, noon.service], ["11:30 AM – 12:30 PM", null]);
  assert.equal(typeof BOOKING_REQUEST_WORDS.card_foot, "string");
});

test("a request hold carries its card onto the thread, and any other hold none", () => {
  const { toInboxThreadVM } = contracts;
  const now = new Date("2026-11-05T12:00:00.000Z");
  const dto = {
    id: "c3",
    state: "needs_human",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    assignee_is_me: false,
    last_wa_inbound_at: null,
    last_message_at: "2026-11-05T11:40:00.000Z",
    contact: {
      id: "k3",
      display_name: "Priya Nair",
      wa_profile_name: null,
      phone_e164: "+13475550177",
      email: null,
      consent: "opted_in",
      dnc: false,
    },
    messages: [],
  };
  const hold = {
    id: "e3",
    reason: "booking_request",
    details: "Asked for Fri, Nov 6, 3:00 PM",
    state: "open",
    created_at: "2026-11-05T11:41:00.000Z",
    request: {
      id: "a1",
      starts_at: "2026-11-06T20:00:00.000Z",
      ends_at: "2026-11-06T21:00:00.000Z",
      service: null,
      expires_at: "2026-11-06T19:00:00.000Z",
    },
  };
  const vm = toInboxThreadVM(dto, hold, "America/New_York", now);
  assert.equal(vm.request?.hours, "3:00 – 4:00 PM");
  assert.equal(vm.holdLine, "Confirm the time — they're waiting to hear");
  assert.equal(toInboxThreadVM(dto, { ...hold, reason: "human_token" }, "America/New_York", now).request, undefined);
  assert.equal(toInboxThreadVM(dto, { ...hold, request: undefined }, "America/New_York", now).request, undefined);
});

test("a draft's seconds are said as a clock, never below zero", () => {
  const { countdownClock } = contracts;
  assert.deepEqual([42, 90, 600, 0, -3, 41.6].map(countdownClock), ["0:42", "1:30", "10:00", "0:00", "0:00", "0:42"]);
});

test("a thread's head says one fact of the person, in People's own words, and nothing it cannot read", () => {
  const said = (row, word) => contracts.threadHeadFactOf(row, word)?.words ?? null;
  const threadHeadFactOf = said;
  const row = {
    deal: null,
    nextVisitLine: null,
    lastVisitLine: null,
    worksAt: { leadId: "l1", name: "Northwind Media", gone: false },
    standIn: false,
    cameFrom: { key: "website", label: "Website form" },
  };
  assert.equal(threadHeadFactOf(row, "visit"), "Northwind Media");
  assert.equal(
    threadHeadFactOf({ ...row, deal: { brief: "Proposal out · $2,400" } }, "visit"),
    "Proposal out · $2,400",
  );
  assert.equal(
    threadHeadFactOf({ ...row, lastVisitLine: { day: "Sep 12", time: null, state: null } }, "visit"),
    "Last visit Sep 12",
  );
  assert.equal(
    threadHeadFactOf(
      { ...row, lastVisitLine: { day: "Thu", time: "10:00 AM", state: { text: "Kept", tone: "kept" } } },
      "visit",
    ),
    "Visit kept Thu",
  );
  assert.equal(
    threadHeadFactOf(
      { ...row, lastVisitLine: { day: "Thu", time: "10:00 AM", state: { text: "Past", tone: "past" } } },
      "visit",
    ),
    "Last visit Thu",
    "one that has only ended, with nobody's word on it, is the last one",
  );
  assert.equal(
    threadHeadFactOf({ ...row, nextVisitLine: { day: "Thu", time: "10:00 AM", state: null } }, "appointment"),
    "Next appointment Thu 10:00 AM",
  );
  assert.equal(threadHeadFactOf({ ...row, worksAt: null }, "visit"), "Website form");
  assert.equal(threadHeadFactOf({ ...row, worksAt: { ...row.worksAt, gone: true }, cameFrom: null }, "visit"), null);
  // Which fact it is, so a head with a door to the same fact beside it says it once.
  const of = (r) => contracts.threadHeadFactOf(r, "visit")?.of;
  assert.deepEqual(
    [
      of({ ...row, deal: { brief: "Client" } }),
      of({ ...row, nextVisitLine: { day: "Thu", time: null, state: null } }),
      of(row),
      of({ ...row, worksAt: null }),
    ],
    ["deal", "visit", "works", "came"],
  );
});

test("an email's files are counted where only their names were kept, an id's name never printed", () => {
  const { toInboxThreadVM, THREAD_PANE_WORDS } = contracts;
  const now = new Date("2026-11-05T12:00:00.000Z");
  const email = (meta) => ({
    id: "c1",
    state: "open",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    assignee_is_me: false,
    last_wa_inbound_at: null,
    last_message_at: "2026-11-05T10:00:00.000Z",
    contact: {
      id: "k1",
      display_name: "Maya Chen",
      wa_profile_name: null,
      phone_e164: null,
      email: "maya@example.com",
      consent: "unknown",
      dnc: false,
    },
    messages: [
      {
        id: "m1",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "Hi, see the attached.",
        media: null,
        meta,
        status: "received",
        channel: "email",
        created_at: "2026-11-05T10:00:00.000Z",
        channel_ts: "2026-11-05T10:00:00.000Z",
      },
    ],
  });
  const entryOf = (meta) =>
    toInboxThreadVM(email(meta), null, "America/New_York", now).timeline.find((e) => e.type === "msg");
  const kept = entryOf({
    email: {
      subject: "Plans",
      attachments: [{ filename: "055004a9-a643-4d83-85b2-87c72e848c96" }, { filename: "floor plan.pdf" }],
      more_attachments: 1,
    },
  });
  assert.equal(kept.filesLeft, 3);
  assert.doesNotMatch(kept.leftOut, /055004a9/, "an id's name is counted, never printed");
  assert.equal(entryOf({ email: { subject: "Plans" } }).filesLeft, undefined, "none, where none came");
  assert.deepEqual([1, 3].map(THREAD_PANE_WORDS.filesNotKept), ["1 file not kept", "3 files not kept"]);
});
