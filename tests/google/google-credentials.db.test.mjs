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
import { query } from "./_db-stack.mjs";

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
  // Its read and its drop too, and for a signed-in member as for nobody (pinned as 00070's text in
  // google/profile/connecting-reviews-and-the-mirror.test.mjs until 26 Nov 2026).
  for (const door of ["get_google_credentials", "drop_google_credentials"]) {
    const asked = await anon.rpc(door, { p_tenant_id: A });
    assert.equal(asked.error?.code, "42501", `${door}: ${JSON.stringify(asked)}`);
  }
  for (const fn of [
    "put_google_credentials(uuid, jsonb, text)",
    "get_google_credentials(uuid)",
    "drop_google_credentials(uuid)",
  ])
    for (const role of ["anon", "authenticated"])
      assert.deepEqual(
        query(`select has_function_privilege('${role}', 'public.${fn}', 'execute') as may`),
        [{ may: false }],
        `${role} may not call ${fn}`,
      );
});

test(
  "a disconnect forgets the token: the Vault secret named for the workspace is gone, and its read answers nothing",
  { skip },
  async () => {
    ok(await db.rpc("put_google_credentials", { p_tenant_id: A, p_secret: token("rt-9", "at-9") }), "connect");
    const named = () => query(`select count(*)::int as n from vault.secrets where name = 'google-creds-${A}'`);
    assert.deepEqual(named(), [{ n: 1 }], "kept under the workspace's own name");
    ok(await db.rpc("drop_google_credentials", { p_tenant_id: A }), "disconnect");
    assert.deepEqual(named(), [{ n: 0 }], "the secret itself is deleted, not emptied");
    assert.equal(await stored(), null);
  },
);

test(
  "a connection is the workspace's one row: it may wait for its location, which is Google's own name, and goes with the workspace",
  { skip },
  async () => {
    const set = (location_name) => db.from("google_connections").update({ location_name }).eq("tenant_id", A);
    assert.equal((await set(null)).error, null, "a connection may wait for its location");
    assert.equal((await set("locations/222")).error, null);
    assert.equal((await set("places/222")).error?.code, "23514", "a location is Google's name for one");
    const second = await db.from("google_connections").insert({ tenant_id: A, account_name: "accounts/2" });
    assert.equal(second.error?.code, "23505", "one connection a workspace");
    const B = ok(
      await db
        .from("tenants")
        .insert({ slug: `google-creds-b-${stamp}`, name: "Gone Co", timezone: "America/Chicago" })
        .select("id")
        .single(),
      "tenant",
    ).id;
    ok(await db.from("google_connections").insert({ tenant_id: B, account_name: "accounts/3" }), "its connection");
    await db.from("events").delete().eq("tenant_id", B);
    ok(await db.from("tenants").delete().eq("id", B), "the workspace goes");
    assert.deepEqual(
      ok(await db.from("google_connections").select("tenant_id").eq("tenant_id", B)),
      [],
      "and it with it",
    );
  },
);

test(
  "members read a connection and nobody writes one but the service role; the frame hears it change",
  { skip },
  () => {
    assert.deepEqual(
      query(
        "select cmd, roles::text as roles from pg_policies where schemaname = 'public' and tablename = 'google_connections'",
      ),
      [{ cmd: "SELECT", roles: "{authenticated}" }],
      "one policy, a member's read: the edge writes with the service role",
    );
    // The frame hears a connection change on its workspace's own topic (decision 0019): the table is one packages/db's
    // realtime.ts watches, and its tell triggers are on it (each-workspace-is-told-what-changed.db.test.mjs runs what they
    // tell). 00070 put the table in the realtime publication; since 00324 no page listens there.
    assert.deepEqual(
      query(
        "select tgname from pg_trigger where tgrelid = 'public.google_connections'::regclass and tgname like 'workspace_tell_%' order by tgname",
      ),
      [{ tgname: "workspace_tell_delete" }, { tgname: "workspace_tell_insert" }, { tgname: "workspace_tell_update" }],
      "the frame hears it change",
    );
  },
);
