/**
 * An owner connects their ad account (decision 0049, step P1; the Ads plan's step 2): the edge's op table
 * (apps/edge/lib/ads/account-ops.ts runAdsAccountOp) run over a database in memory, with Meta's answers as its
 * reference pages document them, and the rules that pick the Page and the ad account.
 *
 * The way in: only where this deployment offers Ads in the workspace, and only for the owner, asked before anything is
 * asked of Meta. The code is traded for the business's token; a sign-in that may not read ads keeps nothing. Chanlytics
 * picks the Page linked to the number AI answers and the ad account that Page's ads run from, and asks only where two
 * could both be the one. One door then writes the account, its token, the decision and the event. Looking again reads
 * the account and its Page as they are now, never faster than Meta's pace, and marks a sign-in Meta no longer takes.
 * And Meta's own call, when a business removes the app there, marks every account that sign-in connected.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";

const ENV = ["META_APP_ID", "META_APP_SECRET", "META_ADS_CONFIG_ID", "META_ADS_REDIRECT_URI", "ADS_WORKSPACES"];
for (const k of [...ENV, "SUPABASE_URL"]) delete process.env[k];
const T = "abababab-4444-4000-8000-000000000001";
const OTHER = "abababab-4444-4000-8000-000000000002";
const U = "cdcdcdcd-4444-4000-8000-000000000001";
const APP = {
  META_APP_ID: "990000000000077",
  META_APP_SECRET: "meta-secret-for-this-file",
  META_ADS_CONFIG_ID: "880000000000002",
  META_ADS_REDIRECT_URI: "https://app.example.com/api/v1/ads/connect/callback",
  ADS_WORKSPACES: T,
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { runAdsAccountOp, adsOfferedIn } = await import(at("apps/edge/lib/ads/account-ops.ts"));
const { receiveAdsDeauthorize } = await import(at("apps/edge/lib/ads/deauthorize.ts"));
const { pickAccount, pickPage } = await import(at("apps/edge/lib/ads/pick.ts"));
const { mayAskMeta, readAfterOf } = await import(at("apps/edge/lib/ads/pace.ts"));

const auth = { ok: true, via: "token", workspace: T, user: U };
const A1 = "1200000000000041";
const A2 = "1200000000000042";
const PAGE = "100200300400500";
const AI_NUMBER = "+15550100142";

/**
 * A field the saved sign-in's five permissions do not reach, and Meta's answer to a question that names it: the whole
 * answer is refused, as it was on the first real Connect (19 November 2026).
 */
