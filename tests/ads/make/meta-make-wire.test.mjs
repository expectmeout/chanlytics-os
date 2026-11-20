/**
 * Meta's ads wire, the making part (packages/channels/src/ads/meta-make.ts and meta-made.ts): the four requests that
 * make an ad which opens WhatsApp, each with its dry run, and what Meta's answers to them say. Pure: every request is
 * built and read here and none is sent, over Meta's requests and answers as its pages document them (read
 * 19 November 2026). What an account answers is seen at the paused-ad check, not here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const {
  META_MILES,
  META_OWN_CHANGES,
  metaAdRequest,
  metaAdSetRequest,
  metaCampaignRequest,
  metaCreativeRequest,
  metaCreativeSpec,
} = await import(at("packages/channels/src/ads/meta-make.ts"));
const {
  metaCampaignReadBackRequest,
  metaCampaignRemoveRequest,
  parseMetaCampaignHeld,
  parseMetaMadeId,
  parseMetaRefusal,
  parseMetaRemoved,
} = await import(at("packages/channels/src/ads/meta-made.ts"));
const { minorToMetaUnits } = await import(at("packages/channels/src/ads/meta-account.ts"));

const TOKEN = "token-for-this-file";
const SECRET = "app-secret-for-this-file";
const PROOF = createHmac("sha256", SECRET).update(TOKEN).digest("hex");
const ACCOUNT = "1200000000000042";
const CAMPAIGN = "23850000000000001";
const SET = "23850000000000002";
const PAGE = "100000000000077";
const KEY = "0b0f6c1e-7f0a-4a55-9d53-0c7a1b2f3d4e";
const DRY = { dryRun: true };

/** A request's body, read as the form it is. */
const formOf = (request) => new URLSearchParams(request.body);
const jsonOf = (request, field) => JSON.parse(formOf(request).get(field));

