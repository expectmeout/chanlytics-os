/**
 * The Google door, run: POST /api/admin/google over a database in memory,
 * Vault's three credential doors over a map, and a captured wire where
 * Google would be. Until 13 Sep 2026 its text was pinned by ten
 * assertions in three files (google, google-profile, review-reply) and its
 * POST had never been called.
 *
 * Two halves behind one door. The public listing: found from a few words,
 * linked by its place id, read once a day for its rating, its count and the
 * five reviews Google shows. The owner's Business Profile: connected with a
 * code from Google, its locations offered and one chosen, every review read
 * as the owner, an answer posted under a review in the business's name. The
 * Places key and the OAuth client secret live on this edge and nowhere else;
 * the dashboard's /api/v1/google verbs come here for everything that spends
 * them.
 *
 * Executed here: the knock; every op the door offers -- status, search, link,
 * unlink, refresh, connect, locations, choose, disconnect, reply, draft --
 * over what Google answers on the wire; a credential Google rejects handled
 * without a throw and left on the row for the owner to see; and what each op
 * leaves behind: the rows, the bell, the ledger, Vault, and the requests.
 *
 * ORDER OF SETUP MATTERS: lib/google.ts binds `const http = placesFetch()`
 * at module scope, which captures `fetch` as it is at that moment, so the
 * wire is installed before the door is imported.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  signEdgeToken,
  b64url,
  PLACES_SEARCH_MASK,
  PLACES_DETAILS_MASK,
  PLACES_SEARCH_LIMIT,
} from "@chanlytics/channels";
import { localDate } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

// Each test file is its own process: this is the whole environment. The key
// and the OAuth trio open both halves; no model key, so a draft says so
// rather than reaching a model; no Supabase credentials, so `setPg(null)`
// really is no database.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.GOOGLE_PLACES_API_KEY = "places-key-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_ID = "oauth-client-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "oauth-secret-for-this-file";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://dash.test/api/v1/google/callback";
process.env.GOOGLE_OAUTH_AUDIENCE = "testing";
for (const k of [
  "ANTHROPIC_API_KEY",
  "DIAG_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSAPP_PHONE_ID",
  "RESEND_API_KEY",
  "LEAD_TO",
  "LEAD_FROM",
])
  delete process.env[k];

/* --------------------------------- the wire ------------------------------- */

/** Every request the door makes, captured and answered by the case's `answer`. Installed before the import, on purpose (see the header). */
const wire = { answer: null, calls: [] };
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? init.body : null,
    };
    wire.calls.push(req);
    if (!wire.answer) throw new Error(`nothing on the wire answers ${req.method} ${req.url}`);
    const a = await wire.answer(req);
    return new Response(typeof a.body === "string" ? a.body : JSON.stringify(a.body ?? {}), {
      status: a.status ?? 200,
      headers: { "content-type": a.type ?? "application/json" },
    });
  };
  after(() => {
    globalThis.fetch = realFetch;
  });
}
/** The wire for one case: `answer` decides, and what was asked is read back. */
function wired(answer) {
  wire.calls = [];
  wire.answer = answer;
  return {
    get calls() {
      return wire.calls;
    },
    /** Method and URL without the query, in order. */
    asked: () => wire.calls.map((c) => [c.method, c.url.split("?")[0]]),
  };
}
/** A wire nothing may reach. The door answers a thrown fetch as a 502 in the throw's words, so a case that expects a 200 fails in the open. */
const silent = (why = "this case must not reach Google") =>
  wired((req) => {
    throw new Error(`${why}: ${req.method} ${req.url}`);
  });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/google.ts"));
after(() => setPg(null));

const AUD = "/api/admin/google";
/** Harbor Moving: the workspace every token below is about. */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** Another workspace, which a token about A must never act on. */
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** A workspace that does not exist; also a review row that does not. */
const GHOST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
/** The owner who pressed the button. */
const U = "11111111-1111-4111-8111-111111111111";
/** Review rows. */
const R1 = "22222222-2222-4222-8222-222222222222";
const R2 = "33333333-3333-4333-8333-333333333333";
const R3 = "44444444-4444-4444-8444-444444444444";
const KEY = "diag-key-for-this-file";
const TZ = "America/New_York";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const PLACE = "ChIJN1t_tDeuEmsRUsoyG83frY4";
const PLACE2 = "ChIJrTLr-GyuEmsRBfy61i59si0";
const SCOPE = "openid email https://www.googleapis.com/auth/business.manage";

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : A,
    user: U,
  });
const knock = (body, headers = { "x-edge-token": token() }) =>
  door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
/** The edge before it has the secret: the key decides, and a key holder is about no workspace. */
const keyed = (fn) => withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: KEY }, fn);

/* -------------------------------- the world ------------------------------- */

const tenantRow = (id, over = {}) => ({
  id,
  name: "Harbor Moving",
  slug: "harbor-moving",
  timezone: TZ,
  status: "active",
  ...over,
});
/** The public listing as the database holds it: linked a month ago, read yesterday. */
const listingRow = (over = {}) => ({
  tenant_id: A,
  place_id: PLACE,
  name: "Harbor Moving",
  address: "1 Main St, Brooklyn, NY 11201",
  maps_uri: "https://maps.google.com/?cid=1",
  business_status: "OPERATIONAL",
  rating: 4.5,
  review_count: 10,
  linked_by: U,
  linked_at: ago(30 * DAY),
  checked_at: ago(22 * HOUR),
  check_error: null,
  ...over,
});
/** The owner's profile as the database holds it: connected yesterday, the location chosen, synced yesterday. */
const connRow = (over = {}) => ({
  tenant_id: A,
  google_email: "owner@example.com",
  google_sub: "sub-1",
  account_name: "accounts/111",
  account_title: "Harbor",
  location_name: "locations/222",
  location_title: "Harbor Moving",
  scopes: SCOPE.split(" "),
  connected_by: U,
  connected_at: ago(DAY),
  last_synced_at: ago(22 * HOUR),
  sync_error: null,
  ...over,
});
/** A review on record, from the profile, unanswered. */
const reviewRow = (id, over = {}) => ({
  id,
  tenant_id: A,
  review_id: "g-1",
  origin: "profile",
  rating: 5,
  author: "Rosa",
  author_uri: null,
  author_photo_uri: null,
  body: "Careful movers.",
  language_code: null,
  published_at: ago(3 * DAY),
  reply_text: null,
  replied_at: null,
  maps_uri: null,
  first_seen_at: ago(2 * DAY),
  last_seen_at: ago(HOUR),
  ...over,
});
/** A live token in Vault, good for an hour. */
const liveCreds = () => ({
  refresh_token: "rt-1",
  access_token: "at-good",
  expires_at: Date.now() + HOUR,
  scope: SCOPE,
});

function world(over = {}) {
  return {
    tenants: [tenantRow(A), tenantRow(B, { name: "Billing probe", slug: "billing-probe" })],
    google_listings: [],
    google_connections: [],
    google_reviews: [],
    google_listing_days: [],
    notifications: [],
    events: [],
    policies: [],
    tenant_config: [],
    ...over,
  };
}
/**
 * The database the door will find, with Vault beside it: the three credential
 * doors over a map, so what `connect` stores is what a sync reads back.
 */
function use(tables, creds = new Map(), faults = {}) {
  const vault = { reads: [], writes: [], drops: [] };
  const db = fakeDb(tables, faults, {
    get_google_credentials: ({ p_tenant_id }) => {
      vault.reads.push(p_tenant_id);
      return creds.get(p_tenant_id) ?? null;
    },
    put_google_credentials: ({ p_tenant_id, p_secret }) => {
      vault.writes.push({ tenant: p_tenant_id, secret: p_secret });
      creds.set(p_tenant_id, p_secret);
      return null;
    },
    drop_google_credentials: ({ p_tenant_id }) => {
      vault.drops.push(p_tenant_id);
      creds.delete(p_tenant_id);
      return null;
    },
  });
  setPg(db);
  return { db, vault, creds };
}
const writes = (db, table) =>
  db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));

/* ---------------------------------- Google -------------------------------- */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const LOCATIONS_URL = (account) => `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations`;
const REVIEWS_URL = (account, loc) => `https://mybusiness.googleapis.com/v4/${account}/locations/${loc}/reviews`;
const REPLY_URL = (account, loc, id) =>
  `https://mybusiness.googleapis.com/v4/${account}/locations/${loc}/reviews/${id}/reply`;
const PLACES_SEARCH = "https://places.googleapis.com/v1/places:searchText";
const PLACE_URL = (id) => `https://places.googleapis.com/v1/places/${id}`;
const form = (req) => new URLSearchParams(req.body);
const refusal = (status, message, code) => ({ status, body: { error: { code: status, message, status: code } } });
/** An id token as Google mints one: the claims in the middle, read but never trusted for access. */
const idToken = (email, sub) =>
  `eyJhbGciOiJSUzI1NiJ9.${b64url(JSON.stringify({ iss: "https://accounts.google.com", sub, email, email_verified: true }))}.sig`;

