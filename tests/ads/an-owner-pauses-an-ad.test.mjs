/**
 * An owner pauses an ad and turns one back on (decision 0050, calls 1, 2 and 9; the Ads plan's C1, 5.2 and 6.4): the
 * edge's press (apps/edge/lib/ads/press.ts runAdPress) and the telling of Meta (tell.ts), run over a database in
 * memory whose doors answer as 00652's do, with Meta's answers as its pages document them.
 *
 * What must hold. Nothing is kept or sent while this deployment's switch is off, or for anyone but the owner. A press
 * is kept once and Meta told once: two presses at once make one change, and the same press again changes nothing. A
 * press drawn from an old read is refused. Meta takes one change to an ad every thirty seconds, so an Undo inside that
 * time is kept and lands once, when Meta will take it. A change Meta slows stays on its way; one that got no answer is
 * never sent again; one Meta refuses puts the ad back and says so; a sign-in Meta no longer takes marks the account.
 * And turning back on an ad with no total is refused before Meta is asked anything.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";

const ENV = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_ADS_CONFIG_ID",
  "META_ADS_REDIRECT_URI",
  "ADS_WORKSPACES",
  "ADS_WRITES",
];
for (const k of [...ENV, "SUPABASE_URL"]) delete process.env[k];
const T = "abababab-6666-4000-8000-000000000001";
const U = "cdcdcdcd-6666-4000-8000-000000000001";
const ACCOUNT = "acacacac-6666-4000-8000-000000000001";
const AD = "adadadad-6666-4000-8000-000000000001";
const META_AD = "23850000000000061";
const APP = {
  META_APP_ID: "990000000000077",
  META_APP_SECRET: "meta-secret-for-this-file",
  META_ADS_CONFIG_ID: "880000000000002",
  META_ADS_REDIRECT_URI: "https://app.example.com/api/v1/ads/connect/callback",
  ADS_WORKSPACES: T,
  ADS_WRITES: "live",
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { logger } = await import(at("apps/edge/lib/shared/log.ts"));
const { runAdPress } = await import(at("apps/edge/lib/ads/press.ts"));
const { tellAd, tellPending, mayTellNow, adsWrites } = await import(at("apps/edge/lib/ads/tell.ts"));

const auth = { ok: true, via: "token", workspace: T, user: U };

/** Meta, as a press meets it: the ad's switch (a POST) and its standing read back (a GET), each kept as asked. */
let answers = {};
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  const method = init?.method ?? "GET";
  asked.push(method === "POST" ? `set ${u.searchParams.get("status")}` : "standing");
  const [status, body, headers = {}] = answers[method === "POST" ? "set" : "standing"];
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

/**
 * A workspace whose owner is U, one connected account and one ad of it running, made in Meta with a total, an end
 * date and the budget to itself. The doors answer as 00652's do: one press at a time, by the ad's version.
 */
