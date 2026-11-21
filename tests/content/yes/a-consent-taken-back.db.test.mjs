/**
 * 00663 on a real Postgres: a yes is kept for each use of a file, and taken back (the content PRD's step L4 and its
 * section 8; section 9's gate "a consent taken back holds waiting posts and lists live ones").
 *
 * What must hold. An owner or a partner keeps a yes for a photo, for each use named, through file_yes_record; the same
 * person's yes for a use is one; members read the record and the file's own yes_for, and nobody but a door writes the
 * table. A yes taken back is taken back on the file and on every piece drawn from it, in one transaction that holds
 * every post of them still waiting, with the words handed, and answers every one already up or on its way; the file
 * says which uses were taken back. A piece whose photo's yes for posts was taken back takes no new post (post_begin
 * answers taken_back) until a yes is given on it again. Runs against the database `supabase start` builds on this
 * machine, never production.
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
      ? "refusing a database that is not on this machine: this suite writes workspaces, members, files and posts"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in need it"
        : false;

const stamp = Date.now().toString(36);
const users = [];
const workspaces = [];
let db;

const ok = (res, what = "a write") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

/** A member signed in as themselves: the session a page's route uses. */
async function memberOf(tenant, role, tag) {
  const email = `file-yes-${role}-${tag}-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  if (tenant) ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, client };
}

/** A photo of the Library that shows two people, and a post made from it. */
async function workspace(tag) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-yes-${tag}-${stamp}`, name: `Harbor Yes ${tag}` })
      .select("id")
      .single(),
  ).id;
  workspaces.push(tenant);
  const photo = randomUUID();
  const post = randomUUID();
  ok(
    await db.from("files").insert([
      {
        id: photo,
        tenant_id: tenant,
        status: "filed",
        source: "upload",
        name: `chair-${tag}`,
        mime: "image/jpeg",
        bytes: 1000,
        fingerprint: `fp-photo-${tag}-${stamp}`,
        look_status: "done",
        look: { line: "Two people at the chair.", people: { count: 2, recognizable: 2 } },
      },
      {
        id: post,
        tenant_id: tenant,
        status: "filed",
        source: "made",
        name: `post-${tag}`,
        mime: "image/jpeg",
        bytes: 1000,
        fingerprint: `fp-post-${tag}-${stamp}`,
        look_status: "done",
        look: { line: "A post." },
        made: { from: { id: photo, name: `chair-${tag}` }, plan: { file_id: photo, line: "New chair" } },
      },
    ]),
    "the photo and its post",
  );
  return {
    tenant,
    photo,
    post,
    owner: await memberOf(tenant, "owner", tag),
    operator: await memberOf(tenant, "operator", tag),
  };
}

const record = (who, ws, uses, file = ws.photo) =>
  who.client.rpc("file_yes_record", { p_tenant_id: ws.tenant, p_file_id: file, p_uses: uses, p_who: "Ana" });
const takeBack = (who, ws, uses, file = ws.photo) =>
  who.client.rpc("file_yes_take_back", {
    p_tenant_id: ws.tenant,
    p_file_id: file,
    ...(uses ? { p_uses: uses } : {}),
    p_held: "Someone in it took back their yes.",
  });
const fileOf = async (id) => ok(await db.from("files").select("yes_for, yes_back").eq("id", id).single());
const placement = async (ws, place, status, over = {}) =>
  ok(
    await db
      .from("posts")
      .insert({ tenant_id: ws.tenant, file_id: ws.post, place, kind: "picture", status, ...over })
      .select("id")
      .single(),
    `a ${status} post`,
  ).id;

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const tenant of workspaces) await db.from("tenants").delete().eq("id", tenant);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("a yes is kept for each use named, once a person, and members read it with the file", { skip }, async () => {
  const ws = await workspace("kept");
  const first = ok(await record(ws.owner, ws, ["post", "ad"]));
  assert.deepEqual([first.kept, first.again, first.yes_for], [["ad", "post"], [], ["ad", "post"]]);
  // Said again, with one more use: the standing two are not kept twice.
  const again = ok(await record(ws.owner, ws, ["post", "reply"]));
  assert.deepEqual([again.kept, again.again], [["reply"], ["post"]]);
  assert.deepEqual((await fileOf(ws.photo)).yes_for, ["ad", "post", "reply"]);
  // A member reads the record and the file's own standing; a yes for posts never stood for an ad by itself.
  const rows = ok(await ws.operator.client.from("file_consents").select("use, who, said_in").eq("file_id", ws.photo));
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.who === "Ana" && row.said_in === "ai"));
  const seen = ok(await ws.operator.client.from("files").select("yes_for, yes_back").eq("id", ws.photo).single());
  assert.deepEqual(seen, { yes_for: ["ad", "post", "reply"], yes_back: [] });
});