/** A place as Places (New) answers it. */
const place = (id, over = {}) => ({
  id,
  displayName: { text: "Harbor Moving", languageCode: "en" },
  formattedAddress: "1 Main St, Brooklyn, NY 11201",
  googleMapsUri: "https://maps.google.com/?cid=1",
  businessStatus: "OPERATIONAL",
  rating: 4.6,
  userRatingCount: 11,
  reviews: [],
  // What the listing says beyond its name (F7): a mover's week, its numbers and site, and the area it serves.
  regularOpeningHours: {
    periods: [1, 2, 3, 4, 5, 6].map((day) => ({
      open: { day, hour: 7, minute: 0 },
      close: { day, hour: 19, minute: 0 },
    })),
  },
  internationalPhoneNumber: "+1 718-555-0142",
  nationalPhoneNumber: "(718) 555-0142",
  websiteUri: "https://harbormoving.example",
  primaryType: "moving_company",
  primaryTypeDisplayName: { text: "Moving company", languageCode: "en" },
  pureServiceAreaBusiness: true,
  timeZone: { id: "America/New_York" },
  ...over,
});
/** A review as Places shows it: Rosa, two hours ago. */
const publicReview = (id, over = {}) => ({
  name: `places/${PLACE}/reviews/${id}`,
  rating: 5,
  text: { text: "Careful movers, on time.", languageCode: "en" },
  authorAttribution: { displayName: "Rosa", uri: "https://maps.google.com/rosa" },
  publishTime: ago(2 * HOUR),
  googleMapsUri: "https://maps.google.com/?r=1",
  ...over,
});
/** Locations as Business Information answers them: on Maps, on Maps elsewhere, and not on Maps yet. */
const LOC = {
  name: "locations/222",
  title: "Harbor Moving",
  storefrontAddress: {
    regionCode: "US",
    locality: "Brooklyn",
    administrativeArea: "NY",
    postalCode: "11201",
    addressLines: ["1 Main St"],
  },
  metadata: {
    placeId: PLACE,
    mapsUri: "https://maps.google.com/?cid=1",
    newReviewUri: "https://search.google.com/local/writereview?placeid=x",
  },
};
const LOC2 = {
  name: "locations/333",
  title: "Harbor Moving Warehouse",
  metadata: { placeId: PLACE2, mapsUri: "https://maps.google.com/?cid=2" },
};
const OFF_MAPS = { name: "locations/444", title: "Not on Maps yet", metadata: {} };
/** Reviews as the v4 API answers them: Rosa three days ago, and an anonymous four-star the owner answered long ago. */
const GBP_REVIEW = {
  name: "accounts/111/locations/222/reviews/g-1",
  reviewId: "g-1",
  starRating: "FIVE",
  reviewer: { displayName: "Rosa", profilePhotoUrl: null },
  comment: "Careful movers.",
  createTime: ago(3 * DAY),
  updateTime: ago(3 * DAY),
};
const GBP_OLD = {
  name: "accounts/111/locations/222/reviews/g-2",
  reviewId: "g-2",
  starRating: "FOUR",
  reviewer: { isAnonymous: true },
  comment: "Fine.",
  createTime: ago(40 * DAY),
  updateTime: ago(39 * DAY),
  reviewReply: { comment: "Thank you!", updateTime: ago(39 * DAY) },
};
const GRANT = {
  access_token: "at-fresh",
  refresh_token: "rt-1",
  expires_in: 3600,
  scope: SCOPE,
  token_type: "Bearer",
  id_token: idToken("owner@example.com", "sub-1"),
};

