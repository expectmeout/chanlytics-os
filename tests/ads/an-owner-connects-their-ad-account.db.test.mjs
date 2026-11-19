/**
 * 00649 on a real Postgres: an owner connects their ad account (decision 0049, step P1; decision 0050, call 2).
 *
 * The doors Connect writes through, each with its fact and that fact's event in one transaction. What must hold: the
 * owner alone connects, asked by the door itself whoever knocked; the row, the token in Vault, the decision and the
 * event are written together; the same account connected again is its row, never a second; another workspace's account
 * is refused, and so is a second account while one is connected; an account that waited to be chosen is answered by the
 * same door, in place or into the row the workspace held before; a read keeps what the platform said and tells of it
 * only where it moved; and access taken back is said once. Runs against the database `supabase start` builds on this
 * machine, never production.
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
      ? "refusing a database that is not on this machine: this suite writes workspaces, members and Vault secrets"
      : false;
const skipMember = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the member this case signs in needs it" : false);

const stamp = Date.now();
const users = [];
const workspaces = [];
let db;
let seq = 0;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const TOKEN = { access_token: "the-business-token", scopes: ["ads_read", "ads_management"] };

/** A workspace with its owner and an operator: who may connect, and who may not. */
async function workspace(tag) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-connect-${tag}-${stamp}`, name: `Harbor Connect ${tag}` })
      .select("id")
      .single(),
  ).id;
  workspaces.push(tenant);
  const member = async (role) => {
    const email = `ads-connect-${role}-${tag}-${stamp}@example.com`;
    const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
    return { id: made.data.user.id, email, password };
  };
  return { tenant, owner: await member("owner"), operator: await member("operator") };
}

/** An account as the edge hands it to the door: the platform's facts, read from its answers. */
const facts = (over = {}) => ({
  external_id: `1200${stamp}${++seq}`,
  name: "Harbor ads",
  currency: "USD",
  timezone: "America/New_York",
  standing: { account: "active", funding: "ok" },
  config: {
    page_id: "100200300400500",
    page_name: "Harbor Nails",
    scopes: ["ads_read", "ads_management"],
    choices: [],
  },
  token_expires_at: null,
  ...over,
});
const connect = async (ws, account, { actor = ws.owner.id, chosen = false, secret = TOKEN } = {}) =>
  ok(
    await db.rpc("ad_account_connect", {
      p_tenant_id: ws.tenant,
      p_actor: actor,
      p_platform: "meta",
      p_account: account,
      p_secret: secret,
      p_chosen: chosen,
    }),
  );
const accountsOf = async (tenant) =>
  ok(
    await db
      .from("ad_accounts")
      .select("id, external_id, status, name, standing, config, connected_by")
      .eq("tenant_id", tenant)
      .order("created_at"),
  );
const eventsOf = async (tenant, kind) =>
  ok(await db.from("events").select("subject_id, data").eq("tenant_id", tenant).eq("kind", kind).order("created_at"));
const decisionsOf = async (tenant) =>
  ok(
    await db
      .from("decisions")
      .select("subject_type, subject_id, verb, actor_type, actor_user_id, payload")
      .eq("tenant_id", tenant)
      .order("created_at"),
  );
const secretOf = async (id) => ok(await db.rpc("ad_credentials_get", { p_account_id: id }));

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const tenant of workspaces) {
    const rows = await db.from("ad_accounts").select("id").eq("tenant_id", tenant);
    for (const row of rows.data ?? []) await db.rpc("ad_credentials_drop", { p_account_id: row.id });
    await db.from("tenants").delete().eq("id", tenant);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("the owner connects: the row, the token, the decision and the event, written together", { skip }, async () => {
  const ws = await workspace("one");
  const account = facts();
  const answer = await connect(ws, account);
  assert.equal(answer.outcome, "connected");
  const [row] = await accountsOf(ws.tenant);
  assert.deepEqual(
    [row.id, row.external_id, row.status, row.name, row.connected_by],
    [answer.account_id, account.external_id, "connected", "Harbor ads", ws.owner.id],
  );
  assert.deepEqual(row.standing, account.standing);
  assert.equal(row.config.page_name, "Harbor Nails");
  assert.deepEqual(await secretOf(row.id), TOKEN);
  assert.deepEqual(await decisionsOf(ws.tenant), [
    {
      subject_type: "ad_account",
      subject_id: row.id,
      verb: "connect_ad_account",
      actor_type: "user",
      actor_user_id: ws.owner.id,
      payload: { platform: "meta", external_id: account.external_id, name: "Harbor ads" },
    },
  ]);
  const [told] = await eventsOf(ws.tenant, "ad_account.connected");
  assert.equal(told.subject_id, row.id);
  assert.deepEqual(
    [told.data.status, told.data.by, told.data.external_id],
    ["connected", ws.owner.id, account.external_id],
  );

  // The same account connected again is its row, with the new token: never a second.
  const again = await connect(
    ws,
    { ...account, name: "Harbor ads, renamed" },
    { secret: { access_token: "a-newer-token" } },
  );
  assert.deepEqual([again.outcome, again.account_id], ["connected", row.id]);
  const rows = await accountsOf(ws.tenant);
  assert.deepEqual([rows.length, rows[0].name], [1, "Harbor ads, renamed"]);
  assert.deepEqual(await secretOf(row.id), { access_token: "a-newer-token" });
});

test("anyone but the owner is refused by the door itself, and nothing is written", { skip }, async () => {
  const ws = await workspace("who");
  const stranger = await workspace("else");
  for (const actor of [ws.operator.id, stranger.owner.id])
    assert.deepEqual(await connect(ws, facts(), { actor }), { outcome: "not_allowed" });
  assert.deepEqual(await accountsOf(ws.tenant), []);
  assert.deepEqual(await decisionsOf(ws.tenant), []);
  assert.deepEqual(await eventsOf(ws.tenant, "ad_account.connected"), []);
});

test("an account another workspace holds is refused; a second beside one connected is too", { skip }, async () => {
  const mine = await workspace("holds");
  const theirs = await workspace("wants");
  const account = facts();
  const held = await connect(mine, account);
  assert.deepEqual(await connect(theirs, account), { outcome: "taken" });
  assert.deepEqual(await accountsOf(theirs.tenant), []);
  // Changing accounts is Disconnect, then Connect: with one connected, another is refused and nothing moves.
  assert.deepEqual(await connect(mine, facts()), { outcome: "another_connected", account_id: held.account_id });
  const [still] = await accountsOf(mine.tenant);
  assert.deepEqual([still.external_id, still.status], [account.external_id, "connected"]);
  assert.deepEqual(await secretOf(held.account_id), TOKEN);
});

test("two that could both be right: the row waits, and the owner's answer finishes it in place", { skip }, async () => {
  const ws = await workspace("ask");
  const choices = [
    {
      external_id: "120000000000000001",
      name: "Harbor",
      currency: "USD",
      timezone: "America/New_York",
      runs_page: true,
    },
    {
      external_id: "120000000000000002",
      name: "Harbor UK",
      currency: "GBP",
      timezone: "Europe/London",
      runs_page: false,
    },
  ];
  const waiting = await connect(
    ws,
    facts({ external_id: null, name: null, currency: null, timezone: null, standing: {}, config: { choices } }),
  );
  assert.equal(waiting.outcome, "choosing");
  const [row] = await accountsOf(ws.tenant);
  assert.deepEqual([row.status, row.external_id, row.config.choices.length], ["choosing", null, 2]);
  assert.deepEqual(await secretOf(row.id), TOKEN, "the token waits with the question");

  const chosen = facts({
    external_id: `1299${stamp}`,
    name: "Harbor UK",
    currency: "GBP",
    config: { choices: [] },
  });
  const answer = await connect(ws, chosen, { chosen: true });
  assert.deepEqual([answer.outcome, answer.account_id], ["connected", row.id]);
  const [after_] = await accountsOf(ws.tenant);
  assert.deepEqual(
    [after_.status, after_.external_id, after_.name, after_.config.choices],
    ["connected", chosen.external_id, "Harbor UK", []],
  );
  // Signing in was the owner's act, kept once; the answer is its own event.
  assert.equal((await decisionsOf(ws.tenant)).length, 1);
  assert.equal((await eventsOf(ws.tenant, "ad_account.chosen")).length, 1);
  assert.equal((await eventsOf(ws.tenant, "ad_account.connected")).length, 1);
});

test("an answer naming an account held before goes into that row, and the one that waited goes", { skip }, async () => {
  const ws = await workspace("back");
  const first = facts();
  const old = await connect(ws, first);
  // Let go, as a disconnect leaves it: the row stays, with what its ads brought.
  ok(
    await db
      .from("ad_accounts")
      .update({ status: "disconnected", disconnected_at: new Date().toISOString() })
      .eq("id", old.account_id),
  );
  ok(await db.rpc("ad_credentials_drop", { p_account_id: old.account_id }));
  const waiting = await connect(
    ws,
    facts({ external_id: null, name: null, currency: null, timezone: null, config: { choices: [] } }),
    { secret: { access_token: "the-second-sign-in" } },
  );
  assert.equal(waiting.outcome, "choosing");
  assert.notEqual(waiting.account_id, old.account_id);
  const answer = await connect(ws, first, { chosen: true, secret: { access_token: "the-second-sign-in" } });
  assert.deepEqual([answer.outcome, answer.account_id], ["connected", old.account_id]);
  const rows = await accountsOf(ws.tenant);
  assert.deepEqual(
    rows.map((row) => [row.id, row.status]),
    [[old.account_id, "connected"]],
  );
  assert.deepEqual(await secretOf(old.account_id), { access_token: "the-second-sign-in" });
  assert.equal(await secretOf(waiting.account_id), null, "the row that waited took its token with it");
});

test("access taken back, then another account connected: the first is let go, and says so", { skip }, async () => {
  const ws = await workspace("moved");
  const first = await connect(ws, facts());
  const revoke = async () =>
    ok(await db.rpc("ad_account_revoked", { p_tenant_id: ws.tenant, p_account_id: first.account_id, p_how: "read" }));
  assert.equal(await revoke(), true);
  assert.equal(await revoke(), false, "said once");
  const [revoked] = await eventsOf(ws.tenant, "ad_account.revoked");
  assert.deepEqual([revoked.subject_id, revoked.data.how], [first.account_id, "read"]);
  const second = await connect(ws, facts());
  assert.equal(second.outcome, "connected");
  const rows = await accountsOf(ws.tenant);
  assert.deepEqual(
    rows.map((row) => [row.id, row.status]),
    [
      [first.account_id, "disconnected"],
      [second.account_id, "connected"],
    ],
  );
  const [letGo] = await eventsOf(ws.tenant, "ad_account.disconnected");
  assert.deepEqual([letGo.subject_id, letGo.data.why], [first.account_id, "replaced"]);
  assert.equal(await secretOf(first.account_id), null);
});

test(
  "an account that still waits to be chosen was never connected: signed out or let go, its row goes with its token",
  { skip },
  async () => {
    const ws = await workspace("waited");
    const asking = () =>
      connect(
        ws,
        facts({
          external_id: null,
          name: null,
          currency: null,
          timezone: null,
          standing: {},
          config: { choices: [{ external_id: "120000000000000011", name: "Harbor" }] },
        }),
      );
    // The platform takes the sign-in back before the owner answers.
    const waiting = await asking();
    assert.equal(waiting.outcome, "choosing");
    assert.equal(
      ok(
        await db.rpc("ad_account_revoked", {
          p_tenant_id: ws.tenant,
          p_account_id: waiting.account_id,
          p_how: "platform",
        }),
      ),
      true,
    );
    assert.deepEqual(await accountsOf(ws.tenant), [], "no account was connected, so none is left marked");
    assert.equal(await secretOf(waiting.account_id), null);
    const [marked] = await eventsOf(ws.tenant, "ad_account.revoked");
    assert.deepEqual(
      [marked.subject_id, marked.data.how, marked.data.was],
      [waiting.account_id, "platform", "choosing"],
    );
    assert.deepEqual(
      ok(await db.from("notifications").select("id").eq("tenant_id", ws.tenant).eq("kind", "ad_account")),
      [],
      "and the bell says nothing of an account nobody connected",
    );

    // The owner signs in again, and lets it go instead of answering.
    const again = await asking();
    const done = ok(
      await db.rpc("ad_account_disconnect", {
        p_tenant_id: ws.tenant,
        p_actor: ws.owner.id,
        p_account_id: again.account_id,
      }),
    );
    assert.deepEqual(done, { outcome: "disconnected", left_running: [] });
    assert.deepEqual(await accountsOf(ws.tenant), []);
    assert.equal(await secretOf(again.account_id), null);
    const [letGo] = await eventsOf(ws.tenant, "ad_account.disconnected");
    assert.deepEqual([letGo.subject_id, letGo.data.why], [again.account_id, "not_chosen"]);
  },
);

test("a read keeps what the platform said, key by key, and tells of it only where it moved", { skip }, async () => {
  const ws = await workspace("read");
  const { account_id: id } = await connect(ws, facts());
  const keep = async (read) =>
    ok(await db.rpc("ad_account_read_keep", { p_tenant_id: ws.tenant, p_account_id: id, p_read: read }));
  const row = async () =>
    ok(
      await db
        .from("ad_accounts")
        .select("standing, config, name, read_at, read_error, usage_pct, read_after")
        .eq("id", id)
        .single(),
    );

  const first = {
    standing: { account: "active", funding: "ok" },
    config: { spend_limit_minor: 50000 },
    usage_pct: 12.5,
  };
  assert.equal(await keep(first), "moved");
  let now = await row();
  assert.deepEqual(
    [now.config.spend_limit_minor, now.config.page_name, Number(now.usage_pct)],
    [50000, "Harbor Nails", 12.5],
  );
  assert.equal(await keep({ standing: first.standing, config: first.config }), "kept");
  assert.equal(await keep({ standing: { account: "active", funding: "none" }, config: {} }), "moved");
  const told = await eventsOf(ws.tenant, "ad_account.standing");
  assert.equal(told.length, 2, "one event a move, none for a read that found the same");
  assert.deepEqual([told[1].data.from.funding, told[1].data.to.funding], ["ok", "none"]);

  // A read that failed says only that it did, and when the platform may be asked again: what stood, stands.
  const later = new Date(Date.now() + 300_000).toISOString();
  assert.equal(await keep({ error: "slowed", usage_pct: 100, read_after: later }), "failed");
  now = await row();
  assert.deepEqual([now.read_error, now.standing.funding, Number(now.usage_pct)], ["slowed", "none", 100]);
  assert.equal(Date.parse(now.read_after), Date.parse(later));
  assert.equal(await keep({ standing: { account: "active", funding: "ok" } }), "moved");
  now = await row();
  assert.deepEqual([now.read_error, now.read_after], [null, null], "a good read clears the failure and the wait");

  ok(await db.rpc("ad_account_revoked", { p_tenant_id: ws.tenant, p_account_id: id, p_how: "platform" }));
  assert.equal(await keep({ standing: { account: "disabled" } }), "not_connected");
  assert.equal((await row()).standing.account, "active", "an account that is not connected is not written");
});

test("no member and no visitor may knock on a door: each is the service role's", { skip: skipMember }, async () => {
  const ws = await workspace("doors");
  const { account_id: id } = await connect(ws, facts());
  const owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await owner.auth.signInWithPassword({ email: ws.owner.email, password: ws.owner.password });
  assert.equal(signedIn.error, null, signedIn.error?.message);
  const visitor = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const doors = [
    [
      "ad_account_connect",
      { p_tenant_id: ws.tenant, p_actor: ws.owner.id, p_platform: "meta", p_account: facts(), p_secret: TOKEN },
    ],
    ["ad_account_read_keep", { p_tenant_id: ws.tenant, p_account_id: id, p_read: {} }],
    ["ad_account_revoked", { p_tenant_id: ws.tenant, p_account_id: id, p_how: "read" }],
  ];
  for (const [who, client] of [
    ["the workspace's owner", owner],
    ["a visitor", visitor],
  ])
    for (const [fn, args] of doors) {
      const tried = await client.rpc(fn, args);
      assert.ok(tried.error, `REGRESSION: ${who} ran ${fn}`);
      assert.equal(tried.error.code, "42501", `${who}, ${fn}: ${tried.error.message}`);
    }
});