function world({ owner = true, ad = {}, account = {} } = {}) {
  resetBreakers();
  Object.assign(process.env, APP);
  asked.length = 0;
  answers = { set: [200, { success: true }], standing: [200, { effective_status: "PAUSED" }] };
  const tables = {
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: T,
        platform: "meta",
        external_id: "1200000000000061",
        status: "connected",
        read_after: null,
        ...account,
      },
    ],
    ads: [
      {
        id: AD,
        tenant_id: T,
        account_id: ACCOUNT,
        platform: "meta",
        origin: "platform",
        name: "Old boosted post",
        platform_ad_id: META_AD,
        status: "made",
        intent: "on",
        version: 3,
        intent_at: null,
        told_at: null,
        platform_state: "ACTIVE",
        budget_kind: "total",
        budget_minor: 40000,
        budget_left_minor: 18000,
        budget_shared: false,
        ends_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        ...ad,
      },
    ],
  };
  const row = tables.ads[0];
  const kept = { decisions: [], told: [], tellAsks: 0, readAsks: [], accountReads: [], revoked: [] };
  let tick = Date.now();
  const stamp = () => new Date((tick += 5)).toISOString();
  const mayResume = () =>
    row.origin === "chanlytics" ||
    (row.platform_state === "PAUSED" &&
      row.budget_kind === "total" &&
      row.ends_at !== null &&
      Date.parse(row.ends_at) > Date.now() &&
      row.budget_shared === false &&
      (row.budget_left_minor ?? 0) > 0);
  const db = fakeDb(
    tables,
    {},
    {
      has_permission: ({ p_permission }) => owner && p_permission === "ads",
      ad_credentials_get: () => ({ access_token: "the-business-token" }),
      ad_set_intent: ({ p_version, p_intent }) => {
        const pending = row.intent_at !== null && (row.told_at === null || row.told_at < row.intent_at);
        const facts = { account_id: ACCOUNT, platform_ad_id: META_AD };
        if (row.intent === p_intent) return { outcome: "same", version: row.version, pending, ...facts };
        if (row.version !== p_version) return { outcome: "stale", version: row.version };
        if (p_intent === "on" && !pending && !mayResume()) return { outcome: "cant_resume", version: row.version };
        const before = row.told_at;
        const now = stamp();
        Object.assign(row, {
          intent: p_intent,
          intent_at: now,
          told_at: pending ? now : row.told_at,
          version: row.version + 1,
        });
        kept.decisions.push(p_intent === "paused" ? "pause_ad" : "resume_ad");
        return { outcome: "asked", version: row.version, tell: !pending, told_at: before, ...facts };
      },
      ad_told: ({ p_asked, p_outcome, p_platform_state }) => {
        kept.told.push([p_asked, p_outcome]);
        const now = stamp();
        if (p_outcome === "refused") {
          Object.assign(row, { intent: p_asked === "paused" ? "on" : "paused", told_at: now, intent_at: now });
          return "refused";
        }
        Object.assign(row, { told_at: now, platform_state: p_platform_state ?? row.platform_state });
        return p_outcome;
      },
      ad_tell_ask: () => (kept.tellAsks += 1),
      ads_read_ask: ({ p_platform, p_external_id }) => kept.readAsks.push(`${p_platform}:${p_external_id}`),
      ad_account_read_keep: ({ p_read }) => {
        kept.accountReads.push(p_read);
        tables.ad_accounts[0].read_after = p_read.read_after ?? null;
        return p_read.error ? "failed" : "kept";
      },
      ad_account_revoked: ({ p_how }) => {
        kept.revoked.push(p_how);
        tables.ad_accounts[0].status = "revoked";
        return true;
      },
    },
  );
  setPg(db);
  const press = (op, version = row.version) => runAdPress(auth, { op, tenant_id: T, user_id: U, ad_id: AD, version });
  return { db, row, tables, kept, press };
}
const heard = async (res) => [res.status, await res.json()];
const who = () => ({
  tenantId: T,
  signIn: { token: "the-business-token", appSecret: APP.META_APP_SECRET },
  writes: adsWrites(),
});

test("nothing is kept or sent while the switch is off, in a workspace not on the list, or for anyone but the owner", async () => {
  const w = world();
  delete process.env.ADS_WRITES;
  assert.deepEqual((await heard(await w.press("pause")))[1].error, "ads_writes_off", "unset is off");
  process.env.ADS_WRITES = "live";
  process.env.ADS_WORKSPACES = "another-workspace";
  assert.deepEqual((await heard(await w.press("pause")))[1].error, "ads_writes_off");
  const stranger = world({ owner: false });
  const [status, body] = await heard(await stranger.press("pause"));
  assert.deepEqual([status, body.error], [403, "ad_account_not_owner"]);
  for (const one of [w, stranger])
    assert.deepEqual([one.kept.decisions, one.row.intent, one.row.version], [[], "on", 3]);
  assert.deepEqual(asked, [], "and Meta is asked nothing");
});

