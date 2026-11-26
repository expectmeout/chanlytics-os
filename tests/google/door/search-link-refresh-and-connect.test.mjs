/**
 * Google's door: search, the workspace, link, refresh of the listing, and connect.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLACES_SEARCH_MASK, PLACES_DETAILS_MASK, PLACES_SEARCH_LIMIT } from "@chanlytics/channels/google";
import { localDate, reviewRoute } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import {
  A,
  ACCOUNTS_URL,
  B,
  DAY,
  DETAILS_URL,
  GBP_OLD,
  GBP_REVIEW,
  GHOST,
  GRANT,
  HOUR,
  KEY,
  LOC,
  LOC2,
  LOCATIONS_URL,
  NO_FACTS,
  OFF_MAPS,
  PLACE,
  PLACE2,
  PLACES_SEARCH,
  PLACE_URL,
  R1,
  REVIEWS_URL,
  REVOKE_URL,
  SCOPE,
  TOKEN_URL,
  TZ,
  U,
  ago,
  answer,
  form,
  google,
  keyed,
  knock,
  listingRow,
  place,
  publicReview,
  refusal,
  reviewRow,
  setPg,
  silent,
  token,
  use,
  wired,
  withEnv,
  world,
  writes,
} from "./_door.mjs";

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

  const few = [
    400,
    { ok: false, error: "bad_request", detail: "query must be a few words: the business name and where it is" },
  ];
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
    [
      502,
      {
        ok: false,
        error: "google_refused",
        detail: "PERMISSION_DENIED: Places API (New) has not been used in project 1 before",
      },
    ],
    "Google's refusal in Google's words, never a throw",
  );
  assert.equal(refused.calls.length, 1);
  assert.equal(db.seen.length, 0);
});

/* ------------------------------ the workspace ----------------------------- */

test("past status and search every op needs a database and a workspace on record: no database is a 503, no id or a bad one a 400, an unknown workspace a 404, a workspace that cannot be read a 503 in the database's words; an unknown op is named back with the twelve", async () => {
  setPg(null);
  const net = silent();
  assert.deepEqual(await answer(await knock({ op: "refresh" })), [503, { ok: false, error: "no_database" }]);
  const { db } = use(world());
  await keyed(async () => {
    assert.deepEqual(
      await answer(await knock({ op: "refresh" }, { "x-diag-key": KEY })),
      [400, { ok: false, error: "bad_tenant", detail: "tenant_id (a workspace id) is required" }],
      "a key holder is about no workspace: the body must name one",
    );
    assert.deepEqual(
      await answer(await knock({ op: "refresh", tenant_id: "harbor-moving" }, { "x-diag-key": KEY })),
      [400, { ok: false, error: "bad_request" }],
      "and name it by id: refused at the door's schema",
    );
  });
  assert.equal(db.seen.length, 0, "refused before the workspace is read");
  assert.deepEqual(await answer(await knock({ op: "refresh" }, { "x-edge-token": token({ workspace: GHOST }) })), [
    404,
    { ok: false, error: "not_found", detail: "no such workspace" },
  ]);
  // And the held reply's stop (decision 0064, step 6): twelve.
  const list =
    "op must be status, search, link, unlink, refresh, connect, locations, choose, disconnect, reply, draft, hold, post or unpost";
  assert.deepEqual(await answer(await knock({ op: "dance" })), [400, { ok: false, error: "unknown_op", detail: list }]);
  const noOp = [400, { ok: false, error: "bad_request" }]; // the door's schema
  for (const body of [{}, "not json"]) assert.deepEqual(await answer(await knock(body)), noOp);
  use(world(), new Map(), { "tenants.select": { message: "permission denied for table tenants" } });
  assert.deepEqual(await answer(await knock({ op: "refresh" })), [
    503,
    { ok: false, error: "read_failed", detail: "Could not read that just now. Try again in a moment." },
  ]);
  assert.equal(net.calls.length, 0, "Google heard none of it");
});

/* ----------------------------------- link --------------------------------- */

