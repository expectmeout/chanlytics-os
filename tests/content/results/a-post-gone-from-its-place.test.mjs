/**
 * A post removed on its place itself is noticed (the content loop PRD's 9.1 and 8.3): the 21 Nov 2026 picture was gone
 * from @chanlytics by 24 Nov while its row still said published, and every read of its numbers since was kept as failed.
 * Meta answers a read of a post that is gone as one it may not read (code 100, subcode 33), so a read that gives no
 * number asks the account itself whether it still holds the post, as "I deleted it" does: by its own id, then the
 * account's own list with the same connection. Only an account that reads, and no longer holds it, takes the post down
 * here; its owner is told once, in the words a take-down that came through has. A take-down still asking is left to
 * settle it. A story past its day ended by itself and is never judged.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { DAY_MS, HOUR_MS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL", "META_APP_ID"]) delete process.env[k];
const realSecret = process.env.META_APP_SECRET;
process.env.META_APP_SECRET = "meta-secret-for-results";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { readPostResults } = await import(at("apps/edge/lib/content/observe.ts"));
const { findResultsPlace } = await import(at("apps/edge/lib/instagram/results-place.ts"));

const T = "aaaa1111-5555-4000-8000-000000000031";
const OWNER = "bbbb2222-5555-4000-8000-000000000032";
const FILE = "cccc3333-5555-4000-8000-000000000033";
const POST = "dddd4444-5555-4000-8000-000000000034";
const ROW = "eeee5555-5555-4000-8000-000000000035";
const REM = "ffff6666-5555-4000-8000-000000000036";
const ACTION = "abab0000-5555-4000-8000-000000000037";
const ACCOUNT = "17841400000000005";
const MEDIA = "17900000000000031";
const SCOPES = ["instagram_basic", "instagram_content_publish", "instagram_manage_insights"];
/** Meta's answer to a read of the post's numbers, and of the post itself, once it is gone (24 Nov 2026). */
const NUMBERS_GONE = [
  400,
  { error: { message: "Unsupported get request.", type: "GraphMethodException", code: 100, error_subcode: 33 } },
];
const BY_ID_GONE = [400, { error: { message: "Object does not exist", type: "GraphMethodException", code: 100 } }];
/** The account's own list, read with the same connection: two older posts, and not this one. */
const LIST_WITHOUT_IT = [
  200,
  { data: [{ id: "18062428655363000", timestamp: "2025-09-18T15:00:00+0000" }, { id: "17916944667080285" }] },
];
const NUMBERS = [
  200,
  {
    data: [
      { name: "reach", period: "lifetime", values: [{ value: 412 }] },
      { name: "views", period: "lifetime", values: [{ value: 655 }] },
      { name: "likes", period: "lifetime", values: [{ value: 23 }] },
      { name: "comments", period: "lifetime", values: [{ value: 4 }] },
      { name: "saved", period: "lifetime", values: [{ value: 6 }] },
      { name: "shares", period: "lifetime", values: [{ value: 2 }] },
    ],
  },
];

let meta;
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const route = `${init.method ?? "GET"} ${u.pathname.replace("/v27.0", "")}`;
  calls.push(route);
  const [status, json] = meta[route] ?? [500, { error: { message: "no answer", code: 2 } }];
  return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
};
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
});

