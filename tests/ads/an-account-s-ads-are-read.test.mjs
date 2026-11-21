/**
 * An account's ads are read on a clock (decision 0049, step P1; the Ads plan's step 2, part 4): Meta's wire for the ads
 * and their days (packages/channels/src/ads/meta-read.ts), what a read keeps of them (apps/edge/lib/ads/adopt.ts), one
 * account's read as the job runner takes it (read.ts runAdRead), the clock that hands the reads out (sweep.ts) and the
 * door Meta's notices arrive at (notices.ts), over a database in memory and Meta's answers as its pages document them.
 *
 * What must hold. An ad found in the owner's account is adopted with what a tap on it opens and the budget it sits
 * under, wherever Meta holds that budget, and a budget two ads spend from says so. Money is in the currency's own
 * minor units. A first read looks back thirty days and the hourly one three; once a day the Page is read and Meta's
 * notices subscribed. An ad the list no longer names is asked for by name. A read Meta slows keeps what stood, says
 * when Meta may be asked again, ends well, and is not sent again in the same breath. A sign-in Meta no longer takes
 * marks the account. And a notice is believed only under Meta's signature, and asks for a read, never more.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  metaAdDaysRequest,
  metaAdsByIdRequest,
  metaAdsRequest,
  parseMetaAdDays,
  parseMetaAds,
  parseMetaAdsById,
  parseMetaAdsNotice,
} from "@chanlytics/channels/ads";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";

const ENV = ["META_APP_ID", "META_APP_SECRET", "META_ADS_CONFIG_ID", "META_ADS_REDIRECT_URI", "META_ADS_VERIFY_TOKEN"];
for (const k of [...ENV, "SUPABASE_URL"]) delete process.env[k];
const APP = {
  META_APP_ID: "990000000000077",
  META_APP_SECRET: "meta-secret-for-this-file",
  META_ADS_CONFIG_ID: "880000000000002",
  META_ADS_REDIRECT_URI: "https://app.example.com/api/v1/ads/connect/callback",
  META_ADS_VERIFY_TOKEN: "the-check-token",
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const adopt = await import(at("apps/edge/lib/ads/adopt.ts"));
const { runAdRead, retryMsOf } = await import(at("apps/edge/lib/ads/read.ts"));
const { sweepAds } = await import(at("apps/edge/lib/ads/sweep.ts"));
const { answerAdsNoticeCheck, receiveAdsNotice } = await import(at("apps/edge/lib/ads/notices.ts"));

const T = "abababab-5555-4000-8000-000000000001";
const ACCOUNT = "acacacac-5555-4000-8000-000000000001";
const EXTERNAL = "1200000000000051";
const PAGE = "100200300400501";

/* ------------------------------------------------------------------ the wire */

const metaAd = (id, over = {}) => ({
  id,
  name: `Ad ${id.slice(-2)}`,
  status: "ACTIVE",
  effective_status: "ACTIVE",
  created_time: "2026-10-01T09:00:00-0400",
  adset: {
    id: "23850000000000101",
    lifetime_budget: "7000",
    daily_budget: "0",
    budget_remaining: "1800",
    start_time: "2026-11-01T00:00:00-0400",
    end_time: "2026-11-30T23:59:00-0500",
    destination_type: "WHATSAPP",
  },
  campaign: { id: "23850000000000201" },
  creative: { title: "First appointment", body: "Book this week.", thumbnail_url: "https://cdn.example.com/t.jpg" },
  ...over,
});
const AD1 = "23850000000000001";
const AD2 = "23850000000000002";
const AD3 = "23850000000000003";

