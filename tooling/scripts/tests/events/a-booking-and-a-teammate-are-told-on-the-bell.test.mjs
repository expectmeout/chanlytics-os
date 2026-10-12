/**
 * A booking that arrived and a teammate who joined are told once on the bell, from their events (the wiring plan's task 2.4;
 * S1-01 and S1-19; 00410). The pure halves run here: which event is a booking arriving (contracts bookingArriving), how a
 * visit or the visits of one calendar read are worded and where they open (visitNews, visitRoute), how a seat is worded
 * (memberJoinedNotice), and the two kinds' places in the tables that say what the bell, the mail and the phone carry. The
 * subscribers that tell them, over a database in memory, are run in an-event-is-delivered-to-its-subscriber.test.mjs; the
 * read that takes the seat, in workspace/team-audit-and-invites.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_TOPICS,
  BELL_LINE_KINDS,
  CATCH_UP_VISITS,
  EMAILED_NOTIFICATION_KINDS,
  EVENT_SUBSCRIBERS,
  PUSH_KINDS,
  SERVER_NOTIFICATION_KINDS,
  bookingArriving,
  emailsFor,
  isPushKind,
  kindListDoor,
  memberJoinedBy,
  memberJoinedNotice,
  noticeRoute,
  serverNotificationRows,
  visitNews,
} from "@chanlytics/contracts";

const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const INVITATION = "1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b";
/** A moment well before the visits below, so none of them is "Today" or "Tomorrow". */
const NOW = Date.parse("2999-10-01T12:00:00Z");

const event = (over = {}) => ({
  kind: "appointment.changed",
  subject_type: "appointment",
  subject_id: APPT,
  data: { change: "added", source: "booking_email", starts_at: "2999-10-12T15:00:00Z" },
  ...over,
});

test("a booking arriving is a visit added or a hold confirmed, by a booking tool or the owner's calendar, and nothing else", () => {
  assert.deepEqual(bookingArriving(event()), {
    appointmentId: APPT,
    via: "booking_email",
    startsAt: "2999-10-12T15:00:00Z",
  });
  assert.equal(bookingArriving(event({ data: { change: "confirmed", source: "booking_tool" } }))?.via, "booking_tool");
  assert.equal(
    bookingArriving(event({ data: { change: "added", source: "calendar_feed", starts_at: "2999-10-12T15:00:00Z" } }))
      ?.via,
    "calendar_feed",
  );
  assert.equal(
    bookingArriving(event({ data: { change: "added", source: "booking_email" } }))?.startsAt,
    null,
    "a start the event does not say is none",
  );

  for (const data of [
    { change: "moved", source: "booking_email" },
    { change: "cancelled", source: "booking_email" },
    { change: "vanished", source: "calendar_feed" },
    { change: "back", source: "calendar_feed" },
    { change: "moved", source: "calendar_feed" },
    // The feed adds visits and never confirms one.
    { change: "confirmed", source: "calendar_feed" },
    // A member's own entry is the owner's, not news.
    { change: "added", source: "person" },
    { change: "added", source: "constructor" },
    { change: "added" },
    { source: "booking_email" },
    "added",
    ["added"],
    null,
    undefined,
  ]) {
    assert.equal(bookingArriving(event({ data })), null, JSON.stringify(data));
  }
  assert.equal(bookingArriving(event({ kind: "appointment.booked" })), null);
  assert.equal(bookingArriving(event({ subject_type: "contact" })), null);
  assert.equal(bookingArriving(event({ subject_id: null })), null);
});

const visit = (over = {}) => ({
  id: APPT,
  start: "2999-10-12T15:00:00Z",
  end: "2999-10-12T16:00:00Z",
  allDay: false,
  timezone: "America/New_York",
  who: "Rosa Diaz",
  service: "Gel manicure",
  via: "booking_email",
  ...over,
});

