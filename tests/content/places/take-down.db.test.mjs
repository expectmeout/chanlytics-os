/**
 * A post comes down, on a real database (00683; the content loop PRD's 5.3, 8.3 and 15.1), with real sessions: the owner's
 * press asks down what is up and lets go what waited, as one remediation with its job; a post is taken_down only once the
 * place's answer is kept, and kept once; "I deleted it" makes the action wait again and asks the place; a yes taken back,
 * for a file or for one person, holds what waits (rights) and asks down what is up; a person asked, and a no, are kept on
 * their row. A viewer may do none of it, and another workspace reads none of it.
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
  ok(await db.from("remediation_actions").select("outcome, said, finished_at").eq("id", id).single(), "action");
const begin = (who, fileId) => as[who].client.rpc("post_take_down_begin", { p_tenant_id: A, p_file_id: fileId });
const settle = (action, outcome, said = "") =>
  db.rpc("post_take_down_settle", { p_action_id: action, p_outcome: outcome, p_said: said });
const byHand = (who, postId) => as[who].client.rpc("post_take_down_by_hand", { p_tenant_id: A, p_post_id: postId });

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
  await db.from("remediations").delete().in("tenant_id", all);
  await db.from("posts").delete().in("tenant_id", all);
  await db.from("file_consents").delete().in("tenant_id", all);
  await db.from("file_subjects").delete().in("tenant_id", all);
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
    // The bell takes the take-down's two kinds (00683).
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
  "a yes taken back holds what waits and asks down what is up, for a file and for one person",
  { skip },
  async () => {
    const photo = await file({ source: "upload", made: null });
    const made = await file({ made: { from: { file_id: photo }, plan: { line: "Fresh cut" } } });
    ok(
      await as.owner.client.rpc("file_subjects_name", {
        p_tenant_id: A,
        p_file_id: photo,
        p_state: "named",
        p_people: [{ name: "Paola", label: "client" }],
      }),
      "Paola is in it",
    );
    const paola = ok(await db.from("file_subjects").select("id").eq("file_id", photo).single(), "her row").id;
    // Asked, said no, then yes: each kept on her row.
    ok(
      await as.owner.client.rpc("subject_ask_record", {
        p_tenant_id: A,
        p_subject_id: paola,
        p_via: "whatsapp",
        p_uses: ["post"],
      }),
      "asked",
    );
    ok(await as.owner.client.rpc("subject_no_record", { p_tenant_id: A, p_subject_id: paola }), "a no");
    let row = ok(
      await db.from("file_subjects").select("asked_via, asked_uses, said_no_at").eq("id", paola).single(),
      "row",
    );
    assert.deepEqual([row.asked_via, row.asked_uses], ["whatsapp", ["post"]]);
    assert.ok(row.said_no_at);
    assert.match(
      (await as.viewer.client.rpc("subject_no_record", { p_tenant_id: A, p_subject_id: paola })).error?.message ?? "",
      /Not yours to change/,
    );
    ok(
      await as.owner.client.rpc("subject_yes_record", {
        p_tenant_id: A,
        p_subject_id: paola,
        p_uses: ["post", "ad"],
        p_said_in: "in_person",
        p_evidence: {},
      }),
      "her yes",
    );
    row = ok(await db.from("file_subjects").select("said_no_at").eq("id", paola).single(), "row");
    assert.equal(row.said_no_at, null, "a yes answers a no");
    const waits = await post(made, "instagram", "story", "queued", {
      scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const up = await post(made, "instagram", "picture", "published");
    const back = ok(
      await as.owner.client.rpc("subject_yes_take_back", { p_tenant_id: A, p_subject_id: paola, p_uses: ["post"] }),
      "her yes taken back",
    );
    assert.equal(back.fate, "taken_back");
    assert.deepEqual(
      back.held.map((h) => h.post_id),
      [waits],
    );
    assert.deepEqual(await statusOf(waits), { status: "held", held_why: "rights" });
    assert.deepEqual(
      back.down.map((d) => [d.post_id, d.act, d.outcome]),
      [[up, "take_down", "pending"]],
    );
    assert.deepEqual(ok(await db.from("files").select("yes_for").eq("id", photo).single(), "photo").yes_for, ["ad"]);
    const again = ok(
      await as.owner.client.rpc("subject_yes_take_back", { p_tenant_id: A, p_subject_id: paola, p_uses: ["post"] }),
      "again",
    );
    assert.equal(again.fate, "none");
    // The file's own door walks the same way: nothing new is started for a post already being asked down.
    const whole = ok(
      await as.owner.client.rpc("file_yes_take_back", { p_tenant_id: A, p_file_id: photo, p_uses: ["post", "ad"] }),
      "the file's yes",
    );
    assert.deepEqual(whole.down, []);
    assert.deepEqual(
      whole.live.map((l) => l.post_id),
      [up],
    );
  },
);
