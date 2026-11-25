/**
 * The world the tests of door/ share. Split by behaviour from google-door.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
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
 * ORDER OF SETUP MATTERS: lib/shared/google/places.ts binds `const http = placesFetch()`
 * at module scope, which captures `fetch` as it is at that moment, so the
 * wire is installed before the door is imported.
 */
import { after } from "node:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels/tokens";
import { b64url } from "@chanlytics/channels/shared";
import { fakeDb } from "../../_fake-db.mjs";

// Each test file is its own process: this is the whole environment. The key
// and the OAuth trio open both halves; no model key (a case that wants a draft
// holds one, and a scripted model), so a draft says so rather than reaching a
// model; no Supabase credentials, so `setPg(null)` really is no database.
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
  "RESEND_API_KEY",
  "LEAD_TO",
  "LEAD_FROM",
])
  delete process.env[k];

/* --------------------------------- the wire ------------------------------- */

/** Every request the door makes, captured and answered by the case's `answer`. Installed before the import, on purpose (see the header). */
export const wire = { answer: null, calls: [] };

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
export function wired(answer) {
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
export const silent = (why = "this case must not reach Google") =>
  wired((req) => {
    throw new Error(`${why}: ${req.method} ${req.url}`);
  });

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));

export const { setModelFetch } = await import(at("apps/edge/lib/ai/model.ts"));

export const door = await import(at("apps/edge/api/admin/google.ts"));

after(() => {
  setPg(null);
  setModelFetch(null);
});

export const AUD = "/api/admin/google";

/** Harbor Moving: the workspace every token below is about. */
export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Another workspace, which a token about A must never act on. */
export const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** A workspace that does not exist; also a review row that does not. */
export const GHOST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** The owner who pressed the button. */
export const U = "11111111-1111-4111-8111-111111111111";

/** Review rows. */
export const R1 = "22222222-2222-4222-8222-222222222222";

export const R2 = "33333333-3333-4333-8333-333333333333";

export const R3 = "44444444-4444-4444-8444-444444444444";

export const KEY = "diag-key-for-this-file";

export const TZ = "America/New_York";

export const HOUR = 3_600_000;

export const DAY = 24 * HOUR;

export const ago = (ms) => new Date(Date.now() - ms).toISOString();

export const PLACE = "ChIJN1t_tDeuEmsRUsoyG83frY4";

export const PLACE2 = "ChIJrTLr-GyuEmsRBfy61i59si0";

export const SCOPE = "openid email https://www.googleapis.com/auth/business.manage";

/* ------------------------------- the knock -------------------------------- */

export const token = (o = {}) => {
  const secret = o.secret ?? process.env.EDGE_CALL_SECRET;
  const claims = { workspace: "workspace" in o ? o.workspace : A, user: U };
  return (body) => signEdgeToken(secret, o.aud ?? AUD, { ...claims, body });
};

/** The headers a knock sends, each token minted for the body it rides with: the edge refuses a token that names none. */
export const minted = (headers, raw) =>
  Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, typeof v === "function" ? v(raw) : v]));

export const knock = (body, headers = { "x-edge-token": token() }) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const sent = minted({ ...headers, "content-type": "application/json" }, raw);
  return door.POST(new Request(`http://edge${AUD}`, { method: "POST", headers: sent, body: raw }));
};

export const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
export async function withEnv(vars, fn) {
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
export const keyed = (fn) => withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: KEY }, fn);

/* -------------------------------- the world ------------------------------- */

export const tenantRow = (id, over = {}) => ({
  id,
  name: "Harbor Moving",
  slug: "harbor-moving",
  timezone: TZ,
  status: "active",
  ...over,
});