const SET_ASK = {
  accountId: ACCOUNT,
  campaignId: CAMPAIGN,
  name: "Chanlytics · First visit [cl:1a2b3c4d]",
  currency: "USD",
  totalMinor: 7000,
  endsAt: "2026-12-02T23:59:00-05:00",
  pageId: PAGE,
  whatsappNumber: "+1 (305) 555-0142",
  centre: { address: "12 Harbor Street, Miami, FL" },
  miles: 5,
  instagram: false,
};
const CREATIVE_ASK = {
  name: "Chanlytics · First visit · 1 [cl:1a2b3c4d]",
  pageId: PAGE,
  instagramUserId: null,
  text: "A first visit with time to talk it through. Message us on WhatsApp to pick a time.",
  headline: "First visits this month",
  picture: { kind: "image", hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90" },
};

test("money goes out in Meta's own units, exact or not at all", () => {
  assert.equal(minorToMetaUnits(7000, "USD"), 7000);
  assert.equal(minorToMetaUnits(7000, "JPY"), 7000);
  // Meta counts the forint whole, where ISO 4217 counts a hundred to it.
  assert.equal(minorToMetaUnits(700000, "HUF"), 7000);
  assert.equal(minorToMetaUnits(700050, "HUF"), null, "half a forint is not an amount Meta holds");
  // Meta counts the Bahraini dinar in hundredths, where ISO 4217 counts a thousand to it.
  assert.equal(minorToMetaUnits(2500, "BHD"), 250);
  assert.equal(minorToMetaUnits(2505, "BHD"), null);
  for (const odd of [0, -5, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])
    assert.equal(minorToMetaUnits(odd, "USD"), null, String(odd));
});

test("every make is paused, carries the token's proof in its body, and names no token in its address", () => {
  const made = [
    metaCampaignRequest(TOKEN, SECRET, { accountId: ACCOUNT, name: "Chanlytics · First visit" }, { key: KEY }),
    metaAdSetRequest(TOKEN, SECRET, SET_ASK, { key: KEY }),
    metaAdRequest(
      TOKEN,
      SECRET,
      { accountId: ACCOUNT, setId: SET, name: "Version 1", creative: CREATIVE_ASK },
      { key: KEY },
    ),
  ];
  for (const request of made) {
    assert.equal(request.method, "POST");
    assert.ok(!request.url.includes("access_token") && !request.url.includes("?"), request.url);
    assert.ok(request.url.startsWith("https://graph.facebook.com/v27.0/act_1200000000000042/"), request.url);
    const form = formOf(request);
    assert.equal(form.get("status"), "PAUSED");
    assert.equal(form.get("access_token"), TOKEN);
    assert.equal(form.get("appsecret_proof"), PROOF);
    assert.equal(request.headers["Content-Type"], "application/x-www-form-urlencoded");
  }
  // A creative has no switch of its own: it is shown only by an ad, and every ad is made paused.
  const creative = metaCreativeRequest(TOKEN, SECRET, { ...CREATIVE_ASK, accountId: ACCOUNT }, { key: KEY });
  assert.equal(formOf(creative).get("appsecret_proof"), PROOF);
  assert.ok(creative.url.endsWith("/act_1200000000000042/adcreatives"));
});

test("a dry run says so and carries no key; a real make carries its key and no dry-run option", () => {
  const real = metaCampaignRequest(
    TOKEN,
    SECRET,
    { accountId: ACCOUNT, name: "Chanlytics · First visit" },
    { key: KEY },
  );
  assert.equal(real.headers["X-Client-Idempotent-Key"], KEY);
  assert.equal(formOf(real).get("execution_options"), null);

  const dry = metaCampaignRequest(TOKEN, SECRET, { accountId: ACCOUNT, name: "Chanlytics · First visit" }, DRY);
  assert.equal(dry.headers["X-Client-Idempotent-Key"], undefined, "Meta's page: no key on a validation-only request");
  assert.deepEqual(jsonOf(dry, "execution_options"), ["validate_only"]);
  assert.deepEqual(jsonOf(metaAdSetRequest(TOKEN, SECRET, SET_ASK, DRY), "execution_options"), ["validate_only"]);
  assert.deepEqual(
    jsonOf(metaCreativeRequest(TOKEN, SECRET, { ...CREATIVE_ASK, accountId: ACCOUNT }, DRY), "execution_options"),
    ["validate_only"],
  );
  // The ad's dry run also asks for Meta's own look at the words and the picture.
  const ad = metaAdRequest(
    TOKEN,
    SECRET,
    { accountId: ACCOUNT, setId: SET, name: "Version 1", creative: CREATIVE_ASK },
    DRY,
  );
  assert.deepEqual(jsonOf(ad, "execution_options"), ["validate_only", "synchronous_ad_review"]);
  assert.equal(ad.headers["X-Client-Idempotent-Key"], undefined);

  for (const key of ["", "has a space", "x".repeat(129), "semi;colon"])
    assert.throws(
      () => metaCampaignRequest(TOKEN, SECRET, { accountId: ACCOUNT, name: "A campaign" }, { key }),
      /key/,
      JSON.stringify(key),
    );
});

test("the campaign looks for conversations, is declared as no special kind, and shares no budget", () => {
  const form = formOf(
    metaCampaignRequest(TOKEN, SECRET, { accountId: `act_${ACCOUNT}`, name: "  Chanlytics · First visit  " }, DRY),
  );
  assert.equal(form.get("name"), "Chanlytics · First visit");
  assert.equal(form.get("objective"), "OUTCOME_ENGAGEMENT");
  assert.equal(form.get("buying_type"), "AUCTION");
  assert.equal(form.get("special_ad_categories"), "[]");
  assert.equal(form.get("is_adset_budget_sharing_enabled"), "false");
  // The amount is the ad set's: a campaign that also held one would be refused.
  assert.equal(form.get("lifetime_budget"), null);
  assert.equal(form.get("daily_budget"), null);
  assert.throws(() => metaCampaignRequest(TOKEN, SECRET, { accountId: ACCOUNT, name: "   " }, DRY), /name/);
});

test("the ad set opens WhatsApp and holds a total with its end, in Meta's own units", () => {
  const form = formOf(metaAdSetRequest(TOKEN, SECRET, SET_ASK, DRY));
  assert.equal(form.get("campaign_id"), CAMPAIGN);
  assert.equal(form.get("destination_type"), "WHATSAPP");
  assert.equal(form.get("optimization_goal"), "CONVERSATIONS");
  assert.equal(form.get("billing_event"), "IMPRESSIONS");
  assert.equal(form.get("bid_strategy"), "LOWEST_COST_WITHOUT_CAP");
  assert.equal(form.get("lifetime_budget"), "7000");
  assert.equal(form.get("daily_budget"), null, "a total, never an amount a day: only a total makes 'up to' true");
  assert.equal(form.get("end_time"), "2026-12-03T04:59:00.000Z");
  assert.equal(form.get("start_time"), null, "absent, it starts when it is switched on");
  assert.deepEqual(JSON.parse(form.get("promoted_object")), { page_id: PAGE, whatsapp_phone_number: "13055550142" });

  // The forint is whole at Meta: 70 000 Ft is 7 000 000 in its ISO minor units and 70000 on the wire.
  const forint = formOf(metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, currency: "HUF", totalMinor: 7_000_000 }, DRY));
  assert.equal(forint.get("lifetime_budget"), "70000");
  assert.throws(
    () => metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, currency: "HUF", totalMinor: 7_000_050 }, DRY),
    /exact/,
    "an amount Meta cannot hold exact is never rounded on the way",
  );
  assert.throws(() => metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, totalMinor: 0 }, DRY), /exact/);
  assert.throws(() => metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, endsAt: "next Tuesday" }, DRY), /moment/);
  assert.throws(
    () =>
      metaAdSetRequest(
        TOKEN,
        SECRET,
        { ...SET_ASK, startsAt: "2026-12-03T00:00:00Z", endsAt: "2026-12-02T00:00:00Z" },
        DRY,
      ),
    /end comes after/,
  );
  assert.throws(() => metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, campaignId: "not-an-id" }, DRY), /campaign/);
  // The number AI answers is always named. A Page can hold several numbers, and with none named Meta opens the Page's
  // own first one: an ad would then bring people to a number nobody answers for the business here. So no request is
  // built without it.
  for (const whatsappNumber of ["", "no number", "12345", "1".repeat(16)])
    assert.throws(
      () => metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, whatsappNumber }, DRY),
      /WhatsApp number/,
      JSON.stringify(whatsappNumber),
    );
  const dry = JSON.parse(formOf(metaAdSetRequest(TOKEN, SECRET, SET_ASK, DRY)).get("promoted_object"));
  const real = JSON.parse(formOf(metaAdSetRequest(TOKEN, SECRET, SET_ASK, { key: KEY })).get("promoted_object"));
  assert.equal(dry.whatsapp_phone_number, "13055550142");
  assert.deepEqual(real, dry, "the dry run names the same number the make does");
});

