/**
 * An owner changes a running ad made here (the Ads plan's step 4, item 6, 4.5 and 5.2; decision 0050, Routes budget,
 * end-date, end): the edge's press door's `change` op (apps/edge/lib/ads/press.ts runAdPress, change.ts), run over a
 * database in memory whose doors answer as 00673's do, with Meta's answers as its pages document them.
 *
 * What must hold. A change is judged again against what Meta holds, and a raise whose most is not the one its press
 * named, or past the owner's most, is refused before anything is kept or sent. A press drawn from an old version, or
 * from a total Meta no longer holds, is refused. Every change to the ad set goes as Meta's dry run first; one the dry
 * run refuses changes nothing and keeps Meta's words. A change Meta never answered is never sent again: the account's
 * next read reads the campaign back and settles it, taken or not. Inside Meta's thirty seconds a change is kept and
 * sent when Meta will take it; four amounts an hour and no more. While AI is stopped a raise is refused, a cut is not.
 * Ending an ad archives its campaign, with no dry run. Sandbox does everything but the call.
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
for (const k of [...ENV, "SUPABASE_URL"]) delete process.env[k];
const T = "abababab-7777-4000-8000-000000000001";
const U = "cdcdcdcd-7777-4000-8000-000000000001";
const ACCOUNT = "acacacac-7777-4000-8000-000000000001";
const AD = "adadadad-7777-4000-8000-000000000001";
const CAMPAIGN = "23850000000000072";
const SET = "23850000000000071";
const META_AD = "23850000000000073";
const APP = {
  META_APP_ID: "990000000000078",
  META_APP_SECRET: "meta-secret-for-this-file",
  META_ADS_CONFIG_ID: "880000000000003",
  META_ADS_REDIRECT_URI: "https://app.example.com/api/v1/ads/connect/callback",
  ADS_WORKSPACES: T,
  ADS_WRITES: "live",
};
const DAY = 86_400_000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { logger } = await import(at("apps/edge/lib/shared/log.ts"));
const { runAdPress } = await import(at("apps/edge/lib/ads/press.ts"));
const { runChanges, endFixedAd } = await import(at("apps/edge/lib/ads/change.ts"));
const { endOfDayIn } = await import(at("apps/edge/lib/ads/launch/parts.ts"));

const auth = { ok: true, via: "token", workspace: T, user: U };
const TZ = "America/New_York";

/** What the owner approved at Turn on, as the edge's turn-on door keeps it. */
const APPROVED = {
  name: "First visit",
  service: "First appointment",
  picture: "f0f0f0f0-7777-4000-8000-000000000001",
  picture_kind: "photo",
  miles: 5,
  total_minor: 7000,
  most_minor: 7000,
  end_day: "2026-12-04",
  ends_at: "2026-12-05T04:59:00.000Z",
  versions: [{ text: "A first appointment at Harbor Studio takes 45 minutes.", headline: "First visit" }],
  address: "12 Harbor Street, Miami, FL",
  whatsapp: "+1 (305) 555-0142",
  declared: "none",
  currency: "USD",
  page_id: "2000000000000092",
  instagram: false,
};

/* ------------------------------------------------------------------------------------- Meta, as it answers */

let answers = {};
const asked = [];
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  const method = init?.method ?? "GET";
  const form = typeof init?.body === "string" ? new URLSearchParams(init.body) : null;
  const field = form?.has("lifetime_budget") ? "total" : form?.has("end_time") ? "end" : "area";
  const name =
    method === "GET"
      ? "read back"
      : u.searchParams.get("status")
        ? `switch ${u.searchParams.get("status")}`
        : form?.get("execution_options")
          ? `dry ${field}`
          : `set ${field}`;
  asked.push(name);
  sent.push({ name, form, id: u.pathname.split("/").at(-1) });
  const [status, body] = answers[name.split(" ")[0]] ?? [200, { success: true }];
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

