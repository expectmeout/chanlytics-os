/**
 * The paused-ad check (apps/edge/lib/ads/paused-check.ts runAdsCheck; the Ads plan's step 4, "Checking against Meta
 * without spending"): an owner's judged draft sent to Meta once on their own ad account, run over a database in memory
 * and a Meta that answers as its pages document (read 19 November 2026).
 *
 * What must hold. Nothing is sent unless this deployment's switch is live for the workspace, and for anyone but the
 * owner. Each dry run comes just before its own make and carries no key; each make carries one, and is paused. The ad
 * set names the number AI answers, a total and its end in the account's own zone. The picture goes as Files keeps it.
 * Where Meta refuses a step, nothing after it is sent and Meta's own words are said, and a campaign already made is
 * removed. The read back says what Meta holds that is not what was sent. And a campaign an earlier check left is removed
 * only where it is this account's, paused, named by a check, with no ad.
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
const T = "abababab-7777-4000-8000-000000000001";
const U = "cdcdcdcd-7777-4000-8000-000000000001";
const ACCOUNT = "acacacac-7777-4000-8000-000000000001";
const FILE = "f1f1f1f1-7777-4000-8000-000000000001";
const META_ACCOUNT = "1200000000000071";
const PAGE = "100000000000071";
const CAMPAIGN = "23850000000000071";
const SET = "23850000000000072";
const META_AD = "23850000000000073";
const HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const APP = {
  META_APP_ID: "990000000000077",
  META_APP_SECRET: "meta-secret-for-this-file",
  META_ADS_CONFIG_ID: "880000000000002",
  META_ADS_REDIRECT_URI: "https://app.example.com/api/v1/ads/connect/callback",
  ADS_WORKSPACES: T,
  ADS_WRITES: "live",
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { runAdsCheck } = await import(at("apps/edge/lib/ads/paused-check.ts"));

const auth = { ok: true, via: "token", workspace: T, user: U };
const PICTURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const DRAFT = {
  service: "First appointment",
  picture: FILE,
  miles: 5,
  total_minor: 1400,
  end_day: "2026-12-04",
  text: "A first appointment at Harbor Studio takes 45 minutes. Message us on WhatsApp to pick a time.",
  headline: "First appointment",
  address: "12 Harbor Street, Miami, FL",
  whatsapp: "+1 (305) 555-0142",
};

/** What Meta holds after the makes, as the read back answers it: exactly what was sent. */
function heldAsSent() {
  return {
    id: CAMPAIGN,
    name: "Chanlytics · First appointment · paused check",
    status: "PAUSED",
    effective_status: "PAUSED",
    objective: "OUTCOME_ENGAGEMENT",
    special_ad_categories: [],
    adsets: {
      data: [
        {
          id: SET,
          status: "PAUSED",
          destination_type: "WHATSAPP",
          optimization_goal: "CONVERSATIONS",
          lifetime_budget: "1400",
          daily_budget: "0",
          end_time: "2026-12-04T23:59:00-0500",
          promoted_object: { page_id: PAGE, whatsapp_phone_number: "13055550142" },
          targeting: {
            age_min: 18,
            geo_locations: { custom_locations: [{ address_string: DRAFT.address, radius: 5, distance_unit: "mile" }] },
            publisher_platforms: ["facebook"],
            facebook_positions: ["feed", "story", "facebook_reels"],
          },
        },
      ],
    },
    ads: {
      data: [
        {
          id: META_AD,
          status: "PAUSED",
          effective_status: "PENDING_REVIEW",
          adset_id: SET,
          creative: {
            id: "120000000000079",
            object_story_spec: {
              page_id: PAGE,
              link_data: {
                message: DRAFT.text,
                name: DRAFT.headline,
                call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } },
              },
            },
            degrees_of_freedom_spec: { creative_features_spec: { image_touchups: { enroll_status: "OPT_OUT" } } },
            contextual_multi_ads: { enroll_status: "OPT_OUT" },
          },
        },
      ],
    },
  };
}

