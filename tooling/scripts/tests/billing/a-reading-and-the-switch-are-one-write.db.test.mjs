/**
 * A billing reading and the workspace's switch are one write (00379 billing_apply), on a real Postgres: the row under
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
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const LOCAL_DB = DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL) ? DB_URL : null;
const CLI_TARGET = LOCAL_DB
  ? ["--db-url", `${LOCAL_DB}${LOCAL_DB.includes("?") ? "&" : "?"}sslmode=disable`]
  : ["--local"];

/** One statement (a DO block for several) run as one transaction on a connection of its own, answered when it ends. */
const transaction = (sql) =>
  new Promise((resolve, reject) => {
    const child = spawn(CLI, ["db", "query", ...CLI_TARGET, sql], { cwd: ROOT });
    let said = "";
    child.stdout.on("data", (d) => (said += d));
    child.stderr.on("data", (d) => (said += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(said) : reject(new Error(`exit ${code}: ${said.slice(-600)}`))));
  });

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

test("a customer Stripe deleted is forgotten only while the row still names it, and the forgetting writes its nulls", async (t) => {
  if (skip) return t.skip(skip);
  // #1527's guard, now the door's: a customer routed here by its metadata may be one the workspace has left.
  const FORGET = {
    stripe_customer_id: null,
    stripe_subscription_id: null,
    status: "none",
    card_brand: null,
    card_last4: null,
  };
  const before_ = await rowNow();
  assert.equal(before_.stripe_customer_id, "cus_fixture");
  const other = await apply(db, { p_row: FORGET, p_expect: { stripe_customer_id: "cus_left_behind" } });
  assert.equal(other.error, null, other.error?.message);
  assert.equal(other.data, false, "another customer forgets nothing");
  assert.deepEqual(await rowNow(), before_, "and nothing moved");

  const mixed = await apply(db, {
    p_row: FORGET,
    p_expect: { stripe_customer_id: "cus_fixture", status: before_.status, updated_at: before_.updated_at },
  });
  assert.equal(mixed.error?.code, "22023", "an expectation is a reading's or a customer's, never both");

  const own = await apply(db, { p_row: FORGET, p_expect: { stripe_customer_id: "cus_fixture" } });
  assert.equal(own.error, null, own.error?.message);
  assert.equal(own.data, true, "the row's own customer is forgotten");
  const now = await rowNow();
  assert.deepEqual(
    [now.stripe_customer_id, now.stripe_subscription_id, now.status, now.card_last4],
    [null, null, "none", null],
    "the nulls are written as nulls",
  );
  // The fixture's customer back, for any case after this one.
  ok(await apply(db, { p_row: { stripe_customer_id: "cus_fixture", status: before_.status } }));
});

test("a stamp that waits behind a reading writes over the reading, never the row before it", async (t) => {
  if (skip) return t.skip(skip);
  // invoice.paid and customer.subscription.updated arrive milliseconds apart. The reading takes the row and holds it
  // for two seconds; the stamp, started meanwhile, waits on the row's lock. The door reads the row as the lock finds it,
  // so the stamp keeps the reading's status: an UPDATE whose values came from a second scan of the table wrote the
  // status from before the reading back over it.
  const at = await rowNow();
  ok(await apply(db, { p_row: { status: "trialing" }, p_expect: { status: at.status, updated_at: at.updated_at } }));
  const planned = await rowNow();
  const reading = transaction(
    `do $$ begin perform public.billing_apply('${A}', '{"status":"active","card_last4":"1881"}'::jsonb, ` +
      `'${JSON.stringify({ status: planned.status, updated_at: planned.updated_at })}'::jsonb, 'active'); ` +
      `perform pg_sleep(2); end $$`,
  );
  await new Promise((r) => setTimeout(r, 700));
  const stamp = transaction(
    `select public.billing_apply('${A}', '{"last_paid_at":"2026-10-10T09:00:00Z"}'::jsonb, null, null);`,
  );
  await Promise.all([reading, stamp]);
  const now = await rowNow();
  assert.equal(now.status, "active", "REGRESSION: the stamp wrote the row from before the reading back over it");
  assert.equal(now.card_last4, "1881", "the reading's card stands");
  assert.equal(Date.parse(now.last_paid_at), Date.parse("2026-10-10T09:00:00Z"), "and the stamp is on it too");
  assert.equal(await switchNow(), "active");
  // The row and the switch as the cases before this one left them, for the one after.
  ok(await apply(db, { p_row: { status: "paused" }, p_tenant_status: "paused" }));
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
