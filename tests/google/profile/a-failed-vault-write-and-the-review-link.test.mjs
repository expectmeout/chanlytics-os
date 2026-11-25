/**
 * Connecting: what a failed vault write must not destroy; and the review link (00415), every sync reading the bound
 * location again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import {
  A_NEW_REVIEW,
  REVIEW_LINK,
  boundLocation,
  connected,
  fakeGoogle,
  grantBody,
  syncTheLink,
  vaultDoors,
  withOAuthEnv,
} from "./_profile.mjs";

test("a re-connect whose vault write fails puts the working connection back, instead of deleting it", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google/profile-connection.ts");
    // A workspace already connected and syncing. The upsert below writes
    // `location_name: null` over it before the credentials are stored, so a
    // rollback that DELETED the row -- as this used to -- cost a workspace its
    // profile entirely because a re-authorisation could not reach the vault.
    const tables = { google_connections: [connected()] };
    const g = fakeGoogle("sub-1");
    const db = fakeDb(
      tables,
      {},
      {
        put_google_credentials: () => {
          throw new Error("vault unreachable");
        },
      },
    );

    const r = await connectProfile(db, "t1", "u1", "code", "America/New_York", new Date("2026-09-12T00:00:00Z"), g.net);
    assert.equal(r.ok, false);
    assert.equal(r.error, "credentials_failed");
    assert.equal(tables.google_connections.length, 1, "the row is still there");
    assert.equal(tables.google_connections[0].location_name, "locations/1", "bound where it was");
    assert.equal(tables.google_connections[0].last_synced_at, "2026-09-01T00:00:00Z", "and still syncing");
    // Google revokes a grant per client/user, not one token of it, so handing
    // this refresh token back would kill the credentials the restored row runs
    // on -- destroying the connection by the other route.
    assert.equal(g.revoked(), 0, "the grant the restored row depends on is left alone");
  }));

test("a FIRST connect whose vault write fails leaves nothing behind, and does give the grant back", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google/profile-connection.ts");
    const tables = { google_connections: [] };
    const g = fakeGoogle("sub-9");
    const db = fakeDb(
      tables,
      {},
      {
        put_google_credentials: () => {
          throw new Error("vault unreachable");
        },
      },
    );

    const r = await connectProfile(db, "t1", "u1", "code", "America/New_York", new Date("2026-09-12T00:00:00Z"), g.net);
    assert.equal(r.ok, false);
    assert.equal(tables.google_connections.length, 0, "a row with no token behind it is a lie: it goes");
    assert.equal(g.revoked(), 1, "and nothing of ours depends on the grant, so it is handed back");
  }));

test("re-connecting a DIFFERENT Google account still hands its grant back", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google/profile-connection.ts");
    const tables = { google_connections: [connected({ google_sub: "sub-1" })] };
    const g = fakeGoogle("sub-2", "bo@example.com");
    const db = fakeDb(
      tables,
      {},
      {
        put_google_credentials: () => {
          throw new Error("vault unreachable");
        },
      },
    );

    await connectProfile(db, "t1", "u1", "code", "America/New_York", new Date("2026-09-12T00:00:00Z"), g.net);
    assert.equal(tables.google_connections[0].google_sub, "sub-1", "the account that was working is restored");
    assert.equal(g.revoked(), 1, "the OTHER account's grant shares nothing with it, so it is revoked");
  }));

test("a connect that reaches the vault leaves the workspace pending on its choice of location", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google/profile-connection.ts");
    const tables = { google_connections: [] };
    const g = fakeGoogle();
    const kept = [];
    const db = fakeDb(
      tables,
      {},
      {
        put_google_credentials: (a) => {
          kept.push(a);
          return null;
        },
      },
    );

    const r = await connectProfile(db, "t1", "u1", "code", "America/New_York", new Date("2026-09-12T00:00:00Z"), g.net);
    assert.equal(r.ok, true);
    assert.equal(r.pending, true, "two locations on Maps: the owner picks");
    assert.equal(r.locations.length, 2);
    assert.equal(kept.length, 1, "the refresh token went to the vault, never onto the row");
    assert.ok(!JSON.stringify(tables.google_connections[0]).includes("rt-new"));
    assert.equal(g.revoked(), 0);
  }));

test("every refusal on the way to a connection hands the grant back, and writes nothing", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google/profile-connection.ts");
    // Each refusal, driven through the injected transport. A grant we cannot
    // keep and do not give back is a workspace's Google account left
    // authorised to an app that has no record of it. Nothing else here was
    // connected with the account its id token names, so each is given back
    // (a-grant-is-given-back-only-when-alone runs them beside a mailbox).
    const grantBut = (over) => JSON.stringify({ ...JSON.parse(grantBody("sub-1", "ada@example.com")), ...over });
    const cases = [
      {
        why: "exchange_failed",
        revokes: 0,
        at: (u) => (u.includes("/token") ? { status: 400, body: JSON.stringify({ error: "invalid_grant" }) } : null),
      },
      {
        why: "scope_missing",
        revokes: 1,
        at: (u) => (u.includes("/token") ? { status: 200, body: grantBut({ scope: "openid email" }) } : null),
      },
      {
        why: "no_refresh_token",
        revokes: 1,
        at: (u) => (u.includes("/token") ? { status: 200, body: grantBut({ refresh_token: undefined }) } : null),
      },
      {
        why: "accounts_unreadable",
        revokes: 1,
        at: (u) => (u.includes("/accounts") && !u.includes("/locations") ? { status: 500, body: "boom" } : null),
      },
      {
        why: "no_locations",
        revokes: 1,
        at: (u) => (u.includes("/locations") ? { status: 200, body: JSON.stringify({ locations: [] }) } : null),
      },
      {
        why: "not_on_maps",
        revokes: 1,
        at: (u) =>
          u.includes("/locations")
            ? { status: 200, body: JSON.stringify({ locations: [{ name: "locations/1", title: "No Maps listing" }] }) }
            : null,
      },
    ];
    for (const c of cases) {
      const g = fakeGoogle();
      const net = async (req) => c.at(req.url) ?? g.net(req);
      const tables = { google_connections: [] };
      const r = await connectProfile(
        fakeDb(tables, {}, { put_google_credentials: () => null }),
        "t1",
        "u1",
        "code",
        "America/New_York",
        new Date("2026-09-12T00:00:00Z"),
        net,
      );
      assert.equal(r.ok, false, c.why);
      assert.equal(r.error, c.why);
      assert.equal(tables.google_connections.length, 0, `${c.why}: no half-made connection left behind`);
      assert.equal(g.revoked(), c.revokes, `${c.why}: the grant is given back`);
    }
  }));

test("a workspace with ONE location on Maps is bound and synced through the injected transport, not round it", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google/profile-connection.ts");
    // This is the branch the transport had to be threaded all the way down
    // for: connect -> bindLocation -> syncProfile -> tokenFor. A `net` that
    // covered only the outer calls left this path talking to the real Google
    // from inside a test, which is why every other case here returns two
    // locations to stay on the pending branch.
    const seen = [];
    const net = async (req) => {
      seen.push(req.url);
      if (req.url.includes("/token")) return { status: 200, body: grantBody("sub-1", "ada@example.com") };
      if (req.url.includes("/accounts") && !req.url.includes("/locations"))
        return { status: 200, body: JSON.stringify({ accounts: [{ name: "accounts/1", accountName: "Ada's" }] }) };
      if (req.url.includes("/locations") && !req.url.includes("/reviews")) {
        return {
          status: 200,
          body: JSON.stringify({
            locations: [
              { name: "locations/1", title: "Ada's", metadata: { placeId: "p1", mapsUri: "https://maps/p1" } },
            ],
          }),
        };
      }
      if (req.url.includes("/reviews"))
        return { status: 200, body: JSON.stringify({ reviews: [], averageRating: 4.5, totalReviewCount: 2 }) };
      throw new Error(`unexpected call: ${req.url}`);
    };
    const tables = { google_connections: [], google_listings: [], google_reviews: [], google_listing_days: [] };
    const vault = {
      refresh_token: "rt-new",
      access_token: "at-1",
      expires_at: Date.now() + 3_600_000,
      scope: "https://www.googleapis.com/auth/business.manage",
    };
    const db = fakeDb(
      tables,
      {},
      {
        put_google_credentials: () => null,
        get_google_credentials: () => vault,
      },
    );

    const r = await connectProfile(db, "t1", "u1", "code", "America/New_York", new Date("2026-09-12T00:00:00Z"), net);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.pending, false, "one location on Maps: bound at once, no choice to make");
    assert.equal(tables.google_listings.length, 1, "the listing is written");
    assert.equal(tables.google_listings[0].place_id, "p1");
    assert.equal(tables.google_connections[0].location_name, "locations/1", "and the connection is bound to it");
    // The signal is that the sync's OWN call came through `net`. It cannot be a
    // stub on global fetch: `placesFetch()` captures fetch when this module
    // loads, so the module-level transport holds the real one and a stub
    // installed later never sees it. What reached the injected transport is
    // the only honest evidence of what did not go round it.
    assert.ok(
      seen.some((u) => u.includes("/reviews")),
      "the first sync ran through the same transport, not round it",
    );
  }));

test("a sync that ANSWERS reviews stays inside the injected transport too", () =>
  withOAuthEnv(async () => {
    // The sharpest edge in this file. A non-first sync under the auto mode posts
    // a real public reply on a real business's listing, so a transport that
    // stopped at `syncProfile` and left `answerNewReviews` on the module-level
    // one would let a test run write under a stranger's review — and bill a
    // model call to compose it. Global fetch is replaced with a counter rather
    // than a throw, because the auto-reply is wrapped in `.catch()` and would
    // swallow an exception, reporting a clean pass over an escaped call.
    const { syncProfile } = await import("../../../apps/edge/lib/google/profile-sync.ts");
    const now = new Date("2026-09-12T00:00:00Z");
    const seen = [];
    const net = async (req) => {
      seen.push(req.url);
      if (req.url.includes("/token")) return { status: 200, body: grantBody("sub-1", "ada@example.com") };
      if (req.url.includes("/reviews"))
        return { status: 200, body: JSON.stringify({ reviews: [], averageRating: 4.5, totalReviewCount: 2 }) };
      // The sync reads the bound location again for its review link (00415).
      if (req.url.includes("/locations")) return boundLocation();
      throw new Error(`unexpected call: ${req.url}`);
    };
    const conn = connected({ last_synced_at: "2026-09-11T00:00:00Z", connected_at: "2026-08-01T00:00:00Z" });
    const tables = {
      google_connections: [conn],
      google_listings: [{ tenant_id: "t1", place_id: "p1" }],
      google_listing_days: [],
      // On record, from the profile, unanswered, and published since the
      // workspace connected: exactly what the auto mode picks up.
      google_reviews: [
        {
          id: "r1",
          tenant_id: "t1",
          review_id: "rv-1",
          origin: "profile",
          rating: 5,
          author: "Bo",
          body: "lovely",
          published_at: "2026-09-10T00:00:00Z",
          reply_text: null,
        },
      ],
      policies: [
        {
          id: "pol",
          tenant_id: "t1",
          class: "reviews",
          mode: "auto",
          subject_type: null,
          subject_id: null,
          limits: {},
          updated_at: "2026-09-01T00:00:00Z",
        },
      ],
    };
    const db = fakeDb(
      tables,
      {},
      {
        put_google_credentials: () => null,
        // EXPIRED, so the auto-reply's own tokenFor must refresh — which is the
        // call that proves whose transport it is using.
        get_google_credentials: () => ({
          refresh_token: "rt",
          access_token: "stale",
          expires_at: now.getTime() - 60_000,
          scope: "https://www.googleapis.com/auth/business.manage",
        }),
      },
    );

    const realKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY; // the draft bails as no_model_key; no model is ever called
    try {
      const r = await syncProfile(db, conn, "America/New_York", now, net);
      assert.equal(r.ok, true, JSON.stringify(r));
    } finally {
      if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = realKey;
    }
    // TWO refreshes is the whole assertion. The stored token is stale and the
    // fake vault keeps handing back the stale one, so `syncProfile`'s own
    // `tokenFor` refreshes once and the auto-reply's refreshes again -- through
    // `net` only if it was given `net`. Left on the module-level transport the
    // second refresh goes round it and this counts one.
    //
    // It has to be counted rather than caught: `placesFetch()` captures fetch
    // at module load, so a stub on global fetch never sees the escape, and the
    // auto-reply is wrapped in `.catch()`, so a throw would be swallowed and
    // reported as a clean pass.
    assert.equal(
      seen.filter((u) => u.includes("/token")).length,
      2,
      "the auto-reply refreshed its token through the injected transport",
    );
    assert.equal(
      tables.google_reviews[0].reply_text,
      null,
      "and nothing was posted: no model key, so the draft never happened",
    );
  }));

test("REGRESSION (review H:0): a paused or ended workspace, or one whose plan stopped, answers no review on its own", () =>
  withOAuthEnv(async () => {
    // The auto mode posts under the business's name. A workspace billing paused, one its last member left (00262),
    // or one whose Stripe plan is in a state that stops the receptionist kept answering: the sweep picked the
    // connection by its sync time alone. Counted as the test above counts it: the auto-reply's own token refresh is
    // the second one, so a held workspace refreshes once (the sync's) and one on duty twice.
    const { syncProfile } = await import("../../../apps/edge/lib/google/profile-sync.ts");
    const now = new Date("2026-09-12T00:00:00Z");
    const run = async ({ tenant, billing }) => {
      const seen = [];
      const net = async (req) => {
        seen.push(req.url);
        if (req.url.includes("/token")) return { status: 200, body: grantBody("sub-1", "ada@example.com") };
        if (req.url.includes("/reviews"))
          return { status: 200, body: JSON.stringify({ reviews: [], averageRating: 4.5, totalReviewCount: 2 }) };
        if (req.url.includes("/locations")) return boundLocation();
        throw new Error(`unexpected call: ${req.url}`);
      };
      const conn = connected({ last_synced_at: "2026-09-11T00:00:00Z", connected_at: "2026-08-01T00:00:00Z" });
      const tables = {
        tenants: [{ id: "t1", name: "Ada's", timezone: "America/New_York", ...tenant }],
        billing_accounts: billing ? [{ tenant_id: "t1", ...billing }] : [],
        google_connections: [conn],
        google_listings: [{ tenant_id: "t1", place_id: "p1" }],
        google_listing_days: [],
        google_reviews: [
          {
            id: "r1",
            tenant_id: "t1",
            review_id: "rv-1",
            origin: "profile",
            rating: 5,
            author: "Bo",
            body: "lovely",
            published_at: "2026-09-10T00:00:00Z",
            reply_text: null,
          },
        ],
        policies: [
          {
            id: "pol",
            tenant_id: "t1",
            class: "reviews",
            mode: "auto",
            subject_type: null,
            subject_id: null,
            limits: {},
            updated_at: "2026-09-01T00:00:00Z",
          },
        ],
      };
      const db = fakeDb(
        tables,
        {},
        {
          put_google_credentials: () => null,
          get_google_credentials: () => ({
            refresh_token: "rt",
            access_token: "stale",
            expires_at: now.getTime() - 60_000,
            scope: "https://www.googleapis.com/auth/business.manage",
          }),
        },
      );
      const realKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      try {
        const r = await syncProfile(db, conn, "America/New_York", now, net);
        assert.equal(r.ok, true, JSON.stringify(r));
      } finally {
        if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = realKey;
      }
      return seen.filter((u) => u.includes("/token")).length;
    };
    const onDuty = { status: "active", left_empty_at: null };
    assert.equal(
      await run({ tenant: onDuty, billing: { mode: "stripe", status: "active" } }),
      2,
      "on duty: it answers",
    );
    assert.equal(await run({ tenant: onDuty, billing: { mode: "direct", status: "none" } }), 2, "billed directly");
    for (const [why, world] of [
      ["paused", { tenant: { status: "paused", left_empty_at: null }, billing: { mode: "stripe", status: "active" } }],
      ["ended", { tenant: { status: "active", left_empty_at: "2026-09-01T00:00:00Z" }, billing: null }],
      ["its plan canceled", { tenant: onDuty, billing: { mode: "stripe", status: "canceled" } }],
      ["its plan paused at Stripe", { tenant: onDuty, billing: { mode: "stripe", status: "paused" } }],
    ]) {
      assert.equal(await run(world), 1, `${why}: the sync reads its reviews and answers none`);
    }
  }));

test("a sync gives a listing bound before 00415 the review link of the location it is bound to, through the injected transport", async () => {
  const s = await syncTheLink({ link: undefined, locations: boundLocation({ newReviewUri: REVIEW_LINK }) });
  assert.equal(s.r.ok, true, JSON.stringify(s.r));
  assert.equal(s.listing.new_review_uri, REVIEW_LINK, "its own location's link");
  assert.equal(s.asked.length, 1, "the bound location, read once");
  assert.ok(
    s.asked[0].startsWith("https://mybusinessbusinessinformation.googleapis.com/v1/locations/1?readMask="),
    "alone, by its name, through `net`: one call for an account of any size",
  );
  assert.deepEqual(s.written, [{ new_review_uri: REVIEW_LINK }], "the link alone is written");
  assert.equal(s.connection.sync_error, null);
  assert.deepEqual(s.events, []);
});

test("the link follows its location as a bind writes it: a new one replaces the old, and one the location no longer gives is cleared", async () => {
  const moved = await syncTheLink({
    link: "https://example.com/review/ada-before",
    locations: boundLocation({ newReviewUri: REVIEW_LINK }),
  });
  assert.equal(moved.r.ok, true, JSON.stringify(moved.r));
  assert.equal(moved.listing.new_review_uri, REVIEW_LINK, "Google's link now");

  const gone = await syncTheLink({ link: REVIEW_LINK, locations: boundLocation() });
  assert.equal(gone.r.ok, true, JSON.stringify(gone.r));
  assert.equal(gone.listing.new_review_uri, null, "the location gives none now, so the listing keeps none");
  assert.deepEqual(gone.written, [{ new_review_uri: null }]);
  assert.deepEqual(gone.events, []);
});

test("a listing that already keeps its location's link is not written again", async () => {
  for (const [why, link, meta] of [
    ["the same link", REVIEW_LINK, { newReviewUri: REVIEW_LINK }],
    ["none on either side", undefined, {}],
  ]) {
    const s = await syncTheLink({ link, locations: boundLocation(meta) });
    assert.equal(s.r.ok, true, `${why}: ${JSON.stringify(s.r)}`);
    assert.equal(s.asked.length, 1, `${why}: the location is read`);
    assert.deepEqual(s.written, [], `${why}: nothing differs, so nothing is written`);
    assert.deepEqual(s.events, [], why);
  }
});

test("a location read that fails, or answers another location, leaves the link as it is and the sync whole", async () => {
  const elsewhere = {
    status: 200,
    body: JSON.stringify({ name: "locations/2", title: "Ada's Uptown", metadata: { placeId: "p1" } }),
  };
  for (const [why, locations] of [
    ["Google refused the read", { status: 500, body: '{"error":{"message":"boom"}}' }],
    ["the location is no longer the owner's", { status: 404, body: '{"error":{"message":"not found"}}' }],
    ["Google answered another location", elsewhere],
    ["Google answered no location", { status: 200, body: "{}" }],
  ]) {
    for (const link of [REVIEW_LINK, undefined]) {
      const s = await syncTheLink({ link, locations });
      const what = `${why}, ${link ? "a link on file" : "none on file"}`;
      assert.equal(s.r.ok, true, `${what}: the reviews were synced (${JSON.stringify(s.r)})`);
      assert.equal(s.listing.new_review_uri, link, `${what}: the link is left as it is, never nulled`);
      assert.deepEqual(s.written, [], `${what}: nothing written`);
      assert.equal(s.connection.sync_error, null, `${what}: no sync_error`);
      assert.notEqual(s.connection.last_synced_at, "2026-09-11T00:00:00Z", `${what}: the sync is stamped`);
      assert.deepEqual(s.events, ["google_review_link_read_failed"], `${what}: logged`);
    }
  }
});

test("a link write that fails is logged, and the sync still answers ok with no sync_error", async () => {
  const s = await syncTheLink({
    link: undefined,
    locations: boundLocation({ newReviewUri: REVIEW_LINK }),
    faults: { "google_listings.update": { code: "42501", message: "permission denied for table google_listings" } },
  });
  assert.equal(s.r.ok, true, JSON.stringify(s.r));
  assert.equal(s.connection.sync_error, null);
  assert.equal(s.listing.new_review_uri, undefined, "nothing was kept");
  assert.deepEqual(s.events, ["google_review_link_write_failed"]);
});

test("the first sync after a bind reads no location again: the bind wrote the link from the read it had just made", async () => {
  const s = await syncTheLink({ link: REVIEW_LINK, synced: null, locations: boundLocation() });
  assert.equal(s.r.ok, true, JSON.stringify(s.r));
  assert.deepEqual(s.asked, [], "a connect reads the locations once, for the bind");
  assert.equal(s.listing.new_review_uri, REVIEW_LINK, "the bind's link stands");
  assert.deepEqual(s.written, []);
});

test("a sync whose reviews could not be read asks Google for no location", async () => {
  const s = await syncTheLink({
    link: undefined,
    locations: boundLocation({ newReviewUri: REVIEW_LINK }),
    reviews: { status: 500, body: '{"error":{"message":"boom"}}' },
  });
  assert.equal(s.r.ok, false);
  assert.deepEqual(s.asked, [], "the link is read only after the reviews were");
  assert.deepEqual(s.written, []);
});

test("the link is read last: a new review's bell and the google.reviews event are kept before Google is asked for the location, and a location read that fails holds neither", async () => {
  const s = await syncTheLink({
    link: undefined,
    locations: boundLocation({ newReviewUri: REVIEW_LINK }),
    reviews: A_NEW_REVIEW,
  });
  assert.equal(s.r.ok, true, JSON.stringify(s.r));
  assert.equal(s.r.fresh, 1);
  assert.deepEqual(
    s.kept,
    { bells: 1, events: 1 },
    "the bell and the event were kept before the location was asked for: a sweep killed on the link's read loses neither",
  );
  assert.equal(s.listing.new_review_uri, REVIEW_LINK, "and the link is kept after them");

  for (const [why, locations] of [
    ["Google refused the read", { status: 500, body: '{"error":{"message":"boom"}}' }],
    [
      "the read never answered",
      () => {
        throw new Error("The operation was aborted due to timeout");
      },
    ],
  ]) {
    const f = await syncTheLink({ link: undefined, locations, reviews: A_NEW_REVIEW });
    assert.equal(f.r.ok, true, `${why}: ${JSON.stringify(f.r)}`);
    assert.equal(f.bells, 1, `${why}: the new review rang`);
    assert.deepEqual(f.told, ["google.reviews"], `${why}: and was told`);
    assert.equal(f.connection.sync_error, null, why);
    assert.deepEqual(f.events, ["google_review_link_read_failed"], `${why}: logged`);
  }
});

test("a location Google gives no place on Maps clears nothing: the bind refuses it, so its link is never the listing's; Google's read succeeded, so it is logged as a lasting state, never as a read that failed", async () => {
  for (const link of [REVIEW_LINK, undefined]) {
    const s = await syncTheLink({ link, locations: boundLocation({ placeId: undefined }) });
    const what = link ? "a link on file" : "none on file";
    assert.equal(s.r.ok, true, `${what}: ${JSON.stringify(s.r)}`);
    assert.equal(s.listing.new_review_uri, link, `${what}: left as it is`);
    assert.deepEqual(s.written, [], `${what}: nothing written`);
    assert.equal(s.connection.sync_error, null, what);
    assert.deepEqual(s.events, ["google_review_link_not_its_place"], `${what}: logged`);
    assert.deepEqual(s.whys, ["the location has no place on Maps"], what);
  }
});

test("the bound location's link is written only onto the listing of its own place: a listing the public read linked to another place, or one re-bound while the sweep ran, keeps its own, logged as no listing of that place, never as a read that failed", async () => {
  // The public link (POST /api/v1/google/link) is not refused while a profile is connected, and writes no review link.
  for (const link of [undefined, "https://example.com/review/ada-elsewhere"]) {
    const s = await syncTheLink({ link, place: "p-public", locations: boundLocation({ newReviewUri: REVIEW_LINK }) });
    const what = `linked to another place, ${link ? "a link on file" : "none on file"}`;
    assert.equal(s.r.ok, true, `${what}: ${JSON.stringify(s.r)}`);
    assert.equal(s.listing.place_id, "p-public", what);
    assert.equal(s.listing.new_review_uri, link, `${what}: never the bound location's link`);
    assert.deepEqual(s.events, ["google_review_link_not_its_place"], `${what}: logged`);
    assert.deepEqual(s.whys, ["no listing of that place"], what);
  }

  // The owner chose another location (p2, its own link written by the bind) while this sweep held the old connection.
  const uptown = "https://example.com/review/ada-uptown";
  const raced = await syncTheLink({
    link: REVIEW_LINK,
    locations: boundLocation({ newReviewUri: "https://example.com/review/ada-downtown-now" }),
    meanwhile: (tables) => Object.assign(tables.google_listings[0], { place_id: "p2", new_review_uri: uptown }),
  });
  assert.equal(raced.r.ok, true, JSON.stringify(raced.r));
  assert.deepEqual(
    [raced.listing.place_id, raced.listing.new_review_uri],
    ["p2", uptown],
    "the re-bound listing keeps the link its bind wrote",
  );
  assert.deepEqual(raced.events, ["google_review_link_not_its_place"]);
});

test("a listing whose link cannot be read is left as it is, and the sync whole", async () => {
  const s = await syncTheLink({
    link: "https://example.com/review/ada-before",
    locations: boundLocation({ newReviewUri: REVIEW_LINK }),
    faults: { "google_listings.select": { code: "57014", message: "canceling statement due to statement timeout" } },
  });
  assert.equal(s.r.ok, true, JSON.stringify(s.r));
  assert.equal(s.listing.new_review_uri, "https://example.com/review/ada-before", "never written over unread");
  assert.deepEqual(s.written, []);
  assert.equal(s.connection.sync_error, null);
  assert.deepEqual(s.events, ["google_review_link_read_failed"]);
});

test("a token refreshed while the owner reconnected never writes the old grant back over the new one", () =>
  withOAuthEnv(async () => {
    const { tokenFor } = await import("../../../apps/edge/lib/shared/google/credentials.ts");
    const now = Date.parse("2026-09-12T00:00:00Z");
    const stale = { refresh_token: "rt-old", access_token: "stale", expires_at: now - 60_000, scope: "s" };
    const reconnected = { refresh_token: "rt-new", access_token: "at-new", expires_at: now + 3_600_000, scope: "s" };
    const refreshed = { status: 200, body: JSON.stringify({ access_token: "at-refreshed", expires_in: 3600 }) };

    // The owner reconnects while the refresh is at Google: the new grant is stored between the read and the write.
    const raced = vaultDoors(stale);
    const t = await tokenFor(raced.db, "t1", now, async () => {
      raced.vault.secret = reconnected;
      return refreshed;
    });
    assert.deepEqual(t, { ok: true, token: "at-new" }, "the reconnect's own token is answered");
    assert.deepEqual(
      raced.vault.secret,
      reconnected,
      "and the reconnect stands: the old refresh token is not written back",
    );
    assert.equal(raced.vault.writes.length, 0);

    // Nobody in between: the refresh is kept, under the refresh token it refreshed.
    const quiet = vaultDoors(stale);
    assert.deepEqual(await tokenFor(quiet.db, "t1", now, async () => refreshed), { ok: true, token: "at-refreshed" });
    assert.deepEqual(
      [quiet.vault.secret.refresh_token, quiet.vault.secret.access_token, quiet.vault.writes[0].p_if_refresh_token],
      ["rt-old", "at-refreshed", "rt-old"],
    );

    // A database before 00364 cannot compare: the refresh is written as it always was, and the profile keeps working.
    const older = vaultDoors(stale, { before00364: true });
    assert.deepEqual(await tokenFor(older.db, "t1", now, async () => refreshed), { ok: true, token: "at-refreshed" });
    assert.deepEqual(
      [older.vault.secret.access_token, "p_if_refresh_token" in older.vault.writes[0]],
      ["at-refreshed", false],
    );
  }));
