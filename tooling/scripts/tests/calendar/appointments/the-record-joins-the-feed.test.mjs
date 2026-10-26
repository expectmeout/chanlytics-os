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
    ["Missed one in the last 7 days", "Missed one more than 30 days ago", "Never missed one", "Has missed one"],
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

/** Everyone's visits from the record alone, as People and a playbook's run read them (peopleVisitsOf). */
const poolOf = (items, rows, record) =>
  peopleVisitsOf(
    items,
    rows,
    { timezone: TZ, source: "calendar", own: NO_OWN, services: [], rules: null, record },
    NOW,
  );
const KEPT = { id: "p-keep", display_name: "Ana Ruiz", wa_profile_name: null, phone_e164: ANA, email: null };
/** The number a combined person's booking still carries: the person merged away's, nobody's now. */
const GONE = "+13055550177";

test("a booking linked to its person is theirs by the link, whatever number it carries: a request from a thread with none, a visit a merge moved", () => {
  const record = {
    noted: [
      booking("r-asked", NOW + 2 * D, "booked", null, {
        source: "receptionist",
        client_name: null,
        contact_id: "p-keep",
      }),
      booking("r-moved", NOW - 4 * D, "booked", GONE, { contact_id: "p-keep" }),
    ],
    marks: new Map(),
  };
  const v = poolOf([], [KEPT], record).get("p-keep");
  assert.deepEqual(
    [v.next?.record_id, v.next?.via, v.last?.record_id, v.last?.via],
    ["r-asked", "record", "r-moved", "record"],
    "the board draws both as Ana's (personOfAppointment); People and the playbooks now read them as hers too",
  );
  const all = allVisitsIn(indexFeed(feedWithRecord([], record, NO_OWN), NO_OWN), {
    id: "p-keep",
    name: "Ana Ruiz",
    phone: ANA,
    email: null,
  });
  assert.deepEqual(
    all.map((x) => x.recordId),
    ["r-moved", "r-asked"],
    "and her page's timeline",
  );
  // A booking linked to nobody is still found by its number alone, as before.
  const unlinked = poolOf([], [KEPT], { noted: [booking("r-n", NOW + D, "booked", ANA)], marks: new Map() });
  assert.equal(unlinked.get("p-keep").next?.via, "phone");
});

test("a calendar's copy of a booking of theirs is one visit: within fifteen minutes it is the booking's, and a word said of the copy rides on it", () => {
  const items = [
    event("ev-copy", NOW + 2 * D + 10 * 60_000, ANA), // the tool's calendar copy, by her current number
    event("ev-apart", NOW + 2 * D + 20 * 60_000, ANA), // twenty minutes on: a visit of its own
    event("ev-past", NOW - 3 * D + 5 * 60_000, ANA), // the copy of a past booking, said missed on the Calendar
  ];
  const record = {
    noted: [
      booking("r-ahead", NOW + 2 * D, "booked", GONE, { contact_id: "p-keep" }),
      booking("r-past", NOW - 3 * D, "booked", GONE, { contact_id: "p-keep" }),
    ],
    marks: feedMarksOf([
      {
        id: "f-past",
        status: "missed",
        external_id: "ev-past",
        starts_at: new Date(NOW - 3 * D + 5 * 60_000).toISOString(),
      },
    ]),
  };
  const all = allVisitsIn(indexFeed(feedWithRecord(items, record, NO_OWN), NO_OWN), {
    id: "p-keep",
    name: "Ana Ruiz",
    phone: ANA,
    email: null,
  });
  assert.deepEqual(
    all.map((x) => [x.recordId ?? x.id, x.said ?? null]),
    [
      ["r-past", "missed"],
      ["r-ahead", null],
      [`ev-apart:${NOW + 2 * D + 20 * 60_000}`, null],
    ],
    "each copy left out for its booking, the missed one's word kept; the event twenty minutes on stands",
  );
  const v = poolOf(items, [KEPT], record).get("p-keep");
  assert.equal(v.next?.record_id, "r-ahead", "the next visit is the booking, not its copy");
  assert.equal(v.last, null, "a visit said missed on its copy is no last visit");
  assert.equal(v.missed?.record_id, "r-past", "but the one a win-back reads");
});