/** Google as a connected owner sees it: a code traded, a refresh honoured, a grant revoked, one account, the locations given, the reviews given, a reply accepted, a place read. */
function google({ locations = [LOC], reviews = [GBP_REVIEW], grant = {}, page = {} } = {}) {
  return wired((req) => {
    const u = req.url.split("?")[0];
    if (u === TOKEN_URL) {
      const f = form(req);
      if (f.get("grant_type") === "authorization_code") return { status: 200, body: { ...GRANT, ...grant } };
      if (f.get("grant_type") === "refresh_token")
        return {
          status: 200,
          body: { access_token: "at-refreshed", expires_in: 3600, scope: SCOPE, token_type: "Bearer" },
        };
    }
    if (u === REVOKE_URL) return { status: 200, body: {} };
    if (u === ACCOUNTS_URL)
      return { status: 200, body: { accounts: [{ name: "accounts/111", accountName: "Harbor", type: "PERSONAL" }] } };
    if (u === LOCATIONS_URL("accounts/111")) return { status: 200, body: { locations } };
    if (/^https:\/\/mybusiness\.googleapis\.com\/v4\/accounts\/111\/locations\/\d+\/reviews$/.test(u))
      return { status: 200, body: { reviews, averageRating: 4.7, totalReviewCount: 12, ...page } };
    if (req.method === "PUT" && u.endsWith("/reply"))
      return { status: 200, body: { comment: JSON.parse(req.body).comment, updateTime: "2026-09-13T15:00:00Z" } };
    if (u.startsWith("https://places.googleapis.com/v1/places/"))
      return {
        status: 200,
        body: place(decodeURIComponent(u.slice("https://places.googleapis.com/v1/places/".length))),
      };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
}

/* --------------------------------- the door ------------------------------- */

test("the door: a token for another door, a forgery and no credential are 403 -- no falling back from a bad token to a key; a body naming another workspace than the token is refused; without the secret the key decides; nothing is read and Google is not asked", async () => {
  const { db } = use(world());
  const net = silent();
  assert.deepEqual(
    await answer(await knock({ op: "status" }, { "x-edge-token": token({ aud: "/api/admin/lines" }) })),
    [403, { ok: false, error: "token_audience" }],
    "a token for another door opens nothing here",
  );
  assert.deepEqual(
    await answer(await knock({ op: "status" }, { "x-edge-token": token({ secret: "not-the-secret" }) })),
    [403, { ok: false, error: "token_signature" }],
  );
  assert.deepEqual(await answer(await knock({ op: "status" }, {})), [403, { ok: false }]);
  assert.deepEqual(
    await answer(await knock({ op: "status" }, { "x-edge-token": "garbage", "x-diag-key": KEY })),
    [403, { ok: false, error: "token_malformed" }],
    "the right key beside a bad token: the token decides, and it says no",
  );
  assert.deepEqual(
    await answer(await knock({ op: "refresh", tenant_id: B })),
    [403, { ok: false, error: "workspace_mismatch" }],
    "a token about A may not read B's listing",
  );
  const minted = token();
  await keyed(async () => {
    assert.deepEqual(await answer(await knock({ op: "status" }, { "x-diag-key": "not-the-key" })), [
      403,
      { ok: false },
    ]);
    assert.deepEqual(
      await answer(await knock({ op: "status" }, { "x-edge-token": minted })),
      [403, { ok: false }],
      "a token ahead of the secret opens nothing on its own",
    );
    assert.equal(
      (await knock({ op: "status" }, { "x-diag-key": KEY })).status,
      200,
      "the key opens the door while the edge has no secret",
    );
    assert.equal(
      (await knock({ op: "status" }, { "x-edge-token": minted, "x-diag-key": KEY })).status,
      200,
      "and a token ahead of the secret is not held against the caller",
    );
  });
  assert.equal(db.seen.length, 0, "nothing was read for any of it");
  assert.equal(net.calls.length, 0, "Google heard none of it");
});

test("status: what this deployment can do -- listings looked up, profiles connected, the audience the OAuth app has with Google -- and the public half of the client, never the secret; without one of the trio there is no profile door", async () => {
  const { db } = use(world());
  const net = silent();
  assert.deepEqual(await answer(await knock({ op: "status" })), [
    200,
    {
      ok: true,
      ready: { places: true, profile: true, audience: "testing" },
      profile: { client_id: "oauth-client-for-this-file", redirect_uri: "https://dash.test/api/v1/google/callback" },
    },
  ]);
  await withEnv({ GOOGLE_OAUTH_CLIENT_SECRET: undefined, GOOGLE_OAUTH_AUDIENCE: "whatever" }, async () => {
    assert.deepEqual(
      await answer(await knock({ op: "status" })),
      [200, { ok: true, ready: { places: true, profile: false, audience: null }, profile: null }],
      "the secret is one of the three; an audience nobody recognises says nothing rather than something wrong",
    );
  });
  await withEnv({ GOOGLE_PLACES_API_KEY: undefined, GOOGLE_OAUTH_AUDIENCE: undefined }, async () => {
    assert.deepEqual(
      (await (await knock({ op: "status" })).json()).ready,
      { places: false, profile: true, audience: null },
      "the listing arrives with the connection when only the profile door is open",
    );
  });
  assert.ok(
    !JSON.stringify(await (await knock({ op: "status" })).json()).includes("oauth-secret-for-this-file"),
    "the secret never leaves the edge",
  );
  assert.equal(db.seen.length, 0, "status reads no database and needs no workspace");
  assert.equal(net.calls.length, 0);
});

/* ---------------------------------- search -------------------------------- */

test("search: a few words become Google's Text Search -- the key in a header, the Pro fields alone in the mask, never the rating -- and what Google finds comes back as candidates; too few words, no key and a refusal are each named, and nothing is read", async () => {
  const { db } = use(world());
  const net = wired((req) => {
    if (req.url === PLACES_SEARCH)
      return {
        status: 200,
        body: {
          places: [
            place(PLACE),
            {
              id: PLACE2,
              displayName: { text: "Harbor Moving Warehouse" },
              formattedAddress: "9 Dock Rd, Brooklyn, NY 11231",
              businessStatus: "OPERATIONAL",
            },
            { id: "no-name-no-candidate" },
          ],
        },
      };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const [status, body] = await answer(await knock({ op: "search", query: "  Harbor   Moving,\n Brooklyn  " }));
  assert.deepEqual(
    [status, body],
    [
      200,
      {
        ok: true,
        query: "Harbor Moving, Brooklyn",
        candidates: [
          {
            place_id: PLACE,
            name: "Harbor Moving",
            address: "1 Main St, Brooklyn, NY 11201",
            maps_uri: "https://maps.google.com/?cid=1",
            business_status: "OPERATIONAL",
            category: "Moving company",
          },
          {
            place_id: PLACE2,
            name: "Harbor Moving Warehouse",
            address: "9 Dock Rd, Brooklyn, NY 11231",
            maps_uri: null,
            business_status: "OPERATIONAL",
            category: null,
          },
        ],
      },
    ],
    "the query as sent with its whitespace folded; a place without a name is not a candidate",
  );
  assert.equal(net.calls.length, 1);
  const [req] = net.calls;
  assert.equal(req.method, "POST");
  assert.equal(req.headers["X-Goog-Api-Key"], "places-key-for-this-file", "the key in a header, from this edge alone");
  assert.equal(req.headers["X-Goog-FieldMask"], PLACES_SEARCH_MASK);
  assert.ok(
    !req.headers["X-Goog-FieldMask"].includes("rating"),
    "the search stays on the Pro SKU: the rating is read from the listing once a day, not on every search",
  );
  assert.ok(
    req.headers["X-Goog-FieldMask"].includes("places.primaryTypeDisplayName"),
    "the kind of place, which tells two listings of one name apart, is a Pro field like the name",
  );
  assert.deepEqual(JSON.parse(req.body), {
    textQuery: "Harbor Moving, Brooklyn",
    pageSize: PLACES_SEARCH_LIMIT,
    languageCode: "en",
  });
  assert.equal(db.seen.length, 0, "a search is a question to Google, not to the database -- and needs no workspace");

  const few = [400, { ok: false, error: "query must be a few words: the business name and where it is" }];
  assert.deepEqual(await answer(await knock({ op: "search", query: "Ha" })), few);
  assert.deepEqual(await answer(await knock({ op: "search", query: "      " })), few);
  assert.deepEqual(await answer(await knock({ op: "search" })), few);
  assert.equal((await knock({ op: "search", query: "x".repeat(250) })).status, 200);
  assert.equal(JSON.parse(net.calls.at(-1).body).textQuery.length, 200, "two hundred characters at most reach Google");
  await withEnv({ GOOGLE_PLACES_API_KEY: undefined }, async () => {
    const [s, b] = await answer(await knock({ op: "search", query: "Harbor Moving" }));
    assert.equal(s, 503);
    assert.equal(b.error, "no_places_key");
    assert.match(b.hint, /GOOGLE_PLACES_API_KEY on the edge/, "the hint names the variable and where it goes");
  });
  const refused = wired(() =>
    refusal(403, "Places API (New) has not been used in project 1 before", "PERMISSION_DENIED"),
  );
  assert.deepEqual(
    await answer(await knock({ op: "search", query: "Harbor Moving" })),
    [502, { ok: false, error: "PERMISSION_DENIED: Places API (New) has not been used in project 1 before" }],
    "Google's refusal in Google's words, never a throw",
  );
  assert.equal(refused.calls.length, 1);
  assert.equal(db.seen.length, 0);
});

/* ------------------------------ the workspace ----------------------------- */

test("past status and search every op needs a database and a workspace on record: no database is a 503, no id or a bad one a 400, an unknown workspace a 404, a workspace that cannot be read a 503 in the database's words; an unknown op is named back with the eleven", async () => {
  setPg(null);
  const net = silent();
  assert.deepEqual(await answer(await knock({ op: "refresh" })), [503, { ok: false, error: "no_database" }]);
  const { db } = use(world());
  await keyed(async () => {
    assert.deepEqual(
      await answer(await knock({ op: "refresh" }, { "x-diag-key": KEY })),
      [400, { ok: false, error: "tenant_id (a workspace id) is required" }],
      "a key holder is about no workspace: the body must name one",
    );
    assert.deepEqual(
      await answer(await knock({ op: "refresh", tenant_id: "harbor-moving" }, { "x-diag-key": KEY })),
      [400, { ok: false, error: "tenant_id (a workspace id) is required" }],
      "and name it by id",
    );
  });
  assert.equal(db.seen.length, 0, "refused before the workspace is read");
  assert.deepEqual(await answer(await knock({ op: "refresh" }, { "x-edge-token": token({ workspace: GHOST }) })), [
    404,
    { ok: false, error: "no such workspace" },
  ]);
  const list =
    "op must be status, search, link, unlink, refresh, connect, locations, choose, disconnect, reply or draft";
  assert.deepEqual(await answer(await knock({ op: "dance" })), [400, { ok: false, error: list }]);
  assert.deepEqual(await answer(await knock({})), [400, { ok: false, error: list }]);
  assert.deepEqual(await answer(await knock("not json")), [400, { ok: false, error: list }]);
  use(world(), new Map(), { "tenants.select": { message: "permission denied for table tenants" } });
  assert.deepEqual(await answer(await knock({ op: "refresh" })), [
    503,
    { ok: false, error: "permission denied for table tenants" },
  ]);
  assert.equal(net.calls.length, 0, "Google heard none of it");
});

/* ----------------------------------- link --------------------------------- */

test("link: the place is read BEFORE any row is written -- a wrong id is a 502 and leaves the listing on record alone -- then the listing is kept for the workspace, the old place's reviews and days forgotten, the new one read at once as history, and the ledger says who linked what", async () => {
  const tables = world({
    google_listings: [listingRow({ place_id: PLACE2, name: "Harbor Moving Warehouse" })],
    google_reviews: [reviewRow(R1, { origin: "places", review_id: "p-old", body: "about the warehouse" })],
    google_listing_days: [{ tenant_id: A, day: "2026-09-01", rating: 4.5, review_count: 10 }],
  });
  const { db } = use(tables);
  const net = wired((req) => {
    const u = req.url.split("?")[0];
    if (u === PLACE_URL("ChIJ-does-not-exist-00")) return refusal(404, "Not found", "NOT_FOUND");
    if (u === PLACE_URL(PLACE)) return { status: 200, body: place(PLACE, { reviews: [publicReview("r-rosa")] }) };
    // The listing's website, which says where its customers book.
    if (u === "https://harbormoving.example/")
      return {
        type: "text/html; charset=utf-8",
        body: `<nav><a href="https://calendly.com/harbor-moving-example/estimate">Book an estimate</a></nav>`,
      };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const today = localDate(TZ, new Date());
  const t0 = Date.now();

  assert.deepEqual(await answer(await knock({ op: "link", place_id: "short" })), [
    400,
    { ok: false, error: "place_id is required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "link" })), [400, { ok: false, error: "place_id is required" }]);
  assert.deepEqual(
    await answer(await knock({ op: "link", place_id: "ChIJ-does-not-exist-00" })),
    [502, { ok: false, error: "unreadable", detail: "NOT_FOUND: Not found" }],
    "a wrong id is refused here, not kept as a row that never reads",
  );
  assert.equal(tables.google_listings[0].place_id, PLACE2, "the listing on record is untouched");
  assert.equal(
    writes(db, "google_listings").length +
      writes(db, "google_reviews").length +
      writes(db, "google_listing_days").length,
    0,
    "nothing written for a place Google does not have",
  );
  await withEnv({ GOOGLE_PLACES_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock({ op: "link", place_id: PLACE })), [
      503,
      { ok: false, error: "no_places_key" },
    ]);
  });
  assert.equal(net.calls.length, 1, "one read, the one that proved the id wrong");

  const [status, body] = await answer(await knock({ op: "link", place_id: PLACE, user_id: U }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    body.read,
    { ok: true, fresh: 0, counted: 0 },
    "the first read after linking is history: nothing announced",
  );
  assert.deepEqual(
    body.listing,
    {
      place_id: PLACE,
      name: "Harbor Moving",
      address: "1 Main St, Brooklyn, NY 11201",
      maps_uri: "https://maps.google.com/?cid=1",
      business_status: "OPERATIONAL",
      rating: 4.6,
      review_count: 11,
      linked_at: body.listing.linked_at,
      checked_at: body.listing.checked_at,
      check_error: null,
    },
    "what the dashboard sees: the listing, read at once, and nothing that is not the contract's",
  );
  assert.ok(
    Date.parse(body.listing.linked_at) >= t0 && Date.parse(body.listing.checked_at) >= t0,
    "linked now, read now",
  );
  assert.deepEqual(
    net.asked().slice(1),
    [
      ["GET", PLACE_URL(PLACE)],
      ["GET", PLACE_URL(PLACE)],
      ["GET", "https://harbormoving.example/"],
    ],
    "read once to prove the id, once more to read the listing, and its website once for where its customers book",
  );
  const [site, ...google] = [net.calls.at(-1), ...net.calls.slice(0, -1)];
  assert.ok(
    google.every(
      (c) =>
        c.headers["X-Goog-Api-Key"] === "places-key-for-this-file" &&
        c.headers["X-Goog-FieldMask"] === PLACES_DETAILS_MASK,
    ),
    "the key in a header; the details mask, reviews included",
  );
  assert.equal(site.headers["X-Goog-Api-Key"], undefined, "the key never goes to the business's own site");
  assert.equal(
    tables.google_listings.length,
    1,
    "one listing per workspace: an upsert on the workspace, never a second row",
  );
  const row = tables.google_listings[0];
  assert.deepEqual(
    [row.tenant_id, row.place_id, row.name, row.linked_by, row.rating, row.review_count, row.check_error],
    [A, PLACE, "Harbor Moving", U, 4.6, 11, null],
  );
  assert.deepEqual(
    row.facts,
    {
      hours: [1, 2, 3, 4, 5, 6].map((day) => ({
        open: { day, hour: 7, minute: 0 },
        close: { day, hour: 19, minute: 0 },
      })),
      phone_e164: "+17185550142",
      phone_display: "(718) 555-0142",
      website: "https://harbormoving.example",
      primary_type: "moving_company",
      primary_type_label: "Moving company",
      service_area_only: true,
      time_zone: "America/New_York",
      booking_page: "https://calendly.com/harbor-moving-example/estimate",
    },
    "F7: what the listing says beyond its name is kept on the row, read at once, for the first run to offer",
  );
  assert.deepEqual(
    tables.google_reviews.map((r) => [r.tenant_id, r.review_id, r.origin, r.author, r.body]),
    [[A, "r-rosa", "places", "Rosa", "Careful movers, on time."]],
    "the old place's reviews are gone -- they were another place's -- and the new one's are on record",
  );
  assert.deepEqual(
    tables.google_listing_days.map((d) => [d.tenant_id, d.day, d.rating, d.review_count]),
    [[A, today, 4.6, 11]],
    "the old place's days are gone; today's row is the new place's, by the workspace's own clock",
  );
  assert.deepEqual(tables.notifications, [], "history: no bell");
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.data]),
    [[A, "google.linked", "google", "listing", { place_id: PLACE, name: "Harbor Moving", by: U, read: true }]],
  );
});

test("F7: a relink keeps what the read that proved the new place said, even when the read after it fails -- never the old place's hours and number", async () => {
  const tables = world({
    google_listings: [
      listingRow({
        place_id: PLACE2,
        name: "Harbor Moving Warehouse",
        facts: {
          hours: null,
          phone_e164: "+13055550199",
          phone_display: "(305) 555-0199",
          website: "https://warehouse.example",
          primary_type: "storage",
          primary_type_label: "Storage",
          service_area_only: false,
          time_zone: "America/New_York",
        },
      }),
    ],
  });
  use(tables);
  let reads = 0;
  wired((req) => {
    if (req.url.split("?")[0] !== PLACE_URL(PLACE)) throw new Error(`unexpected ${req.method} ${req.url}`);
    reads += 1;
    return reads === 1 ? { status: 200, body: place(PLACE) } : refusal(503, "Backend unavailable", "UNAVAILABLE");
  });
  const [status, body] = await answer(await knock({ op: "link", place_id: PLACE, user_id: U }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.read.ok, false, "the read after linking failed");
  const row = tables.google_listings[0];
  assert.equal(row.place_id, PLACE);
  assert.deepEqual(
    [row.facts.phone_e164, row.facts.website, row.facts.primary_type, row.facts.hours.length],
    ["+17185550142", "https://harbormoving.example", "moving_company", 6],
    "the new place's own facts, from the read that proved its id",
  );
});

/* ---------------------------- refresh: the listing ------------------------ */

test("refresh on the public listing: the rating, the count and the day are written and a review written since the last read rings the bell and is on the ledger; Google's refusal stays on the row without moving the stamp; no listing is a 404; no key a 503", async () => {
  const tables = world({
    // What the first read found on the website, which a later read keeps without reading the site again.
    google_listings: [
      listingRow({
        facts: {
          website: "https://harbormoving.example",
          booking_page: "https://calendly.com/harbor-moving-example/estimate",
        },
      }),
    ],
    google_reviews: [
      reviewRow(R1, {
        origin: "places",
        review_id: "r-old",
        author: "Ana",
        body: "Fine.",
        published_at: ago(300 * DAY),
      }),
    ],
  });
  use(tables);
  const before = { ...tables.google_listings[0] };
  let refuse = true;
  const net = wired((req) => {
    if (req.url.split("?")[0] !== PLACE_URL(PLACE)) throw new Error(`unexpected ${req.method} ${req.url}`);
    if (refuse) return refusal(403, "The caller does not have permission", "PERMISSION_DENIED");
    return {
      status: 200,
      body: place(PLACE, {
        reviews: [
          publicReview("r-rosa"),
          publicReview("r-old", {
            rating: 4,
            text: { text: "Fine.", languageCode: "en" },
            authorAttribution: { displayName: "Ana" },
            publishTime: ago(300 * DAY),
          }),
        ],
      }),
    };
  });
  const today = localDate(TZ, new Date());
  const t0 = Date.now();

  const [s1, b1] = await answer(await knock({ op: "refresh" }));
  assert.equal(s1, 502);
  assert.deepEqual(
    [b1.ok, b1.read, b1.connection],
    [false, { ok: false, error: "PERMISSION_DENIED: The caller does not have permission" }, null],
  );
  assert.equal(
    b1.listing.check_error,
    "PERMISSION_DENIED: The caller does not have permission",
    "the dashboard sees Google's words on the listing",
  );
  const row = tables.google_listings[0];
  assert.deepEqual(
    [row.rating, row.review_count, row.checked_at],
    [before.rating, before.review_count, before.checked_at],
    "the last good numbers stay, and the stamp does not move: it is the news cutoff, the first-read flag and the due window at once",
  );
  assert.deepEqual([tables.notifications, tables.events], [[], []], "nothing rang, nothing on the ledger");

  refuse = false;
  const [s2, b2] = await answer(await knock({ op: "refresh" }));
  assert.equal(s2, 200, JSON.stringify(b2));
  assert.deepEqual(b2.read, { ok: true, fresh: 1, counted: 1 });
  assert.deepEqual(
    [b2.listing.rating, b2.listing.review_count, b2.listing.check_error, b2.connection],
    [4.6, 11, null, null],
    "a read that succeeds clears the words",
  );
  assert.ok(Date.parse(b2.listing.checked_at) >= t0, "the stamp is the successful read");
  assert.equal(
    tables.google_listings[0].facts.booking_page,
    "https://calendly.com/harbor-moving-example/estimate",
    "the booking page the first read found, kept while the website is the same; no site is read again",
  );
  assert.deepEqual(
    tables.google_reviews.map((r) => [r.review_id, r.origin, r.author]).sort(),
    [
      ["r-old", "places", "Ana"],
      ["r-rosa", "places", "Rosa"],
    ],
    "every review Google shows is on record",
  );
  assert.equal(
    tables.google_reviews.find((r) => r.review_id === "r-old").id,
    R1,
    "the one already there keeps its row, and so its first_seen_at",
  );
  assert.deepEqual(
    tables.google_listing_days.map((d) => [d.tenant_id, d.day, d.rating, d.review_count]),
    [[A, today, 4.6, 11]],
  );
  assert.equal(
    tables.notifications.length,
    1,
    "the one written since the last read is news; the old one shown by relevance is not",
  );
  const bell = tables.notifications[0];
  assert.deepEqual(
    [bell.tenant_id, bell.kind, bell.route, bell.subject_type, bell.subject_id],
    [A, "review", "reports", "review", "r-rosa"],
  );
  assert.equal(bell.title, "New on Google: ★★★★★ from Rosa");
  assert.equal(bell.body, "“Careful movers, on time.”\n4.6 ★ overall · 11 reviews.");
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.data]),
    [[A, "google.reviews", "google", { source: "places", fresh: 1, counted: 1, rating: 4.6, review_count: 11 }]],
  );
  assert.equal(net.calls.length, 2);

  use(world());
  assert.deepEqual(await answer(await knock({ op: "refresh" })), [404, { ok: false, error: "no_listing" }]);
  use(world({ google_listings: [listingRow()] }));
  await withEnv({ GOOGLE_PLACES_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock({ op: "refresh" })), [503, { ok: false, error: "no_places_key" }]);
  });
  assert.equal(net.calls.length, 2, "nothing for the refusals");
});

/* ---------------------------------- connect ------------------------------- */

test("connect: the code from Google becomes the connection -- the token traded with the secret from this edge, the scope and the refresh token checked, the accounts and locations read as the owner, the credentials kept in Vault, the ledger told -- and with one location on Maps the listing is bound and the profile synced at once, the public five making way", async () => {
  const tables = world({
    // What the public listing's last read said beyond its name (F7): the profile names the same place, so it stays.
    google_listings: [listingRow({ facts: { phone_e164: "+17185550142", website: "https://harbormoving.example" } })],
    google_reviews: [reviewRow(R1, { origin: "places", review_id: "p-1", body: "the public copy" })],
  });
  const { vault } = use(tables);
  const net = google({ locations: [LOC, OFF_MAPS], reviews: [GBP_REVIEW, GBP_OLD] });
  const today = localDate(TZ, new Date());
  const t0 = Date.now();

  assert.deepEqual(await answer(await knock({ op: "connect" })), [400, { ok: false, error: "code is required" }]);
  assert.deepEqual(await answer(await knock({ op: "connect", code: "x".repeat(2001) })), [
    400,
    { ok: false, error: "code is required" },
  ]);
  assert.equal(net.calls.length, 0);

  const [status, body] = await answer(await knock({ op: "connect", code: "4/the-code", user_id: U }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.pending, false, "one location on Maps: bound at once, nobody asked to choose");
  assert.deepEqual(
    body.connection,
    {
      google_email: "owner@example.com",
      account_title: "Harbor",
      location_name: "locations/222",
      location_title: "Harbor Moving",
      connected_at: body.connection.connected_at,
      last_synced_at: body.connection.last_synced_at,
      sync_error: null,
    },
    "what the dashboard sees: never the token, never the credentials name, never the sub",
  );
  assert.ok(
    Date.parse(body.connection.connected_at) >= t0 && Date.parse(body.connection.last_synced_at) >= t0,
    "connected now, synced now",
  );
  assert.deepEqual(
    body.read,
    { ok: true, fresh: 0, counted: 0, answered: 0 },
    "the first sync is history: nothing announced, nothing answered",
  );
  assert.deepEqual(
    [body.listing.place_id, body.listing.name, body.listing.rating, body.listing.review_count],
    [PLACE, "Harbor Moving", 4.7, 12],
    "the listing carries the profile's numbers now",
  );

  assert.deepEqual(
    net.asked(),
    [
      ["POST", TOKEN_URL],
      ["GET", ACCOUNTS_URL],
      ["GET", LOCATIONS_URL("accounts/111")],
      ["GET", REVIEWS_URL("accounts/111", "222")],
    ],
    "the code traded, then whose accounts, which locations, and every review of the one location -- no refresh: the token just granted is still good",
  );
  const exchange = form(net.calls[0]);
  assert.deepEqual(
    [
      exchange.get("grant_type"),
      exchange.get("code"),
      exchange.get("client_id"),
      exchange.get("client_secret"),
      exchange.get("redirect_uri"),
    ],
    [
      "authorization_code",
      "4/the-code",
      "oauth-client-for-this-file",
      "oauth-secret-for-this-file",
      "https://dash.test/api/v1/google/callback",
    ],
    "the secret alone on the edge",
  );
  assert.ok(
    net.calls.slice(1).every((c) => c.headers.Authorization === "Bearer at-fresh"),
    "read as the owner",
  );
  assert.equal(net.calls[3].headers["X-GOOG-API-FORMAT-VERSION"], "2", "v4 answers with its detailed errors");
  assert.ok(
    net.calls[2].url.includes("readMask=name%2Ctitle%2CstorefrontAddress%2Cmetadata"),
    "the locations asked for by name, title, address and the metadata that names their place on Maps",
  );

  assert.deepEqual(
    vault.writes.map((w) => [w.tenant, w.secret.refresh_token, w.secret.access_token, w.secret.scope]),
    [[A, "rt-1", "at-fresh", SCOPE]],
    "the grant kept through the vault door, for the sweep and the next sync",
  );
  assert.ok(
    vault.writes[0].secret.expires_at >= t0 + HOUR && vault.writes[0].secret.expires_at <= Date.now() + HOUR,
    "good for an hour, as Google said",
  );
  assert.deepEqual(vault.reads, [A], "the sync read it back once and found it still good");

  assert.equal(tables.google_connections.length, 1);
  const conn = tables.google_connections[0];
  assert.deepEqual(
    [
      conn.tenant_id,
      conn.google_email,
      conn.google_sub,
      conn.account_name,
      conn.account_title,
      conn.location_name,
      conn.location_title,
      conn.connected_by,
      conn.sync_error,
      conn.scopes,
    ],
    [
      A,
      "owner@example.com",
      "sub-1",
      "accounts/111",
      "Harbor",
      "locations/222",
      "Harbor Moving",
      U,
      null,
      SCOPE.split(" "),
    ],
  );
  assert.ok(!("access_token" in conn) && !("refresh_token" in conn), "no token on the row members can read");
  const listing = tables.google_listings[0];
  assert.deepEqual(
    [listing.place_id, listing.name, listing.address, listing.rating, listing.review_count, listing.linked_by],
    [PLACE, "Harbor Moving", "1 Main St, Brooklyn, NY 11201", 4.7, 12, U],
    "the same place the public listing named, so the row is kept and takes the profile's numbers",
  );
  assert.deepEqual(
    listing.facts,
    { phone_e164: "+17185550142", website: "https://harbormoving.example" },
    "and keeps what its last read said",
  );
  assert.deepEqual(
    tables.google_reviews.map((r) => [r.review_id, r.origin, r.rating, r.author, r.body, r.reply_text]).sort(),
    [
      ["g-1", "profile", 5, "Rosa", "Careful movers.", null],
      ["g-2", "profile", 4, null, "Fine.", "Thank you!"],
    ],
    "the public copy is gone -- its id was the public listing's -- and every review of the profile is on record, replies and anonymity kept",
  );
  assert.deepEqual(
    tables.google_listing_days.map((d) => [d.day, d.rating, d.review_count]),
    [[today, 4.7, 12]],
    "the profile's numbers, on the workspace's own day",
  );
  assert.deepEqual(tables.notifications, [], "history: nothing rings");
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.data]),
    [[A, "google.connected", "google", { email: "owner@example.com", accounts: 1, locations: 2, on_maps: 1, by: U }]],
    "the ledger: who connected, how many locations the account manages, how many are on Maps",
  );
});