test("a pause is kept once, Meta is told once, and the ad says what Meta then says of it", async () => {
  const w = world();
  assert.deepEqual(await heard(await w.press("pause")), [200, { ok: true, outcome: "told", version: 4 }]);
  assert.deepEqual(asked, ["set PAUSED", "standing"], "the switch, then the ad read back");
  assert.deepEqual(
    [w.row.intent, w.row.platform_state, w.kept.decisions, w.kept.told],
    ["paused", "PAUSED", ["pause_ad"], [["paused", "told"]]],
  );
  assert.ok(w.row.told_at >= w.row.intent_at, "nothing is on its way");

  // The same press again (a double tap, a retry): what was asked already stands. Nothing is kept or sent again.
  assert.deepEqual(await heard(await w.press("pause", 3)), [200, { ok: true, outcome: "same", version: 4 }]);
  assert.deepEqual([asked.length, w.kept.decisions.length], [2, 1]);
});

test("two presses at once make one change", async () => {
  const w = world();
  const answers_ = await Promise.all([w.press("pause", 3), w.press("pause", 3)]);
  const outcomes = (await Promise.all(answers_.map(heard))).map(([status, body]) => [status, body.outcome]);
  assert.deepEqual(outcomes.sort(), [
    [200, "soon"],
    [200, "told"],
  ]);
  assert.deepEqual([w.kept.decisions, w.row.version], [["pause_ad"], 4], "one decision, one version");
  assert.deepEqual(
    asked.filter((one) => one.startsWith("set")),
    ["set PAUSED"],
    "and Meta is told once",
  );
});

test("a press drawn from an old read is refused, and nothing is sent", async () => {
  const w = world();
  const [status, body] = await heard(await w.press("pause", 2));
  assert.deepEqual([status, body.error], [409, "ad_stale"]);
  assert.deepEqual([asked, w.row.intent], [[], "on"]);
});

test("an Undo inside thirty seconds is kept, and lands once when Meta will take it", async () => {
  const w = world();
  await w.press("pause");
  // The owner takes it back seconds later. Meta holds the ad paused and takes no second change yet: it is kept.
  assert.deepEqual(await heard(await w.press("resume")), [200, { ok: true, outcome: "soon", version: 5 }]);
  assert.deepEqual(asked, ["set PAUSED", "standing"], "nothing more is sent inside the thirty seconds");
  assert.equal(w.kept.tellAsks, 1, "its account's read is asked for at the moment Meta will take it");
  assert.equal(mayTellNow(w.row.told_at, Date.now()), false);

  // That read sends it first, once.
  answers.standing = [200, { effective_status: "ACTIVE" }];
  const later = Date.now() + 32_000;
  const log = logger({ tenant_id: T });
  assert.deepEqual(await tellPending(w.db, log, who(), { accountId: ACCOUNT, nowMs: later }), {
    told: 1,
    usage: null,
    revoked: false,
  });
  assert.deepEqual(asked, ["set PAUSED", "standing", "set ACTIVE", "standing"]);
  assert.deepEqual([w.row.intent, w.row.platform_state], ["on", "ACTIVE"]);
  // And a second read finds nothing on its way.
  assert.deepEqual(await tellPending(w.db, log, who(), { accountId: ACCOUNT, nowMs: later + 60_000 }), {
    told: 0,
    usage: null,
    revoked: false,
  });
  assert.equal(asked.length, 4, "it lands once");
});

test("a pause Meta was never told of is taken back with nothing sent at all", async () => {
  const w = world({ account: { read_after: new Date(Date.now() + 300_000).toISOString() } });
  // Meta is holding the account back: the pause is kept on its way.
  assert.deepEqual(await heard(await w.press("pause")), [200, { ok: true, outcome: "soon", version: 4 }]);
  assert.deepEqual(await heard(await w.press("resume")), [200, { ok: true, outcome: "took_back", version: 5 }]);
  assert.deepEqual([asked, w.row.intent, w.kept.decisions], [[], "on", ["pause_ad", "resume_ad"]]);
  assert.ok(w.row.told_at >= w.row.intent_at, "nothing is left to tell");
});

