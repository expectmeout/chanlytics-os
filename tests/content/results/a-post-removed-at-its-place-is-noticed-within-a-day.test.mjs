/**
 * A post removed at its place is noticed within a day (the content status review's piece 4, gaps B1 to B3). Before this
 * a removal was noticed only when a read of the post's numbers failed: five reads in 28 days, on Instagram alone. A post
 * deleted on day 8 read "On Instagram" until day 28, one deleted after that for good, and one removed on Google never.
 *
 * posts_read, once a day a workspace: each place is asked for its own list of posts, the list is held against the posts
 * Chanlytics calls up there, and a post the list does not name is asked about by its own id before anything moves. Only
 * a place that reads, and no longer holds it, takes the post down here, and its owner is told once. A list that could
 * not be read says nothing. Run over a database in memory with a captured wire where Meta and Google would be.
 *
 * ORDER OF SETUP MATTERS: lib/shared/google/places.ts binds fetch at module scope, so the wire goes in first.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { DAY_MS, HOUR_MS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.GOOGLE_OAUTH_CLIENT_ID = "oauth-client-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "oauth-secret-for-this-file";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://dash.test/api/v1/google/callback";
for (const k of ["RESEND_API_KEY", "SUPABASE_URL", "META_APP_ID"]) delete process.env[k];
const realSecret = process.env.META_APP_SECRET;
process.env.META_APP_SECRET = "meta-secret-for-the-daily-read";

const T = "aaaa1111-7777-4000-8000-000000000041";
const OWNER = "bbbb2222-7777-4000-8000-000000000042";
const FILE = "cccc3333-7777-4000-8000-000000000043";
const ROW = "eeee5555-7777-4000-8000-000000000045";
const ACCOUNT = "17841400000000007";
const OTHER_ACCOUNT = "17841400000000099";
const MEDIA = "17900000000000041";
const PAGE = "100200300400507";
const PAGE_POST = `${PAGE}_900800700600507`;
const PARENT = "accounts/111/locations/222";
const NAME = `${PARENT}/localPosts/999`;
const LINK = ["instagram_basic", "instagram_content_publish", "instagram_manage_insights"];
const PAGES = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"];
/** Meta's answer to a read of a post that is gone, by its id (24 Nov 2026). */
const BY_ID_GONE = [400, { error: { message: "Object does not exist", type: "GraphMethodException", code: 100 } }];

/**
 * The wire: Meta answers a route by what `meta` holds for it, Google by what `google` says. A list asked with a time
 * (`since`) is its own route, apart from the adapter's ten newest: `GET /<account>/media?since`, and `&after=<cursor>`
 * for a later page. Every ask is kept.
 */
let meta;
let google;
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const method = init.method ?? "GET";
  if (u.host !== "graph.facebook.com") {
    const route = `${method} ${u.pathname.replace("/v4/", "")}${u.searchParams.get("pageToken") ? `?pageToken=${u.searchParams.get("pageToken")}` : ""}`;
    calls.push(route);
    const [status, json] = google[route] ?? [500, { error: { message: "nothing answers", status: "INTERNAL" } }];
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }
  const after = u.searchParams.get("after");
  const listed = u.searchParams.has("since") ? `?since${after ? `&after=${after}` : ""}` : "";
  const route = `${method} ${u.pathname.replace("/v27.0", "")}${listed}`;
  calls.push(route);
  const [status, json] = meta[route] ?? [500, { error: { message: "no answer", code: 2 } }];
  return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { readPostsHeld } = await import(at("apps/edge/lib/content/posts-read.ts"));
const { readListing, LISTED_PAGES_MAX } = await import(at("apps/edge/lib/content/place-listing.ts"));
const { keepResultsMoving } = await import(at("apps/edge/lib/content/results-upkeep.ts"));
const { findInstagramHeld } = await import(at("apps/edge/lib/instagram/posts-held.ts"));
const { findGoogleHeld } = await import(at("apps/edge/lib/google/posts-held.ts"));
const { findPageHeld } = await import(at("apps/edge/lib/facebook/posting.ts"));
const HELD_AT = { instagram: findInstagramHeld(), google: findGoogleHeld, facebook: findPageHeld() };

