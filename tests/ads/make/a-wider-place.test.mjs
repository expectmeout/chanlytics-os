/**
 * An ad shown wider than the circle around a business (the Ads plan's 4.6 and G8, as Ruben settled them on
 * 20 November 2026): a city, a state or region, or the whole country. Five miles around the address stays the start
 * for a business people visit; "Tell AI what to change" widens the area; and where Google says the business goes to
 * its customers, a fresh draft proposes the place its listing names, with a line that says why.
 *
 * Run as it runs: Meta's wire (packages/channels ads/meta-place.ts, meta-make.ts, meta-made.ts) as pure functions, and
 * New ad's two routes (server/ads/draft.ts, words.ts) over a workspace in memory, with the edge's place search answered
 * by a stubbed fetch and the model a stream handed in. Nothing reaches Meta.
 *
 * What must hold. A draft holds only a place Meta said it knows, by Meta's own key, so nothing is refused later: a
 * name Meta does not know is a change not made. The place meant is picked by where the words around it say it is, the
 * Austin in Texas over another. A wider place needs no street address; going back to miles drops it. What is sent to
 * Meta and what Meta holds read the same, place for place. Nothing says a business serves online, so nothing proposes
 * a wider place for that.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const W = await import(at("packages/channels/src/ads/meta-place.ts"));
const { metaAdSetRequest } = await import(at("packages/channels/src/ads/meta-make.ts"));
const { parseMetaCampaignHeld } = await import(at("packages/channels/src/ads/meta-made.ts"));
const { draftAd } = await import(at("apps/dashboard/src/server/ads/draft.ts"));
const { writeAdWords } = await import(at("apps/dashboard/src/server/ads/words.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));
const { readerContext, readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { newAdView } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/new/model.ts"));
const C = await import("@chanlytics/contracts");

const TOKEN = "token-for-this-file";
const SECRET = "app-secret-for-this-file";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCOUNT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FILE = "f0000001-0000-4000-8000-000000000000";
const TZ = "America/Chicago";
const NOW = new Date("2026-11-20T15:00:00Z");

/* --------------------------------------------------------------------------------------------- Meta's wire */

/** Meta's answer to a place search, as its targeting search page shows one. */
const AUSTINS = {
  data: [
    {
      key: "2420379",
      name: "Austin",
      type: "city",
      country_code: "US",
      country_name: "United States",
      region: "Minnesota",
    },
    {
      key: "2421836",
      name: "Austin",
      type: "city",
      country_code: "US",
      country_name: "United States",
      region: "Texas",
    },
    { key: "", name: "Nowhere", type: "city", country_code: "US", region: "Texas" },
  ],
};

test("a place search asks Meta for one kind by a name, with the token's proof, and reads what Meta keys", () => {
  const request = W.metaPlacesRequest(TOKEN, SECRET, { kind: "city", query: "Austin" });
  const url = new URL(request.url);
  assert.equal(request.method, "GET");
  assert.match(url.pathname, /\/search$/);
  assert.equal(url.searchParams.get("type"), "adgeolocation");
  assert.equal(url.searchParams.get("location_types"), '["city"]');
  assert.equal(url.searchParams.get("q"), "Austin");
  assert.equal(url.searchParams.get("appsecret_proof"), createHmac("sha256", SECRET).update(TOKEN).digest("hex"));
  assert.throws(() => W.metaPlacesRequest(TOKEN, SECRET, { kind: "city", query: "  " }));
  // A place with no key is left out alone; the rest are read as Meta named them.
  assert.deepEqual(W.parseMetaPlaces(AUSTINS, "city"), [
    { kind: "city", key: "2420379", name: "Austin", region: "Minnesota", country: "US", countryName: "United States" },
    { kind: "city", key: "2421836", name: "Austin", region: "Texas", country: "US", countryName: "United States" },
  ]);
  // A country's key is its own code.
  assert.deepEqual(
    W.parseMetaPlaces({ data: [{ key: "US", name: "United States", type: "country", country_code: "US" }] }, "country"),
    [{ kind: "country", key: "US", name: "United States", region: null, country: "US", countryName: "United States" }],
  );
  assert.deepEqual(W.parseMetaPlaces({ error: { message: "no" } }, "city"), []);
});

const SET_ASK = {
  accountId: "1200000000000042",
  campaignId: "23850000000000001",
  name: "Harbor · check",
  currency: "USD",
  totalMinor: 1500,
  endsAt: "2026-12-04T23:59:00-06:00",
  pageId: "100000000000077",
  whatsappNumber: "+15125550142",
  centre: { address: "" },
  miles: 5,
  instagram: false,
};
const geoSent = (ask) =>
  JSON.parse(new URLSearchParams(metaAdSetRequest(TOKEN, SECRET, ask, { dry: true }).body).get("targeting"))
    .geo_locations;

