/**
 * A post on its way to a business's Facebook Page (the content loop PRD's pass 5; lib/facebook/posting.ts through the same
 * post jobs as Instagram's, lib/instagram/post-ready.ts and post-send.ts). Nothing is asked of Meta where the workspace has
 * Facebook switched off or the Meta link keeps no Page it may post to: the post is held in Facebook's words. Switched on,
 * the Page's token is asked with the link's, the photo is kept unpublished at the Page (the request kept without its
 * address or a token), and the send set for its time; the send makes the post with its words and keeps the Page's id for
 * it; a send with no answer is Checking, and the Page's own posts settle it by its words. A refusal is Facebook's sentence.
 * A take-down is asked of the Page, or left to the owner where the Page cannot be asked from here.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { ON_FACEBOOK } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL", "META_APP_ID"]) delete process.env[k];
const realSecret = process.env.META_APP_SECRET;
process.env.META_APP_SECRET = "meta-secret-for-posts";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { postJobs } = await import(at("apps/edge/lib/instagram/post-send.ts"));
const { takeDownPlaceFor } = await import(at("apps/edge/lib/instagram/post-ready.ts"));
const { findPagePosting } = await import(at("apps/edge/lib/facebook/posting.ts"));

const T = "aaaa1111-5555-4000-8000-000000000001";
const OWNER = "bbbb2222-5555-4000-8000-000000000002";
const FILE = "cccc3333-5555-4000-8000-000000000003";
const POST = "dddd4444-5555-4000-8000-000000000004";
const ROW = "eeee5555-5555-4000-8000-000000000005";
const ACCOUNT = "17841400000000001";
const PAGE = "100200300400500";
const PHOTO = "555000111222333";
const PAGE_POST = `${PAGE}_900800700600500`;
const NOW = Date.now();
const LINK = ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"];
const PAGES = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"];

/** Meta, answering each call by what `meta` holds; every call is kept. */
let meta;
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? Object.fromEntries(new URLSearchParams(init.body)) : {};
  const route = `${method} ${u.pathname.replace("/v27.0", "")}`;
  calls.push({ route, body, query: Object.fromEntries(u.searchParams) });
  const answer = meta[route] ?? [404, { error: { message: "no such route", code: 803 } }];
  if (answer === "silent") throw new TypeError("fetch failed");
  const [status, json] = answer;
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
    [`GET /${PAGE}`]: [200, { id: PAGE, access_token: "page-token" }],
    [`POST /${PAGE}/photos`]: [200, { id: PHOTO }],
    [`GET /${PHOTO}`]: [200, { id: PHOTO }],
    [`POST /${PAGE}/feed`]: [200, { id: PAGE_POST }],
    [`GET /${PAGE_POST}`]: [
      200,
      {
        id: PAGE_POST,
        permalink_url: "https://www.facebook.com/studio/posts/1",
        created_time: new Date().toISOString(),
      },
    ],
    [`GET /${PAGE}/published_posts`]: [200, { data: [] }],
  };
});