test("who sees it: adults in the circle, on the places named, and nowhere Meta adds by itself", () => {
  const targeting = jsonOf(metaAdSetRequest(TOKEN, SECRET, SET_ASK, DRY), "targeting");
  assert.equal(targeting.age_min, 18);
  assert.equal(targeting.age_max, undefined, "Meta takes no oldest age with its automatic audience on");
  assert.deepEqual(targeting.geo_locations, {
    custom_locations: [{ address_string: "12 Harbor Street, Miami, FL", radius: 5, distance_unit: "mile" }],
    location_types: ["home", "recent"],
  });
  assert.deepEqual(targeting.targeting_automation, { advantage_audience: 1 });
  // With no Instagram account known the ad shows on Facebook alone.
  assert.deepEqual(targeting.publisher_platforms, ["facebook"]);
  assert.deepEqual(targeting.facebook_positions, ["feed", "story", "facebook_reels"]);
  assert.equal(targeting.instagram_positions, undefined);
  // WhatsApp Status is on only when named, and reaches people whose age WhatsApp does not know: it is never named.
  assert.equal(targeting.whatsapp_positions, undefined);
  assert.equal(targeting.messenger_positions, undefined);
  assert.equal(targeting.audience_network_positions, undefined);

  const both = jsonOf(metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, instagram: true }, DRY), "targeting");
  assert.deepEqual(both.publisher_platforms, ["facebook", "instagram"]);
  assert.deepEqual(both.instagram_positions, ["stream", "story", "reels"]);

  const point = jsonOf(
    metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, centre: { latitude: 25.77, longitude: -80.19 }, miles: 12 }, DRY),
    "targeting",
  );
  assert.deepEqual(point.geo_locations.custom_locations, [
    { latitude: 25.77, longitude: -80.19, radius: 12, distance_unit: "mile" },
  ]);
  assert.deepEqual(META_MILES, { least: 0.63, most: 50 });
  for (const miles of [0, 0.5, 51, Number.NaN])
    assert.throws(() => metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, miles }, DRY), /miles/, String(miles));
  assert.throws(() => metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, centre: { address: " " } }, DRY), /address/);
  assert.throws(
    () => metaAdSetRequest(TOKEN, SECRET, { ...SET_ASK, centre: { latitude: 125, longitude: 0 } }, DRY),
    /point/,
  );
});

