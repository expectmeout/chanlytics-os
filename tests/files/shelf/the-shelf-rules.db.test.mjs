/**
 * The shelf's rules, on a real database (00695, the archive plan's B2): a made video's copy on the shelf is begun
 * with its job in one step and within the shelf's room; it is checked only where the size and the SHA-256 are the
 * ones that were sent; a video may step aside behind a checked shelf copy and behind nothing less, never behind a
 * copy saved to the owner's Drive; a return from the shelf writes nothing on a provider's day; a copy found missing is
 * put back, and the video is lost only when nothing is left to put it back from; a copy left saving gets its job
 * again; a purge takes the rows; and a member reads no key and calls no door.
 *
 * And 00729's (lane 1 of the "Prove it works" plan): the shelf's room is counted one way, so a failed copy tried again
 * cannot pass the limit; a return that waited on a copy goes back on the ledger in the step that checks it; what the
 * shelf is owed is found for every workspace in one statement; and a video whose kept file is gone says so once.
 *
 * In workspaces of its own. Runs against the local stack `supabase start` builds, never production: it makes
 * workspaces, users and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
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
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const stamp = Date.now().toString(36);
const SHA = "a".repeat(64);
const OTHER_SHA = "b".repeat(64);
const BYTES = 30_000_000;
/** The shelf's room in seconds: contracts FILE_SHELF_MINUTES_MAX, as the edge passes it. */
const ROOM = 300 * 60;
let db;
const tenants = [];
const users = [];
let serial = 0;

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const refused = (r, code, what) =>
  assert.equal(r.error?.code, code, `${what}: ${r.error?.message ?? "it went through"}`);

async function workspace() {
  serial += 1;
  const tag = `${stamp}-${serial}`;
  const [tenant] = ok(
    await db
      .from("tenants")
      .insert({ name: `Shelf ${tag}`, slug: `shelf-${tag}` })
      .select("id"),
    "the workspace",
  );
  tenants.push(tenant.id);
  return { T: tenant.id, tag };
}

/** A video in a workspace's Library, made here unless said, playable, looked at, and last used two hours ago. */
async function video(ws, over = {}) {
  serial += 1;
  const long = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const [row] = ok(
    await db
      .from("files")
      .insert({
        tenant_id: ws.T,
        status: "filed",
        source: "made",
        name: `shelf-video-${stamp}-${serial}`,
        mime: "video/mp4",
        bytes: BYTES,
        fingerprint: `shelf-fp-${stamp}-${serial}`,
        kind: "video",
        media_ref: `shelf-ref-${stamp}-${serial}`,
        media_status: "ready",
        seconds: 60,
        look_status: "done",
        created_at: long,
        ready_at: long,
        copy_used_at: long,
        ...over,
      })
      .select("id"),
    "a video",
  );
  return row.id;
}

const rpc = async (name, args, what = name) => ok(await db.rpc(name, args), what);
const begin = (ws, fileId, over = {}) =>
  rpc("file_shelf_begin", {
    p_tenant_id: ws.T,
    p_file_id: fileId,
    p_bytes: BYTES,
    p_sha256: SHA,
    p_seconds_max: ROOM,
    ...over,
  });
const checked = (ws, fileId, bytes = BYTES, sha256 = SHA) =>
  rpc("file_shelf_checked", { p_tenant_id: ws.T, p_file_id: fileId, p_bytes: bytes, p_sha256: sha256 });
const failedAs = (ws, fileId, why) => rpc("file_shelf_failed", { p_tenant_id: ws.T, p_file_id: fileId, p_why: why });
const again = (ws, fileId) => rpc("file_shelf_again", { p_tenant_id: ws.T, p_file_id: fileId });
/** Put back within a limit (00729): the third input the door takes since. */
const againWithin = (ws, fileId, max) =>
  rpc("file_shelf_again", { p_tenant_id: ws.T, p_file_id: fileId, p_seconds_max: max });
const seconds = (ws) => rpc("file_shelf_seconds", { p_tenant_id: ws.T });
/** What the shelf is owed, with a pass's own numbers unless a case says: every workspace's, so a case reads its own ids. */
const owed = (over = {}) =>
  rpc("file_shelf_owed", {
    p_seconds_max: ROOM,
    p_bytes_max: 150_000_000,
    p_stale_seconds: 3600,
    p_limit: 1000,
    ...over,
  });