/** Meta, as the check meets it: each call kept as asked, each answered by what it is, a refusal where one is set. */
const asked = [];
let refuseAt = null;
let held = heldAsSent();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const address = new URL(String(url));
  const method = init?.method ?? "GET";
  const form = method === "POST" ? new URLSearchParams(String(init?.body ?? "")) : null;
  const options = form?.get("execution_options");
  const edge = address.pathname.split("/").at(-1);
  const name =
    method === "GET"
      ? ({ minimum_budgets: "least_a_day", connected_instagram_accounts: "instagram" }[edge] ?? "read_back")
      : method === "DELETE"
        ? "remove"
        : { campaigns: "campaign", adsets: "ad_set", adimages: "picture", ads: "ad" }[edge] + (options ? "_dry" : "");
  asked.push({ name, form, key: init?.headers?.["X-Client-Idempotent-Key"] ?? null, url: address });
  const reply = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (refuseAt === name)
    return reply(400, {
      error: {
        message: "Invalid parameter",
        code: 100,
        error_subcode: 1885272,
        error_user_msg: "Your budget is too low.",
        error_data: { blame_field_specs: [["lifetime_budget"]] },
      },
    });
  if (options) return reply(200, { success: true });
  const answers = {
    least_a_day: { data: [{ currency: "USD", min_daily_budget_imp: 100 }] },
    instagram: { data: [] },
    campaign: { id: CAMPAIGN },
    ad_set: { id: SET },
    picture: { images: { bytes: { hash: HASH, url: "https://example.com/picture.png" } } },
    ad: { id: META_AD },
    read_back: held,
    remove: { success: true },
  };
  return reply(200, answers[name]);
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

/** A workspace whose owner is U, one connected ad account with its Page, and the picture in Files. */
function world({ owner = true, account = {}, file = {} } = {}) {
  resetBreakers();
  Object.assign(process.env, APP);
  asked.length = 0;
  refuseAt = null;
  held = heldAsSent();
  const db = fakeDb(
    {
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
          ...account,
        },
      ],
      files: [{ id: FILE, tenant_id: T, mime: "image/png", removed_at: null, ...file }],
    },
    {},
    {
      has_permission: ({ p_permission }) => owner && p_permission === "ads",
      ad_credentials_get: () => ({ access_token: "the-business-token" }),
    },
  );
  db.storage = { from: () => ({ download: async () => ({ data: new Blob([PICTURE]), error: null }) }) };
  setPg(db);
  return () => runAdsCheck(auth, { tenant_id: T, user_id: U, draft: DRAFT });
}
const heard = async (res) => [res.status, await res.json()];
const names = () => asked.map((call) => call.name);

test("nothing is sent unless the switch is live for the workspace, nor for anyone but the owner", async () => {
  const check = world();
  for (const writes of [undefined, "off", "sandbox"]) {
    if (writes) process.env.ADS_WRITES = writes;
    else delete process.env.ADS_WRITES;
    assert.equal((await heard(await check()))[1].error, "ads_writes_off", String(writes));
  }
  process.env.ADS_WRITES = "live";
  process.env.ADS_WORKSPACES = "another-workspace";
  assert.equal((await heard(await check()))[1].error, "ads_writes_off");
  const [status, body] = await heard(await world({ owner: false })());
  assert.deepEqual([status, body.error], [403, "ad_account_not_owner"]);
  const [, unpaged] = await heard(await world({ account: { config: {} } })());
  assert.equal(unpaged.error, "nothing_to_do", "an account with no Page makes no ad");
  assert.deepEqual(asked, [], "and Meta is asked nothing");
});