/** The campaign read back, holding a total, an end and a circle of miles, as Meta answers it. */
const heldOf = (o = {}) => ({
  id: CAMPAIGN,
  name: "Chanlytics · First visit",
  account_id: "1200000000000071",
  status: o.status ?? "ACTIVE",
  effective_status: o.status ?? "ACTIVE",
  objective: "OUTCOME_ENGAGEMENT",
  special_ad_categories: [],
  adsets: {
    data: [
      {
        id: SET,
        status: "ACTIVE",
        destination_type: "WHATSAPP",
        optimization_goal: "CONVERSATIONS",
        lifetime_budget: String(o.total ?? 7000),
        daily_budget: "0",
        end_time: o.endsAt ?? "2026-12-04T23:59:00-0500",
        promoted_object: { page_id: APPROVED.page_id, whatsapp_phone_number: "13055550142" },
        targeting: {
          age_min: 18,
          geo_locations: {
            custom_locations: [{ address_string: APPROVED.address, radius: o.miles ?? 5, distance_unit: "mile" }],
          },
          publisher_platforms: ["facebook"],
          facebook_positions: ["feed", "story", "facebook_reels"],
        },
      },
    ],
  },
  ads: { data: [] },
});

/* -------------------------------------------------------------------------------------------- the world */

/**
 * A workspace whose owner is U, its account connected, and one ad made here running: $70 in all, $20 of it spent, its
 * run five days in and nine to go. The doors answer as 00673's do: one press at a time, by the ad's version.
 */
