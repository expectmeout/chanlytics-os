/**
 * An Instagram account connects, disconnects and moves between workspaces, on a real database (00677, decision 0143).
 *
 * The two doors the edge's Instagram and Meta doors call, as the service role calls them: a connect is one write (the
 * row, its token in Vault, the row on); a connected account is refused to another workspace, which is told who holds
 * it, and a lapsed connection is still connected; a disconnect turns the row off, frees the account and deletes the
 * token; the account then connects in another workspace, and moving back gives the first workspace its own row again;
 * a row left off and still holding an account (the code before 00677) lets go at the next connect; a second, different
 * account in a workspace that has one is refused; and no session may call either door.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces, users and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const stamp = Date.now().toString(36);
/** Accounts of this run's own: an Instagram account's id is digits, and the key is unique across every workspace. */
const account = (n) => `17841${String(Date.now()).slice(-9)}${n}`;
let db;
let first;
let second;
let third;
let owner;
const users = [];

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const connect = (tenant, accountId, config = {}, secret = { access_token: "token" }) =>
  db.rpc("instagram_account_connect", {
    p_tenant_id: tenant,
    p_account_id: accountId,
    p_config: config,
    p_secret: secret,
  });
const disconnect = (tenant, channel, by = null) =>
  db.rpc("instagram_account_disconnect", { p_tenant_id: tenant, p_channel_id: channel, p_by: by });
const rowOf = async (id) => ok(await db.from("tenant_channels").select("*").eq("id", id).maybeSingle(), "the row");
const rowsOf = async (tenant) =>
  ok(await db.from("tenant_channels").select("id").eq("tenant_id", tenant).eq("kind", "instagram"), "the rows");