test("each dry run comes just before its own make, and every make is paused and carries a key of its own", async () => {
  const [status, body] = await heard(await world()());
  assert.equal(status, 200);
  assert.deepEqual(names(), [
    "least_a_day",
    "instagram",
    "campaign_dry",
    "campaign",
    "ad_set_dry",
    "ad_set",
    "picture",
    "ad_dry",
    "ad",
    "read_back",
  ]);
  assert.deepEqual([body.outcome, body.differs], ["matches", []]);
  assert.deepEqual(
    body.steps.map((step) => [step.at, step.outcome]),
    names().map((name) => [name, "ok"]),
  );
  assert.equal(body.steps.find((step) => step.at === "least_a_day").said, "100 a day");
  assert.equal(body.steps.find((step) => step.at === "instagram").said, "0 named");
  assert.deepEqual(
    body.steps.filter((step) => step.id).map((step) => [step.at, step.id]),
    [
      ["campaign", CAMPAIGN],
      ["ad_set", SET],
      ["ad", META_AD],
    ],
  );
  const makes = asked.filter((call) => ["campaign", "ad_set", "ad"].includes(call.name));
  const dries = asked.filter((call) => call.name.endsWith("_dry"));
  for (const call of [...makes, ...dries]) assert.equal(call.form.get("status"), "PAUSED", call.name);
  for (const call of dries) assert.equal(call.key, null, `${call.name}: a dry run carries no key`);
  const keys = makes.map((call) => call.key);
  assert.ok(keys.every(Boolean) && new Set(keys).size === 3, "a key each, never one shared");
  assert.deepEqual(JSON.parse(asked.find((call) => call.name === "ad_dry").form.get("execution_options")), [
    "validate_only",
    "synchronous_ad_review",
  ]);
  // The ad set's dry run already names the campaign just made, and the ad's names the ad set.
  assert.equal(asked.find((call) => call.name === "ad_set_dry").form.get("campaign_id"), CAMPAIGN);
  assert.equal(asked.find((call) => call.name === "ad_dry").form.get("adset_id"), SET);
});

test("the ad set names the number AI answers, a total and its end in the account's zone; the picture goes as kept", async () => {
  await world()();
  const set = asked.find((call) => call.name === "ad_set").form;
  assert.deepEqual(JSON.parse(set.get("promoted_object")), { page_id: PAGE, whatsapp_phone_number: "13055550142" });
  assert.equal(set.get("lifetime_budget"), "1400");
  assert.equal(set.get("end_time"), "2026-12-05T04:59:00.000Z", "23:59 in New York on the draft's last day");
  assert.deepEqual(JSON.parse(set.get("targeting")).publisher_platforms, ["facebook"], "never Instagram unchecked");
  const picture = asked.find((call) => call.name === "picture").form;
  assert.equal(picture.get("bytes"), Buffer.from(PICTURE).toString("base64"));
  const creative = JSON.parse(asked.find((call) => call.name === "ad").form.get("creative"));
  assert.deepEqual([creative.object_story_spec.page_id, creative.object_story_spec.link_data.image_hash], [PAGE, HASH]);
  assert.equal(creative.object_story_spec.link_data.message, DRAFT.text);
  assert.ok(String(creative.name).startsWith("Chanlytics · First appointment · paused check [cl:"));
});

test("where Meta refuses a step, nothing after it is sent, Meta's own words are said, and what was made is removed", async () => {
  const check = world();
  refuseAt = "ad_set_dry";
  const [status, body] = await heard(await check());
  assert.equal(status, 200);
  assert.deepEqual(names(), ["least_a_day", "instagram", "campaign_dry", "campaign", "ad_set_dry", "remove"]);
  assert.equal(body.outcome, "stopped");
  assert.deepEqual(body.steps.at(-2), {
    at: "ad_set_dry",
    outcome: "refused",
    said: "Your budget is too low.",
    id: null,
  });
  assert.equal(body.steps.find((step) => step.at === "campaign").id, CAMPAIGN, "what was made is named");
  assert.deepEqual(body.steps.at(-1), { at: "remove", outcome: "ok", said: null, id: null });
  assert.equal(asked.at(-1).url.pathname, `/v27.0/${CAMPAIGN}`, "the campaign it made, and with it what is under it");

  // A refusal before anything is made leaves nothing to remove.
  world();
  refuseAt = "campaign_dry";
  await check();
  assert.deepEqual(names(), ["least_a_day", "instagram", "campaign_dry"]);

  // A removal Meta refuses is said in Meta's own words too.
  world();
  refuseAt = "remove";
  held = {};
  const [, unremoved] = await heard(await check());
  assert.deepEqual(unremoved.steps.at(-1), {
    at: "remove",
    outcome: "refused",
    said: "Your budget is too low.",
    id: null,
  });
});

