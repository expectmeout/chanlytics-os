/**
 * The world the tests of profile/ share. Split by behaviour from google-profile.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * Google, step two: the owner's Business Profile, connected.
 *
 * The OAuth requests and the three Business Profile APIs are pinned to the
 * documented shapes without a network; the state that proves the way back
 * from Google is signed and verified for real; the profile sync planner's
 * truth table is the contract for what counts as new; and the wiring pins
 * keep the edge, the routes, the bridge, the card, the migration and the
 * manifests saying the same thing.
 */
import { fakeDb } from "../../_fake-db.mjs";

export const NOW = Date.parse("2026-09-07T15:00:00Z");

export const CLIENT = {
  clientId: "123-abc.apps.googleusercontent.com",
  clientSecret: "not-a-secret",
  redirectUri: "https://chanlytics-os.vercel.app/api/v1/google/callback",
};

/* ----------------------------------------------------------- the planner */

export const gbp = (over = {}) => ({
  name: "accounts/1/locations/2/reviews/r-ana",
  review_id: "r-ana",
  rating: 5,
  author: "Ana P.",
  author_photo_uri: null,
  anonymous: false,
  text: "Fast, careful, and on time.",
  created_at: "2026-09-07T13:00:00Z",
  updated_at: "2026-09-07T13:00:00Z",
  reply_text: null,
  replied_at: null,
  ...over,
});

export const page = (reviews, over = {}) => ({
  reviews,
  average_rating: 4.8,
  total_count: 213,
  next_page_token: null,
  ...over,
});

/* ------------------------------------------------------ words and the VM */

export const conn = (over = {}) => ({
  google_email: "owner@example.com",
  account_title: "Northside Movers",
  location_name: "locations/456",
  location_title: "Northside Movers",
  connected_at: "2026-09-01T12:00:00Z",
  last_synced_at: "2026-09-07T12:00:00Z",
  sync_error: null,
  ...over,
});

/* ---- connecting: what a failed vault write must NOT destroy ---- */

export const grantBody = (sub, email) =>
  JSON.stringify({
    access_token: "at-1",
    refresh_token: "rt-new",
    expires_in: 3600,
    scope: "https://www.googleapis.com/auth/business.manage",
    id_token: `x.${Buffer.from(JSON.stringify({ sub, email })).toString("base64url")}.y`,
  });

/** Google, as far as connectProfile can tell: a grant, two accounts' worth of locations, and a revoke that answers. */
export function fakeGoogle(sub = "sub-1", email = "ada@example.com") {
  const calls = [];
  const net = async (req) => {
    calls.push(req.url);
    if (req.url.includes("/token")) return { status: 200, body: grantBody(sub, email) };
    if (req.url.includes("/revoke")) return { status: 200, body: "" };
    if (req.url.includes("/accounts") && !req.url.includes("/locations")) {
      return { status: 200, body: JSON.stringify({ accounts: [{ name: "accounts/1", accountName: "Ada's" }] }) };
    }
    // Two locations on Maps, so the connection stays pending and nothing binds.
    return {
      status: 200,
      body: JSON.stringify({
        locations: [
          { name: "locations/1", title: "Ada's Downtown", metadata: { placeId: "p1" } },
          { name: "locations/2", title: "Ada's Uptown", metadata: { placeId: "p2" } },
        ],
      }),
    };
  };
  return { net, calls, revoked: () => calls.filter((u) => u.includes("/revoke")).length };
}

export const OAUTH_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: "cid",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://app.example.com/cb",
};

