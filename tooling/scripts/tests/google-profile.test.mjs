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
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeUrl, tokenExchangeRequest, tokenRefreshRequest, revokeRequest, parseTokenResponse, grantHasScope, idTokenClaims, b64url,
  signState, verifyState, newNonce, PROFILE_SCOPES, STATE_TTL_MS,
  accountsRequest, locationsRequest, reviewsRequest, replyRequest, deleteReplyRequest, reviewParent, parseAccounts, parseLocations, parseReviewsPage, starRatingNumber,
  listReviews, replyToReview, cleanReply, GBP_LOCATIONS_READ_MASK, GBP_REVIEWS_PAGE, GBP_REVIEWS_MAX_PAGES, GBP_REPLY_MAX, PlacesError,
  planProfileSync, planListingCheck, reviewBells,
} from "@chanlytics/channels";
import { toGoogleVM, connectionWords, DECISION_VERBS, DECISION_SUBJECTS, EVENT_KINDS, setupSteps } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";
import { fakeDb } from "./_fake-db.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const CLIENT = { clientId: "123-abc.apps.googleusercontent.com", clientSecret: "not-a-secret", redirectUri: "https://chanlytics-os.vercel.app/api/v1/google/callback" };

/* ---------------------------------------------------------------- OAuth */

test("the way to Google asks for offline access with consent forced, the three scopes, the state, and nothing else", () => {
  const u = new URL(authorizeUrl(CLIENT, "st.ate", "owner@example.com"));
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("client_id"), CLIENT.clientId);
  assert.equal(u.searchParams.get("redirect_uri"), CLIENT.redirectUri);
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/business.manage");
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
  assert.equal(u.searchParams.get("include_granted_scopes"), "false", "no scope pollution from another grant");
  assert.equal(u.searchParams.get("state"), "st.ate");
  assert.equal(u.searchParams.get("login_hint"), "owner@example.com");
  assert.ok(!u.search.includes("secret"));
  assert.deepEqual([...PROFILE_SCOPES], ["openid", "email", "https://www.googleapis.com/auth/business.manage"]);
  assert.equal(STATE_TTL_MS, 600_000);
});