test("a creative opens a WhatsApp chat as the Page, with every one of Meta's own changes switched off", () => {
  const spec = metaCreativeSpec(CREATIVE_ASK);
  assert.deepEqual(spec.object_story_spec, {
    page_id: PAGE,
    link_data: {
      link: "https://api.whatsapp.com/send",
      message: CREATIVE_ASK.text,
      name: CREATIVE_ASK.headline,
      image_hash: CREATIVE_ASK.picture.hash,
      call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } },
    },
  });
  const switches = spec.degrees_of_freedom_spec.creative_features_spec;
  assert.deepEqual(Object.keys(switches).sort(), [...META_OWN_CHANGES].sort());
  for (const [change, state] of Object.entries(switches)) assert.deepEqual(state, { enroll_status: "OPT_OUT" }, change);
  assert.ok(META_OWN_CHANGES.includes("text_optimizations") && META_OWN_CHANGES.includes("image_touchups"));
  // The one switch Meta's guide still shows is retired: it is never sent, in or out.
  assert.equal(switches.standard_enhancements, undefined);
  // Meta adds music only where it is asked to, through an asset feed: none is sent.
  assert.equal(spec.asset_feed_spec, undefined);
  assert.deepEqual(spec.contextual_multi_ads, { enroll_status: "OPT_OUT" });

  // A video names its thumbnail, and its button carries the address, since a video has no link of its own.
  const video = metaCreativeSpec({
    ...CREATIVE_ASK,
    instagramUserId: "17841400000000001",
    picture: { kind: "video", videoId: "880000000000001", thumbnailHash: "b1b2c3d4e5f60718293a4b5c6d7e8f91" },
  });
  assert.deepEqual(video.object_story_spec, {
    page_id: PAGE,
    instagram_user_id: "17841400000000001",
    video_data: {
      video_id: "880000000000001",
      image_hash: "b1b2c3d4e5f60718293a4b5c6d7e8f91",
      message: CREATIVE_ASK.text,
      title: CREATIVE_ASK.headline,
      call_to_action: {
        type: "WHATSAPP_MESSAGE",
        value: { app_destination: "WHATSAPP", link: "https://api.whatsapp.com/send" },
      },
    },
  });

  assert.throws(() => metaCreativeSpec({ ...CREATIVE_ASK, text: "  " }), /text/);
  assert.throws(() => metaCreativeSpec({ ...CREATIVE_ASK, text: "x".repeat(1025) }), /text/);
  assert.throws(() => metaCreativeSpec({ ...CREATIVE_ASK, headline: "x".repeat(256) }), /headline/);
  assert.throws(
    () => metaCreativeSpec({ ...CREATIVE_ASK, picture: { kind: "image", hash: "https://example.com/a.png" } }),
    /library/,
  );
  assert.throws(() => metaCreativeSpec({ ...CREATIVE_ASK, pageId: "the-page" }), /Page/);
});