const NOT_REACHED = /(^|,)business(\{|,|$)/;
const NOT_REACHED_ANSWER = [
  400,
  { error: { message: "(#100) Requires business_management permission to access the field.", code: 100 } },
];

/** Meta, as the way in meets it: each endpoint answers as `answers` says, and what it was asked is kept. */
let answers = {};
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  asked.push(`${init?.method ?? "GET"} ${u.pathname.replace("/v27.0/", "")}`);
  const reply = (status, body, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  if (NOT_REACHED.test(u.searchParams.get("fields") ?? "")) return reply(...NOT_REACHED_ANSWER);
  const named = Object.keys(answers).find((key) => u.pathname.endsWith(`/${key}`));
  const [status, body, headers] = named
    ? answers[named]
    : [404, { error: { code: 100, error_subcode: 33, message: "Unknown path" } }];
  return reply(status, body, headers);
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

const metaAccount = (id, over = {}) => ({
  account_id: id,
  name: id === A1 ? "Harbor" : "Harbor UK",
  currency: id === A1 ? "USD" : "GBP",
  timezone_name: "America/New_York",
  account_status: 1,
  funding_source: "9900000000000001",
  spend_cap: "0",
  min_daily_budget: 100,
  ...over,
});

/**
 * A workspace whose owner is U, the number AI answers, no ad account yet, and the doors the connect writes through:
 * each answers as 00649's does, over the tables and a Vault in memory.
 */
function world({
  owner = true,
  accounts = [A1],
  scopes = ["ads_read", "ads_management", "pages_show_list"],
  taken = false,
} = {}) {
  resetBreakers();
  Object.assign(process.env, APP);
  asked.length = 0;
  const tables = {
    ad_accounts: [],
    tenant_channels: [
      {
        id: "ch-1",
        tenant_id: T,
        kind: "whatsapp",
        status: "active",
        number_e164: AI_NUMBER,
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
  };
  const vault = {};
  const kept = { reads: [], revoked: [] };
  let seq = 0;
  const db = fakeDb(
    tables,
    {},
    {
      has_permission: ({ p_permission }) => owner && p_permission === "ads",
      ad_account_connect: ({ p_tenant_id, p_actor, p_platform, p_account, p_secret, p_chosen }) => {
        if (taken) return { outcome: "taken" };
        const live = tables.ad_accounts.find((row) => row.tenant_id === p_tenant_id && row.status !== "disconnected");
        const id = live?.id ?? `acc-${++seq}`;
        const row = {
          id,
          tenant_id: p_tenant_id,
          platform: p_platform,
          external_id: p_account.external_id,
          name: p_account.name,
          currency: p_account.currency,
          timezone: p_account.timezone,
          status: p_account.external_id ? "connected" : "choosing",
          standing: p_account.standing,
          config: p_account.config,
          token_expires_at: p_account.token_expires_at,
          connected_by: p_actor,
          read_at: null,
          read_after: null,
          chosen: p_chosen,
        };
        if (live) Object.assign(live, row);
        else tables.ad_accounts.push(row);
        vault[id] = p_secret;
        return { outcome: row.status, account_id: id };
      },
      ad_credentials_get: ({ p_account_id }) => vault[p_account_id] ?? null,
      ad_account_read_keep: ({ p_account_id, p_read }) => {
        kept.reads.push(p_read);
        const row = tables.ad_accounts.find((r) => r.id === p_account_id);
        if (p_read.error) return "failed";
        Object.assign(row, { standing: p_read.standing, config: { ...row.config, ...p_read.config } });
        return "kept";
      },
      ad_account_revoked: ({ p_account_id, p_how }) => {
        const row = tables.ad_accounts.find((r) => r.id === p_account_id);
        if (!row || row.status === "revoked") return false;
        row.status = "revoked";
        kept.revoked.push([p_account_id, p_how]);
        return true;
      },
    },
  );
  setPg(db);
  answers = {
    access_token: [200, { access_token: "bisu-token", token_type: "bearer" }],
    debug_token: [
      200,
      {
        data: {
          is_valid: true,
          expires_at: 0,
          user_id: "61550000000001",
          scopes,
          granular_scopes: [
            { scope: "ads_read", target_ids: accounts },
            { scope: "pages_show_list", target_ids: [PAGE] },
          ],
        },
      },
    ],
    me: [200, { client_business_id: "583355900000001", id: "61550000000001" }],
    [PAGE]: [200, { id: PAGE, name: "Harbor Nails", whatsapp_number: "+1 555-010-0142" }],
    [`act_${A1}`]: [200, metaAccount(A1)],
    [`act_${A2}`]: [200, metaAccount(A2)],
    promote_pages: [200, { data: [] }],
  };
  return { tables, vault, kept };
}
const heard = async (res) => [res.status, await res.json()];
const run = (body) => runAdsAccountOp(auth, { tenant_id: T, user_id: U, ...body });

test("Ads is offered only in the workspaces this deployment lists, or in every one where it lists a star", () => {
  for (const [listed, here, elsewhere] of [
    [undefined, false, false],
    ["", false, false],
    [T, true, false],
    [` ${OTHER} , ${T} `, true, true],
    ["*", true, true],
  ]) {
    if (listed === undefined) delete process.env.ADS_WORKSPACES;
    else process.env.ADS_WORKSPACES = listed;
    assert.deepEqual([adsOfferedIn(T), adsOfferedIn(OTHER)], [here, elsewhere], String(listed));
  }
});

test("status says whether the app's sign-in for ads is held here and whether Ads is offered in this workspace", async () => {
  world();
  for (const k of ENV) delete process.env[k];
  assert.deepEqual(await heard(await run({ op: "status" })), [
    200,
    { ok: true, ready: false, on: false, writes: "off" },
  ]);
  Object.assign(process.env, APP);
  assert.deepEqual(await heard(await run({ op: "status" })), [
    200,
    {
      ok: true,
      ready: true,
      on: true,
      writes: "off",
      app: { client_id: APP.META_APP_ID, config_id: APP.META_ADS_CONFIG_ID, redirect_uri: APP.META_ADS_REDIRECT_URI },
    },
  ]);
  assert.deepEqual(asked, [], "asking whether it can be connected asks Meta nothing");
});

test("one ad account and one Page: connected, with what Meta said of each and the token in Vault", async () => {
  const w = world();
  assert.deepEqual(await heard(await run({ op: "connect", code: "the-code" })), [
    200,
    { ok: true, outcome: "connected", account_id: "acc-1" },
  ]);
  const [row] = w.tables.ad_accounts;
  assert.deepEqual(
    [row.external_id, row.name, row.currency, row.timezone, row.status, row.connected_by],
    [A1, "Harbor", "USD", "America/New_York", "connected", U],
  );
  assert.deepEqual(row.standing, { account: "active", funding: "ok" });
  assert.deepEqual(row.config, {
    business_id: "583355900000001",
    page_id: PAGE,
    page_name: "Harbor Nails",
    page_whatsapp: "15550100142",
    instagram_handle: null,
    spend_limit_minor: null,
    min_daily_minor: 100,
    choices: [],
    scopes: ["ads_read", "ads_management", "pages_show_list"],
    user_id: "61550000000001",
  });
  assert.equal(w.vault["acc-1"].access_token, "bisu-token");
  assert.equal(w.vault["acc-1"].user_id, "61550000000001");
  // One account alone is asked nothing more: which account a Page's ads run from only matters between two.
  assert.deepEqual(asked, ["GET oauth/access_token", "GET debug_token", "GET me", `GET ${PAGE}`, `GET act_${A1}`]);
});

test("the owner alone, asked before anything is asked of Meta; and only where Ads is offered", async () => {
  world({ owner: false });
  assert.deepEqual(await heard(await run({ op: "connect", code: "the-code" })), [
    403,
    { ok: false, error: "ad_account_not_owner" },
  ]);
  assert.deepEqual(asked, []);
  world();
  process.env.ADS_WORKSPACES = OTHER;
  const [status, body] = await heard(await run({ op: "connect", code: "the-code" }));
  assert.deepEqual([status, body.error], [409, "meta_off"]);
  assert.deepEqual(asked, []);
  world();
  delete process.env.META_ADS_CONFIG_ID;
  assert.deepEqual(await heard(await run({ op: "connect", code: "the-code" })), [
    503,
    { ok: false, error: "no_app_credentials" },
  ]);
});

test("a sign-in that may not read ads keeps nothing; one that shared no ad account says so", async () => {
  const w = world({ scopes: ["pages_show_list"] });
  const [status, body] = await heard(await run({ op: "connect", code: "the-code" }));
  assert.deepEqual([status, body.error], [403, "scope_missing"]);
  assert.deepEqual(w.tables.ad_accounts, []);
  const none = world({ accounts: [] });
  answers.assigned_ad_accounts = [200, { data: [] }];
  const [noStatus, noBody] = await heard(await run({ op: "connect", code: "the-code" }));
  assert.deepEqual([noStatus, noBody.error], [409, "no_account"]);
  assert.deepEqual(none.tables.ad_accounts, []);
  assert.ok(
    asked.includes("GET me/assigned_ad_accounts"),
    "the list is asked for where the sign-in's own description names none",
  );
});

test("the account is asked only what the sign-in's permissions reach, and its business is the sign-in's own", async () => {
  // Meta here refuses any question naming `business`, as it did on the first real Connect: the account is read all
  // the same, and the business comes from /me.
  const w = world();
  assert.deepEqual((await heard(await run({ op: "connect", code: "the-code" })))[1].outcome, "connected");
  assert.equal(w.tables.ad_accounts[0].config.business_id, "583355900000001");
  // Where two are left to choose from, the business waits with them, and the answer keeps it.
  const ask = world({ accounts: [A1, A2] });
  await run({ op: "connect", code: "the-code" });
  const [waiting] = ask.tables.ad_accounts;
  assert.equal(waiting.config.business_id, "583355900000001");
  await run({ op: "choose", external_id: A1 });
  assert.deepEqual([waiting.status, waiting.config.business_id], ["connected", "583355900000001"]);
  // A look again writes what the account says now, and the business stands.
  await run({ op: "check" });
  assert.equal(waiting.config.business_id, "583355900000001");
});

test("a shared ad account Meta will not describe is said as unread, never as none shared", async () => {
  // Meta refuses the question about the one account shared: the owner is told it could not be read, and nothing is kept.
  const one = world();
  answers[`act_${A1}`] = [400, { error: { message: "(#100) Tried accessing nonexisting field", code: 100 } }];
  const [status, body] = await heard(await run({ op: "connect", code: "the-code" }));
  assert.deepEqual([status, body.error], [502, "accounts_unreadable"]);
  assert.deepEqual(one.tables.ad_accounts, []);
  // Meta, busy, gives no answer for one of two: the other is connected, and nothing is said of the one.
  const two = world({ accounts: [A1, A2] });
  answers[`act_${A2}`] = [503, { error: { message: "Service temporarily unavailable", code: 2 } }];
  assert.deepEqual((await heard(await run({ op: "connect", code: "the-code" })))[1].outcome, "connected");
  assert.equal(two.tables.ad_accounts[0].external_id, A1);
  // The one read is closed and the other unread: the unread one may be the one meant, so it is not said that none can.
  const closed = world({ accounts: [A1, A2] });
  answers[`act_${A1}`] = [200, metaAccount(A1, { account_status: 101 })];
  answers[`act_${A2}`] = [400, { error: { message: "(#100) Tried accessing nonexisting field", code: 100 } }];
  assert.deepEqual((await heard(await run({ op: "connect", code: "the-code" })))[1].error, "accounts_unreadable");
  assert.deepEqual(closed.tables.ad_accounts, []);
  // Every account read, and every one closed: then none shared can run ads.
  world({ accounts: [A1] });
  answers[`act_${A1}`] = [200, metaAccount(A1, { account_status: 101 })];
  assert.deepEqual((await heard(await run({ op: "connect", code: "the-code" })))[1].error, "no_account");
  // The list of what was shared, refused: not knowing is not "none shared".
  world({ accounts: [] });
  answers.assigned_ad_accounts = [400, { error: { message: "(#100) Requires business_management", code: 100 } }];
  const [listStatus, listBody] = await heard(await run({ op: "connect", code: "the-code" }));
  assert.deepEqual([listStatus, listBody.error], [502, "accounts_unreadable"]);
});

test("two ad accounts: the one the Page's ads run from is connected; where neither says, the owner is asked", async () => {
  const w = world({ accounts: [A1, A2] });
  // Only A2 has run the Page's ads.
  let promoted = 0;
  answers.promote_pages = [200, { data: [] }];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(`act_${A2}/promote_pages`)) {
      promoted += 1;
      return new Response(JSON.stringify({ data: [{ id: PAGE }] }), { status: 200 });
    }
    return real(url, init);
  };
  assert.deepEqual((await heard(await run({ op: "connect", code: "the-code" })))[1].outcome, "connected");
  globalThis.fetch = real;
  assert.equal(promoted, 1);
  assert.equal(w.tables.ad_accounts[0].external_id, A2);

  const ask = world({ accounts: [A1, A2] });
  assert.deepEqual((await heard(await run({ op: "connect", code: "the-code" })))[1].outcome, "choosing");
  const [waiting] = ask.tables.ad_accounts;
  assert.deepEqual([waiting.status, waiting.external_id, waiting.name], ["choosing", null, null]);
  assert.deepEqual(
    waiting.config.choices.map((choice) => [choice.external_id, choice.currency, choice.runs_page]),
    [
      [A1, "USD", false],
      [A2, "GBP", false],
    ],
  );
  assert.equal(waiting.config.page_id, PAGE, "the Page picked is kept beside the question");

  // The owner's answer: the account is read again, and the same door finishes the connect.
  asked.length = 0;
  assert.deepEqual(await heard(await run({ op: "choose", external_id: A2 })), [
    200,
    { ok: true, outcome: "connected", account_id: waiting.id },
  ]);
  assert.deepEqual(asked, [`GET act_${A2}`]);
  assert.deepEqual(
    [waiting.status, waiting.external_id, waiting.currency, waiting.chosen, waiting.config.choices],
    ["connected", A2, "GBP", true, []],
  );
  assert.equal(ask.vault[waiting.id].access_token, "bisu-token", "the token that waited is the one kept");
  const [status, body] = await heard(await run({ op: "choose", external_id: A1 }));
  assert.deepEqual([status, body.error], [409, "nothing_to_do"]);
});

test("an answer that is not one of the accounts to choose from is refused before Meta is asked", async () => {
  world({ accounts: [A1, A2] });
  await run({ op: "connect", code: "the-code" });
  asked.length = 0;
  const [status, body] = await heard(await run({ op: "choose", external_id: "1200000000000099" }));
  assert.deepEqual([status, body.error], [400, "bad_request"]);
  assert.deepEqual(asked, []);
});

test("an account another workspace holds is refused, in a code the page says in words", async () => {
  const w = world({ taken: true });
  assert.deepEqual(await heard(await run({ op: "connect", code: "the-code" })), [
    409,
    { ok: false, error: "ad_account_taken" },
  ]);
  assert.deepEqual(w.tables.ad_accounts, []);
});

test("looking again reads the account and its Page as they are now, and is not asked twice in one breath", async () => {
  const w = world();
  await run({ op: "connect", code: "the-code" });
  asked.length = 0;
  answers[`act_${A1}`] = [200, metaAccount(A1, { funding_source: undefined, account_status: 2 })];
  answers[PAGE] = [200, { id: PAGE, name: "Harbor Nails" }];
  assert.deepEqual(await heard(await run({ op: "check" })), [200, { ok: true, outcome: "kept" }]);
  assert.deepEqual(asked, [`GET act_${A1}`, `GET ${PAGE}`]);
  const [row] = w.tables.ad_accounts;
  assert.deepEqual(row.standing, { account: "disabled", funding: "none" });
  assert.equal(row.config.page_whatsapp, null, "the Page is no longer linked to a number");
  // Just read: the owner coming back twice is one look.
  row.read_at = new Date().toISOString();
  asked.length = 0;
  assert.deepEqual((await heard(await run({ op: "check" })))[1].outcome, "fresh");
  assert.deepEqual(asked, []);
});

test("Meta's pace holds a look back, and a slowed answer says when to return", async () => {
  const w = world();
  await run({ op: "connect", code: "the-code" });
  const [row] = w.tables.ad_accounts;
  row.read_after = new Date(Date.now() + 60_000).toISOString();
  asked.length = 0;
  assert.deepEqual((await heard(await run({ op: "check" })))[1].outcome, "waiting");
  assert.deepEqual(asked, [], "nothing is sent that Meta would refuse");
  row.read_after = null;
  answers[`act_${A1}`] = [
    400,
    { error: { code: 17, error_subcode: 2446079, message: "User request limit reached" } },
    { "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: 100, reset_time_duration: 120 }) },
  ];
  assert.deepEqual((await heard(await run({ op: "check" })))[1].outcome, "failed");
  const [failed] = w.kept.reads.slice(-1);
  assert.deepEqual([failed.error, failed.usage_pct], ["slowed", 100]);
  // Meta's own two minutes are shorter than the five its score takes to ease: the longer is waited out.
  const wait = Date.parse(failed.read_after) - Date.now();
  assert.ok(wait > 4.9 * 60_000 && wait <= 5 * 60_000, `waits about five minutes, said ${wait}`);
});

test("a sign-in Meta no longer takes marks the account: access taken back, learned by a read", async () => {
  const w = world();
  await run({ op: "connect", code: "the-code" });
  answers[`act_${A1}`] = [400, { error: { code: 190, message: "Error validating access token" } }];
  assert.deepEqual((await heard(await run({ op: "check" })))[1].outcome, "revoked");
  assert.deepEqual(w.kept.revoked, [["acc-1", "read"]]);
  assert.equal(w.tables.ad_accounts[0].status, "revoked");
});

const signedForm = (payload, secret = APP.META_APP_SECRET) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signed = `${createHmac("sha256", secret).update(body).digest("base64url")}.${body}`;
  return new Request("https://edge.example.com/api/ads/deauthorize", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ signed_request: signed }).toString(),
  });
};