test("a wider place is sent in the circle's stead, as Meta keys it, and reads back as the same word", () => {
  assert.deepEqual(geoSent({ ...SET_ASK, wide: { kind: "city", key: "2421836" } }), {
    cities: [{ key: "2421836", radius: W.META_CITY_MILES, distance_unit: "mile" }],
    location_types: ["home", "recent"],
  });
  assert.deepEqual(geoSent({ ...SET_ASK, wide: { kind: "region", key: "3886" } }).regions, [{ key: "3886" }]);
  assert.deepEqual(geoSent({ ...SET_ASK, wide: { kind: "country", key: "US" } }).countries, ["US"]);
  // No wider place: the circle around the street address, as before; and no address, no circle.
  const circle = geoSent({ ...SET_ASK, centre: { address: "12 Congress Ave, Austin, TX" } });
  assert.deepEqual(circle.custom_locations, [
    { address_string: "12 Congress Ave, Austin, TX", radius: 5, distance_unit: "mile" },
  ]);
  assert.throws(() => geoSent(SET_ASK), /street address/);
  // What a launch compares: the word for what was sent and the word for what Meta holds.
  for (const [wide, miles, word] of [
    [{ kind: "city", key: "2421836" }, 5, "city:2421836:10"],
    [{ kind: "region", key: "3886" }, 5, "region:3886"],
    [{ kind: "country", key: "US" }, 5, "country:US"],
    [null, 7, "circle:7"],
  ]) {
    assert.equal(W.metaAreaSent({ wide, miles }), word);
    const geo = wide ? geoSent({ ...SET_ASK, wide }) : geoSent({ ...SET_ASK, centre: { address: "1 A St" }, miles });
    const held = parseMetaCampaignHeld(
      { id: "23850000000000001", adsets: { data: [{ id: "23850000000000002", targeting: { geo_locations: geo } }] } },
      "USD",
    );
    assert.equal(held.sets[0].area, word);
  }
  // Two places at once, or a circle in kilometres, is no word: never taken for the one sent.
  assert.equal(W.metaAreaWord({ countries: ["US"], regions: [{ key: "3886" }] }), null);
  assert.equal(W.metaAreaWord({ custom_locations: [{ radius: 8, distance_unit: "kilometer" }] }), null);
});

/* ---------------------------------------------------------------------------------------------- New ad */

/** A mobile groomer: Google says it goes to its customers, and its listing names Austin, TX in the address's stead. */
const world = (over = {}) => ({
  memberships: [{ user_id: USER, tenant_id: "A", role: "owner", created_at: "2026-01-01T00:00:00Z" }],
  tenants: [{ id: "A", name: "Paws on Wheels", timezone: TZ, appointment_word: "appointment" }],
  tenant_config: [
    {
      tenant_id: "A",
      version: 1,
      config: {
        brain: {
          business_name: "Paws on Wheels",
          system_prompt: "Answer as the front desk of Paws on Wheels, a grooming van.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: { services: [{ name: "Full groom", duration_min: 90 }], ...over.profile },
        },
      },
    },
  ],
  tenant_channels: [
    { id: "ch-wa", tenant_id: "A", kind: "whatsapp", status: "active", number_e164: "+15125550142", config: {} },
  ],
  google_listings:
    over.listing === null
      ? []
      : [
          {
            tenant_id: "A",
            place_id: "ChIJ-made-up",
            name: "Paws on Wheels",
            address: "Austin, TX, USA",
            facts: { service_area_only: true },
            ...over.listing,
          },
        ],
  ad_accounts: [
    {
      id: ACCOUNT,
      tenant_id: "A",
      platform: "meta",
      external_id: "1000000000000001",
      name: "Paws ads",
      currency: "USD",
      timezone: TZ,
      status: "connected",
      standing: { account: "active", funding: "ok" },
      config: { page_id: "2000000000000002", page_name: "Paws on Wheels", min_daily_minor: 100, scopes: ["ads_read"] },
      connected_at: "2026-11-18T10:00:00Z",
      disconnected_at: null,
      revoked_at: null,
      read_at: "2026-11-20T14:00:00Z",
      read_error: null,
    },
  ],
  ads: [],
  files: [
    {
      id: FILE,
      tenant_id: "A",
      status: "filed",
      source: "upload",
      source_ref: null,
      name: "van",
      mime: "image/jpeg",
      bytes: 200_000,
      width: 1440,
      height: 1800,
      look: { line: "The grooming van outside a house.", people: { count: 0, recognizable: 0 }, issues: [] },
      look_status: "done",
      shows: "exterior",
      who_in_it: "not_asked",
      removed_at: null,
      created_at: "2026-11-10T10:00:00Z",
      updated_at: "2026-11-10T10:00:00Z",
      kind: "image",
      seconds: null,
      media_status: null,
      sound_said: null,
      sound: null,
      copy_state: "here",
      copy_why: null,
    },
  ],
  appointments: [],
});