/** A workspace with one post up on Instagram, three days on, and the Meta link's numbers line on. */
function world({ kind = "picture", upFor = 3 * DAY_MS, takeDown = null, insights = true, bell = [] } = {}) {
  const now = new Date().toISOString();
  const up = new Date(Date.now() - upFor).toISOString();
  const tables = {
    tenants: [{ id: T, timezone: "America/New_York", sending_stopped_at: null }],
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
    notifications: bell.map((row, i) => ({
      id: `note-${i}`,
      tenant_id: T,
      route: null,
      subject_type: "file",
      subject_id: FILE,
      closed_at: null,
      read_at: null,
      created_at: now,
      ...row,
    })),
    tenant_channels: [
      {
        id: ROW,
        tenant_id: T,
        kind: "instagram",
        external_id: ACCOUNT,
        credentials_ref: "ref-1",
        status: "active",
        config: { login: "meta", scopes: insights ? SCOPES : SCOPES.slice(0, 2), username: "studio" },
        created_at: now,
      },
    ],
    posts: [
      {
        id: POST,
        tenant_id: T,
        file_id: FILE,
        place: "instagram",
        kind,
        caption: kind === "story" ? null : "Open late on Fridays.",
        status: "published",
        scheduled_for: up,
        approved_by: OWNER,
        approved_at: up,
        via: "press",
        held_reason: null,
        held_why: null,
        attempts: 1,
        container_id: "18000000000000031",
        external_id: MEDIA,
        permalink: "https://www.instagram.com/p/abc/",
        published_at: up,
        error: null,
        verified_at: up,
        account_id: ACCOUNT,
        created_at: up,
        updated_at: up,
      },
    ],
    remediations: takeDown
      ? [{ id: REM, tenant_id: T, cause: "owner_removed", subject_type: "file", subject_id: FILE, created_at: now }]
      : [],
    remediation_actions: takeDown
      ? [
          {
            id: ACTION,
            tenant_id: T,
            remediation_id: REM,
            target_type: "post",
            target_id: POST,
            act: "take_down",
            outcome: takeDown,
            said: null,
            started_at: now,
            finished_at: takeDown === "pending" ? null : now,
          },
        ]
      : [],
    jobs: [],
    // What post_observations_keep was handed, each read as one call.
    kept: [],
  };
  const post = () => tables.posts[0];
  const db = fakeDb(
    tables,
    {},
    {
      get_channel_credentials: () => ({ access_token: "meta-token", account_id: ACCOUNT, login: "meta" }),
      post_observations_keep: (args) => {
        tables.kept.push(args);
        return args.p_rows.length;
      },
      // The door as 00611 writes it: moved only from where it stood, so two runs never both move it.
      post_moved: ({ p_post_id, p_from, p_to }) => {
        const row = tables.posts.find((p) => p.id === p_post_id);
        if (!row || !p_from.includes(row.status)) return false;
        Object.assign(row, { status: p_to, held_reason: null, held_why: null, updated_at: new Date().toISOString() });
        return true;
      },
    },
  );
  setPg(db);
  const run = (step = "3d") =>
    readPostResults(db, { id: "job-1", tenant_id: T, kind: "post_observe", payload: { post_id: POST, step } }, (p) =>
      findResultsPlace(db, p, "insights"),
    );
  /** The bell's rows as kept: kind, title, body, and whether each is closed. */
  const bellOf = () => tables.notifications.map((n) => [n.kind, n.title, n.body, !!n.closed_at]);
  return { tables, post, run, bell: bellOf };
}

/** Each read kept: its step, and how each number it asked stood. */
const keptOf = (w) => w.tables.kept.map((k) => [k.p_step, [...new Set(k.p_rows.map((r) => r.availability))].sort()]);

test("removed on Instagram: the account reads without it, so it is taken down here and its owner told once", async () => {
  meta[`GET /${MEDIA}/insights`] = NUMBERS_GONE;
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  meta[`GET /${ACCOUNT}/media`] = LIST_WITHOUT_IT;
  const w = world();
  await w.run();
  assert.deepEqual(calls, [`GET /${MEDIA}/insights`, `GET /${MEDIA}`, `GET /${ACCOUNT}/media`]);
  assert.equal(w.post().status, "taken_down");
  assert.deepEqual(keptOf(w), [["3d", ["failed", "unsupported"]]], "the read is kept as it came, as before");
  assert.deepEqual(w.bell(), [["post_down", "Taken down · The finish", "From Instagram", false]]);
  // Asked again (a job run twice): a post taken down is read no more, and the bell is not rung a second time.
  calls.length = 0;
  assert.deepEqual(await w.run(), { skipped: "taken_down" });
  assert.deepEqual(calls, []);
  assert.equal(w.bell().length, 1);
});

