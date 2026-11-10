/**
 * A post on its way to Instagram (00611, decision 0121; lib/instagram/post-ready.ts and post-send.ts). Prepare signs the post's
 * own picture and asks Instagram for a container of it, keeping the request without a token or the signed address, and
 * schedules the send once the container is ready; a second run asks after the same container. Publish rechecks right before
 * the send and holds in words when anything moved, says it is about to speak before the one call, and keeps what came
 * back. A send with no answer is Checking, never sent again blind: the reconcile reads what the account has, finds it up, or
 * begins one fresh attempt, and never a third. Each refusal is the owner's sentence.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { ON_INSTAGRAM } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL", "META_APP_ID"]) delete process.env[k];
const realSecret = process.env.META_APP_SECRET;
process.env.META_APP_SECRET = "meta-secret-for-posts";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { postJobs } = await import(at("apps/edge/lib/instagram/post-send.ts"));
const { settleJob } = await import(at("packages/jobs/src/runner/settle.ts"));

const T = "aaaa1111-4444-4000-8000-000000000001";
const OWNER = "bbbb2222-4444-4000-8000-000000000002";
const FILE = "cccc3333-4444-4000-8000-000000000003";
const POST = "dddd4444-4444-4000-8000-000000000004";
const ROW = "eeee5555-4444-4000-8000-000000000005";
const ACCOUNT = "17841400000000001";
const CONTAINER = "18000000000000001";
const MEDIA = "17900000000000001";
const NOW = Date.now();
const ALL = ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"];

/** Instagram, answering each call by what `meta` holds; every call is kept. */
let meta;
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? Object.fromEntries(new URLSearchParams(init.body)) : {};
  calls.push({ path: u.pathname, method, body, query: Object.fromEntries(u.searchParams) });
  const route = `${method} ${u.pathname.replace("/v27.0", "")}`;
  const answer = meta[route] ?? [404, { error: { message: "no such route", code: 803 } }];
  const [status, json] = typeof answer === "function" ? answer() : answer;
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
  meta = {
    [`GET /${ACCOUNT}/content_publishing_limit`]: [200, { data: [{ quota_usage: 3, config: { quota_total: 100 } }] }],
    [`POST /${ACCOUNT}/media`]: [200, { id: CONTAINER }],
    [`GET /${CONTAINER}`]: [200, { status_code: "FINISHED", status: "Finished" }],
    [`POST /${ACCOUNT}/media_publish`]: [200, { id: MEDIA }],
    [`GET /${MEDIA}`]: [
      200,
      { id: MEDIA, permalink: "https://www.instagram.com/p/abc/", timestamp: new Date().toISOString() },
    ],
    [`GET /${ACCOUNT}/media`]: [200, { data: [] }],
    [`GET /${ACCOUNT}/stories`]: [200, { data: [] }],
  };
});