test("an ad joins one version to the ad set, with its creative inside it or by its id", () => {
  const inline = metaAdRequest(
    TOKEN,
    SECRET,
    { accountId: ACCOUNT, setId: SET, name: "Version 1", creative: CREATIVE_ASK },
    { key: KEY },
  );
  assert.ok(inline.url.endsWith("/act_1200000000000042/ads"));
  assert.equal(formOf(inline).get("adset_id"), SET);
  assert.deepEqual(jsonOf(inline, "creative"), metaCreativeSpec(CREATIVE_ASK));
  const byId = metaAdRequest(
    TOKEN,
    SECRET,
    { accountId: ACCOUNT, setId: SET, name: "Version 1", creative: { id: "120000000000009" } },
    { key: KEY },
  );
  assert.deepEqual(jsonOf(byId, "creative"), { creative_id: "120000000000009" });
  assert.throws(
    () =>
      metaAdRequest(TOKEN, SECRET, { accountId: ACCOUNT, setId: "x", name: "Version 1", creative: CREATIVE_ASK }, DRY),
    /ad set/,
  );
});

test("what a make answers: the id of what was made, or Meta's own words and the field it blames", () => {
  assert.equal(parseMetaMadeId({ id: "23850000000000009" }), "23850000000000009");
  assert.equal(parseMetaMadeId({ id: "23850000000000009", success: true }), "23850000000000009");
  // A dry run answers yes and names nothing.
  assert.equal(parseMetaMadeId({ success: true }), null);
  for (const odd of [null, "23850000000000009", {}, { id: "soon" }, { error: { message: "no" } }])
    assert.equal(parseMetaMadeId(odd), null, JSON.stringify(odd));

  assert.equal(parseMetaRefusal({ id: "23850000000000009" }), null);
  assert.equal(parseMetaRefusal({ success: true }), null);
  // Meta's own example of a validation error, with its sentence for the person beside it.
  const refusal = parseMetaRefusal({
    error: {
      type: "Exception",
      message: "Invalid parameter",
      code: 100,
      error_subcode: 1885272,
      is_transient: false,
      error_user_title: "Budget is too low",
      error_user_msg: "The budget for your ad set is too low. It must be at least $1.00 per day.",
      error_data: { blame_field_specs: [["lifetime_budget"], ["targeting", "geo_locations"]] },
    },
  });
  assert.deepEqual(refusal, {
    words: "The budget for your ad set is too low. It must be at least $1.00 per day.",
    title: "Budget is too low",
    code: 100,
    subcode: 1885272,
    fields: ["lifetime_budget", "targeting.geo_locations"],
    passing: false,
  });
  // With no sentence for the person, Meta's message is all there is; the blob can come as JSON in a string.
  const bare = parseMetaRefusal({
    error: {
      message: "Please reduce the amount of data.",
      code: 1,
      is_transient: true,
      error_data: '{"blame_field_specs":[["creative"]]}',
    },
  });
  assert.equal(bare.words, "Please reduce the amount of data.");
  assert.equal(bare.title, null);
  assert.deepEqual(bare.fields, ["creative"]);
  assert.equal(bare.passing, true);
  assert.deepEqual(parseMetaRefusal({ error: { message: "No.", error_data: "not json" } }).fields, []);
});