test("Meta's own call, when a business removes the app, marks every account that sign-in connected", async () => {
  const w = world();
  await run({ op: "connect", code: "the-code" });
  const removed = { user_id: "61550000000001", algorithm: "HMAC-SHA256", issued_at: 1795000000 };
  assert.deepEqual(await heard(await receiveAdsDeauthorize(signedForm(removed, "someone-elses-secret"))), [
    401,
    { ok: false, error: "bad_signature" },
  ]);
  assert.equal(w.tables.ad_accounts[0].status, "connected", "a call nobody signed changes nothing");
  assert.deepEqual(await heard(await receiveAdsDeauthorize(signedForm(removed))), [200, { ok: true }]);
  assert.deepEqual(w.kept.revoked, [["acc-1", "platform"]]);
  // Told twice, or told of someone Chanlytics does not hold: received, and nothing more is written.
  assert.deepEqual(await heard(await receiveAdsDeauthorize(signedForm(removed))), [200, { ok: true }]);
  assert.deepEqual(await heard(await receiveAdsDeauthorize(signedForm({ ...removed, user_id: "61550000000009" }))), [
    200,
    { ok: true },
  ]);
  assert.equal(w.kept.revoked.length, 1);
});

/* ---------------------------------------------------------------------------------------------- the rules -- */