/** A workspace with one made post, its Meta account, and the post where `status` says. */
function world({
  status = "queued",
  kind = "picture",
  caption = "Open late on Fridays.",
  attempts = [],
  may = true,
} = {}) {
  const tables = {
    tenants: [{ id: T }],
    files: [{ id: FILE, tenant_id: T, source: "made", status: "filed", removed_at: null }],
    tenant_channels: [
      {
        id: ROW,
        tenant_id: T,
        kind: "instagram",
        external_id: ACCOUNT,
        credentials_ref: "ref-1",
        status: "active",
        config: { login: "meta", scopes: ALL, username: "studio" },
        created_at: new Date(NOW - 86_400_000).toISOString(),
      },
    ],
    posts: [
      {
        id: POST,
        tenant_id: T,
        file_id: FILE,
        place: "instagram",
        kind,
        caption: kind === "story" ? null : caption,
        status,
        scheduled_for: new Date(NOW).toISOString(),
        approved_by: OWNER,
        approved_at: new Date(NOW).toISOString(),
        via: "press",
        held_reason: null,
        attempts: Math.max(0, ...attempts.map((a) => a.attempt_no)),
        container_id: status === "queued" ? null : CONTAINER,
        external_id: null,
        permalink: null,
        published_at: null,
        error: null,
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
      },
    ],
    publish_attempts: attempts,
    jobs: [],
  };
  const vault = { [ROW]: { access_token: "bisu-token", account_id: ACCOUNT, login: "meta" } };
  const post = () => tables.posts[0];
  const db = fakeDb(
    tables,
    {},
    {
      get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null,
      has_permission: () => may,
      post_attempt_open: ({ p_post_id, p_attempt_no, p_step, p_request }) => {
        let row = tables.publish_attempts.find(
          (a) => a.post_id === p_post_id && a.attempt_no === p_attempt_no && a.step === p_step,
        );
        if (!row) {
          row = {
            id: `att-${tables.publish_attempts.length + 1}`,
            tenant_id: T,
            post_id: p_post_id,
            attempt_no: p_attempt_no,
            step: p_step,
            request: p_request,
            started_at: new Date().toISOString(),
            finished_at: null,
            outcome: null,
            container_id: null,
            external_id: null,
            answer: null,
            http_status: null,
            error: null,
          };
          tables.publish_attempts.push(row);
        }
        post().attempts = Math.max(post().attempts, p_attempt_no);
        return {
          fate: "open",
          id: row.id,
          finished: row.finished_at !== null,
          outcome: row.outcome,
          container_id: row.container_id,
          external_id: row.external_id,
        };
      },
      post_attempt_close: (a) => {
        const row = tables.publish_attempts.find((r) => r.id === a.p_attempt_id && r.finished_at === null);
        if (!row) return false;
        Object.assign(row, {
          finished_at: new Date().toISOString(),
          outcome: a.p_outcome,
          http_status: a.p_http_status ?? null,
          answer: a.p_answer ?? null,
          container_id: a.p_container_id ?? null,
          external_id: a.p_external_id ?? null,
          error: a.p_error ?? null,
        });
        if (a.p_container_id) post().container_id = a.p_container_id;
        if (a.p_external_id) post().external_id = a.p_external_id;
        return true;
      },
      // The two doors that write a post's move and its job together (00611), as the migration does.
      post_unanswered: ({ p_post_id, p_attempt }) => {
        if (post().id !== p_post_id || post().status !== "publishing") return false;
        post().status = "checking";
        tables.jobs.push({
          id: `j${tables.jobs.length + 1}`,
          tenant_id: T,
          kind: "post_reconcile",
          state: "scheduled",
          due_at: new Date(Date.now() + 120_000).toISOString(),
          payload: { post_id: p_post_id, attempt: p_attempt },
        });
        return true;
      },
      post_again: ({ p_post_id, p_from }) => {
        if (post().id !== p_post_id || post().status !== p_from || post().attempts >= 2) return false;
        post().status = "queued";
        post().container_id = null;
        tables.jobs.push({
          id: `j${tables.jobs.length + 1}`,
          tenant_id: T,
          kind: "post_prepare",
          state: "scheduled",
          due_at: new Date().toISOString(),
          payload: { post_id: p_post_id, attempt: "2" },
        });
        return true;
      },
      post_moved: ({ p_post_id, p_from, p_to, p_patch }) => {
        const p = tables.posts.find((r) => r.id === p_post_id);
        if (!p || !p_from.includes(p.status)) return false;
        p.status = p_to;
        p.held_reason = p_to === "held" ? p_patch.held_reason : null;
        if (p_patch.permalink) p.permalink = p_patch.permalink;
        if (p_patch.external_id) p.external_id = p_patch.external_id;
        if (p_to === "published") p.published_at = p_patch.published_at ?? new Date().toISOString();
        if (p_patch.error) p.error = p_patch.error;
        return true;
      },
    },
  );
  db.storage = {
    from: () => ({
      createSignedUrl: async (p) => ({
        data: { signedUrl: `https://storage.example/sign/${p}?token=secret-sig` },
        error: null,
      }),
    }),
  };
  setPg(db);
  return { db, tables, post };
}