const HELD = {
  id: CAMPAIGN,
  account_id: ACCOUNT,
  name: "Chanlytics · First visit [cl:1a2b3c4d]",
  status: "PAUSED",
  effective_status: "PAUSED",
  objective: "OUTCOME_ENGAGEMENT",
  special_ad_categories: [],
  adsets: {
    data: [
      {
        id: SET,
        name: "Chanlytics · First visit [cl:1a2b3c4d]",
        status: "PAUSED",
        destination_type: "WHATSAPP",
        optimization_goal: "CONVERSATIONS",
        lifetime_budget: "7000",
        daily_budget: "0",
        start_time: "2026-11-20T09:00:00-0500",
        end_time: "2026-12-02T23:59:00-0500",
        promoted_object: { page_id: PAGE, whatsapp_phone_number: "13055550142" },
        targeting: {
          age_min: 18,
          age_max: 65,
          geo_locations: {
            custom_locations: [{ address_string: "12 Harbor Street, Miami, FL", radius: 5, distance_unit: "mile" }],
            location_types: ["home", "recent"],
          },
          publisher_platforms: ["facebook", "instagram"],
          facebook_positions: ["feed", "story", "facebook_reels"],
          instagram_positions: ["stream", "story", "reels"],
        },
      },
    ],
  },
  ads: {
    data: [
      {
        id: "23850000000000003",
        name: "Version 1",
        status: "PAUSED",
        effective_status: "PENDING_REVIEW",
        adset_id: SET,
        creative: {
          id: "120000000000009",
          object_story_spec: metaCreativeSpec({ ...CREATIVE_ASK, instagramUserId: "17841400000000001" })
            .object_story_spec,
          degrees_of_freedom_spec: {
            creative_features_spec: {
              text_optimizations: { enroll_status: "OPT_OUT" },
              standard_enhancements: { enroll_status: "OPT_OUT" },
            },
          },
          contextual_multi_ads: { enroll_status: "OPT_OUT" },
        },
      },
    ],
  },
};

test("the read back asks for a campaign whole, in one call, with the token's proof", () => {
  const request = metaCampaignReadBackRequest(TOKEN, SECRET, CAMPAIGN);
  assert.equal(request.method, "GET");
  const url = new URL(request.url);
  assert.equal(url.pathname, `/v27.0/${CAMPAIGN}`);
  assert.equal(url.searchParams.get("appsecret_proof"), PROOF);
  const fields = url.searchParams.get("fields");
  for (const field of [
    "account_id",
    "special_ad_categories",
    "adsets{",
    "lifetime_budget",
    "end_time",
    "targeting",
    "ads{",
    "degrees_of_freedom_spec",
  ])
    assert.ok(fields.includes(field), field);
  assert.throws(() => metaCampaignReadBackRequest(TOKEN, SECRET, "act_1"), /campaign/);
});

test("the read back is read into what a launch compares: paused, the total, the end, no special kind, WhatsApp", () => {
  const held = parseMetaCampaignHeld(HELD, "USD");
  assert.equal(held.accountId, ACCOUNT, "the account it is in, so a removal can ask it is this one");
  assert.equal(held.paused, true);
  assert.equal(held.objective, "OUTCOME_ENGAGEMENT");
  assert.deepEqual(held.declared, []);
  assert.deepEqual(held.sets, [
    {
      id: SET,
      name: "Chanlytics · First visit [cl:1a2b3c4d]",
      paused: true,
      opens: "WHATSAPP",
      goal: "CONVERSATIONS",
      totalMinor: 7000,
      dailyMinor: null,
      startsAt: "2026-11-20T14:00:00.000Z",
      endsAt: "2026-12-03T04:59:00.000Z",
      pageId: PAGE,
      whatsappNumber: "13055550142",
      youngest: 18,
      miles: 5,
      places: [
        "facebook:facebook_reels",
        "facebook:feed",
        "facebook:story",
        "instagram:reels",
        "instagram:story",
        "instagram:stream",
      ],
    },
  ]);
  const [ad] = held.ads;
  assert.equal(ad.paused, true);
  assert.equal(ad.state, "PENDING_REVIEW", "an ad made paused still goes through Meta's check");
  assert.equal(ad.setId, SET);
  assert.equal(ad.creativeId, "120000000000009");
  assert.equal(ad.pageId, PAGE);
  assert.equal(ad.instagramUserId, "17841400000000001");
  assert.equal(ad.text, CREATIVE_ASK.text);
  assert.equal(ad.headline, CREATIVE_ASK.headline);
  assert.equal(ad.whatsapp, true);
  assert.deepEqual(ad.ownChanges, []);
  assert.equal(ad.besideOthers, false);
});