export async function withOAuthEnv(fn) {
  const saved = {};
  for (const [k, v] of Object.entries(OAUTH_ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

export const connected = (over = {}) => ({
  tenant_id: "t1",
  google_email: "ada@example.com",
  google_sub: "sub-1",
  account_name: "accounts/1",
  account_title: "Ada's",
  location_name: "locations/1",
  location_title: "Ada's Downtown",
  scopes: ["https://www.googleapis.com/auth/business.manage"],
  connected_by: "u1",
  connected_at: "2026-01-01T00:00:00Z",
  last_synced_at: "2026-09-01T00:00:00Z",
  sync_error: null,
  ...over,
});

/**
 * The location `connected()` is bound to (locations/1, on Maps as p1) as Google answers it read alone (locations.get),
 * its metadata `meta`. A review link is `meta.newReviewUri`.
 */
export const boundLocation = (meta = {}) => ({
  status: 200,
  body: JSON.stringify({ name: "locations/1", title: "Ada's Downtown", metadata: { placeId: "p1", ...meta } }),
});

/* ---- the review link (00415): every sync reads the bound location again, and keeps its link as the bind does ---- */

export const REVIEW_LINK = "https://search.google.com/local/writereview?placeid=p1";

/** What the edge's logger wrote while `run` ran: lib/shared/log.ts writes one JSON object a line to the console. */
export async function logged(run) {
  const lines = [];
  const keep = (line) => {
    try {
      lines.push(JSON.parse(line));
    } catch {
      /* not one of ours */
    }
  };
  const real = { log: console.log, warn: console.warn, error: console.error };
  console.log = keep;
  console.warn = keep;
  console.error = keep;
  try {
    return { result: await run(), lines };
  } finally {
    Object.assign(console, real);
  }
}

/**
 * One sync of a bound listing, last synced at `synced` (null: never, its first after the bind), its token fresh and its
 * reviews read (none new, and no rating or count, so the listing's row is written for its link alone): the listing is
 * linked to `place` and keeps `link` (undefined: never written, as a listing bound before 00415), the bound location's
 * read answers `locations` (a function: what it returns or throws), the reviews `reviews`; `meanwhile` changes the rows
 * as Google is asked for the location, as a re-bind would. The bells and the events are kept in the same database. What
 * reached Google, what was written to the listing, the rows after, how many bells and events were kept when the location
 * was asked for, the answer and the log's events.
 */
export async function syncTheLink({
  link,
  locations,
  reviews = { status: 200, body: '{"reviews":[]}' },
  faults = {},
  synced = "2026-09-11T00:00:00Z",
  place = "p1",
  meanwhile = () => {},
}) {
  const { syncProfile } = await import("../../../apps/edge/lib/google/profile-sync.ts");
  const { setPg } = await import("../../../apps/edge/lib/shared/pg.ts");
  const now = new Date("2026-09-12T00:00:00Z");
  const seen = [];
  const conn = connected({ last_synced_at: synced });
  const tables = {
    google_connections: [conn],
    google_listings: [{ tenant_id: "t1", place_id: place, ...(link === undefined ? {} : { new_review_uri: link }) }],
    google_listing_days: [],
    google_reviews: [],
    notifications: [],
    events: [],
  };
  let kept = null;
  const net = async (req) => {
    seen.push(req.url);
    if (req.url.includes("/reviews")) return reviews;
    if (req.url.includes("/locations")) {
      kept ??= { bells: tables.notifications.length, events: tables.events.length };
      meanwhile(tables);
      return typeof locations === "function" ? locations() : locations;
    }
    throw new Error(`unexpected call: ${req.url}`);
  };
  const db = fakeDb(tables, faults, {
    get_google_credentials: () => ({
      refresh_token: "rt",
      access_token: "at",
      expires_at: now.getTime() + 3_600_000,
      scope: "https://www.googleapis.com/auth/business.manage",
    }),
  });
  // The bells reach the edge's own handle (shared/alerts/notify.ts keepAndPush): this database, for the run.
  setPg(db);
  try {
    const { result, lines } = await withOAuthEnv(() =>
      logged(() => syncProfile(db, conn, "America/New_York", now, net)),
    );
    return {
      r: result,
      asked: seen.filter((u) => u.includes("/locations") && !u.includes("/reviews")),
      written: db.seen.filter((s) => s.table === "google_listings" && s.op !== "select").map((s) => s.values),
      listing: tables.google_listings[0],
      connection: tables.google_connections[0],
      kept,
      bells: tables.notifications.length,
      told: tables.events.map((e) => e.kind),
      events: lines.map((l) => l.event).filter((e) => e.startsWith("google_review_link")),
      /** Why a link left as it is was not its place's, as its line says. */
      whys: lines.filter((l) => l.event === "google_review_link_not_its_place").map((l) => l.why),
    };
  } finally {
    setPg(null);
  }
}

/** The reviews read with one written since the last sync (2026-09-11), not on record: news, rung and told. */
export const A_NEW_REVIEW = {
  status: 200,
  body: JSON.stringify({
    reviews: [
      {
        name: "accounts/1/locations/1/reviews/rv-new",
        reviewId: "rv-new",
        starRating: "FIVE",
        reviewer: { displayName: "Luis" },
        comment: "Great crew.",
        createTime: "2026-09-11T20:00:00Z",
        updateTime: "2026-09-11T20:00:00Z",
      },
    ],
    averageRating: 4.8,
    totalReviewCount: 3,
  }),
};

/**
 * Vault's two credential doors as 00364 writes them, over one secret: a write that names the refresh token it read
 * (p_if_refresh_token) is refused with 40001 once the secret carries another. `before00364` answers a third argument
 * as PostgREST does a function it cannot find, as a database before the migration would.
 */
export function vaultDoors(secret, { before00364 = false } = {}) {
  const vault = { secret, writes: [] };
  const answer = (data, error = null) => Promise.resolve({ data, error });
  const db = {
    rpc(name, args) {
      if (name === "get_google_credentials") return answer(vault.secret);
      if (name !== "put_google_credentials") throw new Error(`not modelled: ${name}`);
      if ("p_if_refresh_token" in args && before00364) return answer(null, { code: "PGRST202", message: "not found" });
      if ("p_if_refresh_token" in args && vault.secret?.refresh_token !== args.p_if_refresh_token)
        return answer(null, { code: "40001", message: "put_google_credentials: the token changed since it was read" });
      vault.writes.push(args);
      vault.secret = args.p_secret;
      return answer(`google-creds-${args.p_tenant_id}`);
    },
  };
  return { db, vault };
}