function world({ owner = true, ad = {}, account = {}, stopped = null } = {}) {
  resetBreakers();
  Object.assign(process.env, APP);
  asked.length = 0;
  sent.length = 0;
  answers = { dry: [200, { success: true }], set: [200, { success: true }], read: [200, heldOf()] };
  const now = Date.now();
  const tables = {
    tenants: [{ id: T, sending_stopped_at: stopped }],
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: T,
        platform: "meta",
        external_id: "1200000000000071",
        status: "connected",
        read_after: null,
        currency: "USD",
        timezone: TZ,
        most_minor: null,
        config: { page_id: APPROVED.page_id, min_daily_minor: 100, scopes: ["ads_read", "ads_management"] },
        ...account,
      },
    ],
    ads: [
      {
        id: AD,
        tenant_id: T,
        account_id: ACCOUNT,
        platform: "meta",
        origin: "chanlytics",
        name: "First visit",
        platform_ad_id: META_AD,
        platform_set_id: SET,
        platform_campaign_id: CAMPAIGN,
        status: "made",
        intent: "on",
        version: 3,
        intent_at: null,
        told_at: null,
        platform_state: "ACTIVE",
        budget_kind: "total",
        budget_minor: 7000,
        budget_left_minor: 5000,
        budget_shared: false,
        starts_at: new Date(now - 5 * DAY).toISOString(),
        ends_at: new Date(now + 9 * DAY).toISOString(),
        created_at: new Date(now - 5 * DAY).toISOString(),
        updated_at: new Date(now - DAY).toISOString(),
        approved: { ...APPROVED },
        change: null,
        amounts_at: null,
        ...ad,
      },
    ],
  };
  const row = tables.ads[0];
  const kept = { decisions: [], events: [], told: [], tellAsks: 0, readAsks: [] };
  let tick = Date.now();
  const stamp = () => new Date((tick += 5)).toISOString();
  const keyOf = (what) => ({ total: "total_minor", end_day: "end_day", miles: "miles" })[what];
  const approvedMiles = () => (row.approved?.area ? null : row.approved?.miles);
  const lately = () => (row.amounts_at ?? []).filter((one) => Date.now() - Date.parse(one) < 3_600_000).sort();
  const db = fakeDb(
    tables,
    {},
    {
      has_permission: ({ p_permission }) => owner && p_permission === "ads",
      ad_credentials_get: () => ({ access_token: "the-business-token" }),
      ad_change_keep: ({ p_version, p_change: change }) => {
        if (!owner) return { outcome: "not_allowed" };
        if (row.origin !== "chanlytics") return { outcome: "not_here" };
        if (row.intent === "ended") return { outcome: "over", version: row.version };
        const pending = row.change;
        if (pending?.sent_at) return { outcome: "unsure", version: row.version };
        const key = keyOf(change.what);
        if (pending?.what === change.what && (change.what === "end" || pending[key] === change[key]))
          return { outcome: "same", version: row.version, pending: true };
        const held =
          change.what === "total"
            ? row.budget_minor === change.total_minor
            : change.what === "end_day"
              ? Date.parse(row.ends_at) === Date.parse(change.ends_at)
              : change.what === "miles"
                ? approvedMiles() === change.miles
                : false;
        if (held && !pending) return { outcome: "same", version: row.version, pending: false };
        if (row.version !== p_version) return { outcome: "stale", version: row.version };
        if (change.what === "total" && change.from_minor !== row.budget_minor)
          return { outcome: "stale", version: row.version };
        if (change.what === "end_day" && Date.parse(change.from_ends_at) !== Date.parse(row.ends_at))
          return { outcome: "stale", version: row.version };
        if (pending && pending.what !== change.what && change.what !== "end")
          return { outcome: "busy", version: row.version };
        if (change.what === "total" && !held && lately().length >= 4)
          return { outcome: "amount_soon", version: row.version, next_at: stamp() };
        const toldAt = row.told_at;
        kept.decisions.push(change.what === "end" ? "end_ad" : "change_ad");
        if (held) {
          Object.assign(row, { change: null, version: row.version + 1 });
          return { outcome: "took_back", version: row.version, tell: false };
        }
        Object.assign(row, {
          change: { ...change, from_minor: row.budget_minor, asked_at: stamp(), by: U },
          version: row.version + 1,
        });
        return { outcome: "asked", version: row.version, tell: true, account_id: ACCOUNT, told_at: toldAt };
      },
      ad_change_told: ({ p_outcome, p_said }) => {
        const change = row.change;
        kept.told.push([change?.what, p_outcome]);
        if (!change) return "nothing";
        const now = stamp();
        const amounts = change.what === "total" ? [...lately(), now] : row.amounts_at;
        if (p_outcome === "unknown") {
          Object.assign(row, { change: { ...change, sent_at: now }, told_at: now, amounts_at: amounts });
          return "unknown";
        }
        if (p_outcome === "refused" || p_outcome === "not_taken") {
          Object.assign(row, { change: null, told_at: p_outcome === "refused" ? now : row.told_at });
          kept.events.push(["ad.press_refused", p_said ?? null]);
          return p_outcome;
        }
        if (change.what === "total") {
          const spent = row.budget_minor - row.budget_left_minor;
          Object.assign(row, {
            budget_minor: change.total_minor,
            budget_left_minor: Math.max(0, change.total_minor - spent),
            approved: { ...row.approved, total_minor: change.total_minor, most_minor: change.total_minor },
            amounts_at: change.sent_at ? row.amounts_at : amounts,
          });
        } else if (change.what === "end_day") {
          Object.assign(row, {
            ends_at: change.ends_at,
            approved: { ...row.approved, end_day: change.end_day, ends_at: change.ends_at },
          });
        } else if (change.what === "miles") Object.assign(row, { approved: { ...row.approved, miles: change.miles } });
        else Object.assign(row, { intent: "ended", intent_at: now });
        Object.assign(row, { change: null, told_at: now });
        kept.events.push([change.what === "end" ? "ad.ended" : "ad.changed", null]);
        return "told";
      },
      ad_tell_ask: () => (kept.tellAsks += 1),
      ads_read_ask: ({ p_platform, p_external_id }) => kept.readAsks.push(`${p_platform}:${p_external_id}`),
      ad_account_read_keep: () => "kept",
    },
  );
  setPg(db);
  const press = (change, version = row.version) =>
    runAdPress(auth, { op: "change", tenant_id: T, user_id: U, ad_id: AD, version, change });
  return { db, row, tables, kept, press };
}
const heard = async (res) => [res.status, await res.json()];
const who = () => ({
  tenantId: T,
  signIn: { token: "the-business-token", appSecret: APP.META_APP_SECRET },
  writes: process.env.ADS_WRITES,
  currency: "USD",
});
const raise = (row, to = 9000) => ({
  what: "total",
  total_minor: to,
  from_minor: row.budget_minor,
  expect_max_minor: to,
});

/* ----------------------------------------------------------------------------------------------- the tests */

