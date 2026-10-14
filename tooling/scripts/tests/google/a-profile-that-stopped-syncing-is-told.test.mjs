/**
 * A connected Business Profile that stopped syncing, told to its owner once (the wiring's second audit, R11 S11-4).
 * A failure was `sync_error` on the row and a line in the log; the owner found out by noticing that new reviews had
 * stopped arriving.
 *
 * The real sync (apps/edge/lib/google/profile-sync.ts) over a database in memory and an injected transport to Google: a
 * cause only the owner can mend (Google refused the grant, the location is gone) is told at the first failure; a passing
 * one (Google answering 500) once the profile has gone two days without a sync that worked; the platform's own (no OAuth
 * client) never. Told once per breakage, with the door to Connections; closed by the first sync that works, or by the
 * connection's removal. And a new review's bell is kept before the sync is stamped (R11 S6-12): one that could not be
 * kept leaves the review to be found new, and rung, next hour.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";

const OAUTH = {
  GOOGLE_OAUTH_CLIENT_ID: "cid",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://app.example.com/cb",
};
Object.assign(process.env, OAUTH);
// Nobody on file is mailed, and the only database is the one handed in.
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"])
  delete process.env[k];

const { syncProfile } = await import("../../../../apps/edge/lib/google/profile-sync.ts");
const { disconnectProfile } = await import("../../../../apps/edge/lib/google/profile-connection.ts");
const { setPg } = await import("../../../../apps/edge/lib/pg.ts");
after(() => setPg(null));

const NOW = new Date("2026-10-14T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms) => new Date(ms).toISOString();
const T = "aaaaaaaa-0000-4000-8000-000000000001";
const TITLE = "Google Business Profile stopped syncing";

/** The workspace's connection, last synced `syncedAgo` before NOW. */
const connection = (syncedAgo) => ({
  tenant_id: T,
  google_email: "ada@example.com",
  google_sub: "sub-1",
  account_name: "accounts/1",
  account_title: "Ada's",
  location_name: "locations/1",
  location_title: "Ada's Downtown",
  scopes: ["https://www.googleapis.com/auth/business.manage"],
  connected_by: null,
  connected_at: "2026-09-01T00:00:00Z",
  last_synced_at: at(NOW.getTime() - syncedAgo),
  sync_error: null,
  reviews_complete: true,
});

/** Google, as each case has it: the token endpoint, the reviews (a status, or the list it answers) and the bound location. */
function google({ token = 200, reviews = 200, list = [] } = {}) {
  const asked = [];
  const net = async (req) => {
    asked.push(req.url);
    if (req.url.includes("/token"))
      return token === 200
        ? { status: 200, body: JSON.stringify({ access_token: "at-new", expires_in: 3600, token_type: "Bearer" }) }
        : {
            status: 400,
            body: JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }),
          };
    if (req.url.includes("/reviews"))
      return reviews === 200
        ? { status: 200, body: JSON.stringify({ reviews: list, averageRating: 4.8, totalReviewCount: 12 }) }
        : { status: reviews, body: JSON.stringify({ error: { code: reviews, message: "nope", status: "INTERNAL" } }) };
    if (req.url.includes("/locations/1"))
      return { status: 200, body: JSON.stringify({ name: "locations/1", title: "Ada's Downtown", metadata: {} }) };
    throw new Error(`unexpected call: ${req.url}`);
  };
  return { net, asked };
}

/**
 * A database in memory with the connection. Its credentials in Vault are `live` (a token that lasts the day), "expired"
 * (refreshed at Google first), or null (none); `keep(...)` changes them between syncs.
 */
function world(conn, { creds = "live" } = {}) {
  let held = creds;
  const tables = {
    tenants: [{ id: T, name: "Ada's", timezone: "America/New_York", status: "active" }],
    tenant_config: [],
    tenant_channels: [],
    google_connections: [conn],
    google_listings: [],
    google_listing_days: [],
    google_reviews: [],
    notifications: [],
    events: [],
  };
  const open = (faults = {}) =>
    fakeDb(tables, faults, {
      get_google_credentials: () =>
        held === null
          ? null
          : {
              refresh_token: "rt",
              access_token: held === "live" ? "at" : null,
              expires_at: held === "live" ? NOW.getTime() + DAY : null,
              scope: "https://www.googleapis.com/auth/business.manage",
            },
      put_google_credentials: () => null,
      drop_google_credentials: () => null,
    });
  let db = open();
  setPg(db);
  const row = () => tables.google_connections[0];
  return {
    get db() {
      return db;
    },
    tables,
    row,
    /** The same rows, with `faults` from now on. */
    reopen: (faults) => {
      db = open(faults);
      setPg(db);
    },
    keep: (c) => {
      held = c;
    },
    /** One sync, as the sweep makes it: of the row as it stands. */
    sync: (net, now = NOW) => syncProfile(db, row(), "America/New_York", now, net),
    reviewBells: () => tables.notifications.filter((n) => n.kind === "review"),
    told: () => tables.notifications.filter((n) => n.title === TITLE),
  };
}