const job = (kind, attempt = "1", id = "job-1") => ({
  id,
  tenant_id: T,
  kind,
  payload: { post_id: POST, attempt },
  attempts: 1,
});
const quick = { pause: async () => {} };
const SOON = () => Date.now() + 60_000;
const scheduled = (w) => w.tables.jobs.map((j) => [j.kind, j.payload.attempt]);
const sent = (route) => calls.filter((c) => `${c.method} ${c.path.replace("/v27.0", "")}` === route);
const fired = (w, kind, attempt = "1") => {
  const row = {
    id: "job-1",
    tenant_id: T,
    kind,
    payload: { post_id: POST, attempt },
    state: "fired",
    attempts: 1,
    due_at: new Date().toISOString(),
    spoke_at: null,
  };
  w.tables.jobs.push(row);
  return row;
};

test("a picture is made ready from its own shape: the request kept without its address or a token, and the send set for its time", async () => {
  const w = world();
  assert.equal(await postJobs(w.db, quick).prepare(job("post_prepare"), SOON()), undefined);
  const [made] = sent(`POST /${ACCOUNT}/media`);
  assert.equal(made.body.image_url, `https://storage.example/sign/${T}/${FILE}/original.jpg?token=secret-sig`);
  assert.equal(made.body.caption, "Open late on Fridays.");
  assert.equal(made.body.media_type, undefined, "a picture names no type");
  assert.ok(made.body.appsecret_proof, "every call carries the token's proof");
  assert.equal(made.query.access_token, undefined, "the token rides in the body, never the address");
  const [attempt] = w.tables.publish_attempts;
  assert.equal(attempt.step, "container");
  assert.equal(attempt.outcome, "ok");
  assert.equal(attempt.container_id, CONTAINER);
  assert.deepEqual(attempt.request, { image_url: "storage.example", caption: "Open late on Fridays." });
  assert.ok(!JSON.stringify(attempt.request).includes("bisu-token"));
  assert.equal(w.post().status, "preparing");
  assert.equal(w.post().container_id, CONTAINER);
  assert.deepEqual(scheduled(w), [["post_publish", "1"]]);
});

test("a story is sent as one, from its story shape, with no caption", async () => {
  const w = world({ kind: "story" });
  await postJobs(w.db, quick).prepare(job("post_prepare"), SOON());
  const [made] = sent(`POST /${ACCOUNT}/media`);
  assert.equal(made.body.media_type, "STORIES");
  assert.equal(made.body.caption, undefined);
  assert.match(made.body.image_url, /\/story\.jpg\?/);
});

test("at the day's limit nothing is made, and the owner hears why", async () => {
  const w = world();
  meta[`GET /${ACCOUNT}/content_publishing_limit`] = [
    200,
    { data: [{ quota_usage: 100, config: { quota_total: 100 } }] },
  ];
  await assert.rejects(
    postJobs(w.db, quick).prepare(job("post_prepare"), SOON()),
    (e) => e.why === ON_INSTAGRAM.refused.limit,
  );
  assert.equal(sent(`POST /${ACCOUNT}/media`).length, 0);
});

test("a pulled post is left alone, and one whose account went is held in words", async () => {
  const pulled = world({ status: "pulled" });
  assert.deepEqual(await postJobs(pulled.db, quick).prepare(job("post_prepare"), SOON()), { skipped: "pulled" });
  assert.equal(calls.length, 0);
  const gone = world();
  gone.tables.tenant_channels[0].status = "disabled";
  assert.deepEqual(await postJobs(gone.db, quick).prepare(job("post_prepare"), SOON()), { skipped: "held" });
  assert.equal(gone.post().status, "held");
  assert.equal(gone.post().held_reason, ON_INSTAGRAM.held.disconnected);
  assert.equal(calls.length, 0);
  const off = world();
  off.tables.tenant_channels[0].config.scopes = ["instagram_basic", "instagram_manage_messages"];
  await postJobs(off.db, quick).prepare(job("post_prepare"), SOON());
  assert.equal(off.post().held_reason, ON_INSTAGRAM.held.lineOff);
});

