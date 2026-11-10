/**
 * Where a post goes, on a real database (00611, decision 0121), with real sessions: the press is a member's with the settings
 * permission and writes the post and its first job together; one post on its way per file and place; a story keeps no caption, a
 * reel waits, only a made post goes, a deleted one is gone; Don't post holds until the send; a member reads where a post stands
 * but never what was sent or the container; the service role's doors are shut to a member, a send's row never changes once
 * finished, a move is a compare-and-set, and the two doors that write a move with its job write both or neither.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, users and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
const users = [];
const as = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function member(name, tenant, role) {
  const email = `posts-${name}-${stamp}@example.com`;
  const password = `pw-${stamp}-${name}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `${name}'s seat`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), `${name} signs in`);
  return { client, id: made.data.user.id };
}

/** A file in workspace A, made by Ask unless said, through the service role as the door that keeps one would write it. */
async function file(over = {}) {
  const id = randomUUID();
  ok(
    await db.from("files").insert({
      id,
      tenant_id: A,
      status: "filed",
      source: "made",
      name: `post-${id.slice(0, 8)}`,
      mime: "image/jpeg",
      bytes: 1000,
      fingerprint: `fp-${id}`,
      ...over,
    }),
    "the file",
  );
  return id;
}

const begin = (who, fileId, over = {}) =>
  as[who].client.rpc("post_begin", {
    p_tenant_id: A,
    p_file_id: fileId,
    p_place: "instagram",
    p_kind: "picture",
    p_caption: "Open late on Fridays.",
    ...over,
  });
const postOf = async (id) => ok(await db.from("posts").select("*").eq("id", id).maybeSingle(), "the post");
const jobsOf = async (kind, postId) =>
  ok(
    await db
      .from("jobs")
      .select("kind, payload, due_at")
      .eq("tenant_id", A)
      .eq("kind", kind)
      .eq("payload->>post_id", postId),
    "jobs",
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenants = ok(
    await db
      .from("tenants")
      .insert([
        { name: `Posts A ${stamp}`, slug: `posts-a-${stamp}` },
        { name: `Posts B ${stamp}`, slug: `posts-b-${stamp}` },
      ])
      .select("id"),
    "the workspaces",
  );
  A = tenants[0].id;
  B = tenants[1].id;
  as.owner = await member("owner", A, "owner");
  as.viewer = await member("viewer", A, "viewer");
  as.stranger = await member("stranger", B, "owner");
});

