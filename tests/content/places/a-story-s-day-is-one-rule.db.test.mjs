/**
 * A story's day is one rule, on a real database (00716; the content status review of 24 Nov 2026, C3). The database's
 * rule, post_story_ended, answers every case of the story-day table (_story-day-cases.mjs) as the code's storyRanItsDay
 * does, so the two cannot drift: under a day, exactly a day, over a day, and with no time it went up. And its two
 * readers ask it: the due list of posts' numbers (post_observations_due) asks nothing of a story whose day is over,
 * and the take-down's walk (posts_take_down_start, behind the owner's press) leaves one. The rule is the service's:
 * no member's session may ask it.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { storyRanItsDay } from "@chanlytics/contracts";
import { ASKED_AT, STORY_DAY_CASES } from "./_story-day-cases.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, users and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const stamp = Date.now().toString(36);
const HOUR = 3_600_000;
let db;
let A;
let owner;
const users = [];

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString();

async function file() {
  const id = randomUUID();
  ok(
    await db.from("files").insert({
      id,
      tenant_id: A,
      status: "filed",
      source: "made",
      name: `day-${id.slice(0, 8)}`,
      mime: "image/jpeg",
      bytes: 1000,
      fingerprint: `fp-${id}`,
      made: { from: null, plan: { line: "Open late" } },
    }),
    "a file",
  );
  return id;
}

/** A post that is up on Instagram, by when it went up (null: no time kept) and when it was set for. */
async function up(fileId, kind, publishedAt, scheduledFor) {
  const row = ok(
    await db
      .from("posts")
      .insert({
        tenant_id: A,
        file_id: fileId,
        place: "instagram",
        kind,
        status: "published",
        external_id: `ext-${randomUUID().slice(0, 8)}`,
        published_at: publishedAt,
        scheduled_for: scheduledFor,
      })
      .select("id")
      .single(),
    `a ${kind} up`,
  );
  return row.id;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ name: `Day ${stamp}`, slug: `day-${stamp}` })
      .select("id")
      .single(),
    "the workspace",
  ).id;
  const email = `story-day-${stamp}@example.com`;
  const password = `pw-${stamp}-day-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }), "the seat");
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await owner.auth.signInWithPassword({ email, password }), "the owner signs in");
});

after(async () => {
  if (skip) return;
  await db.from("jobs").delete().eq("tenant_id", A);
  await db.from("notifications").delete().eq("tenant_id", A);
  await db.from("remediations").delete().eq("tenant_id", A);
  await db.from("posts").delete().eq("tenant_id", A);
  await db.from("files").delete().eq("tenant_id", A);
  await db.from("memberships").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("the database's rule answers every case as the code's does", { skip }, async () => {
  for (const { name, post, ended } of STORY_DAY_CASES) {
    const said = ok(
      await db.rpc("post_story_ended", {
        p_kind: post.kind,
        p_published_at: post.published_at,
        p_scheduled_for: post.scheduled_for,
        p_at: ASKED_AT,
      }),
      name,
    );
    assert.equal(said, ended, `the database: ${name}`);
    assert.equal(said, storyRanItsDay(post, Date.parse(ASKED_AT)), `the database and the code: ${name}`);
  }
});

test("asked with no moment the rule answers for now, and it is the service's alone", { skip }, async () => {
  const story = (hours) => ({ p_kind: "story", p_published_at: ago(hours), p_scheduled_for: ago(hours) });
  assert.equal(ok(await db.rpc("post_story_ended", story(25)), "a story 25 hours old"), true);
  assert.equal(ok(await db.rpc("post_story_ended", story(23)), "a story 23 hours old"), false);
  assert.ok((await owner.rpc("post_story_ended", story(25))).error, "a member's session may not ask it");
});

test("the due list asks nothing of a story whose day is over, and the take-down leaves one", { skip }, async () => {
  const made = await file();
  const young = await up(made, "story", ago(23), ago(23));
  const ended = await up(made, "story", ago(25), ago(25));
  // No time it went up is kept: the day is counted from the time it was set for.
  const undatedEnded = await up(made, "story", null, ago(48));
  const undatedYoung = await up(made, "story", null, ago(1));
  const picture = await up(made, "picture", ago(30 * 24), ago(30 * 24));

  const due = ok(await db.rpc("post_observations_due", { p_limit: 1000 }), "what is due");
  const stepsOf = (id) =>
    due
      .filter((d) => d.post_id === id)
      .map((d) => d.step)
      .sort();
  assert.deepEqual(stepsOf(young), ["1d", "1h"], "a story 23 hours old is read at its hour and at 22 hours");
  assert.deepEqual(stepsOf(ended), [], "an ended story is asked nothing");
  // Each read's time is counted from the time a post went up: with none, nothing is due, ended or not.
  assert.deepEqual(stepsOf(undatedEnded), []);
  assert.deepEqual(stepsOf(undatedYoung), []);

  const begun = ok(await owner.rpc("post_take_down_begin", { p_tenant_id: A, p_file_id: made }), "the owner's press");
  assert.equal(begun.fate, "begun");
  assert.deepEqual(
    begun.actions.map((a) => [a.post_id, a.act]).sort(),
    [
      [young, "take_down"],
      [undatedYoung, "take_down"],
      [picture, "take_down"],
    ].sort(),
    "what is up is asked down; a story that ran its day is gone already, and is left",
  );
  const left = ok(await db.from("posts").select("id, status").in("id", [ended, undatedEnded]), "the two left");
  assert.deepEqual(
    left.map((p) => p.status),
    ["published", "published"],
  );
});