test("an ad is read with what it says and the budget it sits under, on the ad set or the campaign above it", () => {
  const onSet = parseMetaAds({ data: [metaAd(AD1)] }, "USD").ads[0];
  assert.deepEqual(onSet.budget, {
    at: "set",
    holderId: "23850000000000101",
    kind: "total",
    minor: 7000,
    leftMinor: 1800,
  });
  assert.deepEqual(
    [onSet.configured, onSet.state, onSet.destination, onSet.setId, onSet.campaignId],
    ["ACTIVE", "ACTIVE", "WHATSAPP", "23850000000000101", "23850000000000201"],
  );
  assert.deepEqual([onSet.startsAt, onSet.endsAt], ["2026-11-01T04:00:00.000Z", "2026-12-01T04:59:00.000Z"]);
  assert.deepEqual(onSet.said, {
    headline: "First appointment",
    body: "Book this week.",
    thumbnail: "https://cdn.example.com/t.jpg",
  });

  // Meta holds a budget in one of two places: an ad set that names none sits under its campaign's, an amount a day.
  const onCampaign = parseMetaAds(
    {
      data: [
        metaAd(AD2, {
          adset: { id: "23850000000000102", destination_type: "WEBSITE" },
          campaign: { id: "23850000000000202", daily_budget: "1500" },
        }),
      ],
    },
    "USD",
  ).ads[0];
  assert.deepEqual(onCampaign.budget, {
    at: "campaign",
    holderId: "23850000000000202",
    kind: "daily",
    minor: 1500,
    leftMinor: null,
  });
  assert.deepEqual([onCampaign.startsAt, onCampaign.endsAt], [null, null]);

  // Money is Meta's own units, converted: a yen is whole at Meta and in ISO 4217; a Colombian peso is whole at Meta
  // and holds a hundred centavos in ISO 4217, on every runtime.
  const yen = parseMetaAds({ data: [metaAd(AD1)] }, "JPY").ads[0];
  assert.equal(yen.budget.minor, 7000);
  const pesos = parseMetaAds({ data: [metaAd(AD1)] }, "COP").ads[0];
  assert.equal(pesos.budget.minor, 700000);
});

test("why Meta will not run an ad is kept in Meta's words, and nothing odd is guessed", () => {
  const { ads, after } = parseMetaAds(
    {
      data: [
        metaAd(AD1, {
          effective_status: "DISAPPROVED",
          ad_review_feedback: { global: { PERSONAL_ATTRIBUTES: "Ads must not assert personal attributes." } },
        }),
        metaAd(AD2, {
          effective_status: "WITH_ISSUES",
          issues_info: [{ error_code: 1815, error_summary: "No payment method", error_message: "Add a card." }],
        }),
        metaAd(AD3, { status: "SOMETHING_NEW", effective_status: "", creative: { thumbnail_url: "javascript:1" } }),
        { name: "no id" },
        "not an ad",
      ],
      paging: { cursors: { after: "NEXT" }, next: "https://graph.facebook.com/next" },
    },
    "USD",
  );
  assert.deepEqual(
    ads.map((ad) => [ad.id, ad.state, ad.issue]),
    [
      [AD1, "DISAPPROVED", "Ads must not assert personal attributes."],
      [AD2, "WITH_ISSUES", "Add a card."],
      [AD3, "UNKNOWN", null],
    ],
  );
  assert.equal(ads[2].configured, null, "a word Chanlytics does not know is no word");
  assert.deepEqual(ads[2].said, {}, "a picture that is not a web address is left out");
  assert.equal(after, "NEXT");
  assert.equal(parseMetaAds({ data: [], paging: { cursors: { after: "X" } } }, "USD").after, null, "the last page");
  assert.throws(
    () => parseMetaAds({ error: { message: "(#17) User request limit reached", code: 17 } }, "USD"),
    /limit/,
  );

  assert.deepEqual(
    parseMetaAdsById({ [AD1]: metaAd(AD1, { effective_status: "ARCHIVED", status: "ARCHIVED" }) }, "USD").map((ad) => [
      ad.id,
      ad.state,
    ]),
    [[AD1, "ARCHIVED"]],
  );
  assert.throws(
    () => parseMetaAdsById({ error: { message: "Unsupported get request", code: 100 } }, "USD"),
    /Unsupported/,
  );
});

test("the questions name what they ask for: ads that are not gone, and days in the account's own zone", () => {
  const list = new URL(metaAdsRequest("tok", "secret", `act_${EXTERNAL}`, "CURSOR").url);
  assert.match(list.pathname, new RegExp(`/act_${EXTERNAL}/ads$`));
  const states = JSON.parse(list.searchParams.get("effective_status"));
  assert.ok(states.includes("ACTIVE") && states.includes("PAUSED") && states.includes("PENDING_REVIEW"));
  assert.ok(!states.includes("ARCHIVED") && !states.includes("DELETED"));
  assert.deepEqual([list.searchParams.get("after"), list.searchParams.get("limit")], ["CURSOR", "100"]);
  assert.match(list.searchParams.get("appsecret_proof"), /^[0-9a-f]{64}$/, "every call carries the token's proof");

  const byId = new URL(metaAdsByIdRequest("tok", "secret", [AD1, "not-an-id", AD2]).url);
  assert.equal(byId.searchParams.get("ids"), `${AD1},${AD2}`);

  const days = new URL(metaAdDaysRequest("tok", "secret", EXTERNAL, { since: "2026-11-17", until: "2026-11-19" }).url);
  assert.match(days.pathname, new RegExp(`/act_${EXTERNAL}/insights$`));
  assert.deepEqual(
    [days.searchParams.get("level"), days.searchParams.get("time_increment"), days.searchParams.get("time_range")],
    ["ad", "1", '{"since":"2026-11-17","until":"2026-11-19"}'],
  );
});

