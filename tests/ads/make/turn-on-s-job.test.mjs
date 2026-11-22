/**
 * Turn on's job (apps/edge/lib/ads/launch.ts runLaunches; decision 0050, calls 3 to 6 and 11; the Ads plan's 4.7): an
 * ad the owner turned on, made at Meta, run over a database in memory and a Meta that answers as its pages document.
 *
 * What must hold. Every make is paused, each just after its own dry run, each make under a key of its own, and a dry
 * run under none. What Meta holds is read back and compared with what the owner approved before anything is switched
 * on, and the switches go from the bottom, the campaign last. At every step it can break, nothing is switched on: what
 * was made is removed, or left named and paused where it cannot be. A write Meta never answered is never sent again: a
 * make is found by its tagged name, or past a few minutes unfound the launch stops; a switch is followed, and the ad
 * says it couldn't confirm it's on. A disconnect stops a launch where it is, and sends nothing more. While AI is
 * stopped, nothing is switched on. A cancel (00676) stops it at its next step, is read fresh before every switch, and
 * leaves nothing running; and a way in that closed since the press (call 11) switches nothing on.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../../_fake-db.mjs";

for (const name of ["META_APP_ID", "META_APP_SECRET", "SUPABASE_URL"]) delete process.env[name];
process.env.META_APP_ID = "990000000000077";
const T = "abababab-8888-4000-8000-000000000001";
const ACCOUNT = "acacacac-8888-4000-8000-000000000001";
const AD = "adadadad-8888-4000-8000-000000000001";
const FILE = "f1f1f1f1-8888-4000-8000-000000000001";
const META_ACCOUNT = "1200000000000081";
const PAGE = "100000000000081";
const CAMPAIGN = "23850000000000101";
const SET = "23850000000000102";
const HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f91";
const AD_IDS = ["23850000000000111", "23850000000000112", "23850000000000113"];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runLaunches } = await import(at("apps/edge/lib/ads/launch.ts"));
const { logger } = await import(at("apps/edge/lib/shared/log.ts"));
const { adStateOfRow } = await import(at("packages/contracts/src/ads/live.ts"));

const VERSIONS = [
  {
    text: "A first appointment at Harbor Studio takes 45 minutes. Message us to pick a time.",
    headline: "First visit",
  },
  {
    text: "New to Harbor Studio? A first appointment is 45 minutes. Message us on WhatsApp.",
    headline: "Your first visit",
  },
  { text: "Book a first appointment at Harbor Studio: 45 minutes, by message.", headline: "First appointment" },
];
/** What the owner approved, as the edge's turn-on door keeps it. */
const APPROVED = {
  name: "First visit",
  service: "First appointment",
  picture: FILE,
  picture_kind: "photo",
  miles: 5,
  total_minor: 1500,
  most_minor: 1500,
  end_day: "2026-12-04",
  ends_at: "2026-12-05T04:59:00.000Z",
  versions: VERSIONS,
  address: "12 Harbor Street, Miami, FL",
  whatsapp: "+1 (305) 555-0142",
  declared: "none",
  currency: "USD",
  page_id: PAGE,
  instagram: false,
};
const PICTURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 8, 7, 6]);

/* ----------------------------------------------------------------------------------------- Meta, as it answers */

/** What Meta holds, and every call as it was asked. */
let meta;
const asked = [];
/** A step that Meta refuses, one it never answers, and a hook run as a step is asked (a disconnect mid-launch). */
let refuseAt = null;
let silentAt = null;
let onAsk = null;

function freshMeta() {
  return { campaign: null, set: null, ads: [], made: [], found: new Map(), heldOver: null };
}