test("connect with several locations on Maps waits for the owner's choice: the connection is kept without a location and the choices answered, nothing read or bound until `choose` -- which is proven against Google's list, never taken on the client's word; `locations` reads the list again as the owner", async () => {
  const tables = world();
  const { vault } = use(tables);
  const net = google({ locations: [LOC, LOC2, OFF_MAPS] });

  const [status, body] = await answer(await knock({ op: "connect", code: "4/the-code", user_id: U }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.pending, true);
  assert.deepEqual(
    body.locations.map((l) => [l.name, l.title, l.place_id, l.address, l.account_name, l.account_title]),
    [
      ["locations/222", "Harbor Moving", PLACE, "1 Main St, Brooklyn, NY 11201", "accounts/111", "Harbor"],
      ["locations/333", "Harbor Moving Warehouse", PLACE2, null, "accounts/111", "Harbor"],
    ],
    "the ones on Maps, with the account each belongs to; the one not on Maps is not offered",
  );
  assert.equal("listing" in body, false);
  assert.equal("read" in body, false);
  assert.deepEqual(
    [body.connection.location_name, body.connection.location_title, body.connection.last_synced_at],
    [null, null, null],
    "connected, waiting for the location",
  );
  assert.deepEqual(
    net.asked(),
    [
      ["POST", TOKEN_URL],
      ["GET", ACCOUNTS_URL],
      ["GET", LOCATIONS_URL("accounts/111")],
    ],
    "no reviews read: nothing is bound yet",
  );
  assert.deepEqual(tables.google_listings, [], "no listing until the choice");
  assert.equal(tables.google_connections[0].location_name, null);
  assert.equal(vault.writes.length, 1);
  assert.deepEqual(
    tables.events.map((e) => e.kind),
    ["google.connected"],
  );

  const [ls, lb] = await answer(await knock({ op: "locations" }));
  assert.equal(ls, 200);
  assert.deepEqual(
    lb.locations.map((l) => l.name),
    ["locations/222", "locations/333"],
  );
  assert.deepEqual(vault.reads, [A], "the token from Vault, still good: no refresh");
  assert.deepEqual(net.asked().slice(3), [
    ["GET", ACCOUNTS_URL],
    ["GET", LOCATIONS_URL("accounts/111")],
  ]);
  assert.equal(net.calls.at(-1).headers.Authorization, "Bearer at-fresh");

  assert.deepEqual(await answer(await knock({ op: "choose", account_name: "111", location_name: "locations/222" })), [
    400,
    { ok: false, error: "account_name and location_name are required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "choose", account_name: "accounts/111", location_name: "222" })), [
    400,
    { ok: false, error: "account_name and location_name are required" },
  ]);
  assert.deepEqual(
    await answer(await knock({ op: "choose", account_name: "accounts/111", location_name: "locations/999" })),
    [404, { ok: false, error: "no_such_location" }],
    "proven against what the account may manage",
  );
  assert.deepEqual(
    await answer(await knock({ op: "choose", account_name: "accounts/111", location_name: "locations/444" })),
    [404, { ok: false, error: "no_such_location" }],
    "a location not on Maps is not offered, so it cannot be chosen",
  );
  assert.deepEqual(
    await answer(await knock({ op: "choose", account_name: "accounts/999", location_name: "locations/222" })),
    [404, { ok: false, error: "no_such_location" }],
    "nor a location under an account that is not this owner's",
  );
  assert.deepEqual(tables.google_listings, [], "nothing bound by a refused choice");

  const today = localDate(TZ, new Date());
  const t0 = Date.now();
  const [cs, cb] = await answer(
    await knock({ op: "choose", account_name: "accounts/111", location_name: "locations/333", user_id: U }),
  );
  assert.equal(cs, 200, JSON.stringify(cb));
  assert.deepEqual(
    [cb.connection.location_name, cb.connection.location_title, cb.connection.sync_error],
    ["locations/333", "Harbor Moving Warehouse", null],
  );
  assert.deepEqual(cb.read, { ok: true, fresh: 0, counted: 0, answered: 0 }, "synced at once, as history");
  assert.deepEqual(
    [cb.listing.place_id, cb.listing.name, cb.listing.address, cb.listing.rating, cb.listing.review_count],
    [PLACE2, "Harbor Moving Warehouse", null, 4.7, 12],
  );
  assert.deepEqual(
    net.asked().slice(-3),
    [
      ["GET", ACCOUNTS_URL],
      ["GET", LOCATIONS_URL("accounts/111")],
      ["GET", REVIEWS_URL("accounts/111", "333")],
    ],
    "the list read again to prove the choice, then the chosen location's reviews",
  );
  const listing = tables.google_listings[0];
  assert.deepEqual(
    [
      tables.google_listings.length,
      listing.tenant_id,
      listing.place_id,
      listing.name,
      listing.linked_by,
      listing.facts,
    ],
    [1, A, PLACE2, "Harbor Moving Warehouse", U, {}],
    "the chosen location's place on Maps becomes the listing",
  );
  assert.ok(Date.parse(listing.linked_at) >= t0);
  const conn = tables.google_connections[0];
  assert.deepEqual(
    [conn.account_name, conn.location_name, conn.location_title, conn.sync_error],
    ["accounts/111", "locations/333", "Harbor Moving Warehouse", null],
  );
  assert.ok(Date.parse(conn.last_synced_at) >= t0);
  assert.deepEqual(
    tables.google_reviews.map((r) => [r.review_id, r.origin]),
    [["g-1", "profile"]],
  );
  assert.deepEqual(
    tables.google_listing_days.map((d) => [d.day, d.rating, d.review_count]),
    [[today, 4.7, 12]],
  );
  assert.deepEqual(
    tables.events.map((e) => e.kind),
    ["google.connected"],
    "a choice finishes the connection; it is not a second event",
  );

  use(world());
  const nothing = silent("nothing to read without a connection");
  assert.deepEqual(await answer(await knock({ op: "locations" })), [404, { ok: false, error: "not_connected" }]);
  assert.deepEqual(
    await answer(await knock({ op: "choose", account_name: "accounts/111", location_name: "locations/222" })),
    [404, { ok: false, error: "not_connected" }],
  );
  assert.equal(nothing.calls.length, 0);
});

test("connect refuses -- and gives the grant back -- when Google refuses the code, when the grant lacks the profile scope or a refresh token, when the accounts cannot be read, when there is no location or none on Maps; without the OAuth trio there is no door; a Vault that will not keep the token undoes the row", async () => {
  const empty = (tables, w) => {
    assert.deepEqual(tables.google_connections, [], "no row");
    assert.deepEqual(tables.events, [], "nothing on the ledger");
    assert.deepEqual(w.vault.writes, [], "nothing in Vault");
  };
  let tables = world();
  let w = use(tables);
  let net = wired((req) =>
    req.url === TOKEN_URL
      ? { status: 400, body: { error: "invalid_grant", error_description: "Malformed auth code." } }
      : refusal(500, "unexpected", "INTERNAL"),
  );
  assert.deepEqual(
    await answer(await knock({ op: "connect", code: "4/bad" })),
    [502, { ok: false, error: "exchange_failed", detail: "invalid_grant: Malformed auth code." }],
    "Google's own words, never a throw",
  );
  assert.deepEqual(net.asked(), [["POST", TOKEN_URL]], "nothing to revoke: no grant was made");
  empty(tables, w);

  tables = world();
  w = use(tables);
  net = google({ grant: { scope: "openid email" } });
  assert.deepEqual(
    await answer(await knock({ op: "connect", code: "4/the-code" })),
    [502, { ok: false, error: "scope_missing" }],
    "the owner unticked the profile box on the consent screen",
  );
  assert.deepEqual(
    net.asked(),
    [
      ["POST", TOKEN_URL],
      ["POST", REVOKE_URL],
    ],
    "the grant given back at once",
  );
  assert.equal(form(net.calls[1]).get("token"), "at-fresh", "by its access token: it is all there is");
  empty(tables, w);

  tables = world();
  w = use(tables);
  net = google({ grant: { refresh_token: undefined } });
  assert.deepEqual(
    await answer(await knock({ op: "connect", code: "4/the-code" })),
    [502, { ok: false, error: "no_refresh_token" }],
    "without a refresh token the connection could not outlive the hour",
  );
  assert.deepEqual(net.asked(), [
    ["POST", TOKEN_URL],
    ["POST", REVOKE_URL],
  ]);
  assert.equal(form(net.calls[1]).get("token"), "at-fresh");
  empty(tables, w);

  tables = world();
  w = use(tables);
  net = wired((req) => {
    const u = req.url.split("?")[0];
    if (u === TOKEN_URL) return { status: 200, body: GRANT };
    if (u === REVOKE_URL) return { status: 200, body: {} };
    if (u === ACCOUNTS_URL) return refusal(403, "The caller does not have permission", "PERMISSION_DENIED");
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  assert.deepEqual(await answer(await knock({ op: "connect", code: "4/the-code" })), [
    502,
    { ok: false, error: "accounts_unreadable", detail: "PERMISSION_DENIED: The caller does not have permission" },
  ]);
  assert.deepEqual(net.asked(), [
    ["POST", TOKEN_URL],
    ["GET", ACCOUNTS_URL],
    ["POST", REVOKE_URL],
  ]);
  assert.equal(form(net.calls[2]).get("token"), "rt-1", "the refresh token: the whole grant, given back");
  empty(tables, w);

  for (const [locations, error] of [
    [[], "no_locations"],
    [[OFF_MAPS], "not_on_maps"],
  ]) {
    tables = world();
    w = use(tables);
    net = google({ locations });
    assert.deepEqual(
      await answer(await knock({ op: "connect", code: "4/the-code" })),
      [502, { ok: false, error }],
      error,
    );
    assert.deepEqual(
      net.asked(),
      [
        ["POST", TOKEN_URL],
        ["GET", ACCOUNTS_URL],
        ["GET", LOCATIONS_URL("accounts/111")],
        ["POST", REVOKE_URL],
      ],
      error,
    );
    assert.equal(form(net.calls[3]).get("token"), "rt-1", error);
    empty(tables, w);
  }

  await withEnv({ GOOGLE_OAUTH_REDIRECT_URI: undefined }, async () => {
    tables = world();
    w = use(tables);
    net = silent("without a client there is nothing to trade the code with");
    assert.deepEqual(await answer(await knock({ op: "connect", code: "4/the-code" })), [
      503,
      { ok: false, error: "no_oauth_client" },
    ]);
    assert.equal(net.calls.length, 0);
    empty(tables, w);
  });

  tables = world();
  const vault = { drops: [] };
  setPg(
    fakeDb(
      tables,
      {},
      {
        get_google_credentials: () => null,
        put_google_credentials: () => {
          throw new Error("permission denied for function put_google_credentials");
        },
        drop_google_credentials: ({ p_tenant_id }) => {
          vault.drops.push(p_tenant_id);
          return null;
        },
      },
    ),
  );
  net = google();
  assert.deepEqual(await answer(await knock({ op: "connect", code: "4/the-code", user_id: U })), [
    502,
    {
      ok: false,
      error: "credentials_failed",
      detail: "credentials: permission denied for function put_google_credentials",
    },
  ]);
  assert.deepEqual(tables.google_connections, [], "without the token the row is a lie: removed");
  assert.deepEqual(net.asked().at(-1), ["POST", REVOKE_URL], "and the grant given back");
  assert.equal(form(net.calls.at(-1)).get("token"), "rt-1");
  assert.deepEqual(tables.events, [], "not connected: nothing on the ledger");
});

/* ---------------------------- refresh: the profile ------------------------ */

test("refresh with the profile connected syncs it as the owner -- the expired token in Vault traded for a fresh one that is kept -- and a credential Google rejects is written on the connection without a throw: the dashboard sees the words, the stamp does not move, the listing keeps its numbers", async () => {
  const tables = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [reviewRow(R1)],
  });
  const creds = new Map([
    [A, { refresh_token: "rt-1", access_token: "at-stale", expires_at: Date.now() - 60_000, scope: SCOPE }],
  ]);
  const { vault } = use(tables, creds);
  const before = { ...tables.google_connections[0] };
  let net = wired((req) =>
    req.url.split("?")[0] === TOKEN_URL
      ? { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }
      : (() => {
          throw new Error(`unexpected ${req.method} ${req.url}`);
        })(),
  );

  const [s1, b1] = await answer(await knock({ op: "refresh" }));
  assert.equal(s1, 502);
  assert.deepEqual(
    [b1.ok, b1.read],
    [false, { ok: false, error: "invalid_grant: Token has been expired or revoked." }],
  );
  assert.equal(
    b1.connection.sync_error,
    "invalid_grant: Token has been expired or revoked.",
    "Google's own words, on the connection the owner can see",
  );
  assert.equal(b1.connection.last_synced_at, before.last_synced_at, "a failed sync is not a sync");
  assert.deepEqual(
    [b1.listing.rating, b1.listing.review_count, b1.listing.check_error],
    [4.5, 10, null],
    "the listing keeps its last good numbers, and this was not the listing's failure",
  );
  assert.deepEqual(
    net.asked(),
    [["POST", TOKEN_URL]],
    "the stale token was not tried: it had expired, so the refresh went first, and Google refused it",
  );
  const refresh = form(net.calls[0]);
  assert.deepEqual(
    [refresh.get("grant_type"), refresh.get("refresh_token"), refresh.get("client_id"), refresh.get("client_secret")],
    ["refresh_token", "rt-1", "oauth-client-for-this-file", "oauth-secret-for-this-file"],
  );
  assert.deepEqual(vault.writes, [], "nothing kept from a refusal");
  assert.equal(
    tables.google_connections[0].sync_error,
    "invalid_grant: Token has been expired or revoked.",
    "on the row",
  );
  assert.deepEqual([tables.notifications, tables.events], [[], []]);

  // The owner reconnected at Google's end; the refresh is honoured and kept, the reviews read as the owner, and what is new rings.
  const NEW = {
    name: "accounts/111/locations/222/reviews/g-3",
    reviewId: "g-3",
    starRating: "FIVE",
    reviewer: { displayName: "Luis" },
    comment: "Great crew.",
    createTime: ago(2 * HOUR),
    updateTime: ago(2 * HOUR),
  };
  net = wired((req) => {
    const u = req.url.split("?")[0];
    if (u === TOKEN_URL)
      return { status: 200, body: { access_token: "at-new", expires_in: 3600, scope: SCOPE, token_type: "Bearer" } };
    if (u === REVIEWS_URL("accounts/111", "222"))
      return { status: 200, body: { reviews: [NEW, GBP_REVIEW], averageRating: 4.8, totalReviewCount: 13 } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const t0 = Date.now();
  const [s2, b2] = await answer(await knock({ op: "refresh" }));
  assert.equal(s2, 200, JSON.stringify(b2));
  assert.deepEqual(b2.read, { ok: true, fresh: 1, counted: 0, answered: 0 });
  assert.equal(b2.connection.sync_error, null, "a sync that succeeds clears the words");
  assert.ok(Date.parse(b2.connection.last_synced_at) >= t0, "the stamp is the successful sync");
  assert.deepEqual(
    [b2.listing.rating, b2.listing.review_count],
    [4.8, 13],
    "the rating and the count as the profile reports them",
  );
  assert.deepEqual(
    net.asked(),
    [
      ["POST", TOKEN_URL],
      ["GET", REVIEWS_URL("accounts/111", "222")],
    ],
    "a token first, then the reviews as the owner",
  );
  assert.equal(net.calls[1].headers.Authorization, "Bearer at-new");
  assert.deepEqual(
    vault.writes.map((w) => [w.tenant, w.secret.refresh_token, w.secret.access_token]),
    [[A, "rt-1", "at-new"]],
    "the fresh access token goes back through the vault door, for next time",
  );
  assert.deepEqual(tables.google_reviews.map((r) => [r.review_id, r.origin, r.author]).sort(), [
    ["g-1", "profile", "Rosa"],
    ["g-3", "profile", "Luis"],
  ]);
  assert.equal(
    tables.google_reviews.find((r) => r.review_id === "g-1").id,
    R1,
    "the review already on record keeps its row",
  );
  assert.deepEqual(
    tables.notifications.map((n) => [n.kind, n.title, n.route, n.subject_type, n.subject_id]),
    [["review", "New on Google: ★★★★★ from Luis", "reports", "review", "g-3"]],
    "written since the last sync and not on record: news; Rosa's, on record, is not",
  );
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.data]),
    [["google.reviews", { source: "profile", fresh: 1, counted: 0, rating: 4.8, review_count: 13 }]],
  );
  assert.ok(
    !net.calls.some((c) => c.url.startsWith("https://places.googleapis.com")),
    "with the profile connected the reviews come from there: the public listing is not read here",
  );
});

/* ----------------------------------- reply -------------------------------- */

test("reply: the answer goes to Google as the owner under the review's own name, cleaned as Google accepts it, then onto the row and the ledger; a review the public listing showed, one not on record, a profile not connected and a refusal from Google are each named, and nothing is written for them", async () => {
  const tables = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [reviewRow(R1), reviewRow(R2, { origin: "places", review_id: "p-1" })],
  });
  const creds = new Map([[A, liveCreds()]]);
  use(tables, creds);
  let net = google();
  assert.deepEqual(await answer(await knock({ op: "reply", id: "nope", comment: "Thank you" })), [
    400,
    { ok: false, error: "id (the review's row) is required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "reply", id: R1, comment: "   " })), [
    400,
    { ok: false, error: "comment is required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "reply", id: R1 })), [
    400,
    { ok: false, error: "comment is required" },
  ]);
  assert.deepEqual(
    await answer(await knock({ op: "reply", id: R2, comment: "Thank you" })),
    [409, { ok: false, error: "not_from_profile" }],
    "a review the public listing showed cannot be answered: its id is Places', not the profile's",
  );
  assert.deepEqual(await answer(await knock({ op: "reply", id: GHOST, comment: "Thank you" })), [
    404,
    { ok: false, error: "no_review" },
  ]);
  assert.equal(net.calls.length, 0, "nothing reached Google for a refusal");

  const COMMENT = "Thank you, Rosa.\nSee you next month.";
  const [status, body] = await answer(
    await knock({ op: "reply", id: R1, comment: "  Thank you, Rosa.  \r\n See you next month. " }),
  );
  assert.deepEqual(
    [status, body],
    [200, { ok: true, reply_text: COMMENT, replied_at: "2026-09-13T15:00:00Z" }],
    "the comment cleaned as Google accepts it; Google's answer as the row's",
  );
  assert.deepEqual(
    net.asked(),
    [["PUT", REPLY_URL("accounts/111", "222", "g-1")]],
    "the review's own name under the connected location; the token in Vault was still good, so no refresh",
  );
  assert.equal(net.calls[0].headers.Authorization, "Bearer at-good");
  assert.deepEqual(JSON.parse(net.calls[0].body), { comment: COMMENT });
  const row = tables.google_reviews.find((r) => r.id === R1);
  assert.deepEqual([row.reply_text, row.replied_at], [COMMENT, "2026-09-13T15:00:00Z"]);
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.subject_id, e.data]),
    [[A, "google.replied", "google", "review", R1, { review_id: "g-1", chars: COMMENT.length }]],
    "the reply on the ledger; the decision naming the person is the dashboard's",
  );
  assert.equal(tables.google_reviews.find((r) => r.id === R2).reply_text, null);

  tables.google_reviews.push(reviewRow(R3, { review_id: "g-3" }));
  net = wired((req) =>
    req.method === "PUT"
      ? refusal(403, "The caller does not have permission", "PERMISSION_DENIED")
      : (() => {
          throw new Error(`unexpected ${req.method} ${req.url}`);
        })(),
  );
  assert.deepEqual(await answer(await knock({ op: "reply", id: R3, comment: "Thanks" })), [
    502,
    { ok: false, error: "google_refused", detail: "PERMISSION_DENIED: The caller does not have permission" },
  ]);
  assert.equal(
    tables.google_reviews.find((r) => r.id === R3).reply_text,
    null,
    "nothing written for a reply Google did not take",
  );
  assert.equal(tables.events.length, 1);

  const nothing = silent("nothing to post without a connected location");
  use(world({ google_listings: [listingRow()], google_reviews: [reviewRow(R1)] }));
  assert.deepEqual(
    await answer(await knock({ op: "reply", id: R1, comment: "Thanks" })),
    [409, { ok: false, error: "not_connected" }],
    "a listing alone: no profile to answer from",
  );
  use(
    world({
      google_connections: [connRow({ location_name: null, location_title: null })],
      google_reviews: [reviewRow(R1)],
    }),
  );
  assert.deepEqual(
    await answer(await knock({ op: "reply", id: R1, comment: "Thanks" })),
    [409, { ok: false, error: "not_connected" }],
    "connected but no location chosen yet: the same",
  );
  assert.equal(nothing.calls.length, 0);
});