after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
  if (realSecret === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = realSecret;
});
beforeEach(() => {
  resetBreakers();
  calls.length = 0;
  meta = {};
  google = {};
});

/** A post as Chanlytics keeps one that is up: forty days on by default, past every read of its numbers. */
function upPost(at = {}) {
  const place = at.place ?? "instagram";
  const up = new Date(Date.now() - (at.upFor ?? 40 * DAY_MS)).toISOString();
  const ids = { instagram: [MEDIA, ACCOUNT], google: [NAME, null], facebook: [PAGE_POST, PAGE] }[place];
  return {
    id: at.id ?? "dddd4444-7777-4000-8000-000000000044",
    tenant_id: T,
    file_id: FILE,
    place,
    kind: at.kind ?? "picture",
    caption: "Open late on Fridays.",
    status: at.status ?? "published",
    scheduled_for: up,
    approved_by: OWNER,
    approved_at: up,
    via: "press",
    held_reason: null,
    held_why: null,
    attempts: 1,
    container_id: null,
    external_id: "externalId" in at ? at.externalId : ids[0],
    permalink: null,
    published_at: up,
    error: null,
    verified_at: up,
    account_id: "accountId" in at ? at.accountId : ids[1],
    created_at: up,
    updated_at: up,
  };
}

/** A workspace with its Meta link (an Instagram account and a Page), its Google location, and the posts given. */
function world(posts, { lapsed = false, takeDown = null, facebook = true, googleOn = true } = {}) {
  const now = new Date().toISOString();
  const tables = {
    tenants: [{ id: T, timezone: "America/New_York", sending_stopped_at: null }],
    tenant_config: [
      {
        tenant_id: T,
        config: { features: { places: { facebook } } },
        version: 1,
        updated_at: now,
        updated_by: null,
      },
    ],
    files: [
      {
        id: FILE,
        tenant_id: T,
        name: "The finish",
        kind: "image",
        source: "made",
        status: "filed",
        removed_at: null,
        made: null,
      },
    ],
    notifications: [],
    tenant_channels: [
      {
        id: ROW,
        tenant_id: T,
        kind: "instagram",
        external_id: ACCOUNT,
        credentials_ref: "ref-1",
        status: "active",
        config: {
          login: "meta",
          scopes: [...LINK, ...PAGES],
          username: "studio",
          page: { id: PAGE, name: "Studio" },
          ...(lapsed ? { token_lapsed_at: now } : {}),
        },
        created_at: now,
      },
    ],
    google_connections: googleOn
      ? [
          {
            tenant_id: T,
            google_email: "owner@example.com",
            google_sub: "sub-1",
            account_name: "accounts/111",
            account_title: "Studio",
            location_name: "locations/222",
            location_title: "Studio",
            scopes: ["https://www.googleapis.com/auth/business.manage"],
            connected_by: OWNER,
            connected_at: now,
            last_synced_at: now,
            sync_error: null,
            reviews_complete: false,
          },
        ]
      : [],
    posts,
    remediations: takeDown
      ? [{ id: "rem-1", tenant_id: T, cause: "owner_removed", subject_type: "file", subject_id: FILE, created_at: now }]
      : [],
    remediation_actions: takeDown
      ? [
          {
            id: "act-1",
            tenant_id: T,
            remediation_id: "rem-1",
            target_type: "post",
            target_id: posts[0].id,
            act: "take_down",
            outcome: takeDown,
            said: null,
            started_at: now,
            finished_at: null,
          },
        ]
      : [],
    jobs: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      get_channel_credentials: () => ({ access_token: "meta-token", account_id: ACCOUNT, login: "meta" }),
      get_google_credentials: () => ({
        refresh_token: "rt-1",
        access_token: "at-good",
        expires_at: Date.now() + HOUR_MS,
        scope: "openid email",
      }),
      // The door as 00611 writes it: moved only from where it stood, so two reads never both move it.
      post_moved: ({ p_post_id, p_from, p_to }) => {
        const row = tables.posts.find((p) => p.id === p_post_id);
        if (!row || !p_from.includes(row.status)) return false;
        Object.assign(row, { status: p_to, held_reason: null, held_why: null, updated_at: new Date().toISOString() });
        return true;
      },
      // The clock's question, as the database answers it for this workspace; its other two have nothing due here.
      posts_read_due: () => [{ tenant_id: T }],
      post_observations_due: () => [],
      touches_age_out: () => 0,
    },
  );
  setPg(db);
  const run = (payload = {}) =>
    readPostsHeld(db, { id: "job-1", tenant_id: T, kind: "posts_read", payload }, Date.now() + 60_000, HELD_AT);
  /** The bell's rows as kept: each one's kind, and the piece it is about. */
  const bell = () => tables.notifications.map((n) => [n.kind, n.subject_id]);
  return { db, tables, run, bell, statuses: () => tables.posts.map((p) => p.status) };
}

