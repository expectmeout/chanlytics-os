/**
 * A week of bookings behind Today's booked figure (decision 0141): what was booked on each of the last days, counted by
 * the rule today's figure is counted by, from the moment each booking arrived as its visit keeps it
 * (appointments.arrived_at, which the bell's rule stamps). The server's count (server/metrics/bookings.ts
 * findBookedDays) run over a record in memory, in the workspace's own zone: a booking counts on the day it arrived, a
 * booking and the calendar's copy of it once, one cancelled since or gone from the calendar not at all, and a visit that
 * has happened since still. Then today's figure by the same rule, and a database that keeps no arrival yet.
 */
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { rows, TENANT } from "../../_rows.mjs";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { BOOKED_DAYS, findBookedDays, findBookedSince } = await importSrc(
  "apps/dashboard/src/server/metrics/bookings.ts",
);

// 11:00 in New York on Friday 18 September 2026. A day there begins at 04:00 UTC.
const NOW = Date.parse("2026-09-18T15:00:00Z");
const TZ = "America/New_York";
const SAT = "2026-09-19T14:00:00Z";
const MON = "2026-09-21T18:30:00Z";

const dana = rows.contact({ tenant_id: TENANT, display_name: "Dana Whitfield", phone_e164: "+13055550112" });
const ben = rows.contact({ tenant_id: TENANT, display_name: "Ben Ortiz", phone_e164: "+13055550111" });
/** A person as a visit's read joins them. */
const joined = (person) => ({
  display_name: person.display_name,
  wa_profile_name: person.wa_profile_name,
  erased_at: person.erased_at,
  erasing_since: person.erasing_since,
});

/** A visit on the record, booked, an hour long, stamped with when its booking arrived. */
const visit = (id, arrivedAt, startsAt, over = {}) => ({
  id,
  tenant_id: TENANT,
  contact_id: null,
  contacts: null,
  lead_id: null,
  source: "booking_tool",
  tool: null,
  external_id: null,
  status: "booked",
  starts_at: startsAt,
  ends_at: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
  all_day: false,
  title: null,
  service: null,
  staff: null,
  price: null,
  note: null,
  client_name: null,
  client_phone: null,
  client_email: null,
  consultation: false,
  timezone: TZ,
  vanished_at: null,
  created_by: null,
  created_at: arrivedAt ?? "2026-09-10T13:00:00Z",
  updated_at: arrivedAt ?? "2026-09-10T13:00:00Z",
  expires_at: null,
  conversation_id: null,
  arrived_at: arrivedAt,
  ...over,
});

