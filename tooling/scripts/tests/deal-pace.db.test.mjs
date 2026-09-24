/**
 * A workspace has a pace (0008, amended; 00167), proved where it is counted: on the database.
 *
 * deal_pace takes a workspace's yeses of the last year -- a deal standing won, or ended after a deal.won -- and
 * answers the median whole days from each proposal to its yes, and how many. A pass, a proposal still out, an
 * engagement ended without a yes and a yes older than a year are not counted; a yes recorded before its proposal
 * counts as the same day; a median between two days rounds half up. Row security decides whose deals are counted:
 * a member of another workspace counts none of these.
 *
 * Runs the way deals.db.test.mjs does: its own workspaces, users and rows, made with the service key and removed
 * after, against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces, people and deals"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const w = {};
const users = [];
const DAY = 86_400_000;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

/** A real session for a fresh user with this role in this workspace. */
async function member(role, tenant) {
  const email = `pace-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

/** A deal as the door leaves it, written straight in so its days are the test's: proposed and decided so long ago. */
async function deal(service, stage, proposedDaysAgo, decidedDaysAgo, won = false) {
  const row = ok(
    await w.admin
      .from("deals")
      .insert({
        tenant_id: w.tenant,
        contact_id: w.contact,
        service,
        stage,
        proposed_at: ago(proposedDaysAgo),
        decided_at: decidedDaysAgo === null ? null : ago(decidedDaysAgo),
        ended_at: stage === "ended" ? ago(1) : null,
      })
      .select("id")
      .single(),
  );
  // What the door writes on a yes: an engagement that ended after one carries it.
  if (won)
    ok(
      await w.admin.from("events").insert({
        tenant_id: w.tenant,
        kind: "deal.won",
        category: "deal",
        subject_type: "deal",
        subject_id: row.id,
        data: { deal_id: row.id, stage: "won" },
      }),
    );
  return row.id;
}

const pace = async (client, tenant) => {
  const rows = ok(await client.rpc("deal_pace", { p_tenant_id: tenant }));
  assert.equal(rows.length, 1, "one answer, even for none");
  return [rows[0].median_days, rows[0].decided];
};

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `pace-${Date.now()}`, name: "Pace" })
      .select("id")
      .single(),
  ).id;
  w.other = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `pace-other-${Date.now()}`, name: "Other" })
      .select("id")
      .single(),
  ).id;
  w.owner = await member("owner", w.tenant);
  w.viewer = await member("viewer", w.tenant);
  w.stranger = await member("owner", w.other);
  w.contact = ok(
    await w.admin
      .from("contacts")
      .insert({ tenant_id: w.tenant, phone_e164: "+15125550181", display_name: "Fixture Pace Person" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip || !w.admin) return;
  if (w.tenant) {
    await w.admin.from("deals").delete().eq("tenant_id", w.tenant);
    await w.admin.from("events").delete().eq("tenant_id", w.tenant);
    await w.admin.from("contacts").delete().eq("tenant_id", w.tenant);
    await w.admin.from("tenants").delete().eq("id", w.tenant);
  }
  if (w.other) await w.admin.from("tenants").delete().eq("id", w.other);
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

test("none decided: no median, and none counted", { skip }, async () => {
  assert.deepEqual(await pace(w.owner, w.tenant), [null, 0]);
});

test(
  "the median whole days from proposal to yes, over the last year's yeses: won, or ended after a yes; never a pass, an open proposal, an end without a yes, or an old yes",
  { skip },
  async () => {
    await deal("A", "won", 40, 30); // 10 days
    await deal("B", "won", 34, 30); // 4 days
    await deal("C", "won", 50, 30); // 20 days
    await deal("D", "ended", 37, 30, true); // 7 days, a client before it ended
    await deal("E", "ended", 33, 30); // ended without a yes: not one
    await deal("F", "lost", 35, 30); // a pass
    await deal("G", "proposed", 12, null); // still out
    await deal("H", "won", 410, 400); // a yes older than a year
    await deal("I", "won", 28, 30); // recorded before its proposal: the same day
    assert.deepEqual(await pace(w.owner, w.tenant), [7, 5], "0, 4, 7, 10, 20");
    // Between two days, half up: 0, 4, 7, 10, 14, 20 is 8.5, said as 9.
    await deal("J", "won", 44, 30); // 14 days
    assert.deepEqual(await pace(w.owner, w.tenant), [9, 6]);
    assert.deepEqual(await pace(w.viewer, w.tenant), [9, 6], "every member reads the workspace's pace");
    assert.deepEqual(await pace(w.admin, w.tenant), [9, 6], "and the service role");
  },
);

test("row security decides whose deals count: another workspace's member counts none of these", { skip }, async () => {
  assert.deepEqual(await pace(w.stranger, w.tenant), [null, 0]);
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const r = await anon.rpc("deal_pace", { p_tenant_id: w.tenant });
  assert.ok(r.error, "no one signed out may ask");
});