/** The public listing as the database holds it: linked a month ago, read yesterday. */
export const listingRow = (over = {}) => ({
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
export const connRow = (over = {}) => ({
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
  reviews_complete: false,
  ...over,
});

/** A review on record, from the profile, unanswered. */
export const reviewRow = (id, over = {}) => ({
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
  // No reply held for it (00462, decision 0064 step 6).
  draft_text: null,
  drafted_at: null,
  posts_at: null,
  maps_uri: null,
  first_seen_at: ago(2 * DAY),
  last_seen_at: ago(HOUR),
  ...over,
});

/** A live token in Vault, good for an hour. */
export const liveCreds = () => ({
  refresh_token: "rt-1",
  access_token: "at-good",
  expires_at: Date.now() + HOUR,
  scope: SCOPE,
});

export function world(over = {}) {
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
export function use(tables, creds = new Map(), faults = {}) {
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

export const writes = (db, table) =>
  db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));

/* ---------------------------------- Google -------------------------------- */

export const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";

export const LOCATIONS_URL = (account) =>
  `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations`;

/** One location read alone (locations.get), as a sync reads the bound one again for its review link. */
export const LOCATION_URL = (name) => `https://mybusinessbusinessinformation.googleapis.com/v1/${name}`;

export const REVIEWS_URL = (account, loc) => `https://mybusiness.googleapis.com/v4/${account}/locations/${loc}/reviews`;

/** One location's own details (decision 0073, R17): its hours, services and prices, days closed and words, for Check. */
/** A listing's facts as the one writer keeps them (packages/db patchListing): every key, none known. */
export const NO_FACTS = {
  hours: null,
  phone_display: null,
  phone_e164: null,
  primary_type: null,
  primary_type_label: null,
  service_area_only: false,
  time_zone: null,
  website: null,
};

export const DETAILS_URL = (loc) => `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${loc}`;

export const REPLY_URL = (account, loc, id) =>
  `https://mybusiness.googleapis.com/v4/${account}/locations/${loc}/reviews/${id}/reply`;

export const PLACES_SEARCH = "https://places.googleapis.com/v1/places:searchText";

export const PLACE_URL = (id) => `https://places.googleapis.com/v1/places/${id}`;

export const form = (req) => new URLSearchParams(req.body);

export const refusal = (status, message, code) => ({
  status,
  body: { error: { code: status, message, status: code } },
});

/** An id token as Google mints one: the claims in the middle, read but never trusted for access. */
export const idToken = (email, sub) =>
  `eyJhbGciOiJSUzI1NiJ9.${b64url(JSON.stringify({ iss: "https://accounts.google.com", sub, email, email_verified: true }))}.sig`;

/** A place as Places (New) answers it. */
export const place = (id, over = {}) => ({
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
export const publicReview = (id, over = {}) => ({
  name: `places/${PLACE}/reviews/${id}`,
  rating: 5,
  text: { text: "Careful movers, on time.", languageCode: "en" },
  authorAttribution: { displayName: "Rosa", uri: "https://maps.google.com/rosa" },
  publishTime: ago(2 * HOUR),
  googleMapsUri: "https://maps.google.com/?r=1",
  ...over,
});

/** Locations as Business Information answers them: on Maps, on Maps elsewhere, and not on Maps yet. */
export const LOC = {
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

export const LOC2 = {
  name: "locations/333",
  title: "Harbor Moving Warehouse",
  metadata: { placeId: PLACE2, mapsUri: "https://maps.google.com/?cid=2" },
};

export const OFF_MAPS = { name: "locations/444", title: "Not on Maps yet", metadata: {} };

/** Reviews as the v4 API answers them: Rosa three days ago, and an anonymous four-star the owner answered long ago. */
export const GBP_REVIEW = {
  name: "accounts/111/locations/222/reviews/g-1",
  reviewId: "g-1",
  starRating: "FIVE",
  reviewer: { displayName: "Rosa", profilePhotoUrl: null },
  comment: "Careful movers.",
  createTime: ago(3 * DAY),
  updateTime: ago(3 * DAY),
};

export const GBP_OLD = {
  name: "accounts/111/locations/222/reviews/g-2",
  reviewId: "g-2",
  starRating: "FOUR",
  reviewer: { isAnonymous: true },
  comment: "Fine.",
  createTime: ago(40 * DAY),
  updateTime: ago(39 * DAY),
  reviewReply: { comment: "Thank you!", updateTime: ago(39 * DAY) },
};

export const GRANT = {
  access_token: "at-fresh",
  refresh_token: "rt-1",
  expires_in: 3600,
  scope: SCOPE,
  token_type: "Bearer",
  id_token: idToken("owner@example.com", "sub-1"),
};

/** Google as a connected owner sees it: a code traded, a refresh honoured, a grant revoked, one account, the locations given, the reviews given, a reply accepted, a place read. */
export function google({ locations = [LOC], reviews = [GBP_REVIEW], grant = {}, page = {} } = {}) {
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
    const one = locations.find((l) => u === LOCATION_URL(l.name));
    if (one) return { status: 200, body: one };
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

/**
 * A workspace whose reviews are on the auto mode (or `mode`), a profile synced yesterday and one new review waiting for a
 * reply (`unanswered`).
 */
export function autoModeWorld(unanswered, mode = "auto") {
  return world({
    google_listings: [listingRow()],
    google_connections: [connRow()],
    google_reviews: [unanswered],
    policies: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        tenant_id: A,
        class: "reviews",
        mode,
        subject_type: null,
        subject_id: null,
        limits: {},
        updated_at: ago(2 * DAY),
      },
    ],
    billing_accounts: [{ tenant_id: A, mode: "direct", status: "none" }],
    ai_usage: [],
  });
}
