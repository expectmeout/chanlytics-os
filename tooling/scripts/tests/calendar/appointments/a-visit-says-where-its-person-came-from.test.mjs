/**
 * A visit says where its person came from (00426, decision 0057): a visit names the lead its person was found as
 * (`appointments.lead_id`, stamped by appointments_lead_stamp), and the board carries that lead, by its business's name,
 * and the sequence whose enrollment of it is the newest, on the item of the record row that named it. A booking's row
 * and a feed event's kept row alike; read only where a row names a lead, and a lead erased or blanked since says nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { visitOrigins } from "@chanlytics/db";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { calendarWeek } = await import(at("apps/dashboard/src/server/calendar/calendar-week.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TZ = "America/New_York";
const NOW = new Date("2026-10-12T15:00:00Z");

const lead = (id, business_name, over = {}) => ({
  id,
  tenant_id: T,
  business_name,
  erased_at: null,
  blanked_at: null,
  ...over,
});
const enrolled = (lead_id, sequence_id, entered_at, over = {}) => ({
  id: `en-${lead_id}-${sequence_id}`,
  tenant_id: T,
  lead_id,
  sequence_id,
  entered_at,
  ...over,
});
const sequence = (id, name, over = {}) => ({ id, tenant_id: T, name, ...over });

test("each standing lead by its business's name, with the sequence that took it in last; an erased or blanked one says nothing", async () => {
  const db = fakeDb({
    leads: [
      lead("ld-1", "Ruiz Design "),
      lead("ld-2", "Harbor Gym"),
      lead("ld-gone", "Gone Studio", { erased_at: "2026-10-01T00:00:00Z" }),
      lead("ld-blank", "", { blanked_at: "2026-10-01T00:00:00Z" }),
      lead("ld-elsewhere", "Not Ours", { tenant_id: OTHER }),
    ],
    sequence_enrollments: [
      enrolled("ld-1", "sq-old", "2026-09-01T00:00:00Z"),
      enrolled("ld-1", "sq-new", "2026-10-01T00:00:00Z"),
    ],
    sequences: [sequence("sq-old", "First pass"), sequence("sq-new", "Design studios · Queens")],
  });
  const got = await visitOrigins(db, T, ["ld-1", "ld-2", "ld-gone", "ld-blank", "ld-elsewhere", "ld-1"]);
  assert.deepEqual(
    got.sort((a, b) => a.lead_id.localeCompare(b.lead_id)),
    [
      { lead_id: "ld-1", lead_name: "Ruiz Design", sequence_id: "sq-new", sequence_name: "Design studios · Queens" },
      { lead_id: "ld-2", lead_name: "Harbor Gym", sequence_id: null, sequence_name: null },
    ],
  );
  assert.deepEqual(await visitOrigins(db, T, []), [], "no lead named, nothing read");
});

/** A workspace with no calendar link, whose visits are the record's: the bookings that arrived by email. */
const world = (appointments) => ({
  memberships: [{ user_id: "u1", tenant_id: T, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" }],
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
  tenant_config: [
    {
      tenant_id: T,
      config: {
        brain: {
          business_name: "Harbor",
          system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
        },
      },
    },
  ],
  appointment_notices: [],
  appointments,
  leads: [lead("ld-1", "Ruiz Design")],
  sequence_enrollments: [enrolled("ld-1", "sq-new", "2026-10-01T00:00:00Z")],
  sequences: [sequence("sq-new", "Design studios · Queens")],
  policies: [],
});
const booking = (id, starts_at, lead_id) => ({
  id,
  tenant_id: T,
  source: "email",
  tool: "booksy",
  status: "booked",
  starts_at,
  ends_at: new Date(Date.parse(starts_at) + 3_600_000).toISOString(),
  all_day: false,
  title: null,
  service: "Consultation",
  staff: null,
  price: null,
  note: null,
  client_name: "Ana Ruiz",
  client_phone: "+19175550100",
  client_email: null,
  contact_id: null,
  external_id: null,
  expires_at: null,
  vanished_at: null,
  lead_id,
});

test("the board lays each visit's origin on the item of the row that named it, and reads none where no row names a lead", async () => {
  const ctx = (t) => ({ supabase: fakeDb(t, {}, { people_list: () => [] }), userId: "u1", params: {} });
  const week = await calendarWeek(
    ctx(world([booking("ap-1", "2026-10-13T14:00:00Z", "ld-1"), booking("ap-2", "2026-10-14T14:00:00Z", null)])),
    T,
    { from: "2026-10-12", days: 7 },
    NOW,
  );
  const items = week.days.flatMap((d) => d.items);
  const of = (id) => items.find((it) => it.visit?.id === id);
  assert.deepEqual(of("ap-1")?.origin, {
    lead: { id: "ld-1", name: "Ruiz Design" },
    sequence: { id: "sq-new", name: "Design studios · Queens" },
  });
  assert.equal(of("ap-2")?.origin, undefined, "a visit whose person was not found as a lead carries none");

  const quiet = world([booking("ap-3", "2026-10-13T14:00:00Z", null)]);
  delete quiet.leads;
  delete quiet.sequence_enrollments;
  delete quiet.sequences;
  const plain = await calendarWeek(ctx(quiet), T, { from: "2026-10-12", days: 7 }, NOW);
  assert.equal(
    plain.days.flatMap((d) => d.items).some((it) => "origin" in it),
    false,
    "no row names a lead: the leads, enrollments and sequences are never asked (their tables are not even here)",
  );
});
