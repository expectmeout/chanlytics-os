/**
 * What the bookings an ad brought are worth, beside what the ad cost (the Ads tracking plan's T6 and its call 5): the
 * visits an ad's people booked, each worth its service's amount, summed in the database with the page's counts
 * (ads_page_counts' `worth`), and said on one line on the ad's drawer and in Reports › Ads.
 *
 * What must hold. The line adds up from the visits and nothing else. Two currencies are two sums, said side by side
 * and never added. Under five booked it is a dash, as the cost of a booked person is, and while a day of Meta's still
 * moves it says "so far". A visit whose service has no amount is left out, and the line says how many were. A database
 * a deploy behind says no line and costs the page nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adWorthRule } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { adsPage } = await import(at("apps/dashboard/src/server/readers/ads-page.ts"));
const { readerContext, readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { sheetModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/model.ts"));
const { lensModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/lens-model.ts"));

const T = "10000000-0000-4000-8000-000000000001";
const USER = "a0000000-0000-4000-8000-0000000000a1";
const ACCOUNT = "c0000000-0000-4000-8000-000000000001";
const A = "d0000000-0000-4000-8000-00000000000a";
const D = "d0000000-0000-4000-8000-00000000000d";
const NOW = Date.parse("2026-11-21T19:10:00Z");
const TODAY = "2026-11-21";
const SAID = { timezone: "America/New_York", nowMs: NOW, word: "visit" };

/* ------------------------------------------------------------------ the rule */

const SETTLED = ["2026-10-20", "2026-11-06"];
const worth = (over) =>
  adWorthRule({ booked: 6, sums: [{ currency: "USD", minor: 124000 }], days: SETTLED, today: TODAY, ...over });

test("the worth is said from five booked, and is a dash under five", () => {
  assert.deepEqual(worth({}), { sums: [{ currency: "USD", minor: 124000 }], soFar: false });
  assert.deepEqual(worth({ booked: 5 }).sums, [{ currency: "USD", minor: 124000 }], "five is enough");
  assert.deepEqual(worth({ booked: 4 }), { sums: null, soFar: false }, "four booked: a dash");
  assert.deepEqual(worth({ booked: 0 }), { sums: null, soFar: false });
});

test("it says so far while a day that is still settling is in it, and never for a dash", () => {
  assert.equal(worth({ days: [...SETTLED, TODAY] }).soFar, true);
  assert.equal(worth({ days: SETTLED }).soFar, false);
  assert.deepEqual(worth({ booked: 4, days: [TODAY] }), { sums: null, soFar: false });
  assert.equal(worth({ sums: [], days: [TODAY] }).soFar, false, "nothing said is never so far");
});

test("two currencies are two sums, each added within itself and never to the other", () => {
  const mixed = worth({
    sums: [
      { currency: "USD", minor: 100000 },
      { currency: "EUR", minor: 30000 },
      { currency: "usd", minor: 24000 },
    ],
  });
  assert.deepEqual(mixed.sums, [
    { currency: "EUR", minor: 30000 },
    { currency: "USD", minor: 124000 },
  ]);
});

test("the rule adds what it is given and nothing else: no visit with an amount is no sum, never a zero", () => {
  assert.deepEqual(worth({ sums: [] }).sums, []);
  assert.deepEqual(worth({ sums: [{ currency: "USD", minor: 0 }] }).sums, [{ currency: "USD", minor: 0 }]);
});

/* ------------------------------------------------------------- the page's read */

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
    { ad_id: A, people: 12, booked: 6 },
    { ad_id: D, people: 3, booked: 0 },
  ],
  unnamed: { people: 0, booked: 0 },
  spend: [{ ad_id: A, spend_minor: 31000, impressions: 9000, clicks: 300, platform_results: 31, settling: false }],
};
const WORTH = [{ ad_id: A, sums: [{ currency: "USD", minor: 124000 }], visits: 7, left_out: 2 }];

async function pageRead(counts) {
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
    { ads_page_counts: () => counts, ad_people_back: () => null, ad_chats_kept: () => [] },
  );
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  const read = (await adsPage.read(readerContext(ctx, { tenantId: T, role: "operator" }, new Date(NOW)))).data;
  return { read, seen: db.seen };
}
const byId = (read, id) => read.ads.find((one) => one.id === id);

test("the page's read hands each ad what its bookings are worth, as the database summed it, in the counts' own read", async () => {
  const { read, seen } = await pageRead({ ...COUNTS, worth: WORTH });
  assert.deepEqual(byId(read, A).worth, { sums: [{ currency: "USD", minor: 124000 }], visits: 7, left_out: 2 });
  assert.deepEqual(byId(read, D).worth, { sums: [], visits: 0, left_out: 0 }, "an ad nobody booked from");
  assert.deepEqual([byId(read, A).people, byId(read, A).booked], [12, 6], "the counts are untouched");
  assert.equal(seen.filter((one) => one.rpc === "ads_page_counts").length, 1, "no read of its own");
});

test("a database a deploy behind answers no worth: the page stands and claims nothing", async () => {
  const { read } = await pageRead(COUNTS);
  assert.equal(read.account.status, "connected");
  assert.deepEqual([byId(read, A).people, byId(read, A).booked], [12, 6]);
  assert.equal(byId(read, A).worth, undefined);
});

test("an answer that is not a sum is dropped alone: an odd currency or an amount that is no whole number", async () => {
  const odd = [
    {
      ad_id: A,
      sums: [
        { currency: "USD", minor: 124000 },
        { currency: "dollars", minor: 500 },
        { currency: "EUR", minor: "300" },
        { currency: "GBP", minor: -5 },
      ],
      visits: 7,
      left_out: 0,
    },
  ];
  const { read } = await pageRead({ ...COUNTS, worth: odd });
  assert.deepEqual(byId(read, A).worth.sums, [{ currency: "USD", minor: 124000 }]);
});