/** What one place's read came to, of what the job answered. */
const readOf = (answer, place) => answer.read.find((r) => r.place === place);
const LIST = `GET /${ACCOUNT}/media?since`;
const listOf = (...ids) => [200, { data: ids.map((id) => ({ id, timestamp: new Date().toISOString() })) }];

/* --------------------------------------------------------------------------------------------------- Instagram */

test("deleted on Instagram forty days on: the account's list no longer names it, its id says gone, and it is taken down and told once", async () => {
  meta[LIST] = listOf("17900000000000001", "17900000000000002");
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  meta[`GET /${ACCOUNT}/media`] = listOf("17900000000000001");
  const w = world([upPost()]);
  const answer = await w.run();
  assert.deepEqual(calls, [LIST, `GET /${MEDIA}`, `GET /${ACCOUNT}/media`]);
  assert.deepEqual(w.statuses(), ["taken_down"]);
  assert.deepEqual(w.bell(), [["post_down", FILE]]);
  const read = readOf(answer, "instagram");
  assert.deepEqual(
    [read.read, read.held, read.listed, read.calls, read.missing, read.asked, read.gone],
    ["whole", 1, 2, 1, 1, 1, 1],
  );
  // The next day's read: a post taken down is no longer held against anything, and the bell is not rung again.
  calls.length = 0;
  assert.deepEqual(await w.run(), { skipped: "nothing up" });
  assert.deepEqual(calls, []);
  assert.equal(w.bell().length, 1);
});

test("the list still names it: one call, nothing asked by id, nothing moves", async () => {
  meta[LIST] = listOf(MEDIA, "17900000000000002");
  const w = world([upPost()]);
  const answer = await w.run();
  assert.deepEqual(calls, [LIST]);
  assert.deepEqual(w.statuses(), ["published"]);
  assert.deepEqual(w.bell(), []);
  assert.equal(readOf(answer, "instagram").missing, 0);
});

test("the list asks only back to the oldest post Chanlytics calls up there, an hour to spare, a hundred a page", async () => {
  const asked = [];
  const stub = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    asked.push(new URL(String(url)).searchParams);
    return stub(url, init);
  };
  try {
    meta[LIST] = listOf(MEDIA);
    const w = world([
      upPost({ upFor: 8 * DAY_MS }),
      upPost({ id: "p-2", externalId: "17900000000000050", upFor: 2 * DAY_MS }),
    ]);
    await w.run();
    const [list] = asked;
    assert.equal(list.get("fields"), "id,timestamp");
    assert.equal(list.get("limit"), "100");
    const since = Number(list.get("since")) * 1000;
    const oldest = Date.parse(w.tables.posts[0].published_at);
    assert.ok(Math.abs(oldest - HOUR_MS - since) < 2000, "an hour before the oldest post that is up");
  } finally {
    globalThis.fetch = stub;
  }
});

