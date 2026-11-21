/**
 * Turn on at the edge (apps/edge/lib/ads/turn-on.ts runAdTurnOn) and what the account's read makes of an ad made here
 * (apps/edge/lib/ads/fold.ts, tag.ts; decision 0050, calls 2, 3, 5 and 6; the Ads plan's 4.7 and 6.1), over a database
 * in memory whose door answers as 00662's ad_turn_on does.
 *
 * What must hold. The door turns nothing on where this deployment's switch is off or the workspace is not on its list,
 * for anyone but the owner, without a connected account and its Page, or while AI is stopped; and it calls Meta for
 * nothing. What it keeps is what the press approved, with the end in the account's own zone and where the ad shows.
 * The same press twice is one ad. The read folds the three ads Meta holds for an ad made here into the one the owner
 * made, adds their days together, never adopts a launch's own parts, and keeps no tag in any name a page shows.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../../_fake-db.mjs";

const ENV = [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_ADS_CONFIG_ID",
  "META_ADS_REDIRECT_URI",
  "ADS_WORKSPACES",
  "ADS_WRITES",
];
for (const name of [...ENV, "SUPABASE_URL"]) delete process.env[name];
const T = "abababab-9898-4000-8000-000000000001";
const U = "cdcdcdcd-9898-4000-8000-000000000001";
const ACCOUNT = "acacacac-9898-4000-8000-000000000001";
const PAGE = "100000000000098";
const KEY = "5e5e5e5e-9898-4000-8000-000000000001";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { runAdTurnOn } = await import(at("apps/edge/lib/ads/turn-on.ts"));
const { foldAds, foldDays, foldOf } = await import(at("apps/edge/lib/ads/fold.ts"));
const { launchNameOf, shownNameOf, tagIn } = await import(at("apps/edge/lib/ads/tag.ts"));
const { adRowsOf } = await import(at("apps/edge/lib/ads/adopt.ts"));

const APP = { META_APP_ID: "990000000000077", META_APP_SECRET: "a-secret", ADS_WORKSPACES: T, ADS_WRITES: "live" };
const AD = {
  name: "First visit",
  service: "Consultation",
  picture: "f1f1f1f1-9898-4000-8000-000000000001",
  picture_kind: "photo",
  miles: 5,
  total_minor: 7500,
  most_minor: 7500,
  end_day: "2026-12-03",
  versions: [{ text: "A first visit at Harbor Studio. Message us on WhatsApp.", headline: "First visit" }],
  address: "12 Harbor St, Miami",
  whatsapp: "+13055550142",
  declared: "none",
};
const auth = { ok: true, via: "token", workspace: T, user: U };
const realFetch = globalThis.fetch;
const metaAsked = [];
globalThis.fetch = async (url) => {
  metaAsked.push(String(url));
  throw new Error("the door calls Meta for nothing");
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

/** A workspace whose owner is U, its ad account connected with a Page, and 00662's door as it answers. */
function world({ owner = true, account = {}, stopped = null, door } = {}) {
  resetBreakers();
  Object.assign(process.env, APP);
  const kept = [];
  const tables = {
    tenants: [{ id: T, name: "Harbor", sending_stopped_at: stopped }],
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: T,
        platform: "meta",
        external_id: "1200000000000098",
        status: "connected",
        currency: "USD",
        timezone: "America/New_York",
        config: { page_id: PAGE },
        ...account,
      },
    ],
  };
  const db = fakeDb(
    tables,
    {},
    {
      has_permission: ({ p_permission }) => owner && p_permission === "ads",
      ad_turn_on: (args) => {
        kept.push(args);
        return door
          ? door(args, kept)
          : { outcome: "kept", ad_id: "adadadad-9898-4000-8000-000000000001", status: "sending" };
      },
    },
  );
  setPg(db);
  const pressed = (body = {}) =>
    runAdTurnOn(auth, { tenant_id: T, user_id: U, key: KEY, draft_at: "2026-11-20T21:00:00Z", ad: AD, ...body });
  return { pressed, kept };
}
const heard = async (res) => [res.status, await res.json()];