/* ----------------------------------- draft -------------------------------- */

test("draft: the Autonomy row is read first -- Never is a 409 before the review is even read -- then the review; without a model key on this edge the draft says so with a 503, and nothing is posted, written or rung", async () => {
  const tables = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [reviewRow(R1)],
    policies: [
      {
        id: "pol-reviews",
        tenant_id: A,
        class: "reviews",
        mode: "never",
        subject_type: null,
        subject_id: null,
        limits: {},
        updated_at: ago(0),
      },
    ],
  });
  const { db } = use(tables, new Map([[A, liveCreds()]]));
  const net = silent("a draft never reaches Google, and this edge has no model key");
  assert.deepEqual(await answer(await knock({ op: "draft", id: "nope" })), [
    400,
    { ok: false, error: "id (the review's row) is required" },
  ]);
  assert.deepEqual(
    await answer(await knock({ op: "draft", id: R1 })),
    [409, { ok: false, error: "policy_never", mode: "never" }],
    "the owner said never: refused",
  );
  assert.ok(!db.seen.some((q) => q.table === "google_reviews"), "before the review is read");
  tables.policies[0].mode = "ask";
  assert.deepEqual(await answer(await knock({ op: "draft", id: GHOST })), [404, { ok: false, error: "no_review" }]);
  assert.deepEqual(
    await answer(await knock({ op: "draft", id: R1 })),
    [503, { ok: false, error: "no_model_key" }],
    "no ANTHROPIC_API_KEY on this edge: the draft says so rather than guessing at words",
  );
  tables.policies.length = 0;
  assert.deepEqual(
    await answer(await knock({ op: "draft", id: R1 })),
    [503, { ok: false, error: "no_model_key" }],
    "no Autonomy row reads as ask: a draft on request, nothing posted alone",
  );
  assert.equal(tables.google_reviews[0].reply_text, null, "a draft never posts");
  assert.deepEqual([tables.events, tables.notifications], [[], []]);
  assert.equal(net.calls.length, 0);
});