/** A workspace with one made post for its Page, its Meta link, and the post where `status` says. */
function world({ status = "queued", switched = true, page = true, scopes = [...LINK, ...PAGES] } = {}) {
  const tables = {
    tenants: [{ id: T }],
    tenant_config: [
      {
        tenant_id: T,
        config: { features: { places: { facebook: switched } } },
        version: 1,
        updated_at: new Date(NOW).toISOString(),
        updated_by: null,
      },
    ],
    files: [{ id: FILE, tenant_id: T, source: "made", status: "filed", removed_at: null, made: null }],
    tenant_channels: [
      {
        id: ROW,
        tenant_id: T,
        kind: "instagram",
        external_id: ACCOUNT,
        credentials_ref: "ref-1",
        status: "active",
        config: { login: "meta", scopes, username: "studio", ...(page ? { page: { id: PAGE, name: "Studio" } } : {}) },
        created_at: new Date(NOW - 86_400_000).toISOString(),
      },
    ],
    posts: [
      {
        id: POST,
        tenant_id: T,
        file_id: FILE,
        place: "facebook",
        kind: "picture",
        caption: "Open late on Fridays.",
        status,
        scheduled_for: new Date(NOW).toISOString(),
        approved_by: OWNER,
        approved_at: new Date(NOW).toISOString(),
        via: "press",
        held_reason: null,
        attempts: status === "queued" ? 0 : 1,
        container_id: status === "queued" ? null : PHOTO,
        external_id: null,
        account_id: null,
        permalink: null,
        published_at: null,
        verified_at: null,
        error: null,
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
      },
    ],
    publish_attempts: [],
    jobs: [],
  };
  const vault = { [ROW]: { access_token: "bisu-token", account_id: ACCOUNT, login: "meta" } };
  const post = () => tables.posts[0];
  const db = fakeDb(
    tables,
    {},
    {
      get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null,
      has_permission: () => true,
      post_as_approved: () => ({ is: "before" }),
      post_attempt_open: ({ p_post_id, p_attempt_no, p_step, p_request }) => {
        const row = {
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
        };
        tables.publish_attempts.push(row);
        post().attempts = Math.max(post().attempts, p_attempt_no);
        return { fate: "open", id: row.id, finished: false, outcome: null, container_id: null, external_id: null };
      },
      post_attempt_close: (a) => {
        const row = tables.publish_attempts.find((r) => r.id === a.p_attempt_id);
        Object.assign(row, {
          finished_at: new Date().toISOString(),
          outcome: a.p_outcome,
          container_id: a.p_container_id ?? null,
          external_id: a.p_external_id ?? null,
          error: a.p_error ?? null,
        });
        if (a.p_container_id) post().container_id = a.p_container_id;
        if (a.p_external_id) post().external_id = a.p_external_id;
        return true;
      },
      post_unanswered: ({ p_post_id, p_attempt }) => {
        if (post().id !== p_post_id || post().status !== "publishing") return false;
        post().status = "checking";
        tables.jobs.push({ kind: "post_reconcile", payload: { post_id: p_post_id, attempt: p_attempt } });
        return true;
      },
      post_moved: ({ p_post_id, p_from, p_to, p_patch }) => {
        const p = tables.posts.find((r) => r.id === p_post_id);
        if (!p || !p_from.includes(p.status)) return false;
        p.status = p_to;
        p.held_reason = p_to === "held" ? p_patch.held_reason : null;
        for (const key of ["permalink", "external_id", "account_id", "verified_at"])
          if (p_patch[key]) p[key] = p_patch[key];
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

const job = (kind, attempt = "1") => ({
  id: "job-1",
  tenant_id: T,
  kind,
  payload: { post_id: POST, attempt },
  attempts: 1,
});
/** A job the runner fired: a send says it is about to speak on its row before the one call (markSpoke). */
const fired = (w, kind) => {
  const row = {
    id: "job-1",
    tenant_id: T,
    kind,
    payload: { post_id: POST, attempt: "1" },
    state: "fired",
    attempts: 1,
    due_at: new Date().toISOString(),
    spoke_at: null,
  };
  w.tables.jobs.push(row);
  return row;
};
const quick = { pause: async () => {}, postingAt: { facebook: (db, post) => findPagePosting(db, post) } };
const SOON = () => Date.now() + 60_000;

test("nothing is asked of Meta where Facebook is switched off, or the link keeps no Page it may post to", async () => {
  for (const [why, w] of [
    ["switched off", world({ switched: false })],
    ["no Page kept", world({ page: false })],
    ["posting not allowed", world({ scopes: LINK })],
  ]) {
    assert.deepEqual(await postJobs(w.db, quick).prepare(job("post_prepare"), SOON()), { skipped: "held" }, why);
    assert.equal(w.post().status, "held", why);
    assert.equal(w.post().held_reason, ON_FACEBOOK.held.lineOff, why);
  }
  assert.deepEqual(calls, [], "not one call to Meta");
});

test("a picture is made ready at the Page: its token asked, the photo kept unpublished, the request kept bare", async () => {
  const w = world();
  assert.equal(await postJobs(w.db, quick).prepare(job("post_prepare"), SOON()), undefined);
  assert.equal(calls[0].route, `GET /${PAGE}`, "the Page's token first, with the link's");
  assert.equal(calls[0].query.access_token, "bisu-token");
  const photo = calls.find((c) => c.route === `POST /${PAGE}/photos`);
  assert.match(photo.body.url, /^https:\/\/storage\.example\/sign\//);
  assert.equal(photo.body.published, "false");
  assert.equal(photo.body.access_token, "page-token");
  const [attempt] = w.tables.publish_attempts;
  assert.deepEqual(attempt.request, { kind: "picture", media_host: "storage.example", with_words: "true" });
  assert.ok(!JSON.stringify(attempt.request).includes("token"), "no token and no signed address are kept");
  assert.equal(attempt.container_id, PHOTO);
  assert.equal(w.post().status, "preparing");
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.kind, j.payload.attempt]),
    [["post_publish", "1"]],
  );
});

test("the send makes the Page's post with its words, and keeps its id, its address and the Page it went to", async () => {
  const w = world({ status: "preparing" });
  await postJobs(w.db, quick).publish(fired(w, "post_publish"));
  const made = calls.find((c) => c.route === `POST /${PAGE}/feed`);
  assert.deepEqual(JSON.parse(made.body["attached_media[0]"]), { media_fbid: PHOTO });
  assert.equal(made.body.message, "Open late on Fridays.");
  assert.equal(w.post().status, "published");
  assert.equal(w.post().external_id, PAGE_POST);
  assert.equal(w.post().account_id, PAGE);
  assert.equal(w.post().permalink, "https://www.facebook.com/studio/posts/1");
  assert.ok(w.post().verified_at, "read back from the Page: seen");
});

test("a send with no answer is Checking, and the Page's own posts settle it by its words", async () => {
  meta[`POST /${PAGE}/feed`] = "silent";
  const w = world({ status: "preparing" });
  await postJobs(w.db, quick).publish(fired(w, "post_publish"));
  assert.equal(w.post().status, "checking");
  assert.equal(calls.filter((c) => c.route === `POST /${PAGE}/feed`).length, 1, "never sent twice blind");
  meta[`GET /${PAGE}/published_posts`] = [
    200,
    {
      data: [
        {
          id: PAGE_POST,
          message: "Open late on Fridays.",
          created_time: new Date().toISOString(),
          permalink_url: "https://www.facebook.com/studio/posts/1",
        },
      ],
    },
  ];
  await postJobs(w.db, quick).reconcile(job("post_reconcile"));
  assert.equal(w.post().status, "published");
  assert.equal(w.post().external_id, PAGE_POST);
});

test("a Page that will not give its token: the post is refused in Facebook's words, and nothing is made", async () => {
  meta[`GET /${PAGE}`] = [403, { error: { message: "(#200) Permissions error", code: 200 } }];
  const w = world();
  await assert.rejects(postJobs(w.db, quick).prepare(job("post_prepare"), SOON()), (e) => {
    assert.equal(e.why, ON_FACEBOOK.refused.permission);
    return true;
  });
  assert.equal(calls.filter((c) => c.route === `POST /${PAGE}/photos`).length, 0);
});

test("a take-down is asked of the Page; one that cannot be asked from here is the owner's, in Facebook's words", async () => {
  const w = world({ status: "published" });
  w.post().external_id = PAGE_POST;
  const place = await takeDownPlaceFor(w.db, w.post(), quick);
  assert.equal(place.place, "facebook");
  meta[`DELETE /${PAGE_POST}`] = [200, { success: true }];
  const done = await place.takeDown({
    postId: POST,
    kind: "picture",
    externalId: PAGE_POST,
    caption: null,
    sentAt: new Date().toISOString(),
  });
  assert.equal(done.outcome, "done");
  const off = world({ status: "published", switched: false });
  assert.deepEqual(await takeDownPlaceFor(off.db, off.post(), quick), { cant: ON_FACEBOOK.takeDown.byHand });
});
