/**
 * An approval of an exact thing, on a real database (00680; the content loop PRD's 5.3, 8.1, 8.2, 15.1), with real
 * sessions: the owner's press writes the piece (a made picture's, the first time), its version, its shapes and the
 * approval with its placements and their jobs in one transaction; a viewer may not; another workspace sees nothing of it.
 * Right before a send the placement stands as approved, with the path of the approved bytes; a caption changed after
 * approval, or a snapshot changed in place, is changed. A shape kept with other bytes is changed and writes nothing; a
 * time past its reason's last moment is late. New words saved by a member who may approve are the piece's next version,
 * and a post still waiting goes up with them under a new approval of the same bytes: the save is the approval.
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
const SUM = (c) => c.repeat(64);

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function member(name, tenant, role) {
  const email = `approvals-${name}-${stamp}@example.com`;
  const password = `pw-${stamp}-${name}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `${name}'s seat`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), `${name} signs in`);
  return { client, id: made.data.user.id };
}

async function madeFile(over = {}) {
  const id = randomUUID();
  ok(
    await db.from("files").insert({
      id,
      tenant_id: A,
      status: "filed",
      source: "made",
      name: `approved-${id.slice(0, 8)}`,
      mime: "image/jpeg",
      bytes: 1000,
      fingerprint: `fp-${id}`,
      made: { from: null, plan: { line: "Open late" } },
      ...over,
    }),
    "the made file",
  );
  return id;
}

const at = () => new Date(Date.now() + 3_600_000).toISOString();
/** An approval of a picture as a post, with its portrait's bytes by checksum. */
const pictureApproval = (fileId, over = {}) => {
  const when = at();
  const path = `${A}/${fileId}/original.jpg`;
  return {
    snapshot: {
      revision: null,
      renditions: [{ shape: "4x5", file_id: fileId, path, checksum: SUM("a") }],
      placements: [{ place: "instagram", kind: "picture", at: when, caption: "Open late on Fridays." }],
      uses: ["post"],
      spend: null,
      facts: [],
    },
    intent: null,
    renditions: [{ shape: "4x5", path, checksum: SUM("a"), bytes: 1000 }],
    placements: [
      { place: "instagram", kind: "picture", at: when, caption: "Open late on Fridays.", capability_edition: 1 },
    ],
    via: "press",
    ...over,
  };
};
const approve = (who, fileId, approval) =>
  as[who].client.rpc("post_approve", { p_tenant_id: A, p_file_id: fileId, p_approval: approval });
