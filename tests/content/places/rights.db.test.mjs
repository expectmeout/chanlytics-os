/**
 * Rights per person, on a real database (00691; the content loop PRD's 5.3, 6.1, 14.4, 15.1), with real sessions: who is
 * in a file is said by a member who may add files (an operator too), never a viewer; a person's own yes is kept by a
 * member who may change settings, with where it was said. A file's yes for a use stands only when every person named in
 * it has one. The gap follows a person into what was made from their photo, so the press on the made post is refused by
 * name, and a post already approved is held at its send. Naming people again is the whole list. A person erased takes
 * their row with them and leaves the file unsure. Another workspace reads none of it.
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
  const email = `rights-${name}-${stamp}@example.com`;
  const password = `pw-${stamp}-${name}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `${name}'s seat`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), `${name} signs in`);
  return { client, id: made.data.user.id };
}

/** A photo, and a post made from it. */
async function photoAndPost() {
  const photo = randomUUID();
  const made = randomUUID();
  const row = (id, over) => ({
    id,
    tenant_id: A,
    status: "filed",
    name: `rights-${id.slice(0, 8)}`,
    mime: "image/jpeg",
    bytes: 1000,
    fingerprint: `fp-${id}`,
    ...over,
  });
  ok(await db.from("files").insert(row(photo, { source: "upload" })), "the photo");
  ok(
    await db
      .from("files")
      .insert(row(made, { source: "made", made: { from: { file_id: photo }, plan: { line: "Fresh cut" } } })),
    "the post made from it",
  );
  return { photo, made };
}

const name = (who, file, state, people = null) =>
  as[who].client.rpc("file_subjects_name", { p_tenant_id: A, p_file_id: file, p_state: state, p_people: people });
const gap = async (who, file) =>
  ok(await as[who].client.rpc("file_rights_gap", { p_tenant_id: A, p_file_id: file, p_use: "post" }), "the gap");
const press = (file) =>
  as.owner.client.rpc("post_approve", {
    p_tenant_id: A,
    p_file_id: file,
    p_approval: {
      snapshot: {
        revision: null,
        renditions: [{ shape: "4x5", file_id: file, path: `${A}/${file}/original.jpg`, checksum: "a".repeat(64) }],
        placements: [{ place: "instagram", kind: "picture", at: new Date().toISOString(), caption: "Fresh cut." }],
        uses: ["post"],
        spend: null,
        facts: [],
      },
      renditions: [{ shape: "4x5", path: `${A}/${file}/original.jpg`, checksum: "a".repeat(64) }],
      placements: [{ place: "instagram", kind: "picture", caption: "Fresh cut." }],
    },
  });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenants = ok(
    await db
      .from("tenants")
      .insert([
        { name: `Rights A ${stamp}`, slug: `rights-a-${stamp}` },
        { name: `Rights B ${stamp}`, slug: `rights-b-${stamp}` },
      ])
      .select("id"),
    "the workspaces",
  );
  A = tenants[0].id;
  B = tenants[1].id;
  as.owner = await member("owner", A, "owner");
  as.operator = await member("operator", A, "operator");
  as.viewer = await member("viewer", A, "viewer");
  as.stranger = await member("stranger", B, "owner");
});