test("the press is kept with what was approved, its end in the account's zone, and where the ad shows", async () => {
  const w = world();
  const [status, body] = await heard(await w.pressed());
  assert.deepEqual([status, body], [202, { ok: true, outcome: "kept", ad_id: "adadadad-9898-4000-8000-000000000001" }]);
  const [args] = w.kept;
  assert.deepEqual([args.p_tenant_id, args.p_actor, args.p_key, args.p_draft_at], [T, U, KEY, "2026-11-20T21:00:00Z"]);
  assert.deepEqual(args.p_ad.shown_on, ["facebook"], "Facebook alone: no Instagram account of the Page's is named");
  assert.equal(args.p_ad.total_minor, 7500, "the total Meta will hold is the most the press named");
  assert.equal(args.p_ad.ends_at, "2026-12-04T04:59:00.000Z", "23:59 in New York on its last day");
  assert.deepEqual(
    [args.p_ad.approved.page_id, args.p_ad.approved.currency, args.p_ad.approved.ends_at, args.p_ad.approved.declared],
    [PAGE, "USD", "2026-12-04T04:59:00.000Z", "none"],
  );
  assert.deepEqual(args.p_ad.said, { headline: "First visit", body: AD.versions[0].text });
  assert.deepEqual(metaAsked, [], "Meta is asked nothing: the account's job makes the ad");
});

test("the same press twice is one ad; a draft changed since, or another ad still being set up, is refused", async () => {
  const w = world({
    door: (args, kept) =>
      kept.filter((one) => one.p_key === args.p_key).length > 1
        ? { outcome: "same", ad_id: "adadadad-9898-4000-8000-000000000001", status: "sending" }
        : { outcome: "kept", ad_id: "adadadad-9898-4000-8000-000000000001", status: "sending" },
  });
  await w.pressed();
  const [, again] = await heard(await w.pressed());
  assert.deepEqual([again.outcome, again.ad_id], ["same", "adadadad-9898-4000-8000-000000000001"]);
  for (const [outcome, code] of [
    ["stale", "ad_stale"],
    ["busy", "ad_busy"],
    ["stopped", "ai_stopped"],
    ["not_allowed", "ad_account_not_owner"],
  ]) {
    const [status, body] = await heard(await world({ door: () => ({ outcome }) }).pressed());
    assert.deepEqual([status, body.error], [code === "ad_account_not_owner" ? 403 : 409, code], outcome);
  }
});

test("nothing is kept where the switch is off or the workspace is not on its list, for anyone but the owner", async () => {
  const w = world();
  process.env.ADS_WRITES = "off";
  assert.equal((await heard(await w.pressed()))[1].error, "ads_writes_off");
  process.env.ADS_WRITES = "sandbox";
  assert.equal((await heard(await w.pressed()))[0], 202, "sandbox keeps it: its job does everything but the call");
  process.env.ADS_WORKSPACES = "another-workspace";
  assert.equal((await heard(await w.pressed()))[1].error, "ads_writes_off");
  const [status, body] = await heard(await world({ owner: false }).pressed());
  assert.deepEqual([status, body.error], [403, "ad_account_not_owner"]);
  assert.equal((await heard(await world({ account: { config: {} } }).pressed()))[1].error, "nothing_to_do");
  assert.equal((await heard(await world({ stopped: "2026-11-20T20:00:00Z" }).pressed()))[1].error, "ai_stopped");
  const bare = world();
  for (const body of [{ key: "not-a-key" }, { draft_at: "" }, { ad: undefined }]) {
    const [refused, said] = await heard(await bare.pressed(body));
    assert.deepEqual([refused, said.error], [400, "bad_request"], JSON.stringify(body));
  }
  assert.deepEqual(bare.kept, []);
  assert.deepEqual(metaAsked, []);
});

/* --------------------------------------------------------------------------------- what the read makes of it -- */

const MADE_HERE = "adadadad-9898-4000-8000-000000000002";
const metaAd = (id, over = {}) => ({
  id,
  name: launchNameOf({ id: MADE_HERE, name: "First visit" }, { at: 1, of: 3 }),
  configured: "ACTIVE",
  shownOn: ["facebook"],
  state: "PENDING_REVIEW",
  issue: null,
  createdAt: "2026-11-20T22:00:00Z",
  setId: "23850000000000202",
  campaignId: "23850000000000201",
  destination: "WHATSAPP",
  budget: { at: "set", holderId: "23850000000000202", kind: "total", minor: 7500, leftMinor: 7500 },
  startsAt: null,
  endsAt: "2026-12-04T04:59:00.000Z",
  said: {},
  ...over,
});
const VERSIONS = ["23850000000000211", "23850000000000212", "23850000000000213"];
const day = (adId, spend, conversations = 1) => ({
  adId,
  day: "2026-11-21",
  spendMinor: spend,
  impressions: 100,
  clicks: 4,
  conversations,
  leads: null,
});