for (const [why, answer, read, said] of [
  ["refused (a token Meta no longer takes)", [400, { error: { message: "expired", code: 190 } }], "refused", "190"],
  ["turned away for too many calls", [400, { error: { message: "limit", code: 80002 } }], "refused", "80002"],
  ["given no answer", [500, { error: { message: "down", code: 2 } }], "unknown", "2"],
  ["answered with no list at all", [200, { id: ACCOUNT }], "unknown", "no_list"],
]) {
  test(`a list that was ${why} says nothing: no post is asked about, none moves, and tomorrow asks again`, async () => {
    meta[LIST] = answer;
    meta[`GET /${MEDIA}`] = BY_ID_GONE;
    meta[`GET /${ACCOUNT}/media`] = listOf();
    const w = world([upPost()]);
    const got = readOf(await w.run(), "instagram");
    assert.deepEqual([...new Set(calls)], [LIST], "only the list was asked");
    assert.deepEqual(w.statuses(), ["published"]);
    assert.deepEqual(w.bell(), []);
    assert.deepEqual([got.read, got.said, got.gone], [read, said, 0]);
  });
}

test("a list that does not name it, while its own id still reads: still up (the list judges nothing alone)", async () => {
  meta[LIST] = listOf("17900000000000001");
  meta[`GET /${MEDIA}`] = [200, { id: MEDIA, permalink: "https://www.instagram.com/p/abc/" }];
  const w = world([upPost()]);
  const read = readOf(await w.run(), "instagram");
  assert.deepEqual(calls, [LIST, `GET /${MEDIA}`]);
  assert.deepEqual(w.statuses(), ["published"]);
  assert.deepEqual([read.missing, read.asked, read.gone], [1, 1, 0]);
});

test("its id refused, and the account's own newest list does not read: the connection failed, not the post", async () => {
  meta[LIST] = listOf("17900000000000001");
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  const w = world([upPost()]);
  await w.run();
  assert.deepEqual(w.statuses(), ["published"]);
  assert.deepEqual(w.bell(), []);
});

test("never judged: a story, a post with no id there, one up under an hour, one past a year, and one of another account", async () => {
  meta[LIST] = listOf();
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  meta[`GET /${ACCOUNT}/media`] = listOf();
  const w = world([
    upPost({ id: "story", kind: "story", upFor: 5 * HOUR_MS }),
    upPost({ id: "no-id", externalId: null }),
    upPost({ id: "new", upFor: 20 * 60_000 }),
    upPost({ id: "old", upFor: 366 * DAY_MS }),
    upPost({ id: "left", externalId: "17900000000000077", accountId: OTHER_ACCOUNT }),
    upPost({ id: "unkept", externalId: "17900000000000078", accountId: null }),
  ]);
  assert.deepEqual(await w.run(), { skipped: "nothing up" });
  assert.deepEqual(calls, [], "nothing of the account is asked for posts that are not its list's");
  assert.deepEqual(new Set(w.statuses()), new Set(["published"]));
});

test("more posts missing than one read asks about: twenty are asked by id, and the rest wait for the days after", async () => {
  meta[LIST] = listOf("17900000000000001");
  const posts = Array.from({ length: 25 }, (_, i) =>
    upPost({ id: `p-${i}`, externalId: `179000000000005${String(i).padStart(2, "0")}`, upFor: (10 + i) * DAY_MS }),
  );
  // Each one's own id still reads: the list left them out, and none is gone.
  for (const post of posts) meta[`GET /${post.external_id}`] = [200, { id: post.external_id }];
  const w = world(posts);
  const read = readOf(await w.run(), "instagram");
  assert.deepEqual([read.held, read.missing, read.asked, read.gone], [25, 25, 20, 0]);
  assert.equal(calls.length, 21, "the list, and twenty posts by their own id");
  assert.deepEqual(new Set(w.statuses()), new Set(["published"]));
});

test("a take-down still asking is left to settle it: found gone, the post is not moved here and nothing rings", async () => {
  meta[LIST] = listOf();
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  meta[`GET /${ACCOUNT}/media`] = listOf();
  const w = world([upPost()], { takeDown: "pending" });
  const read = readOf(await w.run(), "instagram");
  assert.deepEqual(w.statuses(), ["published"]);
  assert.deepEqual(w.bell(), []);
  assert.deepEqual([read.asked, read.gone], [1, 0]);
});