const tokenOf = async (id) => ok(await db.rpc("get_channel_credentials", { p_channel_id: id }), "the token");
const eventsOf = async (tenant) =>
  ok(
    await db
      .from("events")
      .select("kind, category, subject_type, subject_id, data")
      .eq("tenant_id", tenant)
      .order("created_at"),
    "the ledger",
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenants = ok(
    await db
      .from("tenants")
      .insert(["a", "b", "c"].map((n) => ({ name: `Moves ${n} ${stamp}`, slug: `moves-${n}-${stamp}` })))
      .select("id"),
    "the workspaces",
  );
  [first, second, third] = tenants.map((t) => t.id);
  const email = `moves-owner-${stamp}@example.com`;
  const password = `pw-${stamp}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: first, user_id: made.data.user.id, role: "owner" }), "the seat");
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), "the owner signs in");
  owner = { client, id: made.data.user.id };
});

after(async () => {
  if (skip) return;
  const all = [first, second, third];
  // Each row's token leaves Vault with it, through the door, before the rows go with their workspaces.
  const rows = ok(await db.from("tenant_channels").select("id, tenant_id").in("tenant_id", all), "the rows");
  for (const row of rows) await disconnect(row.tenant_id, row.id);
  await db.from("events").delete().in("tenant_id", all);
  await db.from("tenant_channels").delete().in("tenant_id", all);
  await db.from("memberships").delete().in("tenant_id", all);
  await db.from("tenants").delete().in("id", all);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "an account connects in one write, is refused to another workspace, and moves once it is disconnected",
  { skip },
  async () => {
    const X = account(1);
    const config = {
      login: "meta",
      username: "harbor.nails",
      connected_by: owner.id,
      scopes: ["instagram_basic"],
      token_checked_at: "2026-11-21T00:00:00Z",
    };
    const made = ok(await connect(first, X, config, { access_token: "first-token", account_id: X }), "connect");
    assert.equal(made.outcome, "connected");
    assert.equal(made.was, "new");
    let row = await rowOf(made.channel_id);
    assert.deepEqual([row.status, row.external_id, row.tenant_id], ["active", X, first]);
    assert.equal(row.credentials_ref, `wa-creds-${made.channel_id}`);
    assert.equal((await tokenOf(made.channel_id)).access_token, "first-token");
    // The connection is on the ledger with it, written by the door: which account, through which sign-in, and who.
    assert.deepEqual(await eventsOf(first), [
      {
        kind: "channel.connected",
        category: "system",
        subject_type: "channel",
        subject_id: made.channel_id,
        data: { kind: "instagram", account_id: X, username: "harbor.nails", by: owner.id, login: "meta" },
      },
    ]);

    // Connected: another workspace is refused, told who holds it, and nothing is written there.
    assert.deepEqual(ok(await connect(second, X), "refused"), { outcome: "taken", held_by: first });
    assert.equal((await rowsOf(second)).length, 0);
    // Meta stopped accepting the token: still connected, still held.
    ok(
      await db
        .from("tenant_channels")
        .update({ config: { ...config, token_lapsed_at: "2026-11-21T00:00:00Z" } })
        .eq("id", made.channel_id),
      "lapsed",
    );
    assert.equal(ok(await connect(second, X), "refused while lapsed").outcome, "taken");

    // Disconnect lets go: the row off, the account's id freed, the token gone, the handle and who kept.
    assert.deepEqual(ok(await disconnect(first, made.channel_id, owner.id), "disconnect"), {
      outcome: "let_go",
      account_id: X,
      was: "active",
    });
    row = await rowOf(made.channel_id);
    assert.deepEqual(
      [row.status, row.external_id, row.credentials_ref],
      ["disabled", `let-go:${made.channel_id}`, null],
    );
    assert.equal(row.config.account_id, X);
    assert.equal(row.config.username, "harbor.nails");
    assert.equal(row.config.disconnected_by, owner.id);
    assert.ok(Date.parse(row.config.disconnected_at) > Date.now() - 60_000);
    for (const gone of ["scopes", "token_checked_at", "token_lapsed_at"])
      assert.equal(row.config[gone], undefined, gone);
    assert.equal(await tokenOf(made.channel_id), null, "no token is kept for an account that was disconnected");
    assert.deepEqual((await eventsOf(first)).at(-1), {
      kind: "channel.disconnected",
      category: "system",
      subject_type: "channel",
      subject_id: made.channel_id,
      data: { kind: "instagram", login: "meta", account_id: X, username: "harbor.nails", by: owner.id },
    });
    assert.deepEqual(ok(await disconnect(first, made.channel_id), "twice"), { outcome: "already" });
    assert.equal((await eventsOf(first)).length, 2, "said once");
    assert.deepEqual(ok(await disconnect(second, made.channel_id), "not theirs"), { outcome: "gone" });

    // The move: the second workspace connects it, on a row of its own; the first workspace's row is as it was left.
    const moved = ok(
      await connect(second, X, { login: "meta", username: "harbor.nails" }, { access_token: "second-token" }),
      "move",
    );
    assert.equal(moved.outcome, "connected");
    assert.equal(moved.was, "new");
    assert.notEqual(moved.channel_id, made.channel_id);
    assert.equal((await rowOf(made.channel_id)).external_id, `let-go:${made.channel_id}`);
    assert.deepEqual(ok(await connect(first, X), "the first is refused now"), { outcome: "taken", held_by: second });

    // Moving back: the second lets go, and the first gets its own row again, with the new connection's config and token.
    ok(await disconnect(second, moved.channel_id), "the second disconnects");
    const back = ok(
      await connect(first, X, { login: "meta", username: "harbor.nails" }, { access_token: "third-token" }),
      "back",
    );
    assert.deepEqual(back, { outcome: "connected", channel_id: made.channel_id, was: "own" });
    row = await rowOf(made.channel_id);
    assert.deepEqual([row.status, row.external_id], ["active", X]);
    assert.equal(row.config.account_id, undefined);
    assert.equal((await tokenOf(made.channel_id)).access_token, "third-token");
    assert.equal((await rowsOf(first)).length, 1, "one row, the same one");

    // Connect again over the live row: the same row, the token replaced.
    const again = ok(
      await connect(first, X, { login: "meta", username: "harbor.nails" }, { access_token: "fourth-token" }),
      "again",
    );
    assert.deepEqual(again, { outcome: "connected", channel_id: made.channel_id, was: "own" });
    assert.equal((await tokenOf(made.channel_id)).access_token, "fourth-token");

    // One account a workspace: a second, different one is refused with the handle of the one connected.
    const Y = account(2);
    assert.deepEqual(ok(await connect(first, Y, { username: "harbor.spa" }), "a second account"), {
      outcome: "another_here",
      username: "harbor.nails",
    });
    assert.equal(ok(await db.from("tenant_channels").select("id").eq("external_id", Y), "nothing written").length, 0);
  },
);

test("a row left off and still holding its account lets go when another workspace connects it", { skip }, async () => {
  const Z = account(3);
  // As the code before 00677 left a disconnect, or a connect that died before its token was kept.
  const left = ok(
    await db
      .from("tenant_channels")
      .insert({
        tenant_id: third,
        kind: "instagram",
        external_id: Z,
        status: "disabled",
        config: { username: "left.behind" },
      })
      .select("id")
      .single(),
    "the row left behind",
  );
  ok(
    await db.rpc("put_channel_credentials", { p_channel_id: left.id, p_secret: { access_token: "left-token" } }),
    "its token",
  );
  const taken = ok(await connect(second, Z, { username: "left.behind" }), "connect elsewhere");
  assert.equal(taken.outcome, "connected");
  const row = await rowOf(left.id);
  assert.deepEqual([row.status, row.external_id, row.credentials_ref], ["disabled", `let-go:${left.id}`, null]);
  assert.equal(row.config.account_id, Z);
  assert.equal(row.config.disconnected_by, undefined, "nobody pressed it");
  assert.equal(await tokenOf(left.id), null);
  // It had no connection to end: its workspace's ledger says nothing of it.
  assert.deepEqual(await eventsOf(third), []);
});

test("what is no account, and what is no config, is refused before anything is written", { skip }, async () => {
  for (const bad of ["abc", "1234", "17841 400000", ""]) {
    const refused = await connect(third, bad);
    assert.equal(refused.error?.code, "22023", `"${bad}"`);
  }
  const noConfig = await db.rpc("instagram_account_connect", {
    p_tenant_id: third,
    p_account_id: account(4),
    p_config: [],
    p_secret: {},
  });
  assert.equal(noConfig.error?.code, "22023");
});

test("no session may call either door: a member's is refused, and so is nobody's", { skip }, async () => {
  const nobody = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const client of [owner.client, nobody]) {
    const connected = await client.rpc("instagram_account_connect", {
      p_tenant_id: first,
      p_account_id: account(5),
      p_config: {},
      p_secret: {},
    });
    assert.ok(connected.error, "connect is the service role's");
    const [mine] = await rowsOf(first);
    const disconnected = await client.rpc("instagram_account_disconnect", {
      p_tenant_id: first,
      p_channel_id: mine.id,
      p_by: owner.id,
    });
    assert.ok(disconnected.error, "disconnect is the service role's");
  }
  assert.equal((await rowOf((await rowsOf(first))[0].id)).status, "active", "and nothing changed");
});