/** The read back, from what Meta holds now: each part's own switch, and the words each ad was made with. */
function heldJson() {
  const word = (status, review) => (status === "ACTIVE" ? (review ? "PENDING_REVIEW" : "ACTIVE") : "PAUSED");
  const held = {
    id: CAMPAIGN,
    name: "Chanlytics · First visit [cl:adadadad]",
    account_id: META_ACCOUNT,
    status: meta.campaign?.status ?? "PAUSED",
    effective_status: word(meta.campaign?.status, false),
    objective: "OUTCOME_ENGAGEMENT",
    special_ad_categories: [],
    adsets: {
      data: meta.set
        ? [
            {
              id: SET,
              status: meta.set.status,
              destination_type: "WHATSAPP",
              optimization_goal: "CONVERSATIONS",
              lifetime_budget: "1500",
              daily_budget: "0",
              end_time: "2026-12-04T23:59:00-0500",
              promoted_object: { page_id: PAGE, whatsapp_phone_number: "13055550142" },
              targeting: {
                age_min: 18,
                // Where it shows, as the ad set was sent it: a circle around the address, or a wider place.
                geo_locations: meta.set.geo,
                publisher_platforms: ["facebook"],
                facebook_positions: ["feed", "story", "facebook_reels"],
              },
            },
          ]
        : [],
    },
    ads: {
      data: meta.ads.map((ad) => ({
        id: ad.id,
        status: ad.status,
        effective_status: word(ad.status, true),
        adset_id: SET,
        creative: {
          id: `1200000000001${ad.id.slice(-2)}`,
          object_story_spec: {
            page_id: PAGE,
            link_data: {
              message: ad.text,
              name: ad.headline,
              call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } },
            },
          },
          degrees_of_freedom_spec: { creative_features_spec: { image_touchups: { enroll_status: "OPT_OUT" } } },
          contextual_multi_ads: { enroll_status: "OPT_OUT" },
        },
      })),
    },
  };
  return meta.heldOver ? meta.heldOver(held) : held;
}

/** The name a call is kept by: the part and whether it was a dry run, a find, a switch, the read back, a removal. */
function nameOf(address, method, form) {
  const edge = address.pathname.split("/").at(-1);
  if (method === "DELETE") return "remove";
  if (method === "GET") return address.searchParams.has("filtering") ? `find_${edge}` : "read_back";
  if (address.searchParams.has("status")) {
    const id = edge;
    if (id === CAMPAIGN) return "switch_campaign";
    if (id === SET) return "switch_set";
    return `switch_ad_${AD_IDS.indexOf(id) + 1}`;
  }
  const part = { campaigns: "campaign", adsets: "set", adimages: "picture", ads: "ad" }[edge];
  return `${part}${form?.get("execution_options") ? "_dry" : ""}`;
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const address = new URL(String(url));
  const method = init?.method ?? "GET";
  const form = method === "POST" && init?.body ? new URLSearchParams(String(init.body)) : null;
  const name = nameOf(address, method, form);
  asked.push({ name, form, key: init?.headers?.["X-Client-Idempotent-Key"] ?? null, url: address });
  onAsk?.(name);
  const reply = (status, body) =>
    new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  if (silentAt === name) return reply(503);
  if (refuseAt === name)
    return reply(400, {
      error: {
        message: "Invalid parameter",
        code: 100,
        error_user_msg: "Your ad's words don't follow our Advertising Standards.",
      },
    });
  if (form?.get("execution_options")) return reply(200, { success: true });
  if (name === "campaign") meta.campaign = { status: form.get("status") };
  if (name === "set") meta.set = { status: form.get("status"), geo: JSON.parse(form.get("targeting")).geo_locations };
  if (name === "ad") {
    const creative = JSON.parse(form.get("creative"));
    const id = AD_IDS[meta.ads.length];
    meta.ads.push({
      id,
      status: form.get("status"),
      text: creative.object_story_spec.link_data.message,
      headline: creative.object_story_spec.link_data.name,
    });
    return reply(200, { id });
  }
  if (name.startsWith("switch_")) {
    const to = address.searchParams.get("status");
    if (name === "switch_campaign") meta.campaign.status = to;
    else if (name === "switch_set") meta.set.status = to;
    else meta.ads[Number(name.slice(-1)) - 1].status = to;
    return reply(200, { success: true });
  }
  if (name === "read_back") return reply(200, heldJson());
  const found = meta.found.get(name);
  const answers = {
    campaign: { id: CAMPAIGN },
    set: { id: SET },
    picture: { images: { bytes: { hash: HASH, url: "https://example.com/picture.png" } } },
    remove: { success: true },
    find_campaigns: { data: found ? [found] : [] },
    find_adsets: { data: found ? [found] : [] },
    find_ads: { data: found ? [found] : [] },
  };
  return reply(200, answers[name]);
};
after(() => {
  globalThis.fetch = realFetch;
});

