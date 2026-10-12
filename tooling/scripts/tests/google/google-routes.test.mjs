/**
 * Google, run through route(): the real route modules, their `run` called
 * with a database in memory. What is proved is the policy each declares and
 * what the handler answers, not its text. Every verb reaches Google through
 * the edge, which this machine has no credential for: each stops there, in
 * the words the owner would read, with nothing on the ledger.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
/** The key that signs the OAuth state, so the callback's door can be walked through. */
const SECRET = "test-state-secret";
process.env.GOOGLE_OAUTH_STATE_SECRET = SECRET;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { signState, newNonce, STATE_TTL_MS } = await import("@chanlytics/channels");
const callback = await import(at("apps/dashboard/app/api/v1/google/callback/route.ts"));
const connect = await import(at("apps/dashboard/app/api/v1/google/connect/route.ts"));
const connection = await import(at("apps/dashboard/app/api/v1/google/connection/route.ts"));
const link = await import(at("apps/dashboard/app/api/v1/google/link/route.ts"));
const locations = await import(at("apps/dashboard/app/api/v1/google/locations/route.ts"));
const refresh = await import(at("apps/dashboard/app/api/v1/google/refresh/route.ts"));
const draft = await import(at("apps/dashboard/app/api/v1/google/reviews/[id]/draft/route.ts"));
const reply = await import(at("apps/dashboard/app/api/v1/google/reviews/[id]/reply/route.ts"));
const search = await import(at("apps/dashboard/app/api/v1/google/search/route.ts"));
const read = await import(at("apps/dashboard/app/api/v1/google/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const R1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
const ctxFor = (tables, params = {}) => ({ supabase: fakeDb(tables), userId: USER, email: "ada@example.com", params });
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const inA = `?workspace=${A}`;
const inB = `?workspace=${B}`;
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
/** Every row the code under test wrote, changed or removed. */
const writes = (ctx) => ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;
const state = (t, u, exp = Date.now() + STATE_TTL_MS) => signState(SECRET, { t, u, n: newNonce(), exp });
/**
 * Where the browser lands: Connections, with one word the card reads once. On the workspace's own address once the state has
 * proved whose workspace it was (`workspace`, the slug), else on the front door with the route as a hash (wiring task 1.7).
 */
async function lands(p, workspace = null) {
  const res = await p;
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get("location"));
  if (workspace) {
    assert.equal(to.pathname, `/w/${workspace}/settings/integrations`, to.href);
    assert.equal(to.hash, "", "the route is the path's, not a hash for the home to carry");
  } else {
    assert.equal(to.pathname, "/", to.href);
    assert.equal(to.hash, "#/admin/integrations", to.href);
  }
  return to.searchParams;
}

test("the eleven declare their policy: the way there the owner's or the partner's (0012), the way back its own door as a read of the account, the listing and the account the owner's or the partner's, a refresh, a draft and a reply an operator's", () => {
  const rd = (role, rate) => ({ kind: "read", scope: "workspace", role, rate, spend: false });
  const ws = (role, rate) => ({ kind: "write", scope: "workspace", role, rate, spend: false });
  assert.deepEqual(callback.GET.policy, { kind: "read", scope: "account", role: null, rate: null, spend: false });
  assert.deepEqual(connect.GET.policy, rd("partner", "google_link"));
  assert.deepEqual(locations.GET.policy, rd("partner", "google_search"));
  assert.deepEqual(connection.DELETE.policy, ws("partner", "google_link"));
  assert.deepEqual(link.POST.policy, ws("partner", "google_link"));
  assert.deepEqual(link.DELETE.policy, ws("partner", "google_link"));
  assert.deepEqual(locations.POST.policy, ws("partner", "google_link"));
  assert.deepEqual(search.POST.policy, ws("partner", "google_search"));
  assert.deepEqual(refresh.POST.policy, ws("operator", "google_refresh"));
  assert.deepEqual(draft.POST.policy, ws("operator", "google_draft"));
  assert.deepEqual(reply.POST.policy, ws("operator", "google_reply"));
});

test("the way back: nothing is trusted until the state proves itself, then the person, then the workspace and the owner's standing in it, then the code, then the edge — every outcome a word Integrations reads", async () => {
  const tables = { memberships: both("operator", "owner") };
  assert.deepEqual([...(await lands(callback.GET.run(get("?error=access_denied"), ctxFor(tables))))].sort(), [
    ["google", "error"],
    ["why", "declined"],
  ]);
  assert.equal(
    (await lands(callback.GET.run(get("?state=nope&code=abc"), ctxFor(tables)))).get("why"),
    "state_malformed",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(B, USER, Date.now() - 1)}&code=abc`), ctxFor(tables)))).get(
      "why",
    ),
    "state_expired",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(B, "u2")}&code=abc`), ctxFor(tables)))).get("why"),
    "someone_else",
    "the person who started it",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(A, USER)}&code=abc`), ctxFor(tables)), "harbor")).get(
      "why",
    ),
    "not_owner",
    "an operator in harbor cannot finish what only an owner may start: and is told on harbor's own page",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(C, USER)}&code=abc`), ctxFor(tables)))).get("why"),
    "no_workspace",
  );
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(B, USER)}`), ctxFor(tables)), "bayside")).get("why"),
    "no_code",
    "said inside the workspace the state named, which is bayside and not the older membership (harbor)",
  );
  const edge = ctxFor(tables);
  assert.equal(
    (await lands(callback.GET.run(get(`?state=${await state(B, USER)}&code=abc`), edge), "bayside")).get("why"),
    "no_edge_credential",
    "proved and the owner's: then the edge, which this machine has no credential for; back on bayside's own page",
  );
  assert.equal(writes(edge), 0);
});

test("the way there is the owner's and, with no edge here, not available; disconnecting, linking, unlinking and choosing a location are the owner's and stop at the edge's credential", async () => {
  const tables = { memberships: both("operator", "owner") };
  await refused(connect.GET.run(get(inA), ctxFor(tables)), "forbidden", 403, "Only an owner");
  await refused(
    connect.GET.run(get(inB), ctxFor(tables)),
    "conflict",
    409,
    "Connecting a Business Profile is not available here yet.",
  );
  await refused(connection.DELETE.run(send("DELETE", undefined, inA), ctxFor(tables)), "forbidden", 403);
  await refused(
    connection.DELETE.run(send("DELETE", undefined, inB), ctxFor(tables)),
    "internal",
    502,
    "no_edge_credential",
  );
  await refused(
    link.POST.run(send("POST", { place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4" }, inA), ctxFor(tables)),
    "forbidden",
    403,
  );
  await refused(
    link.POST.run(send("POST", {}, inB), ctxFor(tables)),
    "validation",
    400,
    "Pick a listing from the search first.",
  );
  await refused(
    link.POST.run(send("POST", { place_id: "ChIJN1t_tDeuEmsRUsoyG83frY4" }, inB), ctxFor(tables)),
    "internal",
    502,
    "The listing could not be linked (no_edge_credential).",
  );
  await refused(link.DELETE.run(send("DELETE", undefined, inA), ctxFor(tables)), "forbidden", 403);
  await refused(link.DELETE.run(send("DELETE", undefined, inB), ctxFor(tables)), "internal", 502, "no_edge_credential");
  await refused(locations.GET.run(get(inA), ctxFor(tables)), "forbidden", 403);
  await refused(
    locations.GET.run(get(inB), ctxFor(tables)),
    "internal",
    502,
    "Google could not be read: no_edge_credential",
  );
  await refused(
    locations.POST.run(send("POST", {}, inB), ctxFor(tables)),
    "validation",
    400,
    "Pick a location from the list first.",
  );
  await refused(
    locations.POST.run(
      send("POST", { account_name: "accounts/123", location_name: "locations/456" }, inB),
      ctxFor(tables),
    ),
    "internal",
    502,
    "The location could not be chosen (no_edge_credential).",
  );
});

test("a refresh, a draft and a reply are an operator's, each judged in its words, each stopping at the edge's credential — and a reply that did not go through is not on the ledger", async () => {
  const tables = { memberships: both("viewer", "operator"), decisions: [] };
  await refused(
    refresh.POST.run(send("POST", undefined, inA), ctxFor(tables)),
    "forbidden",
    403,
    "Viewers can see everything",
  );
  await refused(
    refresh.POST.run(send("POST", undefined, inB), ctxFor(tables)),
    "internal",
    502,
    "Google could not be read.",
  );
  await refused(draft.POST.run(send("POST", undefined, inA), ctxFor(tables, { id: R1 })), "forbidden", 403);
  // A malformed id in the URL's own parameter is a 404 through requireUuid, as
  // it is on every other [id] route: the thing named does not exist, because it
  // cannot. These two carried their own copy of the uuid pattern and answered
  // 400 instead, which read to a client as "you sent a bad field".
  await refused(
    draft.POST.run(send("POST", undefined, inB), ctxFor(tables, { id: "x" })),
    "not_found",
    404,
    "That review does not exist.",
  );
  await refused(
    draft.POST.run(send("POST", undefined, inB), ctxFor(tables, { id: R1 })),
    "internal",
    502,
    "No draft this time (no_edge_credential).",
  );
  await refused(
    reply.POST.run(send("POST", { comment: "Thank you!" }, inA), ctxFor(tables, { id: R1 })),
    "forbidden",
    403,
  );
  await refused(
    reply.POST.run(send("POST", { comment: "Thank you!" }, inB), ctxFor(tables, { id: "x" })),
    "not_found",
    404,
    "That review does not exist.",
  );
  await refused(
    reply.POST.run(send("POST", {}, inB), ctxFor(tables, { id: R1 })),
    "validation",
    400,
    "Write the reply first.",
  );
  const edge = ctxFor(tables, { id: R1 });
  await refused(
    reply.POST.run(send("POST", { comment: "Thank you for coming in!" }, inB), edge),
    "internal",
    502,
    "The reply did not go through (no_edge_credential).",
  );
  assert.equal(writes(edge), 0);
  assert.equal(tables.decisions.length, 0, "a reply that did not go through is not a decision");
});

test("a search is the owner's: with no words of its own it uses the facts on record, then the name typed at sign-up, and with none of those it asks for them; with words it stops at the edge's credential", async () => {
  const tables = {
    memberships: both("operator", "owner"),
    tenant_config: [],
    tenants: [{ id: B, name: "Al", timezone: "America/Chicago" }],
  };
  await refused(
    search.POST.run(send("POST", { query: "Bayside Salon, Chicago" }, inA), ctxFor(tables)),
    "forbidden",
    403,
  );
  await refused(
    search.POST.run(send("POST", {}, inB), ctxFor(tables)),
    "validation",
    400,
    "Give the business name and where it is",
  );
  // A new workspace has no receptionist yet: the name typed at sign-up is the workspace's own, and the search asks it.
  tables.tenants[0].name = "Bayside Studio";
  await refused(
    search.POST.run(send("POST", {}, inB), ctxFor(tables)),
    "internal",
    502,
    "Google could not be searched just now",
  );
  await refused(
    search.POST.run(send("POST", { query: "Bayside Salon, Chicago" }, inB), ctxFor(tables)),
    "internal",
    502,
    "Google could not be searched just now",
  );
});

test("GET google answers the Google DTO whole, from one read of each: what the deployment can do (nothing here: no edge), the listing, the account, the newest reviews, the days and the Autonomy row for reviews -- and with no listing the account and nothing else", async () => {
  const listing = {
    place_id: "place-1",
    name: "Harbor Studio",
    address: "1 Dock Street",
    maps_uri: "https://maps.example.com/harbor",
    business_status: "OPERATIONAL",
    rating: 4.8,
    review_count: 213,
    linked_at: "2026-08-01T12:00:00Z",
    checked_at: "2026-10-06T12:00:00Z",
    check_error: null,
  };
  const account = {
    google_email: "owner@example.com",
    account_title: "Harbor Studio",
    location_name: "locations/1",
    location_title: "Harbor Studio",
    connected_at: "2026-08-01T12:00:00Z",
    last_synced_at: "2026-10-06T12:00:00Z",
    sync_error: null,
  };
  const review = (id, published, over = {}) => ({
    id,
    review_id: `g-${id}`,
    origin: "profile",
    rating: 5,
    author: "Ana P.",
    author_uri: null,
    author_photo_uri: null,
    body: "Fast, careful, and on time.",
    language_code: null,
    published_at: published,
    reply_text: null,
    replied_at: null,
    maps_uri: null,
    first_seen_at: published,
    ...over,
  });
  const day = (ago) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
  const reviews = [review("r2", "2026-10-05T09:00:00Z", { rating: 2 }), review("r1", "2026-10-03T14:00:00Z")];
  const days = [
    { day: day(2), rating: 4.7, review_count: 212 },
    { day: day(1), rating: 4.8, review_count: 213 },
  ];
  const policy = (mode) => ({
    id: "p1",
    tenant_id: A,
    class: "reviews",
    mode,
    subject_type: null,
    subject_id: null,
    limits: {},
    updated_at: "2026-10-01T00:00:00Z",
  });
  const world = (mode) => ({
    memberships: both("viewer", "viewer"),
    policies: [policy(mode)],
    google_listings: [{ tenant_id: A, ...listing }],
    google_connections: [{ tenant_id: A, ...account }],
    // Another workspace's review, the newest of all: never in Harbor's read.
    google_reviews: [
      ...reviews.map((r) => ({ tenant_id: A, ...r })),
      { tenant_id: B, ...review("r3", "2026-10-06T09:00:00Z") },
    ],
    google_listing_days: days.map((d) => ({ tenant_id: A, ...d })),
  });
  const out = await read.GET.run(get(inA), ctxFor(world("auto")));
  assert.deepEqual(Object.keys(out), ["google"]);
  assert.deepEqual(Object.keys(out.google), ["ready", "listing", "connection", "reviews", "days", "reply_mode"]);
  assert.deepEqual(out.google, {
    ready: { places: false, profile: false, audience: null },
    listing,
    connection: account,
    reviews,
    days,
    reply_mode: "auto",
  });
  assert.equal((await read.GET.run(get(inA), ctxFor(world("never")))).google.reply_mode, "never");
  assert.equal((await read.GET.run(get(inA), ctxFor({ ...world("auto"), policies: [] }))).google.reply_mode, "ask");
  // No listing: the account if there is one. A review and a day hang off the listing (a foreign key that cascades), so the
  // four reads, made at once, find none.
  const bare = ctxFor({ ...world("ask"), google_listings: [], google_reviews: [], google_listing_days: [] });
  assert.deepEqual((await read.GET.run(get(inA), bare)).google, {
    ready: { places: false, profile: false, audience: null },
    listing: null,
    connection: account,
    reviews: [],
    days: [],
    reply_mode: "ask",
  });
  assert.deepEqual(
    bare.supabase.seen
      .map((q) => q.table)
      .filter((t) => t?.startsWith("google_"))
      .sort(),
    ["google_connections", "google_listing_days", "google_listings", "google_reviews"],
    "each read once, none waiting for the listing to say whether there is one",
  );
});