test("an account no longer connected is asked nothing", async () => {
  const w = world([upPost()], { lapsed: true });
  const read = readOf(await w.run(), "instagram");
  assert.deepEqual(calls, []);
  assert.equal(read.read, "cant");
  assert.deepEqual(w.statuses(), ["published"]);
});

test("a dry read asks as ever and moves nothing: its line says what it would have moved", async () => {
  meta[LIST] = listOf();
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  meta[`GET /${ACCOUNT}/media`] = listOf();
  // Only Instagram is connected here: a dry read asks every connected place, and the next test holds that.
  const w = world([upPost()], { googleOn: false, facebook: false });
  const read = readOf(await w.run({ dry: "yes" }), "instagram");
  assert.deepEqual(calls, [LIST, `GET /${MEDIA}`, `GET /${ACCOUNT}/media`]);
  assert.equal(read.gone, 1);
  assert.deepEqual(w.statuses(), ["published"]);
  assert.deepEqual(w.bell(), []);
});

test("a dry read of a workspace with nothing held still asks each connected place's list, a month back, and moves nothing", async () => {
  meta[LIST] = listOf("17900000000000001", "17900000000000002", "17900000000000003");
  meta[`GET /${PAGE}`] = PAGE_TOKEN;
  meta[F_LIST] = [200, { data: [] }];
  google[G_LIST] = [200, { localPosts: [gPost(`${PARENT}/localPosts/1`)] }];
  const w = world([upPost({ id: "story", kind: "story", upFor: 3 * DAY_MS })]);
  assert.deepEqual(await w.run(), { skipped: "nothing up" }, "the day's own read asks nothing where nothing is held");
  assert.deepEqual(calls, []);
  const answer = await w.run({ dry: "yes" });
  assert.deepEqual(calls, [LIST, G_LIST, `GET /${PAGE}`, F_LIST]);
  assert.deepEqual(
    answer.read.map((r) => [r.place, r.read, r.held, r.listed, r.calls, r.gone]),
    [
      ["instagram", "whole", 0, 3, 1, 0],
      ["google", "whole", 0, 1, 1, 0],
      ["facebook", "whole", 0, 0, 1, 0],
    ],
  );
  assert.deepEqual(w.statuses(), ["published"]);
  assert.deepEqual(w.bell(), []);
});

test("a list of two pages is read to its end by Meta's own cursor, and a post on the second page is not missing", async () => {
  const next = `https://graph.facebook.com/v27.0/${ACCOUNT}/media?access_token=never-followed&after=CURSOR2&limit=100`;
  meta[LIST] = [200, { data: [{ id: "17900000000000001" }], paging: { cursors: { after: "CURSOR2" }, next } }];
  meta[`${LIST}&after=CURSOR2`] = listOf(MEDIA);
  const w = world([upPost()]);
  const read = readOf(await w.run(), "instagram");
  assert.deepEqual(calls, [LIST, `${LIST}&after=CURSOR2`]);
  assert.deepEqual([read.read, read.calls, read.listed, read.missing], ["whole", 2, 2, 0]);
});

/* --------------------------------------------------------------------------------- the list, a page at a time */

test("a list that never ends stops at its pages, and covers only back to the oldest post it named", async () => {
  const now = Date.now();
  let page = 0;
  const listing = await readListing(
    async () => {
      page += 1;
      return { is: "page", posts: [{ id: `p${page}`, atMs: now - page * DAY_MS }], next: `t${page}` };
    },
    now - 400 * DAY_MS,
    now + 60_000,
  );
  assert.equal(page, LISTED_PAGES_MAX);
  assert.deepEqual([listing.is, listing.calls, listing.ids.size], ["read", LISTED_PAGES_MAX, LISTED_PAGES_MAX]);
  assert.equal(listing.backToMs, now - LISTED_PAGES_MAX * DAY_MS, "a post older than this is not said to be missing");
});