test("the read back says what differs: a switch on, a kind declared, a change of Meta's own, another currency's units", () => {
  const moved = structuredClone(HELD);
  moved.status = "ACTIVE";
  moved.special_ad_categories = ["NONE", "HOUSING"];
  moved.adsets.data[0].status = "ACTIVE";
  moved.adsets.data[0].lifetime_budget = "0";
  moved.adsets.data[0].daily_budget = "1500";
  moved.adsets.data[0].targeting.publisher_platforms = ["facebook", "messenger"];
  moved.adsets.data[0].targeting.geo_locations.custom_locations[0].distance_unit = "kilometer";
  const creative = moved.ads.data[0].creative;
  creative.degrees_of_freedom_spec.creative_features_spec.standard_enhancements = { enroll_status: "OPT_IN" };
  creative.degrees_of_freedom_spec.creative_features_spec.image_touchups = { enroll_status: "OPT_IN" };
  creative.contextual_multi_ads = { enroll_status: "OPT_IN" };
  creative.object_story_spec.link_data.call_to_action = { type: "LEARN_MORE", value: { link: "https://example.com" } };

  const held = parseMetaCampaignHeld(moved, "USD");
  assert.equal(held.paused, false);
  assert.deepEqual(held.declared, ["HOUSING"]);
  const [set] = held.sets;
  assert.equal(set.paused, false);
  assert.equal(set.totalMinor, null);
  assert.equal(set.dailyMinor, 1500);
  assert.equal(set.miles, null, "a circle in another unit is not read as miles");
  assert.deepEqual(set.places, ["facebook:facebook_reels", "facebook:feed", "facebook:story", "messenger:*"]);
  const [ad] = held.ads;
  assert.equal(ad.whatsapp, false);
  assert.deepEqual(ad.ownChanges, ["image_touchups", "standard_enhancements"]);
  assert.equal(ad.besideOthers, true);

  // Meta's units become the currency's own: 70000 whole forint is 7 000 000 of its ISO minor units.
  const forint = structuredClone(HELD);
  forint.adsets.data[0].lifetime_budget = "70000";
  assert.equal(parseMetaCampaignHeld(forint, "HUF").sets[0].totalMinor, 7_000_000);

  // An answer that is no campaign is never compared: Meta's own words where it gave some.
  assert.throws(
    () => parseMetaCampaignHeld({ error: { message: "Unsupported get request." } }, "USD"),
    /Unsupported get/,
  );
  assert.throws(() => parseMetaCampaignHeld({}, "USD"), /did not describe/);
  // A campaign with nothing under it yet reads as one, empty.
  const empty = parseMetaCampaignHeld({ id: CAMPAIGN, status: "PAUSED" }, "USD");
  assert.deepEqual([empty.sets, empty.ads, empty.declared, empty.objective], [[], [], [], null]);
});

test("a removal is Meta's DELETE on the campaign, with the token's proof and nothing else; it took only where Meta says so", () => {
  const request = metaCampaignRemoveRequest(TOKEN, SECRET, CAMPAIGN);
  assert.equal(request.method, "DELETE");
  assert.equal(request.body, undefined);
  const url = new URL(request.url);
  assert.equal(url.pathname, `/v27.0/${CAMPAIGN}`);
  assert.deepEqual([...url.searchParams.keys()].sort(), ["access_token", "appsecret_proof"]);
  assert.equal(url.searchParams.get("appsecret_proof"), PROOF);
  assert.throws(() => metaCampaignRemoveRequest(TOKEN, SECRET, `act_${ACCOUNT}`), /campaign/);
  assert.throws(() => metaCampaignRemoveRequest(TOKEN, SECRET, `${CAMPAIGN}/adsets`), /campaign/);
  assert.equal(parseMetaRemoved({ success: true }), true);
  for (const answer of [
    { success: false },
    { success: "true" },
    {},
    null,
    { error: { message: "Unsupported delete request." } },
  ])
    assert.equal(parseMetaRemoved(answer), false, JSON.stringify(answer));
});
