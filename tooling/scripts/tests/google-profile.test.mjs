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
  assert.equal(connectionWords(conn({ sync_error: "PERMISSION_DENIED" }), NOW), "Connected as owner@example.com · could not sync since 3h ago — tried again every hour");
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
  for (const v of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"]) assert.ok(lib.includes(`process.env.${v}`), v);
  assert.ok(lib.includes('db.rpc("put_google_credentials"') && lib.includes('db.rpc("get_google_credentials"') && lib.includes('db.rpc("drop_google_credentials"'), "secrets through the vault doors");
  assert.equal((lib.match(/await http\(revokeRequest\(/g) ?? []).length, 7, "a grant that cannot be kept is given back: no scope, no refresh token, accounts unreadable, no locations, none on Maps, credentials unsaved, and disconnect");
  assert.ok(lib.includes('return { ok: false, error: "scope_missing" };') && lib.includes('return { ok: false, error: "no_refresh_token" };') && lib.includes('return { ok: false, error: "not_on_maps" };'));
  assert.ok(lib.includes('.eq("origin", "places");'), "the public five make way for the profile");
  assert.ok(lib.includes("{ reviews: carriesReviews }"), "with the profile connected the public read keeps only the numbers");
  assert.ok(lib.includes("creds.expires_at - TOKEN_SLACK_MS > now"), "a token is refreshed before it expires");
  const admin = readCode("apps/edge/api/admin/google.ts");
  for (const op of ['op === "connect"', 'op === "locations"', 'op === "choose"', 'op === "disconnect"', 'op === "reply"']) assert.ok(admin.includes(op), op);
  assert.ok(admin.includes("const loc = r.locations.find((l) => l.account_name === accountName && l.name === locationName);"), "a choice is proven against Google's list");
  assert.ok(admin.includes("if (conn.data) await disconnectProfile(db, tenantId);"), "unlinking the listing disconnects the profile first");
  const cron = readCode("apps/edge/api/cron/google.ts");
  assert.ok(cron.includes("connectionsDue(db, now, MAX_PER_TICK)") && cron.includes("syncProfile(db, conn,"));
  const env = readRaw("apps/edge/.env.example");
  for (const v of ["GOOGLE_OAUTH_CLIENT_ID=", "GOOGLE_OAUTH_CLIENT_SECRET=", "GOOGLE_OAUTH_REDIRECT_URI="]) assert.ok(env.includes(v), v);
  assert.ok(env.includes("https://chanlytics-os.vercel.app/api/v1/google/callback"), "the redirect URI is written where the operator sets it");
});

test("the dashboard: the way there is signed, the way back is proven before anything is trusted, and a reply is a ledger entry", () => {
  const connect = readCode("apps/dashboard/app/api/v1/google/connect/route.ts");
  assert.ok(connect.includes('requireRole(member, "owner")') && connect.includes("signState(secret, { t: member.tenantId, u: ctx.userId, n: newNonce(), exp: Date.now() + STATE_TTL_MS })"));
  assert.ok(connect.includes("new Response(null, { status: 302, headers: { location: url } })"));
  const cb = readCode("apps/dashboard/app/api/v1/google/callback/route.ts");
  assert.ok(cb.indexOf("verifyState(secret, url.searchParams.get(\"state\"), Date.now())") < cb.indexOf('op: "connect"'), "the state before the code");
  assert.ok(cb.includes('if (proof.state.u !== ctx.userId) return back("error", "someone_else");'), "the person who started it");
  assert.ok(cb.includes('if (member.role !== "owner") return back("error", "not_owner");'));
  assert.ok(!cb.includes("client_secret"), "the dashboard never sees the secret");
  const server = readCode("apps/dashboard/src/server/google.ts");
  assert.ok(server.includes("return process.env.DIAG_KEY || null;"), "the state's key is the one the dashboard already shares with the edge");
  assert.ok(server.includes('export const CONNECTION_COLUMNS = "google_email, account_title, location_name, location_title, connected_at, last_synced_at, sync_error";'), "never credentials_ref");
  const reply = readCode("apps/dashboard/app/api/v1/google/reviews/[id]/reply/route.ts");
  assert.ok(reply.includes('requireRole(member, "operator")') && reply.includes('takeRate(ctx.userId, "google_reply")'));
  assert.ok(reply.includes('recordDecision(ctx, member.tenantId, "review", id, "reply_review", { comment, replied_at: repliedAt })'));
  const locations = readCode("apps/dashboard/app/api/v1/google/locations/route.ts");
  assert.equal((locations.match(/requireRole\(member, "owner"\)/g) ?? []).length, 2);
  const connection = readCode("apps/dashboard/app/api/v1/google/connection/route.ts");
  assert.ok(connection.includes("export const DELETE") && connection.includes('op: "disconnect"'));
  const rate = readCode("apps/dashboard/src/server/rate-limit.ts");
  assert.ok(rate.includes("google_reply: {"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/google.ts");
  assert.ok(bridge.includes('win.location.assign(scoped("/api/v1/google/connect"));') && bridge.includes("outcomeWords: CONNECT_OUTCOME_WORDS"));
  const card = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  for (const t of ["google-connect", "google-choose", "google-place-choose", "google-disconnect", "google-profile-none", "google-note"]) assert.ok(card.includes(`data-testid="${t}"`), t);
  const reports = readCode("apps/dashboard/src/legacy/pages/reports.jsx");
  assert.ok(reports.includes("vm.canReply && operator && r.fromProfile") && reports.includes('data-testid="google-reply-send"'));
  assert.ok(reports.includes("maxLength={4096}"));
});
