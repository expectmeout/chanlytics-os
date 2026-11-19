/**
 * 00648 on a real Postgres: a business's ads are kept (decision 0049, step P1; the Ads plan's step 2, the records).
 *
 * Three tables and an account's token, before any door writes them. What must hold of the ground itself: an account's
 * token lives in Vault and is reached by the service role alone, through three functions that write no table; a
 * platform's account is held by one workspace at a time, and a workspace holds one live account a platform; only an
 * account still to be chosen names no account; an ad names its account with its workspace and its platform, so it can
 * be neither another workspace's nor another platform's; a read written twice is one ad and one day; and an account
 * removed takes its ads and their days. That members read their workspace's rows and write none is the tenancy
 * suite's (database/tenancy.db.test.mjs). Runs against the database `supabase start` builds on this machine, never
 * production.
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
      ? "refusing a database that is not on this machine: this suite writes workspaces and Vault secrets"
      : false;
const skipMember = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the owner this case signs in needs it" : false);

const stamp = Date.now();
const users = [];
const kept = []; // accounts whose Vault secret a case may have left
let db;
let here; // the workspace under test
let other; // another workspace
let seq = 0;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
/** A refusal by the database, by its code and the key or check that refused. */
const refused = (res, code, by, why) => {
  assert.ok(res.error, `REGRESSION: written: ${why}`);
  assert.equal(res.error.code, code, `${why}: ${res.error.message}`);
  if (by) assert.match(res.error.message, by, why);
};

/** An account as a connect would write it, in `tenant`: connected, under a platform id of its own unless one is given. */
const account = (tenant, over = {}) => ({
  tenant_id: tenant,
  platform: "meta",
  external_id: `act-${stamp}-${++seq}`,
  name: "Harbor ads",
  currency: "USD",
  timezone: "America/New_York",
  status: "connected",
  ...over,
});
const keepAccount = async (row) => {
  const id = ok(await db.from("ad_accounts").insert(row).select("id").single()).id;
  kept.push(id);
  return id;
};
/** An ad the owner made on the platform, as a read would adopt it. */
const ad = (tenant, accountId, over = {}) => ({
  tenant_id: tenant,
  account_id: accountId,
  platform: "meta",
  origin: "platform",
  name: "Spring offer",
  door: "whatsapp",
  platform_ad_id: `ad-${stamp}-${++seq}`,
  status: "made",
  intent: "on",
  ...over,
});

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (tag) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `harbor-ads-${tag}-${stamp}`, name: `Harbor Ads ${tag}` })
        .select("id")
        .single(),
    ).id;
  here = await workspace("a");
  other = await workspace("b");
});

