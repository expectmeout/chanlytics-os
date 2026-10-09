/**
 * A billing reading and the workspace's switch are one write (00361 billing_apply), on a real Postgres: the row under
 * its compare-and-set and tenants.status in one transaction. They were two statements on the edge, and a failure
 * between them left a workspace paid and paused until Stripe's next event. Here the switch is made to fail AFTER the
 * row is written (a status tenants' own CHECK refuses), and the row's write goes back with it; a reading planned
 * against a row that has moved writes nothing and says so; and the door takes only the columns a reading writes.
 *
 * Runs against the database `supabase start` builds on this machine, never production; makes its own workspace and
 * removes it.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let A;
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `billed-${RUN}`, name: "Harbor Moving Co" })
      .select("id")
      .single(),
  ).id;
  ok(
    await db
      .from("billing_accounts")
      .upsert({ tenant_id: A, mode: "stripe", status: "trialing", stripe_customer_id: "cus_fixture" }),
  );
});
after(async () => {
  if (skip) return;
  if (A) await db.from("tenants").delete().eq("id", A);
  for (const u of users) await db.auth.admin.deleteUser(u);
});

const rowNow = async () =>
  ok(
    await db
      .from("billing_accounts")
      .select("status, updated_at, stripe_subscription_id, card_last4, last_paid_at, stripe_customer_id, mode")
      .eq("tenant_id", A)
      .single(),
  );
const switchNow = async () => ok(await db.from("tenants").select("status").eq("id", A).single()).status;
const apply = (client, args) => client.rpc("billing_apply", { p_tenant_id: A, ...args });
const READING = { stripe_subscription_id: "sub_1", status: "paused", card_brand: "visa", card_last4: "4242" };

test("a reading planned against the row as it stands is written with the switch, and the next reading plans against the new row", async (t) => {
  if (skip) return t.skip(skip);
  const before_ = await rowNow();
  assert.equal(await switchNow(), "active");
  const { data, error } = await apply(db, {
    p_row: READING,
    p_expect: { status: before_.status, updated_at: before_.updated_at },
    p_tenant_status: "paused",
  });
  assert.equal(error, null, error?.message);
  assert.equal(data, true, "won");
  const now = await rowNow();
  assert.deepEqual([now.status, now.stripe_subscription_id, now.card_last4], ["paused", "sub_1", "4242"]);
  assert.equal(now.stripe_customer_id, "cus_fixture", "a column the reading did not name keeps its value");
  assert.notEqual(now.updated_at, before_.updated_at, "updated_at moved with the write");
  assert.equal(await switchNow(), "paused", "the receptionist is stopped in the same write");

  // The same reading again, planned against the row it already replaced: another reading won, nothing moves.
  const stale = await apply(db, {
    p_row: { ...READING, status: "active" },
    p_expect: { status: before_.status, updated_at: before_.updated_at },
    p_tenant_status: "active",
  });
  assert.equal(stale.error, null, stale.error?.message);
  assert.equal(stale.data, false, "raced");
  assert.equal((await rowNow()).status, "paused");
  assert.equal(await switchNow(), "paused", "the switch did not move for a reading that lost");
});

test("a switch the database refuses takes the row's write back with it", async (t) => {
  if (skip) return t.skip(skip);
  const before_ = await rowNow();
  const r = await apply(db, {
    p_row: { status: "active", stripe_subscription_id: "sub_2" },
    p_expect: { status: before_.status, updated_at: before_.updated_at },
    p_tenant_status: "gone",
  });
  assert.equal(r.error?.code, "23514", r.error?.message);
  const now = await rowNow();
  assert.deepEqual(
    [now.status, now.stripe_subscription_id, now.updated_at],
    [before_.status, before_.stripe_subscription_id, before_.updated_at],
    "the row is as it was: the write went back with the refused switch",
  );
  assert.equal(await switchNow(), "paused");
});

test("the door takes the columns a reading writes and no other; a write nothing races needs no expectation; no row is no write", async (t) => {
  if (skip) return t.skip(skip);
  const stray = await apply(db, { p_row: { status: "active", mode: "direct" } });
  assert.equal(stray.error?.code, "22023", stray.error?.message);
  assert.match(stray.error.message, /mode is not a column a reading writes/);
  assert.equal((await rowNow()).mode, "stripe");
  const planned = await apply(db, { p_row: { status: "active" }, p_expect: { status: "paused" } });
  assert.equal(planned.error?.code, "22023", "an expectation names a status and an updated_at");
  const shape = await apply(db, { p_row: "paid" });
  assert.equal(shape.error?.code, "22004", "a row is an object");

  // A stamp, and a customer's id before Checkout: the row as it stands, with the column laid over it.
  const stamp = await apply(db, { p_row: { last_paid_at: "2026-10-09T12:00:00Z" } });
  assert.equal(stamp.error, null, stamp.error?.message);
  assert.equal(stamp.data, true);
  const now = await rowNow();
  assert.equal(Date.parse(now.last_paid_at), Date.parse("2026-10-09T12:00:00Z"));
  assert.equal(now.status, "paused", "the stamp touched nothing else");
  assert.equal(await switchNow(), "paused", "and moved no switch");

  const none = await apply(db, { p_tenant_id: "00000000-0000-4000-8000-000000000000", p_row: { status: "active" } });
  assert.equal(none.error, null, none.error?.message);
  assert.equal(none.data, false, "no row, no write");
});

test("the door is the service role's alone: a member's session cannot call it", async (t) => {
  if (skip) return t.skip(skip);
  if (!ANON) return t.skip("no SUPABASE_ANON_KEY in env: the session this case signs in with needs it");
  const email = `billed-owner-${RUN}@example.com`;
  const password = `pw-${RUN}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  const r = await apply(client, { p_row: { status: "active" }, p_tenant_status: "active" });
  assert.ok(r.error, "refused");
  assert.match(r.error.message, /permission denied|not found|could not find/i);
  assert.equal(await switchNow(), "paused", "nothing moved");
});
