/**
 * A post goes up as it was approved, or not at all (the content loop PRD's 5.3, 6.1, 8.2 and 15.1; 00681): Instagram is
 * handed the exact bytes the approval names, and a reel its made video; a caption changed after approval holds the post
 * ("Changed since you approved it"); a post whose day passed is let go and never sent late, by any road; one whose offer
 * ended is held with the three ways on; what was sent keeps the account it went to and when Instagram was seen holding it.
 * A post that promises open time is never sent on a guess (00728): where the book cannot be read at the send it asks
 * again a minute on, three times, then is held with a why of its own; every other post goes as before.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { CONTENT_CHECK_WORDS, ON_INSTAGRAM, placementStandingOf } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL", "META_APP_ID"]) delete process.env[k];
const realSecret = process.env.META_APP_SECRET;
process.env.META_APP_SECRET = "meta-secret-for-posts";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { postJobs } = await import(at("apps/edge/lib/instagram/post-send.ts"));

const T = "aaaa1111-4444-4000-8000-000000000011";
const OWNER = "bbbb2222-4444-4000-8000-000000000012";
const FILE = "cccc3333-4444-4000-8000-000000000013";
const POST = "dddd4444-4444-4000-8000-000000000014";
const ROW = "eeee5555-4444-4000-8000-000000000015";
const PIECE = "ffff6666-4444-4000-8000-000000000016";
const ACCOUNT = "17841400000000002";
const CONTAINER = "18000000000000011";
const MEDIA = "17900000000000011";
const ALL = ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"];
/** A business's receptionist as its config keeps one: the parser refuses a profile without it. */
const BRAIN = {
  business_name: "Studio",
  system_prompt: "You answer for Studio, a salon, kindly and briefly, every time.",
  fallbacks: { greeting: "Hi!", error: "Sorry.", non_text: "Text please." },
};

let meta;
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? Object.fromEntries(new URLSearchParams(init.body)) : {};
  calls.push({ route: `${method} ${u.pathname.replace("/v27.0", "")}`, body });
  const [status, json] = meta[`${method} ${u.pathname.replace("/v27.0", "")}`] ?? [404, { error: { code: 803 } }];
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
    [`GET /${CONTAINER}`]: [200, { status_code: "FINISHED" }],
    [`POST /${ACCOUNT}/media_publish`]: [200, { id: MEDIA }],
    [`GET /${MEDIA}`]: [
      200,
      { id: MEDIA, permalink: "https://www.instagram.com/reel/abc/", timestamp: new Date().toISOString() },
    ],
  };
});

