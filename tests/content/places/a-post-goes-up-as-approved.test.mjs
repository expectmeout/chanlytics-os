/**
 * A post goes up as it was approved, or not at all (the content loop PRD's 5.3, 6.1, 8.2 and 15.1; 00680): Instagram is
 * handed the exact bytes the approval names, and a reel its made video; a caption changed after approval holds the post
 * ("Changed since you approved it"); a post whose day passed is let go and never sent late, by any road; one whose offer
 * ended is held with the three ways on; what was sent keeps the account it went to and when Instagram was seen holding it.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels/shared";
import { CONTENT_CHECK_WORDS, ON_INSTAGRAM, postStandsSaid } from "@chanlytics/contracts";
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
        approved_at: now,
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
    // The run that holds the job: the send says it is about to speak on it (ledger markSpoke).
    jobs: [
      {
        id: "job-1",
        tenant_id: T,
        kind: "post_publish",
        payload: { post_id: POST, attempt: "1" },
        state: "fired",
        attempts: 1,
        due_at: now,
        spoke_at: null,
      },
    ],
  };
  const post = () => tables.posts[0];
  const db = fakeDb(
    tables,
    {},
    {
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
        // As the door does (00680): up on Instagram unseen, its job that asks the account for it is written with the move.
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

test("a person named in it with no yes for posts holds the post at its send, by name, and nothing is sent", async () => {
  const w = world({ status: "preparing", asApproved: { is: "rights", name: "Paola" } });
  assert.deepEqual(await postJobs(w.db, quick).publish(job("post_publish")), { skipped: "held" });
  assert.equal(w.post().held_why, "rights");
  assert.equal(w.post().held_reason, CONTENT_CHECK_WORDS.notYetSaid("Paola"));
  assert.equal(w.post().held_reason, "Paola hasn't said yes to being in posts. Ask them, or use another clip.");
  assert.equal(calls.length, 0);
});

test("a post that went up unseen is still posting, never on Instagram, and Instagram is asked for it again by its own id", async () => {
  meta[`GET /${MEDIA}`] = [500, { error: { code: 2 } }];
  const w = world({ status: "preparing", asApproved: stands(`${T}/${FILE}/original.jpg`) });
  await postJobs(w.db, quick).publish(job("post_publish"));
  assert.equal(w.post().status, "published");
  assert.equal(w.post().verified_at, null);
  assert.equal(postStandsSaid(w.post()), "Posting on Instagram");
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
  assert.equal(postStandsSaid(w.post()), "On Instagram");
  assert.equal(calls.filter((c) => c.route === `POST /${ACCOUNT}/media_publish`).length, 1, "one send, ever");
  // Gone from the account (its owner deleted it there): left as posted, never called seen.
  meta[`GET /${MEDIA}`] = [500, { error: { code: 2 } }];
  const gone = world({ status: "preparing", asApproved: stands(`${T}/${FILE}/original.jpg`) });
  await postJobs(gone.db, quick).publish(job("post_publish"));
  meta[`GET /${MEDIA}`] = [400, { error: { message: "Object does not exist", code: 100, error_subcode: 33 } }];
  // Refused by its id proves nothing alone (Meta says the same of a post it may not show): the job comes back.
  await assert.rejects(postJobs(gone.db, quick).reconcile(again), /did not say whether it is up/);
  // The account's own list reads, and the post is not on it: gone.
  meta[`GET /${ACCOUNT}/media`] = [200, { data: [] }];
  assert.deepEqual(await postJobs(gone.db, quick).reconcile(again), { skipped: "not_seen" });
  assert.equal(gone.post().verified_at, null);
});