/** The week's record: Saturday 12 to Friday 18 September, as New York counts its days. */
const WEEK = [
  // Sunday 13: one booking.
  visit("a-ana", "2026-09-13T14:00:00Z", SAT, { client_name: "Ana Reyes" }),
  // Monday 14: Dana's booking by its tool's email and the calendar's copy of it, seen first: one visit. And one
  // booked that day and cancelled on Wednesday, which leaves Monday.
  visit("a-mail", "2026-09-14T13:00:00Z", SAT, { source: "booking_email", client_name: "Dana Whitfield" }),
  visit("a-copy", "2026-09-14T12:00:00Z", SAT, {
    source: "calendar_feed",
    contact_id: dana.id,
    contacts: joined(dana),
  }),
  visit("a-gone", "2026-09-14T15:00:00Z", SAT, { client_name: "Sofia Diaz", status: "cancelled" }),
  // Tuesday 15: two booked for Wednesday. One came and one did not, as a member said since: both were booked.
  visit("a-came", "2026-09-15T15:00:00Z", "2026-09-16T14:00:00Z", { client_name: "Ivy Chen", status: "kept" }),
  visit("a-no-show", "2026-09-15T16:00:00Z", "2026-09-16T16:00:00Z", { client_name: "Omar Haddad", status: "missed" }),
  // Wednesday 16, at 11:30 at night there: Thursday by the clock in UTC, Wednesday in the workspace's zone.
  visit("a-late", "2026-09-17T03:30:00Z", MON, { source: "calendar_feed", contact_id: ben.id, contacts: joined(ben) }),
  // Thursday 17: nothing that counts. A visit entered that day for the day before, one the calendar no longer
  // holds, the owner's own entry (linked to nobody now), a hold not confirmed, and a member's own entry.
  visit("a-before", "2026-09-17T14:00:00Z", "2026-09-16T20:00:00Z", { client_name: "Leo Park" }),
  visit("a-vanished", "2026-09-17T15:00:00Z", MON, {
    source: "calendar_feed",
    contact_id: ben.id,
    contacts: joined(ben),
    vanished_at: "2026-09-17T18:00:00Z",
  }),
  visit("a-own", "2026-09-17T16:00:00Z", MON, { source: "calendar_feed" }),
  visit("a-hold", "2026-09-17T17:00:00Z", MON, { source: "booking_email", status: "proposed" }),
  visit("a-member", null, MON, { source: "person" }),
  // Friday 18, today.
  visit("a-today", "2026-09-18T13:00:00Z", MON, { client_name: "Mia Novak" }),
  // The Friday before, and another workspace's: outside the week, and never read.
  visit("a-old", "2026-09-11T14:00:00Z", SAT, { client_name: "Eli Stone" }),
  visit("a-theirs", "2026-09-15T14:00:00Z", SAT, { tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
];
const record = () => fakeDb({ appointments: WEEK.map((row) => ({ ...row })), contacts: [dana, ben] });

test("a week of bookings: each on the day it arrived in the workspace's zone, while it stands, once", async () => {
  assert.deepEqual(
    await findBookedDays(record(), TENANT, { zone: TZ, nowMs: NOW, days: BOOKED_DAYS }),
    [0, 1, 1, 2, 1, 0, 1],
  );
  assert.equal(BOOKED_DAYS, 7, "the week Today draws: six days behind the figure, and today");
});

test("fewer days are the last ones, today last, and no day is none", async () => {
  assert.deepEqual(
    await findBookedDays(record(), TENANT, { zone: TZ, nowMs: NOW, days: 3 }),
    [1, 0, 1],
    "a month on its third day",
  );
  assert.deepEqual(await findBookedDays(record(), TENANT, { zone: TZ, nowMs: NOW, days: 1 }), [1]);
  assert.deepEqual(await findBookedDays(record(), TENANT, { zone: TZ, nowMs: NOW, days: 0 }), []);
  assert.deepEqual(
    await findBookedDays(fakeDb({}), TENANT, { zone: TZ, nowMs: NOW, days: BOOKED_DAYS }),
    [0, 0, 0, 0, 0, 0, 0],
  );
});

test("a booking cancelled since leaves its day, and one put back on it would count again", async () => {
  const before = WEEK.map((row) => (row.id === "a-gone" ? { ...row, status: "booked" } : { ...row }));
  const monday = (days) => days.at(2);
  assert.equal(
    monday(await findBookedDays(fakeDb({ appointments: before }), TENANT, { zone: TZ, nowMs: NOW, days: BOOKED_DAYS })),
    2,
  );
  assert.equal(
    monday(await findBookedDays(record(), TENANT, { zone: TZ, nowMs: NOW, days: BOOKED_DAYS })),
    1,
    "cancelled on Wednesday",
  );
});

test("today's figure asks the same: a visit booked this morning that came this afternoon was still booked today", async () => {
  const arrived = (id) =>
    rows.event({
      tenant_id: TENANT,
      kind: "appointment.changed",
      category: "appointment",
      subject_type: "appointment",
      subject_id: id,
      data: { source: "booking_tool", change: "added" },
      created_at: "2026-09-18T12:00:00Z",
    });
  const db = fakeDb({
    appointments: [
      visit("a-came", "2026-09-18T12:00:00Z", "2026-09-18T13:00:00Z", { client_name: "Ivy Chen", status: "kept" }),
      visit("a-ahead", "2026-09-18T12:00:00Z", MON, { client_name: "Mia Novak" }),
      visit("a-off", "2026-09-18T12:00:00Z", MON, { client_name: "Sofia Diaz", status: "cancelled" }),
    ],
  });
  const lately = { changes: [arrived("a-came"), arrived("a-ahead"), arrived("a-off")], arrive: true };
  const today = await findBookedSince(db, TENANT, lately, "2026-09-18T04:00:00+00:00");
  assert.equal(today.booked, 2, "REGRESSION: a visit marked kept left the day it was booked on");
  assert.deepEqual(
    today.visits.map((v) => v.who),
    ["Ivy Chen", "Mia Novak"],
  );
});

test("a database that keeps no arrival yet answers no week, and a read that fails answers none either: never a zero", async () => {
  /** A database whose every read of appointments answers `error`. */
  const answering = (error) => {
    const read = new Proxy(
      {},
      {
        get: (_, key) => (key === "then" ? (resolve) => resolve({ data: null, error }) : () => read),
      },
    );
    return { from: () => read };
  };
  mock.method(console, "log", () => {});
  mock.method(console, "error", () => {});
  mock.method(console, "warn", () => {});
  try {
    const before = answering({ code: "42703", message: "column appointments.arrived_at does not exist" });
    assert.equal(
      await findBookedDays(before, TENANT, { zone: TZ, nowMs: NOW, days: BOOKED_DAYS }),
      null,
      "00647 not applied yet",
    );
    const down = answering({ code: "57014", message: "canceling statement due to statement timeout" });
    assert.equal(
      await findBookedDays(down, TENANT, { zone: TZ, nowMs: NOW, days: BOOKED_DAYS }),
      null,
      "a read that failed",
    );
  } finally {
    mock.restoreAll();
  }
});
