/**
 * The Business Profile's token, kept in Vault through its one write path (00070, 00364), on a real Postgres.
 *
 * A connect writes the token whatever is there. A refresh names the refresh token it read (p_if_refresh_token) and is
 * written only while the stored token still carries it: a reconnect stored between the refresh's read and its write is
 * kept, and the refresh is refused with 40001, writing nothing. A call that names two arguments, as every caller before
 * 00364 does, writes as it always did; and the door stays the service role's alone.
 *
 * Local stack only: it makes a workspace and a Vault secret, and drops both.
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
      ? "refusing a database that is not on this machine: this suite makes a workspace and a secret"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

const stamp = Date.now().toString(36);
let db;
let A;
const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const token = (refresh, access) => ({ refresh_token: refresh, access_token: access, expires_at: 1, scope: "s" });
const stored = async () => ok(await db.rpc("get_google_credentials", { p_tenant_id: A }), "read");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `google-creds-${stamp}`, name: "Vault Co", timezone: "America/Chicago" })
      .select("id")
      .single(),
    "tenant",
  ).id;
  ok(await db.from("google_connections").insert({ tenant_id: A, account_name: "accounts/1" }), "connection");
});

after(async () => {
  if (skip || !A) return;
  await db.rpc("drop_google_credentials", { p_tenant_id: A });
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
});

test("a refresh is written only over the grant it refreshed; a reconnect since it read stands", { skip }, async () => {
  // A connect, as every caller before 00364 writes: two arguments, whatever is there.
  assert.equal(
    ok(await db.rpc("put_google_credentials", { p_tenant_id: A, p_secret: token("rt-1", "at-1") }), "connect"),
    `google-creds-${A}`,
  );
  // A refresh of that grant: written.
  ok(
    await db.rpc("put_google_credentials", {
      p_tenant_id: A,
      p_secret: token("rt-1", "at-2"),
      p_if_refresh_token: "rt-1",
    }),
    "refresh",
  );
  assert.deepEqual(await stored(), token("rt-1", "at-2"));

  // The owner reconnects (a new grant, perhaps another account's) while a refresh of the old one is at Google.
  ok(await db.rpc("put_google_credentials", { p_tenant_id: A, p_secret: token("rt-2", "at-new") }), "reconnect");
  const late = await db.rpc("put_google_credentials", {
    p_tenant_id: A,
    p_secret: token("rt-1", "at-3"),
    p_if_refresh_token: "rt-1",
  });
  assert.equal(late.error?.code, "40001", JSON.stringify(late));
  assert.deepEqual(await stored(), token("rt-2", "at-new"), "the reconnect stands");

  // A token dropped on disconnect is never brought back by a refresh that was under way.
  ok(await db.rpc("drop_google_credentials", { p_tenant_id: A }), "disconnect");
  const after_ = await db.rpc("put_google_credentials", {
    p_tenant_id: A,
    p_secret: token("rt-2", "at-4"),
    p_if_refresh_token: "rt-2",
  });
  assert.equal(after_.error?.code, "40001", JSON.stringify(after_));
});

test("the door is the service role's alone", { skip }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await anon.rpc("put_google_credentials", {
    p_tenant_id: A,
    p_secret: token("rt-x", "at-x"),
    p_if_refresh_token: "rt-x",
  });
  assert.equal(r.error?.code, "42501", JSON.stringify(r));
});