/* -------------------------------------------------------------------------------------- the workspace's rows */

/** The job's door, as 00666's ad_launch_keep keeps a step: what it made, sent or left, and where it ends, once. */
function launchKeep(tables) {
  return ({ p_tenant_id, p_ad_id, p_kept }) => {
    const ad = tables.ads.find((row) => row.id === p_ad_id && row.tenant_id === p_tenant_id);
    if (!ad || ad.origin !== "chanlytics") return { status: "not_found" };
    for (const part of p_kept.objects ?? []) {
      const version = part.version ?? 0;
      const state = ad.status === "failed" && part.state === "made" ? "left" : part.state;
      const was = tables.ad_objects.find(
        (row) => row.ad_id === p_ad_id && row.kind === part.kind && row.version === version,
      );
      if (was) Object.assign(was, { platform_id: part.platform_id ?? was.platform_id, state });
      else
        tables.ad_objects.push({
          id: `0b0b0b0b-8888-4000-8000-${String(tables.ad_objects.length + 1).padStart(12, "0")}`,
          tenant_id: p_tenant_id,
          ad_id: p_ad_id,
          kind: part.kind,
          version,
          name: part.name,
          platform_id: part.platform_id ?? null,
          state,
          sent_at: state === "sent" ? new Date().toISOString() : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    }
    if (p_kept.status && ad.status === "sending") {
      Object.assign(ad, {
        status: p_kept.status,
        platform_campaign_id: p_kept.campaign_id ?? ad.platform_campaign_id,
        platform_set_id: p_kept.set_id ?? ad.platform_set_id,
        platform_ad_id: p_kept.platform_ad_id ?? ad.platform_ad_id,
        platform_state: p_kept.platform_state ?? ad.platform_state,
        launch: {
          ...ad.launch,
          ...(p_kept.launch ?? {}),
          ...(p_kept.status === "failed" ? { stopped_at: new Date().toISOString() } : {}),
        },
      });
      // Made all the same after its cancel (00676): paused at once by whoever cancelled it, told at Meta's pace.
      if (p_kept.status === "made" && ad.launch.cancel)
        Object.assign(ad, { intent: "paused", paused_by: "owner", intent_at: new Date().toISOString() });
    } else if (p_kept.launch) ad.launch = { ...ad.launch, ...p_kept.launch };
    return { status: ad.status, intent: ad.intent, launch: ad.launch };
  };
}

/** As 00666's trigger does when the owner disconnects: the launch stopped, what it made left at Meta. */
function disconnect(tables) {
  tables.ad_accounts[0].status = "disconnected";
  for (const ad of tables.ads.filter((row) => row.status === "sending")) {
    ad.status = "failed";
    ad.launch = { ...ad.launch, stopped: "disconnected" };
    for (const part of tables.ad_objects.filter((row) => row.ad_id === ad.id))
      if (part.state === "sent" || part.state === "made") part.state = "left";
  }
}

/** A workspace whose owner turned an ad on: the ad, setting up, and its account with the picture in Files. */
function world({ ad = {}, approved = APPROVED, stopped = null, standing = "AVAILABLE" } = {}) {
  resetBreakers();
  meta = freshMeta();
  asked.length = 0;
  refuseAt = null;
  silentAt = null;
  onAsk = null;
  const tables = {
    tenants: [{ id: T, name: "Harbor Studio", status: "active", sending_stopped_at: stopped }],
    // The number the ad opens a chat with, as Settings keeps what Meta last said of it: AI can answer it.
    tenant_channels: [
      {
        id: "c4c4c4c4-8888-4000-8000-000000000001",
        tenant_id: T,
        kind: "whatsapp",
        status: "active",
        number_e164: "+13055550142",
        config: { standing: { can_send: standing, problems: [] } },
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: T,
        platform: "meta",
        external_id: META_ACCOUNT,
        status: "connected",
        currency: "USD",
        timezone: "America/New_York",
        config: { page_id: PAGE },
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
        door: "whatsapp",
        status: "sending",
        intent: "on",
        budget_kind: "total",
        budget_minor: 1500,
        budget_left_minor: 1500,
        ends_at: APPROVED.ends_at,
        approved,
        launch: { key: "5e5e5e5e-8888-4000-8000-000000000001", step: "make" },
        version: 1,
        created_at: "2026-11-20T22:00:00Z",
        ...ad,
      },
    ],
    ad_objects: [],
    files: [{ id: FILE, tenant_id: T, mime: "image/png", removed_at: null }],
  };
  const db = fakeDb(tables, {}, { ad_launch_keep: launchKeep(tables) });
  db.storage = { from: () => ({ download: async () => ({ data: new Blob([PICTURE]), error: null }) }) };
  const run = (over = {}) =>
    runLaunches(db, logger({ tenant_id: T }), {
      tenantId: T,
      signIn: { token: "the-business-token", appSecret: "meta-secret-for-this-file" },
      writes: "live",
      account: { id: ACCOUNT, externalId: META_ACCOUNT, currency: "USD" },
      deadline: Date.now() + 60_000,
      ...over,
    });
  return { tables, run, ad: () => tables.ads[0] };
}
const names = () => asked.map((call) => call.name);
const switches = () => names().filter((name) => name.startsWith("switch_"));
const MAKES = ["campaign_dry", "campaign", "set_dry", "set", "picture"];
const ADS = ["ad_dry", "ad", "ad_dry", "ad", "ad_dry", "ad"];
const ON = ["switch_ad_1", "switch_ad_2", "switch_ad_3", "switch_set", "switch_campaign"];

/* -------------------------------------------------------------------------------------------- the whole road -- */

test("every part made paused just after its dry run, read back and compared, then switched on from the bottom", async () => {
  const w = world();
  const ran = await w.run();
  assert.deepEqual(names(), [...MAKES, ...ADS, "read_back", ...ON, "read_back"]);
  assert.deepEqual([ran.ran, ran.waiting, ran.revoked], [1, 0, false]);
  const makes = asked.filter((call) => ["campaign", "set", "ad"].includes(call.name));
  for (const call of [...makes, ...asked.filter((call) => call.name.endsWith("_dry"))])
    assert.equal(call.form.get("status"), "PAUSED", `${call.name} is made paused`);
  for (const call of asked.filter((one) => one.name.endsWith("_dry")))
    assert.equal(call.key, null, "no key on a dry run");
  const keys = makes.map((call) => call.key);
  assert.ok(keys.every(Boolean) && new Set(keys).size === keys.length, "a key each make, never one shared");
  // The total the press named is the total Meta holds; the end is the approved day's, in the account's zone.
  const set = asked.find((call) => call.name === "set").form;
  assert.deepEqual([set.get("lifetime_budget"), set.get("end_time")], ["1500", APPROVED.ends_at]);
  // Three versions are three ads, each with its own words, each tagged with the ad's own id.
  const creatives = asked.filter((call) => call.name === "ad").map((call) => JSON.parse(call.form.get("creative")));
  assert.deepEqual(
    creatives.map((creative) => creative.object_story_spec.link_data.name),
    VERSIONS.map((version) => version.headline),
  );
  assert.ok(
    creatives.every((creative, i) => creative.name === `Chanlytics · First visit · ${i + 1} of 3 [cl:adadadad]`),
  );
  const ad = w.ad();
  assert.deepEqual(
    [ad.status, ad.platform_campaign_id, ad.platform_set_id, ad.platform_ad_id, ad.platform_state],
    ["made", CAMPAIGN, SET, AD_IDS[0], "PENDING_REVIEW"],
  );
  assert.equal(ad.launch.step, "done");
  assert.deepEqual(
    w.tables.ad_objects.map((part) => [part.kind, part.version, part.state, part.platform_id]),
    [
      ["campaign", 0, "made", CAMPAIGN],
      ["set", 0, "made", SET],
      ["picture", 0, "made", HASH],
      ["ad", 1, "made", AD_IDS[0]],
      ["ad", 2, "made", AD_IDS[1]],
      ["ad", 3, "made", AD_IDS[2]],
    ],
  );
  // On only once Meta says so: while Meta checks it, the page says In review.
  assert.equal(adStateOfRow(ad, { nowMs: Date.parse("2026-11-21T12:00:00Z"), timezone: "America/New_York" }), "review");
  // A second pass finds nothing on its way, and asks Meta nothing.
  asked.length = 0;
  assert.equal((await w.run()).ran, 0);
  assert.deepEqual(names(), []);
});

test("an ad approved across a wider place is sent that place in the circle's stead, never a street address", async () => {
  const { address: _circle, ...rest } = APPROVED;
  const w = world({ approved: { ...rest, area: { kind: "region", key: "3847" } } });
  await w.run();
  assert.deepEqual(names(), [...MAKES, ...ADS, "read_back", ...ON, "read_back"]);
  for (const call of asked.filter((one) => one.name === "set" || one.name === "set_dry")) {
    const geo = JSON.parse(call.form.get("targeting")).geo_locations;
    assert.deepEqual(geo.regions, [{ key: "3847" }], call.name);
    assert.equal(geo.custom_locations, undefined, `${call.name}: no circle`);
  }
  const street = (call) =>
    String(call.form ?? "").includes("address_string") || String(call.form ?? "").includes("Street");
  assert.ok(!asked.some(street), "no street address is sent");
  assert.deepEqual([w.ad().status, w.ad().launch.step], ["made", "done"]);

  // Meta holding the circle where a region was approved is a difference: nothing is switched on.
  const again = world({ approved: { ...rest, area: { kind: "region", key: "3847" } } });
  meta.heldOver = (held) => {
    held.adsets.data[0].targeting.geo_locations = { custom_locations: [{ radius: 5, distance_unit: "mile" }] };
    return held;
  };
  await again.run();
  assert.deepEqual(switches(), []);
  // The area is all that differs here, so the stop is its.
  assert.deepEqual([again.ad().status, again.ad().launch.stopped], ["failed", "differs"]);
});

/* ------------------------------------------------------------------------------------ each step broken in turn -- */

test("at every step Meta refuses, nothing after it is sent, nothing is switched on, and what was made is removed", async () => {
  const steps = [
    "campaign_dry",
    "campaign",
    "set_dry",
    "set",
    "picture",
    "ad_dry",
    "ad",
    "switch_ad_1",
    "switch_set",
    "switch_campaign",
  ];
  for (const step of steps) {
    const w = world();
    refuseAt = step;
    await w.run();
    const ad = w.ad();
    const sent = names();
    const madeCampaign = sent.includes("campaign") && step !== "campaign" && step !== "campaign_dry";
    assert.equal(ad.status, "failed", step);
    assert.equal(ad.launch.stopped, "refused", step);
    assert.equal(
      ad.launch.said,
      "Your ad's words don't follow our Advertising Standards.",
      `${step}: Meta's own words`,
    );
    assert.equal(sent.at(-1), madeCampaign ? "remove" : step, `${step}: nothing after it but the removal`);
    // A switch refused part way: the campaign above was never switched on, so nothing runs, and it is removed.
    if (!step.startsWith("switch_")) assert.deepEqual(switches(), [], `${step}: nothing is switched on`);
    assert.ok(!switches().includes("switch_campaign") || step === "switch_campaign", step);
    if (madeCampaign)
      assert.ok(
        w.tables.ad_objects
          .filter((part) => part.kind !== "picture" && part.state !== "refused")
          .every((part) => part.state === "removed"),
        `${step}: everything under the campaign went with it`,
      );
  }
});

test("what Meta holds that is not what was approved stops it before any switch, and the campaign is removed", async () => {
  for (const [why, change] of [
    ["the total", (held) => Object.assign(held.adsets.data[0], { lifetime_budget: "1600" })],
    ["the end", (held) => Object.assign(held.adsets.data[0], { end_time: "2026-12-05T23:59:00-0500" })],
    ["a declaration", (held) => Object.assign(held, { special_ad_categories: ["HOUSING"] })],
    [
      "the area",
      (held) =>
        Object.assign(held.adsets.data[0].targeting, {
          geo_locations: { custom_locations: [{ radius: 10, distance_unit: "mile" }] },
        }),
    ],
    ["a switch left on", (held) => Object.assign(held.ads.data[1], { status: "ACTIVE" })],
    [
      "the words",
      (held) => Object.assign(held.ads.data[2].creative.object_story_spec.link_data, { message: "Other words" }),
    ],
  ]) {
    const w = world();
    meta.heldOver = (held) => {
      change(held);
      return held;
    };
    await w.run();
    assert.deepEqual(switches(), [], why);
    assert.deepEqual([w.ad().status, w.ad().launch.stopped, names().at(-1)], ["failed", "differs", "remove"], why);
  }
});

test("a removal Meta refuses leaves what was made named and paused in Meta, and the ad says what was left", async () => {
  const w = world();
  meta.heldOver = (held) => ({ ...held, special_ad_categories: ["HOUSING"] });
  refuseAt = "remove";
  await w.run();
  assert.equal(w.ad().status, "failed");
  assert.deepEqual(
    w.tables.ad_objects.filter((part) => part.kind !== "picture").map((part) => [part.kind, part.state]),
    [
      ["campaign", "left"],
      ["set", "left"],
      ["ad", "left"],
      ["ad", "left"],
      ["ad", "left"],
    ],
  );
  assert.deepEqual(switches(), []);
});

/* ---------------------------------------------------------------------------------- a write Meta never answered -- */

test("a make Meta never answered is never sent again: it is found by its tagged name, and the launch goes on", async () => {
  const w = world();
  silentAt = "set";
  const first = await w.run();
  assert.deepEqual(names(), ["campaign_dry", "campaign", "set_dry", "set"]);
  assert.deepEqual([first.waiting, w.ad().status], [1, "sending"]);
  assert.ok(w.ad().launch.unknown_at, "when the answer went missing is kept");
  assert.deepEqual(
    w.tables.ad_objects.map((part) => [part.kind, part.state]),
    [
      ["campaign", "made"],
      ["set", "sent"],
    ],
  );
  // Meta made it after all: the next pass looks for it by name, and never sends it again.
  silentAt = null;
  const sent = JSON.parse(asked.find((call) => call.name === "set").form.get("targeting")).geo_locations;
  meta.set = { status: "PAUSED", geo: sent };
  meta.found.set("find_adsets", { id: SET, name: "Chanlytics · First visit [cl:adadadad]", status: "PAUSED" });
  asked.length = 0;
  await w.run();
  assert.equal(names()[0], "find_adsets");
  assert.ok(!names().includes("set") && !names().includes("set_dry"), "the ad set is not sent again");
  const find = asked[0].url;
  assert.deepEqual(JSON.parse(find.searchParams.get("filtering")), [
    { field: "name", operator: "EQUAL", value: "Chanlytics · First visit [cl:adadadad]" },
  ]);
  assert.equal(w.ad().status, "made");
  assert.equal(w.ad().launch.unknown_at, null, "nothing of it is unanswered now");
  assert.equal(adStateOfRow(w.ad(), { nowMs: Date.now() + 10 * 60_000, timezone: "UTC" }), "review");
});

test("a make never found past a few minutes stops the launch, never sent again, and what was made is removed", async () => {
  const w = world();
  silentAt = "campaign";
  await w.run();
  silentAt = null;
  asked.length = 0;
  // Still within the minutes it is followed: looked for, not found, and it waits.
  assert.equal((await w.run()).waiting, 1);
  assert.deepEqual(names(), ["find_campaigns"]);
  // Past them: stopped. Nothing was ever made that is known, so nothing is removed, and the campaign is never sent again.
  w.ad().launch.unknown_at = new Date(Date.now() - 11 * 60_000).toISOString();
  asked.length = 0;
  await w.run();
  assert.deepEqual(names(), ["find_campaigns"]);
  assert.deepEqual([w.ad().status, w.ad().launch.stopped], ["failed", "unanswered"]);
  assert.deepEqual(
    w.tables.ad_objects.map((part) => [part.kind, part.state]),
    [["campaign", "left"]],
    "a make that may have gone is named as left: the page says so",
  );
});

test("a switch Meta never answered is never sent again: the ad is made, and says it couldn't confirm it's on", async () => {
  const w = world();
  silentAt = "switch_set";
  await w.run();
  assert.equal(names().filter((name) => name === "switch_set").length, 1, "sent once");
  assert.deepEqual(switches(), ON, "the switches after it go on: each is what the owner approved");
  const ad = w.ad();
  assert.equal(ad.status, "made");
  assert.ok(ad.launch.unknown_at, "the switch nobody answered is followed");
  const at = (minutes) => ({ nowMs: Date.parse(ad.launch.unknown_at) + minutes * 60_000, timezone: "UTC" });
  assert.equal(adStateOfRow(ad, at(1)), "setting-up", "followed a few minutes");
  assert.equal(adStateOfRow(ad, at(6)), "unconfirmed", "then said: Couldn't confirm it's on");
  // A read that says what stands settles it (00666's ads_read_keep drops unknown_at for an ad made here).
  const read = { ...ad, launch: { ...ad.launch, unknown_at: undefined }, platform_state: "PENDING_REVIEW" };
  assert.equal(adStateOfRow(read, at(6)), "review");
  // A second pass sends nothing more.
  asked.length = 0;
  await w.run();
  assert.deepEqual(names(), []);
});

test("a make kept as sent whose answer was never kept (the job ended in between) is followed, never sent again", async () => {
  const w = world();
  w.tables.ad_objects.push({
    id: "0b0b0b0b-8888-4000-8000-000000000099",
    tenant_id: T,
    ad_id: AD,
    kind: "campaign",
    version: 0,
    name: "Chanlytics · First visit [cl:adadadad]",
    platform_id: null,
    state: "sent",
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert.equal((await w.run()).waiting, 1);
  assert.deepEqual(names(), ["find_campaigns"], "looked for by its name, not sent again");
  assert.ok(w.ad().launch.unknown_at, "its following starts now");
  w.ad().launch.unknown_at = new Date(Date.now() - 11 * 60_000).toISOString();
  asked.length = 0;
  await w.run();
  assert.deepEqual(names(), ["find_campaigns"]);
  assert.deepEqual([w.ad().status, w.ad().launch.stopped], ["failed", "unanswered"]);
});

test("a dry run that went unanswered makes nothing, so it is asked again on the next pass", async () => {
  const w = world();
  silentAt = "set_dry";
  assert.equal((await w.run()).waiting, 1);
  assert.deepEqual(
    w.tables.ad_objects.map((part) => part.kind),
    ["campaign"],
  );
  silentAt = null;
  asked.length = 0;
  await w.run();
  assert.deepEqual(names().slice(0, 2), ["set_dry", "set"]);
  assert.equal(w.ad().status, "made");
});

/* ----------------------------------------------------------------------------- a disconnect, AI stopped, sandbox -- */

test("a disconnect during a launch stops it where it is: nothing more is sent, nothing is removed, what was made is left", async () => {
  const w = world();
  onAsk = (name) => {
    if (name === "set") disconnect(w.tables);
  };
  await w.run();
  assert.deepEqual(names(), ["campaign_dry", "campaign", "set_dry", "set"], "nothing after the step it was on");
  assert.deepEqual([w.ad().status, w.ad().launch.stopped], ["failed", "disconnected"]);
  assert.deepEqual(
    w.tables.ad_objects.map((part) => [part.kind, part.state]),
    [
      ["campaign", "left"],
      ["set", "left"],
    ],
    "the ad set Meta made after the disconnect is named as left too",
  );
  assert.deepEqual(switches(), []);
});

test("while AI is stopped no ad is switched on: the launch stops before its first switch, and what it made goes", async () => {
  const w = world({ stopped: "2026-11-20T21:00:00Z" });
  await w.run();
  assert.deepEqual(switches(), []);
  assert.deepEqual([w.ad().status, w.ad().launch.stopped, names().at(-1)], ["failed", "ai_stopped", "remove"]);
});

/* ------------------------------------------------------------------------------- a cancel, and the way in -- */

/** The owner's Cancel, as ad_launch_cancel keeps it on the launch (00676). */
const cancel = (w) => {
  w.ad().launch = { ...w.ad().launch, cancel: { at: new Date().toISOString(), by: "owner" } };
};

test("a launch cancelled while it is set up stops at its next step: what it made is removed, nothing is switched on", async () => {
  const w = world();
  // The owner presses Cancel while the ad set is being made.
  onAsk = (name) => {
    if (name === "set") cancel(w);
  };
  await w.run();
  assert.deepEqual(switches(), [], "nothing the owner cancelled is ever switched on");
  assert.ok(!names().includes("picture"), "nothing more is made after the cancel is seen");
  assert.deepEqual([w.ad().status, w.ad().launch.stopped, names().at(-1)], ["failed", "cancelled", "remove"]);
  assert.ok(
    w.tables.ad_objects.filter((part) => part.kind !== "picture").every((part) => part.state === "removed"),
    "the campaign went, with everything under it",
  );
  assert.ok(w.ad().launch.stopped_at, "and when it stopped is kept");
});

test("a cancel kept before the job takes the launch up makes nothing at Meta", async () => {
  const w = world();
  cancel(w);
  await w.run();
  assert.deepEqual(names(), [], "not a dry run, not a make");
  assert.deepEqual([w.ad().status, w.ad().launch.stopped], ["failed", "cancelled"]);
});

test("a cancel that lands after the read back is read fresh before the first switch: no switch goes", async () => {
  const w = world();
  onAsk = (name) => {
    if (name === "read_back") cancel(w);
  };
  await w.run();
  assert.deepEqual(switches(), []);
  assert.deepEqual([w.ad().status, w.ad().launch.stopped, names().at(-1)], ["failed", "cancelled", "remove"]);
});

test("a cancel that lands between two switches stops the rest, and the campaign, never switched, is removed", async () => {
  const w = world();
  onAsk = (name) => {
    if (name === "switch_ad_2") cancel(w);
  };
  await w.run();
  assert.deepEqual(switches(), ["switch_ad_1", "switch_ad_2"], "the campaign, the last switch, never went");
  assert.equal(meta.campaign.status, "PAUSED", "so nothing ran");
  assert.deepEqual([w.ad().status, w.ad().launch.stopped, names().at(-1)], ["failed", "cancelled", "remove"]);
});

test("a cancel that lands after the last switch leaves the ad made and paused at once: nothing it cancelled runs on", async () => {
  const w = world();
  onAsk = (name) => {
    if (name === "switch_campaign") cancel(w);
  };
  await w.run();
  assert.deepEqual([w.ad().status, w.ad().intent, w.ad().paused_by], ["made", "paused", "owner"]);
});

test("a way in that closed since the press switches nothing on: Meta stopped the number, so the launch stops", async () => {
  for (const [why, over] of [
    ["blocked", { standing: "BLOCKED" }],
    ["not known", { standing: "SOMETHING_NEW" }],
    ["billing paused", {}],
  ]) {
    const w = world(over);
    if (why === "billing paused") w.tables.tenants[0].status = "paused";
    await w.run();
    assert.deepEqual(switches(), [], why);
    assert.deepEqual([w.ad().status, w.ad().launch.stopped, names().at(-1)], ["failed", "way_in", "remove"], why);
  }
});

test("a video, or a picture Files no longer holds, stops it before Meta is sent a picture", async () => {
  for (const [why, over] of [
    ["a video", { approved: { ...APPROVED, picture_kind: "video" } }],
    ["no file", { approved: { ...APPROVED, picture: "f2f2f2f2-8888-4000-8000-000000000009" } }],
  ]) {
    const w = world(over);
    await w.run();
    assert.ok(!names().includes("picture"), why);
    assert.deepEqual([w.ad().launch.stopped, names().at(-1)], ["picture", "remove"], why);
  }
});

test("a row with less than a whole approval is never sent; sandbox does everything but the call; off sends nothing", async () => {
  const half = world({ approved: { ...APPROVED, most_minor: 1600 } });
  await half.run();
  assert.deepEqual(names(), [], "the most the press named is not the total: nothing is sent");
  assert.deepEqual([half.ad().status, half.ad().launch.stopped], ["failed", "business"]);

  const sandbox = world();
  await sandbox.run({ writes: "sandbox" });
  assert.deepEqual(names(), [], "Meta is called for nothing");
  assert.equal(sandbox.ad().status, "made");
  assert.ok(sandbox.ad().platform_ad_id.startsWith("0000"), "its made-up ids begin 0000, which Meta never gives");
  assert.equal(sandbox.tables.ad_objects.length, 6);

  const off = world();
  await off.run({ writes: "off" });
  assert.deepEqual(names(), []);
  assert.deepEqual([off.ad().status, off.ad().launch.stopped], ["failed", "off"]);
});

test("a pass that runs short of time waits, and sends no make it could not answer for in time", async () => {
  const w = world();
  await w.run({ deadline: Date.now() + 20_000 });
  assert.deepEqual(names(), [], "too little time left to start a call");
  assert.equal(w.ad().status, "sending");
  assert.deepEqual(w.tables.ad_objects, []);
});