test("only a copy by its person folds, as the sweep's rule has it: an event found by a guess stands, and a word goes to the nearest booking", () => {
  const ana = (over = {}) => ({ id: "p-keep", name: "Ana Ruiz", phone: ANA, email: null, ...over });
  const visitsOf = (items, noted, person, marks = new Map()) =>
    allVisitsIn(indexFeed(feedWithRecord(items, { noted, marks }, NO_OWN), NO_OWN), person).map((x) => [
      x.recordId ?? x.id,
      x.via,
      x.said ?? null,
    ]);
  const at = NOW - D;
  const iso = (ms) => new Date(ms).toISOString();
  // Another client's event at the same hour, found for Ana only by the name in its title, said missed on the Calendar.
  const otherAna = event("ev-other", at, BEA, "Colour · Ana Ruiz");
  const mine = booking("r-mine", at, "booked", ANA, { contact_id: "p-keep" });
  assert.deepEqual(
    visitsOf(
      [otherAna],
      [mine],
      ana(),
      feedMarksOf([{ id: "f-o", status: "missed", external_id: "ev-other", starts_at: iso(at) }]),
    ),
    [
      ["r-mine", "record", null],
      ["f-o", "name", "missed"],
    ],
    "the other client's event and its word are not laid on Ana's booking",
  );
  // A booking found only by the address of the business Ana works at, beside her own event: neither is the other's.
  const byBusiness = booking("r-office", at, "booked", null, {
    client_email: "office@example.com",
    client_name: "Quinn Diaz",
  });
  assert.deepEqual(
    visitsOf([event("ev-own", at + 5 * 60_000, ANA)], [byBusiness], ana({ businessEmails: ["office@example.com"] })),
    [
      ["r-office", "business", null],
      [`ev-own:${at + 5 * 60_000}`, "phone", null],
    ],
    "her own event, found by her number, stays hers",
  );
  // Two bookings fifteen minutes apart, each with its copy; the second copy is said missed.
  const cut = booking("r-cut", at, "booked", GONE, { contact_id: "p-keep" });
  const brows = booking("r-brows", at + 15 * 60_000, "booked", GONE, { contact_id: "p-keep" });
  assert.deepEqual(
    visitsOf(
      [event("c-cut", at, ANA), event("c-brows", at + 15 * 60_000, ANA)],
      [cut, brows],
      ana(),
      feedMarksOf([{ id: "f-b", status: "missed", external_id: "c-brows", starts_at: iso(at + 15 * 60_000) }]),
    ),
    [
      ["r-cut", "record", null],
      ["r-brows", "record", "missed"],
    ],
    "the word said of the brows goes on the brows",
  );
  // A booking linked to her and carrying her number is said as the board says it: linked on the booking.
  assert.deepEqual(visitsOf([], [booking("r-both", at, "booked", ANA, { contact_id: "p-keep" })], ana()), [
    ["r-both", "record", null],
  ]);
  const linkedAt = (id, start, status = "booked") => booking(id, start, status, GONE, { contact_id: "p-keep" });
  const said = (id, external_id, start, status) => ({ id, status, external_id, starts_at: iso(start) });
  // Bea's own event, which names Ana's number second ("mum"), said kept: the sweep matches it to Bea, so it is not Ana's copy.
  const bea = { ...event("ev-bea", at, null, "Colour · Bea Diaz"), description: `Bea Diaz ${BEA}, mum ${ANA}` };
  assert.deepEqual(
    visitsOf([bea], [linkedAt("r-ana", at)], ana(), feedMarksOf([said("f-bea", "ev-bea", at, "kept")])),
    [
      ["r-ana", "record", null],
      ["f-bea", "phone", "kept"],
    ],
    "an event that names another client first keeps its word, and Ana's booking hers",
  );
  // An event found by the address of her business is a guess, and stands; one found by her own address is her copy.
  const guest = (uid, start, email) => ({
    ...event(uid, start, null),
    description: null,
    attendees: [{ name: null, email }],
  });
  assert.deepEqual(
    visitsOf(
      [guest("ev-office", at + 5 * 60_000, "office@example.com")],
      [linkedAt("r-mine", at)],
      ana({ businessEmails: ["office@example.com"] }),
    ),
    [
      ["r-mine", "record", null],
      [`ev-office:${at + 5 * 60_000}`, "business", null],
    ],
  );
  assert.deepEqual(
    visitsOf(
      [guest("c-mail", at + 5 * 60_000, "ana@example.com")],
      [linkedAt("r-mine", at)],
      ana({ email: "ana@example.com" }),
    ),
    [["r-mine", "record", null]],
  );
  // A booking's own word stands over its copy's; and a booking's row is never another booking's copy.
  assert.deepEqual(
    visitsOf(
      [event("c", at + 5 * 60_000, ANA)],
      [linkedAt("r-k", at, "kept")],
      ana(),
      feedMarksOf([said("f-c", "c", at + 5 * 60_000, "missed")]),
    ),
    [["r-k", "record", "kept"]],
  );
  assert.deepEqual(
    visitsOf([], [linkedAt("r-linked", at), booking("r-other", at + 5 * 60_000, "booked", ANA)], ana()),
    [
      ["r-linked", "record", null],
      ["r-other", "phone", null],
    ],
  );
  // Two copies of one booking, each said something: the nearer copy's word is the visit's, whichever comes first.
  const twoWords = (near, far) =>
    visitsOf(
      [event("c-near", at + 2 * 60_000, ANA), event("c-far", at - 10 * 60_000, ANA)],
      [linkedAt("r-mine", at)],
      ana(),
      feedMarksOf([said("f-n", "c-near", at + 2 * 60_000, near), said("f-f", "c-far", at - 10 * 60_000, far)]),
    );
  assert.deepEqual(twoWords("kept", "missed"), [["r-mine", "record", "kept"]]);
  assert.deepEqual(twoWords("missed", "kept"), [["r-mine", "record", "missed"]]);
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
  // As the wire carries them (PersonVisitsDto, ISO), which Reports's booking line and People's row both hand it.
  const iso = (t) => ({ start: new Date(t).toISOString() });
  assert.equal(bookedAfterAsk({ next: null, last: null, missed: iso(NOW - 3 * D) }, asked), true);
  assert.equal(bookedAfterAsk({ next: iso(NOW + D), last: null }, asked), true);
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
    // What the runtime always carries beside the config (tenant-runtime.ts): here, nothing known.
    known: { workspace: null, channels: [], listing: null },
  };
  const said = async (appointments) => {
    setPg(fakeDb({ appointments }));
    forgetFeeds();
    // On a call, at the test's clock: the clock was handed where the channel goes, so the real one was read, and the
    // "next" visit two days on became a past one once the real day reached it (13 Oct 2026).
    return visitsFor(rt, { phone: CAL, name: null }, "call", new Date(NOW));
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
