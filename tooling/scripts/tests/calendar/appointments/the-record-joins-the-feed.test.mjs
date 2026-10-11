/**
 * The record joins the feed (decision 0002's readers): People, Reports and the playbooks read a person's visits from
 * the feed with the appointments record laid on it (contracts feedWithRecord, through peopleVisitsOf, which the
 * dashboard's pool and the edge's run both call). A booking a notice states is the notice's, its copy in the feed left
 * out; a cancelled visit is none, whoever cancelled it; a request is no visit yet; and a visit a member said missed is
 * none of their visits (not the next, not the last, no day a moment keys on) but the one a list's missed_visit reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feedWithRecord,
  feedMarksOf,
  bookedAfterAsk,
  appointmentHolds,
  recordKeyOf,
  peopleVisitsOf,
  indexFeed,
  visitsIn,
  allVisitsIn,
  toPersonRowVM,
  listRuleMatches,
  listFactWords,
  asListRule,
} from "@chanlytics/contracts";
import { appointmentStates, recordOver } from "@chanlytics/db";
import { fakeDb } from "../../_fake-db.mjs";

const H = 3_600_000;
const D = 24 * H;
const NOW = Date.parse("2026-10-11T15:00:00Z");
const TZ = "America/New_York";
const NO_OWN = new Set();

/** A calendar event naming a client by their number. */
const event = (uid, start, phone, title = "Colour") => ({
  uid,
  start,
  end: start + H,
  title,
  allDay: false,
  description: phone,
  location: null,
  attendees: [],
  organizer: null,
});
/** A booking a tool's notice stated. */
const booking = (id, start, status, phone, over = {}) => ({
  id,
  tool: "booksy",
  status,
  starts_at: new Date(start).toISOString(),
  ends_at: new Date(start + H).toISOString(),
  all_day: false,
  title: null,
  service: "Balayage",
  staff: null,
  price: null,
  note: null,
  client_name: "Ana Ruiz",
  client_phone: phone,
  client_email: null,
  contact_id: null,
  ...over,
});
const ANA = "+13055550111";
const BEA = "+13055550122";
const CAL = "+13055550133";

test("the record joins the feed: a notice's booking is the notice's, a cancelled visit and a request are none, and a member's missed rides on its event", () => {
  const items = [
    event("a", NOW + 2 * D, ANA), // the calendar's copy of Ana's emailed booking
    event("b", NOW + 3 * D, BEA), // marked cancelled by a member
    event("c", NOW - 2 * D, CAL), // marked missed by a member
  ];
  const record = {
    noted: [
      booking("b1", NOW + 2 * D, "booked", ANA),
      booking("b2", NOW + 5 * D, "proposed", ANA),
      booking("b3", NOW + 6 * D, "cancelled", ANA),
    ],
    marks: feedMarksOf([
      { id: "fb", status: "cancelled", external_id: "b", starts_at: new Date(NOW + 3 * D).toISOString() },
      { id: "fc", status: "missed", external_id: "c", starts_at: new Date(NOW - 2 * D).toISOString() },
    ]),
  };
  const joined = feedWithRecord(items, record, NO_OWN);
  assert.deepEqual(
    joined.map((it) => [it.uid, it.said ?? null]),
    [
      ["c", "missed"],
      ["appt:b1", null],
    ],
    "Ana's visit once, from the notice; Bea's cancelled one gone; a request and a cancelled booking are no visits",
  );
  assert.equal(joined[1].title, "Balayage · Ana Ruiz", "the notice's words");
  assert.deepEqual(feedWithRecord(items, null, NO_OWN), items, "no record: the feed as it is");
});

test("a visit said missed is none of their visits but the one a win-back reads: not next, not last, not near", () => {
  const items = [
    event("kept", NOW - 20 * D, CAL),
    { ...event("missed", NOW - 3 * D, CAL), said: "missed" },
    { ...event("now", NOW - 0.5 * H, CAL), said: "missed" },
  ];
  const v = visitsIn(indexFeed(items, NO_OWN), { id: "p", name: "", phone: CAL, email: null }, NOW);
  assert.equal(v.last?.id, `kept:${NOW - 20 * D}`, "the last visit they came to, as far as anyone said");
  assert.equal(v.next, null, "a visit under way said missed is not the next");
  assert.deepEqual(v.near, [], "no day a moment keys on");
  assert.equal(v.missed?.id, `now:${NOW - 0.5 * H}`, "the latest they missed");
  assert.equal(
    allVisitsIn(indexFeed(items, NO_OWN), { id: "p", name: "", phone: CAL, email: null }).length,
    3,
    "the timeline holds them all, each with its word",
  );
});