const page = (id, whatsapp = null) => ({ id, name: `Page ${id}`, whatsapp, instagram: null });
const seen = (id, over = {}, runsPage = false) => ({
  account: { id, name: `Account ${id}`, currency: "USD", timezone: "UTC", standing: "active", funded: true, ...over },
  runsPage,
});

test("the Page is the one linked to the number AI answers, else the only one shared, else none", () => {
  const linked = page("2", "15550100142");
  assert.equal(pickPage([page("1"), linked, page("3", "15550109999")], AI_NUMBER), linked);
  assert.equal(pickPage([page("1")], AI_NUMBER)?.id, "1", "the only one shared");
  assert.equal(pickPage([page("1")], null)?.id, "1");
  assert.equal(pickPage([page("1"), page("3")], AI_NUMBER), null, "several, and none linked: there is no telling");
  assert.equal(pickPage([], AI_NUMBER), null);
});

test("the ad account is the only one, else the only one the Page's ads run from, else the owner is asked", () => {
  assert.equal(pickAccount([]), null);
  assert.deepEqual(pickAccount([seen("1")]), { one: seen("1") });
  assert.equal(pickAccount([seen("1", { standing: "closed" })]), null, "a closed account is not one to connect");
  assert.deepEqual(pickAccount([seen("1", { standing: "closing" }), seen("2", { standing: "disabled" })]), {
    one: seen("2", { standing: "disabled" }),
  });
  assert.deepEqual(pickAccount([seen("1"), seen("2", {}, true)]), { one: seen("2", {}, true) });
  // Neither, or both: the likelier first, then by name.
  assert.deepEqual(
    pickAccount([seen("2"), seen("1")]).ask.map((candidate) => candidate.account.id),
    ["1", "2"],
  );
  assert.deepEqual(
    pickAccount([seen("1", {}, true), seen("3"), seen("2", {}, true)]).ask.map((candidate) => candidate.account.id),
    ["1", "2", "3"],
  );
});

test("Meta's pace: a slowed caller and a high share each wait for the score to ease; a short wait of Meta's is kept", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const inS = (iso) => (Date.parse(iso) - now) / 1000;
  assert.equal(readAfterOf(null, null, now), null);
  assert.equal(readAfterOf({ pct: 40, waitS: 0 }, null, now), null);
  assert.equal(inS(readAfterOf({ pct: 40, waitS: 30 }, null, now)), 30);
  assert.equal(inS(readAfterOf({ pct: 75, waitS: 0 }, null, now)), 300);
  assert.equal(inS(readAfterOf({ pct: 100, waitS: 900 }, "slowed", now)), 900);
  assert.equal(inS(readAfterOf(null, "slowed", now)), 300);
  assert.equal(mayAskMeta({ read_after: null }, now), true);
  assert.equal(mayAskMeta({ read_after: "2026-11-19T12:00:01Z" }, now), false);
  assert.equal(mayAskMeta({ read_after: "2026-11-19T11:59:59Z" }, now), true);
});