test("refused by its id, and the account's own list does not read: the connection failed, not the post", async () => {
  meta[`GET /${MEDIA}/insights`] = NUMBERS_GONE;
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  const w = world();
  await w.run();
  assert.equal(w.post().status, "published", "never said to be down on a read that proves nothing");
  assert.deepEqual(w.bell(), []);
});

test("refused by its id, while the account's own list still holds it: still up", async () => {
  meta[`GET /${MEDIA}/insights`] = NUMBERS_GONE;
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  meta[`GET /${ACCOUNT}/media`] = [200, { data: [{ id: MEDIA, timestamp: new Date().toISOString() }] }];
  const w = world();
  await w.run();
  assert.equal(w.post().status, "published");
  assert.deepEqual(w.bell(), []);
});

test("a read that gives its numbers asks nothing more, and one with no answer finds the post still there", async () => {
  meta[`GET /${MEDIA}/insights`] = NUMBERS;
  const read = world();
  await read.run();
  assert.deepEqual(calls, [`GET /${MEDIA}/insights`]);
  assert.equal(read.post().status, "published");
  calls.length = 0;
  meta = { [`GET /${MEDIA}`]: [200, { id: MEDIA, permalink: "https://www.instagram.com/p/abc/" }] };
  const silent = world();
  await silent.run();
  // No answer (asked again once by the client): the account is asked for the post, and holds it.
  assert.deepEqual([...new Set(calls)], [`GET /${MEDIA}/insights`, `GET /${MEDIA}`]);
  assert.equal(silent.post().status, "published");
  assert.deepEqual(silent.bell(), []);
});

test("with the numbers line off nothing is read, and nothing is judged: the next step asks again", async () => {
  const w = world({ insights: false });
  await w.run();
  assert.deepEqual(calls, []);
  assert.deepEqual(keptOf(w), [["3d", ["failed"]]]);
  assert.equal(w.post().status, "published");
});

test("a take-down still asking is left to settle it: the post is not moved here, and the bell waits for it", async () => {
  meta[`GET /${MEDIA}/insights`] = NUMBERS_GONE;
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  meta[`GET /${ACCOUNT}/media`] = LIST_WITHOUT_IT;
  const w = world({ takeDown: "pending" });
  await w.run();
  assert.equal(w.post().status, "published");
  assert.equal(w.tables.remediation_actions[0].outcome, "pending");
  assert.deepEqual(w.bell(), []);
});

test("a take-down left to its owner, and the post deleted there: taken down, and the line that asked is closed", async () => {
  meta[`GET /${MEDIA}/insights`] = NUMBERS_GONE;
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  meta[`GET /${ACCOUNT}/media`] = LIST_WITHOUT_IT;
  const asked = {
    kind: "post_by_hand",
    title: "Delete it in Instagram · The finish",
    body: "Chanlytics couldn't take it down there",
  };
  const w = world({ takeDown: "needs_person", bell: [asked] });
  await w.run();
  assert.equal(w.post().status, "taken_down");
  assert.deepEqual(w.bell(), [
    ["post_by_hand", "Delete it in Instagram · The finish", "Chanlytics couldn't take it down there", true],
    ["post_down", "Taken down · The finish", "From Instagram", false],
  ]);
});

test("a story is judged only within its day: past it, it ended by itself", async () => {
  meta[`GET /${MEDIA}/insights`] = NUMBERS_GONE;
  meta[`GET /${MEDIA}`] = BY_ID_GONE;
  meta[`GET /${ACCOUNT}/stories`] = [200, { data: [] }];
  const ended = world({ kind: "story", upFor: DAY_MS + HOUR_MS });
  await ended.run("1d");
  assert.deepEqual(calls, [`GET /${MEDIA}/insights`], "nothing is asked of an ended story");
  assert.equal(ended.post().status, "published");
  calls.length = 0;
  const deleted = world({ kind: "story", upFor: 22 * HOUR_MS });
  await deleted.run("1d");
  assert.deepEqual(calls, [`GET /${MEDIA}/insights`, `GET /${MEDIA}`, `GET /${ACCOUNT}/stories`]);
  assert.equal(deleted.post().status, "taken_down");
});