test("a raise is judged again, kept once, Meta's dry run goes first, and the ad says Meta's new total", async () => {
  const w = world();
  assert.deepEqual(await heard(await w.press(raise(w.row))), [200, { ok: true, outcome: "told", version: 4 }]);
  assert.deepEqual(asked, ["dry total", "set total"], "the dry run, then the change, and nothing else");
  const [dry, real] = sent;
  assert.deepEqual(
    [dry.id, dry.form.get("lifetime_budget"), dry.form.get("execution_options")],
    [SET, "9000", JSON.stringify(["validate_only"])],
  );
  assert.deepEqual([real.form.get("lifetime_budget"), real.form.has("execution_options")], ["9000", false]);
  assert.deepEqual(
    [w.row.budget_minor, w.row.budget_left_minor, w.row.approved.total_minor, w.row.approved.most_minor, w.row.change],
    [9000, 7000, 9000, 9000, null],
  );
  assert.deepEqual([w.kept.decisions, w.kept.events.map(([kind]) => kind)], [["change_ad"], ["ad.changed"]]);
  assert.equal(w.row.amounts_at.length, 1, "an amount sent is counted toward Meta's four an hour");

  // The same press again (a double tap): Meta holds it already. Nothing is kept or sent again.
  assert.deepEqual(await heard(await w.press(raise({ budget_minor: 7000 }), 3)), [
    200,
    { ok: true, outcome: "same", version: 4 },
  ]);
  assert.deepEqual([asked.length, w.kept.decisions.length], [2, 1]);
});

test("a raise whose most is not the one its press named, or past the owner's most, is refused before anything", async () => {
  const w = world();
  const [status, body] = await heard(await w.press({ ...raise(w.row), expect_max_minor: 8000 }));
  assert.deepEqual([status, body.error], [409, "ad_stale"]);
  const unnamed = { what: "total", total_minor: 9000, from_minor: 7000 };
  assert.deepEqual((await heard(await w.press(unnamed)))[1].error, "ad_stale", "a raise names its most, always");
  const capped = world({ account: { most_minor: 8000 } });
  assert.deepEqual((await heard(await capped.press(raise(capped.row))))[1].error, "ad_stale");
  for (const one of [w, capped]) assert.deepEqual([one.kept.decisions, one.row.budget_minor], [[], 7000]);
  assert.deepEqual(asked, [], "and Meta is asked nothing");
  // A cut names no most, and needs none.
  const cut = world();
  const lower = { what: "total", total_minor: 6000, from_minor: 7000 };
  assert.deepEqual((await heard(await cut.press(lower)))[1].outcome, "told");
  assert.equal(cut.row.budget_minor, 6000);
});

test("a press drawn from an old version, or from a total Meta no longer holds, is refused: Meta's own is never put back", async () => {
  const w = world();
  assert.deepEqual((await heard(await w.press(raise(w.row), 2)))[1].error, "ad_stale");
  // The owner changed the total in Meta to $80 since the page read $70: a press drawn from $70 is not this ad's now.
  const moved = world({ ad: { budget_minor: 8000, budget_left_minor: 6000 } });
  const [status, body] = await heard(await moved.press({ ...raise({ budget_minor: 7000 }), from_minor: 7000 }));
  assert.deepEqual([status, body.error], [409, "ad_stale"]);
  assert.deepEqual([moved.row.budget_minor, asked], [8000, []]);
});

test("a change under Meta's least, or under a tenth over what was spent, is refused by the rule and never sent", async () => {
  const w = world();
  // $20 spent: Meta keeps a total of at least $22.
  const under = { what: "total", total_minor: 2100, from_minor: 7000 };
  assert.deepEqual((await heard(await w.press(under)))[1].error, "ad_stale");
  // A last day tomorrow's tomorrow is fine; today, in the account's own zone, is not a whole day.
  const accountToday = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const today = { what: "end_day", end_day: accountToday, from_ends_at: w.row.ends_at };
  assert.deepEqual((await heard(await w.press(today)))[1].error, "ad_stale");
  assert.deepEqual([asked, w.kept.decisions], [[], []]);
});