test("an ad made here, three ads at Meta, is read as the one the owner made: the best word, its days added", () => {
  const fold = foldOf([{ id: MADE_HERE, status: "made", platform_ad_id: VERSIONS[0], versions: VERSIONS }]);
  const owners = metaAd("23850000000000299", { name: "Spring offer", budget: null, state: "ACTIVE" });
  const listed = [
    metaAd(VERSIONS[0], { state: "DISAPPROVED", issue: "Your ad's words don't follow our Advertising Standards." }),
    metaAd(VERSIONS[1], { state: "ACTIVE" }),
    metaAd(VERSIONS[2], { state: "PENDING_REVIEW" }),
    owners,
  ];
  const ads = foldAds(listed, fold);
  assert.deepEqual(
    ads.map((ad) => [ad.id, ad.state]),
    [
      [owners.id, "ACTIVE"],
      [VERSIONS[0], "ACTIVE"],
    ],
    "one version running is the ad running; the owner's own ad stays its own",
  );
  const rows = adRowsOf(ads, true);
  assert.equal(rows.find((row) => row.platform_ad_id === VERSIONS[0]).budget_shared, false, "its total is its own");
  const days = foldDays(
    [day(VERSIONS[0], 100), day(VERSIONS[1], 250), day(VERSIONS[2], 50, null), day(owners.id, 900)],
    listed,
    fold,
  );
  assert.deepEqual(
    days.map((one) => [one.adId, one.spendMinor, one.impressions, one.conversations]),
    [
      [owners.id, 900, 100, 1],
      [VERSIONS[0], 400, 300, 2],
    ],
  );
  // Every version turned down is the ad turned down, in Meta's own words.
  const refused = foldAds(
    VERSIONS.map((id) => metaAd(id, { state: "DISAPPROVED", issue: id === VERSIONS[2] ? "No." : null })),
    fold,
  );
  assert.deepEqual(
    refused.map((ad) => [ad.state, ad.issue]),
    [["DISAPPROVED", "No."]],
  );
});

test("a launch's own parts are never adopted: still being set up, stopped part way, or found only by their tag", () => {
  for (const status of ["sending", "failed"]) {
    const fold = foldOf([{ id: MADE_HERE, status, platform_ad_id: null, versions: [VERSIONS[0]] }]);
    const listed = [metaAd(VERSIONS[0]), metaAd(VERSIONS[1])];
    assert.deepEqual(foldAds(listed, fold), [], `${status}: its versions, by id or by tag, are the launch's`);
    assert.deepEqual(foldDays([day(VERSIONS[0], 10), day(VERSIONS[1], 10)], listed, fold), [], status);
  }
  // The paused-ad check's own ad carries a tag of its own: nobody's launch, so it is read as the owner's, its tag gone.
  const check = metaAd("23850000000000301", { name: "Chanlytics · First appointment · paused check [cl:1a2b3c4d]" });
  const fold = foldOf([{ id: MADE_HERE, status: "made", platform_ad_id: VERSIONS[0], versions: VERSIONS }]);
  const [kept] = foldAds([check], fold);
  assert.equal(kept.id, check.id);
  assert.equal(adRowsOf([kept])[0].name, "First appointment");
});

test("no name a page shows carries the tag: the check's words, the version and who made it go with it", () => {
  assert.equal(shownNameOf("Chanlytics · First appointment · paused check [cl:1a2b3c4d]"), "First appointment");
  assert.equal(shownNameOf("Chanlytics · Discovery call · 2 of 3 [cl:adadadad]"), "Discovery call");
  assert.equal(shownNameOf("Chanlytics · Discovery call [cl:adadadad]"), "Discovery call");
  assert.equal(shownNameOf("Spring offer · Chanlytics"), "Spring offer · Chanlytics", "an owner's own name is theirs");
  assert.equal(shownNameOf("[cl:adadadad]"), "An ad");
  assert.equal(tagIn(launchNameOf({ id: MADE_HERE, name: "First visit" })), "adadadad");
  assert.equal(tagIn("Spring offer"), null);
  const long = launchNameOf({ id: MADE_HERE, name: "x".repeat(600) }, { at: 3, of: 3 });
  assert.ok(long.length <= 400 && long.endsWith(" · 3 of 3 [cl:adadadad]"), "at most what Meta takes, the tag kept");
});