test("a picture Files cannot hand over as a photo stops the check before Meta is sent it", async () => {
  const [, body] = await heard(await world({ file: { mime: "video/mp4" } })());
  assert.deepEqual(names(), ["least_a_day", "instagram", "campaign_dry", "campaign", "ad_set_dry", "ad_set", "remove"]);
  assert.deepEqual(
    body.steps.slice(-2).map((step) => [step.at, step.outcome]),
    [
      ["picture", "unread"],
      ["remove", "ok"],
    ],
  );
  assert.equal(body.outcome, "stopped");
});

test("the read back says what Meta holds that is not what was sent", async () => {
  const check = world();
  held.special_ad_categories = ["HOUSING"];
  held.adsets.data[0].lifetime_budget = "1500";
  held.adsets.data[0].promoted_object.whatsapp_phone_number = "13055550199";
  held.adsets.data[0].targeting.publisher_platforms = ["facebook", "messenger"];
  held.ads.data[0].status = "ACTIVE";
  held.ads.data[0].creative.degrees_of_freedom_spec.creative_features_spec.text_optimizations = {
    enroll_status: "OPT_IN",
  };
  const [, body] = await heard(await check());
  assert.equal(body.outcome, "differs");
  assert.deepEqual(body.differs, ["declared", "total", "number", "places", "ad_paused", "own_changes"]);
});

test("a campaign a check left is removed only where it is this account's, paused, named by a check, with no ad", async () => {
  const leftover = () => ({
    id: CAMPAIGN,
    account_id: META_ACCOUNT,
    name: "Chanlytics · First appointment · paused check [cl:1a2b3c4d]",
    status: "PAUSED",
    effective_status: "PAUSED",
    objective: "OUTCOME_ENGAGEMENT",
    special_ad_categories: [],
  });
  const remove = (id = CAMPAIGN) => runAdsCheck(auth, { tenant_id: T, user_id: U, remove: id });
  world();
  held = leftover();
  const [status, body] = await heard(await remove());
  assert.equal(status, 200);
  assert.deepEqual(names(), ["read_back", "remove"]);
  assert.equal(body.outcome, "removed");
  assert.equal(asked[1].url.pathname, `/v27.0/${CAMPAIGN}`);

  for (const [why, change] of [
    ["in another account", (campaign) => Object.assign(campaign, { account_id: "1200000000000099" })],
    ["not named by a check", (campaign) => Object.assign(campaign, { name: "Spring offer" })],
    ["switched on", (campaign) => Object.assign(campaign, { status: "ACTIVE" })],
    ["with an ad under it", (campaign) => Object.assign(campaign, { ads: heldAsSent().ads })],
  ]) {
    world();
    held = change(leftover());
    const [, left] = await heard(await remove());
    assert.deepEqual(names(), ["read_back"], why);
    assert.deepEqual(
      [left.outcome, left.steps.at(-1).at, left.steps.at(-1).outcome],
      ["stopped", "remove", "refused"],
      why,
    );
  }

  // Neither a draft nor a campaign, both, or an id that is not Meta's: refused before Meta is asked anything.
  world();
  for (const ask of [{}, { draft: DRAFT, remove: CAMPAIGN }, { remove: `act_${META_ACCOUNT}` }, { remove: "12" }]) {
    const [refused, said] = await heard(await runAdsCheck(auth, { tenant_id: T, user_id: U, ...ask }));
    assert.deepEqual([refused, said.error], [400, "bad_request"], JSON.stringify(ask));
  }
  assert.deepEqual(asked, []);
});