test("a list reads missed_visit as it reads the last visit: in the last N days, more than N ago, ever, never", () => {
  const rows = [
    { id: "p1", display_name: "Cal", wa_profile_name: null, phone_e164: CAL, email: null },
    { id: "p2", display_name: "Bea", wa_profile_name: null, phone_e164: BEA, email: null },
  ];
  const visits = peopleVisitsOf(
    [{ ...event("m", NOW - 3 * D, CAL), said: "missed" }, event("b", NOW - 10 * D, BEA)],
    rows,
    { timezone: TZ, source: "calendar", own: NO_OWN, services: [], rules: null },
    NOW,
  );
  assert.ok(visits.get("p1").missed, "Cal missed one");
  assert.equal(visits.get("p2").missed, null);
  const vm = (p) =>
    toPersonRowVM(
      {
        ...p,
        consent: "unknown",
        marketing_consent: "unknown",
        dnc: false,
        channels: [],
        conversation_count: 0,
        escalation_count: 0,
        needs_human: false,
        has_chat: false,
        last_inbound_at: new Date(NOW - 5 * D).toISOString(),
        visits: visits.get(p.id),
      },
      TZ,
      new Date(NOW),
      null,
      null,
    );
  const [cal, bea] = rows.map(vm);
  assert.deepEqual([cal.missedVisitDays, bea.missedVisitDays], [3, null]);
  assert.equal(cal.lastVisitDays, null, "a no-show is no last visit");
  // But they booked: a visit they missed answers their ask, so a no-show is not "Asked, never booked", a list a
  // follow-up may run on (missed reaches no customer by itself, 0002's answer 4), and Reports counts them booked.
  assert.equal(cal.askedNotBooked, false);
  assert.equal(bea.askedNotBooked, true, "Bea's visit was before they wrote");
  const rule = (fact) => asListRule({ all: [{ field: "missed_visit", ...fact }] });
  const within = rule({ op: "within", days: 7 });
  assert.deepEqual([listRuleMatches(within, cal), listRuleMatches(within, bea)], [true, false]);
  assert.equal(listRuleMatches(rule({ op: "more_than", days: 7 }), cal), false);
  assert.deepEqual(
    [listRuleMatches(rule({ op: "never" }), bea), listRuleMatches(rule({ op: "ever" }), cal)],
    [true, true],
  );
  assert.deepEqual(
    [
      listFactWords({ field: "missed_visit", op: "within", days: 7 }),
      listFactWords({ field: "missed_visit", op: "more_than", days: 30 }),
      listFactWords({ field: "missed_visit", op: "never" }),
      listFactWords({ field: "missed_visit", op: "ever" }),
    ],
    [
      "Missed a visit in the last 7 days",
      "Missed a visit more than 30 days ago",
      "Never missed a visit",
      "Has missed a visit",
    ],
  );
});

test("a member's word is said of the event where it stands: one the calendar moved since the sync is a visit again, unsaid", () => {
  const marks = feedMarksOf([
    { id: "fd", status: "missed", external_id: "d", starts_at: new Date(NOW - 2 * D).toISOString() },
    { id: "fe", status: "cancelled", external_id: "e", starts_at: new Date(NOW + 2 * D).toISOString() },
  ]);
  // Both moved a week on, rebooked, before the hourly sync set their rows aside (00397).
  const joined = feedWithRecord(
    [event("d", NOW + 5 * D, CAL), event("e", NOW + 9 * D, CAL)],
    { noted: [], marks },
    NO_OWN,
  );
  assert.deepEqual(
    joined.map((it) => [it.uid, it.said ?? null]),
    [
      ["d", null],
      ["e", null],
    ],
  );
});

test("a booking's row is its client's by their number or address, never by name: an unsaved Maria's notice is not the saved Maria's visit", () => {
  const items = feedWithRecord(
    [],
    { noted: [booking("n1", NOW + D, "booked", "+13055550144", { client_name: "Maria Lopez" })], marks: new Map() },
    NO_OWN,
  );
  const saved = {
    id: "p-maria",
    display_name: "Maria Lopez",
    wa_profile_name: null,
    phone_e164: "+13055550199",
    email: null,
  };
  const visits = peopleVisitsOf(
    items,
    [saved],
    { timezone: TZ, source: "calendar", own: NO_OWN, services: [], rules: null },
    NOW,
  );
  assert.equal(visits.get("p-maria")?.next ?? null, null);
  // A calendar's own event that names her still finds her by name, as before.
  const byName = peopleVisitsOf(
    [{ ...event("ev", NOW + D, null, "Colour · Maria Lopez"), description: null }],
    [saved],
    { timezone: TZ, source: "calendar", own: NO_OWN, services: [], rules: null },
    NOW,
  );
  assert.equal(byName.get("p-maria")?.next?.via, "name");
});

test("asked, then booked: a visit since they asked answers it, kept, missed or neither; a request or a cancellation does not", () => {
  const asked = NOW - 5 * D;
  const v = (start) => ({ start, end: start + H });
  assert.equal(
    bookedAfterAsk({ next: null, last: null, missed: v(NOW - 3 * D) }, asked),
    true,
    "they booked, and missed it",
  );
  assert.equal(
    bookedAfterAsk({ next: null, last: null, missed: v(NOW - 30 * D) }, asked),
    false,
    "a no-show before they asked",
  );
  assert.equal(bookedAfterAsk({ next: null, last: v(NOW - 2 * D), missed: null }, asked), true);
  assert.equal(bookedAfterAsk({ next: null, last: null, missed: null }, asked), false);
});

