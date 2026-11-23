/**
 * A post comes down, on a real database (00682; the content loop PRD's 5.3, 8.3 and 15.1), with real sessions: the owner's
 * press asks down what is up and lets go what waited, as one remediation with its job; a post is taken_down only once the
 * place's answer is kept, and kept once; "I deleted it" makes the action wait again and asks the place. A viewer may do
 * none of it, and another workspace reads none of it. And "Keep it up" (00689): a post a place left to its owner stays
 * up on the owner's word, with who and when, the bell's line for it closes, and nothing is asked of the place again.
 * That line is about a piece at a place (00698): with a post and a story both left to the owner, it ends only with
 * the last of them, kept up or deleted by hand, in either order.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { TAKE_DOWN_BELL } from "@chanlytics/contracts";

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
  const email = `takedown-${name}-${stamp}@example.com`;
  const password = `pw-${stamp}-${name}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `${name}'s seat`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), `${name} signs in`);
  return { client, id: made.data.user.id };
}

async function file(over = {}) {
  const id = randomUUID();
  ok(
    await db.from("files").insert({
      id,
      tenant_id: A,
      status: "filed",
      source: "made",
      name: `down-${id.slice(0, 8)}`,
      mime: "image/jpeg",
      bytes: 1000,
      fingerprint: `fp-${id}`,
      made: { from: null, plan: { line: "Open late" } },
      ...over,
    }),
    "a file",
  );
  return id;
}

async function post(fileId, place, kind, status, over = {}) {
  const up = status === "published";
  const row = ok(
    await db
      .from("posts")
      .insert({
        tenant_id: A,
        file_id: fileId,
        place,
        kind,
        status,
        external_id: up ? `ext-${randomUUID().slice(0, 8)}` : null,
        published_at: up ? new Date().toISOString() : null,
        ...over,
      })
      .select("id")
      .single(),
    `a ${kind} ${status} on ${place}`,
  );
  return row.id;
}

const statusOf = async (id) => ok(await db.from("posts").select("status, held_why").eq("id", id).single(), "post");
const actionOf = async (id) =>
  ok(
    await db.from("remediation_actions").select("outcome, said, finished_at, left_up_by").eq("id", id).single(),
    "action",
  );
const begin = (who, fileId) => as[who].client.rpc("post_take_down_begin", { p_tenant_id: A, p_file_id: fileId });
const settle = (action, outcome, said = "") =>
  db.rpc("post_take_down_settle", { p_action_id: action, p_outcome: outcome, p_said: said });
const byHand = (who, postId) => as[who].client.rpc("post_take_down_by_hand", { p_tenant_id: A, p_post_id: postId });
const keep = (who, postId) => as[who].client.rpc("post_take_down_keep", { p_tenant_id: A, p_post_id: postId });
const takeDownJobs = async () =>
  (await db.from("jobs").select("id", { count: "exact", head: true }).eq("tenant_id", A).eq("kind", "post_take_down"))
    .count;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenants = ok(
    await db
      .from("tenants")
      .insert([
        { name: `Down A ${stamp}`, slug: `down-a-${stamp}` },
        { name: `Down B ${stamp}`, slug: `down-b-${stamp}` },
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
  await db.from("notifications").delete().in("tenant_id", all);
  await db.from("remediations").delete().in("tenant_id", all);
  await db.from("posts").delete().in("tenant_id", all);
  await db.from("files").delete().in("tenant_id", all);
  await db.from("memberships").delete().in("tenant_id", all);
  await db.from("tenants").delete().in("id", all);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "a piece comes down: what is up is asked, what waited is let go, and only the place's answer takes a post down",
  { skip },
  async () => {
    const made = await file();
    const up = await post(made, "instagram", "picture", "published");
    const story = await post(made, "instagram", "story", "published", {
      published_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    });
    const waits = await post(made, "google", "picture", "queued", {
      scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
    });
    assert.match((await begin("viewer", made)).error?.message ?? "", /Not yours to change/);
    assert.match((await begin("stranger", made)).error?.message ?? "", /Not yours to change/);
    const begun = ok(await begin("owner", made), "the press");
    assert.equal(begun.fate, "begun");
    assert.deepEqual(
      begun.actions.map((a) => [a.post_id, a.act, a.outcome]),
      [
        [up, "take_down", "pending"],
        [waits, "cancel", "done"],
      ],
    );
    assert.equal((await statusOf(up)).status, "published", "never down before its place said so");
    assert.equal((await statusOf(waits)).status, "pulled");
    assert.equal((await statusOf(story)).status, "published", "a story a day old is gone already, and is left");
    const action = begun.actions[0].action_id;
    const jobs = ok(await db.from("jobs").select("payload").eq("tenant_id", A).eq("kind", "post_take_down"), "jobs");
    assert.deepEqual(
      jobs.map((j) => j.payload),
      [{ action_id: action, attempt: "1" }],
    );
    assert.equal(ok(await begin("owner", made), "pressed again").fate, "nothing");
    // The member reads it; another workspace reads none of it.
    const seen = ok(await as.viewer.client.from("remediation_actions").select("id").eq("id", action), "member");
    assert.equal(seen.length, 1);
    const hidden = ok(await as.stranger.client.from("remediation_actions").select("id").eq("id", action), "stranger");
    assert.equal(hidden.length, 0);
    // The place could not: by hand, the post still up.
    const left = ok(await settle(action, "needs_person", "Delete it in the Instagram app."), "settle");
    assert.equal(left.fate, "kept");
    // The piece and the place, for the bell's line; not down, since its place left it to the owner.
    assert.deepEqual([left.file_id, left.place, left.down], [made, "instagram", null]);
    assert.equal((await statusOf(up)).status, "published");
    assert.equal((await actionOf(action)).said, "Delete it in the Instagram app.");
    // "I deleted it": it waits again, and its job only reads.
    assert.match((await byHand("viewer", up)).error?.message ?? "", /Not yours to change/);
    assert.deepEqual(ok(await byHand("owner", up), "by hand"), { fate: "asking" });
    assert.equal((await actionOf(action)).outcome, "pending");
    const read = ok(
      await db
        .from("jobs")
        .select("payload")
        .eq("tenant_id", A)
        .eq("kind", "post_take_down")
        .eq("payload->>by_hand", "yes"),
      "the read",
    );
    assert.equal(read.length, 1);
    // Gone: down, once.
    const gone = ok(await settle(action, "done"), "done");
    assert.equal(gone.fate, "kept");
    assert.deepEqual(gone.down, ["instagram"], "every place this take-down asked says done: said once, for the bell");
    assert.equal((await statusOf(up)).status, "taken_down");
    // The bell takes the take-down's two kinds (00682).
    for (const kind of ["post_down", "post_by_hand"])
      ok(await db.from("notifications").insert({ tenant_id: A, kind, title: "A take-down", body: "" }), kind);
    assert.deepEqual(ok(await settle(action, "blocked", "late"), "again"), { fate: "settled", outcome: "done" });
    assert.deepEqual(ok(await byHand("owner", up), "by hand, after"), { fate: "done" });
    const finished = ok(
      await db.from("remediations").select("cause, finished_at").eq("id", begun.remediation_id).single(),
      "the remediation",
    );
    assert.equal(finished.cause, "owner_removed");
    assert.ok(finished.finished_at);
  },
);

test(
  "Keep it up: the post stays on the owner's word, said once, the bell's line for it closes, and nothing is asked again",
  { skip },
  async () => {
    const f = await file();
    const other = await file();
    const ig = await post(f, "instagram", "picture", "published");
    const google = await post(f, "google", "picture", "published");
    const begun = ok(await begin("owner", f), "the press");
    const act = (postId) => begun.actions.find((a) => a.post_id === postId).action_id;
    // While its place is still being asked there is nothing to keep.
    assert.deepEqual(ok(await keep("owner", ig), "kept too early"), { fate: "asking" });
    ok(await settle(act(ig), "needs_person", "Delete it there."), "Instagram left it to the owner");
    ok(await settle(act(google), "needs_person", "Delete it there."), "Google left it to the owner");
    // The bell's lines as the edge writes them (post-told.ts), in the contract's own words.
    const line = (place, piece, about) => ({
      tenant_id: A,
      kind: "post_by_hand",
      title: TAKE_DOWN_BELL.byHand(place, piece),
      body: TAKE_DOWN_BELL.byHandWhy,
      subject_type: "file",
      subject_id: about,
    });
    ok(
      await db
        .from("notifications")
        .insert([
          line("instagram", "The finish", f),
          line("google", "The finish", f),
          line("instagram", "Another", other),
        ]),
      "the bell's lines",
    );
    const bell = async (title) =>
      ok(await db.from("notifications").select("closed_at").eq("tenant_id", A).eq("title", title).single(), title);

    // A viewer may not, and nor may another workspace's owner, of this workspace or as their own.
    assert.equal((await keep("viewer", ig)).error?.code, "42501");
    const stranger = as.stranger.client;
    assert.equal((await stranger.rpc("post_take_down_keep", { p_tenant_id: A, p_post_id: ig })).error?.code, "42501");
    assert.deepEqual(
      ok(await stranger.rpc("post_take_down_keep", { p_tenant_id: B, p_post_id: ig }), "as their own workspace"),
      { fate: "unknown" },
    );
    assert.equal((await actionOf(act(ig))).outcome, "needs_person", "a refused press changed nothing");

    const jobsBefore = await takeDownJobs();
    const kept = ok(await keep("owner", ig), "Keep it up");
    assert.deepEqual(kept, { fate: "left_up", post_id: ig, file_id: f, place: "instagram" });
    const row = await actionOf(act(ig));
    assert.deepEqual([row.outcome, row.left_up_by], ["left_up", as.owner.id], "who");
    assert.ok(row.finished_at, "when");
    assert.equal(row.said, "Delete it there.", "the place's own words stay on the record");
    assert.equal((await statusOf(ig)).status, "published", "the post is still up");
    assert.equal(await takeDownJobs(), jobsBefore, "nothing is asked of the place");
    assert.ok(
      (await bell(TAKE_DOWN_BELL.byHand("instagram", "The finish"))).closed_at,
      "its line on the bell is closed",
    );
    assert.equal(
      (await bell(TAKE_DOWN_BELL.byHand("google", "The finish"))).closed_at,
      null,
      "the other place's stays",
    );
    assert.equal((await bell(TAKE_DOWN_BELL.byHand("instagram", "Another"))).closed_at, null, "another piece's stays");

    // Said once; "I deleted it" from a page that had not heard, and a late answer from the place, change nothing.
    assert.deepEqual(ok(await keep("owner", ig), "pressed again"), kept);
    assert.deepEqual(ok(await byHand("owner", ig), "I deleted it, late"), { fate: "left_up" });
    assert.deepEqual(ok(await settle(act(ig), "done"), "a late answer"), { fate: "settled", outcome: "left_up" });
    assert.equal(await takeDownJobs(), jobsBefore);
    assert.equal((await statusOf(ig)).status, "published");
    assert.equal(
      (await actionOf(act(google))).outcome,
      "needs_person",
      "the other place is still the owner's to delete",
    );

    // A member reads who and when; another workspace reads nothing of it.
    const read = ok(
      await as.viewer.client.from("remediation_actions").select("outcome, left_up_by").eq("id", act(ig)).single(),
      "a member's read",
    );
    assert.deepEqual(read, { outcome: "left_up", left_up_by: as.owner.id });
    assert.deepEqual(
      ok(await stranger.from("remediation_actions").select("id").eq("id", act(ig)), "a stranger's read"),
      [],
    );

    // Take down again: the place is asked anew, and the older record keeps what it says.
    const again = ok(await begin("owner", f), "Take down again");
    assert.equal(again.fate, "begun");
    const second = again.actions.find((a) => a.post_id === ig);
    assert.equal(second.outcome, "pending");
    assert.notEqual(second.action_id, act(ig));
    assert.equal((await actionOf(act(ig))).outcome, "left_up");
    assert.deepEqual(ok(await keep("owner", ig), "while asked again"), { fate: "asking" });
  },
);

test(
  "the bell's line for a piece at a place ends with the last post there left to its owner, kept or deleted, in either order",
  { skip },
  async () => {
    /** A piece up on Instagram as a post and a story, taken down, each left to the owner; the bell rang for the place. */
    const leftToOwner = async () => {
      const f = await file();
      const feed = await post(f, "instagram", "picture", "published");
      const story = await post(f, "instagram", "story", "published");
      const begun = ok(await begin("owner", f), "the press");
      const act = (postId) => begun.actions.find((a) => a.post_id === postId).action_id;
      for (const one of [feed, story])
        ok(await settle(act(one), "needs_person", "Delete it there."), "left to the owner");
      ok(
        await db.from("notifications").insert({
          tenant_id: A,
          kind: "post_by_hand",
          title: TAKE_DOWN_BELL.byHand("instagram", "The finish"),
          body: TAKE_DOWN_BELL.byHandWhy,
          subject_type: "file",
          subject_id: f,
        }),
        "the bell's line",
      );
      const open = async () =>
        ok(
          await db
            .from("notifications")
            .select("id")
            .eq("tenant_id", A)
            .eq("kind", "post_by_hand")
            .eq("subject_id", f)
            .is("closed_at", null),
          "the open lines",
        ).length;
      return { feed, story, act, open };
    };

    // The post kept up first: the story is still to delete, so the line stays; it ends when Instagram shows the story gone.
    const first = await leftToOwner();
    assert.equal(ok(await keep("owner", first.feed), "keep the post").fate, "left_up");
    assert.equal(await first.open(), 1, "the story is still the owner's to delete");
    assert.deepEqual(ok(await byHand("owner", first.story), "I deleted it"), { fate: "asking" });
    const gone = ok(await settle(first.act(first.story), "done"), "Instagram shows it gone");
    assert.equal(gone.down, null, "the piece is not down: one post of it was kept up");
    assert.equal(await first.open(), 0, "nothing at Instagram is left to the owner");

    // The other order: the story deleted first, the post kept up last.
    const second = await leftToOwner();
    ok(await byHand("owner", second.story), "I deleted it");
    ok(await settle(second.act(second.story), "done"), "gone");
    assert.equal(await second.open(), 1, "the post is still to delete, or to keep");
    assert.equal(ok(await keep("owner", second.feed), "keep the post").fate, "left_up");
    assert.equal(await second.open(), 0);

    // The helper is nobody's to call from outside.
    const direct = await as.owner.client.rpc("post_by_hand_bell_settle", {
      p_tenant_id: A,
      p_file_id: randomUUID(),
      p_place: "instagram",
    });
    assert.ok(direct.error, "a member cannot call it");
  },
);