after(async () => {
  if (skip) return;
  for (const id of kept) await db.rpc("ad_credentials_drop", { p_account_id: id });
  for (const id of [here, other]) if (id) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "an account's token is kept in Vault through its three functions, and written again in place",
  { skip },
  async () => {
    const id = await keepAccount(account(here, { status: "disconnected" }));
    assert.equal(ok(await db.rpc("ad_credentials_get", { p_account_id: id })), null, "none is kept at first");
    const name = ok(await db.rpc("ad_credentials_put", { p_account_id: id, p_secret: { access_token: "first" } }));
    assert.equal(name, `ad-creds-${id}`, "the secret is named for its account");
    assert.deepEqual(ok(await db.rpc("ad_credentials_get", { p_account_id: id })), { access_token: "first" });
    ok(await db.rpc("ad_credentials_put", { p_account_id: id, p_secret: { access_token: "second" } }));
    assert.deepEqual(
      ok(await db.rpc("ad_credentials_get", { p_account_id: id })),
      { access_token: "second" },
      "a second write replaces the first: one secret an account",
    );
    assert.equal(ok(await db.rpc("ad_credentials_drop", { p_account_id: id })), true);
    assert.equal(ok(await db.rpc("ad_credentials_get", { p_account_id: id })), null, "dropped");
    assert.equal(ok(await db.rpc("ad_credentials_drop", { p_account_id: id })), false, "nothing left to drop");
    // The row itself carries no word of a token: nothing on it says where one is kept.
    const row = ok(await db.from("ad_accounts").select("*").eq("id", id).single());
    assert.deepEqual(
      Object.keys(row).filter((column) => /cred|secret|token(?!_expires_at)/.test(column)),
      [],
    );
  },
);

test("a token is kept only for an account that stands", { skip }, async () => {
  const put = await db.rpc("ad_credentials_put", {
    p_account_id: "00000000-0000-4000-8000-000000000648",
    p_secret: { access_token: "nobody's" },
  });
  assert.ok(put.error, "REGRESSION: a token was kept for no account");
  assert.match(put.error.message, /no such account/);
});

test("no member and no visitor may reach a token", { skip: skipMember }, async () => {
  const id = await keepAccount(account(here, { status: "disconnected" }));
  ok(await db.rpc("ad_credentials_put", { p_account_id: id, p_secret: { access_token: "the owner's" } }));
  const email = `ads-owner-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: here, user_id: made.data.user.id, role: "owner" }));
  const owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await owner.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, signedIn.error?.message);
  const visitor = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const [who, client] of [
    ["the workspace's owner", owner],
    ["a visitor", visitor],
  ]) {
    for (const [fn, args] of [
      ["ad_credentials_get", { p_account_id: id }],
      ["ad_credentials_put", { p_account_id: id, p_secret: { access_token: "theirs" } }],
      ["ad_credentials_drop", { p_account_id: id }],
    ]) {
      const tried = await client.rpc(fn, args);
      assert.ok(tried.error, `REGRESSION: ${who} ran ${fn}`);
      assert.equal(tried.error.code, "42501", `${who}, ${fn}: ${tried.error.message}`);
    }
  }
  assert.deepEqual(
    ok(await db.rpc("ad_credentials_get", { p_account_id: id })),
    { access_token: "the owner's" },
    "and the token stands as it was",
  );
});

test("a platform's account is held by one workspace at a time", { skip }, async () => {
  const mine = account(here);
  const id = await keepAccount(mine);
  const theirs = account(other, { external_id: mine.external_id });
  refused(
    await db.from("ad_accounts").insert(theirs),
    "23505",
    /ad_accounts_held_once/,
    "a second workspace took an account another holds",
  );
  // Access taken back by the platform is still held: only the owner's disconnect lets it go.
  ok(await db.from("ad_accounts").update({ status: "revoked" }).eq("id", id));
  refused(
    await db.from("ad_accounts").insert(theirs),
    "23505",
    /ad_accounts_held_once/,
    "a second workspace took an account whose access was only taken back",
  );
  ok(await db.from("ad_accounts").update({ status: "disconnected" }).eq("id", id));
  await keepAccount(theirs);
});

test(
  "a workspace holds one live account a platform, and connecting an account again finds its row",
  { skip },
  async () => {
    const live = ok(
      await db.from("ad_accounts").select("id, external_id").eq("tenant_id", here).neq("status", "disconnected"),
    );
    assert.deepEqual(live, [], "this workspace starts the case with none live");
    const first = account(here);
    const id = await keepAccount(first);
    refused(
      await db.from("ad_accounts").insert(account(here)),
      "23505",
      /ad_accounts_one_live/,
      "a second live account on one platform",
    );
    refused(
      await db.from("ad_accounts").insert(account(here, { status: "choosing", external_id: null })),
      "23505",
      /ad_accounts_one_live/,
      "one still to be chosen beside one connected",
    );
    // Another platform's is another account.
    await keepAccount(account(here, { platform: "google" }));
    ok(await db.from("ad_accounts").update({ status: "disconnected" }).eq("id", id));
    // The one let go stays, with its ads: the same account connected again is its row, never a second.
    refused(
      await db.from("ad_accounts").insert(account(here, { external_id: first.external_id })),
      "23505",
      /ad_accounts_one_a_workspace/,
      "a second row for an account this workspace already holds",
    );
    await keepAccount(account(here));
  },
);

test("only an account still to be chosen names none", { skip }, async () => {
  for (const status of ["connected", "revoked", "disconnected"])
    refused(
      await db.from("ad_accounts").insert(account(other, { status, platform: "tiktok", external_id: null })),
      "23514",
      /ad_accounts_named_once_chosen/,
      `an account that is ${status} named no account`,
    );
  await keepAccount(account(other, { status: "choosing", platform: "tiktok", external_id: null }));
});

test(
  "an ad names its account with its workspace and its platform, and is one row at its platform",
  { skip },
  async () => {
    const mine = await keepAccount(account(here, { status: "disconnected" }));
    const theirs = await keepAccount(account(other, { status: "disconnected" }));
    refused(
      await db.from("ads").insert(ad(here, theirs)),
      "23503",
      /ads_account_id_same_workspace/,
      "an ad named another workspace's account",
    );
    refused(
      await db.from("ads").insert(ad(here, mine, { platform: "google" })),
      "23503",
      /ads_account_id_same_workspace/,
      "an ad of one platform named an account of another",
    );
    const row = ad(here, mine);
    const id = ok(await db.from("ads").insert(row).select("id, version").single());
    assert.equal(id.version, 1, "an ad starts at its first version");
    refused(
      await db.from("ads").insert(ad(here, mine, { platform_ad_id: row.platform_ad_id })),
      "23505",
      /ads_one_at_its_platform/,
      "one ad at its platform was written twice",
    );
    refused(
      await db.from("ads").insert(ad(here, mine, { platform_ad_id: null })),
      "23514",
      /ads_made_names_its_platform_id/,
      "an ad the platform holds named no id there",
    );
    refused(
      await db.from("ads").insert(ad(here, mine, { budget_kind: "total" })),
      "23514",
      /ads_budget_is_whole/,
      "a budget's kind with no amount",
    );
  },
);

test("a day names its ad with its workspace, is one row a day, and goes with its ad's account", { skip }, async () => {
  const mine = await keepAccount(account(here, { status: "disconnected" }));
  const adId = ok(await db.from("ads").insert(ad(here, mine)).select("id").single()).id;
  const day = { tenant_id: here, ad_id: adId, day: "2026-11-01", spend_minor: 1250, impressions: 400, clicks: 12 };
  ok(await db.from("ad_days").insert(day));
  refused(await db.from("ad_days").insert(day), "23505", /ad_days_pkey/, "one ad's day was written twice");
  refused(
    await db.from("ad_days").insert({ ...day, tenant_id: other, day: "2026-11-02" }),
    "23503",
    /ad_days_ad_id_same_workspace/,
    "a day named another workspace's ad",
  );
  // A read written again moves the day's numbers and makes no second row.
  ok(await db.from("ad_days").upsert({ ...day, spend_minor: 1300, settled: true }, { onConflict: "ad_id,day" }));
  const days = ok(await db.from("ad_days").select("spend_minor, settled").eq("ad_id", adId));
  assert.deepEqual(days, [{ spend_minor: 1300, settled: true }]);
  ok(await db.from("ad_accounts").delete().eq("id", mine));
  assert.deepEqual(ok(await db.from("ads").select("id").eq("id", adId)), [], "its ads went with the account");
  assert.deepEqual(ok(await db.from("ad_days").select("day").eq("ad_id", adId)), [], "and their days with them");
});