test("an ad with no total is not turned back on from here, and Meta is not asked", async () => {
  const w = world({
    ad: { intent: "paused", platform_state: "PAUSED", budget_kind: "daily", budget_left_minor: null, ends_at: null },
  });
  const [status, body] = await heard(await w.press("resume"));
  assert.deepEqual([status, body.error], [409, "ad_cant_resume"]);
  assert.deepEqual([asked, w.kept.decisions, w.row.intent], [[], [], "paused"]);
});

test("a change Meta slows stays on its way, and the account keeps when Meta may be asked again", async () => {
  const w = world();
  answers.set = [
    400,
    { error: { message: "(#613) Calls to this api have exceeded the rate limit.", code: 613 } },
    { "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: 100, reset_time_duration: 200 }) },
  ];
  assert.deepEqual(await heard(await w.press("pause")), [200, { ok: true, outcome: "soon", version: 4 }]);
  assert.deepEqual([asked, w.kept.told], [["set PAUSED"], []], "sent once, and not marked told");
  assert.ok(w.row.told_at === null && w.row.intent === "paused", "the owner's pause is still on its way");
  assert.equal(w.kept.accountReads[0].error, "slowed");
  assert.ok(Date.parse(w.kept.accountReads[0].read_after) >= Date.now() + 200_000 - 1_000);
  assert.equal(w.kept.tellAsks, 1);
});

test("a change that got no answer is never sent again: the next read says what stands", async () => {
  const w = world();
  answers.set = [503, { error: { message: "Service temporarily unavailable", code: 2 } }];
  assert.deepEqual(await heard(await w.press("pause")), [200, { ok: true, outcome: "sent", version: 4 }]);
  assert.deepEqual(w.kept.told, [["paused", "unknown"]]);
  assert.deepEqual(w.kept.readAsks, ["meta:1200000000000061"], "the account's read is asked for at once: it says");
  assert.equal(w.row.platform_state, "ACTIVE", "and nothing is claimed of the ad until it does");
  const log = logger({ tenant_id: T });
  assert.deepEqual(await tellPending(w.db, log, who(), { accountId: ACCOUNT, nowMs: Date.now() + 120_000 }), {
    told: 0,
    usage: null,
    revoked: false,
  });
  assert.deepEqual(asked, ["set PAUSED"], "one call, whatever came of it");
});

test("a pause Meta took and that was not read back says paused; one turned back on waits for Meta's own word", async () => {
  const log = logger({ tenant_id: T });
  const quick = { ...who(), readBack: false };
  const w = world();
  const told = await tellAd(w.db, log, quick, { id: AD, platform_ad_id: META_AD, intent: "paused" });
  assert.deepEqual([told.outcome, asked, w.row.platform_state], ["told", ["set PAUSED"], "PAUSED"]);
  // Turned back on, Meta may be checking it again: what it stands at is Meta's to say, at the next read.
  asked.length = 0;
  const back = await tellAd(w.db, log, quick, { id: AD, platform_ad_id: META_AD, intent: "on" });
  assert.deepEqual([back.outcome, asked, w.row.platform_state], ["told", ["set ACTIVE"], "PAUSED"]);
});

test("of the presses on their way, a pause goes before a turning back on, and of a kind the oldest first", async () => {
  const w = world();
  const long = new Date(Date.now() - 3_600_000).toISOString();
  const waiting = (id, metaId, intent, askedAt) => ({
    ...w.row,
    id,
    platform_ad_id: metaId,
    intent,
    intent_at: askedAt,
    told_at: long,
    platform_state: intent === "paused" ? "ACTIVE" : "PAUSED",
  });
  const at = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  w.tables.ads.splice(
    0,
    1,
    waiting("adadadad-6666-4000-8000-0000000000a1", "23850000000000091", "on", at(9)),
    waiting("adadadad-6666-4000-8000-0000000000a2", "23850000000000092", "paused", at(2)),
    waiting("adadadad-6666-4000-8000-0000000000a3", "23850000000000093", "paused", at(5)),
  );
  const order = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    if ((init?.method ?? "GET") === "POST")
      order.push(`${u.pathname.split("/").pop()} ${u.searchParams.get("status")}`);
    return realFetch(url, init);
  };
  try {
    const sent = await tellPending(w.db, logger({ tenant_id: T }), who(), { accountId: ACCOUNT, nowMs: Date.now() });
    assert.equal(sent.told, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(order, ["23850000000000093 PAUSED", "23850000000000092 PAUSED", "23850000000000091 ACTIVE"]);
});

test("one read sends five of the presses on their way, the oldest first, and leaves the rest and one inside its thirty seconds", async () => {
  const w = world();
  const long = new Date(Date.now() - 3_600_000).toISOString();
  const waiting = (n, toldAt) => ({
    ...w.row,
    id: `adadadad-6666-4000-8000-0000000000b${n}`,
    platform_ad_id: `2385000000000010${n}`,
    intent: "paused",
    intent_at: new Date(Date.now() - (n + 1) * 1000).toISOString(),
    told_at: toldAt,
    platform_state: "ACTIVE",
  });
  // Seven pauses that may go, as a pause of every ad leaves them, and one pressed a second ago on an ad Meta took a
  // change to five seconds ago: it waits its thirty seconds.
  const ready = [1, 2, 3, 4, 5, 6, 7].map((n) => waiting(n, long));
  const inside = { ...waiting(8, new Date(Date.now() - 5_000).toISOString()), intent_at: new Date().toISOString() };
  w.tables.ads.splice(0, 1, ...ready, inside);
  const switched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if ((init?.method ?? "GET") === "POST") switched.push(new URL(String(url)).pathname.split("/").pop());
    return realFetch(url, init);
  };
  try {
    const sent = await tellPending(w.db, logger({ tenant_id: T }), who(), { accountId: ACCOUNT, nowMs: Date.now() });
    assert.deepEqual([sent.told, sent.revoked], [5, false]);
  } finally {
    globalThis.fetch = realFetch;
  }
  // The five pressed longest ago; the two after them, and the one inside its thirty seconds, wait for the next read.
  assert.deepEqual(
    switched,
    [7, 6, 5, 4, 3].map((n) => `2385000000000010${n}`),
  );
});

test("a change Meta refuses puts the ad back as Meta holds it, and the owner is told it did not take", async () => {
  const w = world();
  answers.set = [400, { error: { message: "(#100) This ad cannot be edited.", code: 100 } }];
  const [status, body] = await heard(await w.press("pause"));
  assert.deepEqual([status, body.error], [502, "meta_refused"]);
  assert.deepEqual([w.kept.told, w.row.intent], [[["paused", "refused"]], "on"]);
});

test("a sign-in Meta no longer takes marks the account, and the press says so", async () => {
  const w = world();
  answers.set = [400, { error: { message: "Error validating access token", code: 190 } }];
  const [status, body] = await heard(await w.press("pause"));
  assert.deepEqual([status, body.error], [409, "meta_signed_out"]);
  assert.deepEqual([w.kept.revoked, w.tables.ad_accounts[0].status], [["read"], "revoked"]);
});

test("in the sandbox everything happens but the call to Meta", async () => {
  const w = world();
  process.env.ADS_WRITES = "sandbox";
  assert.deepEqual(await heard(await w.press("pause")), [200, { ok: true, outcome: "told", version: 4 }]);
  assert.deepEqual(
    [asked, w.row.intent, w.row.platform_state, w.kept.decisions],
    [[], "paused", "PAUSED", ["pause_ad"]],
  );
});
