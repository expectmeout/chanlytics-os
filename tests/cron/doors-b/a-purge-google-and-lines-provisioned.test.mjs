/**
 * A purge the bucket refuses, a Google profile synced as the owner, and lines: a tick that cannot provision says so,
 * and a number whose subscription ended is reported.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewRoute, RECORDING_RETENTION_DAYS } from "@chanlytics/contracts";
import { withoutRequestId } from "../../_log-lines.mjs";
import {
  DAY,
  HOUR,
  MIN,
  NONE_ENDED,
  NONE_OWED,
  NONE_TRIALS,
  NOW,
  VAULT_TOKEN,
  ago,
  answer,
  callRow,
  dayIn,
  endedWorld,
  googleHour,
  googleReader,
  ingestRpc,
  iso,
  knock,
  lineRow,
  listing,
  place,
  placeIdOf,
  rpcs,
  silent,
  tenant,
  tenantRow,
  unanalysed,
  use,
  uuid,
  wired,
  withEnv,
} from "./_doors-b.mjs";

test("calls: a purge the bucket refuses marks nothing and stops no other leg, then the sweep answers 500 in the bucket's own words, where its watcher reads them; the tick that removes the audio answers 200", async () => {
  const T = tenant(4);
  const CONV = uuid(41);
  const old = NOW - (RECORDING_RETENTION_DAYS + 1) * DAY;
  const tables = {
    calls: [
      callRow(T, "old", {
        status: "ended",
        started_at: iso(old),
        ended_at: iso(old + 2 * MIN),
        updated_at: iso(old),
        conversation_id: CONV,
        message_id: uuid(42),
        recording: { fetch_state: "stored", storage_path: `${T}/calls/old.wav`, mime: "audio/wav", bytes: 10 },
      }),
      callRow(T, "unnoted", {
        status: "ended",
        started_at: ago(25 * MIN),
        ended_at: ago(20 * MIN),
        updated_at: ago(20 * MIN),
        duration_ms: 65_000,
        in_voicemail: false,
        conversation_id: CONV,
      }),
    ],
    messages: [],
    events: [],
  };
  const db = use(tables, { ingest_call: ingestRpc(tables) });
  const net = unanalysed();
  const call = (id) => tables.calls.find((c) => c.id === id);
  let refusing = true;
  const bucketOf = db.storage.from;
  db.storage.from = (name) => {
    const b = bucketOf(name);
    return {
      ...b,
      remove: async (paths) =>
        refusing ? { data: null, error: { message: "the storage service is unavailable" } } : b.remove(paths),
    };
  };

  const res = await knock("calls");
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(res.status, 500, text);
  assert.deepEqual(
    [body.ok, body.error, body.purge],
    [false, "purge_failed", { candidates: 1, purged: 0, error: "the storage service is unavailable" }],
    "which leg failed, and why",
  );
  // sweep_health() quotes the first 200 characters of the answer in the platform's mail.
  assert.match(text.slice(0, 200), /the storage service is unavailable/, "the cause is inside what the alert quotes");
  assert.equal(
    call("old").recording.fetch_state,
    "stored",
    "a removal that failed marks nothing, so the row still owes the purge and the clock asks again in five minutes",
  );
  assert.deepEqual(body.notes, { candidates: 1, written: 1 }, "the purge failing stopped no other leg");
  assert.deepEqual(
    tables.messages.map((m) => m.external_id),
    ["call:call_unnoted"],
  );

  refusing = false;
  const [status, again] = await answer(await knock("calls"));
  assert.equal(status, 200, JSON.stringify(again));
  assert.deepEqual(again.purge, { candidates: 1, purged: 1, error: null });
  assert.deepEqual(db.bucket.removed, [`${T}/calls/old.wav`]);
  assert.equal(call("old").recording.fetch_state, "purged");
  assert.deepEqual(
    net.calls.map((c) => c.url),
    ["https://api.retellai.com/v2/get-call/call_unnoted", "https://api.retellai.com/v2/get-call/call_unnoted"],
    "no ongoing call and no pending copy: the provider is asked only for the analysis the unnoted call never had, once a tick",
  );
});

test("google: without a Places key or an OAuth client the sweep says so and reads no table", async () => {
  const db = use({
    tenants: [tenantRow(tenant(10))],
    google_listings: [listing(tenant(10), 1)],
    google_connections: [],
  });
  const net = silent();
  await withEnv(
    {
      GOOGLE_PLACES_API_KEY: undefined,
      GOOGLE_OAUTH_CLIENT_ID: undefined,
      GOOGLE_OAUTH_CLIENT_SECRET: undefined,
      GOOGLE_OAUTH_REDIRECT_URI: undefined,
    },
    async () => {
      assert.deepEqual(await answer(await knock("google")), [200, { ok: true, skipped: "no_places_key" }]);
    },
  );
  assert.ok(
    db.seen.every((s) => s.rpc === "get_cron_sweep_key"),
    "nothing was read",
  );
  assert.equal(net.calls.length, 0);
});

test("google: listings not read for twenty hours are read again — never read first, then the oldest, every one that is due — and a read writes the rating, the count, the day and the reviews Google shows, ringing the bell for what is new; a refusal stays on its row and moves no stamp", async () => {
  const tenants = [];
  const listings = [];
  const add = (n, over, ws = {}) => {
    const T = tenant(100 + n);
    tenants.push(tenantRow(T, { name: `Workspace ${n}`, ...ws }));
    listings.push(listing(T, n, over));
    return T;
  };
  // The day a read is filed under is the WORKSPACE'S date, read from its own row.
  // These two clocks are twenty-five hours apart and so never on the same date: a
  // sweep that took one zone for everyone could not write both rows right.
  const never = add(0, {}, { timezone: "Pacific/Kiritimati" }); // never read: goes first
  const news = add(1, { checked_at: ago(22 * HOUR) }, { timezone: "Pacific/Pago_Pago" }); // read yesterday; a review since
  const unzoned = add(2, { checked_at: ago(23 * HOUR) }, { timezone: null }); // no zone on its row: the platform's default
  for (let k = 3; k <= 39; k++) add(k, { checked_at: ago((21 + k) * HOUR) }); // 24h .. 60h ago
  const refused = listings[5].tenant_id; // Google refuses this one
  add(40, { checked_at: ago(21 * HOUR) }); // due, the most recently read of the due: past the forty the clock once read
  const fresh = add(41, { checked_at: ago(HOUR) }); // read an hour ago: not due
  const tables = {
    tenants,
    google_listings: listings,
    google_connections: [],
    google_reviews: [],
    google_listing_days: [],
    notifications: [],
    events: [],
  };
  use(tables);
  const rowOf = (T) => tables.google_listings.find((l) => l.tenant_id === T);
  // The order the fixture is due in, taken before the sweep moves any stamp.
  const dueOrder = listings
    .filter((l) => l.checked_at === null || l.checked_at < ago(20 * HOUR))
    .sort((a, b) => (a.checked_at === null ? -1 : b.checked_at === null ? 1 : a.checked_at < b.checked_at ? -1 : 1))
    .map((l) => l.place_id);
  const refusedBefore = { ...rowOf(refused) };
  const net = wired((req) => {
    const id = placeIdOf(req.url);
    if (id === rowOf(refused).place_id && rowOf(refused).check_error === null) {
      return {
        status: 403,
        body: { error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } },
      };
    }
    if (id === rowOf(news).place_id) {
      return {
        status: 200,
        body: place(id, {
          userRatingCount: 11,
          reviews: [
            {
              name: `places/${id}/reviews/r-news`,
              rating: 5,
              authorAttribution: { displayName: "Rosa", uri: "https://maps.google.com/rosa", photoUri: null },
              text: { text: "Careful movers, on time.", languageCode: "en" },
              publishTime: ago(2 * HOUR),
              googleMapsUri: "https://maps.google.com/?r=1",
            },
            {
              name: `places/${id}/reviews/r-old`,
              rating: 4,
              authorAttribution: { displayName: "Ana" },
              text: { text: "Fine.", languageCode: "en" },
              publishTime: ago(300 * DAY),
            },
          ],
        }),
      };
    }
    // A listing never read has a website too: the sweep keeps what the link found and reads no site (checkListing's
    // `site`), with no room for one in its minute.
    if (id === rowOf(never).place_id)
      return { status: 200, body: place(id, { websiteUri: "https://never.example.com" }) };
    return { status: 200, body: place(id) };
  });

  const at = new Date();
  const [status, body] = await googleHour();
  assert.ok(
    net.calls.every((c) => c.url.startsWith("https://places.googleapis.com/")),
    "the sweep reads Places alone: no website, even a never-read listing's",
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body, {
    ok: true,
    listings_due: 41,
    listings_read: 40,
    profiles_due: 0,
    profiles_synced: 0,
    fresh: 1,
    counted: 1,
    failed: 1,
    remaining: 0,
  });

  // The rotation, from what was asked.
  const asked = net.calls.map((c) => placeIdOf(c.url));
  assert.equal(dueOrder.length, 41, "forty-one are due");
  assert.deepEqual(asked, dueOrder, "never read first, then the oldest read; all forty-one");
  assert.equal(asked[0], rowOf(never).place_id);
  assert.ok(!asked.includes(rowOf(fresh).place_id), "read an hour ago: not due");
  assert.ok(
    net.calls.every(
      (c) =>
        c.method === "GET" &&
        c.headers["X-Goog-Api-Key"] === "places-key-for-this-file" &&
        c.headers["X-Goog-FieldMask"].includes("rating,userRatingCount,reviews"),
    ),
    "the key in a header, the fields asked for by name",
  );

  // What a read writes.
  const first = rowOf(never);
  assert.deepEqual(
    [first.name, first.address, first.rating, first.review_count, first.check_error],
    ["Harbor Moving", "1 Main St, Brooklyn", 4.6, 10, null],
    "the listing says what Google says",
  );
  assert.ok(Date.parse(first.checked_at) >= NOW, "the stamp is the successful read");
  const dayOf = (T) => tables.google_listing_days.filter((d) => d.tenant_id === T).map((d) => d.day);
  assert.deepEqual(
    dayOf(never),
    [dayIn("Pacific/Kiritimati", at)],
    "and the day has its row, by the workspace's own clock",
  );
  assert.deepEqual(dayOf(news), [dayIn("Pacific/Pago_Pago", at)]);
  assert.notEqual(
    dayOf(never)[0],
    dayOf(news)[0],
    "the first and the last clock on Earth: two workspaces read in the same second are on different days",
  );
  assert.deepEqual(
    dayOf(unzoned),
    [dayIn("America/New_York", at)],
    "a workspace with no zone on its row is on the platform's default, New York",
  );
  assert.equal(tables.google_listing_days.length, 40, "one day row per read");
  const bad = rowOf(refused);
  assert.equal(
    bad.check_error,
    "PERMISSION_DENIED: The caller does not have permission",
    "a failed read leaves its words",
  );
  assert.deepEqual(
    [bad.rating, bad.review_count, bad.checked_at],
    [refusedBefore.rating, refusedBefore.review_count, refusedBefore.checked_at],
    "and the last good numbers; the stamp does not move -- it is the news cutoff, the first-sync flag and the due window at once",
  );
  assert.equal(rowOf(fresh).checked_at, ago(HOUR));

  // The bell rings for the one review written since the last read; the old one shown by relevance is not news.
  assert.deepEqual(
    tables.google_reviews.map((r) => [r.tenant_id, r.review_id, r.origin, r.rating, r.author, r.body]).sort(),
    [
      [news, "r-news", "places", 5, "Rosa", "Careful movers, on time."],
      [news, "r-old", "places", 4, "Ana", "Fine."],
    ].sort(),
    "every review Google showed is on record",
  );
  assert.equal(tables.notifications.length, 1);
  const bell = tables.notifications[0];
  // About the review's row, and opening that review (contracts reviewRoute).
  const written = tables.google_reviews.find((r) => r.review_id === "r-news");
  assert.deepEqual(
    [bell.tenant_id, bell.kind, bell.route, bell.subject_type, bell.subject_id],
    [news, "review", reviewRoute(written.id), "review", written.id],
  );
  assert.match(bell.title, /^New on Google: .+ from Rosa$/);
  assert.match(bell.body, /“Careful movers, on time\.”/);
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.data]),
    [[news, "google.reviews", "google", { source: "places", fresh: 1, counted: 1, rating: 4.6, review_count: 11 }]],
  );

  // The next hour: the refused listing (its stamp never moved); nothing else is due.
  const [s2, b2] = await googleHour();
  assert.equal(s2, 200);
  assert.deepEqual([b2.listings_due, b2.listings_read, b2.failed, b2.fresh, b2.counted], [1, 1, 0, 0, 0]);
  assert.deepEqual(
    net.calls.slice(41).map((c) => placeIdOf(c.url)),
    [rowOf(refused).place_id],
  );
  assert.equal(rowOf(refused).check_error, null, "a read that succeeds clears the words");
  assert.ok(Date.parse(rowOf(refused).checked_at) >= NOW);
  assert.equal(tables.notifications.length, 1, "nothing new: nothing rang");
});

test("google: a connected profile not synced for twenty hours is synced as the owner — the refresh token in Vault traded for an access token that is kept, every review read, the public five making way for the profile's, the stamp moved — and a credential Google rejects is written on the row without stopping the sweep; a profile with no location chosen waits", async () => {
  const [T1, T2, T3] = [tenant(201), tenant(202), tenant(203)];
  const SCOPE = "openid email https://www.googleapis.com/auth/business.manage";
  const conn = (T, over = {}) => ({
    tenant_id: T,
    google_email: "owner@example.com",
    google_sub: "sub-1",
    account_name: "accounts/111",
    account_title: "Harbor",
    location_name: "locations/222",
    location_title: "Harbor Moving",
    scopes: SCOPE.split(" "),
    connected_by: null,
    connected_at: ago(DAY),
    last_synced_at: null,
    sync_error: null,
    ...over,
  });
  const tables = {
    tenants: [tenantRow(T1), tenantRow(T2, { name: "Billing probe" }), tenantRow(T3, { name: "Pending" })],
    google_connections: [
      conn(T1),
      conn(T2, { account_name: "accounts/333", location_name: "locations/444" }),
      conn(T3, { location_name: null, location_title: null }),
    ],
    // Read an hour ago: the places leg leaves it, so what this case sees is the profile's.
    google_listings: [listing(T1, 1, { checked_at: ago(HOUR) })],
    google_reviews: [
      {
        id: uuid(21),
        tenant_id: T1,
        review_id: "p-1",
        origin: "places",
        rating: 5,
        author: "Someone",
        body: "the public copy",
        published_at: ago(10 * DAY),
        first_seen_at: ago(9 * DAY),
        replied_at: null,
        reply_text: null,
      },
    ],
    google_listing_days: [],
    notifications: [],
    events: [],
  };
  const kept = [];
  const db = use(tables, {
    get_google_credentials: ({ p_tenant_id }) =>
      p_tenant_id === T1
        ? { refresh_token: "rt-1", access_token: null, expires_at: null, scope: SCOPE }
        : { refresh_token: "rt-2", access_token: null, expires_at: null, scope: SCOPE },
    put_google_credentials: (a) => {
      kept.push(a);
      return null;
    },
  });
  const net = wired((req) => {
    if (req.url === "https://oauth2.googleapis.com/token") {
      const f = new URLSearchParams(req.body);
      if (f.get("refresh_token") === "rt-1")
        return { status: 200, body: { access_token: "at-1", expires_in: 3600, scope: SCOPE, token_type: "Bearer" } };
      return { status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked." } };
    }
    if (req.url.startsWith("https://mybusiness.googleapis.com/v4/accounts/111/locations/222/reviews?")) {
      return {
        status: 200,
        body: {
          reviews: [
            {
              name: "accounts/111/locations/222/reviews/g-1",
              reviewId: "g-1",
              starRating: "FIVE",
              reviewer: { displayName: "Rosa", profilePhotoUrl: null },
              comment: "Careful movers.",
              createTime: ago(3 * DAY),
              updateTime: ago(3 * DAY),
            },
            {
              name: "accounts/111/locations/222/reviews/g-2",
              reviewId: "g-2",
              starRating: "FOUR",
              reviewer: { isAnonymous: true },
              comment: "Fine.",
              createTime: ago(40 * DAY),
              updateTime: ago(39 * DAY),
              reviewReply: { comment: "Thank you!", updateTime: ago(39 * DAY) },
            },
          ],
          averageRating: 4.6,
          totalReviewCount: 12,
        },
      };
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });

  const at = new Date();
  const [status, body] = await googleHour();
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    body,
    {
      ok: true,
      listings_due: 0,
      listings_read: 0,
      profiles_due: 2,
      profiles_synced: 1,
      fresh: 0,
      counted: 0,
      failed: 1,
      remaining: 0,
    },
    "the pending profile is not due; the rejected one fails without throwing",
  );

  assert.deepEqual(
    net.calls.map((c) => [c.method, c.url.split("?")[0]]),
    [
      ["POST", "https://oauth2.googleapis.com/token"],
      ["GET", "https://mybusiness.googleapis.com/v4/accounts/111/locations/222/reviews"],
      ["POST", "https://oauth2.googleapis.com/token"],
    ],
    "a token first, then the reviews as the owner; the second profile never gets past its token",
  );
  const refresh = new URLSearchParams(net.calls[0].body);
  assert.deepEqual(
    [refresh.get("grant_type"), refresh.get("client_id"), refresh.get("client_secret"), refresh.get("refresh_token")],
    ["refresh_token", "oauth-client-for-this-file", "oauth-secret-for-this-file", "rt-1"],
    "the secret alone on the edge",
  );
  assert.deepEqual(
    [net.calls[1].headers.Authorization, net.calls[1].headers["X-GOOG-API-FORMAT-VERSION"]],
    ["Bearer at-1", "2"],
  );
  assert.equal(kept.length, 1, "the fresh access token goes back through the vault door, for next time");
  assert.deepEqual(
    [kept[0].p_tenant_id, kept[0].p_secret.refresh_token, kept[0].p_secret.access_token, kept[0].p_secret.scope],
    [T1, "rt-1", "at-1", SCOPE],
  );
  assert.ok(
    kept[0].p_secret.expires_at >= NOW + 3600_000 && kept[0].p_secret.expires_at <= Date.now() + 3600_000,
    "an hour, as Google said",
  );
  assert.deepEqual(
    rpcs(db, "get_google_credentials").map((s) => s.args.p_tenant_id),
    [T1, T2],
  );

  const c1 = tables.google_connections.find((c) => c.tenant_id === T1);
  assert.ok(Date.parse(c1.last_synced_at) >= NOW, "the stamp is the successful sync");
  assert.equal(c1.sync_error, null);
  assert.deepEqual(
    tables.google_reviews
      .map((r) => [r.tenant_id, r.review_id, r.origin, r.rating, r.author, r.body, r.reply_text])
      .sort(),
    [
      [T1, "g-1", "profile", 5, "Rosa", "Careful movers.", null],
      [T1, "g-2", "profile", 4, null, "Fine.", "Thank you!"],
    ].sort(),
    "the public five are gone -- their ids were the public listing's -- and every review of the profile is on record, replies and anonymity kept",
  );
  const l1 = tables.google_listings.find((l) => l.tenant_id === T1);
  assert.deepEqual([l1.rating, l1.review_count], [4.6, 12], "the rating and the count as the profile reports them");
  assert.deepEqual(
    tables.google_listing_days.map((d) => [d.tenant_id, d.day, d.rating, d.review_count]),
    [[T1, dayIn("America/New_York", at), 4.6, 12]],
    "the profile's numbers, on the workspace's own day",
  );
  assert.equal(
    tables.notifications.filter((n) => n.tenant_id === T1).length,
    0,
    "the first sync is history: nothing rings, nothing is answered",
  );
  assert.equal(tables.events.length, 0);
  const toldT2 = () =>
    tables.notifications.filter((n) => n.tenant_id === T2).map((n) => [n.kind, n.title, n.route, n.subject_type]);
  assert.deepEqual(
    toldT2(),
    [["sweep", "Google Business Profile stopped updating", "admin/integrations", "google_connection"]],
    "a grant Google refused lasts until its owner reconnects: they are told at once, on the bell, with the door to Connections (R11 S11-4)",
  );

  const c2 = tables.google_connections.find((c) => c.tenant_id === T2);
  assert.equal(
    c2.sync_error,
    "invalid_grant: Token has been expired or revoked.",
    "Google's own words, on the connection the owner can see",
  );
  assert.equal(c2.last_synced_at, null, "a failed sync is not a sync");
  assert.deepEqual(
    tables.google_connections.find((c) => c.tenant_id === T3),
    conn(T3, { location_name: null, location_title: null }),
    "no location chosen: not synced, not touched",
  );

  // The next hour: the synced profile rests; the rejected one is tried again, and fails again on its row.
  const [s2, b2] = await googleHour();
  assert.equal(s2, 200);
  assert.deepEqual([b2.profiles_due, b2.profiles_synced, b2.failed], [1, 0, 1]);
  assert.equal(net.calls.length, 4, "one more token request, for the one profile still due");
  assert.equal(toldT2().length, 1, "told once: the hour's next failure finds the notice kept under the same breakage");
});

test("google: past a job's deadline no listing or profile is started: the rest is left, unread and unstamped, and keeps its place for the next hour", async (t) => {
  // A job claimed late in the ledger's minute has little of it left: past its deadline it starts nothing more, and the next
  // hour's clock hands out another. Here the hour's jobs share one deadline, as a tick's do.
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const tenants = [];
  const listings = [];
  for (let n = 0; n < 3; n++) {
    const T = tenant(300 + n);
    tenants.push(tenantRow(T));
    listings.push(listing(T, 300 + n, { checked_at: ago((30 - n) * HOUR) }));
  }
  const tables = {
    tenants,
    google_listings: listings,
    google_connections: [],
    google_reviews: [],
    google_listing_days: [],
    notifications: [],
    events: [],
  };
  use(tables);
  const net = wired((req) => {
    // The first read takes the rest of the function's minute.
    if (net.calls.length === 1) t.mock.timers.tick(60_000);
    return { status: 200, body: place(placeIdOf(req.url)) };
  });
  const before = listings.map((l) => l.checked_at);

  const [status, body] = await googleHour();
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    [body.listings_due, body.listings_read, body.failed, body.remaining],
    [3, 1, 0, 2],
    "one read; the two past the deadline are left, not failed",
  );
  assert.deepEqual(
    net.calls.map((c) => placeIdOf(c.url)),
    [listings[0].place_id],
  );
  assert.deepEqual(
    listings.slice(1).map((l) => l.checked_at),
    before.slice(1),
    "unread and unstamped: they keep their place at the front of the next page",
  );

  // The next hour reads them, oldest first.
  const [s2, b2] = await googleHour();
  assert.equal(s2, 200);
  assert.deepEqual([b2.listings_due, b2.listings_read, b2.remaining], [2, 2, 0]);
  assert.deepEqual(
    net.calls.slice(1).map((c) => placeIdOf(c.url)),
    [listings[1].place_id, listings[2].place_id],
  );
});

test("google: the clock reads nothing itself: each workspace with something due is handed one job, however often it knocks, and a job that finds nothing due reads nothing", async () => {
  const tenants = [];
  const listings = [];
  const due = [];
  for (let n = 0; n < 5; n++) {
    const T = tenant(400 + n);
    due.push(T);
    tenants.push(tenantRow(T));
    listings.push(listing(T, 400 + n, { checked_at: ago((30 - n) * HOUR) }));
  }
  const rested = tenant(409);
  tenants.push(tenantRow(rested));
  listings.push(listing(rested, 409, { checked_at: ago(HOUR) }));
  const tables = {
    tenants,
    google_listings: listings,
    google_connections: [],
    google_reviews: [],
    google_listing_days: [],
    notifications: [],
    events: [],
    jobs: [],
  };
  const db = use(tables);
  const net = silent("the clock asks Google nothing: the jobs do");

  assert.deepEqual(await answer(await knock("google")), [200, { ok: true, due: 5, handed: 5 }]);
  assert.deepEqual(
    tables.jobs.map((j) => [j.kind, j.tenant_id, j.payload]),
    due.map((T) => ["google_read", T, {}]),
    "one a workspace, the longest waiting first, and none for the workspace at rest",
  );
  assert.deepEqual(
    await answer(await knock("google")),
    [200, { ok: true, due: 5, handed: 0 }],
    "a job still waiting is not handed out twice",
  );
  assert.equal(tables.jobs.length, 5);

  assert.deepEqual(
    await googleReader(db).read({ tenant_id: rested }, Date.now() + 45_000),
    { skipped: "not due" },
    "read since the clock looked: its job ends having read nothing",
  );
  assert.equal(net.calls.length, 0);
});

test("lines: a tick that cannot provision says so — no line provider, no receptionist key, no function secret — before any line is read", async () => {
  const T = tenant(300);
  const db = use({ tenants: [tenantRow(T)], lines: [lineRow(T, uuid(300))], jobs: [], notifications: [], events: [] });
  const net = silent();
  await withEnv({ LINES_DRY_RUN: undefined }, async () => {
    assert.deepEqual(
      await answer(await knock("lines")),
      [503, { ok: false, error: "no_line_provider" }],
      "nothing to fake with and no credentials",
    );
  });
  await withEnv({ VERCEL_ENV: "production" }, async () => {
    assert.deepEqual(
      await answer(await knock("lines")),
      [503, { ok: false, error: "no_line_provider" }],
      "production never fakes a line",
    );
  });
  await withEnv({ RETELL_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock("lines")), [503, { ok: false, error: "no_provider_key" }]);
  });
  await withEnv({ RETELL_FN_SECRET: undefined }, async () => {
    assert.deepEqual(await answer(await knock("lines")), [503, { ok: false, error: "no_fn_secret" }]);
  });
  assert.ok(
    db.seen.every((s) => s.rpc === "get_cron_sweep_key"),
    "the lines table was never read: a clean sweep over lines it never looked at is not reported",
  );
  assert.equal(net.calls.length, 0);
});

test("lines: a line 'setting up' past its deadline is taken and resumed by scheduling a line_provision job — two a tick, oldest first — and the platform hears once; one past its three automatic tries is handed to a person: the workspace's bell, the platform's mail, the ledger", async () => {
  const T = tenant(301);
  const worn = uuid(311),
    oldest = uuid(312),
    older = uuid(313),
    old = uuid(314),
    running = uuid(315);
  const tables = {
    tenants: [tenantRow(T, { name: "Northside Movers", slug: "northside-movers" })],
    lines: [
      lineRow(T, worn, { state_since: ago(60 * MIN), facts: { automatic_resumes: 3, trunk_ready: true } }),
      lineRow(T, oldest, { state_since: ago(50 * MIN) }),
      lineRow(T, older, { state_since: ago(40 * MIN), step: "import" }),
      lineRow(T, old, { state_since: ago(30 * MIN) }),
      lineRow(T, running, { state_since: ago(MIN) }),
    ],
    jobs: [],
    notifications: [],
    events: [],
  };
  use(tables);
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails") return { status: 200, body: { id: "email-1" } };
    throw new Error(`the dry provider makes no calls: ${req.method} ${req.url}`);
  });
  const row = (id) => tables.lines.find((l) => l.id === id);

  const [status, body] = await answer(await knock("lines"));
  assert.deepEqual(
    [status, body],
    [
      200,
      {
        ok: true,
        stuck: 2,
        resumed: 1,
        failed: 0,
        gaveUp: 1,
        skipped: 0,
        unreadable: 0,
        release: NONE_ENDED,
        trials: NONE_TRIALS,
        owed: NONE_OWED,
      },
    ],
  );

  // Handed to a person: `failed` is the state every Retry button already knows what to do with.
  assert.equal(row(worn).voice_state, "failed");
  assert.equal(
    row(worn).last_error,
    "Setting up stopped while connecting the number to AI, and 3 automatic tries did not finish it. Retry picks up where it stopped.",
  );
  assert.equal(row(worn).facts.trunk_ready, true, "every receipt the saga reads survives");
  // Resumed: the take is visible on the row, the try is counted, and the saga runs on the ledger.
  assert.equal(row(oldest).voice_state, "provisioning");
  assert.ok(
    Date.parse(row(oldest).state_since) >= NOW,
    "a fresh clock is the take: the next tick leaves it alone for five minutes",
  );
  assert.equal(row(oldest).facts.automatic_resumes, 1);
  assert.deepEqual(
    tables.jobs.map((j) => [j.tenant_id, j.kind, withoutRequestId(j.payload)]),
    [[T, "line_provision", { line_id: oldest, by: "sweep" }]],
    "the saga is a job on the ledger, not a run inside this tick",
  );
  assert.ok(Date.parse(tables.jobs[0].due_at) >= NOW && Date.parse(tables.jobs[0].due_at) <= Date.now(), "due now");
  for (const id of [older, old, running]) {
    assert.deepEqual(
      [row(id).voice_state, row(id).state_since, row(id).facts],
      ["provisioning", lineRow(T, id, { state_since: row(id).state_since }).state_since, {}],
      `${id === running ? "inside its deadline" : "beyond this tick's two"}: untouched`,
    );
  }
  assert.equal(
    row(running).state_since,
    ago(MIN),
    "a saga genuinely still running is never taken from underneath itself",
  );

  // The bell: the workspace's own row, for the line handed to a person. The platform's alerts have no workspace and so no bell.
  assert.equal(tables.notifications.length, 1);
  const bell = tables.notifications[0];
  assert.deepEqual(
    [bell.tenant_id, bell.kind, bell.route, bell.subject_type, bell.subject_id],
    // The first run's page (contracts FIRST_RUN_ROUTE), where the retired admin/setup moved.
    [T, "alert", "start", "line", worn],
  );
  assert.equal(bell.title, "Setting up your phone line stopped · Chanlytics is on it");
  assert.equal(
    bell.body,
    "Setting up +1 (305) 555-0100 stopped while connecting the number to AI. You can try again from Setup. Chanlytics has been told, and will finish it with you if that doesn’t work.",
  );

  // The mail: the platform, twice -- the line given up on, then the first automatic try.
  const mail = net.mail();
  assert.deepEqual(
    mail.map((m) => [m.subject, m.to, m.from]),
    [
      ["Line failed · Northside Movers", ["ops@platform.test"], "Pager <pager@platform.test>"],
      ["Line stuck · Northside Movers", ["ops@platform.test"], "Pager <pager@platform.test>"],
    ],
  );
  assert.match(
    mail[0].text,
    new RegExp(`line ${worn} for \\+13055550100 stopped at step "connecting the number to AI" \\(started by sweep\\)`),
  );
  assert.match(mail[0].text, /3 automatic tries did not finish it/);
  assert.match(
    mail[0].text,
    new RegExp(`\\(${T}\\)[^]*Retry: in the Console, open this workspace's Setup and lines and press Retry setting up`),
    "and how to pick it up: the workspace's id, then the Console's button (the platform key is refused at the door)",
  );
  assert.match(
    mail[1].text,
    new RegExp(`line ${oldest} for \\+1 \\(305\\) 555-0100 stopped while connecting the number to AI`),
  );
  assert.match(mail[1].text, /try 1 of 3\. You hear again only if those do not finish it\./);
  assert.ok(
    net.calls.every(
      (c) => c.url === "https://api.resend.com/emails" && c.headers.Authorization === "Bearer re_test_only",
    ),
    "nothing but mail left this tick",
  );

  // The ledger.
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.category, e.subject_type, e.subject_id, e.data]),
    [
      [
        T,
        "line.failed",
        "setup",
        "line",
        worn,
        // The row's own move to failed writes it (00721 lines_tell_their_moves): its step, error, provider and who.
        { step: "trunk", error: row(worn).last_error, provider: "dry", by: "sweep" },
      ],
    ],
  );

  // The next quarter hour drains the rest, two at a time; later tries go to the ledger, not the mailbox.
  const [s2, b2] = await answer(await knock("lines"));
  assert.deepEqual(
    [s2, b2],
    [
      200,
      {
        ok: true,
        stuck: 2,
        resumed: 2,
        failed: 0,
        gaveUp: 0,
        skipped: 0,
        unreadable: 0,
        release: NONE_ENDED,
        trials: NONE_TRIALS,
        owed: NONE_OWED,
      },
    ],
    "a backlog drains over successive ticks rather than being half-run and killed again",
  );
  assert.deepEqual(
    tables.jobs.map((j) => j.payload.line_id),
    [oldest, older, old],
    "oldest first",
  );
  assert.deepEqual(
    net
      .mail()
      .slice(2)
      .map((m) => m.subject),
    ["Line stuck · Northside Movers", "Line stuck · Northside Movers"],
    "each line's first try is told once",
  );
  const [s3, b3] = await answer(await knock("lines"));
  assert.deepEqual(
    [s3, b3.stuck],
    [200, 0],
    "every taken line carries a fresh clock, and the running one is still inside its deadline",
  );
  assert.equal(tables.jobs.length, 3);
});

test("lines: a stuck line whose workspace cannot be read is left untouched for the next tick, and when every one is, the sweep answers 503 so its watcher hears a database problem rather than a clean sweep", async () => {
  const T = tenant(302);
  const id = uuid(320);
  const tables = { tenants: [], lines: [lineRow(T, id)], jobs: [], notifications: [], events: [] };
  use(tables);
  const net = silent();
  assert.deepEqual(await answer(await knock("lines")), [503, { ok: false, error: "no_workspace_readable", stuck: 1 }]);
  assert.deepEqual(tables.lines[0], lineRow(T, id), "not taken, not counted, not failed");
  assert.deepEqual([tables.jobs, tables.notifications, tables.events], [[], [], []]);
  assert.equal(net.calls.length, 0);
});

test("lines (A2): with no grace set, a number whose subscription ended is only reported -- no warning, no release, nothing written -- and nobody else's number is even counted", async () => {
  const { own, tables } = endedWorld(340);
  // The sweep's chosen-number half reads the workspaces' choices (decision 0091): none here, and read is not written.
  tables.setup_choices ??= [];
  const before = structuredClone(tables);
  use(tables, VAULT_TOKEN);
  const net = silent("a sweep that only reports reaches nobody");
  for (const grace of [undefined, "3", "thirty"]) {
    await withEnv({ LINE_RELEASE_AFTER_DAYS: grace }, async () => {
      const [status, body] = await answer(await knock("lines"));
      assert.equal(status, 200);
      assert.deepEqual(
        body.release,
        { ended: 1, due: 1, warned: 0, undelivered: 0, released: 0, failed: 0, report_only: true },
        `LINE_RELEASE_AFTER_DAYS=${grace}: under the least grace, or not a number, is unset`,
      );
    });
  }
  assert.deepEqual(tables, before, "not a row touched");
  assert.equal(net.calls.length, 0);
  assert.ok(tables.lines.some((l) => l.id === own));
});

test("lines (A2): with a grace set, the owner is warned once -- the day, the forwarding to switch off, where to resume -- and a week later the number goes back: Retell's copy, the carrier's, the routing, the row; the ledger and the owner told", async () => {
  const { T, own, tables } = endedWorld(350);
  use(tables, VAULT_TOKEN);
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails") return { status: 200, body: { id: "email-1" } };
    if (req.method === "DELETE" && req.url === "https://api.retellai.com/delete-phone-number/%2B13055550100")
      return { status: 204 };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv({ LINE_RELEASE_AFTER_DAYS: "30" }, async () => {
    // Ended 40 days ago against a 30-day grace: past it, and never warned -- so warned first, never released at once.
    const [s1, b1] = await answer(await knock("lines"));
    assert.equal(s1, 200);
    assert.deepEqual(b1.release, {
      ended: 1,
      due: 0,
      warned: 1,
      undelivered: 0,
      released: 0,
      failed: 0,
      report_only: false,
    });
    const warned = tables.lines.find((l) => l.id === own).facts.release_warning;
    assert.equal(warned.ended_at, ago(40 * DAY), "the latest the billing row says it stopped paying");
    const on = Date.parse(warned.on);
    assert.ok(on >= Date.parse(warned.at) + 7 * DAY - 1000, "a week after the warning, at the soonest");
    const day = new Date(on).toLocaleDateString("en", { timeZone: "America/New_York", month: "short", day: "numeric" });
    assert.equal(tables.notifications.length, 1);
    const bell = tables.notifications[0];
    assert.deepEqual([bell.tenant_id, bell.kind, bell.route], [T, "billing", "admin/billing"]);
    assert.equal(bell.title, `Your number +1 (305) 555-0100 goes back on ${day}`);
    assert.equal(
      bell.body,
      `Your subscription ended, so AI's number, +1 (305) 555-0100, goes back to the phone company on ${day}. After that it can't be got back, and callers to it reach nobody.\n\n` +
        `+1 (305) 555-0111 forwards its calls to it. Switch that forwarding off before ${day}, or those calls will go nowhere.\n\n` +
        "To keep the number, resume from Billing: https://dash.test/w/harbor-moving#/admin/billing\n",
    );
    assert.deepEqual(
      net.mail().map((m) => [m.to, m.subject]),
      [[["owner@example.com"], bell.title]],
      "to the workspace's own address",
    );

    // The next quarter hour: warned already, and the week not over.
    const [, b2] = await answer(await knock("lines"));
    assert.deepEqual(b2.release, {
      ended: 1,
      due: 0,
      warned: 0,
      undelivered: 0,
      released: 0,
      failed: 0,
      report_only: false,
    });
    assert.equal(tables.notifications.length, 1, "warned once");

    // A week on.
    const line = tables.lines.find((l) => l.id === own);
    line.facts = { ...line.facts, release_warning: { ...warned, at: ago(8 * DAY) } };
    const [, b3] = await answer(await knock("lines"));
    assert.deepEqual(b3.release, {
      ended: 1,
      due: 1,
      warned: 0,
      undelivered: 0,
      released: 1,
      failed: 0,
      report_only: false,
    });
  });
  assert.deepEqual(
    net.to("retellai").map((r) => [r.method, r.url, r.headers.Authorization]),
    [["DELETE", "https://api.retellai.com/delete-phone-number/%2B13055550100", "Bearer retell-key-for-this-file"]],
    "Retell stops answering for a number that may be somebody else's next month",
  );
  assert.equal(
    tables.lines.find((l) => l.id === own),
    undefined,
    "the line is forgotten",
  );
  assert.deepEqual(
    tables.lines.map((l) => l.e164).sort(),
    ["+13055550111", "+13055550122", "+13055550133", "+13055550144", "+13055550155"],
    "the office phone, the ported number, and every other workspace's number stay",
  );
  assert.equal(tables.tenant_channels[0].status, "disabled", "switched off, never deleted: calls keep their history");
  const ev = tables.events.find((e) => e.kind === "line.released");
  assert.deepEqual(ev.data, {
    e164: "+13055550100",
    provider: "dry",
    retell_number: "+13055550100",
    number: "PN0001",
    channel_disabled: "ch-voice",
    by: "sweep",
    ended_at: ago(40 * DAY),
  });
  const told = tables.notifications[1];
  assert.equal(told.title, "Your number +1 (305) 555-0100 was released");
  assert.equal(
    told.body,
    "+1 (305) 555-0100 went back to the phone company, as we wrote a week ago. AI no longer answers on it.\n\n" +
      "If +1 (305) 555-0111 still forwards to it, switch that forwarding off: those calls go nowhere now.\n\n" +
      "If you resume, Setup picks a new number with you.\n",
  );
});