/** A workspace with one approved placement; `asApproved` is what the database answers of it right before a send. */
function world({
  status = "queued",
  kind = "picture",
  fileKind = "photo",
  goodUntil = null,
  asApproved,
  profile = {},
  faults = {},
  pieces = [],
  approvedAt = null,
} = {}) {
  const now = new Date().toISOString();
  const tables = {
    tenants: [{ id: T, timezone: "America/New_York", sending_stopped_at: null }],
    tenant_config: [{ tenant_id: T, config: { brain: { ...BRAIN, profile } } }],
    files: [{ id: FILE, tenant_id: T, kind: fileKind, source: "made", status: "filed", removed_at: null, made: null }],
    tenant_channels: [
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
    ],
    posts: [
      {
        id: POST,
        tenant_id: T,
        file_id: FILE,
        place: "instagram",
        kind,
        caption: kind === "story" ? null : "Thursday has 3 open chairs.",
        status,
        scheduled_for: now,
        approved_by: OWNER,
        approved_at: approvedAt ?? now,
        via: "press",
        held_reason: null,
        held_why: null,
        attempts: 0,
        container_id: status === "queued" ? null : CONTAINER,
        external_id: null,
        permalink: null,
        published_at: null,
        error: null,
        piece_id: PIECE,
        revision: 1,
        approval_id: "abab0000-4444-4000-8000-000000000017",
        capability_edition: 1,
        verified_at: null,
        good_until: goodUntil,
        account_id: null,
        created_at: now,
        updated_at: now,
      },
    ],
    publish_attempts: [],
    // The post's piece, and a new version of it being made or that could not be, where a test hands them.
    pieces,
    // What the book's reasons are read from, besides the calendar (lib/opportunities/book.ts): none here.
    google_reviews: [],
    // The run that holds the job: the send says it is about to speak on it (ledger markSpoke). While it runs it holds
    // its once-only key (jobs_dedupe_live), so a next ask it writes for itself must carry a key of its own (00728).
    jobs: [
      {
        id: "job-1",
        tenant_id: T,
        kind: "post_publish",
        payload: { post_id: POST, attempt: "1" },
        dedupe_key: `post_publish:${POST}:1`,
        state: "fired",
        attempts: 1,
        due_at: now,
        spoke_at: null,
      },
    ],
  };
  const post = () => tables.posts[0];
  const db = fakeDb(tables, faults, {
    get_channel_credentials: () => ({ access_token: "bisu-token", account_id: ACCOUNT, login: "meta" }),
    has_permission: () => true,
    post_as_approved: () => asApproved,
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
        answer: null,
        http_status: null,
        error: null,
      };
      tables.publish_attempts.push(row);
      return { fate: "open", id: row.id, finished: false, outcome: null, container_id: null, external_id: null };
    },
    post_attempt_close: (a) => {
      const row = tables.publish_attempts.find((r) => r.id === a.p_attempt_id);
      Object.assign(row, {
        finished_at: new Date().toISOString(),
        outcome: a.p_outcome,
        container_id: a.p_container_id ?? null,
      });
      if (a.p_container_id) post().container_id = a.p_container_id;
      return true;
    },
    post_moved: ({ p_post_id, p_from, p_to, p_patch }) => {
      const p = tables.posts.find((r) => r.id === p_post_id);
      if (!p || !p_from.includes(p.status)) return false;
      const late = p_to === "pulled" && p_patch.held_why === "late";
      Object.assign(p, {
        status: p_to,
        held_reason: p_to === "held" || late ? p_patch.held_reason : null,
        held_why: p_to === "held" || late ? p_patch.held_why : null,
      });
      for (const k of ["permalink", "external_id", "account_id", "verified_at"]) if (p_patch[k]) p[k] = p_patch[k];
      if ("error" in p_patch) p.error = p_patch.error;
      // As the door does (00681): up on Instagram unseen, its job that asks the account for it is written with the move.
      if (p_to === "published" && p.place === "instagram" && !p.verified_at && p.external_id)
        tables.jobs.push({
          id: `job-seen-${tables.jobs.length + 1}`,
          tenant_id: p.tenant_id,
          kind: "post_reconcile",
          payload: { post_id: p.id, attempt: "seen", seen: "ask" },
          state: "scheduled",
          attempts: 0,
          due_at: new Date(Date.now() + 120_000).toISOString(),
          spoke_at: null,
        });
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

const job = (kind) => ({ id: "job-1", tenant_id: T, kind, payload: { post_id: POST, attempt: "1" }, attempts: 1 });
const quick = { pause: async () => {} };
const SOON = () => Date.now() + 60_000;
const madeContainer = () => calls.find((c) => c.route === `POST /${ACCOUNT}/media`);
const stands = (path, intent = null, facts = []) => ({ is: "stands", path, intent, facts });

test("Instagram is handed the exact bytes the approval names, not the post's own shape", async () => {
  const w = world({ asApproved: stands(`${T}/${FILE}/approved-portrait.jpg`) });
  await postJobs(w.db, quick).prepare(job("post_prepare"), SOON());
  assert.equal(
    madeContainer().body.image_url,
    `https://storage.example/sign/${T}/${FILE}/approved-portrait.jpg?token=sig`,
  );
  assert.equal(w.post().status, "preparing");
});

test("a reel is a container of its made video, shared to the feed with its caption", async () => {
  const w = world({ kind: "reel", fileKind: "video", asApproved: stands(`${T}/${FILE}/made/video.mp4`) });
  await postJobs(w.db, quick).prepare(job("post_prepare"), SOON());
  const made = madeContainer().body;
  assert.equal(made.media_type, "REELS");
  assert.equal(made.share_to_feed, "true");
  assert.equal(made.video_url, `https://storage.example/sign/${T}/${FILE}/made/video.mp4?token=sig`);
  assert.equal(made.caption, "Thursday has 3 open chairs.");
  assert.deepEqual(w.tables.publish_attempts[0].request.video_url, "storage.example", "the address is never kept");
});

test("a caption changed after approval holds the post, and nothing is made or sent", async () => {
  const w = world({ asApproved: { is: "changed" } });
  assert.deepEqual(await postJobs(w.db, quick).prepare(job("post_prepare"), SOON()), { skipped: "held" });
  assert.equal(w.post().status, "held");
  assert.equal(w.post().held_why, "changed");
  assert.equal(w.post().held_reason, ON_INSTAGRAM.held.changed);
  assert.equal(calls.length, 0, "Instagram is asked nothing");
  // And right before the send, the same: a post made ready, then changed, is held at the send.
  const ready = world({ status: "preparing", asApproved: { is: "changed" } });
  assert.deepEqual(await postJobs(ready.db, quick).publish(job("post_publish")), { skipped: "held" });
  assert.ok(!calls.some((c) => c.route === `POST /${ACCOUNT}/media_publish`));
});

test("a post whose day passed is let go, never sent late, and says so", async () => {
  const thursday = {
    goal: null,
    opportunity_id: null,
    call_to_action: null,
    day: "2026-11-19",
    offer: null,
    service: null,
  };
  const w = world({
    status: "preparing",
    goodUntil: new Date(Date.now() - 60_000).toISOString(),
    asApproved: stands(`${T}/${FILE}/original.jpg`, thursday),
  });
  assert.deepEqual(await postJobs(w.db, quick).publish(job("post_publish")), { skipped: "late" });
  assert.equal(w.post().status, "pulled");
  assert.equal(w.post().held_why, "late");
  assert.equal(w.post().held_reason, CONTENT_CHECK_WORDS.late("Thursday"));
  assert.equal(calls.length, 0);
});

test("an offer that ended since approval holds the post with the three ways on; the owner's own word keeps it going", async () => {
  const offer = {
    goal: null,
    opportunity_id: null,
    call_to_action: null,
    day: null,
    offer: { says: "20% off", until: null },
    service: null,
  };
  const ended = world({
    status: "preparing",
    asApproved: stands(`${T}/${FILE}/original.jpg`, offer),
    profile: { notes: [] },
  });
  assert.deepEqual(await postJobs(ended.db, quick).publish(job("post_publish")), { skipped: "held" });
  assert.equal(ended.post().held_why, "reason_passed");
  assert.equal(ended.post().held_reason, CONTENT_CHECK_WORDS.offerEnded("20% off"));
  // A note still in force says it runs: it goes.
  const runs = world({
    status: "preparing",
    asApproved: stands(`${T}/${FILE}/original.jpg`, offer),
    profile: { notes: [{ title: "Winter deal", text: "20% off every colour" }] },
  });
  await postJobs(runs.db, quick).publish(job("post_publish"));
  assert.equal(runs.post().status, "published");
  // The owner said it themselves on the approval: it goes, as their own fact.
  const said = world({
    status: "preparing",
    asApproved: stands(`${T}/${FILE}/original.jpg`, offer, [{ says: "20% off still runs", until: "2999-01-01" }]),
    profile: { notes: [] },
  });
  await postJobs(said.db, quick).publish(job("post_publish"));
  assert.equal(said.post().status, "published");
});

test("what went up keeps the account it went to, and when Instagram was seen holding it", async () => {
  const w = world({ status: "preparing", asApproved: stands(`${T}/${FILE}/original.jpg`) });
  await postJobs(w.db, quick).publish(job("post_publish"));
  assert.equal(w.post().status, "published");
  assert.equal(w.post().account_id, ACCOUNT);
  assert.ok(w.post().verified_at, "seen: the post was read back from the account");
  // Read back with no answer: up, and not yet seen there.
  meta[`GET /${MEDIA}`] = [500, { error: { code: 2 } }];
  const unseen = world({ status: "preparing", asApproved: stands(`${T}/${FILE}/original.jpg`) });
  await postJobs(unseen.db, quick).publish(job("post_publish"));
  assert.equal(unseen.post().status, "published");
  assert.equal(unseen.post().verified_at, null);
});

test("a post that went up unseen is still posting, never on Instagram, and Instagram is asked for it again by its own id", async () => {
  meta[`GET /${MEDIA}`] = [500, { error: { code: 2 } }];
  const w = world({ status: "preparing", asApproved: stands(`${T}/${FILE}/original.jpg`) });
  await postJobs(w.db, quick).publish(job("post_publish"));
  assert.equal(w.post().status, "published");
  assert.equal(w.post().verified_at, null);
  assert.deepEqual(placementStandingOf(w.post(), null, Date.now()), { is: "going_up", sent: true }, "still posting");
  const asking = w.tables.jobs.find((j) => j.kind === "post_reconcile");
  assert.deepEqual(asking?.payload, { post_id: POST, attempt: "seen", seen: "ask" }, "asked for again, two minutes on");
  const again = { id: "job-2", tenant_id: T, kind: "post_reconcile", payload: asking.payload, attempts: 1 };
  // Still no answer: the job comes back, and nothing is said that is not known.
  await assert.rejects(postJobs(w.db, quick).reconcile(again), /did not say whether it is up/);
  assert.equal(w.post().verified_at, null);
  // Seen: it is on Instagram from now, with its address, and nothing was sent again.
  meta[`GET /${MEDIA}`] = [
    200,
    { id: MEDIA, permalink: "https://www.instagram.com/p/seen/", timestamp: new Date().toISOString() },
  ];
  await postJobs(w.db, quick).reconcile(again);
  assert.ok(w.post().verified_at);
  assert.equal(w.post().permalink, "https://www.instagram.com/p/seen/");
  assert.equal(placementStandingOf(w.post(), null, Date.now()).is, "up", "on Instagram once it was seen there");
  assert.equal(calls.filter((c) => c.route === `POST /${ACCOUNT}/media_publish`).length, 1, "one send, ever");
  // Not on the account at all: it never went up (the review of 24 Nov 2026, A6).
  meta[`GET /${MEDIA}`] = [500, { error: { code: 2 } }];
  const gone = world({ status: "preparing", asApproved: stands(`${T}/${FILE}/original.jpg`) });
  await postJobs(gone.db, quick).publish(job("post_publish"));
  meta[`GET /${MEDIA}`] = [400, { error: { message: "Object does not exist", code: 100, error_subcode: 33 } }];
  // Refused by its id proves nothing alone (Meta says the same of a post it may not show): the job comes back.
  await assert.rejects(postJobs(gone.db, quick).reconcile(again), /did not say whether it is up/);
  // The account's own list reads, and the post is not on it. A first look can be early: the job comes back, and the
  // post still says it is going up.
  meta[`GET /${ACCOUNT}/media`] = [200, { data: [] }];
  await assert.rejects(postJobs(gone.db, quick).reconcile(again), /does not hold it yet/);
  assert.equal(gone.post().status, "published");
  // Its last try still finds none: it never went up. It is a post that did not go, in those words, never left as
  // posted and never taken down, since nothing was up.
  const last = { ...again, attempts: 3 };
  assert.deepEqual(await postJobs(gone.db, quick).reconcile(last), { skipped: "not_seen" });
  assert.equal(gone.post().status, "failed");
  assert.deepEqual(gone.post().error, { code: null, subcode: null, words: "Instagram doesn't have it." });
  assert.equal(gone.post().verified_at, null);
  assert.equal(placementStandingOf({ ...gone.post(), error: gone.post().error.words }, null, Date.now()).is, "stopped");
  assert.equal(calls.filter((c) => c.route === `POST /${ACCOUNT}/media_publish`).length, 2, "one send a world, ever");
});

/* ------------------------------------------------------------------- an opening that cannot be read (00728) -- */

/** A piece made for Thursday's open time: its words promise it. */
const opening = {
  goal: null,
  opportunity_id: "open_capacity:2026-11-26",
  call_to_action: null,
  day: "2026-11-26",
  offer: null,
  service: null,
};
/** The book cannot be read: its reasons' read fails. */
const unreadable = () => ({ "google_reviews.select": { message: "statement timeout" } });
/** The send's job as it comes back, having asked `n` times already. */
const asked = (n) => ({ ...job("post_publish"), payload: { post_id: POST, attempt: "1", unread: String(n) } });

test("a post that promises open time is not sent while the book cannot be read: asked again a minute on, then held with why", async () => {
  const w = world({
    status: "preparing",
    asApproved: stands(`${T}/${FILE}/original.jpg`, opening),
    faults: unreadable(),
  });
  const before = Date.now();
  assert.deepEqual(await postJobs(w.db, quick).publish(job("post_publish")), { skipped: "opening" });
  assert.equal(w.post().status, "preparing", "neither sent nor held: it asks again");
  const again = w.tables.jobs.find((j) => j.payload.unread === "1");
  assert.equal(again?.kind, "post_publish", "its own send, written for a minute on, beside the one still running");
  assert.ok(Date.parse(again.due_at) - before >= 59_000, "a minute on");
  assert.deepEqual(again.payload, { post_id: POST, attempt: "1", wait: "0", unread: "1" });
  assert.equal(again.dedupe_key, `post_publish:${POST}:1:0:1`, "under a key of its own, which the ledger takes");
  // Asked again, and again: still not sent on a guess.
  assert.deepEqual(await postJobs(w.db, quick).publish(asked(1)), { skipped: "opening" });
  assert.deepEqual(await postJobs(w.db, quick).publish(asked(2)), { skipped: "opening" });
  assert.equal(w.post().status, "preparing");
  // Asked three times: held, with a why of its own and the owner's words.
  assert.deepEqual(await postJobs(w.db, quick).publish(asked(3)), { skipped: "held" });
  assert.equal(w.post().status, "held");
  assert.equal(w.post().held_why, "reason_unread");
  assert.equal(w.post().held_reason, CONTENT_CHECK_WORDS.openingsUnread("Thursday"));
  assert.equal(calls.length, 0, "nothing ever reached Instagram");
});

test("the owner's own word that the day still has openings needs no read: the post goes", async () => {
  const w = world({
    status: "preparing",
    asApproved: stands(`${T}/${FILE}/original.jpg`, opening, [
      { says: "Thursday still has openings", until: "2999-01-01" },
    ]),
    faults: unreadable(),
  });
  await postJobs(w.db, quick).publish(job("post_publish"));
  assert.equal(w.post().status, "published");
});

test("every other post is as before: one that promises no open time is asked nothing of the book", async () => {
  const dated = { ...opening, opportunity_id: null };
  const w = world({
    status: "preparing",
    asApproved: stands(`${T}/${FILE}/original.jpg`, dated),
    faults: unreadable(),
  });
  await postJobs(w.db, quick).publish(job("post_publish"));
  assert.equal(w.post().status, "published");
  assert.equal(
    w.tables.jobs.some((j) => "unread" in j.payload),
    false,
  );
});

test("the book read and the day full is a reason that passed, not one that could not be read", async () => {
  const w = world({ status: "preparing", asApproved: stands(`${T}/${FILE}/original.jpg`, opening) });
  assert.deepEqual(await postJobs(w.db, quick).publish(job("post_publish")), { skipped: "held" });
  assert.equal(w.post().held_why, "reason_passed");
  assert.equal(w.post().held_reason, CONTENT_CHECK_WORDS.filledUp("Thursday"));
});

test("making it ready is not held by a book that cannot be read: the send asks, and its last moment still lets it go as late", async () => {
  const ready = world({ asApproved: stands(`${T}/${FILE}/original.jpg`, opening), faults: unreadable() });
  await postJobs(ready.db, quick).prepare(job("post_prepare"), SOON());
  assert.equal(ready.post().status, "preparing", "made ready, as before");
  assert.ok(madeContainer(), "Instagram was asked for its draft");
  const late = world({
    status: "preparing",
    goodUntil: new Date(Date.now() - 60_000).toISOString(),
    asApproved: stands(`${T}/${FILE}/original.jpg`, opening),
    faults: unreadable(),
  });
  assert.deepEqual(await postJobs(late.db, quick).publish(asked(1)), { skipped: "late" });
  assert.equal(late.post().status, "pulled");
  assert.equal(late.post().held_why, "late");
});

/* ------------------------------------------- the old version when a new one is late or could not be made -- */

const DRAWING = "ffff6666-4444-4000-8000-000000000026";
const STANDS = {
  blocks: [{ is: "clip", file_id: "abab0000-4444-4000-8000-0000000000c1", from: 0, to: 4 }],
  lines: ["The finish"],
  caption: "Forty-five minutes, one round brush.",
};
/** Version 2 as it was asked for: a new cut alone, or other words on it. */
const NEW_CUT = { ...STANDS, blocks: [{ ...STANDS.blocks[0], from: 1, to: 3 }] };
const OTHER_WORDS = { ...STANDS, lines: ["Half price this week"] };
const AGO = (ms) => new Date(Date.now() - ms).toISOString();
/** The piece the post is of, and a new version of it: being made or failed, asked for a minute ago unless said. */
const versioned = (plan, { status = "making", begun = AGO(60_000) } = {}) => [
  {
    id: PIECE,
    tenant_id: T,
    revises: null,
    revision: 1,
    shape: "blocks",
    plan: STANDS,
    look: {},
    status: "made",
    stage: "queued",
    edition: 3,
    card_key: "card-1",
    file_id: FILE,
    created_at: AGO(86_400_000),
    updated_at: AGO(86_400_000),
  },
  {
    id: DRAWING,
    tenant_id: T,
    revises: PIECE,
    revision: 1,
    shape: "blocks",
    plan,
    look: {},
    status,
    stage: "drawing",
    edition: 3,
    card_key: "card-2",
    file_id: null,
    created_at: begun,
    updated_at: begun,
  },
];
/** A reel of the piece, approved an hour ago and made ready, with a version asked for since. */
const reelWith = (pieces, over = {}) =>
  world({
    status: "preparing",
    kind: "reel",
    fileKind: "video",
    asApproved: stands(`${T}/${FILE}/video.mp4`),
    approvedAt: AGO(3_600_000),
    pieces,
    ...over,
  });
/** The send's job as it comes back, having waited `n` minutes for the version. */
const waited = (n) => ({ ...job("post_publish"), payload: { post_id: POST, attempt: "1", wait: String(n) } });

test("while a new version is made the send waits, a minute at a time, as before", async () => {
  const w = reelWith(versioned(OTHER_WORDS));
  assert.deepEqual(await postJobs(w.db, quick).publish(job("post_publish")), { skipped: "version" });
  assert.equal(w.post().status, "preparing");
  // Written beside the send still running, under a key of its own (00728): the ledger refused it under the send's own.
  const again = w.tables.jobs.find((j) => j.kind === "post_publish" && j.payload.wait === "1");
  assert.equal(again?.dedupe_key, `post_publish:${POST}:1:1:0`);
  assert.equal(calls.length, 0);
});

test("a new version that is late and only looks different leaves the post to go as approved", async () => {
  const w = reelWith(versioned(NEW_CUT));
  await postJobs(w.db, quick).publish(waited(10));
  assert.equal(w.post().status, "published");
});

test("a new version that is late and says something else holds the post: the old words do not go up in its place", async () => {
  const w = reelWith(versioned(OTHER_WORDS));
  assert.deepEqual(await postJobs(w.db, quick).publish(waited(10)), { skipped: "held" });
  assert.equal(w.post().status, "held");
  assert.equal(w.post().held_why, "changed");
  assert.equal(w.post().held_reason, ON_INSTAGRAM.held.changed);
  assert.equal(calls.length, 0, "nothing reached Instagram");
});

test("a new version that could not be made decides the same way, at once: other words hold, a new look goes", async () => {
  const other = reelWith(versioned(OTHER_WORDS, { status: "failed" }));
  assert.deepEqual(await postJobs(other.db, quick).publish(job("post_publish")), { skipped: "held" });
  assert.equal(other.post().held_why, "changed");
  const look = reelWith(versioned(NEW_CUT, { status: "failed" }));
  await postJobs(look.db, quick).publish(job("post_publish"));
  assert.equal(look.post().status, "published");
});

test("a post approved after the new version was asked for is its owner's word for this one: it goes, and waits for nothing", async () => {
  // Asked for an hour ago, and since then the owner approved version 1 again (Look again, or Post this one instead).
  const begun = AGO(3_600_000);
  for (const status of ["making", "failed"]) {
    const w = reelWith(versioned(OTHER_WORDS, { status, begun }), { approvedAt: AGO(60_000) });
    await postJobs(w.db, quick).publish(job("post_publish"));
    assert.equal(w.post().status, "published", status);
    assert.equal(
      w.tables.jobs.some((j) => "wait" in j.payload),
      false,
      status,
    );
  }
});