test("a grant Google refused is told at the first failure, once, with the door to Connections; the next sync that works closes it", async () => {
  const w = world(connection(DAY), { creds: "expired" });
  const refused = google({ token: 400 });
  const r = await w.sync(refused.net);
  assert.equal(r.ok, false);
  assert.equal(w.row().sync_error, "invalid_grant: Token has been expired or revoked.");
  assert.deepEqual(
    w.told().map((n) => [n.kind, n.route, n.subject_type, n.subject_id]),
    [["sweep", "admin/integrations", "google_connection", T]],
    "a grant refused lasts until the owner reconnects: told at once",
  );
  assert.match(w.told()[0].body, /^Google stopped letting Chanlytics read your Business Profile/);

  await w.sync(refused.net, new Date(NOW.getTime() + HOUR));
  assert.equal(w.told().length, 1, "the next hour's failure finds it told: one notice per breakage");

  // Reconnected, or Google relented: the next sync works.
  w.keep("live");
  const s = await w.sync(google().net, new Date(NOW.getTime() + 2 * HOUR));
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(w.row().sync_error, null);
  assert.ok(w.told()[0].closed_at, "the notice closed by the sync that works (contracts NOTICE_MENDS)");
});

test("a passing failure (Google answering 500) is told only once the profile has gone two days without a sync that worked, and says when it last did", async () => {
  const young = world(connection(DAY));
  await young.sync(google({ reviews: 500 }).net);
  assert.equal(young.row().sync_error !== null, true, "the failure is on the row, as before");
  assert.deepEqual(young.told(), [], "a day since the last good sync: an outage that may pass, not told");

  const old = world(connection(3 * DAY));
  await old.sync(google({ reviews: 500 }).net);
  assert.equal(old.told().length, 1, "three days: told");
  assert.match(old.told()[0].body, /^Your Business Profile last synced 3d ago, and every try since has failed/);
});

test("a location Google no longer gives the account (404) is the owner's to mend: told at once", async () => {
  const w = world(connection(HOUR));
  await w.sync(google({ reviews: 404 }).net);
  assert.equal(w.told().length, 1);
});

test("no OAuth client is the platform's to mend, never the owner's: nothing told however long it lasts", async () => {
  const w = world(connection(10 * DAY));
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  try {
    const r = await w.sync(google().net);
    assert.deepEqual(r, { ok: false, error: "no_oauth_client" });
    assert.deepEqual(w.told(), []);
  } finally {
    Object.assign(process.env, OAUTH);
  }
});

test("removing the connection closes the notice: it is about nothing now", async () => {
  const w = world(connection(HOUR), { creds: "expired" });
  await w.sync(google({ token: 400 }).net);
  assert.equal(w.told().length, 1);
  // No credentials left to hand back, so the removal asks nothing of Google here.
  w.keep(null);
  const r = await disconnectProfile(w.db, T);
  assert.equal(r.removed, true);
  assert.ok(w.told()[0].closed_at, "closed by the removal (contracts NOTICE_MENDS)");
});

test("a new review's bell that could not be kept takes the review off the record again and leaves the sync unstamped: the next hour finds it new and rings it, once (the wiring's second audit, R11 S6-12)", async () => {
  const w = world(connection(DAY));
  // Written an hour ago: the last sync, a day ago, never saw it.
  const review = {
    name: "accounts/1/locations/1/reviews/g-1",
    reviewId: "g-1",
    starRating: "FIVE",
    reviewer: { displayName: "Rosa" },
    comment: "Careful movers.",
    createTime: at(NOW.getTime() - HOUR),
    updateTime: at(NOW.getTime() - HOUR),
  };
  const before = w.row().last_synced_at;

  w.reopen({ "notifications.insert": { message: "the bell is down" } });
  await assert.rejects(w.sync(google({ list: [review] }).net), /bell could not be kept/);
  assert.deepEqual(w.reviewBells(), []);
  assert.deepEqual(
    w.tables.google_reviews.filter((r) => r.review_id === "g-1"),
    [],
    "off the record again, so it is new to the next sync",
  );
  assert.equal(w.row().last_synced_at, before, "unstamped: due again next hour");

  w.reopen({});
  const r = await w.sync(google({ list: [review] }).net, new Date(NOW.getTime() + HOUR));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(
    w.reviewBells().map((n) => n.title),
    ["New on Google: ★★★★★ from Rosa"],
    "rung the next hour, once",
  );
  assert.equal(w.tables.google_reviews.filter((r) => r.review_id === "g-1").length, 1);
  assert.notEqual(w.row().last_synced_at, before);
});
