/**
 * A post comes down only when its place said so (the content loop PRD's 5.3, 8.3 and 15.1; 00692): the take-down job asks
 * the place once through its adapter and keeps what it said. Instagram's yes takes the post down; its refusal leaves the
 * step to the owner in words, with the post still up; no answer is asked again, further apart, and past a day fails to
 * us with the action still waiting. After "I deleted it" nothing is asked down: the account is read, and only an account
 * that reads and no longer holds the post settles it. An action already settled asks nothing.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { ON_INSTAGRAM, TAKE_DOWN_WORDS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL", "META_APP_ID"]) delete process.env[k];
const realSecret = process.env.META_APP_SECRET;
process.env.META_APP_SECRET = "meta-secret-for-posts";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { takePostDown, TAKE_DOWN_WAITS_MS } = await import(at("apps/edge/lib/content/take-down.ts"));
const { takeDownPlaceFor } = await import(at("apps/edge/lib/instagram/post-ready.ts"));

const T = "aaaa1111-4444-4000-8000-000000000021";
const OWNER = "bbbb2222-4444-4000-8000-000000000022";
const FILE = "cccc3333-4444-4000-8000-000000000023";
const POST = "dddd4444-4444-4000-8000-000000000024";
const ROW = "eeee5555-4444-4000-8000-000000000025";
const REM = "ffff6666-4444-4000-8000-000000000026";
const ACTION = "abab0000-4444-4000-8000-000000000027";
const ACCOUNT = "17841400000000003";
const MEDIA = "17900000000000021";
const ALL = ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"];
const GONE = [400, { error: { message: "Object does not exist", type: "GraphMethodException", code: 100 } }];

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

/** A workspace with one post up on Instagram and its take-down asked, as post_take_down_begin leaves them. */
function world({ status = "published", outcome = "pending", connected = true } = {}) {
  const now = new Date().toISOString();
  const tables = {
    tenants: [{ id: T, timezone: "America/New_York", sending_stopped_at: null }],
    files: [{ id: FILE, tenant_id: T, kind: "image", source: "made", status: "filed", removed_at: null, made: null }],
    tenant_channels: connected
      ? [
          {
            id: ROW,
            tenant_id: T,
            kind: "instagram",
            external_id: ACCOUNT,
            credentials_ref: "ref-1",
            status: "active",
            config: { login: "meta", scopes: ALL, username: "studio" },
            created_at: now,
          },
        ]
      : [],
    posts: [
      {
        id: POST,
        tenant_id: T,
        file_id: FILE,
        place: "instagram",
        kind: "picture",
        caption: "Open late on Fridays.",
        status,
        scheduled_for: now,
        approved_by: OWNER,
        approved_at: now,
        via: "press",
        held_reason: null,
        held_why: null,
        attempts: 1,
        container_id: "18000000000000021",
        external_id: status === "published" ? MEDIA : null,
        permalink: "https://www.instagram.com/p/abc/",
        published_at: status === "published" ? now : null,
        error: null,
        verified_at: now,
        account_id: ACCOUNT,
        created_at: now,
        updated_at: now,
      },
    ],
    remediations: [
      { id: REM, tenant_id: T, cause: "owner_removed", subject_type: "file", subject_id: FILE, created_at: now },
    ],
    remediation_actions: [
      {
        id: ACTION,
        tenant_id: T,
        remediation_id: REM,
        target_type: "post",
        target_id: POST,
        act: "take_down",
        outcome,
        said: null,
        started_at: now,
        finished_at: outcome === "pending" ? null : now,
      },
    ],
    jobs: [],
  };
  const action = () => tables.remediation_actions[0];
  const post = () => tables.posts[0];
  const db = fakeDb(
    tables,
    {},
    {
      get_channel_credentials: () => ({ access_token: "bisu-token", account_id: ACCOUNT, login: "meta" }),
      // The door as 00692 writes it: kept once; done, and only done, marks the post taken down.
      post_take_down_settle: ({ p_action_id, p_outcome, p_said }) => {
        const row = tables.remediation_actions.find((r) => r.id === p_action_id);
        if (!row) return { fate: "unknown" };
        if (row.outcome !== "pending") return { fate: "settled", outcome: row.outcome };
        Object.assign(row, { outcome: p_outcome, said: p_said || null, finished_at: new Date().toISOString() });
        if (p_outcome === "done") post().status = "taken_down";
        return { fate: "kept", outcome: p_outcome, post_id: row.target_id, tenant_id: row.tenant_id };
      },
    },
  );
  setPg(db);
  const job = (payload = {}) => ({
    id: "job-1",
    tenant_id: T,
    kind: "post_take_down",
    payload: { action_id: ACTION, attempt: "1", ...payload },
  });
  const run = (payload) => takePostDown(db, job(payload), (p) => takeDownPlaceFor(db, p));
  return { db, tables, action, post, run };
}

