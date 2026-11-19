/**
 * An owner disconnects their ad account (decision 0050, call 8, as the Ads plan amends it: never refused; the plan's
 * 4.9): the edge's op (apps/edge/lib/ads/account-ops.ts, `disconnect`) over a database in memory whose doors answer as
 * 00652's and 00653's do, with Meta's answers as its pages document them.
 *
 * What must hold. Asked to pause first, every running ad is paused and Meta told, and only then is the account let
 * go. Where Meta does not confirm a pause, nothing is disconnected and the owner is told which ad keeps running; they
 * may then disconnect anyway. The account's token is dropped the moment it is let go. It is the owner's alone, and it
 * is never refused for them: not where this deployment no longer offers Ads, and not where Meta is not answering.
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
const T = "abababab-7777-4000-8000-000000000001";
const U = "cdcdcdcd-7777-4000-8000-000000000001";
const ACCOUNT = "acacacac-7777-4000-8000-000000000001";
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
const { runAdsAccountOp } = await import(at("apps/edge/lib/ads/account-ops.ts"));

const auth = { ok: true, via: "token", workspace: T, user: U };

let setAnswer = [200, { success: true }];
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const method = init?.method ?? "GET";
  asked.push(method === "POST" ? "set" : "standing");
  const [status, body] = method === "POST" ? setAnswer : [200, { effective_status: "PAUSED" }];
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

const adRow = (n, over = {}) => ({
  id: `adadadad-7777-4000-8000-00000000000${n}`,
  tenant_id: T,
  account_id: ACCOUNT,
  platform: "meta",
  name: n === 1 ? "Spring colour offer" : "Old boosted post",
  platform_ad_id: `2385000000000007${n}`,
  status: "made",
  intent: "on",
  version: 1,
  intent_at: null,
  told_at: null,
  platform_state: "ACTIVE",
  created_at: `2026-11-0${n}T00:00:00Z`,
  ...over,
});

/** A workspace with a connected account and its ads, and the doors a disconnect goes through. */
function world({ owner = true, ads = [adRow(1), adRow(2, { intent: "paused", platform_state: "PAUSED" })] } = {}) {
  resetBreakers();
  Object.assign(process.env, APP);
  asked.length = 0;
  setAnswer = [200, { success: true }];
  const tables = {
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: T,
        platform: "meta",
        external_id: "1200000000000071",
        status: "connected",
        read_after: null,
      },
    ],
    ads,
  };
  const kept = { vault: { [ACCOUNT]: { access_token: "the-business-token" } }, disconnects: 0 };
  let tick = Date.now();
  const stamp = () => new Date((tick += 5)).toISOString();
  const db = fakeDb(
    tables,
    {},
    {
      has_permission: ({ p_permission }) => owner && p_permission === "ads",
      ad_credentials_get: ({ p_account_id }) => kept.vault[p_account_id] ?? null,
      ad_credentials_drop: ({ p_account_id }) => delete kept.vault[p_account_id],
      ad_set_intent: ({ p_ad_id, p_intent }) => {
        const row = tables.ads.find((ad) => ad.id === p_ad_id);
        Object.assign(row, { intent: p_intent, intent_at: stamp(), version: row.version + 1 });
        return {
          outcome: "asked",
          version: row.version,
          tell: true,
          told_at: null,
          account_id: ACCOUNT,
          platform_ad_id: row.platform_ad_id,
        };
      },
      ad_told: ({ p_ad_id, p_outcome, p_platform_state }) => {
        const row = tables.ads.find((ad) => ad.id === p_ad_id);
        Object.assign(row, { told_at: stamp(), platform_state: p_platform_state ?? row.platform_state });
        return p_outcome;
      },
      ad_account_disconnect: () => {
        kept.disconnects += 1;
        const account = tables.ad_accounts[0];
        if (account.status === "disconnected") return { outcome: "already" };
        account.status = "disconnected";
        return {
          outcome: "disconnected",
          left_running: tables.ads.filter((ad) => ad.platform_state === "ACTIVE").map((ad) => ad.name),
        };
      },
    },
  );
  setPg(db);
  const disconnect = (pause) => runAdsAccountOp(auth, { op: "disconnect", tenant_id: T, user_id: U, pause });
  return { tables, kept, disconnect };
}
const heard = async (res) => [res.status, await res.json()];

test("pausing first: the running ad is paused at Meta, then the account is let go and its token dropped", async () => {
  const w = world();
  assert.deepEqual(await heard(await w.disconnect(true)), [200, { ok: true, outcome: "disconnected", names: [] }]);
  assert.deepEqual(asked, ["set"], "one ad was running: one change, and no read back to spend the account's calls");
  assert.deepEqual(
    w.tables.ads.map((ad) => [ad.intent, ad.platform_state]),
    [
      ["paused", "PAUSED"],
      ["paused", "PAUSED"],
    ],
  );
  assert.deepEqual([w.tables.ad_accounts[0].status, w.kept.vault], ["disconnected", {}]);
});

test("where Meta does not confirm the pause nothing is disconnected, and the owner is told which ad keeps running", async () => {
  const w = world();
  setAnswer = [503, { error: { message: "Service temporarily unavailable", code: 2 } }];
  assert.deepEqual(await heard(await w.disconnect(true)), [
    200,
    { ok: true, outcome: "not_paused", names: ["Spring colour offer"] },
  ]);
  assert.deepEqual([w.tables.ad_accounts[0].status, w.kept.disconnects], ["connected", 0]);
  assert.ok(w.kept.vault[ACCOUNT], "the token is kept: the account is still connected");

  // They disconnect anyway: it is let go as it stands, and the answer names what was left running.
  assert.deepEqual(await heard(await w.disconnect(false)), [
    200,
    { ok: true, outcome: "disconnected", names: ["Spring colour offer"] },
  ]);
  assert.deepEqual([w.tables.ad_accounts[0].status, w.kept.vault], ["disconnected", {}]);
});

test("disconnecting without pausing asks Meta nothing", async () => {
  const w = world();
  const [status, body] = await heard(await w.disconnect(false));
  assert.deepEqual([status, body.outcome, body.names], [200, "disconnected", ["Spring colour offer"]]);
  assert.deepEqual(asked, []);
});

test("it is the owner's alone, and never refused for them whatever this deployment offers now", async () => {
  const stranger = world({ owner: false });
  const [status, body] = await heard(await stranger.disconnect(false));
  assert.deepEqual(
    [status, body.error, stranger.tables.ad_accounts[0].status],
    [403, "ad_account_not_owner", "connected"],
  );

  // Ads no longer offered in this workspace, the sign-in for ads unset, presses switched off: the owner still lets go.
  const w = world();
  for (const k of ["ADS_WORKSPACES", "META_ADS_CONFIG_ID", "ADS_WRITES"]) delete process.env[k];
  // Asked to pause with no way to: the ad cannot be confirmed paused, so the owner is told it keeps running first.
  assert.deepEqual((await heard(await w.disconnect(true)))[1], {
    ok: true,
    outcome: "not_paused",
    names: ["Spring colour offer"],
  });
  assert.deepEqual((await heard(await w.disconnect(false)))[1].outcome, "disconnected");
  assert.deepEqual(asked, [], "and Meta was asked nothing");

  const none = world();
  none.tables.ad_accounts[0].status = "disconnected";
  assert.deepEqual((await heard(await none.disconnect(false)))[1].error, "nothing_to_do");
});
