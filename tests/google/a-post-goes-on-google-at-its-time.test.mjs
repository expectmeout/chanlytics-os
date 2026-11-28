/**
 * A post set for its time on Google (00616, the content redesign's stage 3): post_google, at the edge, over a database in
 * memory, Vault's door over a map, and a captured wire where Google would be. At its time the recheck runs, Google is asked
 * once, as the owner, to fetch the picture drawn at the press, and the placement is settled: up with Google's name, held in
 * words with nothing sent, or failed in the owner's words. One that went up, or was held, rings the bell; nothing is sent
 * twice, and a run that died after speaking is said so rather than sent again.
 *
 * An ask Google neither took nor refused is Checking, and the profile is asked what it holds before anything is sent
 * again (reconcileGooglePost): up under Google's name where it shows a post made since the send that nobody else
 * keeps; one more ask where it shows none; a person's look where it cannot be read. And a post that promises open time
 * is not sent while the book cannot be read (00728): asked again a minute on, then held with why.
 *
 * ORDER OF SETUP MATTERS, as in a-post-goes-on-google.test.mjs: lib/shared/google/places.ts binds fetch at module scope, so the
 * wire goes in first.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONTENT_CHECK_WORDS, FILE_WORDS, ON_INSTAGRAM, STANDING_WORDS } from "@chanlytics/contracts";
import { resetBreakers } from "@chanlytics/channels/shared";
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
const { reconcileGooglePost, sendGooglePost } = await import(at("apps/edge/lib/google/post-later.ts"));
const { postJobs } = await import(at("apps/edge/lib/instagram/post-send.ts"));
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

function world({
  status = "queued",
  may = true,
  removed = false,
  connected = true,
  waited = true,
  stopped = false,
  asApproved = { is: "before" },
  faults = {},
  others = [],
  keepWire = false,
} = {}) {
  const now = Date.now();
  // Each world meets Google afresh: a breaker another test's failures opened is no part of this one (`keepWire`: but
  // for the test of a wire that is resting).
  if (!keepWire) resetBreakers();
  const tables = {
    tenants: [
      {
        id: T,
        name: "Harbor Moving",
        slug: "harbor-moving",
        timezone: "UTC",
        status: "active",
        sending_stopped_at: stopped ? new Date(now).toISOString() : null,
      },
    ],
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
      // Other placements of this workspace on Google, each up under its own name.
      ...others.map((name, i) => ({
        id: `dddd4444-4444-4000-8000-0000000001${String(i).padStart(2, "0")}`,
        tenant_id: T,
        file_id: FILE,
        place: "google",
        kind: "picture",
        caption: "An earlier post.",
        status: "published",
        scheduled_for: new Date(now - 24 * HOUR).toISOString(),
        approved_by: OWNER,
        approved_at: new Date(now - 24 * HOUR).toISOString(),
        via: "press",
        external_id: name,
        created_at: new Date(now - 24 * HOUR).toISOString(),
        updated_at: new Date(now - 24 * HOUR).toISOString(),
      })),
    ],
    publish_attempts: [],
    jobs: [],
    notifications: [],
    events: [],
    policies: [],
    tenant_config: [],
  };
  const post = () => tables.posts[0];
  const db = fakeDb(tables, faults, {
    get_google_credentials: () => ({
      refresh_token: "rt-1",
      access_token: "at-good",
      expires_at: Date.now() + HOUR,
      scope: "openid email",
    }),
    has_permission: () => may,
    // A post approved before approvals were kept (00681) is read as before; a test hands its own approval.
    post_as_approved: () => asApproved,
    // 00611's door: Checking, and the ask of its place two minutes on, together.
    post_unanswered: ({ p_post_id, p_attempt }) => {
      const p = tables.posts.find((r) => r.id === p_post_id);
      if (!p || p.status !== "publishing") return false;
      p.status = "checking";
      tables.jobs.push({
        id: `job-ask-${tables.jobs.length + 1}`,
        tenant_id: p.tenant_id,
        kind: "post_reconcile",
        payload: { post_id: p.id, attempt: p_attempt },
        state: "scheduled",
        attempts: 0,
        due_at: new Date(Date.now() + 120_000).toISOString(),
        spoke_at: null,
      });
      return true;
    },
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
  });
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
/**
 * The job as the run holds it on the ledger, so it may say it spoke (markSpoke): while it runs it holds its once-only
 * key (jobs_dedupe_live), so a next ask it writes for itself must carry a key of its own (00728).
 */
