/**
 * A missed visit a sequence follows up is asked once (decision 0119): a visit said missed enrols its person in each
 * sequence on `visit_missed` (sequence_occasions), and the board's read says so on that visit (`visit.followed`), so the
 * sheet opened on it later leads with no "Ask for a new time" of its own. Only an occasion that waits or ran follows it
 * up; one that left (they booked again, the Missed was taken back) does not, and a visit nobody missed is never asked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { missedOccasion } from "@chanlytics/contracts";
import { listMissedFollowed } from "@chanlytics/db/campaigns";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { getCalendarWeek } = await import(at("apps/dashboard/src/server/calendar/week/week.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TZ = "America/New_York";
const NOW = new Date("2026-10-15T15:00:00Z");
const ANA = "11111111-1111-4111-8111-111111111111";
const BEN = "22222222-2222-4222-8222-222222222222";
const CAL = "33333333-3333-4333-8333-333333333333";

const occasion = (appointmentId, contact_id, state, over = {}) => ({
  id: `oc-${appointmentId}`,
  tenant_id: T,
  sequence_id: "sq-missed",
  contact_id,
  occasion: missedOccasion(appointmentId),
  due_at: "2026-10-14T15:10:00Z",
  try_at: "2026-10-14T15:10:00Z",
  state,
  why: state === "left" ? "booked_again" : null,
  batch_id: null,
  ...over,
});

test("the missed visits whose occasion waits or ran, by appointment; one that left, another workspace's or none is not", async () => {
  const db = fakeDb({
    sequence_occasions: [
      occasion("ap-wait", ANA, "waiting"),
      occasion("ap-ran", BEN, "ran"),
      occasion("ap-left", CAL, "left"),
      occasion("ap-theirs", ANA, "waiting", { tenant_id: OTHER }),
    ],
  });
  const got = await listMissedFollowed(db, T, [
    { appointmentId: "ap-wait", contactId: ANA },
    { appointmentId: "ap-ran", contactId: BEN },
    { appointmentId: "ap-left", contactId: CAL },
    { appointmentId: "ap-theirs", contactId: ANA },
    { appointmentId: "ap-none", contactId: BEN },
  ]);
  assert.deepEqual([...got].sort(), ["ap-ran", "ap-wait"]);
  assert.deepEqual([...(await listMissedFollowed(db, T, []))], [], "none missed, nothing read");
});

/** A workspace with no calendar link, whose visits are the record's: the bookings that arrived by email. */
const world = (appointments, sequence_occasions) => ({
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
  ...(sequence_occasions ? { sequence_occasions } : {}),
  policies: [],
});
const booking = (id, starts_at, status, contact_id) => ({
  id,
  tenant_id: T,
  source: "email",
  tool: "booksy",
  status,
  starts_at,
  ends_at: new Date(Date.parse(starts_at) + 3_600_000).toISOString(),
  all_day: false,
  title: null,
  service: "Color",
  staff: null,
  price: null,
  note: null,
  client_name: "Ana Ruiz",
  client_phone: "+19175550100",
  client_email: null,
  contact_id,
  external_id: null,
  expires_at: null,
  vanished_at: null,
  lead_id: null,
});

test("the board says a missed visit is followed up on the item of its row, and asks nothing where nobody missed one", async () => {
  const ctx = (t) => ({ supabase: fakeDb(t, {}, { people_list: () => [] }), userId: "u1", params: {} });
  const week = await getCalendarWeek(
    ctx(
      world(
        [
          booking("ap-1", "2026-10-13T14:00:00Z", "missed", ANA),
          booking("ap-2", "2026-10-13T16:00:00Z", "missed", BEN),
          booking("ap-3", "2026-10-14T14:00:00Z", "missed", CAL),
          booking("ap-4", "2026-10-16T14:00:00Z", "booked", ANA),
        ],
        [occasion("ap-1", ANA, "waiting"), occasion("ap-2", BEN, "left")],
      ),
    ),
    T,
    { from: "2026-10-12", days: 7 },
    NOW,
  );
  const items = week.days.flatMap((d) => d.items);
  const of = (id) => items.find((it) => it.visit?.id === id)?.visit;
  assert.deepEqual(of("ap-1"), { id: "ap-1", status: "missed", followed: true });
  assert.deepEqual(of("ap-2"), { id: "ap-2", status: "missed" }, "its occasion left: the sheet may ask them");
  assert.deepEqual(of("ap-3"), { id: "ap-3", status: "missed" }, "no sequence took them in");
  assert.deepEqual(of("ap-4"), { id: "ap-4", status: "booked" });

  const calm = await getCalendarWeek(
    ctx(world([booking("ap-5", "2026-10-16T14:00:00Z", "booked", ANA)])),
    T,
    { from: "2026-10-12", days: 7 },
    NOW,
  );
  assert.equal(
    calm.days.flatMap((d) => d.items).some((it) => it.visit && "followed" in it.visit),
    false,
    "nobody missed a visit: the occasions are never asked (their table is not even here)",
  );
});