test("the token requests carry the documented form bodies; the answer is read and a refusal named", () => {
  const ex = tokenExchangeRequest(CLIENT, "4/code");
  assert.equal(ex.url, "https://oauth2.googleapis.com/token");
  assert.equal(ex.method, "POST");
  assert.equal(ex.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(ex.body, new URLSearchParams({ code: "4/code", client_id: CLIENT.clientId, client_secret: CLIENT.clientSecret, redirect_uri: CLIENT.redirectUri, grant_type: "authorization_code" }).toString());
  const rf = tokenRefreshRequest(CLIENT, "1//refresh");
  assert.equal(rf.body, new URLSearchParams({ refresh_token: "1//refresh", client_id: CLIENT.clientId, client_secret: CLIENT.clientSecret, grant_type: "refresh_token" }).toString());
  const rv = revokeRequest("1//refresh");
  assert.equal(rv.url, "https://oauth2.googleapis.com/revoke");
  assert.equal(rv.body, "token=1%2F%2Frefresh");
  const g = parseTokenResponse({ access_token: "ya29.x", refresh_token: "1//r", expires_in: 3599, scope: "openid https://www.googleapis.com/auth/business.manage", token_type: "Bearer", id_token: "h.p.s" });
  assert.deepEqual(g, { access_token: "ya29.x", refresh_token: "1//r", expires_in: 3599, scope: "openid https://www.googleapis.com/auth/business.manage", id_token: "h.p.s" });
  assert.equal(grantHasScope(g, "https://www.googleapis.com/auth/business.manage"), true);
  assert.equal(grantHasScope(g, "email"), false);
  assert.equal(parseTokenResponse({ access_token: "a" }).refresh_token, null, "a reconnect may come without one");
  assert.throws(() => parseTokenResponse({ error: "invalid_grant", error_description: "Bad Request" }), /invalid_grant: Bad Request/);
});

test("the id token's email is read from its payload, never trusted for access, and a broken one yields nothing", () => {
  const payload = b64url(JSON.stringify({ iss: "https://accounts.google.com", sub: "1234567890", email: "owner@example.com", email_verified: true }));
  assert.deepEqual(idTokenClaims(`eyJhbGciOiJSUzI1NiJ9.${payload}.sig`), { email: "owner@example.com", sub: "1234567890" });
  assert.deepEqual(idTokenClaims("garbage"), { email: null, sub: null });
  assert.deepEqual(idTokenClaims(null), { email: null, sub: null });
});

test("the state is signed with the dashboard's key and refused when forged, altered, expired or missing", async () => {
  const s = { t: "11111111-1111-4111-8111-111111111111", u: "22222222-2222-4222-8222-222222222222", n: newNonce(), exp: NOW + STATE_TTL_MS };
  const state = await signState("key-one", s);
  assert.match(state, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await verifyState("key-one", state, NOW), { ok: true, state: s });
  assert.deepEqual(await verifyState("key-two", state, NOW), { ok: false, reason: "signature" }, "another key");
  const [payload, sig] = state.split(".");
  const altered = `${b64url(JSON.stringify({ ...s, u: "33333333-3333-4333-8333-333333333333" }))}.${sig}`;
  assert.deepEqual(await verifyState("key-one", altered, NOW), { ok: false, reason: "signature" }, "another person under the same signature");
  assert.deepEqual(await verifyState("key-one", `${payload}.${sig}x`, NOW), { ok: false, reason: "signature" });
  assert.deepEqual(await verifyState("key-one", state, NOW + STATE_TTL_MS + 1), { ok: false, reason: "expired" });
  assert.deepEqual(await verifyState("key-one", "forged", NOW), { ok: false, reason: "malformed" });
  assert.deepEqual(await verifyState("key-one", "", NOW), { ok: false, reason: "missing" });
  assert.notEqual(newNonce(), newNonce());
});

/* -------------------------------------------------------- the three APIs */

test("accounts, locations and reviews are asked for at the documented endpoints with the documented parameters", () => {
  const a = accountsRequest("tok");
  assert.equal(a.url, "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20");
  assert.equal(a.headers.Authorization, "Bearer tok");
  const l = locationsRequest("tok", "accounts/123", "next");
  assert.equal(l.url, `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations?readMask=${encodeURIComponent(GBP_LOCATIONS_READ_MASK)}&pageSize=100&pageToken=next`);
  assert.equal(GBP_LOCATIONS_READ_MASK, "name,title,storefrontAddress,metadata");
  assert.equal(reviewParent("accounts/123", "locations/456"), "accounts/123/locations/456");
  const r = reviewsRequest("tok", "accounts/123/locations/456");
  assert.equal(r.url, `https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews?pageSize=${GBP_REVIEWS_PAGE}&orderBy=updateTime+desc`);
  assert.equal(r.headers["X-GOOG-API-FORMAT-VERSION"], "2", "v4 answers with its detailed errors");
  assert.equal(GBP_REVIEWS_PAGE, 50);
  assert.equal(GBP_REVIEWS_MAX_PAGES, 5);
  const p = replyRequest("tok", "accounts/123/locations/456/reviews/r1", "Thank you, Ana.");
  assert.equal(p.url, "https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews/r1/reply");
  assert.equal(p.method, "PUT");
  assert.deepEqual(JSON.parse(p.body), { comment: "Thank you, Ana." });
  const d = deleteReplyRequest("tok", "accounts/123/locations/456/reviews/r1");
  assert.equal(d.method, "DELETE");
  assert.equal(d.url, p.url);
});

test("the parsers read accounts, locations with their place on Maps, and reviews with their stars, their author and their reply", () => {
  const acc = parseAccounts({ accounts: [{ name: "accounts/123", accountName: "Northside Movers", type: "PERSONAL" }, { name: "nope" }], nextPageToken: "n" });
  assert.deepEqual(acc, { accounts: [{ name: "accounts/123", title: "Northside Movers", type: "PERSONAL" }], next: "n" });
  const loc = parseLocations({ locations: [
    { name: "locations/456", title: "Northside Movers", storefrontAddress: { regionCode: "US", locality: "Brooklyn", administrativeArea: "NY", postalCode: "11201", addressLines: ["1200 Harbor Blvd"] }, metadata: { placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", mapsUri: "https://maps.google.com/?cid=1", newReviewUri: "https://search.google.com/local/writereview?placeid=x" } },
    { name: "locations/789", title: "Warehouse", metadata: {} },
  ] });
  assert.equal(loc.locations.length, 2);
  assert.deepEqual(loc.locations[0], { name: "locations/456", title: "Northside Movers", address: "1200 Harbor Blvd, Brooklyn, NY 11201", place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4", maps_uri: "https://maps.google.com/?cid=1", new_review_uri: "https://search.google.com/local/writereview?placeid=x" });
  assert.equal(loc.locations[1].place_id, null, "not on Maps yet");
  assert.equal(loc.locations[1].address, null);
  const page = parseReviewsPage({
    reviews: [
      { name: "accounts/123/locations/456/reviews/r-ana", reviewId: "r-ana", reviewer: { displayName: "Ana P.", profilePhotoUrl: "https://lh3/x", isAnonymous: false }, starRating: "FIVE", comment: "Fast, careful, and on time.", createTime: "2026-09-07T13:00:00Z", updateTime: "2026-09-07T13:00:00Z", reviewReply: { comment: "Thank you!", updateTime: "2026-09-07T14:00:00Z" } },
      { name: "accounts/123/locations/456/reviews/r-anon", reviewId: "r-anon", reviewer: { displayName: "A Google user", isAnonymous: true }, starRating: "THREE", createTime: "2026-09-06T13:00:00Z", updateTime: "2026-09-06T13:00:00Z" },
    ],
    averageRating: 4.8, totalReviewCount: 213, nextPageToken: "p2",
  });
  assert.equal(page.reviews.length, 2);
  assert.deepEqual(page.reviews[0], { name: "accounts/123/locations/456/reviews/r-ana", review_id: "r-ana", rating: 5, author: "Ana P.", author_photo_uri: "https://lh3/x", anonymous: false, text: "Fast, careful, and on time.", created_at: "2026-09-07T13:00:00Z", updated_at: "2026-09-07T13:00:00Z", reply_text: "Thank you!", replied_at: "2026-09-07T14:00:00Z" });
  assert.equal(page.reviews[1].author, null, "an anonymous reviewer has no name");
  assert.equal(page.reviews[1].rating, 3);
  assert.equal(page.reviews[1].text, null, "a rating without words");
  assert.deepEqual([page.average_rating, page.total_count, page.next_page_token], [4.8, 213, "p2"]);
  assert.equal(starRatingNumber("FIVE"), 5);
  assert.equal(starRatingNumber("STAR_RATING_UNSPECIFIED"), null);
});

test("the review pages are followed up to the cap; a refusal is named; a reply's answer is read", async () => {
  const calls = [];
  const http = async (req) => {
    calls.push(req.url);
    const n = calls.length;
    return { status: 200, body: JSON.stringify({ reviews: [{ name: `accounts/1/locations/2/reviews/r${n}`, reviewId: `r${n}`, starRating: "FOUR", createTime: "2026-09-01T00:00:00Z" }], averageRating: 4.5, totalReviewCount: 9, ...(n < 3 ? { nextPageToken: `p${n + 1}` } : {}) }) };
  };
  const page = await listReviews(http, "tok", "accounts/1/locations/2", 5);
  assert.equal(page.reviews.length, 3);
  assert.equal(page.total_count, 9, "from the first page");
  assert.equal(page.next_page_token, null);
  assert.ok(calls[1].includes("pageToken=p2"));
  const capped = await listReviews(async (req) => http(req), "tok", "accounts/1/locations/2", 1);
  assert.equal(capped.reviews.length, 1);
  await assert.rejects(() => listReviews(async () => ({ status: 403, body: JSON.stringify({ error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } }) }), "tok", "accounts/1/locations/2"), (e) => e instanceof PlacesError && e.status === 403 && /PERMISSION_DENIED/.test(e.message));
  const replied = await replyToReview(async () => ({ status: 200, body: JSON.stringify({ comment: "Thank you", updateTime: "2026-09-07T15:00:00Z" }) }), "tok", "accounts/1/locations/2/reviews/r1", "Thank you");
  assert.deepEqual(replied, { reply_text: "Thank you", replied_at: "2026-09-07T15:00:00Z" });
  assert.equal(cleanReply("  Thank you,  \r\n Ana  "), "Thank you,\nAna");
  assert.equal(cleanReply("x".repeat(5000)).length, GBP_REPLY_MAX);
  assert.equal(cleanReply(42), "");
});

/* ----------------------------------------------------------- the planner */

const gbp = (over = {}) => ({ name: "accounts/1/locations/2/reviews/r-ana", review_id: "r-ana", rating: 5, author: "Ana P.", author_photo_uri: null, anonymous: false, text: "Fast, careful, and on time.", created_at: "2026-09-07T13:00:00Z", updated_at: "2026-09-07T13:00:00Z", reply_text: null, replied_at: null, ...over });
const page = (reviews, over = {}) => ({ reviews, average_rating: 4.8, total_count: 213, next_page_token: null, ...over });

test("the first sync is history: every review kept, the rating and the count taken, nothing announced", () => {
  const p = planProfileSync({ last_synced_at: null }, new Map(), page([gbp(), gbp({ review_id: "r-old", name: "accounts/1/locations/2/reviews/r-old", created_at: "2025-01-10T13:00:00Z" })]), "2026-09-07", NOW);
  assert.equal(p.reviews.length, 2);
  assert.deepEqual(p.fresh, []);
  assert.deepEqual(p.bells, []);
  assert.deepEqual(p.listing, { rating: 4.8, review_count: 213, checked_at: new Date(NOW).toISOString(), check_error: null });
  assert.deepEqual(p.day, { day: "2026-09-07", rating: 4.8, review_count: 213 });
  assert.equal(p.synced_at, new Date(NOW).toISOString());
});

test("after that, a review not on record and written since the last sync is news; a reply that appeared is noted, never announced", () => {
  const before = { last_synced_at: "2026-09-06T15:00:00Z" };
  const known = new Map([["r-old", { updated_at: "2025-01-10T13:00:00Z", reply_text: null }]]);
  const p = planProfileSync(before, known, page([gbp(), gbp({ review_id: "r-old", name: "accounts/1/locations/2/reviews/r-old", created_at: "2025-01-10T13:00:00Z", reply_text: "Thanks!", replied_at: "2026-09-07T10:00:00Z" })]), "2026-09-07", NOW);
  assert.deepEqual(p.fresh.map((r) => r.review_id), ["r-ana"]);
  assert.deepEqual(p.replied, ["r-old"], "answered on Google itself");
  assert.equal(p.bells.length, 1);
  assert.equal(p.bells[0].title, "New on Google: ★★★★★ from Ana P.");
  assert.equal(p.bells[0].body, "“Fast, careful, and on time.”\n4.8 ★ overall · 213 reviews.");
  const resurfaced = planProfileSync(before, new Map(), page([gbp({ review_id: "r-ancient", name: "x/reviews/r-ancient", created_at: "2024-01-10T13:00:00Z" })]), "2026-09-07", NOW);
  assert.deepEqual(resurfaced.fresh, [], "an old review first read now is not news");
  const noWords = planProfileSync(before, new Map(), page([gbp({ text: null, author: null, anonymous: true })]), "2026-09-07", NOW);
  assert.equal(noWords.bells[0].title, "New on Google: ★★★★★ from a customer");
  assert.match(noWords.bells[0].body, /^A rating without words\./);
  const many = planProfileSync(before, new Map(), page(["a", "b", "c", "d"].map((w) => gbp({ review_id: `r-${w}`, name: `x/reviews/r-${w}`, author: w.toUpperCase() }))), "2026-09-07", NOW);
  assert.equal(many.bells.length, 1);
  assert.equal(many.bells[0].title, "4 new reviews on Google");
  const noCounts = planProfileSync(before, new Map(), page([gbp()], { average_rating: null, total_count: null }), "2026-09-07", NOW);
  assert.equal(noCounts.listing, null, "no rating and no count means the listing keeps its own");
  assert.equal(noCounts.day, null);
  assert.deepEqual(reviewBells([], 0, { rating: 4.8, review_count: 213 }), []);
});

test("with the profile connected, the public read keeps the rating, the count and the day, and leaves the reviews to the profile", () => {
  const details = { place_id: "p", name: "Northside Movers", address: null, maps_uri: null, business_status: "OPERATIONAL", rating: 4.8, review_count: 214, reviews: [{ review_id: "pub-1", rating: 5, author: "Ana", author_uri: null, author_photo_uri: null, text: "Great", language_code: "en", published_at: "2026-09-07T13:00:00Z", maps_uri: null }] };
  const p = planListingCheck({ rating: 4.8, review_count: 213, checked_at: "2026-09-06T15:00:00Z" }, new Set(), details, "2026-09-07", NOW, { reviews: false });
  assert.deepEqual(p.reviews, []);
  assert.deepEqual(p.fresh, []);
  assert.deepEqual(p.bells, [], "the profile rings, the public read does not");
  assert.equal(p.counted, 1, "the count is still the count");
  assert.equal(p.listing.review_count, 214);
  assert.equal(p.day.review_count, 214);
});

/* ------------------------------------------------------ words and the VM */

const conn = (over = {}) => ({ google_email: "owner@example.com", account_title: "Northside Movers", location_name: "locations/456", location_title: "Northside Movers", connected_at: "2026-09-01T12:00:00Z", last_synced_at: "2026-09-07T12:00:00Z", sync_error: null, ...over });

test("the connection in words, and the view model that says replies are possible and where the reviews come from", () => {
  assert.equal(connectionWords(conn(), NOW), "Connected as owner@example.com · synced 3h ago");
  assert.equal(connectionWords(conn({ location_name: null }), NOW), "Connected as owner@example.com · choose the location to finish");
  assert.equal(connectionWords(conn({ sync_error: "PERMISSION_DENIED" }), NOW), "Connected as owner@example.com · could not sync since 3h ago — read again once a day");
  assert.equal(connectionWords(conn({ google_email: null, last_synced_at: null }), NOW), "Connected · not synced yet");
  const listing = { place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4", name: "Northside Movers", address: null, maps_uri: null, business_status: "OPERATIONAL", rating: 4.8, review_count: 213, linked_at: "2026-08-01T12:00:00Z", checked_at: "2026-09-07T12:00:00Z", check_error: null };
  const review = { id: "11111111-1111-4111-8111-111111111111", review_id: "r-ana", origin: "profile", rating: 5, author: "Ana P.", author_uri: null, author_photo_uri: null, body: "Fast.", language_code: null, published_at: "2026-09-07T13:00:00Z", reply_text: "Thank you!", replied_at: "2026-09-07T14:00:00Z", maps_uri: null, first_seen_at: "2026-09-07T14:00:00Z" };
  const vm = toGoogleVM({ ready: { places: true, profile: true }, listing, connection: conn(), reviews: [review], days: [], role: "owner" }, 30, NOW);
  assert.equal(vm.canReply, true);
  assert.equal(vm.source, "every review, from your Business Profile");
  assert.deepEqual(vm.connection, { email: "owner@example.com", location: "Northside Movers", words: "Connected as owner@example.com · synced 3h ago", pending: false, trouble: false });
  assert.equal(vm.latest[0].replied, true);
  assert.equal(vm.latest[0].replyText, "Thank you!");
  assert.equal(vm.latest[0].fromProfile, true);
  const pending = toGoogleVM({ ready: { places: true, profile: true }, listing, connection: conn({ location_name: null }), reviews: [], days: [], role: "owner" }, 30, NOW);
  assert.equal(pending.canReply, false);
  assert.equal(pending.connection.pending, true);
  const publicOnly = toGoogleVM({ ready: { places: true, profile: false }, listing, connection: null, reviews: [{ ...review, origin: "places", reply_text: null }], days: [], role: "owner" }, 30, NOW);
  assert.equal(publicOnly.canReply, false);
  assert.equal(publicOnly.source, "the one Google shows first");
  assert.equal(publicOnly.connection, null);
});

test("the ledger and the events know the reply and the connection", () => {
  assert.ok(DECISION_VERBS.includes("reply_review") && DECISION_SUBJECTS.includes("review"));
  for (const k of ["google.connected", "google.disconnected", "google.replied"]) assert.ok(EVENT_KINDS.includes(k), k);
  const vm = setupSteps({
    business: { name: "N", hours: true, services: 1, bookingLink: false, address: true, handoff: null, broken: false },
    channels: { whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null }, voice: { present: false, active: false, number: null, lastInboundAt: null } },
    templates: { approved: 0, pending: 0, startersApproved: 0 }, calendar: { state: "none" }, team: { members: 1, invitesOpen: 0, alertEmails: 0 }, consent: { yes: 0 }, requests: { line: null }, later: [],
    google: { ready: true, places: false, listing: null },
  }, NOW);
  assert.deepEqual(vm.rows.find((r) => r.id === "google").verb, { label: "Connect", to: "admin/integrations" }, "only the profile door open: the listing arrives with the connection");
});

/* ------------------------------------------------------------- the wiring */

test("the migration: the connection row, the three Vault doors for the service role alone, realtime, the ledger's new subject and verb", () => {
  const sql = readRaw("supabase/migrations/00070_google_profile.sql");
  assert.ok(sql.includes("create table public.google_connections (") && sql.includes("tenant_id        uuid primary key references public.tenants (id) on delete cascade"));
  assert.ok(sql.includes("location_name    text check (location_name is null or location_name like 'locations/%')"), "a connection may wait for its location");
  assert.ok(sql.includes("create policy google_connections_member_select on public.google_connections") && !sql.includes("for insert") && !sql.includes("for update"), "members read; the edge writes");
  for (const fn of ["put_google_credentials(uuid, jsonb)", "get_google_credentials(uuid)", "drop_google_credentials(uuid)"]) {
    assert.ok(sql.includes(`revoke execute on function public.${fn} from public, anon, authenticated;`), fn);
  }
  assert.ok(sql.includes("'google-creds-' || p_tenant_id::text") && sql.includes("delete from vault.secrets where id = v_id;"), "the token is forgotten on disconnect");
  assert.ok(sql.includes("alter publication supabase_realtime add table public.google_connections;"));
  assert.ok(sql.includes("'start_playbook', 'pause_playbook', 'reply_review'") && sql.includes("'channel', 'broadcast', 'playbook', 'review'"));
});

test("the edge: the secret alone on the edge, a read before a row, the grant given back on every refusal, the profile's reviews replacing the public five", () => {
  const lib = readCode("apps/edge/lib/google.ts");
  for (const v of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"]) assert.ok(lib.includes(`env.${v}`), v);
  assert.ok(lib.includes('db.rpc("put_google_credentials"') && lib.includes('db.rpc("get_google_credentials"') && lib.includes('db.rpc("drop_google_credentials"'), "secrets through the vault doors");
  assert.equal((lib.match(/await (?:http|net)\(revokeRequest\(/g) ?? []).length, 7, "a grant that cannot be kept is given back: no scope, no refresh token, accounts unreadable, no locations, none on Maps, credentials unsaved, and disconnect — the first six are RUN below, `net` being connectProfile's injected transport");
  assert.ok(lib.includes('return { ok: false, error: "scope_missing" };') && lib.includes('return { ok: false, error: "no_refresh_token" };') && lib.includes('return { ok: false, error: "not_on_maps" };'));
  assert.ok(lib.includes('.eq("origin", "places");'), "the public five make way for the profile");
  assert.ok(lib.includes("{ reviews: carriesReviews }"), "with the profile connected the public read keeps only the numbers");
  assert.ok(lib.includes("creds.expires_at - TOKEN_SLACK_MS > now"), "a token is refreshed before it expires");
  // The door's profile half -- connect, locations, choose (proven against
  // Google's list), disconnect, reply, and unlink disconnecting first -- runs
  // in google-door.test.mjs.
  // The sweep's half -- connected profiles due are synced, forty a tick, a
  // rejected credential written on the row -- runs in cron-doors-b.test.mjs.
  const env = readRaw("apps/edge/.env.example");
  for (const v of ["GOOGLE_OAUTH_CLIENT_ID=", "GOOGLE_OAUTH_CLIENT_SECRET=", "GOOGLE_OAUTH_REDIRECT_URI="]) assert.ok(env.includes(v), v);
  assert.ok(env.includes("https://app.chanlytics.com/api/v1/google/callback"), "the redirect URI is written where the operator sets it");
});

test("the dashboard: the way there is signed, the way back is proven before anything is trusted, and a reply is a ledger entry", () => {
  const connect = readCode("apps/dashboard/app/api/v1/google/connect/route.ts");
  assert.ok(connect.includes('role: "owner",') && connect.includes("signState(secret, { t: member.tenantId, u: ctx.userId, n: newNonce(), exp: Date.now() + STATE_TTL_MS })"));
  assert.ok(connect.includes("new Response(null, { status: 302, headers: { location: url } })"));
  const cb = readCode("apps/dashboard/app/api/v1/google/callback/route.ts");
  assert.ok(cb.indexOf("verifyState(secret, url.searchParams.get(\"state\"), Date.now())") < cb.indexOf('op: "connect"'), "the state before the code");
  assert.ok(cb.includes('if (proof.state.u !== ctx.userId) return back("error", "someone_else");'), "the person who started it");
  assert.ok(cb.includes('if (member.role !== "owner") return back("error", "not_owner");'));
  assert.ok(!cb.includes("client_secret"), "the dashboard never sees the secret");
  const server = readCode("apps/dashboard/src/server/google.ts");
  assert.ok(server.includes("return process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.DIAG_KEY || null;"), "the state's key is the one the dashboard already shares with the edge");
  assert.ok(server.includes('export const CONNECTION_COLUMNS = "google_email, account_title, location_name, location_title, connected_at, last_synced_at, sync_error";'), "never credentials_ref");
  const reply = readCode("apps/dashboard/app/api/v1/google/reviews/[id]/reply/route.ts");
  assert.ok(reply.includes('role: "operator",') && reply.includes('rate: "google_reply",'));
  assert.ok(reply.includes('recordDecision(ctx, member.tenantId, "review", id, "reply_review", { comment, replied_at: repliedAt })'));
  const locations = readCode("apps/dashboard/app/api/v1/google/locations/route.ts");
  assert.equal((locations.match(/role: "owner",/g) ?? []).length, 2);
  const connection = readCode("apps/dashboard/app/api/v1/google/connection/route.ts");
  assert.ok(connection.includes("export const DELETE") && connection.includes('op: "disconnect"'));
  const rate = readCode("apps/dashboard/src/server/rate-limit.ts");
  assert.ok(rate.includes("google_reply: {"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/google.ts");
  assert.ok(bridge.includes('win.location.assign(api().url("GET google/connect"));') && bridge.includes("outcomeWords: CONNECT_OUTCOME_WORDS"));
  const card = readCode("apps/dashboard/src/legacy/pages/integrations-real.jsx");
  for (const t of ["google-choose", "google-place-choose", "google-note"]) assert.ok(card.includes(`data-testid="${t}"`), t);
  assert.ok(card.includes('testid="google-disconnect"'), "the disconnect asks through the one Confirm");
  for (const v of ["google-connect", "google-disconnect"]) assert.ok(card.includes(`"verb:${v}": "${v}"`), `${v} keeps its name as a row verb`);
  const reports = readCode("apps/dashboard/src/legacy/pages/reports.jsx");
  assert.ok(reports.includes("vm.canReply && operator && r.fromProfile") && reports.includes('data-testid="google-reply-send"'));
  assert.ok(reports.includes("maxLength={4096}"));
});

/* ---- connecting: what a failed vault write must NOT destroy ---- */

const grantBody = (sub, email) => JSON.stringify({
  access_token: "at-1",
  refresh_token: "rt-new",
  expires_in: 3600,
  scope: "https://www.googleapis.com/auth/business.manage",
  id_token: `x.${Buffer.from(JSON.stringify({ sub, email })).toString("base64url")}.y`,
});

/** Google, as far as connectProfile can tell: a grant, two accounts' worth of locations, and a revoke that answers. */
function fakeGoogle(sub = "sub-1", email = "ada@example.com") {
  const calls = [];
  const net = async (req) => {
    calls.push(req.url);
    if (req.url.includes("/token")) return { status: 200, body: grantBody(sub, email) };
    if (req.url.includes("/revoke")) return { status: 200, body: "" };
    if (req.url.includes("/accounts") && !req.url.includes("/locations")) {
      return { status: 200, body: JSON.stringify({ accounts: [{ name: "accounts/1", accountName: "Ada's" }] }) };
    }
    // Two locations on Maps, so the connection stays pending and nothing binds.
    return { status: 200, body: JSON.stringify({ locations: [
      { name: "locations/1", title: "Ada's Downtown", metadata: { placeId: "p1" } },
      { name: "locations/2", title: "Ada's Uptown", metadata: { placeId: "p2" } },
    ] }) };
  };
  return { net, calls, revoked: () => calls.filter((u) => u.includes("/revoke")).length };
}

const OAUTH_ENV = {
  GOOGLE_OAUTH_CLIENT_ID: "cid",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://app.example.com/cb",
};
async function withOAuthEnv(fn) {
  const saved = {};
  for (const [k, v] of Object.entries(OAUTH_ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

const connected = (over = {}) => ({
  tenant_id: "t1", google_email: "ada@example.com", google_sub: "sub-1",
  account_name: "accounts/1", account_title: "Ada's",
  location_name: "locations/1", location_title: "Ada's Downtown",
  scopes: ["https://www.googleapis.com/auth/business.manage"],
  connected_by: "u1", connected_at: "2026-01-01T00:00:00Z",
  last_synced_at: "2026-09-01T00:00:00Z", sync_error: null, ...over,
});

test("a re-connect whose vault write fails puts the working connection back, instead of deleting it", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google.ts");
    // A workspace already connected and syncing. The upsert below writes
    // `location_name: null` over it before the credentials are stored, so a
    // rollback that DELETED the row -- as this used to -- cost a workspace its
    // profile entirely because a re-authorisation could not reach the vault.
    const tables = { google_connections: [connected()] };
    const g = fakeGoogle("sub-1");
    const db = fakeDb(tables, {}, { put_google_credentials: () => { throw new Error("vault unreachable"); } });

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
    const { connectProfile } = await import("../../../apps/edge/lib/google.ts");
    const tables = { google_connections: [] };
    const g = fakeGoogle("sub-9");
    const db = fakeDb(tables, {}, { put_google_credentials: () => { throw new Error("vault unreachable"); } });

    const r = await connectProfile(db, "t1", "u1", "code", "America/New_York", new Date("2026-09-12T00:00:00Z"), g.net);
    assert.equal(r.ok, false);
    assert.equal(tables.google_connections.length, 0, "a row with no token behind it is a lie: it goes");
    assert.equal(g.revoked(), 1, "and nothing of ours depends on the grant, so it is handed back");
  }));

test("re-connecting a DIFFERENT Google account still hands its grant back", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google.ts");
    const tables = { google_connections: [connected({ google_sub: "sub-1" })] };
    const g = fakeGoogle("sub-2", "bo@example.com");
    const db = fakeDb(tables, {}, { put_google_credentials: () => { throw new Error("vault unreachable"); } });

    await connectProfile(db, "t1", "u1", "code", "America/New_York", new Date("2026-09-12T00:00:00Z"), g.net);
    assert.equal(tables.google_connections[0].google_sub, "sub-1", "the account that was working is restored");
    assert.equal(g.revoked(), 1, "the OTHER account's grant shares nothing with it, so it is revoked");
  }));

test("a connect that reaches the vault leaves the workspace pending on its choice of location", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google.ts");
    const tables = { google_connections: [] };
    const g = fakeGoogle();
    const kept = [];
    const db = fakeDb(tables, {}, { put_google_credentials: (a) => { kept.push(a); return null; } });

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
    const { connectProfile } = await import("../../../apps/edge/lib/google.ts");
    // Each refusal, driven through the injected transport. A grant we cannot
    // keep and do not give back is a workspace's Google account left
    // authorised to an app that has no record of it.
    const cases = [
      { why: "exchange_failed", revokes: 0, at: (u) => (u.includes("/token") ? { status: 400, body: JSON.stringify({ error: "invalid_grant" }) } : null) },
      { why: "scope_missing", revokes: 1, at: (u) => (u.includes("/token") ? { status: 200, body: JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "openid email" }) } : null) },
      { why: "no_refresh_token", revokes: 1, at: (u) => (u.includes("/token") ? { status: 200, body: JSON.stringify({ access_token: "at", expires_in: 3600, scope: "https://www.googleapis.com/auth/business.manage" }) } : null) },
      { why: "accounts_unreadable", revokes: 1, at: (u) => (u.includes("/accounts") && !u.includes("/locations") ? { status: 500, body: "boom" } : null) },
      { why: "no_locations", revokes: 1, at: (u) => (u.includes("/locations") ? { status: 200, body: JSON.stringify({ locations: [] }) } : null) },
      { why: "not_on_maps", revokes: 1, at: (u) => (u.includes("/locations") ? { status: 200, body: JSON.stringify({ locations: [{ name: "locations/1", title: "No Maps listing" }] }) } : null) },
    ];
    for (const c of cases) {
      const g = fakeGoogle();
      const net = async (req) => c.at(req.url) ?? g.net(req);
      const tables = { google_connections: [] };
      const r = await connectProfile(fakeDb(tables, {}, { put_google_credentials: () => null }), "t1", "u1", "code", "America/New_York", new Date("2026-09-12T00:00:00Z"), net);
      assert.equal(r.ok, false, c.why);
      assert.equal(r.error, c.why);
      assert.equal(tables.google_connections.length, 0, `${c.why}: no half-made connection left behind`);
      assert.equal(g.revoked(), c.revokes, `${c.why}: the grant is given back`);
    }
  }));

test("a workspace with ONE location on Maps is bound and synced through the injected transport, not round it", () =>
  withOAuthEnv(async () => {
    const { connectProfile } = await import("../../../apps/edge/lib/google.ts");
    // This is the branch the transport had to be threaded all the way down
    // for: connect -> bindLocation -> syncProfile -> tokenFor. A `net` that
    // covered only the outer calls left this path talking to the real Google
    // from inside a test, which is why every other case here returns two
    // locations to stay on the pending branch.
    const seen = [];
    const net = async (req) => {
      seen.push(req.url);
      if (req.url.includes("/token")) return { status: 200, body: grantBody("sub-1", "ada@example.com") };
      if (req.url.includes("/accounts") && !req.url.includes("/locations")) return { status: 200, body: JSON.stringify({ accounts: [{ name: "accounts/1", accountName: "Ada's" }] }) };
      if (req.url.includes("/locations") && !req.url.includes("/reviews")) {
        return { status: 200, body: JSON.stringify({ locations: [{ name: "locations/1", title: "Ada's", metadata: { placeId: "p1", mapsUri: "https://maps/p1" } }] }) };
      }
      if (req.url.includes("/reviews")) return { status: 200, body: JSON.stringify({ reviews: [], averageRating: 4.5, totalReviewCount: 2 }) };
      throw new Error(`unexpected call: ${req.url}`);
    };
    const tables = { google_connections: [], google_listings: [], google_reviews: [], google_listing_days: [] };
    const vault = { refresh_token: "rt-new", access_token: "at-1", expires_at: Date.now() + 3_600_000, scope: "https://www.googleapis.com/auth/business.manage" };
    const db = fakeDb(tables, {}, {
      put_google_credentials: () => null,
      get_google_credentials: () => vault,
    });

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
    assert.ok(seen.some((u) => u.includes("/reviews")), "the first sync ran through the same transport, not round it");
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
    const { syncProfile } = await import("../../../apps/edge/lib/google.ts");
    const now = new Date("2026-09-12T00:00:00Z");
    const seen = [];
    const net = async (req) => {
      seen.push(req.url);
      if (req.url.includes("/token")) return { status: 200, body: grantBody("sub-1", "ada@example.com") };
      if (req.url.includes("/reviews")) return { status: 200, body: JSON.stringify({ reviews: [], averageRating: 4.5, totalReviewCount: 2 }) };
      throw new Error(`unexpected call: ${req.url}`);
    };
    const conn = connected({ last_synced_at: "2026-09-11T00:00:00Z", connected_at: "2026-08-01T00:00:00Z" });
    const tables = {
      google_connections: [conn],
      google_listings: [{ tenant_id: "t1", place_id: "p1" }],
      google_listing_days: [],
      // On record, from the profile, unanswered, and published since the
      // workspace connected: exactly what the auto mode picks up.
      google_reviews: [{ id: "r1", tenant_id: "t1", review_id: "rv-1", origin: "profile", rating: 5, author: "Bo", body: "lovely", published_at: "2026-09-10T00:00:00Z", reply_text: null }],
      policies: [{ id: "pol", tenant_id: "t1", class: "reviews", mode: "auto", subject_type: null, subject_id: null, limits: {}, updated_at: "2026-09-01T00:00:00Z" }],
    };
    const db = fakeDb(tables, {}, {
      put_google_credentials: () => null,
      // EXPIRED, so the auto-reply's own tokenFor must refresh — which is the
      // call that proves whose transport it is using.
      get_google_credentials: () => ({ refresh_token: "rt", access_token: "stale", expires_at: now.getTime() - 60_000, scope: "https://www.googleapis.com/auth/business.manage" }),
    });

    const realKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY; // the draft bails as no_model_key; no model is ever called
    try {
      const r = await syncProfile(db, conn, "America/New_York", now, net);
      assert.equal(r.ok, true, JSON.stringify(r));
    } finally {
      if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = realKey;
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
    assert.equal(seen.filter((u) => u.includes("/token")).length, 2, "the auto-reply refreshed its token through the injected transport");
    assert.equal(tables.google_reviews[0].reply_text, null, "and nothing was posted: no model key, so the draft never happened");
  }));
