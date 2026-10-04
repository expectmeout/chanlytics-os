/**
 * The month's allowance holds people at enrolment (review item 9, 3 Oct 2026), on a real Postgres: a run is assembled
 * whole (00282 assemble_broadcast), and the people the month cannot carry are written as held the moment it exists
 * (packages/db holdRecipients: skipped, with the reason the send's own check gives), so the run's page says so before
 * anything is sent. Only a person still queued is touched: one the send already settled is left as it is, and so is
 * another workspace's run. In steps, since a request's address is as long as its ids.
 *
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { assembleBroadcast, holdRecipients } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes broadcasts and due jobs"
      : false;

let db;
let A;
let B;
const template = {};
const MANY = 130;
const people = [];
const peopleB = [];

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const ws = async (slug) => {
    const { data, error } = await db
      .from("tenants")
      .insert({ slug: `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: slug })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);
    return data.id;
  };
  A = await ws("hold-a");
  B = await ws("hold-b");
  for (const tenant of [A, B]) {
    const t = await db
      .from("templates")
      .insert({ tenant_id: tenant, channel: "whatsapp", name: "reminder", language: "en_US", meta_status: "approved" })
      .select("id")
      .single();
    assert.equal(t.error, null, t.error?.message);
    template[tenant] = t.data.id;
  }
  const rows = (tenant, n, from) =>
    Array.from({ length: n }, (_, i) => ({ tenant_id: tenant, email: `p${from + i}@example.com` }));
  const a = await db
    .from("contacts")
    .insert(rows(A, MANY, 0))
    .select("id");
  assert.equal(a.error, null, a.error?.message);
  people.push(...a.data.map((r) => r.id));
  const b = await db
    .from("contacts")
    .insert(rows(B, 2, 1000))
    .select("id");
  assert.equal(b.error, null, b.error?.message);
  peopleB.push(...b.data.map((r) => r.id));
});

after(async () => {
  if (skip) return;
  for (const t of [A, B].filter(Boolean)) {
    await db.from("jobs").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
});

/** A run of everyone by email, waiting for nobody: the people queued. */
async function run(tenant, ids) {
  const id = await assembleBroadcast(db, {
    tenantId: tenant,
    run: {
      name: "Visit reminder",
      template_id: template[tenant],
      template_name: "reminder",
      template_language: "en_US",
      params: [],
      audience: { kind: "everyone", id: null, label: "Everyone" },
      state: "scheduled",
      scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
      recipient_count: ids.length,
      created_by: null,
      channels: ["email"],
    },
    recipients: ids.map((contact_id) => ({ contact_id, facts: null, channel: "email" })),
    sendAt: new Date(Date.now() + 86_400_000),
  });
  return id;
}
const states = async (tenant, broadcast) => {
  const { data, error } = await db
    .from("broadcast_recipients")
    .select("contact_id, state, reason")
    .eq("tenant_id", tenant)
    .eq("broadcast_id", broadcast);
  assert.equal(error, null, error?.message);
  return new Map(data.map((r) => [r.contact_id, [r.state, r.reason]]));
};

test(
  "those past the month's room are written as held, in steps of a hundred: skipped with month_allowance, the rest still queued",
  { skip },
  async () => {
    const broadcast = await run(A, people);
    const past = people.slice(5);
    await holdRecipients(db, { tenantId: A, broadcastId: broadcast, contactIds: past, reason: "month_allowance" });
    const got = await states(A, broadcast);
    assert.equal(got.size, MANY);
    for (const id of people.slice(0, 5))
      assert.deepEqual(got.get(id), ["queued", null], "within the room: still queued");
    for (const id of past) assert.deepEqual(got.get(id), ["skipped", "month_allowance"], "past it: held, and why");
    assert.equal(past.length > 100, true, "more than one step of ids");
  },
);

test(
  "only a person still queued is touched: one the send already settled keeps what it said, and nobody is held twice",
  { skip },
  async () => {
    const [one, two, three] = people.slice(0, 3);
    const broadcast = await run(A, [one, two, three]);
    // The send reached the first before the hold was written: its row says sent.
    const sent = await db
      .from("broadcast_recipients")
      .update({ state: "sent", sent_at: new Date().toISOString() })
      .eq("broadcast_id", broadcast)
      .eq("contact_id", one);
    assert.equal(sent.error, null, sent.error?.message);
    await holdRecipients(db, {
      tenantId: A,
      broadcastId: broadcast,
      contactIds: [one, two],
      reason: "month_allowance",
    });
    await holdRecipients(db, { tenantId: A, broadcastId: broadcast, contactIds: [two], reason: "something_else" });
    const got = await states(A, broadcast);
    assert.equal(got.get(one)[0], "sent", "settled: left as it is");
    assert.deepEqual(got.get(two), ["skipped", "month_allowance"], "held once, and its first word stands");
    assert.deepEqual(got.get(three), ["queued", null], "not named: not touched");
  },
);

test("another workspace's run is never touched, whoever names it", { skip }, async () => {
  const broadcast = await run(B, peopleB);
  await holdRecipients(db, { tenantId: A, broadcastId: broadcast, contactIds: peopleB, reason: "month_allowance" });
  const got = await states(B, broadcast);
  for (const id of peopleB) assert.deepEqual(got.get(id), ["queued", null]);
});

test("nobody to hold is no write, and a failed write throws", { skip }, async () => {
  const broadcast = await run(A, people.slice(0, 2));
  await holdRecipients(db, { tenantId: A, broadcastId: broadcast, contactIds: [], reason: "month_allowance" });
  assert.deepEqual(
    [...(await states(A, broadcast)).values()],
    [
      ["queued", null],
      ["queued", null],
    ],
  );
  // A reason the table refuses (its CHECK holds a closed set of states, not reasons: a bad id is the failure here).
  await assert.rejects(
    holdRecipients(db, { tenantId: A, broadcastId: "not-a-uuid", contactIds: [people[0]], reason: "month_allowance" }),
    /hold_recipients:/,
  );
});