test("a change Meta's dry run refuses changes nothing, and keeps Meta's own words", async () => {
  const w = world();
  answers.dry = [
    400,
    {
      error: {
        message: "Invalid parameter",
        code: 100,
        error_subcode: 1885272,
        error_user_msg: "The budget is too low for this schedule.",
      },
    },
  ];
  const [status, body] = await heard(await w.press(raise(w.row)));
  assert.deepEqual(
    [status, body.error, body.detail],
    [502, "meta_refused", "The budget is too low for this schedule."],
  );
  assert.deepEqual(asked, ["dry total"], "the change itself is never sent");
  assert.deepEqual([w.row.budget_minor, w.row.change], [7000, null]);
  assert.deepEqual(w.kept.events, [["ad.press_refused", "The budget is too low for this schedule."]]);
});

test("a change Meta never answered is never sent again, and the next read settles it from what Meta holds", async () => {
  const w = world();
  answers.set = [503, undefined];
  assert.deepEqual(await heard(await w.press(raise(w.row))), [200, { ok: true, outcome: "sent", version: 4 }]);
  assert.deepEqual(asked, ["dry total", "set total"]);
  assert.ok(w.row.change.sent_at, "kept as sent, with no answer");
  assert.deepEqual(w.kept.readAsks, ["meta:1200000000000071"], "the account's read is asked for at once");
  // Nothing more is asked of the ad until it is settled.
  assert.deepEqual((await heard(await w.press({ what: "miles", miles: 8 })))[1].error, "ad_busy");

  // The read: Meta holds $90, so it took it. One read back, and no change sent again.
  answers.read = [200, heldOf({ total: 9000 })];
  const log = logger({ tenant_id: T });
  const later = Date.now() + 60_000;
  assert.deepEqual((await runChanges(w.db, log, who(), { accountId: ACCOUNT, nowMs: later })).told, 1);
  assert.deepEqual(asked, ["dry total", "set total", "read back"]);
  assert.deepEqual([w.row.budget_minor, w.row.change], [9000, null]);

  // And one Meta did not take: the read back holds $70, so nothing changed, and the owner is told.
  const lost = world();
  answers.set = [503, undefined];
  await lost.press(raise(lost.row));
  answers.read = [200, heldOf({ total: 7000 })];
  await runChanges(lost.db, log, who(), { accountId: ACCOUNT, nowMs: later });
  assert.deepEqual([lost.row.budget_minor, lost.row.change], [7000, null]);
  assert.deepEqual(lost.kept.told.at(-1), ["total", "not_taken"]);
  assert.equal(asked.filter((one) => one === "set total").length, 1, "never sent again");
});

test("inside Meta's thirty seconds a change is kept, and the account's read sends it when Meta will take it", async () => {
  const w = world({ ad: { told_at: new Date(Date.now() - 5_000).toISOString() } });
  assert.deepEqual(await heard(await w.press(raise(w.row))), [200, { ok: true, outcome: "soon", version: 4 }]);
  assert.deepEqual([asked, w.kept.tellAsks], [[], 1]);
  const log = logger({ tenant_id: T });
  assert.equal((await runChanges(w.db, log, who(), { accountId: ACCOUNT, nowMs: Date.now() })).told, 0, "not yet");
  assert.deepEqual(asked, []);
  assert.equal((await runChanges(w.db, log, who(), { accountId: ACCOUNT, nowMs: Date.now() + 32_000 })).told, 1);
  assert.deepEqual([asked, w.row.budget_minor], [["dry total", "set total"], 9000]);
});

test("Meta takes four changes of an amount an hour, and a fifth is refused before it is kept", async () => {
  const minutes = (n) => new Date(Date.now() - n * 60_000).toISOString();
  const w = world({ ad: { amounts_at: [minutes(50), minutes(30), minutes(20), minutes(10)] } });
  const [status, body] = await heard(await w.press(raise(w.row)));
  assert.deepEqual([status, body.error], [409, "ad_busy"]);
  assert.deepEqual([asked, w.kept.decisions], [[], []]);
  // The last day is no amount, and goes.
  const later = new Date(Date.parse(w.row.ends_at) + 2 * DAY).toISOString().slice(0, 10);
  assert.equal(
    (await heard(await w.press({ what: "end_day", end_day: later, from_ends_at: w.row.ends_at })))[1].outcome,
    "told",
  );
  assert.equal(w.row.ends_at, endOfDayIn(TZ, later), "the last moment of that day in the account's zone");
});