/** What Meta's place search finds, by kind, as the edge answers it; and every place asked for. */
let found;
let asked;
const real = globalThis.fetch;
beforeEach(() => {
  readerCache.clear();
  asked = [];
  found = {
    city: [
      {
        kind: "city",
        key: "2420379",
        name: "Austin",
        region: "Minnesota",
        country: "US",
        country_name: "United States",
      },
      { kind: "city", key: "2421836", name: "Austin", region: "Texas", country: "US", country_name: "United States" },
    ],
    region: [
      { kind: "region", key: "3886", name: "Texas", region: null, country: "US", country_name: "United States" },
    ],
    country: [
      { kind: "country", key: "US", name: "United States", region: null, country: "US", country_name: "United States" },
    ],
  };
  globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith("/api/admin/ads/account")) throw new Error(`nothing else is reachable: ${url}`);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.op === "place") asked.push(body.place);
    const answer =
      body.op === "place"
        ? {
            ok: true,
            outcome: "found",
            places: (found[body.place.kind] ?? []).filter(
              (one) => one.name.toLowerCase() === body.place.query.toLowerCase(),
            ),
          }
        : {
            ok: true,
            ready: true,
            on: true,
            writes: "sandbox",
            app: { client_id: "1", config_id: "2", redirect_uri: "https://app.example.com/cb" },
          };
    return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  };
});
after(() => {
  globalThis.fetch = real;
  setModelStream(null);
});

