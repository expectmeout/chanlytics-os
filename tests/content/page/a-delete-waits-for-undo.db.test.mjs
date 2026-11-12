/**
 * 00616 on a real database, with real sessions (the content redesign's stage 3): a delete hides the file at once and its purge
 * waits ten minutes; Undo cancels the waiting purge and shows the file again, and imports may bring its picture once more; a
 * purge a run has taken can't be undone; whoever may not delete may not undo. And a Google post set for later than two
 * minutes on waits, queued, with its post_google job due at its time, while one for now is the press's own call as before.
 * And the bell takes its two new lines.
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
const MINUTE = 60_000;
let db;
let A;
const users = [];
const as = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function member(name, role) {
  const email = `undo-${name}-${stamp}@example.com`;
  const password = `pw-${stamp}-${name}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role }), `${name}'s seat`);
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
      source: "upload",
      name: `undo-${id.slice(0, 8)}`,
      mime: "image/jpeg",
      bytes: 1000,
      fingerprint: `fp-${id}`,
      ...over,
    }),
    "the file",
  );
  return id;
}

const purgeOf = async (fileId) =>
  ok(
    await db
      .from("jobs")
      .select("id, state, due_at")
      .eq("tenant_id", A)
      .eq("kind", "file_purge")
      .eq("payload->>file_id", fileId),
    "the purge",
  );
const fileOf = async (id) =>
  ok(await db.from("files").select("removed_at, fingerprint").eq("id", id).maybeSingle(), "file");
const letGo = async (fingerprint) =>
  ok(await db.from("files_let_go").select("fingerprint").eq("tenant_id", A).eq("fingerprint", fingerprint), "let go");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const [tenant] = ok(
    await db
      .from("tenants")
      .insert([{ name: `Undo ${stamp}`, slug: `undo-${stamp}` }])
      .select("id"),
    "the workspace",
  );
  A = tenant.id;
  as.owner = await member("owner", "owner");
  as.operator = await member("operator", "operator");
});

after(async () => {
  if (skip) return;
  await db.from("jobs").delete().eq("tenant_id", A);
  await db.from("posts").delete().eq("tenant_id", A);
  await db.from("notifications").delete().eq("tenant_id", A);
  await db.from("files_let_go").delete().eq("tenant_id", A);
  await db.from("files").delete().eq("tenant_id", A);
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("memberships").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test("a delete hides the file at once, and its purge waits ten minutes for Undo", { skip }, async () => {
  const id = await file();
  ok(await as.owner.client.rpc("file_remove", { p_tenant_id: A, p_id: id }), "remove");
  assert.ok((await fileOf(id)).removed_at, "hidden at the press");
  const [purge] = await purgeOf(id);
  assert.equal(purge.state, "scheduled");
  const wait = Date.parse(purge.due_at) - Date.now();
  assert.ok(wait > 9 * MINUTE && wait <= 10 * MINUTE + 5_000, `due about ten minutes on, not ${wait} ms`);
});

test(
  "Undo cancels the waiting purge, shows the file again, and lets imports bring its picture once more",
  { skip },
  async () => {
    const id = await file();
    ok(await as.owner.client.rpc("file_remove", { p_tenant_id: A, p_id: id }), "remove");
    const { fingerprint } = await fileOf(id);
    assert.equal((await letGo(fingerprint)).length, 1, "kept out of imports while deleted");
    ok(await as.owner.client.rpc("file_restore", { p_tenant_id: A, p_id: id }), "restore");
    assert.equal((await fileOf(id)).removed_at, null);
    assert.deepEqual(
      (await purgeOf(id)).map((j) => j.state),
      ["canceled"],
    );
    assert.equal((await letGo(fingerprint)).length, 0);
    // Twice is once: the second finds no purge waiting.
    const again = await as.owner.client.rpc("file_restore", { p_tenant_id: A, p_id: id });
    assert.equal(again.error?.code, "P0002");
  },
);

test("a purge a run has taken can't be undone, and whoever may not delete may not undo", { skip }, async () => {
  const taken = await file();
  ok(await as.owner.client.rpc("file_remove", { p_tenant_id: A, p_id: taken }), "remove");
  const [purge] = await purgeOf(taken);
  ok(await db.from("jobs").update({ state: "fired", fired_at: new Date().toISOString() }).eq("id", purge.id), "taken");
  const late = await as.owner.client.rpc("file_restore", { p_tenant_id: A, p_id: taken });
  assert.equal(late.error?.code, "P0002");
  assert.ok((await fileOf(taken)).removed_at, "still deleted");

  const kept = await file();
  ok(await as.owner.client.rpc("file_remove", { p_tenant_id: A, p_id: kept }), "remove");
  const refused = await as.operator.client.rpc("file_restore", { p_tenant_id: A, p_id: kept });
  assert.equal(refused.error?.code, "42501");
  assert.ok((await fileOf(kept)).removed_at);
});

test(
  "a Google post for later waits with its job due at its time; one for now is the press's own call",
  { skip },
  async () => {
    const later = await file({ source: "made" });
    const when = new Date(Date.now() + 24 * 60 * MINUTE).toISOString();
    const begun = ok(
      await as.owner.client.rpc("post_begin", {
        p_tenant_id: A,
        p_file_id: later,
        p_place: "google",
        p_kind: "picture",
        p_caption: "Open late this Saturday.",
        p_when: when,
      }),
      "later",
    );
    assert.equal(begun.fate, "begun");
    const post = ok(await db.from("posts").select("status, scheduled_for").eq("id", begun.post_id).single(), "post");
    assert.equal(post.status, "queued");
    const jobs = ok(
      await db.from("jobs").select("kind, due_at, payload").eq("tenant_id", A).eq("payload->>post_id", begun.post_id),
      "its job",
    );
    assert.deepEqual(
      jobs.map((j) => [j.kind, j.payload.attempt, Date.parse(j.due_at)]),
      [["post_google", "1", Date.parse(when)]],
    );
    // Don't post holds up to its time.
    assert.equal(ok(await as.owner.client.rpc("post_pull", { p_post_id: begun.post_id }), "pull").fate, "pulled");

    const now = await file({ source: "made" });
    const pressed = ok(
      await as.owner.client.rpc("post_begin", {
        p_tenant_id: A,
        p_file_id: now,
        p_place: "google",
        p_kind: "picture",
        p_caption: "Open late this Saturday.",
      }),
      "now",
    );
    const sent = ok(await db.from("posts").select("status").eq("id", pressed.post_id).single(), "post");
    assert.equal(sent.status, "publishing", "the press asks Google itself");
    const none = ok(
      await db.from("jobs").select("id").eq("tenant_id", A).eq("payload->>post_id", pressed.post_id),
      "jobs",
    );
    assert.equal(none.length, 0);
  },
);

test("the bell takes a post that went up at its time, and one held", { skip }, async () => {
  for (const kind of ["post_up", "post_stopped"])
    ok(await db.from("notifications").insert({ tenant_id: A, kind, title: "A post", body: "It moved." }), kind);
});