test("Meta's day for an ad: what it spent in minor units, and Meta's own counts kept apart", () => {
  const { days, after } = parseMetaAdDays(
    {
      data: [
        {
          ad_id: AD1,
          date_start: "2026-11-18",
          date_stop: "2026-11-18",
          spend: "12.34",
          impressions: "1520",
          inline_link_clicks: "41",
          actions: [
            { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "9" },
            { action_type: "link_click", value: "41" },
          ],
        },
        {
          ad_id: AD2,
          date_start: "2026-11-18",
          spend: "0",
          impressions: "0",
          actions: [{ action_type: "lead", value: "2" }],
        },
        { ad_id: AD3, date_start: "yesterday", spend: "1" },
      ],
    },
    "USD",
  );
  assert.deepEqual(days, [
    { adId: AD1, day: "2026-11-18", spendMinor: 1234, impressions: 1520, clicks: 41, conversations: 9, leads: null },
    { adId: AD2, day: "2026-11-18", spendMinor: 0, impressions: 0, clicks: 0, conversations: null, leads: 2 },
  ]);
  assert.equal(after, null);
  assert.equal(
    parseMetaAdDays({ data: [{ ad_id: AD1, date_start: "2026-11-18", spend: "1500" }] }, "JPY").days[0].spendMinor,
    1500,
  );
});

test("a notice names the ad accounts something changed in, each once; one for another object names none", () => {
  const notice = parseMetaAdsNotice({
    object: "ad_account",
    entry: [
      { id: EXTERNAL, time: 1, changes: [{ field: "with_issues_ad_objects", value: { id: AD1 } }] },
      { id: `act_${EXTERNAL}`, time: 2, changes: [{ field: "in_process_ad_objects", value: {} }, { field: "x" }] },
      { id: "not an id", changes: [{}] },
    ],
  });
  assert.deepEqual(notice, { accountIds: [EXTERNAL], changes: 3 });
  assert.deepEqual(parseMetaAdsNotice({ object: "page", entry: [{ id: EXTERNAL }] }), { accountIds: [], changes: 0 });
  assert.deepEqual(parseMetaAdsNotice(null), { accountIds: [], changes: 0 });
});

/* ------------------------------------------------------- what a read keeps */

test("what a tap opens, and what the owner has the ad set to, in Chanlytics' words", () => {
  const { doorOf, intentOf } = adopt;
  assert.deepEqual(
    [
      "WHATSAPP",
      "MESSAGING_INSTAGRAM_DIRECT_WHATSAPP",
      "INSTAGRAM_DIRECT",
      "MESSENGER",
      "PHONE_CALL",
      "ON_AD",
      "WEBSITE",
      "APP",
      null,
    ].map(doorOf),
    ["whatsapp", "whatsapp", "instagram", "messenger", "call", "form", "website", "other", "other"],
  );
  assert.deepEqual(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED", null].map(intentOf), [
    "on",
    "paused",
    "ended",
    "ended",
    "paused",
  ]);
});