test(
  "only an owner or a partner keeps or takes back a yes, and nobody writes the record but its doors",
  { skip },
  async () => {
    const ws = await workspace("who");
    assert.equal((await record(ws.operator, ws, ["ad"])).error?.code, "42501", "an operator may not");
    assert.equal((await takeBack(ws.operator, ws, null)).error?.code, "42501");
    const stranger = await memberOf(null, "owner", "stranger");
    assert.equal((await record(stranger, ws, ["ad"])).error?.code, "42501", "nor someone of another workspace");
    const written = await ws.owner.client
      .from("file_consents")
      .insert({ tenant_id: ws.tenant, file_id: ws.photo, use: "ad", who: "Ana", said_in: "ai" });
    assert.ok(written.error, "the table takes no write from a member");
    assert.equal((await record(ws.owner, ws, ["anything"])).error?.code, "22023", "a use is one of the four");
    assert.equal((await record(ws.owner, ws, ["ad"], randomUUID())).error?.code, "P0002", "a file that is not there");
  },
);

test(
  "a yes taken back holds every waiting post of the file and of what was drawn from it, and answers every one up",
  { skip },
  async () => {
    const ws = await workspace("back");
    ok(await record(ws.owner, ws, ["post", "ad"]));
    const waiting = await placement(ws, "instagram", "queued");
    const up = await placement(ws, "google", "published", { permalink: "https://example.com/p/1" });
    const answer = ok(await takeBack(ws.owner, ws, ["post"]));
    assert.equal(answer.taken_back, 1, "the one yes for posts");
    assert.deepEqual(answer.uses, ["post"]);
    assert.deepEqual([...answer.files].sort(), [ws.photo, ws.post].sort(), "the photo, and the post drawn from it");
    assert.deepEqual(
      answer.held.map((post) => [post.post_id, post.place]),
      [[waiting, "instagram"]],
    );
    assert.deepEqual(
      answer.live.map((post) => [post.post_id, post.place, post.status, post.permalink]),
      [[up, "google", "published", "https://example.com/p/1"]],
    );
    assert.deepEqual(answer.ads, [], "no ad is made here yet (the Ads plan's G16)");
    const held = ok(await db.from("posts").select("status, held_reason").eq("id", waiting).single());
    assert.deepEqual(held, { status: "held", held_reason: "Someone in it took back their yes." });
    // The yes for ads stands: only posts were taken back.
    assert.deepEqual(await fileOf(ws.photo), { yes_for: ["ad"], yes_back: ["post"] });
  },
);

test(
  "a piece whose photo's yes for posts was taken back takes no new post, until a yes is given again",
  { skip },
  async () => {
    const ws = await workspace("again");
    ok(await record(ws.owner, ws, ["post"]));
    ok(await takeBack(ws.owner, ws, null));
    const begin = () =>
      ws.owner.client.rpc("post_begin", {
        p_tenant_id: ws.tenant,
        p_file_id: ws.post,
        p_place: "instagram",
        p_kind: "picture",
        p_caption: "New chair",
      });
    assert.equal(ok(await begin()).fate, "taken_back");
    // Given again, on the photo: the piece drawn from it may be posted.
    const given = ok(await record(ws.owner, ws, ["post"]));
    assert.deepEqual([given.yes_for, given.yes_back], [["post"], []]);
    assert.equal(ok(await begin()).fate, "begun");
    // Taking back every use where nothing stands for it records nothing new, and still answers.
    const nothing = ok(await takeBack(ws.owner, ws, ["cold_email"]));
    assert.equal(nothing.taken_back, 0);
  },
);
