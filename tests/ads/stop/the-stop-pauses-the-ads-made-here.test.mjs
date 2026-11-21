/**
 * The stop and the ads (server/ask/act/stop.ts; the content loop PRD's 14.1, call 21, taken 21 Nov 2026, reversing the
 * Ads plan's G17). Run over a database in memory whose door pauses as 00676's ad_pause_all does by `stop`.
 *
 * What must hold. Stop everything pauses every ad made here that is on, in the same act, through the one door, as the
 * member who stopped; an ad made in Meta is never paused by it, and the answer counts it so the page can tell of it. A
 * database before the door pauses nothing, and the answer says the ads made here are still on, so nothing spends
 * unseen. Resume turns no ad on: it names the ads the stop paused, for the owner's own press.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { linesOf } from "../../_log-lines.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { stopEverything, resumeEverything } = await import(at("apps/dashboard/src/server/ask/act/stop.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
const OPERATOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc";
const ACCOUNT = "acacacac-9999-4000-8000-000000000001";
const AD = (n) => `adadadad-9999-4000-8000-00000000000${n}`;
const member = { tenantId: TENANT, role: "operator", facts: {} };

const req = () =>
  new Request(`http://app.test/api/v1/ask/stop?workspace=harbor`, {
    method: "POST",
    headers: { cookie: "sb=session" },
  });

/** An ad of the account, as its row holds it. */
const adRow = (n, over = {}) => ({
  id: AD(n),
  tenant_id: TENANT,
  account_id: ACCOUNT,
  platform: "meta",
  origin: "chanlytics",
  name: `Ad ${n}`,
  door: "whatsapp",
  status: "made",
  intent: "on",
  intent_at: "2026-11-19T10:00:00Z",
  told_at: "2026-11-19T10:00:00Z",
  platform_ad_id: `2385000000000010${n}`,
  platform_campaign_id: `2385000000000020${n}`,
  platform_state: "ACTIVE",
  budget_kind: "total",
  budget_minor: 7000,
  budget_left_minor: 6420,
  ends_at: "2026-12-08T22:00:00Z",
  version: 3,
  paused_by: null,
  way_in: null,
  way_in_at: null,
  approved: { whatsapp: "+13055550142" },
  launch: null,
  created_at: "2026-11-18T10:00:00Z",
  ...over,
});

/** What the door was asked, in order. */
let asked;

/** 00676's ad_pause_all by `stop`: every ad made here that is on paused, as the stop's, each answered as asked. */
const pauseAll = (tables) => (args) => {
  asked.push({ rpc: "ad_pause_all", args });
  if (args.p_by !== "stop") throw new Error("only the stop's pause is modelled here");
  const ads = tables.ads
    .filter((ad) => ad.origin === "chanlytics" && ad.status === "made" && ad.intent === "on")
    .map((ad) => {
      Object.assign(ad, {
        intent: "paused",
        paused_by: "stop",
        paused_at: new Date().toISOString(),
        intent_at: new Date().toISOString(),
        version: ad.version + 1,
      });
      return { ad_id: ad.id, outcome: "asked", version: ad.version, tell: true };
    });
  return { outcome: "kept", ads };
};

const world = ({ door = true } = {}) => {
  const tables = {
    tenants: [{ id: TENANT, slug: "harbor", name: "Harbor Studio", status: "active", sending_stopped_at: null }],
    tenant_config: [{ tenant_id: TENANT, config: {}, version: 1 }],
    sequence_steps: [],
    policies: [],
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: TENANT,
        platform: "meta",
        external_id: "1200000000000099",
        status: "connected",
        currency: "USD",
        timezone: "America/New_York",
        config: {},
        created_at: "2026-11-10T00:00:00Z",
      },
    ],
    ads: [
      adRow(1),
      adRow(2),
      adRow(3, {
        intent: "paused",
        platform_state: "CAMPAIGN_PAUSED",
        paused_by: "owner",
        paused_at: "2026-11-19T11:00:00Z",
      }),
      adRow(4, { origin: "platform", approved: null, name: "Made in Meta" }),
    ],
  };
  const missing = () => {
    throw Object.assign(new Error("Could not find the function public.ad_pause_all"), { code: "PGRST202" });
  };
  const rpcs = { ad_pause_all: door ? pauseAll(tables) : missing };
  setServiceClient(fakeDb(tables, {}, rpcs));
  return { tables, ctx: { supabase: fakeDb(tables, {}, rpcs), userId: OPERATOR, params: {} } };
};

const realFetch = globalThis.fetch;
beforeEach(() => {
  asked = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
});

test("the stop pauses every ad made here that is on, in the same act, as the member who stopped; one made in Meta is told of", async () => {
  const w = world();
  const { result: a, lines } = await linesOf(() => stopEverything(w.ctx, req(), member));
  assert.deepEqual(
    asked.map((one) => [one.args.p_by, one.args.p_actor, one.args.p_presses]),
    [["stop", OPERATOR, null]],
    "one door, the stop's, which names no ads: it pauses every one made here",
  );
  const byId = Object.fromEntries(w.tables.ads.map((ad) => [ad.id, ad]));
  assert.deepEqual(
    [AD(1), AD(2)].map((id) => [byId[id].intent, byId[id].paused_by]),
    [
      ["paused", "stop"],
      ["paused", "stop"],
    ],
  );
  assert.equal(byId[AD(3)].paused_by, "owner", "the owner's own pause stays theirs");
  assert.equal(byId[AD(4)].intent, "on", "an ad made in Meta is never paused by the stop");
  assert.deepEqual(a.ads, { paused: 2, still_on: 0, in_meta: 1, waiting: a.ads.waiting });
  assert.equal(a.ads.waiting.length, 2, "and they wait for the owner's own press");
  assert.equal(a.stopped, true);
  const said = lines.find((line) => line.event === "ads_paused_by_stop");
  assert.deepEqual([said?.paused, said?.still_on, said?.in_meta, said?.tenant_id], [2, 0, 1, TENANT]);
});

test("a database before the door pauses nothing, and the answer says the ads made here are still on, so none spends unseen", async () => {
  const w = world({ door: false });
  const a = await stopEverything(w.ctx, req(), member);
  assert.equal(a.stopped, true, "sending is stopped all the same: the ads are not what decides it");
  assert.deepEqual([a.ads.paused, a.ads.still_on, a.ads.in_meta], [0, 2, 1], "2 made here and 1 in Meta still on");
  assert.deepEqual(
    w.tables.ads.filter((ad) => ad.intent === "on").map((ad) => ad.id),
    [AD(1), AD(2), AD(4)],
  );
});

test("Resume turns no ad on: it names the ads the stop paused, for the owner's own press", async () => {
  const w = world();
  await stopEverything(w.ctx, req(), member);
  asked.length = 0;
  const a = await resumeEverything(w.ctx, req(), member);
  assert.equal(a.stopped, false, "sending runs again");
  assert.deepEqual(asked, [], "no door that turns an ad on is asked");
  assert.deepEqual(
    w.tables.ads.filter((ad) => ad.paused_by === "stop").map((ad) => ad.intent),
    ["paused", "paused"],
    "they stay paused",
  );
  assert.deepEqual(
    a.ads.waiting,
    [
      { id: AD(1), name: "Ad 1", version: 4 },
      { id: AD(2), name: "Ad 2", version: 4 },
    ],
    "named, each with the version the owner's press carries",
  );
});
