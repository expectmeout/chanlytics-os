/**
 * A visit keeps when its booking arrived (decision 0141, 00647), over a record in memory: the stamp's door (db
 * stampVisitArrival), which the later moment wins and a second delivery leaves alone, and the fill for the bookings from
 * before the stamp (tooling/scripts/ops/calendar/visit-arrivals-fill.mjs), which asks the same rule of the ledger's events and
 * writes through the same door. The script's main (its reads of production, its backup) is not run here; these are
 * the parts it is made of.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stampVisitArrival } from "@chanlytics/db/calendar";
import { arrivalsOf, planStamps, writeStamps } from "../../../tooling/scripts/ops/calendar/visit-arrivals-fill.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { rows, TENANT } from "../../_rows.mjs";

const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MON = "2026-09-14T13:00:00.000000+00:00";
const TUE = "2026-09-15T09:30:00.000000+00:00";

/** A visit on the record, booked, an hour long. */
const visit = (id, over = {}) => ({
  id,
  tenant_id: TENANT,
  contact_id: null,
  lead_id: null,
  source: "booking_email",
  tool: null,
  external_id: null,
  status: "booked",
  starts_at: "2026-09-19T14:00:00Z",
  ends_at: "2026-09-19T15:00:00Z",
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
  timezone: "America/New_York",
  vanished_at: null,
  created_by: null,
  created_at: "2026-09-14T13:00:00Z",
  updated_at: "2026-09-14T13:00:00Z",
  expires_at: null,
  conversation_id: null,
  arrived_at: null,
  ...over,
});
/** The record's word that a visit changed. */
const changed = (id, data, at, tenantId = TENANT) =>
  rows.event({
    tenant_id: tenantId,
    kind: "appointment.changed",
    category: "appointment",
    subject_type: "appointment",
    subject_id: id,
    data,
    created_at: at,
  });
const stampOf = (record, id) => record.appointments.find((row) => row.id === id).arrived_at;

test("the stamp is taken where the visit has none, the later moment wins, and a second delivery moves nothing", async () => {
  const record = { appointments: [visit("a-hold"), visit("a-other", { tenant_id: OTHER })] };
  const db = fakeDb(record);
  assert.equal(await stampVisitArrival(db, TENANT, "a-hold", MON), true, "no stamp yet: taken");
  assert.equal(stampOf(record, "a-hold"), MON);
  assert.equal(await stampVisitArrival(db, TENANT, "a-hold", MON), false, "the same event delivered twice");
  assert.equal(await stampVisitArrival(db, TENANT, "a-hold", TUE), true, "a hold confirmed the next day");
  assert.equal(stampOf(record, "a-hold"), TUE, "it arrived when it was confirmed");
  assert.equal(await stampVisitArrival(db, TENANT, "a-hold", MON), false, "the older event delivered late");
  assert.equal(stampOf(record, "a-hold"), TUE);
  assert.equal(await stampVisitArrival(db, TENANT, "a-other", MON), false, "another workspace's visit");
  assert.equal(stampOf(record, "a-other"), null);
  assert.equal(await stampVisitArrival(db, TENANT, "a-nobody", MON), false, "a visit the record no longer holds");
});

test("the fill asks the one rule of the ledger: each visit's latest arrival, and nothing that is no booking", () => {
  const arrivals = arrivalsOf([
    changed("a-hold", { source: "booking_email", change: "added" }, MON),
    changed("a-hold", { source: "booking_email", change: "confirmed" }, TUE),
    changed("a-tool", { source: "booking_tool", change: "added" }, TUE),
    changed("a-tool", { source: "booking_tool", change: "moved" }, "2026-09-16T10:00:00+00:00"),
    changed("a-own", { source: "person", change: "added" }, MON),
    changed(
      "a-first",
      { source: "calendar_feed", change: "added", named: true, series: false, twin: false, first: true },
      MON,
    ),
  ]);
  assert.deepEqual(
    [...arrivals].map(([id, arrival]) => [id, arrival.at]),
    [
      ["a-hold", TUE],
      ["a-tool", TUE],
    ],
  );
});

test("the fill plans a visit with no stamp or a sooner one, in the event's own workspace, and nothing twice", async () => {
  const events = [
    changed("a-new", { source: "booking_tool", change: "added" }, MON),
    changed("a-hold", { source: "booking_email", change: "confirmed" }, TUE),
    changed("a-done", { source: "booking_tool", change: "added" }, MON),
    changed("a-theirs", { source: "booking_tool", change: "added" }, MON, OTHER),
    changed("a-erased", { source: "booking_tool", change: "added" }, MON),
  ];
  const record = {
    appointments: [
      visit("a-new"),
      visit("a-hold", { arrived_at: MON }),
      visit("a-done", { arrived_at: MON }),
      // An event that names another workspace than the visit's own is no arrival of this visit.
      visit("a-theirs"),
    ],
  };
  const db = fakeDb(record);
  const plan = planStamps(arrivalsOf(events), record.appointments);
  assert.deepEqual(
    plan.map((stamp) => [stamp.id, stamp.had, stamp.at]),
    [
      ["a-new", null, MON],
      ["a-hold", MON, TUE],
    ],
  );
  const { written, skipped } = await writeStamps(db, [...plan, { id: "a-erased", tenant_id: TENANT, at: MON }]);
  assert.deepEqual(
    written.map((stamp) => stamp.id),
    ["a-new", "a-hold"],
  );
  assert.deepEqual(
    skipped.map((miss) => miss.id),
    ["a-erased"],
    "a visit gone since is said, not counted",
  );
  assert.deepEqual(
    [stampOf(record, "a-new"), stampOf(record, "a-hold"), stampOf(record, "a-theirs")],
    [MON, TUE, null],
  );
  assert.deepEqual(planStamps(arrivalsOf(events), record.appointments), [], "a second run finds nothing to do");
});