test("Instagram's refusal of the picture is the owner's sentence, kept on its send", async () => {
  const w = world();
  meta[`POST /${ACCOUNT}/media`] = [400, { error: { message: "aspect ratio", code: 36003, error_subcode: 2207009 } }];
  await assert.rejects(
    postJobs(w.db, quick).prepare(job("post_prepare"), SOON()),
    (e) => e.why === ON_INSTAGRAM.refused.picture,
  );
  const [attempt] = w.tables.publish_attempts;
  assert.equal(attempt.outcome, "refused");
  assert.equal(attempt.error.words, ON_INSTAGRAM.refused.picture);
});

test("a container still being made brings the job back, and the next run asks after the same one", async () => {
  const w = world();
  meta[`GET /${CONTAINER}`] = [200, { status_code: "IN_PROGRESS", status: "In progress" }];
  await assert.rejects(postJobs(w.db, quick).prepare(job("post_prepare"), SOON()), /not ready yet/);
  meta[`GET /${CONTAINER}`] = [200, { status_code: "FINISHED", status: "Finished" }];
  await postJobs(w.db, quick).prepare(job("post_prepare"), SOON());
  assert.equal(sent(`POST /${ACCOUNT}/media`).length, 1, "one container, never two");
  assert.deepEqual(scheduled(w), [["post_publish", "1"]]);
});

test("a container Instagram could not make fails the post in words", async () => {
  const w = world();
  meta[`GET /${CONTAINER}`] = [200, { status_code: "ERROR", status: "Error: bad image" }];
  await assert.rejects(
    postJobs(w.db, quick).prepare(job("post_prepare"), SOON()),
    (e) => e.why === ON_INSTAGRAM.refused.picture,
  );
});

const READY = [
  {
    id: "att-1",
    tenant_id: T,
    post_id: POST,
    attempt_no: 1,
    step: "container",
    request: {},
    started_at: new Date(NOW).toISOString(),
    finished_at: new Date(NOW).toISOString(),
    outcome: "ok",
    container_id: CONTAINER,
    external_id: null,
    answer: null,
    http_status: 200,
    error: null,
  },
];

test("the recheck holds the post, sending nothing, when its approver can no longer post", async () => {
  const w = world({ status: "preparing", attempts: [...READY], may: false });
  const row = fired(w, "post_publish");
  assert.deepEqual(await postJobs(w.db, quick).publish(row), { skipped: "held" });
  assert.equal(w.post().status, "held");
  assert.equal(w.post().held_reason, ON_INSTAGRAM.held.approver);
  assert.equal(sent(`POST /${ACCOUNT}/media_publish`).length, 0);
  assert.equal(row.spoke_at, null, "nothing was about to speak");
});

test("the send says it is about to speak first, and the post keeps its id and address", async () => {
  const w = world({ status: "preparing", attempts: [...READY] });
  const row = fired(w, "post_publish");
  await postJobs(w.db, quick).publish(row);
  assert.ok(row.spoke_at, "marked spoken before the call");
  const [publish] = sent(`POST /${ACCOUNT}/media_publish`);
  assert.equal(publish.body.creation_id, CONTAINER);
  assert.equal(w.post().status, "published");
  assert.equal(w.post().external_id, MEDIA);
  assert.equal(w.post().permalink, "https://www.instagram.com/p/abc/");
  const send = w.tables.publish_attempts.find((a) => a.step === "publish");
  assert.equal(send.outcome, "ok");
  assert.equal(send.external_id, MEDIA);
});