const unkept = (ws, fileId) => rpc("file_shelf_unkept", { p_tenant_id: ws.T, p_file_id: fileId });
/** A workspace whose shelf is switched on, as its config says it (features.video_shelf). */
async function shelving(ws = null) {
  const on = ws ?? (await workspace());
  ok(
    await db.from("tenant_config").upsert({ tenant_id: on.T, config: { features: { video_shelf: true } } }),
    "the switch",
  );
  return on;
}
const returnsOf = async (fileId) =>
  ok(
    await db.from("jobs").select("state, payload").eq("kind", "copy_return").eq("payload->>file_id", fileId),
    "its returns",
  );
const idsOf = (list) => list.map((row) => row.file_id);
const settle = (ws, fileId) => rpc("file_copy_settle", { p_tenant_id: ws.T, p_file_id: fileId });
const shelved = async (ws, over = {}) => {
  const id = await video(ws, over);
  assert.equal((await begin(ws, id)).fate, "begun");
  assert.equal(await checked(ws, id), "checked");
  return id;
};
/** Every copy that may go, marked going: the let-go by age, with now as both of its times. Answers their ids. */
const letGoAll = async (ws) => {
  const now = new Date().toISOString();
  const went = await rpc("file_copies_let_go", {
    p_tenant_id: ws.T,
    p_seconds: null,
    p_unused_before: now,
    p_rested_before: now,
    p_limit: 100,
  });
  return went.map((copy) => copy.id);
};
const gone = (ws, fileId) => rpc("file_copy_gone", { p_tenant_id: ws.T, p_id: fileId });
const returnBegin = (ws, fileId, returnsMax = 20) =>
  rpc("file_copy_return_begin", {
    p_tenant_id: ws.T,
    p_id: fileId,
    p_units: 205,
    p_platform_bytes_max: 800_000_000_000,
    p_workspace_returns_max: returnsMax,
    p_units_max: 300_000_000,
    p_stale_seconds: 600,
  });
const fileNow = async (fileId) =>
  ok(await db.from("files").select("copy_state, copy_why, media_ref").eq("id", fileId).single(), "the file");
const shelfOf = async (fileId) => {
  const rows = ok(
    await db
      .from("file_archives")
      .select("id, state, why, checked_at, file_archive_parts(part, state, shelf_key, bytes, sha256)")
      .eq("file_id", fileId)
      .eq("origin", "shelf"),
    "the shelf copy",
  );
  return rows[0] ?? null;
};
const jobsOf = async (fileId) =>
  ok(
    await db.from("jobs").select("id, state, tenant_id").eq("kind", "file_shelve").eq("payload->>file_id", fileId),
    "its jobs",
  );
/** A job ended as the ledger ends one: fired first, then what it came to. */
async function endJobs(fileId, state) {
  for (const job of (await jobsOf(fileId)).filter((j) => j.state === "scheduled")) {
    ok(await db.from("jobs").update({ state: "fired", fired_at: new Date().toISOString() }).eq("id", job.id), "fired");
    ok(await db.from("jobs").update({ state }).eq("id", job.id), state);
  }
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
});