test("a list stops where a page reaches back past the time asked, and one out of time says nothing", async () => {
  const now = Date.now();
  let asked = 0;
  const pages = async () => {
    asked += 1;
    return { is: "page", posts: [{ id: `p${asked}`, atMs: now - asked * 10 * DAY_MS }], next: "more" };
  };
  const whole = await readListing(pages, now - 25 * DAY_MS, now + 60_000);
  assert.deepEqual([whole.is, whole.calls, whole.backToMs], ["read", 3, null]);
  const late = await readListing(pages, now - 25 * DAY_MS, now - 1);
  assert.deepEqual([late.is, late.calls, late.said], ["unknown", 0, "out_of_time"]);
  const failed = await readListing(async (next) => (next ? { is: "refused", said: "10" } : pages()), 0, now + 60_000);
  assert.deepEqual([failed.is, failed.said], ["refused", "10"], "one page that fails makes the whole list say nothing");
});

/* ------------------------------------------------------------------------------------------------------ Google */

const G_LIST = `GET ${PARENT}/localPosts`;
const gPost = (name, state = "LIVE") => ({ name, state, createTime: new Date().toISOString(), searchUrl: null });

test("removed on Google: the location's list no longer names it and its name is not found, so it is taken down and told", async () => {
  google[G_LIST] = [200, { localPosts: [gPost(`${PARENT}/localPosts/1`)] }];
  google[`GET ${NAME}`] = [
    404,
    { error: { code: 404, message: "Requested entity was not found.", status: "NOT_FOUND" } },
  ];
  const w = world([upPost({ place: "google" })]);
  const read = readOf(await w.run(), "google");
  assert.deepEqual(calls, [G_LIST, `GET ${NAME}`]);
  assert.deepEqual(w.statuses(), ["taken_down"]);
  assert.deepEqual(w.bell(), [["post_down", FILE]]);
  assert.deepEqual([read.read, read.held, read.missing, read.gone], ["whole", 1, 1, 1]);
});

test("rejected by Google: the list still names it, as rejected, so it is asked about and said to be down", async () => {
  google[G_LIST] = [200, { localPosts: [gPost(NAME, "REJECTED")] }];
  google[`GET ${NAME}`] = [200, gPost(NAME, "REJECTED")];
  const w = world([upPost({ place: "google" })]);
  await w.run();
  assert.deepEqual(w.statuses(), ["taken_down"]);
});

test("on Google still, showing or being looked at: nothing moves, over two pages by Google's own token", async () => {
  google[G_LIST] = [200, { localPosts: [gPost(`${PARENT}/localPosts/1`)], nextPageToken: "T2" }];
  google[`${G_LIST}?pageToken=T2`] = [200, { localPosts: [gPost(NAME, "PROCESSING")] }];
  const w = world([upPost({ place: "google" })]);
  const read = readOf(await w.run(), "google");
  assert.deepEqual(calls, [G_LIST, `${G_LIST}?pageToken=T2`]);
  assert.deepEqual(w.statuses(), ["published"]);
  assert.deepEqual([read.calls, read.missing], [2, 0]);
});

for (const [why, status, read] of [
  ["turned away for too many asks", 429, "unknown"],
  ["refused", 403, "refused"],
]) {
  test(`Google's list ${why} says nothing: none is asked about by name, none moves`, async () => {
    google[G_LIST] = [status, { error: { code: status, message: "no", status: "X" } }];
    const w = world([upPost({ place: "google" })]);
    const got = readOf(await w.run(), "google");
    assert.deepEqual([...new Set(calls)], [G_LIST]);
    assert.deepEqual(w.statuses(), ["published"]);
    assert.deepEqual([got.read, got.said], [read, String(status)]);
  });
}

test("missing from Google's list, and its name gets no answer: nothing is said of it", async () => {
  google[G_LIST] = [200, { localPosts: [] }];
  const w = world([upPost({ place: "google" })]);
  const read = readOf(await w.run(), "google");
  assert.deepEqual(w.statuses(), ["published"]);
  assert.deepEqual([read.asked, read.gone], [1, 0]);
});

