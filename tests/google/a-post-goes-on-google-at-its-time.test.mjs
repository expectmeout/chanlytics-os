/**
 * A post set for its time on Google (00616, the content redesign's stage 3): post_google, at the edge, over a database in
 * memory, Vault's door over a map, and a captured wire where Google would be. At its time the recheck runs, Google is asked
 * once, as the owner, to fetch the picture drawn at the press, and the placement is settled: up with Google's name, held in
 * words with nothing sent, or failed in the owner's words. One that went up, or was held, rings the bell; nothing is sent
 * twice, and a run that died after speaking is said so rather than sent again.
 *
 * ORDER OF SETUP MATTERS, as in a-post-goes-on-google.test.mjs: lib/shared/google/places.ts binds fetch at module scope, so the
 * wire goes in first.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FILE_WORDS, ON_INSTAGRAM } from "@chanlytics/contracts";
import { POST_BELL } from "../../apps/edge/lib/files/post-bell.ts";
import { fakeDb } from "../_fake-db.mjs";

process.env.GOOGLE_PLACES_API_KEY = "places-key-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_ID = "oauth-client-for-this-file";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "oauth-secret-for-this-file";
process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://dash.test/api/v1/google/callback";
process.env.GOOGLE_OAUTH_AUDIENCE = "testing";
for (const k of ["ANTHROPIC_API_KEY", "DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"])
  delete process.env[k];

/** Google, answering each ask by what `google` says; every ask is kept. */
let google = null;
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const req = {
    url: String(url),
    method: init.method ?? "GET",
    body: typeof init.body === "string" ? init.body : null,
  };
  calls.push(req);
  if (!google) throw new Error(`nothing on the wire answers ${req.method} ${req.url}`);
  const [status, body] = google(req);
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};
after(() => {
  globalThis.fetch = realFetch;
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { sendGooglePost } = await import(at("apps/edge/lib/google/post-later.ts"));
const { settleJob } = await import(at("packages/jobs/src/runner/settle.ts"));
after(() => setPg(null));

const T = "aaaa1111-4444-4000-8000-000000000001";
const OWNER = "bbbb2222-4444-4000-8000-000000000002";
const FILE = "cccc3333-4444-4000-8000-000000000003";
const POST = "dddd4444-4444-4000-8000-000000000004";
const HOUR = 3_600_000;
const NAME = "accounts/111/locations/222/localPosts/999";
const POSTS_URL = "https://mybusiness.googleapis.com/v4/accounts/111/locations/222/localPosts";
const PLAN = { line: "Open late this Saturday", under: null, language: "es", book: true };

const connection = {
  tenant_id: T,
  google_email: "owner@example.com",
  google_sub: "sub-1",
  account_name: "accounts/111",
  account_title: "Harbor",
  location_name: "locations/222",
  location_title: "Harbor Moving",
  scopes: ["https://www.googleapis.com/auth/business.manage"],
  connected_by: OWNER,
  connected_at: "2026-11-01T00:00:00Z",
  last_synced_at: "2026-11-05T00:00:00Z",
  sync_error: null,
  reviews_complete: false,
};

function world({ status = "queued", may = true, removed = false, connected = true, waited = true } = {}) {
  const now = Date.now();
  const tables = {
    tenants: [{ id: T, name: "Harbor Moving", slug: "harbor-moving", timezone: "UTC", status: "active" }],
    files: [
      {
        id: FILE,
        tenant_id: T,
        name: "open-late-this-saturday",
        source: "made",
        status: "filed",
        kind: "image",
        removed_at: removed ? new Date(now).toISOString() : null,
        made: { from: null, plan: PLAN },
      },
    ],
    google_connections: connected ? [connection] : [],
    google_listings: [],
    google_reviews: [],
    posts: [
      {
        id: POST,
        tenant_id: T,
        file_id: FILE,
        place: "google",
        kind: "picture",
        caption: "Open late this Saturday. Book yours.",
        status,
        // Set yesterday for now: a post that waited for its time.
        scheduled_for: new Date(now).toISOString(),
        approved_by: OWNER,
        approved_at: new Date(now - (waited ? 24 * HOUR : 0)).toISOString(),
        via: "press",
        held_reason: null,
        attempts: 0,
        container_id: null,
        external_id: null,
        permalink: null,
        published_at: null,
        error: null,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      },
    ],
    publish_attempts: [],
    jobs: [],
    notifications: [],
    events: [],
    policies: [],
    tenant_config: [],
  };
  const post = () => tables.posts[0];
  const db = fakeDb(
    tables,
    {},
    {
      get_google_credentials: () => ({
        refresh_token: "rt-1",
        access_token: "at-good",
        expires_at: Date.now() + HOUR,
        scope: "openid email",
      }),
      has_permission: () => may,
      post_attempt_open: ({ p_post_id, p_attempt_no, p_step, p_request }) => {
        const row = {
          id: `att-${tables.publish_attempts.length + 1}`,
          post_id: p_post_id,
          attempt_no: p_attempt_no,
          step: p_step,
          request: p_request,
          finished_at: null,
          outcome: null,
          external_id: null,
          error: null,
        };
        tables.publish_attempts.push(row);
        return { fate: "open", id: row.id, finished: false, outcome: null, container_id: null, external_id: null };
      },
      post_attempt_close: (a) => {
        const row = tables.publish_attempts.find((r) => r.id === a.p_attempt_id && r.finished_at === null);
        if (!row) return false;
        Object.assign(row, {
          finished_at: new Date().toISOString(),
          outcome: a.p_outcome,
          external_id: a.p_external_id ?? null,
          error: a.p_error ?? null,
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
        if (p_patch.error) p.error = p_patch.error;
        return true;
      },
    },
  );
  db.storage = {
    from: () => ({
      createSignedUrl: async (p) => ({
        data: { signedUrl: `https://storage.example/sign/${p}?token=sig` },
        error: null,
      }),
    }),
  };
  setPg(db);
  return { db, tables, post };
}

const job = (attempt = "1") => ({
  id: "job-1",
  tenant_id: T,
  kind: "post_google",
  payload: { post_id: POST, attempt },
  attempts: 1,
});
/** The job as the run holds it on the ledger, so it may say it spoke (markSpoke). */
const fired = (w) => {
  w.tables.jobs.push({ ...job(), state: "fired", due_at: new Date().toISOString(), spoke_at: null });
  return job();
};
const asking = () => {
  calls.length = 0;
  google = () => [200, { name: NAME, state: "PROCESSING", searchUrl: "https://local.google.com/place?use=posts" }];
};

test("at its time it goes up as the owner, with its words and the picture drawn at the press, and the bell says so", async () => {
  const w = world();
  asking();
  assert.equal(await sendGooglePost(w.db, fired(w)), undefined);
  const asked = calls.filter((c) => c.url === POSTS_URL);
  assert.equal(asked.length, 1, "Google asked once");
  const sent = JSON.parse(asked[0].body);
  assert.equal(sent.summary, "Open late this Saturday. Book yours.", "the words as they were set");
  assert.equal(sent.languageCode, "es", "in the post's own language");
  assert.deepEqual(sent.callToAction, { actionType: "CALL" }, "the post's own Call");
  assert.equal(sent.media[0].sourceUrl, `https://storage.example/sign/${T}/${FILE}/google.jpg?token=sig`);
  assert.equal(w.post().status, "published");
  assert.equal(w.post().external_id, NAME, "Google's name for it, which is how it comes down");
  assert.equal(w.tables.publish_attempts[0].outcome, "ok");
  const [rang] = w.tables.notifications;
  assert.equal(rang.kind, "post_up");
  assert.equal(rang.title, POST_BELL.up("google"));
  assert.equal(rang.route, `campaigns/content:${FILE}`, "the row opens the piece");
});

test("one set at its press for now says nothing on the bell: it is seen where it was pressed", async () => {
  const w = world({ waited: false });
  asking();
  await sendGooglePost(w.db, fired(w));
  assert.equal(w.post().status, "published");
  assert.equal(w.tables.notifications.length, 0);
});

test("the recheck holds it in words and asks Google nothing: deleted since, or whoever set it may no longer post", async () => {
  for (const [over, why] of [
    [{ removed: true }, ON_INSTAGRAM.held.removed],
    [{ may: false }, ON_INSTAGRAM.held.approver],
  ]) {
    const w = world(over);
    asking();
    assert.deepEqual(await sendGooglePost(w.db, job()), { skipped: "held" });
    assert.equal(calls.length, 0, "nothing reaches Google");
    assert.equal(w.post().status, "held");
    assert.equal(w.post().held_reason, why);
    const [rang] = w.tables.notifications;
    assert.equal(rang.kind, "post_stopped");
    // Opened in Needs you on its post sheet, where it says why (post-bell.ts postBellRouteOf, held: `post`).
    assert.equal(rang.route, `campaigns/content:needs:${FILE}:post`, "the row opens it in Needs you");
  }
});

test("Google let go of holds it for the owner to post again once it is connected; a refusal fails it in words", async () => {
  const lost = world({ connected: false });
  asking();
  assert.deepEqual(await sendGooglePost(lost.db, fired(lost)), { skipped: "held" });
  assert.equal(lost.post().status, "held");
  assert.equal(lost.post().held_reason, FILE_WORDS.google.heldNoConnection);
  assert.equal(lost.tables.notifications[0].kind, "post_stopped");

  const refused = world();
  calls.length = 0;
  google = () => [400, { error: { message: "Request contains an invalid argument." } }];
  await assert.rejects(
    sendGooglePost(refused.db, fired(refused)),
    (e) => e.name === "CertainFailure" || /refused/.test(e.message),
  );
  assert.equal(refused.post().status, "failed");
  assert.match(refused.post().error.words, new RegExp(`^${FILE_WORDS.google.refused}`));
  assert.equal(refused.tables.publish_attempts[0].outcome, "refused");
});

test("a post no longer waiting is left where it stands, and Google is asked nothing", async () => {
  for (const status of ["pulled", "published", "held", "failed"]) {
    const w = world({ status });
    asking();
    assert.deepEqual(await sendGooglePost(w.db, job()), { skipped: status });
    assert.equal(calls.length, 0);
    assert.equal(w.post().status, status);
  }
});

test("a run that died after speaking is said so, never sent again blind; one certainly not taken is failed in its words", async () => {
  const died = world({ status: "publishing" });
  await settleJob(died.db, job(), false);
  assert.equal(died.post().status, "failed");
  assert.equal(died.post().error.words, FILE_WORDS.google.unknown);
  const before = world();
  await settleJob(before.db, job(), true, "Google did not take the post.");
  assert.equal(before.post().status, "failed", "one that never left its queue is failed too, not left waiting");
});