test("a budget two ads spend from is shared; an ad that is gone spends from none", () => {
  const parsed = parseMetaAds(
    {
      data: [
        metaAd(AD1),
        metaAd(AD2),
        metaAd(AD3, {
          adset: { id: "23850000000000109", lifetime_budget: "5000", end_time: "2026-12-05T00:00:00+0000" },
        }),
      ],
    },
    "USD",
  ).ads;
  const rows = adopt.adRowsOf(parsed);
  assert.deepEqual(
    rows.map((row) => [row.platform_ad_id, row.budget_at, row.budget_kind, row.budget_minor, row.budget_shared]),
    [
      [AD1, "set", "total", 7000, true],
      [AD2, "set", "total", 7000, true],
      [AD3, "set", "total", 5000, false],
    ],
  );
  assert.deepEqual([rows[0].door, rows[0].intent, rows[0].platform_set_id], ["whatsapp", "on", "23850000000000101"]);
  // The second ad was archived: the first has the budget to itself again.
  const [alone] = adopt.adRowsOf([parsed[0], { ...parsed[1], state: "ARCHIVED" }]);
  assert.equal(alone.budget_shared, false);
  // A list cut short did not see every ad of the account: one that looks alone under its budget is not known to be,
  // so nothing is said of it, and the rule never turns it back on (it asks for a plain no).
  assert.deepEqual(
    adopt.adRowsOf(parsed, false).map((row) => row.budget_shared),
    [true, true, null],
  );
  // No budget is said whole: none of its parts.
  const [none] = adopt.adRowsOf(parseMetaAds({ data: [metaAd(AD1, { adset: { id: "1234567" } })] }, "USD").ads);
  assert.deepEqual([none.budget_kind, none.budget_minor, none.budget_at, none.budget_shared], [null, null, null, null]);
});

test("Meta's count of what an ad asks for follows what the ad opens, and is nobody's for an ad that opens a website", () => {
  const day = { day: "2026-11-18", spendMinor: 100, impressions: 10, clicks: 1, conversations: 4, leads: 2 };
  const rows = adopt.dayRowsOf(
    [
      { ...day, adId: AD1 },
      { ...day, adId: AD2 },
      { ...day, adId: AD3 },
    ],
    new Map([
      [AD1, "whatsapp"],
      [AD2, "form"],
      [AD3, "website"],
    ]),
  );
  assert.deepEqual(
    rows.map((row) => row.platform_results),
    [4, 2, null],
  );
});

test("the read's pace: how deep it looks, which days it asks for, and when the account is read next", () => {
  const { depthOf, rangeOf, nextSettleOf, nextReadOf, settledBeforeOf } = adopt;
  const now = Date.parse("2026-11-19T03:30:00Z"); // 18 Nov, 10:30 PM in New York
  assert.equal(depthOf({ settle_at: null }, now), "first");
  assert.equal(depthOf({ settle_at: "2026-11-19T03:00:00Z" }, now), "settle");
  assert.equal(depthOf({ settle_at: "2026-11-19T09:00:00Z" }, now), "recent");
  // A day is the account's own: at 03:30 UTC it is still the 18th in New York.
  assert.deepEqual(rangeOf("recent", "America/New_York", now), { since: "2026-11-16", until: "2026-11-18" });
  assert.deepEqual(rangeOf("settle", "America/New_York", now), { since: "2026-11-05", until: "2026-11-18" });
  assert.deepEqual(rangeOf("first", "America/New_York", now), { since: "2026-10-20", until: "2026-11-18" });
  assert.equal(settledBeforeOf("America/New_York", now), "2026-11-05");
  // Four in the morning there is 09:00 UTC in winter: later today, and tomorrow's once it has passed.
  assert.equal(nextSettleOf("America/New_York", now), "2026-11-19T09:00:00.000Z");
  assert.equal(nextSettleOf("America/New_York", Date.parse("2026-11-19T09:00:00Z")), "2026-11-20T09:00:00.000Z");

  const quiet = [
    { state: "ACTIVE", createdAt: "2026-10-01T00:00:00.000Z" },
    { state: "PAUSED", createdAt: null },
  ];
  assert.equal(nextReadOf(quiet, now), "2026-11-19T04:30:00.000Z", "an hour on");
  assert.equal(nextReadOf([...quiet, { state: "PENDING_REVIEW", createdAt: null }], now), "2026-11-19T03:45:00.000Z");
  assert.equal(
    nextReadOf([{ state: "ACTIVE", createdAt: "2026-11-18T12:00:00.000Z" }], now),
    "2026-11-19T03:45:00.000Z",
    "an ad in its first two days is read on the quick pace",
  );
});

/* -------------------------------------------------------------- one read */