after(async () => {
  if (skip) return;
  const all = [A, B];
  await db.from("jobs").delete().in("tenant_id", all);
  await db.from("posts").delete().in("tenant_id", all);
  await db.from("approvals").delete().in("tenant_id", all);
  await db.from("piece_renditions").delete().in("tenant_id", all);
  await db.from("piece_revisions").delete().in("tenant_id", all);
  await db.from("pieces").delete().in("tenant_id", all);
  await db.from("file_consents").delete().in("tenant_id", all);
  await db.from("file_subjects").delete().in("tenant_id", all);
  await db.from("files").delete().in("tenant_id", all);
  await db.from("contacts").delete().in("tenant_id", all);
  await db.from("memberships").delete().in("tenant_id", all);
  await db.from("tenants").delete().in("id", all);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "an operator says who is in a photo; the post made from it is refused by name until each has said yes",
  { skip },
  async () => {
    const { photo, made } = await photoAndPost();
    assert.match((await name("viewer", photo, "none")).error?.message ?? "", /Not yours to change/);
    const people = [
      { name: "Paola", label: "client" },
      { name: "Ana", label: "staff" },
    ];
    assert.deepEqual(ok(await name("operator", photo, "named", people), "named"), { fate: "kept", added: 2 });
    assert.deepEqual(
      await gap("operator", made),
      { is: "person", name: "Ana" },
      "a made post shows who its photo shows",
    );
    assert.deepEqual(ok(await press(made), "the press"), { fate: "rights", name: "Ana", posts: [] });
    // A person's own yes is a settings change: not an operator's.
    const subjects = ok(await db.from("file_subjects").select("id, name").eq("file_id", photo), "subjects");
    const idOf = (who) => subjects.find((s) => s.name === who).id;
    const yes = (who, subject, over = {}) =>
      as[who].client.rpc("subject_yes_record", {
        p_tenant_id: A,
        p_subject_id: subject,
        p_uses: ["post"],
        p_said_in: "message",
        p_evidence: { message_id: randomUUID() },
        ...over,
      });
    assert.match((await yes("operator", idOf("Ana"))).error?.message ?? "", /Not yours to change/);
    assert.deepEqual(ok(await yes("owner", idOf("Ana")), "Ana's yes"), { fate: "kept", kept: 1 });
    assert.deepEqual(await gap("owner", made), { is: "person", name: "Paola" });
    assert.deepEqual(ok(await yes("owner", idOf("Paola"), { p_said_in: "in_person" }), "Paola's yes"), {
      fate: "kept",
      kept: 1,
    });
    assert.deepEqual(ok(await db.from("files").select("yes_for").eq("id", photo).single(), "photo").yes_for, ["post"]);
    // Both said yes: the press goes, and the placement stands at its send.
    const up = ok(await press(made), "the press");
    assert.equal(up.fate, "approved");
    assert.equal(ok(await db.rpc("post_as_approved", { p_post_id: up.posts[0].post_id }), "as approved").is, "stands");
    // Another workspace reads none of it, and may not ask.
    assert.equal(
      ok(await as.stranger.client.from("file_subjects").select("id").eq("tenant_id", A), "stranger").length,
      0,
    );
    assert.match(
      (await as.stranger.client.rpc("file_rights_gap", { p_tenant_id: A, p_file_id: made, p_use: "post" })).error
        ?.message ?? "",
      /Not yours to read/,
    );
  },
);

test(
  "naming people again is the whole list; a post already approved is held at its send for the one who has not said yes",
  { skip },
  async () => {
    const { photo, made } = await photoAndPost();
    ok(await name("owner", photo, "none"), "nobody");
    const up = ok(await press(made), "the press");
    assert.equal(up.fate, "approved");
    ok(await name("owner", photo, "named", [{ name: "Rosa", label: "client" }]), "Rosa is in it after all");
    assert.deepEqual(ok(await db.rpc("post_as_approved", { p_post_id: up.posts[0].post_id }), "as approved"), {
      is: "rights",
      name: "Rosa",
    });
    // Not sure: no new use, with no name. Nobody: every row goes.
    ok(await name("owner", photo, "unsure"), "unsure");
    assert.deepEqual(await gap("owner", made), { is: "unsure" });
    ok(await name("owner", photo, "none"), "none");
    assert.equal(ok(await db.from("file_subjects").select("id").eq("file_id", photo), "rows").length, 0);
    assert.deepEqual(await gap("owner", made), { is: "ok" });
  },
);

test("a person erased takes their row with them, and the file is unsure of who is in it again", { skip }, async () => {
  const { photo, made } = await photoAndPost();
  const contact = ok(
    await db.from("contacts").insert({ tenant_id: A, display_name: "Lu Erased" }).select("id").single(),
    "the person",
  ).id;
  ok(await name("owner", photo, "named", [{ name: "Lu", label: "client", contact_id: contact }]), "Lu");
  ok(await db.from("contacts").delete().eq("id", contact), "the person erased");
  assert.equal(ok(await db.from("file_subjects").select("id").eq("file_id", photo), "rows").length, 0);
  assert.equal(
    ok(await db.from("files").select("subjects_state").eq("id", photo).single(), "photo").subjects_state,
    "unsure",
  );
  assert.deepEqual(await gap("owner", made), { is: "unsure" });
});
