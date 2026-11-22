/**
 * The people an ad brought back (the Ads tracking plan's T3 and its call 2): someone already known who wrote again from
 * an ad, counted in the database whole (00678 ad_people_back), on a line of its own on the ad's drawer and in Reports ›
 * Ads. And Meta's count beside Chanlytics' (T2), which the same read hands each ad.
 *
 * What must hold. The page's read hands each ad its people brought back and the whole workspace's, once a person, as the
 * database counted them. The line is never added to the new people, to who booked, or to the cost of a booked person:
 * the first line's figures are the same with it and without it. A read of it that fails, or a database a deploy behind,
 * costs the page nothing and says no line. Nothing is said for nobody brought back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { adsPage } = await import(at("apps/dashboard/src/server/readers/ads-page.ts"));
const { readerContext, readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { lensModel, sheetModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/model.ts"));

const T = "10000000-0000-4000-8000-000000000001";
const USER = "a0000000-0000-4000-8000-0000000000a1";
const ACCOUNT = "c0000000-0000-4000-8000-000000000001";
const A = "d0000000-0000-4000-8000-00000000000a";
const D = "d0000000-0000-4000-8000-00000000000d";
const NOW = Date.parse("2026-11-21T19:10:00Z");
const SAID = { timezone: "America/New_York", nowMs: NOW };

const accountRow = {
  id: ACCOUNT,
  tenant_id: T,
  platform: "meta",
  external_id: "1000000000000001",
  name: "Harbor ads",
  currency: "USD",
  timezone: "America/New_York",
  status: "connected",
  standing: { account: "active", funding: "ok" },
  config: { page_id: "100000000000001", page_name: "Harbor Studio", scopes: ["ads_read", "ads_management"] },
  connected_at: "2026-11-01T10:00:00Z",
  read_at: "2026-11-21T19:00:00Z",
};
const adRow = (id, name, over = {}) => ({
  id,
  tenant_id: T,
  account_id: ACCOUNT,
  platform: "meta",
  origin: "platform",
  name,
  door: "whatsapp",
  platform_ad_id: `ad-${name}`,
  status: "made",
  intent: "on",
  platform_state: "ACTIVE",
  version: 1,
  starts_at: "2026-11-01T10:00:00Z",
  ends_at: "2026-12-08T22:00:00Z",
  budget_kind: "total",
  budget_minor: 72000,
  budget_left_minor: 30800,
  budget_at: "set",
  budget_shared: false,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  ...over,
});
const COUNTS = {
  from: "2026-10-23",
  to: "2026-11-21",
  ads: [
    { ad_id: A, people: 12, booked: 5 },
    { ad_id: D, people: 3, booked: 0 },
  ],
  unnamed: { people: 0, booked: 0 },
  spend: [{ ad_id: A, spend_minor: 31000, impressions: 9000, clicks: 300, platform_results: 31, settling: false }],
};
const BACK = {
  ads: [{ ad_id: A, people: 4, booked: 2 }],
  unnamed: { people: 1, booked: 0 },
  all: { people: 5, booked: 2 },
};
const KEPT = [{ ad_id: A, name: "Spring colour offer", meta: 20, kept: 6, through: "2026-11-07" }];

async function pageRead(rpcs) {
  readerCache.clear();
  const db = fakeDb(
    {
      memberships: [{ user_id: USER, tenant_id: T, role: "owner", created_at: "2026-01-01T00:00:00Z" }],
      tenant_config: [{ tenant_id: T, version: 1, config: {} }],
      ad_accounts: [accountRow],
      ads: [adRow(A, "Spring colour offer"), adRow(D, "First visit", { origin: "chanlytics" })],
      escalations: [],
    },
    {},
    { ads_page_counts: () => COUNTS, ...rpcs },
  );
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  const read = (await adsPage.read(readerContext(ctx, { tenantId: T, role: "operator" }, new Date(NOW)))).data;
  return { read, seen: db.seen };
}
const byId = (read, id) => read.ads.find((one) => one.id === id);

test("the page's read hands each ad its people brought back and Meta's count beside its own, as the database counted them", async () => {
  const { read, seen } = await pageRead({ ad_people_back: () => BACK, ad_chats_kept: () => KEPT });
  assert.deepEqual(byId(read, A).back, { people: 4, booked: 2 });
  assert.deepEqual(byId(read, D).back, { people: 0, booked: 0 }, "an ad nobody came back through");
  assert.deepEqual(read.back, { people: 5, booked: 2 }, "everyone once, the ads nobody can name among them");
  assert.deepEqual(byId(read, A).chats, { meta: 20, kept: 6, through: "2026-11-07" });
  assert.equal(byId(read, D).chats, null, "an ad with no day Meta has settled");
  // The first line is ad_people_in's, untouched.
  assert.deepEqual([byId(read, A).people, byId(read, A).booked], [12, 5]);
  // Each counted whole in one read of its own, over the page's thirty days.
  for (const name of ["ad_people_back", "ad_chats_kept"]) {
    const calls = seen.filter((one) => one.rpc === name);
    assert.equal(calls.length, 1, name);
    assert.deepEqual(calls[0].args, { p_tenant_id: T, p_days: 30 });
  }
});

test("a read of either that fails, or a database a deploy behind, costs the page nothing and says no line", async () => {
  const refused = (code) => () => {
    throw Object.assign(new Error("refused"), { code });
  };
  for (const code of ["57014", "PGRST202"]) {
    const { read } = await pageRead({ ad_people_back: refused(code), ad_chats_kept: refused(code) });
    assert.equal(read.account.status, "connected", "the page's read stands");
    assert.deepEqual([byId(read, A).people, byId(read, A).booked], [12, 5]);
    assert.equal(byId(read, A).back, undefined, code);
    assert.equal(byId(read, A).chats, undefined, code);
    assert.equal(read.back, undefined, code);
  }
});

const liveAd = (over = {}) => ({
  id: A,
  name: "Spring colour offer",
  made_in_platform: true,
  shown_on: ["facebook"],
  launch: null,
  made_here: null,
  opens: "whatsapp",
  state: "on",
  needs: null,
  issue: null,
  ends_at: "2026-12-08T22:00:00Z",
  budget: { kind: "total", minor: 72000, left_minor: 30800, shared: false },
  pending: null,
  version: 3,
  paused_by: null,
  way_in: null,
  resume: { ok: false, why: "not_paused" },
  people: 12,
  booked: 5,
  spend_minor: 31000,
  settling: false,
  theirs: { impressions: 9000, clicks: 300, results: 31 },
  ...over,
});
const livePage = (ads, over = {}) => ({
  account: {
    status: "connected",
    name: "Harbor ads",
    currency: "USD",
    timezone: "America/New_York",
    read_at: "2026-11-21T19:00:00Z",
    read_failed: false,
    revoked_at: null,
    disconnected_at: null,
    ready: true,
    min_daily_minor: null,
    most_minor: null,
  },
  window: { from: "2026-10-23", to: "2026-11-21" },
  today: "2026-11-21",
  ads,
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: null,
  needs_you: { count: 0, people: [] },
  ...over,
});

test("the drawer says who came back on a line of its own, and its figures are the same with it as without it", () => {
  const without = sheetModel(livePage([liveAd()]), A, SAID);
  const withBack = sheetModel(livePage([liveAd({ back: { people: 4, booked: 2 } })]), A, SAID);
  assert.equal(withBack.back, "4 people you already knew wrote again from this ad. 2 booked after.");
  assert.deepEqual(withBack.ours, without.ours, "never added to who came, who booked, or what each booked cost");
  assert.deepEqual(
    withBack.ours.map((figure) => [figure.label, figure.value]),
    [
      ["Wrote to AI", "12"],
      ["Booked", "5"],
      ["For each who booked", "$62"],
    ],
  );
  assert.equal(without.back, null, "a server that does not read it says nothing");
  assert.equal(sheetModel(livePage([liveAd({ back: { people: 0, booked: 0 } })]), A, SAID).back, null);
  assert.equal(
    sheetModel(livePage([liveAd({ back: { people: 1, booked: 0 } })]), A, SAID).back,
    "1 person you already knew wrote again from this ad. None booked after yet.",
  );
  assert.equal(
    sheetModel(livePage([liveAd({ back: { people: 3, booked: 1 } })]), A, SAID).back,
    "3 people you already knew wrote again from this ad. 1 booked after.",
  );
});

test("an ad whose people are not counted says no one came back through it", () => {
  const site = liveAd({ opens: "website", back: { people: 2, booked: 1 } });
  assert.equal(sheetModel(livePage([site]), A, SAID).back, null);
});

test("Reports › Ads says the whole workspace's on a line of its own, and its figures are the page's own", () => {
  const ads = [liveAd({ back: { people: 4, booked: 2 } })];
  const without = lensModel(livePage(ads), SAID);
  const withBack = lensModel(livePage(ads, { back: { people: 5, booked: 2 } }), SAID);
  assert.equal(withBack.back, "5 people you already knew wrote again from an ad. 2 booked after.");
  assert.deepEqual(withBack.figures, without.figures);
  assert.deepEqual(withBack.rows, without.rows);
  assert.equal(without.back, null);
  assert.equal(lensModel(livePage(ads, { back: { people: 0, booked: 0 } }), SAID).back, null);
});