/* ------------------------------------------------------------------ the lines */

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
  booked: 6,
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
  today: TODAY,
  ads,
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: null,
  needs_you: { count: 0, people: [] },
  ...over,
});
const usd = (minor, more = {}) => ({ sums: [{ currency: "USD", minor }], visits: 7, left_out: 0, ...more });
const sheetWorth = (ad) => sheetModel(livePage([ad]), A, SAID).worth;

test("the drawer says what the bookings are worth beside what the ad spent, and its figures are the same with it", () => {
  const without = sheetModel(livePage([liveAd()]), A, SAID);
  const withWorth = sheetModel(livePage([liveAd({ worth: usd(124000) })]), A, SAID);
  assert.deepEqual(withWorth.worth, { line: "About $1,240 booked for $310 spent", leftOut: null, door: null });
  assert.deepEqual(withWorth.ours, without.ours, "never in who came, who booked, or what each booked cost");
  assert.deepEqual(withWorth.theirs, without.theirs);
  assert.equal(without.worth, null, "a server that does not read it says nothing");
});

test("it says so far while a day of Meta's is still moving", () => {
  assert.equal(
    sheetWorth(liveAd({ settling: true, worth: usd(124000) })).line,
    "About $1,240 booked for $310 spent so far",
  );
});

test("under five booked the line says a dash, and nothing where nobody has booked a visit", () => {
  const few = sheetWorth(liveAd({ booked: 4, worth: usd(90000, { visits: 4 }) }));
  assert.deepEqual(few, { line: "— booked for $310 spent", leftOut: null, door: null });
  assert.equal(sheetWorth(liveAd({ booked: 0, worth: { sums: [], visits: 0, left_out: 0 } })), null);
});

test("a visit whose service has no amount is left out, and the line says how many were, with the door to Services", () => {
  const two = sheetWorth(liveAd({ worth: usd(124000, { left_out: 2 }) }));
  assert.equal(two.line, "About $1,240 booked for $310 spent");
  assert.equal(two.leftOut, "2 visits are left out: their service has no amount yet.");
  assert.equal(two.door, "admin/workspace/services");
  assert.equal(
    sheetWorth(liveAd({ worth: usd(124000, { left_out: 1 }) })).leftOut,
    "1 visit is left out: its service has no amount yet.",
  );
  // Nothing with an amount: no sum is said, never a zero nobody counted.
  const none = sheetWorth(liveAd({ worth: { sums: [], visits: 0, left_out: 7 } }));
  assert.deepEqual(none, {
    line: null,
    leftOut: "7 visits are left out: their service has no amount yet.",
    door: "admin/workspace/services",
  });
});

test("what is left out is said in the workspace's own word for a booking, an appointment where it has said none", () => {
  const page = livePage([liveAd({ worth: usd(124000, { left_out: 2 }) })]);
  const leftOut = (word) =>
    sheetModel(page, A, { timezone: SAID.timezone, nowMs: NOW, ...(word ? { word } : {}) }).worth.leftOut;
  assert.equal(leftOut("session"), "2 sessions are left out: their service has no amount yet.");
  assert.equal(leftOut("appointment"), "2 appointments are left out: their service has no amount yet.");
  assert.equal(leftOut(null), "2 appointments are left out: their service has no amount yet.");
});

test("two currencies are said side by side and never added, and the spend keeps the account's own", () => {
  const both = liveAd({
    worth: {
      sums: [
        { currency: "EUR", minor: 30000 },
        { currency: "USD", minor: 124000 },
      ],
      visits: 9,
      left_out: 0,
    },
  });
  assert.equal(sheetWorth(both).line, "About $1,240 and €300 booked for $310 spent");
  // Services priced in another currency than the account's: each in its own, side by side.
  const euros = liveAd({ worth: { sums: [{ currency: "EUR", minor: 30000 }], visits: 5, left_out: 0 } });
  assert.equal(sheetWorth(euros).line, "About €300 booked for $310 spent");
});

test("an ad whose people are not counted says no worth", () => {
  assert.equal(sheetWorth(liveAd({ opens: "website", worth: usd(124000) })), null);
});

test("Reports › Ads says the counted ads' worth on one line, beside what they spent, and its figures are the page's own", () => {
  const other = liveAd({
    id: D,
    name: "First visit",
    people: 3,
    booked: 1,
    spend_minor: 9000,
    worth: usd(4500, { visits: 1, left_out: 1 }),
  });
  const site = liveAd({ id: "site", opens: "website", people: 0, booked: 0, spend_minor: 5000, worth: usd(99900) });
  const ads = [liveAd({ worth: usd(124000, { left_out: 2 }) }), other, site];
  const lens = lensModel(livePage(ads), SAID);
  // 1,240 + 45 booked, for the 310 + 90 the counted ads spent: the website ad's people are nobody Chanlytics counts.
  assert.deepEqual(lens.worth, {
    line: "About $1,285 booked for $400 spent",
    leftOut: "3 visits are left out: their service has no amount yet.",
    door: "admin/workspace/services",
  });
  const bare = lensModel(livePage(ads.map(({ worth: _worth, ...ad }) => ad)), SAID);
  assert.equal(bare.worth, null);
  assert.deepEqual(lens.figures, bare.figures);
  assert.deepEqual(lens.rows, bare.rows);
});

test("Reports › Ads says a dash while fewer than five booked across the ads", () => {
  const lens = lensModel(livePage([liveAd({ booked: 3, worth: usd(60000, { visits: 3 }) })]), SAID);
  assert.equal(lens.worth.line, "— booked for $310 spent");
});