test("one visit is told in its own words and opens on its day, by the visit's zone: who, when, what for, and how it came", () => {
  const n = visitNews([visit()], NOW);
  assert.deepEqual(
    [n.kind, n.route, n.about],
    ["booking", `calendar/2999-10-12:a-${APPT}`, { type: "appointment", id: APPT }],
  );
  assert.equal(n.subject, "Rosa Diaz booked with you");
  // (\s: the clock's space before AM and PM is a plain space or a narrow one, by the ICU the runtime carries.)
  assert.match(n.body, /^\w{3}, Oct 12 · 11:00\sAM – 12:00\sPM\nGel manicure\n\nFrom your booking tool's email$/);
  assert.equal(n.redactedBody, "A booking arrived, and nobody could be told.");

  // The day is the business's: 03:00 UTC the 13th is still the evening of the 12th in New York.
  const late = visitNews([visit({ start: "2999-10-13T03:00:00Z", end: "2999-10-13T04:00:00Z" })], NOW);
  assert.equal(late.route, `calendar/2999-10-12:a-${APPT}`);

  // Nobody named, nothing said of the service, and an all-day visit.
  const bare = visitNews([visit({ who: null, service: null, allDay: true, via: "calendar_feed" })], NOW);
  assert.equal(bare.subject, "Someone booked with you");
  assert.match(bare.body, /^\w{3}, Oct 12 · all day\n\nFrom your calendar$/);
  assert.equal(
    visitNews([visit({ via: "booking_tool" })], NOW)
      .body.split("\n")
      .at(-1),
    "From your booking tool",
  );
});

test("several visits one read of the calendar added are one line: the earliest opens, three are named, the rest counted", () => {
  const many = ["14", "12", "15", "13", "16"].map((day, i) =>
    visit({
      id: `a${i}000000-0000-4000-8000-000000000000`,
      start: `2999-10-${day}T15:00:00Z`,
      end: `2999-10-${day}T16:00:00Z`,
      who: null,
      service: day === "12" ? "Consultation" : null,
      via: "calendar_feed",
    }),
  );
  const n = visitNews(many, NOW);
  assert.equal(n.subject, "5 new bookings on your calendar");
  assert.equal(n.about, null);
  assert.equal(
    n.route,
    "calendar/2999-10-12:a-a1000000-0000-4000-8000-000000000000",
    "the earliest, whatever the order given",
  );
  const lines = n.body.split("\n");
  assert.deepEqual(lines.length, 6);
  assert.match(lines[0], /^Someone · \w{3}, Oct 12 · 11:00\sAM – 12:00\sPM · Consultation$/);
  assert.match(lines[1], /Oct 13/);
  assert.match(lines[2], /Oct 14/);
  assert.deepEqual(lines.slice(3), ["and 2 more", "", "From your calendar"]);
  assert.equal(n.redactedBody, "New bookings arrived on a calendar, and nobody could be told.");

  const two = visitNews(many.slice(0, 2), NOW);
  assert.equal(two.subject, "2 new bookings on your calendar");
  assert.ok(!two.body.includes("more"), "nothing to count when all are named");
  assert.throws(() => visitNews([], NOW), /nothing booked to tell/);
});

test("a calendar read that adds more than a customer could book in an hour is a number the notice is told apart by", () => {
  assert.equal(typeof CATCH_UP_VISITS, "number");
  assert.ok(CATCH_UP_VISITS >= 3, "a group names three visits, so the limit must let a group be");
});

/* ------------------------------------------------------------------------------------ a teammate who joined */

test("a teammate who joined is worded in the invitation's address and the role it seated, and opens Settings > Team", () => {
  assert.equal(
    memberJoinedBy({ kind: "member.joined", subject_type: "invitation", subject_id: INVITATION }),
    INVITATION,
  );
  for (const other of [
    { kind: "member.left", subject_type: "workspace", subject_id: INVITATION },
    { kind: "member.joined", subject_type: "membership", subject_id: INVITATION },
    { kind: "member.joined", subject_type: "invitation", subject_id: null },
    { kind: "contact.added", subject_type: "invitation", subject_id: INVITATION },
  ]) {
    assert.equal(memberJoinedBy(other), null, JSON.stringify(other));
  }

  const n = memberJoinedNotice({ invitationId: INVITATION, email: "ada@example.com", role: "operator" });
  assert.deepEqual([n.kind, n.route, n.about], ["member_joined", "admin/team", { type: "invitation", id: INVITATION }]);
  assert.equal(n.subject, "ada@example.com joined your team");
  assert.equal(
    n.body,
    "They accepted your invitation and joined as Operator.\nTheir role can be changed, or the seat removed, under Settings > Team.",
  );
  assert.equal(n.redactedBody, "A teammate joined a workspace, and nobody could be told.");
  assert.match(
    memberJoinedNotice({ invitationId: INVITATION, email: "v@example.com", role: "viewer" }).body,
    /as Viewer\./,
  );
  assert.match(
    memberJoinedNotice({ invitationId: INVITATION, email: "x@example.com", role: "someone" }).body,
    /as someone\./,
    "a role this build has no word for is said as it is",
  );
});

/* -------------------------------------------------------------------------------- the kinds, in their tables */

test("both are lines on the bell and no more: no mail, no phone, said once under the page's table, not a warning", () => {
  for (const kind of ["booking", "member_joined"]) {
    assert.ok(SERVER_NOTIFICATION_KINDS.includes(kind), kind);
    assert.equal(EMAILED_NOTIFICATION_KINDS.includes(kind), false, `${kind}: not emailed`);
    assert.equal(emailsFor({ email_off: [] }, kind), false, `${kind}: no business is mailed it`);
    assert.equal(isPushKind(kind), false, `${kind}: no phone is told`);
    assert.ok(!PUSH_KINDS.includes(kind));
    assert.ok(BELL_LINE_KINDS.includes(kind), `${kind}: the bell's own line`);
    assert.equal(
      ALERT_TOPICS.filter((t) => t.kinds.includes(kind)).length,
      0,
      `${kind}: nothing to choose, so no tick`,
    );
  }
  assert.deepEqual(
    [...BELL_LINE_KINDS].filter((k) => !SERVER_NOTIFICATION_KINDS.includes(k)),
    [],
    "and every line the bell keeps is a kind it keeps",
  );
});

test("on the bell they open where their row says, else their list door, with a verb that names the page; good news, not a warning", () => {
  const row = (kind, route) => ({
    id: "11111111-1111-4111-8111-111111111111",
    kind,
    title: "A title",
    body: "A body",
    route,
    subject_type: null,
    subject_id: null,
    created_at: "2999-10-01T10:00:00.000Z",
    read: false,
    dismissed: false,
  });
  const visitRoute = `calendar/2999-10-12:a-${APPT}`;
  const [booked] = serverNotificationRows({ notifications: [row("booking", visitRoute)], seen_at: null });
  assert.deepEqual(
    [booked.kind, booked.to, booked.action, booked.icon, booked.tone],
    ["booking", visitRoute, "Open Calendar", "calendar", "ok"],
  );
  const [joined] = serverNotificationRows({ notifications: [row("member_joined", "admin/team")], seen_at: null });
  assert.deepEqual(
    [joined.kind, joined.to, joined.action, joined.icon, joined.tone],
    ["member_joined", "admin/team", "Open Team", "users", "ok"],
  );
  assert.equal(noticeRoute("booking", null), "calendar");
  assert.equal(noticeRoute("member_joined", null), "admin/team");
  assert.deepEqual(kindListDoor("booking"), { to: "calendar", action: "Open Calendar" });
  assert.deepEqual(kindListDoor("member_joined"), { to: "admin/team", action: "Open Team" });
});

test("the build knows both subscribers (00410 subscribes the two events to them in the background lane; the kinds' CHECK is held to contracts by the schema sets' type test)", () => {
  assert.ok(EVENT_SUBSCRIBERS.includes("visit_notice") && EVENT_SUBSCRIBERS.includes("team_notice"));
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("booking") && SERVER_NOTIFICATION_KINDS.includes("member_joined"));
});