test("while AI is stopped a raise and a later last day are refused; a cut and an end are not", async () => {
  const w = world({ stopped: new Date().toISOString() });
  assert.deepEqual((await heard(await w.press(raise(w.row))))[1].error, "ai_stopped");
  const later = new Date(Date.parse(w.row.ends_at) + DAY).toISOString().slice(0, 10);
  assert.deepEqual(
    (await heard(await w.press({ what: "end_day", end_day: later, from_ends_at: w.row.ends_at })))[1].error,
    "ai_stopped",
  );
  assert.equal((await heard(await w.press({ what: "total", total_minor: 6000, from_minor: 7000 })))[1].outcome, "told");
});

test("the miles are sent whole, with the address the owner approved at the circle's centre", async () => {
  const w = world();
  assert.equal((await heard(await w.press({ what: "miles", miles: 8 })))[1].outcome, "told");
  assert.deepEqual(asked, ["dry area", "set area"]);
  const targeting = JSON.parse(sent[1].form.get("targeting"));
  assert.deepEqual(targeting.geo_locations.custom_locations, [
    { address_string: APPROVED.address, radius: 8, distance_unit: "mile" },
  ]);
  assert.equal(targeting.age_min, 18, "and everything else of who sees it as Turn on sent it");
  assert.equal(w.row.approved.miles, 8);
  // An ad shown across a wider place has no miles to change here.
  const wide = world({ ad: { approved: { ...APPROVED, area: { kind: "city", key: "2420379", name: "Miami" } } } });
  assert.deepEqual((await heard(await wide.press({ what: "miles", miles: 8 })))[1].error, "ad_stale");
});

test("ending an ad archives its campaign, with no dry run, and the ad is ended; nothing more is changed after", async () => {
  const w = world();
  assert.deepEqual(await heard(await w.press({ what: "end" })), [200, { ok: true, outcome: "told", version: 4 }]);
  assert.deepEqual(asked, ["switch ARCHIVED"]);
  assert.equal(sent[0].id, CAMPAIGN, "the ad's own campaign, which holds its versions and nothing else");
  assert.deepEqual(
    [w.row.intent, w.kept.decisions, w.kept.events.map(([kind]) => kind)],
    ["ended", ["end_ad"], ["ad.ended"]],
  );
  assert.deepEqual((await heard(await w.press(raise(w.row))))[1].error, "ad_not_ready", "an ended ad is over");
});

test("an ad made in Meta is changed in Meta, and anyone but the owner is refused", async () => {
  const inMeta = world({ ad: { origin: "platform" } });
  assert.deepEqual((await heard(await inMeta.press(raise(inMeta.row))))[1].error, "ad_not_ready");
  const stranger = world({ owner: false });
  assert.deepEqual((await heard(await stranger.press(raise(stranger.row))))[0], 403);
  assert.deepEqual(asked, []);
});

test("sandbox does everything but the call: kept, and said as taken, with Meta asked nothing", async () => {
  const w = world();
  process.env.ADS_WRITES = "sandbox";
  assert.equal((await heard(await w.press(raise(w.row))))[1].outcome, "told");
  assert.deepEqual([asked, w.row.budget_minor], [[], 9000]);
});

test("Fix it's ad, once turned on, ends the one Meta turned down, and never one Meta has since approved", async () => {
  const refused = world({ ad: { platform_state: "DISAPPROVED" } });
  assert.equal(await endFixedAd(refused.db, { tenantId: T, userId: U }, AD), "ended");
  assert.deepEqual([refused.row.change.what, refused.kept.decisions, refused.kept.tellAsks], ["end", ["end_ad"], 1]);
  const approved = world({ ad: { platform_state: "ACTIVE" } });
  assert.equal(await endFixedAd(approved.db, { tenantId: T, userId: U }, AD), "kept");
  assert.deepEqual([approved.row.change, approved.kept.decisions], [null, []]);
});