test("a send with no answer is Checking, and Instagram is asked two minutes on, never sent again", async () => {
  const w = world({ status: "preparing", attempts: [...READY] });
  meta[`POST /${ACCOUNT}/media_publish`] = [503, { error: { message: "unavailable", code: 2 } }];
  const row = fired(w, "post_publish");
  await postJobs(w.db, quick).publish(row);
  assert.equal(w.post().status, "checking");
  const reconcile = w.tables.jobs.find((j) => j.kind === "post_reconcile");
  assert.ok(reconcile);
  assert.ok(Date.parse(reconcile.due_at) - Date.now() > 100_000, "two minutes on");
  assert.equal(w.tables.publish_attempts.find((a) => a.step === "publish").outcome, "no_answer");
});

test("a send Instagram refused fails the post in the owner's words", async () => {
  const w = world({ status: "preparing", attempts: [...READY] });
  meta[`POST /${ACCOUNT}/media_publish`] = [400, { error: { message: "Invalid token", code: 190 } }];
  await assert.rejects(
    postJobs(w.db, quick).publish(fired(w, "post_publish")),
    (e) => e.why === ON_INSTAGRAM.refused.token,
  );
  assert.equal(w.post().status, "failed");
  assert.equal(w.post().error.words, ON_INSTAGRAM.refused.token);
});

const SENT = (no) => ({
  id: `send-${no}`,
  tenant_id: T,
  post_id: POST,
  attempt_no: no,
  step: "publish",
  request: { creation_id: CONTAINER },
  started_at: new Date(NOW - 180_000).toISOString(),
  finished_at: new Date(NOW).toISOString(),
  outcome: "no_answer",
  container_id: null,
  external_id: null,
  answer: null,
  http_status: null,
  error: null,
});

test("the reconcile finds the post up on the account and keeps it", async () => {
  const w = world({ status: "checking", attempts: [...READY, SENT(1)] });
  meta[`GET /${CONTAINER}`] = [200, { status_code: "PUBLISHED", status: "Published" }];
  meta[`GET /${ACCOUNT}/media`] = [
    200,
    {
      data: [
        {
          id: MEDIA,
          caption: "Open late on Fridays.",
          timestamp: new Date(NOW - 120_000).toISOString(),
          permalink: "https://www.instagram.com/p/abc/",
        },
      ],
    },
  ];
  await postJobs(w.db, quick).reconcile(job("post_reconcile"));
  assert.equal(w.post().status, "published");
  assert.equal(w.post().external_id, MEDIA);
  assert.equal(sent(`POST /${ACCOUNT}/media_publish`).length, 0, "nothing sent again");
});

test("a send that never landed begins one fresh attempt, and a second that never landed is told", async () => {
  const w = world({ status: "checking", attempts: [...READY, SENT(1)] });
  await postJobs(w.db, quick).reconcile(job("post_reconcile"));
  assert.equal(w.post().status, "queued");
  assert.deepEqual(scheduled(w), [["post_prepare", "2"]]);
  const twice = world({ status: "checking", attempts: [...READY, SENT(1), SENT(2)] });
  await assert.rejects(
    postJobs(twice.db, quick).reconcile(job("post_reconcile", "2")),
    (e) => e.why === ON_INSTAGRAM.notSent,
  );
  assert.equal(twice.post().status, "failed");
  assert.equal(twice.tables.jobs.length, 0, "never a third");
});

test("the ledger settles a send whose run died as Checking, and a prepare that gave up as not posted", async () => {
  const w = world({ status: "publishing", attempts: [...READY] });
  await settleJob(
    w.db,
    { id: "j", kind: "post_publish", tenant_id: T, payload: { post_id: POST, attempt: "1" } },
    false,
  );
  assert.equal(w.post().status, "checking");
  assert.deepEqual(scheduled(w), [["post_reconcile", "1"]]);
  const p = world({ status: "preparing" });
  await settleJob(
    p.db,
    { id: "j", kind: "post_prepare", tenant_id: T, payload: { post_id: POST, attempt: "1" } },
    true,
    "Instagram allows only so many posts a day, and this account has used them. Post it again tomorrow.",
  );
  assert.equal(p.post().status, "failed");
  assert.equal(p.post().error.words, ON_INSTAGRAM.refused.limit);
});