test("a post of another location than the one connected now, or with Google not connected, is asked nothing", async () => {
  const other = world([upPost({ place: "google", externalId: "accounts/111/locations/999/localPosts/5" })]);
  assert.deepEqual(await other.run(), { skipped: "nothing up" });
  const off = world([upPost({ place: "google" })], { googleOn: false });
  assert.equal(readOf(await off.run(), "google").read, "cant");
  assert.deepEqual(calls, []);
});

/* ---------------------------------------------------------------------------------------------- a Facebook Page */

const F_LIST = `GET /${PAGE}/published_posts?since`;
const PAGE_TOKEN = [200, { id: PAGE, access_token: "page-token" }];

test("a picture removed on a Page: the Page's list no longer names it, its id says gone, and it is taken down and told", async () => {
  meta[`GET /${PAGE}`] = PAGE_TOKEN;
  meta[F_LIST] = [200, { data: [{ id: `${PAGE}_1`, created_time: new Date().toISOString() }] }];
  meta[`GET /${PAGE_POST}`] = BY_ID_GONE;
  meta[`GET /${PAGE}/published_posts`] = [200, { data: [{ id: `${PAGE}_1` }] }];
  const w = world([upPost({ place: "facebook" })]);
  const read = readOf(await w.run(), "facebook");
  assert.deepEqual(calls, [`GET /${PAGE}`, F_LIST, `GET /${PAGE_POST}`, `GET /${PAGE}/published_posts`]);
  assert.deepEqual(w.statuses(), ["taken_down"]);
  assert.deepEqual(w.bell(), [["post_down", FILE]]);
  assert.deepEqual([read.read, read.missing, read.gone], ["whole", 1, 1]);
});

test("a Page's list Meta refuses says nothing, a reel there is never held against it, and a Page not switched on is not asked", async () => {
  meta[`GET /${PAGE}`] = PAGE_TOKEN;
  meta[F_LIST] = [403, { error: { message: "(#10) This endpoint requires a permission", code: 10 } }];
  const refused = world([upPost({ place: "facebook" })]);
  const read = readOf(await refused.run(), "facebook");
  assert.deepEqual([read.read, read.said], ["refused", "10"]);
  assert.deepEqual(refused.statuses(), ["published"]);
  calls.length = 0;
  const reel = world([upPost({ place: "facebook", kind: "reel", externalId: "777000111222333" })]);
  assert.deepEqual(await reel.run(), { skipped: "nothing up" });
  const off = world([upPost({ place: "facebook" })], { facebook: false });
  assert.equal(readOf(await off.run(), "facebook").read, "cant");
  assert.deepEqual(calls, [], "neither asks Meta anything");
});

/* ------------------------------------------------------------------------------------- every place, and the clock */

test("one place that cannot be read never keeps the others from being asked", async () => {
  meta[LIST] = [500, { error: { message: "down", code: 2 } }];
  google[G_LIST] = [200, { localPosts: [] }];
  google[`GET ${NAME}`] = [404, { error: { code: 404, message: "gone", status: "NOT_FOUND" } }];
  const w = world([upPost(), upPost({ id: "g-1", place: "google" })]);
  const answer = await w.run();
  assert.deepEqual(w.statuses(), ["published", "taken_down"]);
  assert.deepEqual([readOf(answer, "instagram").read, readOf(answer, "google").gone], ["unknown", 1]);
});

test("the half hour's clock hands each workspace that is due one job, and a second knock writes no second", async () => {
  const w = world([upPost()]);
  const first = await keepResultsMoving(w.db);
  assert.equal(first.posts_reads_handed, 1);
  const jobs = w.tables.jobs.filter((j) => j.kind === "posts_read");
  assert.deepEqual(
    jobs.map((j) => [j.tenant_id, j.state, j.payload]),
    [[T, "scheduled", {}]],
  );
  assert.ok(
    Date.parse(jobs[0].due_at) - Date.now() <= 300_000,
    "due inside the five minutes a clock spreads its jobs over",
  );
  const second = await keepResultsMoving(w.db);
  assert.equal(second.posts_reads_handed, 0);
  assert.equal(w.tables.jobs.filter((j) => j.kind === "posts_read").length, 1);
});