test("a reminder drawn for a booking from a notice asks that booking again at the send: cancelled or missed since, it is held", async () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const at = new Date(NOW + D).toISOString();
  const db = fakeDb({
    appointments: [
      {
        id: ID,
        tenant_id: "t1",
        source: "booking_email",
        external_id: "bk-1",
        status: "cancelled",
        starts_at: at,
        vanished_at: null,
        updated_at: new Date(NOW - H).toISOString(),
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        tenant_id: "t1",
        source: "calendar_feed",
        external_id: "ev-1",
        status: "booked",
        starts_at: at,
        vanished_at: null,
        updated_at: new Date(NOW - 3 * D).toISOString(),
      },
    ],
  });
  const states = await appointmentStates(db, "t1", [recordKeyOf(ID), "ev-1"]);
  assert.deepEqual(
    [...states.keys()].sort(),
    [recordKeyOf(ID), "ev-1"].sort(),
    "each by the key the run drew it under",
  );
  const facts = (appointment) => ({
    appointment,
    visit_start: at,
    appointment_read_at: new Date(NOW - 2 * D).toISOString(),
  });
  assert.equal(appointmentHolds(states, facts(recordKeyOf(ID))), false, "the notice's booking, cancelled since: held");
  assert.equal(appointmentHolds(states, facts("ev-1")), true, "the feed's, standing: goes");
});

test("the record over a season is read whole: past the thousand rows one select answers, the furthest bookings included", async () => {
  // Three minutes apart from eighty days back: every row inside the season.
  const at = (i) => new Date(NOW - 80 * D + i * 3 * 60_000).toISOString();
  const row = (i, over) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    tenant_id: "t1",
    vanished_at: null,
    starts_at: at(i),
    ends_at: new Date(Date.parse(at(i)) + H).toISOString(),
    ...over,
  });
  const noted = Array.from({ length: 1100 }, (_, i) => row(i, { source: "booking_email", status: "booked" }));
  const said = Array.from({ length: 1050 }, (_, i) =>
    row(5000 + i, { source: "calendar_feed", status: i % 2 ? "missed" : "kept", external_id: `ev-${i}` }),
  );
  const booked = Array.from({ length: 30 }, (_, i) =>
    row(9000 + i, { source: "calendar_feed", status: "booked", external_id: `b-${i}` }),
  );
  const read = await recordOver(
    fakeDb({ appointments: [...noted, ...said, ...booked] }),
    "t1",
    new Date(NOW - 90 * D).toISOString(),
    new Date(NOW + 90 * D).toISOString(),
  );
  assert.equal(read.noted.length, 1100, "every booking, the last of the season too");
  assert.equal(read.feed.length, 1050, "every word a member said, and no row that says none");
});

test("the receptionist says a caller's visits as People does: one a member cancelled is not confirmed, one they missed is no last visit", async () => {
  const { visitsFor, forgetFeeds } = await import("../../../../../apps/edge/lib/calendar/availability.ts");
  const { setPg } = await import("../../../../../apps/edge/lib/pg.ts");
  const stamp = (ms) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const vevent = (uid, start, title) => [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start + H)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${CAL}`,
    "END:VEVENT",
  ];
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...vevent("ev-cut", NOW + 2 * D, "Cut"),
    ...vevent("ev-colour", NOW - 3 * D, "Colour"),
    ...vevent("ev-gloss", NOW - 20 * D, "Gloss"),
    "END:VCALENDAR",
  ].join("\r\n");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(ics, { status: 200, headers: { "content-type": "text/calendar" } });
  const word = (id, uid, start, status) => ({
    id,
    tenant_id: "t-caller",
    source: "calendar_feed",
    external_id: uid,
    status,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + H).toISOString(),
    vanished_at: null,
  });
  const rt = {
    tenantId: "t-caller",
    calendar: { ical_url: "https://calendar.example.com/caller-record.ics" },
    timezone: TZ,
    notifications: null,
    brain: null,
  };
  const said = async (appointments) => {
    setPg(fakeDb({ appointments }));
    forgetFeeds();
    return visitsFor(rt, { phone: CAL, name: null }, new Date(NOW));
  };
  try {
    const before = await said([]);
    assert.match(before, /next appointment.*\(Cut\)/);
    assert.match(before, /last visit.*\(Colour\)/);
    const after = await said([
      word("w1", "ev-cut", NOW + 2 * D, "cancelled"),
      word("w2", "ev-colour", NOW - 3 * D, "missed"),
    ]);
    assert.doesNotMatch(after, /next appointment/, "a visit a member cancelled is never confirmed to the caller");
    assert.match(after, /last visit.*\(Gloss\)/, "the last one they came to");
  } finally {
    globalThis.fetch = realFetch;
    setPg(null);
    forgetFeeds();
  }
});