let seat = 0;
function seated(tables) {
  seat += 1;
  const tenantId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seat).padStart(12, "0")}`;
  const mine = JSON.parse(JSON.stringify(tables).replaceAll('"A"', JSON.stringify(tenantId)));
  const db = fakeDb(
    mine,
    {},
    {
      ads_page_counts: () => ({
        from: "2026-10-22",
        to: "2026-11-20",
        ads: [],
        unnamed: { people: 0, booked: 0 },
        spend: [],
      }),
      ad_draft_keep: () => ({ kept: true, draft_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", rung: 0 }),
    },
  );
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  return { rc: readerContext(ctx, { tenantId, role: "owner" }, NOW), userId: USER };
}

test("a business that goes to its customers is proposed the city its listing names, the right one, with the line that says why", async () => {
  const answer = await draftAd(seated(world()).rc, {});
  assert.equal(answer.can, true, "no street address needed for a wider place");
  assert.deepEqual(answer.draft.area, { kind: "city", key: "2421836", name: "Austin, Texas", country: "US" });
  assert.equal(answer.area_why, "goes_to_customers");
  assert.deepEqual(asked, [{ kind: "city", query: "Austin" }], "Meta is asked once, for the city first named");
  // New ad says it: "in and around Austin, Texas", not tapped (it changes by telling AI), and why.
  const vm = newAdView({
    answer,
    local: {
      total_minor: answer.draft.total_minor,
      miles: answer.draft.miles,
      end_day: answer.draft.end_day,
      answers: {},
    },
    words: { at: "writing" },
    version: 0,
    telling: false,
    told: null,
    need: null,
  });
  assert.deepEqual(
    [vm.sentence.within, vm.sentence.miles, vm.sentence.areaTaps],
    [" to people in and around ", "Austin, Texas", false],
  );
  assert.ok(vm.why.includes("You go to your customers, so it shows across the place you serve. Tell AI to change it."));
});

test("where the listing's city is not sure, the region it names is proposed; where neither is, the draft keeps its circle", async () => {
  found.city = [found.city[0]]; // Only the Austin in Minnesota: not the one "TX" names.
  const region = await draftAd(seated(world()).rc, {});
  assert.deepEqual(region.draft.area, { kind: "region", key: "3886", name: "Texas", country: "US" });
  found.city = [];
  found.region = [];
  // No wider place sure, and no street address: the address is the one thing missing, as for any business.
  const none = await draftAd(seated(world()).rc, {});
  assert.deepEqual(none, { can: false, missing: "address" });
  // With a street address, the circle of five miles around it, and no line about customers.
  const circle = await draftAd(seated(world({ profile: { address: "12 Congress Ave, Austin, TX" } })).rc, {});
  assert.deepEqual([circle.draft.area, circle.draft.miles, circle.area_why], [undefined, 5, null]);
});

test("a business people visit keeps five miles around its address, and Meta is not asked anything", async () => {
  const visited = world({
    profile: { address: "12 Congress Ave, Austin, TX" },
    listing: { facts: { service_area_only: false } },
  });
  const answer = await draftAd(seated(visited).rc, {});
  assert.deepEqual([answer.draft.area, answer.draft.miles, answer.area_why], [undefined, 5, null]);
  assert.deepEqual(asked, []);
  const unlisted = await draftAd(seated(world({ profile: { address: "12 Congress Ave" }, listing: null })).rc, {});
  assert.equal(unlisted.draft.miles, 5);
  assert.deepEqual(asked, []);
});

const VERSIONS = [
  {
    headline: "A full groom at home",
    text: "Paws on Wheels grooms your dog at your door. Message us on WhatsApp to pick a time.",
  },
  {
    headline: "Grooming that comes to you",
    text: "A full groom in our van, outside your home. Message us on WhatsApp.",
  },
  { headline: "Full groom", text: "Paws on Wheels comes to you for a full groom. Message us on WhatsApp to book." },
];
const NO_CHANGE = {
  kind: "none",
  service: "",
  miles: 0,
  place_kind: "none",
  place: "",
  within: "",
  amount: 0,
  end: "",
};
const modelSays = (change) =>
  setModelStream(async function* () {
    yield {
      type: "text",
      index: 0,
      text: JSON.stringify({ versions: [], change: { ...NO_CHANGE, ...change }, could_not: "" }),
    };
    yield { type: "stop", stopReason: "end_turn" };
  });

test("Tell AI what to change widens the area to a state or the whole country, found at Meta first; miles take it back (G8)", async () => {
  const shop = world({
    profile: { address: "12 Congress Ave, Austin, TX" },
    listing: { facts: { service_area_only: false } },
  });
  const who = seated(shop);
  const answer = await draftAd(who.rc, {});
  const held = { ...answer.draft, picture: answer.draft.picture.id, versions: VERSIONS };
  const tell = (asked, change, draft = held) => {
    modelSays(change);
    return writeAdWords(who, { job: "change", draft, asked });
  };
  const state = await tell("show it across all of Texas", {
    kind: "area",
    place_kind: "region",
    place: "Texas",
    within: "",
  });
  assert.deepEqual(
    [state.changed, state.draft.area],
    [{ kind: "area" }, { kind: "region", key: "3886", name: "Texas", country: "US" }],
  );
  assert.deepEqual(state.checks, [], "a wider place is one Meta knows: nothing stops it");
  const country = await tell("the whole country", { kind: "area", place_kind: "country", place: "United States" });
  assert.deepEqual(country.draft.area, { kind: "country", key: "US", name: "United States", country: "US" });
  // A city of two namesakes: the one the owner placed.
  const city = await tell("just Austin, Minnesota", {
    kind: "area",
    place_kind: "city",
    place: "Austin",
    within: "Minnesota",
  });
  assert.equal(city.draft.area.key, "2420379");
  // A name Meta does not know is a change not made: the draft keeps its area, nothing is refused later.
  const nowhere = await tell("show it in Atlantis", {
    kind: "area",
    place_kind: "city",
    place: "Atlantis",
    within: "",
  });
  assert.deepEqual([nowhere.changed, nowhere.draft.area], [{ kind: "none", fault: null }, undefined]);
  // Miles again: back to the circle around the address, the wider place dropped.
  const widened = { ...held, area: state.draft.area };
  const back = await tell("only ten miles around the shop", { kind: "area", miles: 10 }, widened);
  assert.deepEqual([back.changed, back.draft.area, back.draft.miles], [{ kind: "area" }, undefined, 10]);
});

test("the writer's change names a wider place by its kind, its name and where it is; code reads nothing else", () => {
  const brief = { change: { versions: [], asked: "x", services: [], today: "2026-11-20", ends: "2026-12-04" } };
  const answer = (change) => ({ versions: [], change: { ...NO_CHANGE, ...change }, could_not: "", label: "" });
  assert.deepEqual(
    C.adChangeOf(answer({ kind: "area", place_kind: "region", place: " Texas ", within: "USA" }), brief),
    {
      kind: "place",
      place: { kind: "region", name: "Texas", within: "USA" },
    },
  );
  assert.deepEqual(C.adChangeOf(answer({ kind: "area", miles: 12 }), brief), { kind: "area", miles: 12 });
  assert.equal(C.adChangeOf(answer({ kind: "area", place_kind: "city", place: "  " }), brief), null);
  // An answer from before the field was there reads as the miles.
  assert.deepEqual(
    C.AdCraftAnswerSchema.parse({
      versions: [],
      change: { kind: "area", service: "", miles: 8, amount: 0, end: "" },
      could_not: "",
    }).change.place_kind,
    "none",
  );
});