const fired = (w) => {
  w.tables.jobs.push({
    ...job(),
    dedupe_key: `post_google:${POST}:1`,
    state: "fired",
    due_at: new Date().toISOString(),
    spoke_at: null,
  });
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
  assert.equal(rang.title, STANDING_WORDS.up.bell.title("google"));
  assert.equal(rang.route, `campaigns/content:${FILE}`, "the row opens the piece");
});

test("one set at its press for now says nothing on the bell: it is seen where it was pressed", async () => {
  const w = world({ waited: false });
  asking();
  await sendGooglePost(w.db, fired(w));
  assert.equal(w.post().status, "published");
  assert.equal(w.tables.notifications.length, 0);
});

test("the recheck holds it in words and asks Google nothing: deleted since, whoever set it may no longer post, or everything is stopped", async () => {
  for (const [over, why] of [
    [{ removed: true }, ON_INSTAGRAM.held.removed],
    [{ may: false }, ON_INSTAGRAM.held.approver],
    [{ stopped: true }, ON_INSTAGRAM.held.stopped],
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

test("Google too busy to take it is asked once more ten minutes on; busy again, the owner hears it in words", async () => {
  const w = world();
  calls.length = 0;
  google = () => [503, { error: { status: "UNAVAILABLE", message: "The service is currently unavailable." } }];
  const before = Date.now();
  assert.deepEqual(await sendGooglePost(w.db, fired(w)), { skipped: "busy" });
  assert.equal(w.post().status, "queued", "waiting again, not failed: Google made nothing");
  assert.equal(w.tables.notifications.length, 0, "nothing to tell the owner yet");
  const again = w.tables.jobs.find((j) => j.kind === "post_google" && j.payload.attempt === "2");
  assert.ok(again, "its second and last ask is on the ledger");
  assert.ok(Date.parse(again.due_at) - before >= 9 * 60_000, "ten minutes on");
  // The second ask, busy again: failed in words, never a third.
  calls.length = 0;
  await assert.rejects(sendGooglePost(w.db, job("2")), (e) => e.name === "CertainFailure" || /refused/.test(e.message));
  assert.equal(w.post().status, "failed");
  assert.match(w.post().error.words, new RegExp(`^${FILE_WORDS.google.refused}`));
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

/* ----------------------------------------------------------------- a send with no answer asks the profile first -- */

const LIST_URL = `${POSTS_URL}?pageSize=100`;
/** The run that asks the profile, as the runner wires it: Google settles its own unanswered send. */
const reconcile = (w, { attempt = "1", attempts = 1 } = {}) =>
  postJobs(w.db, { reconcileAt: { google: reconcileGooglePost } }).reconcile({
    id: "job-ask",
    tenant_id: T,
    kind: "post_reconcile",
    payload: { post_id: POST, attempt },
    attempts,
  });
/** Google: the ask to post answers `posting`; the profile's list answers `listing`. */
const wire = (posting, listing) => {
  calls.length = 0;
  google = (req) => (req.method === "POST" ? posting : listing);
};
const NO_ANSWER = [500, { error: { status: "INTERNAL", message: "Internal error encountered." } }];
const holding = (...posts) => [200, { localPosts: posts }];
const made = (name, at = new Date().toISOString()) => ({
  name,
  state: "LIVE",
  createTime: at,
  searchUrl: "https://local.google.com/place?use=posts",
});
const postAsks = () => calls.filter((c) => c.method === "POST" && c.url === POSTS_URL).length;

test("an ask Google neither took nor refused is Checking, never failed and never asked twice; the profile is asked two minutes on", async () => {
  const w = world();
  wire(NO_ANSWER, holding());
  const before = Date.now();
  assert.equal(await sendGooglePost(w.db, fired(w)), undefined);
  assert.equal(w.post().status, "checking", "it may be up: nothing says it did not go");
  assert.equal(w.post().error, null);
  assert.equal(postAsks(), 1);
  assert.equal(w.tables.publish_attempts[0].outcome, "no_answer");
  const ask = w.tables.jobs.find((j) => j.kind === "post_reconcile");
  assert.ok(ask, "the ask of the profile is on the ledger");
  assert.ok(Date.parse(ask.due_at) - before >= 119_000, "two minutes on");
  assert.equal(w.tables.notifications.length, 0, "nothing to tell the owner yet");
});

test("the profile holds a post made since the send: it is up under Google's name, and Google was asked to post once", async () => {
  const w = world();
  wire(NO_ANSWER, holding(made(NAME)));
  await sendGooglePost(w.db, fired(w));
  assert.equal(await reconcile(w), undefined);
  assert.equal(w.post().status, "published");
  assert.equal(w.post().external_id, NAME, "Google's name for it, which is how it comes down");
  assert.equal(postAsks(), 1, "never sent again");
  assert.equal(calls.filter((c) => c.url === LIST_URL).length, 1, "the profile asked what it holds");
  assert.equal(w.tables.notifications[0].kind, "post_up");
});

test("a post another placement keeps, or one made before the send, is never it", async () => {
  const OTHER = "accounts/111/locations/222/localPosts/555";
  const OLD = "accounts/111/locations/222/localPosts/444";
  const w = world({ others: [OTHER] });
  wire(NO_ANSWER, holding(made(OTHER), made(OLD, new Date(Date.now() - 2 * HOUR).toISOString())));
  await sendGooglePost(w.db, fired(w));
  assert.deepEqual(await reconcile(w), { skipped: "again" });
  assert.equal(w.post().status, "queued", "the send never landed: it waits for its second ask");
  assert.equal(w.post().external_id, null);
});

test("the profile holds none: one more ask begins, and a second that never landed is told, never a third", async () => {
  const w = world();
  wire(NO_ANSWER, holding());
  await sendGooglePost(w.db, fired(w));
  assert.deepEqual(await reconcile(w), { skipped: "again" });
  const second = w.tables.jobs.find((j) => j.kind === "post_google" && j.payload.attempt === "2");
  assert.ok(second, "its second and last ask is on the ledger");
  assert.equal(w.post().status, "queued");
  // The second ask, no answer again: Checking once more, and the profile still holds none.
  w.tables.jobs.push({ ...job("2"), id: "job-2", state: "fired", due_at: new Date().toISOString(), spoke_at: null });
  await sendGooglePost(w.db, { ...job("2"), id: "job-2" });
  assert.equal(w.post().status, "checking");
  assert.equal(await reconcile(w, { attempt: "2" }), undefined);
  assert.equal(w.post().status, "failed");
  assert.equal(w.post().error.words, FILE_WORDS.google.notSent);
  assert.equal(postAsks(), 2, "asked twice, never a third time");
  const [rang] = w.tables.notifications;
  assert.equal(rang.kind, "post_stopped");
  assert.equal(rang.body, STANDING_WORDS.stopped.bell.body(FILE_WORDS.google.notSent));
  assert.equal(
    w.tables.jobs.some((j) => j.kind === "post_google" && j.payload.attempt === "3"),
    false,
  );
});

test("a profile that cannot be read is asked again, never read as holding none; past its last try a person looks", async () => {
  const w = world();
  wire(NO_ANSWER, [503, { error: { status: "UNAVAILABLE", message: "The service is currently unavailable." } }]);
  await sendGooglePost(w.db, fired(w));
  await assert.rejects(reconcile(w), /UNAVAILABLE|unavailable/);
  assert.equal(w.post().status, "checking", "still Checking: the job comes back");
  assert.deepEqual(await reconcile(w, { attempts: 3 }), { skipped: "unread" });
  assert.equal(w.post().status, "failed");
  assert.equal(w.post().error.words, FILE_WORDS.google.unknown);
  assert.equal(postAsks(), 1);
  assert.equal(
    w.tables.jobs.some((j) => j.kind === "post_google" && j.payload.attempt === "2"),
    false,
    "nothing is sent again on a profile nobody could read",
  );
});

test("a post Google took and then rejected did not go, in Google's words, and is not sent again", async () => {
  const w = world();
  wire(NO_ANSWER, holding({ ...made(NAME), state: "REJECTED" }));
  await sendGooglePost(w.db, fired(w));
  assert.equal(await reconcile(w), undefined);
  assert.equal(w.post().status, "failed");
  assert.equal(w.post().error.words, FILE_WORDS.google.refused);
  assert.equal(postAsks(), 1);
});

test("an ask that never left, because the wire to Google is resting, made nothing: it waits for one more ask, as when Google is busy", async () => {
  // Five asks in a row with no good answer rest the wire (channels provider-fetch): the next is not made at all.
  resetBreakers();
  for (let i = 0; i < 5; i += 1) {
    const failing = world({ keepWire: true });
    wire(NO_ANSWER, holding());
    await sendGooglePost(failing.db, fired(failing));
    assert.equal(failing.post().status, "checking");
  }
  const w = world({ keepWire: true });
  wire(NO_ANSWER, holding());
  assert.deepEqual(await sendGooglePost(w.db, fired(w)), { skipped: "busy" });
  assert.equal(postAsks(), 0, "nothing was asked of Google");
  assert.equal(w.post().status, "queued", "waiting again, not Checking: nothing could have gone up");
  assert.ok(w.tables.jobs.find((j) => j.kind === "post_google" && j.payload.attempt === "2"));
});

test("a post of another place, or one no longer Checking, is left to its own reconcile", async () => {
  const w = world({ status: "published" });
  wire(NO_ANSWER, holding(made(NAME)));
  assert.deepEqual(await reconcile(w), { skipped: "published" });
  assert.equal(calls.length, 0);
});

/* ------------------------------------------------------------------ an opening that cannot be read (00728) -- */

const opening = {
  goal: null,
  opportunity_id: "open_capacity:2026-11-26",
  call_to_action: null,
  day: "2026-11-26",
  offer: null,
  service: null,
};
const PICTURE = `${T}/${FILE}/google.jpg`;
const promised = (facts = []) => ({ is: "stands", path: PICTURE, intent: opening, facts });
const unreadable = () => ({ "google_reviews.select": { message: "statement timeout" } });

test("a post that promises open time is not sent while the book cannot be read: Google is asked nothing, the job asks again, then it is held", async () => {
  const w = world({ asApproved: promised(), faults: unreadable() });
  asking();
  const before = Date.now();
  assert.deepEqual(await sendGooglePost(w.db, fired(w)), { skipped: "opening" });
  assert.equal(w.post().status, "queued", "neither sent nor held: it asks again");
  const again = w.tables.jobs.find((j) => j.kind === "post_google" && j.payload.unread === "1");
  assert.ok(again, "its own job, written for a minute on, beside the one still running");
  assert.equal(again.dedupe_key, `post_google:${POST}:1:1`, "under a key of its own, which the ledger takes");
  assert.ok(Date.parse(again.due_at) - before >= 59_000);
  const asked = (n) => ({ ...job(), payload: { post_id: POST, attempt: "1", unread: String(n) } });
  assert.deepEqual(await sendGooglePost(w.db, asked(2)), { skipped: "opening" });
  assert.deepEqual(await sendGooglePost(w.db, asked(3)), { skipped: "held" });
  assert.equal(w.post().status, "held");
  assert.equal(w.post().held_reason, CONTENT_CHECK_WORDS.openingsUnread("Thursday"));
  assert.equal(calls.length, 0, "nothing reaches Google");
  assert.equal(w.tables.notifications[0].kind, "post_stopped");
});

test("the owner's own word needs no read, and a post that promises no open time is asked nothing of the book", async () => {
  const said = world({
    asApproved: promised([{ says: "Thursday still has openings", until: "2999-01-01" }]),
    faults: unreadable(),
  });
  asking();
  await sendGooglePost(said.db, fired(said));
  assert.equal(said.post().status, "published");
  const plain = world({
    asApproved: { is: "stands", path: PICTURE, intent: { ...opening, opportunity_id: null }, facts: [] },
    faults: unreadable(),
  });
  asking();
  await sendGooglePost(plain.db, fired(plain));
  assert.equal(plain.post().status, "published");
});