/* ------------------------------ disconnect, unlink ------------------------ */

test("disconnect gives the grant back, drops the token from Vault, forgets the profile's reviews and the connection, keeps the listing, and says so on the ledger -- honestly about the revoke; unlink disconnects first, then forgets the listing, and the ledger says both", async () => {
  const tables = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [reviewRow(R1), reviewRow(R2, { origin: "places", review_id: "p-1" })],
  });
  const { vault, creds } = use(tables, new Map([[A, liveCreds()]]));
  let net = google();
  assert.deepEqual(await answer(await knock({ op: "disconnect" })), [200, { ok: true, removed: true, revoked: true }]);
  assert.deepEqual(net.asked(), [["POST", REVOKE_URL]]);
  assert.equal(form(net.calls[0]).get("token"), "rt-1", "the refresh token: the whole grant, given back");
  assert.deepEqual([vault.reads, vault.drops], [[A], [A]], "read for the token to revoke, then dropped");
  assert.equal(creds.has(A), false, "gone from Vault");
  assert.deepEqual(tables.google_connections, []);
  assert.deepEqual(
    tables.google_reviews.map((r) => r.review_id),
    ["p-1"],
    "the profile's reviews go with the connection; the public listing's stay",
  );
  assert.equal(tables.google_listings.length, 1, "the listing stays: the public half still works");
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.data]),
    [[A, "google.disconnected", "google", { email: "owner@example.com", location: "locations/222", revoked: true }]],
  );
  assert.deepEqual(
    await answer(await knock({ op: "disconnect" })),
    [200, { ok: true, removed: false, revoked: false }],
    "again: nothing to remove",
  );
  assert.equal(net.calls.length, 1);
  assert.equal(tables.events.length, 1);

  const t2 = world({ google_connections: [connRow()] });
  const w2 = use(t2, new Map([[A, liveCreds()]]));
  net = wired((req) =>
    req.url === REVOKE_URL
      ? { status: 400, body: { error: "invalid_token" } }
      : (() => {
          throw new Error(`unexpected ${req.method} ${req.url}`);
        })(),
  );
  assert.deepEqual(
    await answer(await knock({ op: "disconnect" })),
    [200, { ok: true, removed: true, revoked: false }],
    "Google would not take the grant back: disconnected all the same, and honest about it",
  );
  assert.deepEqual(
    [t2.google_connections, w2.vault.drops, w2.creds.has(A)],
    [[], [A], false],
    "the token is gone from Vault whatever Google said",
  );
  assert.equal(t2.events[0].data.revoked, false);

  const t3 = world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [reviewRow(R1), reviewRow(R2, { origin: "places", review_id: "p-1" })],
  });
  const w3 = use(t3, new Map([[A, liveCreds()]]));
  net = google();
  assert.deepEqual(await answer(await knock({ op: "unlink" })), [200, { ok: true, removed: true }]);
  assert.deepEqual(
    net.asked(),
    [["POST", REVOKE_URL]],
    "the grant given back on the way: unlinking the listing disconnects the profile first",
  );
  assert.deepEqual([t3.google_connections, t3.google_listings, w3.vault.drops], [[], [], [A]]);
  const gone = writes(w3.db, "google_listings").find((q) => q.op === "delete");
  assert.deepEqual(
    gone.filters,
    [["eq", "tenant_id", A]],
    "the listing row deleted by workspace; its reviews and days go with it by the database's own cascade (00069), which the double does not model",
  );
  assert.deepEqual(
    t3.events.map((e) => [e.kind, e.data]),
    [
      ["google.disconnected", { email: "owner@example.com", location: "locations/222", revoked: true }],
      ["google.unlinked", { place_id: PLACE, name: "Harbor Moving", had_profile: true }],
    ],
  );

  const t4 = world({ google_listings: [listingRow()] });
  use(t4);
  const nothing = silent("no profile: nothing to give back");
  assert.deepEqual(await answer(await knock({ op: "unlink" })), [200, { ok: true, removed: true }]);
  assert.deepEqual(t4.google_listings, []);
  assert.deepEqual(
    t4.events.map((e) => [e.kind, e.data.had_profile]),
    [["google.unlinked", false]],
  );
  assert.equal(nothing.calls.length, 0);
  use(world());
  assert.deepEqual(
    await answer(await knock({ op: "unlink" })),
    [200, { ok: true, removed: false }],
    "nothing linked: nothing removed, and no event for it",
  );
});