/** Meta, as a read meets it: each question answers as `answers` says, and what it was asked is kept. */
let answers = {};
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  const what = u.searchParams.has("ids")
    ? "ids"
    : u.pathname.endsWith("/ads")
      ? "ads"
      : u.pathname.endsWith("/insights")
        ? "days"
        : u.pathname.endsWith("/subscribed_apps")
          ? "notices"
          : u.pathname.endsWith(`/${PAGE}`)
            ? "page"
            : "account";
  asked.push({ what, method: init?.method ?? "GET", query: Object.fromEntries(u.searchParams) });
  const [status, body, headers = {}] = answers[what] ?? [404, { error: { code: 100, message: "Unknown path" } }];
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

const GOOD = () => ({
  account: [
    200,
    {
      account_id: EXTERNAL,
      name: "Harbor",
      currency: "USD",
      timezone_name: "America/New_York",
      account_status: 1,
      funding_source: "9900000000000001",
      spend_cap: "50000",
    },
    { "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: 4, reset_time_duration: 0 }) },
  ],
  ads: [200, { data: [metaAd(AD1), metaAd(AD2, { effective_status: "PAUSED", status: "PAUSED" })] }],
  days: [
    200,
    { data: [{ ad_id: AD1, date_start: "2026-11-18", spend: "12.34", impressions: "100", inline_link_clicks: "7" }] },
  ],
  page: [200, { id: PAGE, name: "Harbor Nails", whatsapp_number: "+1 555-010-0142" }],
  notices: [200, { success: true }],
});

/** A workspace with one connected account, its token in a Vault in memory, and the doors a read writes through. */
function world({ account = {}, ads = [], secret = { access_token: "the-business-token" } } = {}) {
  resetBreakers();
  Object.assign(process.env, APP);
  asked.length = 0;
  answers = GOOD();
  const tables = {
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: T,
        platform: "meta",
        external_id: EXTERNAL,
        name: "Harbor",
        currency: "USD",
        timezone: "America/New_York",
        status: "connected",
        standing: { account: "active", funding: "ok" },
        config: { page_id: PAGE, page_name: "Harbor Nails", scopes: ["ads_read", "ads_management"], choices: [] },
        read_at: null,
        read_after: null,
        notices_at: null,
        next_read_at: null,
        settle_at: null,
        ...account,
      },
    ],
    ads,
  };
  const kept = { reads: [], revoked: [], asks: [] };
  const db = fakeDb(
    tables,
    {},
    {
      ad_credentials_get: () => secret,
      ads_read_keep: ({ p_account_id, p_read }) => {
        kept.reads.push(p_read);
        const row = tables.ad_accounts.find((r) => r.id === p_account_id);
        row.read_after = p_read.account.read_after ?? null;
        row.next_read_at = p_read.next_read_at;
        if (p_read.account.error) return { outcome: "failed", adopted: 0, moved: 0, days: 0 };
        row.settle_at = p_read.settle_at ?? row.settle_at;
        return { outcome: "kept", adopted: p_read.ads.length, moved: 0, days: p_read.days.length };
      },
      ad_account_revoked: ({ p_account_id, p_how }) => {
        kept.revoked.push(p_how);
        tables.ad_accounts.find((r) => r.id === p_account_id).status = "revoked";
        return true;
      },
      ads_read_ask: ({ p_platform, p_external_id }) => {
        kept.asks.push(`${p_platform}:${p_external_id}`);
        return tables.ad_accounts.some((r) => r.external_id === p_external_id && r.status === "connected") ? 1 : 0;
      },
      ads_hand_out: ({ p_spread_seconds }) => ({ reads: p_spread_seconds > 0 ? 3 : 0 }),
    },
  );
  const job = { id: "job-1", tenant_id: T, kind: "ad_read", payload: { account_id: ACCOUNT } };
  const read = () => runAdRead(db, job, Date.now() + 55_000);
  return { db, tables, kept, read };
}
const whats = () => asked.map((one) => one.what);