test("Instagram takes it down: asked once, and only then is the post taken down", async () => {
  meta[`DELETE /${MEDIA}`] = [200, { success: true }];
  const w = world();
  await w.run();
  assert.deepEqual(calls, [`DELETE /${MEDIA}`]);
  assert.equal(w.action().outcome, "done");
  assert.ok(w.action().finished_at);
  assert.equal(w.post().status, "taken_down");
});

test("Instagram refuses: the step is the owner's, in words, and the post is still up", async () => {
  meta[`DELETE /${MEDIA}`] = [400, { error: { message: "(#10) Application does not have permission", code: 10 } }];
  const w = world();
  await w.run();
  assert.equal(w.action().outcome, "needs_person");
  assert.equal(w.action().said, ON_INSTAGRAM.takeDown.byHand);
  assert.equal(w.post().status, "published", "a post is never said to be down before its place said so");
});

test("an account that is no longer connected is not asked: the owner deletes it there", async () => {
  const w = world({ connected: false });
  await w.run();
  assert.deepEqual(calls, []);
  assert.equal(w.action().outcome, "needs_person");
  assert.equal(w.post().status, "published");
});

test("no answer proves nothing: the action waits, and the place is asked again later", async () => {
  const w = world();
  const before = Date.now();
  assert.deepEqual(await w.run(), { skipped: "asked_again" });
  assert.equal(w.action().outcome, "pending");
  assert.equal(w.post().status, "published");
  const [again] = w.tables.jobs;
  assert.deepEqual(again.payload, { action_id: ACTION, attempt: "2" });
  const wait = Date.parse(again.due_at) - before;
  assert.ok(wait >= TAKE_DOWN_WAITS_MS[0] && wait < TAKE_DOWN_WAITS_MS[0] + 5000, `two minutes on, was ${wait}`);
});

test("a day with no answer fails to us, and the action still waits", async () => {
  const w = world();
  const last = String(TAKE_DOWN_WAITS_MS.length + 1);
  await assert.rejects(w.run({ attempt: last }), /no answer from the place in a day/);
  assert.equal(w.action().outcome, "pending");
  assert.equal(w.tables.jobs.length, 0, "nothing more is scheduled: it is ours to chase now");
  assert.ok(
    TAKE_DOWN_WAITS_MS.reduce((a, b) => a + b, 0) >= 24 * 3_600_000,
    "the asks span a day before it is given up",
  );
});

test("a post still being sent is not asked down before its place has it", async () => {
  const w = world({ status: "publishing" });
  assert.deepEqual(await w.run(), { skipped: "asked_again" });
  assert.deepEqual(calls, []);
  assert.equal(w.action().outcome, "pending");
});

test("after I deleted it, the account is read, never asked: gone settles it", async () => {
  meta[`GET /${MEDIA}`] = GONE;
  meta[`GET /${ACCOUNT}/media`] = [200, { data: [{ id: "17900000000000099", timestamp: new Date().toISOString() }] }];
  const w = world();
  await w.run({ by_hand: "yes" });
  assert.ok(!calls.some((c) => c.startsWith("DELETE")), "nothing is asked down after the owner's word");
  assert.equal(w.action().outcome, "done");
  assert.equal(w.post().status, "taken_down");
});

test("after I deleted it, a post the account still shows is the owner's again, said in words", async () => {
  meta[`GET /${MEDIA}`] = [200, { id: MEDIA, permalink: "https://www.instagram.com/p/abc/" }];
  const w = world();
  await w.run({ by_hand: "yes" });
  assert.equal(w.action().outcome, "needs_person");
  assert.equal(w.action().said, TAKE_DOWN_WORDS.stillUp("instagram"));
  assert.equal(w.post().status, "published");
});

test("after I deleted it, an account that cannot be read settles nothing", async () => {
  // Refused by its id, and the account's own list does not read either: the connection is what failed, not the post.
  meta[`GET /${MEDIA}`] = GONE;
  const w = world();
  assert.deepEqual(await w.run({ by_hand: "yes" }), { skipped: "asked_again" });
  assert.equal(w.action().outcome, "pending");
  assert.equal(w.post().status, "published");
  assert.deepEqual(w.tables.jobs[0].payload, { action_id: ACTION, attempt: "2", by_hand: "yes" });
});

test("an action already settled asks nothing", async () => {
  const w = world({ outcome: "done" });
  assert.deepEqual(await w.run(), { skipped: "done" });
  assert.deepEqual(calls, []);
});