after(async () => {
  if (skip) return;
  const all = [A, B];
  await db.from("jobs").delete().in("tenant_id", all);
  await db.from("publish_attempts").delete().in("tenant_id", all);
  await db.from("posts").delete().in("tenant_id", all);
  await db.from("files").delete().in("tenant_id", all);
  await db.from("memberships").delete().in("tenant_id", all);
  await db.from("tenants").delete().in("id", all);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test("the press writes the post, approved by whoever pressed, and its first job, together", { skip }, async () => {
  const fileId = await file();
  const begun = ok(await begin("owner", fileId), "begin");
  assert.equal(begun.fate, "begun");
  const post = await postOf(begun.post_id);
  assert.deepEqual(
    [post.place, post.kind, post.caption, post.status, post.approved_by, post.via, post.attempts],
    ["instagram", "picture", "Open late on Fridays.", "queued", as.owner.id, "press", 0],
  );
  const [job] = await jobsOf("post_prepare", begun.post_id);
  assert.deepEqual(job.payload.attempt, "1");
  assert.ok(Date.parse(job.due_at) <= Date.now() + 60_000, "now");
  assert.deepEqual(ok(await begin("owner", fileId), "again"), { fate: "busy", post_id: begun.post_id });
});

test("a story keeps no caption, a reel waits, only a made post goes, and a deleted one is gone", { skip }, async () => {
  const story = ok(await begin("owner", await file(), { p_kind: "story" }), "story");
  assert.equal((await postOf(story.post_id)).caption, null);
  assert.equal(ok(await begin("owner", await file(), { p_kind: "reel" }), "reel").fate, "not_yet");
  assert.equal(ok(await begin("owner", await file({ source: "upload" })), "photo").fate, "not_a_post");
  assert.equal(ok(await begin("owner", await file({ removed_at: new Date().toISOString() })), "gone").fate, "gone");
});

test("a time ahead sets the job ten minutes before it, and no further than thirty days", { skip }, async () => {
  const when = new Date(Date.now() + 2 * 3_600_000).toISOString();
  const later = ok(await begin("owner", await file(), { p_when: when }), "later");
  const [job] = await jobsOf("post_prepare", later.post_id);
  assert.ok(Math.abs(Date.parse(job.due_at) - (Date.parse(when) - 600_000)) < 5_000, "ten minutes ahead");
  const far = await begin("owner", await file(), { p_when: new Date(Date.now() + 40 * 86_400_000).toISOString() });
  assert.ok(far.error, "past thirty days is refused");
});

test("only a member with the settings permission presses, in their own workspace", { skip }, async () => {
  const fileId = await file();
  assert.equal((await begin("viewer", fileId)).error?.code, "42501");
  const stranger = await as.stranger.client.rpc("post_begin", {
    p_tenant_id: A,
    p_file_id: fileId,
    p_place: "instagram",
    p_kind: "picture",
    p_caption: "x",
  });
  assert.equal(stranger.error?.code, "42501");
});

test("Don't post holds until the send, and is too late once it is being sent", { skip }, async () => {
  const first = ok(await begin("owner", await file()), "begin");
  assert.equal(ok(await as.owner.client.rpc("post_pull", { p_post_id: first.post_id }), "pull").fate, "pulled");
  assert.equal((await postOf(first.post_id)).status, "pulled");
  const second = ok(await begin("owner", await file()), "begin");
  ok(await db.from("posts").update({ status: "publishing" }).eq("id", second.post_id), "sending");
  assert.deepEqual(ok(await as.owner.client.rpc("post_pull", { p_post_id: second.post_id }), "late"), {
    fate: "late",
    status: "publishing",
  });
  assert.equal((await as.viewer.client.rpc("post_pull", { p_post_id: second.post_id })).error?.code, "42501");
});

test(
  "a member reads where a post stands, never the container or what was sent; a stranger reads nothing",
  { skip },
  async () => {
    const begun = ok(await begin("owner", await file()), "begin");
    const read = ok(await as.owner.client.from("posts").select("id, status, caption").eq("id", begun.post_id), "read");
    assert.equal(read.length, 1);
    assert.ok(
      (await as.owner.client.from("posts").select("container_id").eq("id", begun.post_id)).error,
      "no container",
    );
    ok(
      await db.rpc("post_attempt_open", {
        p_post_id: begun.post_id,
        p_attempt_no: 1,
        p_step: "container",
        p_request: {},
      }),
      "open",
    );
    assert.ok((await as.owner.client.from("publish_attempts").select("request").eq("post_id", begun.post_id)).error);
    assert.equal(
      ok(await as.owner.client.from("publish_attempts").select("outcome").eq("post_id", begun.post_id), "sends").length,
      1,
    );
    assert.deepEqual(ok(await as.stranger.client.from("posts").select("id").eq("id", begun.post_id), "stranger"), []);
  },
);

test("the service role's doors are shut to a member", { skip }, async () => {
  const begun = ok(await begin("owner", await file()), "begin");
  for (const [door, args] of [
    ["post_moved", { p_post_id: begun.post_id, p_from: ["queued"], p_to: "published" }],
    ["post_attempt_open", { p_post_id: begun.post_id, p_attempt_no: 1, p_step: "container", p_request: {} }],
    ["post_unanswered", { p_post_id: begun.post_id, p_attempt: "1" }],
    ["post_again", { p_post_id: begun.post_id, p_from: "queued" }],
  ])
    assert.ok((await as.owner.client.rpc(door, args)).error, `${door} is the service role's`);
});

test(
  "a send's row is kept once finished, its ids copied to the post, and a move is a compare-and-set",
  { skip },
  async () => {
    const begun = ok(await begin("owner", await file()), "begin");
    const open = {
      p_post_id: begun.post_id,
      p_attempt_no: 1,
      p_step: "container",
      p_request: { image_url: "storage.example" },
    };
    const first = ok(await db.rpc("post_attempt_open", open), "open");
    assert.equal(ok(await db.rpc("post_attempt_open", open), "again").id, first.id, "the same send");
    assert.equal((await postOf(begun.post_id)).attempts, 1);
    const close = { p_attempt_id: first.id, p_outcome: "ok", p_http_status: 200, p_container_id: "18000000000000001" };
    assert.equal(ok(await db.rpc("post_attempt_close", close), "close"), true);
    assert.equal(ok(await db.rpc("post_attempt_close", { ...close, p_container_id: "1" }), "close again"), false);
    assert.equal((await postOf(begun.post_id)).container_id, "18000000000000001");
    const move = { p_post_id: begun.post_id, p_from: ["queued"], p_to: "preparing" };
    assert.equal(ok(await db.rpc("post_moved", move), "move"), true);
    assert.equal(ok(await db.rpc("post_moved", move), "move again"), false);
    const held = { p_post_id: begun.post_id, p_from: ["preparing"], p_to: "held", p_patch: { held_reason: "Pulled." } };
    assert.equal(ok(await db.rpc("post_moved", held), "hold"), true);
    assert.equal((await postOf(begun.post_id)).held_reason, "Pulled.");
  },
);

test(
  "a send with no answer is Checking with its reconcile, and one never landed is tried once more, never a third time",
  { skip },
  async () => {
    const begun = ok(await begin("owner", await file()), "begin");
    ok(
      await db.rpc("post_attempt_open", {
        p_post_id: begun.post_id,
        p_attempt_no: 1,
        p_step: "publish",
        p_request: {},
      }),
      "open",
    );
    ok(await db.from("posts").update({ status: "publishing" }).eq("id", begun.post_id), "sending");
    assert.equal(ok(await db.rpc("post_unanswered", { p_post_id: begun.post_id, p_attempt: "1" }), "unanswered"), true);
    assert.equal((await postOf(begun.post_id)).status, "checking");
    const [reconcile] = await jobsOf("post_reconcile", begun.post_id);
    assert.ok(Date.parse(reconcile.due_at) > Date.now() + 60_000, "two minutes on");
    assert.equal(ok(await db.rpc("post_again", { p_post_id: begun.post_id, p_from: "checking" }), "again"), true);
    const post = await postOf(begun.post_id);
    assert.deepEqual([post.status, post.container_id], ["queued", null]);
    assert.ok((await jobsOf("post_prepare", begun.post_id)).some((j) => j.payload.attempt === "2"));
    ok(
      await db.rpc("post_attempt_open", {
        p_post_id: begun.post_id,
        p_attempt_no: 2,
        p_step: "container",
        p_request: {},
      }),
      "two",
    );
    ok(await db.from("posts").update({ status: "checking" }).eq("id", begun.post_id), "checking");
    assert.equal(ok(await db.rpc("post_again", { p_post_id: begun.post_id, p_from: "checking" }), "third"), false);
  },
);

test(
  "Google's press is one call: its placement sends at once, and one left sending for ten minutes stops holding the next",
  { skip },
  async () => {
    const fileId = await file();
    const google = ok(await begin("owner", fileId, { p_place: "google", p_caption: "New floor." }), "google");
    assert.equal((await postOf(google.post_id)).status, "publishing");
    assert.deepEqual(await jobsOf("post_prepare", google.post_id), [], "no job: the press asks Google itself");
    assert.equal(ok(await begin("owner", fileId, { p_place: "google" }), "busy").fate, "busy");
    ok(
      await db
        .from("posts")
        .update({ updated_at: new Date(Date.now() - 11 * 60_000).toISOString() })
        .eq("id", google.post_id),
      "ten minutes on",
    );
    assert.equal(ok(await begin("owner", fileId, { p_place: "google" }), "again").fate, "begun");
    assert.equal((await postOf(google.post_id)).status, "failed");
  },
);