test("link: the place is read BEFORE any row is written -- a wrong id is a 502 and leaves the listing on record alone -- then the listing is kept for the workspace, the old place's reviews and days forgotten, the new one read at once as history, and the ledger says who linked what", async () => {
  const tables = world({
    google_listings: [
      listingRow({
        place_id: PLACE2,
        name: "Harbor Moving Warehouse",
        new_review_uri: "https://example.com/review/harbor-moving-warehouse",
      }),
    ],
    google_reviews: [reviewRow(R1, { origin: "places", review_id: "p-old", body: "about the warehouse" })],
    google_listing_days: [{ tenant_id: A, day: "2026-09-01", rating: 4.5, review_count: 10 }],
    jobs: [],
  });
  const { db } = use(tables);
  // Google alone: the listing's website is read by the job the link asks for, never inside the link's request.
  const net = wired((req) => {
    const u = req.url.split("?")[0];
    if (u === PLACE_URL("ChIJ-does-not-exist-00")) return refusal(404, "Not found", "NOT_FOUND");
    if (u === PLACE_URL(PLACE)) return { status: 200, body: place(PLACE, { reviews: [publicReview("r-rosa")] }) };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const today = localDate(TZ, new Date());
  const t0 = Date.now();

  assert.deepEqual(await answer(await knock({ op: "link", place_id: "short" })), [
    400,
    { ok: false, error: "bad_request", detail: "place_id is required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "link" })), [
    400,
    { ok: false, error: "bad_request", detail: "place_id is required" },
  ]);
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
    ],
    "read once to prove the id and once more to read the listing; its website is not read inside the link",
  );
  assert.ok(
    net.calls.every(
      (c) =>
        c.headers["X-Goog-Api-Key"] === "places-key-for-this-file" &&
        c.headers["X-Goog-FieldMask"] === PLACES_DETAILS_MASK,
    ),
    "the key in a header; the details mask, reviews included",
  );
  assert.deepEqual(
    tables.jobs.map((j) => [j.kind, j.payload.url]),
    [["website_read", "https://harbormoving.example/"]],
    "the website read asked for, by a job: what Check offers, and where it says its customers book (website-read.ts)",
  );
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
  assert.equal(
    row.new_review_uri,
    null,
    "the warehouse's review link is not the new place's, and the public read gives none (00415)",
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
    google_listings: [listingRow()],
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
  const firstSeen = tables.google_reviews[0].first_seen_at;
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
  assert.deepEqual(
    tables.google_reviews.map((r) => [r.review_id, r.origin, r.author]).sort(),
    [
      ["r-old", "places", "Ana"],
      ["r-rosa", "places", "Rosa"],
    ],
    "every review Google shows is on record",
  );
  const old = tables.google_reviews.find((r) => r.review_id === "r-old");
  assert.deepEqual(
    [old.id, old.first_seen_at],
    [R1, firstSeen],
    "the one already there keeps its row, and its first_seen_at: the write never names it (pinned as reviews.ts's text in google.test.mjs until 26 Nov 2026)",
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
  // The notice is about the review's ROW and opens that review with its reply box (contracts reviewRoute), not about Google's own
  // id for it, which no page, door or ledger line names it by.
  const rosa = tables.google_reviews.find((r) => r.review_id === "r-rosa");
  assert.deepEqual(
    [bell.tenant_id, bell.kind, bell.route, bell.subject_type, bell.subject_id],
    [A, "review", reviewRoute(rosa.id), "review", rosa.id],
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

  assert.deepEqual(await answer(await knock({ op: "connect" })), [
    400,
    { ok: false, error: "bad_request", detail: "code is required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "connect", code: "x".repeat(2001) })), [
    400,
    { ok: false, error: "bad_request", detail: "code is required" },
  ]);
  assert.equal(net.calls.length, 0);

  const stdout = [];
  const realConsole = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ["log", "warn", "error"]) console[level] = (...args) => stdout.push(String(args[0]));
  let status;
  let body;
  try {
    [status, body] = await answer(await knock({ op: "connect", code: "4/the-code", user_id: U }));
  } finally {
    Object.assign(console, realConsole);
  }
  // The line says what happened, not who it happened to: the account's domain, never the owner's address.
  const connected = stdout.map((l) => JSON.parse(l)).find((l) => l.event === "google_connected");
  assert.equal(connected?.email_domain, "example.com");
  assert.ok(!stdout.join(" ").includes("owner@example.com"), "the owner's address is in no line the connect wrote");
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
  assert.equal(
    tables.google_connections.find((c) => c.tenant_id === A).reviews_complete,
    true,
    "Google's list of the location's reviews ended on that first pass: the record is every review",
  );

  assert.deepEqual(
    net.asked(),
    [
      ["POST", TOKEN_URL],
      ["GET", ACCOUNTS_URL],
      ["GET", LOCATIONS_URL("accounts/111")],
      ["GET", REVIEWS_URL("accounts/111", "222")],
      ["GET", DETAILS_URL("222")],
    ],
    "the code traded, then whose accounts, which locations, every review of the one location and its details -- no refresh: the token just granted is still good",
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
  assert.deepEqual(
    vault.reads,
    [A, A],
    "the sync read it back, then the details read (decision 0073, R17), and each found it still good",
  );

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
  assert.equal(
    listing.new_review_uri,
    LOC.metadata.newReviewUri,
    "and the location's review link (00415), which a message's review_link slot is filled from",
  );
  assert.deepEqual(
    listing.facts,
    { ...NO_FACTS, phone_e164: "+17185550142", website: "https://harbormoving.example" },
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
    { ok: false, error: "bad_request", detail: "account_name and location_name are required" },
  ]);
  assert.deepEqual(await answer(await knock({ op: "choose", account_name: "accounts/111", location_name: "222" })), [
    400,
    { ok: false, error: "bad_request", detail: "account_name and location_name are required" },
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
    net.asked().slice(-4),
    [
      ["GET", ACCOUNTS_URL],
      ["GET", LOCATIONS_URL("accounts/111")],
      ["GET", REVIEWS_URL("accounts/111", "333")],
      ["GET", DETAILS_URL("333")],
    ],
    "the list read again to prove the choice, then the chosen location's reviews and its details",
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
      listing.new_review_uri,
    ],
    [1, A, PLACE2, "Harbor Moving Warehouse", U, NO_FACTS, null],
    "the chosen location's place on Maps becomes the listing, with the review link it has: none",
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
      detail: "Could not save that just now. Try again in a moment.",
    },
  ]);
  assert.deepEqual(tables.google_connections, [], "without the token the row is a lie: removed");
  assert.deepEqual(net.asked().at(-1), ["POST", REVOKE_URL], "and the grant given back");
  assert.equal(form(net.calls.at(-1)).get("token"), "rt-1");
  assert.deepEqual(tables.events, [], "not connected: nothing on the ledger");
});