after(async () => {
  if (skip) return;
  await db.from("jobs").delete().in("tenant_id", tenants);
  await db.from("source_connections").delete().in("tenant_id", tenants);
  await db.from("files").delete().in("tenant_id", tenants);
  await db.from("memberships").delete().in("tenant_id", tenants);
  await db.from("tenants").delete().in("id", tenants);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "a made video's shelf copy is begun with its job in one step, once, and within the shelf's room",
  { skip },
  async () => {
    const ws = await workspace();
    const file = await video(ws);
    assert.deepEqual(await begin(ws, file), { fate: "begun" });
    const copy = await shelfOf(file);
    assert.equal(copy.state, "saving");
    assert.deepEqual(copy.file_archive_parts, [
      { part: "video", state: "saving", shelf_key: `${ws.T}/${file}/video`, bytes: BYTES, sha256: SHA },
    ]);
    const jobs = await jobsOf(file);
    assert.deepEqual(
      jobs.map((job) => [job.state, job.tenant_id]),
      [["scheduled", ws.T]],
      "its job, written by the door itself",
    );
    assert.deepEqual(await begin(ws, file), { fate: "kept", state: "saving" });
    assert.equal((await jobsOf(file)).length, 1, "asked again, there is still one job");

    // Not a made video, removed, another workspace's, or none at all: no copy.
    const upload = await video(ws, { source: "upload" });
    const photo = await video(ws, {
      kind: "image",
      mime: "image/jpeg",
      media_ref: null,
      media_status: null,
      seconds: null,
    });
    const removed = await video(ws, { removed_at: new Date().toISOString() });
    const elsewhere = await workspace();
    for (const [what, id, on] of [
      ["a video its owner added", upload, ws],
      ["a picture", photo, ws],
      ["a removed video", removed, ws],
      ["another workspace's video", file, elsewhere],
      ["no such file", "00000000-0000-4000-8000-00000000ffff", ws],
    ])
      assert.deepEqual(await begin(on, id), { fate: "none" }, what);
    refused(
      await db.rpc("file_shelf_begin", {
        p_tenant_id: ws.T,
        p_file_id: file,
        p_bytes: 0,
        p_sha256: SHA,
        p_seconds_max: ROOM,
      }),
      "22023",
      "a copy of no bytes",
    );
    refused(
      await db.rpc("file_shelf_begin", {
        p_tenant_id: ws.T,
        p_file_id: file,
        p_bytes: 5,
        p_sha256: "abc",
        p_seconds_max: ROOM,
      }),
      "22023",
      "a checksum that is no SHA-256",
    );

    // The room: one copy of 60 seconds is on its way. Room for 160 lets a video of 100 in, and room for 159 does not.
    const long = await video(ws, { seconds: 100 });
    assert.deepEqual(await begin(ws, long, { p_seconds_max: 159 }), { fate: "full" });
    assert.equal(await shelfOf(long), null, "a video that does not fit has no row");
    assert.equal((await jobsOf(long)).length, 0, "and no job");
    assert.deepEqual(await begin(ws, long, { p_seconds_max: 160 }), { fate: "begun" });
    // And at the whole room, to the second: 300 minutes hold a video that fills them, and not one second more.
    const filling = await workspace();
    const whole = await video(filling, { seconds: ROOM });
    assert.deepEqual(await begin(filling, whole), { fate: "begun" });
    assert.deepEqual(await begin(filling, await video(filling, { seconds: 1 })), { fate: "full" });
  },
);

test("a copy is checked only where the size and the SHA-256 are the ones that were sent", { skip }, async () => {
  const ws = await workspace();
  assert.equal(await checked(ws, await video(ws)), "none", "no copy saving");
  for (const [what, bytes, sha256] of [
    ["another size", BYTES - 1, SHA],
    ["another SHA-256", BYTES, OTHER_SHA],
    ["a SHA-256 the shelf does not say", BYTES, null],
  ]) {
    const file = await video(ws);
    await begin(ws, file);
    assert.equal(await checked(ws, file, bytes, sha256), "mismatch", what);
    const copy = await shelfOf(file);
    assert.deepEqual([copy.state, copy.why, copy.file_archive_parts[0].state], ["failed", "mismatch", "failed"], what);
    assert.equal(await checked(ws, file), "none", "a failed copy is not checked by asking");
  }
  const file = await video(ws);
  await begin(ws, file);
  assert.equal(await checked(ws, file), "checked");
  const copy = await shelfOf(file);
  assert.deepEqual([copy.state, copy.why, copy.file_archive_parts[0].state], ["checked", null, "checked"]);
  assert.ok(copy.checked_at, "it says when");
  assert.equal(await checked(ws, file), "checked", "asked again of one already checked: the same answer");
});

test("a video may step aside behind a checked shelf copy, and behind nothing less", { skip }, async () => {
  const ws = await workspace();
  const shelf = await shelved(ws);
  const saving = await video(ws);
  await begin(ws, saving);
  const failed = await video(ws);
  await begin(ws, failed);
  await checked(ws, failed, BYTES - 1);
  const none = await video(ws);
  const upload = await video(ws, { source: "upload" });
  // A copy the owner saved to their Drive, and an origin they picked, never make a video one that may go (FR-4.9).
  const saved = await video(ws);
  const picked = await video(ws, { source: "upload" });
  const record = {
    tenant_id: ws.T,
    google_account: "google-sub-1",
    state: "checked",
    checked_at: new Date().toISOString(),
  };
  ok(await db.from("file_archives").insert({ ...record, file_id: saved, origin: "saved" }), "a saved copy");
  ok(await db.from("file_archives").insert({ ...record, file_id: picked, origin: "picked" }), "a picked origin");

  const road = await rpc("video_minutes_by_road", { p_tenant_id: ws.T });
  assert.equal(Number(road.can_step_aside), 60, "the minutes that can step aside are the shelved video's alone");
  const went = await rpc("file_copies_let_go", {
    p_tenant_id: ws.T,
    p_seconds: null,
    p_unused_before: new Date().toISOString(),
    p_rested_before: new Date().toISOString(),
    p_limit: 100,
  });
  assert.deepEqual(
    went.map((copy) => copy.id),
    [shelf],
    "only the video with a checked shelf copy",
  );
  // The answer the code live before 00695 reads keeps its shape.
  assert.deepEqual(Object.keys(went[0]).sort(), ["id", "media_ref", "seconds"]);
  for (const id of [saving, failed, none, upload, saved, picked]) assert.equal((await fileNow(id)).copy_state, "here");

  // Marked going, and its shelf copy was not what it should be: here again, playing, with its id.
  assert.equal(await rpc("file_copy_kept", { p_tenant_id: ws.T, p_id: shelf }), true);
  const kept = await fileNow(shelf);
  assert.deepEqual([kept.copy_state, kept.copy_why, Boolean(kept.media_ref)], ["here", null, true]);
  assert.equal(await rpc("file_copy_kept", { p_tenant_id: ws.T, p_id: shelf }), false, "one that is not going");
});

test(
  "a return from the shelf spends none of a provider's day, and the workspace's own returns still bind",
  { skip },
  async () => {
    const ws = await workspace();
    const file = await shelved(ws);
    assert.deepEqual(await letGoAll(ws), [file]);
    assert.equal(await gone(ws, file), true);
    assert.deepEqual(await fileNow(file), { copy_state: "away", copy_why: null, media_ref: null });
    const standing = await settle(ws, file);
    assert.deepEqual([standing.copy_state, standing.shelf, standing.item_id], ["away", true, null]);

    const day = async () =>
      ok(await db.from("source_days").select("day, units, bytes, returns").order("day"), "the days");
    const before = await day();
    const tight = await returnBegin(ws, file, 0);
    assert.deepEqual([tight.fate, tight.binds], ["wait", "workspace_returns"]);
    assert.equal((await fileNow(file)).copy_why, "budget");
    assert.deepEqual(await returnBegin(ws, file), { fate: "go" });
    assert.equal((await fileNow(file)).copy_state, "returning");
    assert.deepEqual(await day(), before, "nothing of a provider's day was asked or written");
    // The platform's word finishes it as it does a watched clip's.
    const ref = `shelf-back-${stamp}`;
    assert.equal(await rpc("file_copy_returning", { p_tenant_id: ws.T, p_id: file, p_media_ref: ref }), true);
    const ready = await rpc("file_media_ready", { p_media_ref: ref, p_seconds: 60, p_width: 1080, p_height: 1920 });
    assert.equal(ready.fate, "returned");
    assert.equal((await fileNow(file)).copy_state, "here");
  },
);

test(
  "a copy found missing is put back, and the video is lost only when nothing is left to put it back from",
  { skip },
  async () => {
    const ws = await workspace();
    const file = await shelved(ws);
    await letGoAll(ws);
    await gone(ws, file);
    await endJobs(file, "done");

    assert.equal(await again(ws, file), true);
    const back = await shelfOf(file);
    assert.deepEqual([back.state, back.why, back.checked_at], ["saving", null, null]);
    assert.deepEqual(
      [back.file_archive_parts[0].state, back.file_archive_parts[0].sha256, back.file_archive_parts[0].bytes],
      ["saving", SHA, BYTES],
      "its bytes and its SHA-256 are kept",
    );
    assert.equal((await jobsOf(file)).filter((job) => job.state === "scheduled").length, 1, "with its job");
    const meanwhile = await settle(ws, file);
    assert.deepEqual([meanwhile.copy_state, meanwhile.shelf], ["away", false], "being put back is not lost");
    assert.equal((await letGoAll(ws)).includes(file), false);
    assert.equal(await checked(ws, file), "checked");
    assert.equal((await settle(ws, file)).shelf, true);

    // The shelf would not take it: failed, and the video is not lost, since its own file is still Chanlytics'.
    await again(ws, file);
    assert.equal(await failedAs(ws, file, "refused"), true);
    assert.deepEqual(await fileNow(file), { copy_state: "away", copy_why: null, media_ref: null });
    // The file it is put from is gone: now nothing is left, and it says so.
    assert.equal(await again(ws, file), true, "a failed copy can be put back again");
    assert.equal(await failedAs(ws, file, "not_found"), true);
    assert.deepEqual(await fileNow(file), { copy_state: "lost", copy_why: "no_origin", media_ref: null });
    assert.equal((await returnBegin(ws, file)).fate, "lost");

    // A video that is here stays here, whatever its shelf copy came to.
    const here = await shelved(ws);
    await again(ws, here);
    await failedAs(ws, here, "mismatch");
    assert.equal((await fileNow(here)).copy_state, "here");
    refused(
      await db.rpc("file_shelf_failed", { p_tenant_id: ws.T, p_file_id: here, p_why: "drive_full" }),
      "22023",
      "a reason of another copy's",
    );
    assert.equal(await failedAs(ws, here, "refused"), false, "nothing saving: nothing to fail");
    const removed = await shelved(ws);
    ok(await db.from("files").update({ removed_at: new Date().toISOString() }).eq("id", removed), "removed");
    assert.equal(await again(ws, removed), false, "a removed file's copy is not put back");
  },
);

test("a copy left saving gets its job again, and one whose job is on the ledger gets no second", { skip }, async () => {
  const ws = await workspace();
  const stale = await video(ws);
  await begin(ws, stale);
  await endJobs(stale, "failed");
  const live = await video(ws);
  await begin(ws, live);
  // Nothing is an hour old yet.
  await rpc("file_shelf_requeue", { p_stale_seconds: 3600, p_limit: 100 });
  assert.equal((await jobsOf(stale)).filter((job) => job.state === "scheduled").length, 0, "a fresh one is left");
  // Every copy saving, however fresh: the one with no job on the ledger gets one, the other no second.
  await rpc("file_shelf_requeue", { p_stale_seconds: 0, p_limit: 100 });
  assert.equal((await jobsOf(stale)).filter((job) => job.state === "scheduled").length, 1);
  assert.equal((await jobsOf(live)).length, 1);
});

test("a purged file takes its shelf copy's rows", { skip }, async () => {
  const ws = await workspace();
  const file = await shelved(ws);
  const copy = await shelfOf(file);
  ok(await db.from("files").update({ removed_at: new Date().toISOString() }).eq("id", file), "removed");
  await rpc("file_purged", { p_tenant_id: ws.T, p_id: file });
  assert.equal(ok(await db.from("file_archives").select("id").eq("id", copy.id), "the copy").length, 0);
  assert.equal(ok(await db.from("file_archive_parts").select("id").eq("archive_id", copy.id), "its piece").length, 0);
});

test("the shelf's room is counted one way, and a failed copy tried again cannot pass the limit", { skip }, async () => {
  const ws = await workspace();
  assert.equal(Number(await seconds(ws)), 0, "an empty shelf holds none");
  const first = await shelved(ws);
  assert.equal(Number(await seconds(ws)), 60, "a checked copy holds its video's length");
  const second = await video(ws);
  await begin(ws, second);
  assert.equal(Number(await seconds(ws)), 120, "and so does one on its way there");
  assert.equal(await failedAs(ws, second, "refused"), true);
  assert.equal(Number(await seconds(ws)), 60, "a failed copy holds none");
  const removed = await video(ws, { seconds: 500 });
  await begin(ws, removed);
  ok(await db.from("files").update({ removed_at: new Date().toISOString() }).eq("id", removed), "removed");
  assert.equal(Number(await seconds(ws)), 60, "nor does a removed file's");

  // A third takes the room the failed copy no longer holds: 120 of a limit of 120.
  const third = await video(ws);
  assert.deepEqual(await begin(ws, third, { p_seconds_max: 119 }), { fate: "full" }, "begin reads the same room");
  assert.deepEqual(await begin(ws, third, { p_seconds_max: 120 }), { fate: "begun" });
  assert.equal(await againWithin(ws, second, 120), false, "the failed copy no longer fits, and is not begun");
  assert.equal((await shelfOf(second)).state, "failed");
  assert.equal(Number(await seconds(ws)), 120, "the limit is not passed");
  assert.equal(await againWithin(ws, second, 180), true, "where it fits, it is put back");
  assert.equal(Number(await seconds(ws)), 180);
  // A checked copy found missing is counted already: it is put back whatever the limit.
  assert.equal(await againWithin(ws, first, 1), true);
  assert.equal(Number(await seconds(ws)), 180, "and the room does not move for it");
  // Called with two inputs, as the code live before 00729 does, it is as it was.
  await failedAs(ws, second, "refused");
  assert.equal(await again(ws, second), true);
});

test("a return that waited on a copy goes back on the ledger in the step that checks it", { skip }, async () => {
  const ws = await workspace();
  const waited = await video(ws, { copy_state: "away", copy_why: "unreadable", media_ref: null });
  await begin(ws, waited);
  assert.deepEqual(await returnsOf(waited), []);
  assert.equal(await checked(ws, waited), "checked");
  assert.deepEqual(
    (await returnsOf(waited)).map((job) => [job.state, job.payload.file_id]),
    [["scheduled", waited]],
    "its return, once, by its file's id as text",
  );
  assert.equal(await checked(ws, waited), "checked");
  assert.equal((await returnsOf(waited)).length, 1, "asked again of one already checked, no second job");

  for (const [what, over] of [
    ["a video let go that nobody asked for", { copy_state: "away", media_ref: null }],
    ["one that waits for room, which the pass asks for", { copy_state: "away", copy_why: "room", media_ref: null }],
    ["one that is here", {}],
  ]) {
    const id = await video(ws, over);
    await begin(ws, id);
    assert.equal(await checked(ws, id), "checked");
    assert.deepEqual(await returnsOf(id), [], what);
  }
  const wrong = await video(ws, { copy_state: "away", copy_why: "unreadable", media_ref: null });
  await begin(ws, wrong);
  assert.equal(await checked(ws, wrong, BYTES - 1), "mismatch");
  assert.deepEqual(await returnsOf(wrong), [], "a copy that did not match brings nothing back");
});

test(
  "what the shelf is owed is found for every workspace: never begun, refused, and held back by a full shelf",
  { skip },
  async () => {
    const ws = await shelving();
    const days = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
    const old = await video(ws, { created_at: days(3) });
    const newer = await video(ws, { created_at: days(1) });
    const fresh = await video(ws, { created_at: new Date().toISOString() });
    const upload = await video(ws, { source: "upload" });
    const removed = await video(ws, { removed_at: new Date().toISOString() });
    const has = await video(ws);
    await begin(ws, has);
    const heavy = await video(ws, { bytes: 400_000_000 });
    const off = await workspace();
    const theirs = await video(off);

    let said = await owed();
    const mine = said.begin.filter((row) => row.tenant_id === ws.T);
    assert.deepEqual(idsOf(mine), [newer, old], "made videos with no shelf copy's row, the newest first");
    assert.equal(Number(mine[0].bytes), BYTES, "each with its bytes");
    for (const [what, id] of [
      ["one still being made", fresh],
      ["an upload", upload],
      ["a removed video", removed],
      ["one with a copy already", has],
      ["one too heavy for a pass", heavy],
      ["a video of a workspace whose shelf is off", theirs],
    ])
      assert.ok(!idsOf(said.begin).includes(id), what);
    assert.ok(said.heavy >= 1, "the heavy one is counted, not listed");
    assert.equal(idsOf((await owed({ p_limit: 0 })).begin).length, 0, "none where none is asked");

    // With the room at what the shelf already holds, nothing more fits: each is held back, and counted.
    said = await owed({ p_seconds_max: 60 });
    assert.ok(!idsOf(said.begin).some((id) => [old, newer].includes(id)), "a video that does not fit is not listed");
    assert.ok(said.full.videos >= 3 && said.full.workspaces >= 1, "and is counted with the full shelf's");

    // The copies the shelf refused. No while is asked here (a row's time is the database's own to write).
    const refusedOne = await video(ws);
    await begin(ws, refusedOne);
    await failedAs(ws, refusedOne, "refused");
    const wrong = await video(ws);
    await begin(ws, wrong);
    await failedAs(ws, wrong, "mismatch");
    said = await owed({ p_stale_seconds: 0 });
    assert.ok(idsOf(said.again).includes(refusedOne), "a refused copy is to be tried again");
    assert.ok(!idsOf(said.again).includes(wrong), "one that did not match is never tried");
    assert.ok(!idsOf(said.begin).includes(refusedOne), "and a refused copy is not owed a first copy too");
    assert.ok(!idsOf((await owed()).again).includes(refusedOne), "refused a moment ago, it waits its while");
    said = await owed({ p_stale_seconds: 0, p_seconds_max: 60 });
    assert.ok(!idsOf(said.again).includes(refusedOne), "a refused copy that does not fit waits with the full shelf's");
  },
);

test("a made video whose kept file is gone says so once, and is asked for no more", { skip }, async () => {
  const ws = await shelving();
  const file = await video(ws);
  assert.equal(await unkept(ws, file), true);
  const copy = await shelfOf(file);
  assert.deepEqual(
    [copy.state, copy.why, copy.file_archive_parts],
    ["failed", "not_found", []],
    "no piece: no bytes to name",
  );
  const events = ok(
    await db.from("events").select("kind, data").eq("subject_id", file).eq("kind", "file_shelf.moved"),
    "its events",
  );
  assert.deepEqual(
    events.map((event) => event.data),
    [{ to: "failed", why: "not_found" }],
    "its event beside its write",
  );
  assert.equal(await unkept(ws, file), false, "asked again, nothing is written");
  assert.ok(!idsOf((await owed()).begin).includes(file), "the pass asks for it no more");
  assert.deepEqual(await begin(ws, file), { fate: "kept", state: "failed" });
  assert.equal(await again(ws, file), false, "and it is never put back: no job could finish it");
  assert.equal(await againWithin(ws, file, ROOM), false);
  assert.deepEqual(await jobsOf(file), []);
  assert.equal((await fileNow(file)).copy_state, "here", "the video keeps its place, as one with no checked copy does");

  const has = await shelved(ws);
  assert.equal(await unkept(ws, has), false, "one with a copy already is left alone");
  assert.equal((await shelfOf(has)).state, "checked");
  const upload = await video(ws, { source: "upload" });
  const removed = await video(ws, { removed_at: new Date().toISOString() });
  const elsewhere = await workspace();
  for (const [what, on, id] of [
    ["an upload", ws, upload],
    ["a removed video", ws, removed],
    ["another workspace's", elsewhere, file],
  ])
    assert.equal(await unkept(on, id), false, what);
});

test(
  "the compare's two reads, as the app sends them: the workspaces that keep a shelf, and one workspace's copies",
  { skip },
  async () => {
    // packages/db listShelvingWorkspaces: the switch as JSON, held to JSON's own true, a slice at a time, with the count.
    const on = await shelving();
    const word = await workspace();
    ok(
      await db.from("tenant_config").upsert({ tenant_id: word.T, config: { features: { video_shelf: "true" } } }),
      "a workspace that wrote the word, not JSON's true",
    );
    const off = await workspace();
    const keeping = await db
      .from("tenant_config")
      .select("tenant_id", { count: "exact" })
      .eq("config->features->video_shelf", true)
      .order("tenant_id", { ascending: true })
      .range(0, 999);
    const ids = ok(keeping, "the workspaces that keep a shelf").map((row) => row.tenant_id);
    assert.ok(ids.includes(on.T), "a workspace whose switch is on");
    assert.ok(!ids.includes(word.T), 'the word "true" is off, as the app reads it');
    assert.ok(!ids.includes(off.T), "and so is no switch at all");
    assert.ok(keeping.count >= ids.length && ids.length >= 1, "with how many there are");
    assert.deepEqual(ids, [...ids].sort(), "in the order of their ids, so a slice is a slice");

    // packages/db listShelfCopies: one workspace's shelf copies by their file's id, a page after the last.
    const first = await shelved(on);
    const second = await video(on);
    await begin(on, second);
    const elsewhere = await shelved(await workspace());
    const [low, high] = [first, second].sort();
    const page = (after) => {
      const read = db
        .from("file_archives")
        .select("file_id, state, checked_at")
        .eq("tenant_id", on.T)
        .eq("origin", "shelf")
        .order("file_id", { ascending: true })
        .limit(1);
      return after ? read.gt("file_id", after) : read;
    };
    const one = ok(await page(null), "the first page");
    assert.deepEqual(
      one.map((row) => row.file_id),
      [low],
    );
    const two = ok(await page(low), "the page after it");
    assert.deepEqual(
      two.map((row) => row.file_id),
      [high],
    );
    assert.deepEqual(ok(await page(high), "the page after the last"), []);
    assert.deepEqual(
      [...one, ...two]
        .map((row) => [row.file_id === first ? "checked" : "saving", row.state])
        .every(([want, got]) => want === got),
      true,
      "each with where it stands",
    );
    assert.ok(![...one, ...two].some((row) => row.file_id === elsewhere), "and none of another workspace's");
  },
);

test("a member asks whether a video is on the shelf, reads no key, and calls no door", { skip }, async () => {
  const ws = await workspace();
  const file = await shelved(ws);
  const email = `shelf-viewer-${stamp}@example.com`;
  const password = `pw-${stamp}-shelf-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: ws.T, user_id: made.data.user.id, role: "viewer" }), "the seat");
  const member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await member.auth.signInWithPassword({ email, password }), "the viewer signs in");

  assert.equal(ok(await member.rpc("file_copy_shelved", { p_tenant_id: ws.T, p_file_id: file }), "shelved"), true);
  const road = ok(await member.rpc("video_minutes_by_road", { p_tenant_id: ws.T }), "the minutes by road");
  assert.equal(Number(road.can_step_aside), 60);
  const elsewhere = await workspace();
  const theirs = await shelved(elsewhere);
  assert.equal(
    ok(await member.rpc("file_copy_shelved", { p_tenant_id: elsewhere.T, p_file_id: theirs }), "another's"),
    false,
    "another workspace's shelf says nothing to them",
  );
  for (const column of ["shelf_key", "sha256"])
    refused(await member.from("file_archive_parts").select(column), "42501", `a member reads ${column}`);
  const doors = [
    ["file_shelf_begin", { p_tenant_id: ws.T, p_file_id: file, p_bytes: 5, p_sha256: SHA, p_seconds_max: ROOM }],
    ["file_shelf_checked", { p_tenant_id: ws.T, p_file_id: file, p_bytes: 5, p_sha256: SHA }],
    ["file_shelf_failed", { p_tenant_id: ws.T, p_file_id: file, p_why: "refused" }],
    ["file_shelf_again", { p_tenant_id: ws.T, p_file_id: file }],
    ["file_shelf_again", { p_tenant_id: ws.T, p_file_id: file, p_seconds_max: ROOM }],
    ["file_shelf_requeue", { p_stale_seconds: 0, p_limit: 10 }],
    ["file_shelf_seconds", { p_tenant_id: ws.T }],
    ["file_shelf_owed", { p_seconds_max: ROOM, p_bytes_max: 1, p_stale_seconds: 0, p_limit: 10 }],
    ["file_shelf_unkept", { p_tenant_id: ws.T, p_file_id: file }],
    ["file_copy_kept", { p_tenant_id: ws.T, p_id: file }],
  ];
  for (const [name, args] of doors) refused(await member.rpc(name, args), "42501", `a member calls ${name}`);
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  refused(
    await anon.rpc("file_copy_shelved", { p_tenant_id: ws.T, p_file_id: file }),
    "42501",
    "nobody signed in asks",
  );
  assert.equal((await shelfOf(file)).state, "checked", "and nothing of the copy moved");
});