test("an account's first read adopts its ads with thirty days of numbers, reads the Page and subscribes Meta's notices", async () => {
  const w = world();
  const { read } = await w.read();
  assert.deepEqual(whats(), ["account", "ads", "days", "page", "notices"], "five questions, each once");
  assert.equal(asked[4].method, "POST");
  assert.deepEqual(
    [read.outcome, read.depth, read.calls, read.ads, read.days, read.adopted],
    ["kept", "first", 5, 2, 1, 2],
  );
  const range = JSON.parse(asked[2].query.time_range);
  assert.equal((Date.parse(range.until) - Date.parse(range.since)) / 86_400_000, 29, "thirty days, today among them");

  const [kept] = w.kept.reads;
  assert.deepEqual(kept.account.standing, { account: "active", funding: "ok" });
  assert.deepEqual(
    [kept.account.config.spend_limit_minor, kept.account.config.page_name, kept.account.config.page_whatsapp],
    [50000, "Harbor Nails", "15550100142"],
  );
  assert.deepEqual([kept.account.usage_pct, kept.account.read_after], [4, null]);
  assert.deepEqual(
    kept.ads.map((ad) => [ad.platform_ad_id, ad.platform_state, ad.intent, ad.door, ad.budget_shared]),
    [
      [AD1, "ACTIVE", "on", "whatsapp", true],
      [AD2, "PAUSED", "paused", "whatsapp", true],
    ],
  );
  assert.deepEqual(kept.days, [
    { platform_ad_id: AD1, day: "2026-11-18", spend_minor: 1234, impressions: 100, clicks: 7, platform_results: null },
  ]);
  assert.equal(kept.notices, "subscribed");
  assert.ok(kept.settle_at > new Date().toISOString(), "and the next look back is set");
  assert.match(kept.settled_before, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(Date.parse(kept.next_read_at) > Date.now() + 50 * 60_000, true, "nothing new or in review: an hour on");
});

test("an hourly read asks for the days Meta is still counting, and leaves the Page and the notices alone", async () => {
  const w = world({ account: { settle_at: new Date(Date.now() + 3_600_000).toISOString(), notices_at: null } });
  const { read } = await w.read();
  assert.deepEqual(whats(), ["account", "ads", "days"]);
  assert.equal(read.depth, "recent");
  const range = JSON.parse(asked[2].query.time_range);
  assert.equal((Date.parse(range.until) - Date.parse(range.since)) / 86_400_000, 2, "today and the two days before");
  const [kept] = w.kept.reads;
  assert.deepEqual([kept.settle_at, kept.settled_before, kept.notices], [undefined, undefined, undefined]);
  assert.equal(kept.account.config.page_name, undefined, "a Page not read keeps what was last known of it");
});

test("an ad the list no longer names is asked for by name: one this workspace holds, and one a day names", async () => {
  const w = world({
    account: { settle_at: new Date(Date.now() + 3_600_000).toISOString() },
    ads: [
      {
        id: "ad-row-3",
        tenant_id: T,
        account_id: ACCOUNT,
        platform: "meta",
        platform_ad_id: AD3,
        platform_state: "ACTIVE",
        read_at: "2026-11-18T00:00:00Z",
      },
      {
        id: "ad-row-9",
        tenant_id: T,
        account_id: ACCOUNT,
        platform: "meta",
        platform_ad_id: "23850000000000009",
        platform_state: "ARCHIVED",
        read_at: "2026-11-01T00:00:00Z",
      },
    ],
  });
  const ran = "23850000000000004";
  answers.days = [200, { data: [{ ad_id: ran, date_start: "2026-11-18", spend: "3.00", impressions: "40" }] }];
  answers.ids = [
    200,
    {
      [AD3]: metaAd(AD3, { status: "ARCHIVED", effective_status: "ARCHIVED" }),
      [ran]: metaAd(ran, { status: "ARCHIVED", effective_status: "ARCHIVED" }),
    },
  ];
  await w.read();
  assert.deepEqual(whats(), ["account", "ads", "days", "ids"]);
  assert.deepEqual(asked[3].query.ids.split(",").sort(), [AD3, ran].sort(), "never the one already said to be gone");
  const [kept] = w.kept.reads;
  assert.deepEqual(
    kept.ads.map((ad) => [ad.platform_ad_id, ad.platform_state, ad.intent]),
    [
      [AD1, "ACTIVE", "on"],
      [AD2, "PAUSED", "paused"],
      [AD3, "ARCHIVED", "ended"],
      [ran, "ARCHIVED", "ended"],
    ],
  );
  assert.deepEqual(
    kept.days.map((day) => day.platform_ad_id),
    [ran],
    "so the day of an ad that ran has a home",
  );
});

test("a read Meta slows keeps what stood, says when Meta may be asked again, ends well, and is not sent twice", async () => {
  const w = world();
  answers.ads = [
    400,
    { error: { message: "(#17) User request limit reached", code: 17, error_subcode: 2446079 } },
    { "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: 100, reset_time_duration: 420 }) },
  ];
  const before = Date.now();
  const { read } = await w.read();
  assert.deepEqual(whats(), ["account", "ads"], "the read stops at the refusal: nothing more is asked");
  assert.deepEqual(
    [read.outcome, read.calls],
    ["failed", 2],
    "and the job ends well, so nothing tries the same calls again",
  );
  const [kept] = w.kept.reads;
  assert.deepEqual(
    [kept.account.error, kept.account.usage_pct, kept.ads, kept.days],
    ["slowed", 100, undefined, undefined],
  );
  assert.ok(Date.parse(kept.account.read_after) >= before + 420_000, "Meta's own word of how long, where it is longer");
  assert.ok(kept.next_read_at >= kept.account.read_after, "and the next read is no sooner");

  // The same job run again in the same breath (a lease lost, a clock that knocked twice) asks Meta nothing.
  asked.length = 0;
  assert.deepEqual(await w.read(), { skipped: "Meta is holding this account back" });
  assert.deepEqual(whats(), []);
  assert.equal(w.kept.reads.length, 1, "and is not counted a second time");
});

test("an allowance nearly spent stops the read before the next question, with no refusal to count", async () => {
  const w = world();
  answers.account[2] = { "x-ad-account-usage": JSON.stringify({ acc_id_util_pct: 82, reset_time_duration: 0 }) };
  const { read } = await w.read();
  assert.deepEqual(whats(), ["account"], "what is left is kept for an owner's press");
  assert.deepEqual([read.outcome, read.calls], ["failed", 1]);
  const [kept] = w.kept.reads;
  assert.equal(kept.account.error, "slowed");
  assert.ok(Date.parse(kept.account.read_after) >= Date.now() + 4 * 60_000, "five minutes, as Meta's score eases");
});

test("a sign-in Meta no longer takes marks the account, and its last numbers are left as they were", async () => {
  const w = world();
  answers.account = [400, { error: { message: "Error validating access token", code: 190, error_subcode: 460 } }];
  const { read } = await w.read();
  assert.deepEqual([read.outcome, w.kept.revoked, w.kept.reads], ["revoked", ["read"], []]);
  assert.deepEqual(await w.read(), { skipped: "the account is not connected" });
});

test("a connected account whose token is not kept is marked signed out: no try mends it, and Connect again does", async () => {
  const w = world({ secret: null });
  const { read } = await w.read();
  assert.deepEqual([read.outcome, w.kept.revoked, w.kept.reads, whats()], ["revoked", ["no_token"], [], []]);
  assert.deepEqual(await w.read(), { skipped: "the account is not connected" });
});

test("a read that keeps failing is tried less and less often, up to once a day, and a good read starts over", async () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const now = Date.parse("2026-11-19T12:00:00Z");
  const ago = (ms) => new Date(now - ms).toISOString();
  // Half as long as the account has gone without a good read: each try waits half again as long as the one before.
  assert.equal(retryMsOf({ read_at: ago(10 * MIN), connected_at: null }, now), 15 * MIN, "never sooner than this");
  assert.equal(retryMsOf({ read_at: ago(2 * HOUR), connected_at: null }, now), HOUR);
  assert.equal(retryMsOf({ read_at: ago(3 * HOUR), connected_at: null }, now), 1.5 * HOUR);
  assert.equal(retryMsOf({ read_at: ago(240 * HOUR), connected_at: null }, now), 24 * HOUR, "and never later");
  // Before its first read, from when it was connected; with neither, the soonest.
  assert.equal(retryMsOf({ read_at: null, connected_at: ago(4 * HOUR) }, now), 2 * HOUR);
  assert.equal(retryMsOf({ read_at: null, connected_at: null }, now), 15 * MIN);

  // Through a read: something Meta will keep refusing is not sent again a quarter of an hour on.
  const w = world({ account: { read_at: new Date(Date.now() - 6 * HOUR).toISOString() } });
  answers.ads = [400, { error: { message: "Unsupported get request", code: 100 } }];
  const before = Date.now();
  const { read } = await w.read();
  const [kept] = w.kept.reads;
  assert.deepEqual([read.outcome, kept.account.error, kept.account.read_after], ["failed", "refused", null]);
  assert.ok(Date.parse(kept.next_read_at) >= before + 3 * HOUR - 1000, "three hours on, after six without a good read");
  assert.ok(Date.parse(kept.next_read_at) <= Date.now() + 3 * HOUR + 1000);
});

test("a look back that reaches the most one read takes keeps what it read, settles nothing, and says so", async () => {
  assert.equal((await world().read()).read.cut, null, "a whole read is cut short of nothing");
  const w = world();
  // Every page of days says there is another.
  answers.days = [
    200,
    {
      data: [{ ad_id: AD1, date_start: "2026-11-18", spend: "1.00", impressions: "10", inline_link_clicks: "1" }],
      paging: { next: "https://graph.facebook.com/next", cursors: { after: "more" } },
    },
  ];
  const { read } = await w.read();
  assert.equal(whats().filter((what) => what === "days").length, adopt.ADS_PACE.maxDayPages);
  assert.deepEqual([read.outcome, read.cut, read.days], ["kept", "days", adopt.ADS_PACE.maxDayPages]);
  const [kept] = w.kept.reads;
  assert.equal(kept.settled_before, undefined, "days it did not read whole are left open: their figures say so far");
  assert.ok(kept.settle_at, "and the look back is next due tomorrow, never again every hour");
  assert.equal(kept.ads.length, 2, "the ads and what Meta says of each are kept all the same");
});

test("a read is skipped where there is nothing to read with, and never asks Meta", async () => {
  const w = world();
  delete process.env.META_ADS_CONFIG_ID;
  assert.deepEqual(await w.read(), { skipped: "this deployment holds no sign-in for ads" });
  Object.assign(process.env, APP);
  w.tables.ad_accounts[0].status = "disconnected";
  assert.deepEqual(await w.read(), { skipped: "the account is not connected" });
  assert.deepEqual(whats(), []);
});

/* ------------------------------------------------- the clock and the notices */

test("the clock hands the due reads out and reads nothing itself", async () => {
  const w = world();
  const lines = [];
  const L = { info: (event, fields) => lines.push([event, fields]), error: (event) => lines.push([event]) };
  const answer = await sweepAds({ db: w.db, L });
  assert.deepEqual([answer.status, await answer.json()], [200, { ok: true, reads: 3 }]);
  assert.deepEqual(lines, [["ads_sweep", { reads: 3 }]]);
  assert.deepEqual(whats(), []);
  delete process.env.META_ADS_CONFIG_ID;
  assert.deepEqual(await (await sweepAds({ db: w.db, L })).json(), { ok: true, skipped: "no_app_credentials" });
});

const notice = {
  object: "ad_account",
  entry: [
    { id: EXTERNAL, changes: [{ field: "with_issues_ad_objects" }] },
    { id: "1200000000000099", changes: [] },
  ],
};
const signed = (body, secret = APP.META_APP_SECRET) =>
  new Request("https://edge.example.com/api/ads/meta", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` },
    body,
  });

test("a notice is believed only under Meta's signature, and asks each account it names for its read", async () => {
  const w = world();
  setPg(w.db);
  const body = JSON.stringify(notice);
  const refused = await receiveAdsNotice(signed(body, "someone-else's-secret"));
  assert.deepEqual([refused.status, (await refused.json()).error], [401, "bad_signature"]);
  assert.deepEqual(w.kept.asks, [], "an unsigned notice asks for nothing");

  const heard = await receiveAdsNotice(signed(body));
  assert.deepEqual([heard.status, await heard.json()], [200, { ok: true }]);
  assert.deepEqual(
    w.kept.asks,
    [`meta:${EXTERNAL}`, "meta:1200000000000099"],
    "a read is asked for, and nothing else is done",
  );
  assert.deepEqual(whats(), [], "Meta is asked nothing by the door itself");

  // A signed delivery about something else is received and names nothing.
  const other = await receiveAdsNotice(signed(JSON.stringify({ object: "page", entry: [] })));
  assert.equal(other.status, 200);
  assert.equal(w.kept.asks.length, 2);
});

test("Meta's check of the address is answered only to the token set for it", async () => {
  world();
  const check = (token) =>
    answerAdsNoticeCheck(
      new Request(
        `https://edge.example.com/api/ads/meta?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=1158201444`,
      ),
    );
  const good = await check("the-check-token");
  assert.deepEqual([good.status, await good.text()], [200, "1158201444"]);
  assert.equal((await check("a-guess")).status, 403);
  delete process.env.META_ADS_VERIFY_TOKEN;
  assert.equal((await check("")).status, 403, "no token set answers no check");
});