const asApproved = async (postId) => ok(await db.rpc("post_as_approved", { p_post_id: postId }), "as approved");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenants = ok(
    await db
      .from("tenants")
      .insert([
        { name: `Approvals A ${stamp}`, slug: `approvals-a-${stamp}` },
        { name: `Approvals B ${stamp}`, slug: `approvals-b-${stamp}` },
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
  await db.from("posts").delete().in("tenant_id", all);
  await db.from("approvals").delete().in("tenant_id", all);
  await db.from("piece_renditions").delete().in("tenant_id", all);
  await db.from("piece_revisions").delete().in("tenant_id", all);
  await db.from("pieces").delete().in("tenant_id", all);
  await db.from("files").delete().in("tenant_id", all);
  await db.from("memberships").delete().in("tenant_id", all);
  await db.from("tenants").delete().in("id", all);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the owner's press writes the piece, its version, its shape and the approval with its placement and job",
  { skip },
  async () => {
    const fileId = await madeFile();
    const answer = ok(await approve("owner", fileId, pictureApproval(fileId)), "the press");
    assert.equal(answer.fate, "approved");
    assert.equal(answer.revision, 1);
    const piece = ok(
      await db.from("pieces").select("shape, card_key, revision").eq("id", answer.piece_id).single(),
      "piece",
    );
    assert.deepEqual(piece, { shape: "picture", card_key: `post:${fileId}`, revision: 1 });
    const approval = ok(await db.from("approvals").select("*").eq("id", answer.approval_id).single(), "approval");
    assert.equal(approval.subject_type, "piece_revision");
    assert.deepEqual(approval.snapshot.revision, { piece_id: answer.piece_id, n: 1 });
    assert.equal(approval.snapshot_hash, ok(await db.rpc("approval_hash", { p_snapshot: approval.snapshot }), "hash"));
    const [post] = answer.posts;
    const row = ok(await db.from("posts").select("*").eq("id", post.post_id).single(), "post");
    assert.equal(row.approval_id, answer.approval_id);
    assert.equal(row.piece_id, answer.piece_id);
    const jobs = ok(await db.from("jobs").select("kind").eq("payload->>post_id", post.post_id), "jobs");
    assert.deepEqual(
      jobs.map((j) => j.kind),
      ["post_prepare"],
    );
    // It stands as approved, with the approved bytes' path; a viewer reads the approval, a stranger nothing of it.
    const stands = await asApproved(post.post_id);
    assert.equal(stands.is, "stands");
    assert.equal(stands.path, `${A}/${fileId}/original.jpg`);
    assert.equal(
      ok(await as.viewer.client.from("approvals").select("id").eq("id", answer.approval_id), "viewer").length,
      1,
    );
    assert.equal(
      ok(await as.stranger.client.from("approvals").select("id").eq("id", answer.approval_id), "stranger").length,
      0,
    );
    assert.equal(
      ok(await as.stranger.client.from("piece_renditions").select("id").eq("tenant_id", A), "stranger").length,
      0,
    );
  },
);

test(
  "a caption changed after approval, or a snapshot changed in place, is changed right before the send",
  { skip },
  async () => {
    const fileId = await madeFile();
    const answer = ok(await approve("owner", fileId, pictureApproval(fileId)), "the press");
    const postId = answer.posts[0].post_id;
    ok(await db.from("posts").update({ caption: "Open late on Fridays! 20% off" }).eq("id", postId), "words changed");
    assert.equal((await asApproved(postId)).is, "changed");
    ok(await db.from("posts").update({ caption: "Open late on Fridays." }).eq("id", postId), "words back");
    assert.equal((await asApproved(postId)).is, "stands");
    const snapshot = ok(
      await db.from("approvals").select("snapshot").eq("id", answer.approval_id).single(),
      "s",
    ).snapshot;
    ok(
      await db
        .from("approvals")
        .update({ snapshot: { ...snapshot, spend: 1 } })
        .eq("id", answer.approval_id),
      "edited",
    );
    assert.equal((await asApproved(postId)).is, "changed");
  },
);

test(
  "a viewer may not approve; other bytes at a kept shape, or a time past the reason's end, write nothing",
  { skip },
  async () => {
    const fileId = await madeFile();
    const viewer = await approve("viewer", fileId, pictureApproval(fileId));
    assert.match(viewer.error?.message ?? "", /Not yours to change/);
    ok(await approve("owner", fileId, pictureApproval(fileId)), "the first press");
    ok(await db.from("posts").update({ status: "published" }).eq("file_id", fileId), "up");
    const before = ok(await db.from("approvals").select("id").eq("tenant_id", A), "approvals").length;
    const swapped = pictureApproval(fileId, {
      renditions: [{ shape: "4x5", path: `${A}/${fileId}/original.jpg`, checksum: SUM("e") }],
    });
    assert.equal(ok(await approve("owner", fileId, swapped), "swapped").fate, "changed");
    const late = pictureApproval(fileId);
    late.placements[0].good_until = new Date(Date.now() + 60_000).toISOString();
    assert.equal(ok(await approve("owner", fileId, late), "late").fate, "late");
    assert.equal(ok(await db.from("approvals").select("id").eq("tenant_id", A), "approvals").length, before);
  },
);

test(
  "the owner saves new words: the waiting post goes up with them under a new approval of the same bytes; a viewer may not",
  { skip },
  async () => {
    const fileId = await madeFile();
    const answer = ok(await approve("owner", fileId, pictureApproval(fileId)), "the press");
    const postId = answer.posts[0].post_id;
    const refused = await as.viewer.client.rpc("piece_words_keep", {
      p_tenant_id: A,
      p_file_id: fileId,
      p_caption: "x",
    });
    assert.match(refused.error?.message ?? "", /Not yours to change/);
    const kept = ok(
      await as.owner.client.rpc("piece_words_keep", {
        p_tenant_id: A,
        p_file_id: fileId,
        p_caption: "  Open late, every Friday.  ",
      }),
      "words kept",
    );
    assert.deepEqual(kept, { revision: 2, followed: 1 });
    const post = ok(await db.from("posts").select("caption, revision, approval_id").eq("id", postId).single(), "post");
    assert.equal(post.caption, "Open late, every Friday.");
    assert.equal(post.revision, 2);
    assert.notEqual(post.approval_id, answer.approval_id, "a new approval, by the member who saved the words");
    assert.equal((await asApproved(postId)).is, "stands", "an owner's own edit never strands a scheduled post");
    // The same words again change nothing; a change nobody pressed (the row itself) is still caught at the send.
    const again = ok(
      await as.owner.client.rpc("piece_words_keep", {
        p_tenant_id: A,
        p_file_id: fileId,
        p_caption: "Open late, every Friday.",
      }),
      "again",
    );
    assert.deepEqual(again, { revision: 2, followed: 0 });
    ok(await db.from("posts").update({ caption: "Edited in the table" }).eq("id", postId), "tampered");
    assert.equal((await asApproved(postId)).is, "changed");
  },
);
