/**
 * A watched clip's copy let go and brought back, on a real database (00654, the footage sources plan's P4): a row may
 * hold no id at the video platform only while its copy is away, lost or being brought back, and only a watched
 * folder's clip is ever anything but here; a copy that is away or lost counts toward neither cap; a copy's standing
 * follows its origins by itself (a trigger); only what can come back is let go, the least recently used first, never
 * while a video being made names it; a return is judged and begun in one place and holds its room; the platform's
 * word about a copy coming back makes it here and nothing else, by that attempt's own id; a take holds its room from
 * its judging; the seven-day cleanup reads tombstones alone and never writes the owner's own let-go list; and none of
 * it is a member's to call.
 *
 * In workspaces of its own, so no other test's files or items are counted. The platform's day is one row every suite
 * shares, so it is judged by what a call adds to it.
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
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in as needs it"
        : false;

const stamp = Date.now().toString(36);
const HUGE = 9_000_000_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString();
const WEEK_S = 7 * 24 * 60 * 60;
let db;
let member;
const tenants = [];
const users = [];
let serial = 0;

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

/** A workspace of its own with one watched folder: each case counts only what it made. */
async function workspace(state = "watching") {
  serial += 1;
  const tag = `${stamp}-${serial}`;
  const [tenant] = ok(
    await db
      .from("tenants")
      .insert({ name: `Copies ${tag}`, slug: `copies-${tag}` })
      .select("id"),
    "the workspace",
  );
  tenants.push(tenant.id);
  const [connection] = ok(
    await db
      .from("source_connections")
      .insert({
        tenant_id: tenant.id,
        provider: "google",
        provider_account: `copies-${tag}`,
        email: `sam@copies-${tag}.example`,
      })
      .select("id"),
    "the account",
  );
  const [source] = ok(
    await db
      .from("media_sources")
      .insert({
        tenant_id: tenant.id,
        connection_id: connection.id,
        folder_id: `copies-folder-${tag}`,
        folder_name: "Clips",
        state,
      })
      .select("id"),
    "the folder",
  );
  return { T: tenant.id, source: source.id, connection: connection.id };
}

/** A video in a workspace's Library: a watched folder's clip, playable and looked at, unless a case says otherwise. */
async function video(ws, over = {}) {
  serial += 1;
  const away = ["away", "lost"].includes(over.copy_state);
  const [row] = ok(
    await db
      .from("files")
      .insert({
        tenant_id: ws.T,
        status: "filed",
        source: "drive",
        name: `clip-${stamp}-${serial}`,
        mime: "video/quicktime",
        bytes: 50_000_000,
        fingerprint: `copies-fp-${stamp}-${serial}`,
        kind: "video",
        media_ref: away ? null : `copies-ref-${stamp}-${serial}`,
        media_status: "ready",
        seconds: 60,
        look_status: "done",
        ready_at: daysAgo(3),
        ...over,
      })
      .select("*"),
    "a video",
  );
  return row;
}

/** The item a clip came from, in its workspace's folder. */
async function origin(ws, file, over = {}) {
  const [row] = ok(
    await db
      .from("source_items")
      .insert({
        tenant_id: ws.T,
        source_id: ws.source,
        provider_id: `copies-item-${randomUUID()}`,
        kind: "video",
        name: "clip.mov",
        state: "in",
        file_id: file?.id ?? null,
        modified_at: new Date().toISOString(),
        ...over,
      })
      .select("*"),
    "an item",
  );
  return row;
}

/** A watched clip with its origin. */
async function clip(ws, fileOver = {}, itemOver = {}) {
  const file = await video(ws, fileOver);
  return { file, item: await origin(ws, file, itemOver) };
}

const fileNow = async (id) => ok(await db.from("files").select("*").eq("id", id).maybeSingle(), "the file");
const itemNow = async (id) => ok(await db.from("source_items").select("*").eq("id", id).maybeSingle(), "the item");
const seconds = async (ws) => Number(ok(await db.rpc("video_seconds_toward_cap", { p_tenant_id: ws.T }), "seconds"));
const letGo = (ws, over = {}) =>
  db.rpc("file_copies_let_go", {
    p_tenant_id: ws.T,
    p_seconds: null,
    p_unused_before: null,
    p_rested_before: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    p_limit: 100,
    ...over,
  });
const begin = (ws, fileId, over = {}) =>
  db.rpc("file_copy_return_begin", {
    p_tenant_id: ws.T,
    p_id: fileId,
    p_units: 205,
    p_platform_bytes_max: HUGE,
    p_workspace_returns_max: 1_000,
    p_units_max: HUGE,
    p_stale_seconds: 600,
    ...over,
  });
const digestsOf = async (ws, fileId) =>
  ok(
    await db.from("jobs").select("id").eq("tenant_id", ws.T).eq("kind", "video_digest").eq("payload->>file_id", fileId),
    "the digest's jobs",
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
});

after(async () => {
  if (skip) return;
  await db.from("jobs").delete().in("tenant_id", tenants);
  await db.from("events").delete().in("tenant_id", tenants);
  await db.from("pieces").delete().in("tenant_id", tenants);
  await db.from("source_items").delete().in("tenant_id", tenants);
  await db.from("media_sources").delete().in("tenant_id", tenants);
  await db.from("source_connections").delete().in("tenant_id", tenants);
  await db.from("files").delete().in("tenant_id", tenants);
  await db.from("files_let_go").delete().in("tenant_id", tenants);
  await db.from("memberships").delete().in("tenant_id", tenants);
  await db.from("tenants").delete().in("id", tenants);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test(
  "a video holds no id only while its copy is away, lost or coming back, and only a watched clip ever is",
  { skip },
  async () => {
    const ws = await workspace();
    const base = {
      tenant_id: ws.T,
      status: "filed",
      mime: "video/mp4",
      bytes: 1,
      kind: "video",
      media_status: "ready",
      seconds: 5,
    };
    const tryRow = (over) =>
      db
        .from("files")
        .insert({ ...base, name: `shape-${randomUUID().slice(0, 8)}`, fingerprint: `shape-${randomUUID()}`, ...over });
    // A video that is here names its copy.
    assert.ok((await tryRow({ source: "drive", media_ref: null })).error, "here, with no id: refused");
    assert.ok((await tryRow({ source: "drive", media_ref: null, copy_state: "going" })).error, "going holds its id");
    // Away, lost, or begun and not yet asked of the platform: none.
    for (const copy_state of ["away", "lost", "returning"])
      ok(await tryRow({ source: "drive", media_ref: null, copy_state }), `${copy_state}, with no id`);
    assert.ok(
      (await tryRow({ source: "drive", media_ref: `shape-${randomUUID()}`, copy_state: "away" })).error,
      "away never holds an id",
    );
    // An upload, a video made here and a found video are always here.
    for (const source of ["upload", "made", "instagram", "website"])
      assert.ok((await tryRow({ source, media_ref: null, copy_state: "away" })).error, `${source} is never away`);
    // Why is said only of a copy that is away or lost, and only in the closed set's words.
    assert.ok((await tryRow({ source: "drive", media_ref: `shape-${randomUUID()}`, copy_why: "room" })).error);
    assert.ok((await tryRow({ source: "drive", media_ref: null, copy_state: "lost", copy_why: "because" })).error);
    ok(await tryRow({ source: "drive", media_ref: null, copy_state: "lost", copy_why: "gone" }), "lost, with why");
  },
);

test(
  "a copy that is away or lost counts toward neither cap; one going or coming back still counts its minutes",
  { skip },
  async () => {
    const ws = await workspace();
    await video(ws, { source: "upload", seconds: 100 });
    await video(ws, { seconds: 200 });
    await video(ws, { seconds: 300, copy_state: "going" });
    await video(ws, { seconds: 400, copy_state: "returning", media_ref: null });
    await video(ws, { seconds: 1000, copy_state: "away" });
    await video(ws, { seconds: 2000, copy_state: "lost", copy_why: "gone" });
    assert.equal(await seconds(ws), 1000, "an upload, and the copies here, going and returning");
    assert.equal(Number(ok(await db.rpc("files_toward_cap", { p_tenant_id: ws.T }), "files")), 4);
    assert.equal(Number(ok(await db.rpc("video_seconds_free", { p_tenant_id: ws.T }), "free")), 2600);
    assert.equal(ok(await db.rpc("file_video_room", { p_tenant_id: ws.T, p_seconds: 600 }), "fits"), "room");
    assert.equal(ok(await db.rpc("file_video_room", { p_tenant_id: ws.T, p_seconds: 601 }), "long"), "long");
    // With 2,100 seconds more that may not go, what is free is 500: a clip of 501 does not fit.
    await video(ws, { source: "upload", seconds: 2100 });
    assert.equal(ok(await db.rpc("file_video_room", { p_tenant_id: ws.T, p_seconds: 500 }), "just fits"), "room");
    assert.equal(ok(await db.rpc("file_video_room", { p_tenant_id: ws.T, p_seconds: 501 }), "does not"), "minutes");
  },
);

test(
  "a copy's standing follows its origins by itself: lost with why as an origin leaves, away again as it returns",
  { skip },
  async () => {
    const ws = await workspace();
    const away = await clip(ws, { copy_state: "away" });
    const here = await clip(ws);
    // Seen in the bin: the sync marks the item, and the file says its copy is lost, with why.
    ok(
      await db.from("source_items").update({ state: "gone", gone_at: new Date().toISOString() }).eq("id", away.item.id),
      "gone",
    );
    assert.deepEqual(
      [(await fileNow(away.file.id)).copy_state, (await fileNow(away.file.id)).copy_why],
      ["lost", "gone"],
    );
    ok(
      await db.from("source_items").update({ state: "gone", gone_at: new Date().toISOString() }).eq("id", here.item.id),
      "gone",
    );
    assert.equal((await fileNow(here.file.id)).copy_state, "here", "a copy that is here says where it stands itself");
    // Moved out instead: the word follows.
    ok(await db.from("source_items").update({ state: "outside" }).eq("id", away.item.id), "outside");
    assert.equal((await fileNow(away.file.id)).copy_why, "outside");
    ok(
      await db.from("source_items").update({ state: "no_access", why: "not_found" }).eq("id", away.item.id),
      "vanished",
    );
    assert.equal((await fileNow(away.file.id)).copy_why, "not_found");
    // Back in its folder: away again, and its origin is the one a return would read.
    ok(await db.from("source_items").update({ state: "in", why: null, gone_at: null }).eq("id", away.item.id), "back");
    assert.deepEqual(
      [(await fileNow(away.file.id)).copy_state, (await fileNow(away.file.id)).copy_why],
      ["away", null],
    );
    assert.equal(
      ok(await db.rpc("file_copy_origin", { p_tenant_id: ws.T, p_file_id: away.file.id }), "origin"),
      away.item.id,
    );
    assert.equal(
      ok(await db.rpc("file_copy_standing", { p_tenant_id: ws.T, p_file_id: away.file.id }), "standing"),
      null,
    );
    // A wait's own reason on an away copy is not written over by an origin that only moved within what can give it back.
    ok(await db.from("files").update({ copy_why: "room" }).eq("id", away.file.id), "waits");
    ok(await db.from("source_items").update({ state: "waiting" }).eq("id", away.item.id), "waiting");
    assert.deepEqual(
      [(await fileNow(away.file.id)).copy_state, (await fileNow(away.file.id)).copy_why],
      ["away", "room"],
    );
  },
);

test(
  "disconnecting an account leaves its files in the Library: a copy that was away says no origin holds it",
  { skip },
  async () => {
    const ws = await workspace();
    const away = await clip(ws, { copy_state: "away" });
    const here = await clip(ws);
    ok(await db.from("source_connections").delete().eq("id", ws.connection), "the account disconnected");
    assert.equal(
      ok(await db.from("source_items").select("id").eq("tenant_id", ws.T), "items").length,
      0,
      "its items went by cascade",
    );
    const lost = await fileNow(away.file.id);
    assert.deepEqual([lost.copy_state, lost.copy_why, lost.removed_at], ["lost", "no_origin", null]);
    assert.deepEqual(
      [(await fileNow(here.file.id)).copy_state, (await fileNow(here.file.id)).removed_at],
      ["here", null],
    );
    // And the cleanup, which reads tombstones alone, finds nothing of theirs to remove.
    ok(await db.rpc("source_items_grace_end", { p_grace_seconds: WEEK_S, p_limit: 1_000 }), "the cleanup");
    assert.equal((await fileNow(away.file.id)).removed_at, null);
    assert.equal((await fileNow(here.file.id)).removed_at, null);
  },
);

test(
  "by room the least recently used watched copy goes first, as many as free what is short, and never an upload, a made or a found video",
  { skip },
  async () => {
    const ws = await workspace();
    // 3,000 seconds no one may let go, and three watched copies of 200 each: full.
    await video(ws, { source: "upload", seconds: 1000, copy_used_at: daysAgo(90) });
    await video(ws, { source: "made", seconds: 1000, copy_used_at: daysAgo(90) });
    await video(ws, { source: "instagram", status: "inbox", seconds: 400, copy_used_at: daysAgo(90) });
    await video(ws, { source: "website", status: "set_aside", seconds: 600, copy_used_at: daysAgo(90) });
    const oldest = await clip(ws, { seconds: 200, copy_used_at: daysAgo(5) });
    const middle = await clip(ws, { seconds: 200, copy_used_at: daysAgo(4) });
    const newest = await clip(ws, { seconds: 200, copy_used_at: daysAgo(3) });
    assert.equal(await seconds(ws), 3600);
    // Room for 150 seconds: one copy frees it, the one used longest ago.
    const going = ok(await letGo(ws, { p_seconds: 150 }), "by room");
    assert.deepEqual(
      going.map((c) => c.id),
      [oldest.file.id],
    );
    assert.equal(going[0].media_ref, oldest.file.media_ref, "with the id to delete at the platform");
    assert.equal((await fileNow(oldest.file.id)).copy_state, "going");
    assert.equal(await seconds(ws), 3600, "still counted until its delete has landed");
    // Deleted there: away, no id, and the minutes are free.
    assert.equal(ok(await db.rpc("file_copy_gone", { p_tenant_id: ws.T, p_id: oldest.file.id }), "gone"), true);
    const away = await fileNow(oldest.file.id);
    assert.deepEqual(
      [away.copy_state, away.media_ref, away.media_status, away.removed_at],
      ["away", null, "ready", null],
    );
    assert.equal(await seconds(ws), 3400);
    assert.equal(ok(await db.rpc("file_copy_gone", { p_tenant_id: ws.T, p_id: oldest.file.id }), "again"), false);
    // Now there is room for 150: nothing more is let go for it.
    assert.deepEqual(ok(await letGo(ws, { p_seconds: 150 }), "fits already"), []);
    // 700 would need more than the two copies left can free: none is let go in vain.
    assert.deepEqual(ok(await letGo(ws, { p_seconds: 700 }), "cannot be freed"), []);
    assert.equal((await fileNow(middle.file.id)).copy_state, "here");
    // 500 needs both, and takes both, in order.
    const both = ok(await letGo(ws, { p_seconds: 500 }), "both");
    assert.deepEqual(both.map((c) => c.id).sort(), [middle.file.id, newest.file.id].sort());
    const others = ok(
      await db.from("files").select("source, copy_state").eq("tenant_id", ws.T).neq("source", "drive"),
      "the rest",
    );
    assert.ok(
      others.length === 4 && others.every((row) => row.copy_state === "here"),
      "no upload, made or found video moved",
    );
  },
);

test(
  "a copy is let go only where it can come back, was looked at, has rested, and no video being made names it",
  { skip },
  async () => {
    const ws = await workspace();
    const paused = await workspace("paused");
    const looking = await clip(ws, { look_status: "waiting", copy_used_at: daysAgo(9) });
    const binned = await clip(ws, { copy_used_at: daysAgo(9) }, { state: "gone", gone_at: daysAgo(1) });
    const preparing = await clip(ws, { media_status: "processing", copy_used_at: daysAgo(9) });
    const justUsed = await clip(ws, { copy_used_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() });
    const named = await clip(ws, { copy_used_at: daysAgo(9) });
    const free = await clip(ws, { copy_used_at: daysAgo(2) });
    const notRead = await clip(paused, { copy_used_at: daysAgo(30) });
    ok(
      await db.from("pieces").insert({
        tenant_id: ws.T,
        shape: "blocks",
        plan: { shape: "blocks", blocks: [{ is: "clip", file_id: named.file.id }] },
        look: {},
        edition: 1,
        card_key: `copies-${stamp}-${randomUUID()}`,
      }),
      "a video being made",
    );
    const going = ok(await letGo(ws, { p_unused_before: new Date().toISOString() }), "by age, everything unused");
    assert.deepEqual(
      going.map((c) => c.id),
      [free.file.id],
      "only the one that may go",
    );
    for (const kept of [looking, binned, preparing, justUsed, named])
      assert.equal((await fileNow(kept.file.id)).copy_state, "here");
    assert.deepEqual(ok(await letGo(paused, { p_unused_before: new Date().toISOString() }), "a folder not read"), []);
    assert.equal((await fileNow(notRead.file.id)).copy_state, "here");
    // The video made, its clip may go like any other.
    ok(
      await db.from("pieces").update({ status: "made", made_at: new Date().toISOString() }).eq("tenant_id", ws.T),
      "made",
    );
    const then = ok(await letGo(ws, { p_unused_before: new Date().toISOString() }), "after");
    assert.deepEqual(
      then.map((c) => c.id),
      [named.file.id],
    );
    // By age only what was unused since the time given.
    const fresh = await workspace();
    const old = await clip(fresh, { copy_used_at: daysAgo(15) });
    await clip(fresh, { copy_used_at: daysAgo(13) });
    const aged = ok(await letGo(fresh, { p_unused_before: daysAgo(14) }), "two weeks");
    assert.deepEqual(
      aged.map((c) => c.id),
      [old.file.id],
    );
  },
);

test("freed room releases the items that waited for it", { skip }, async () => {
  const ws = await workspace();
  const gone = await clip(ws, { copy_state: "going" });
  const waiting = await origin(ws, null, {
    state: "waiting",
    why: "room",
    take_after: new Date(Date.now() + DAY_MS).toISOString(),
  });
  const budget = await origin(ws, null, {
    state: "waiting",
    why: "budget",
    take_after: new Date(Date.now() + DAY_MS).toISOString(),
  });
  assert.equal(ok(await db.rpc("file_copy_gone", { p_tenant_id: ws.T, p_id: gone.file.id }), "gone"), true);
  assert.equal((await itemNow(waiting.id)).take_after, null, "what waited for room is due");
  assert.notEqual((await itemNow(budget.id)).take_after, null, "what waits for tomorrow still does");
});

test(
  "a return is begun once and holds its room; the platform's word makes it here and nothing else",
  { skip },
  async () => {
    const ws = await workspace();
    const { file } = await clip(ws, { copy_state: "away", seconds: 60 });
    assert.equal(await seconds(ws), 0);
    assert.deepEqual(ok(await begin(ws, file.id), "begun"), { fate: "go" });
    const begun = await fileNow(file.id);
    assert.deepEqual([begun.copy_state, begun.media_ref], ["returning", null], "returning, the platform not yet asked");
    assert.notEqual(begun.copy_returned_at, null);
    assert.equal(await seconds(ws), 60, "its length is held in the minutes from now");
    // A second asker joins it.
    assert.deepEqual(ok(await begin(ws, file.id), "again"), { fate: "returning" });
    // The id the platform gave is kept once.
    const first = `copies-return-${randomUUID()}`;
    assert.equal(
      ok(await db.rpc("file_copy_returning", { p_tenant_id: ws.T, p_id: file.id, p_media_ref: first }), "kept"),
      true,
    );
    assert.equal(
      ok(
        await db.rpc("file_copy_returning", { p_tenant_id: ws.T, p_id: file.id, p_media_ref: `other-${randomUUID()}` }),
        "not twice",
      ),
      false,
    );
    // A word about a copy the row does not hold settles nothing.
    const stray = ok(
      await db.rpc("file_media_ready", {
        p_media_ref: `stray-${randomUUID()}`,
        p_seconds: 60,
        p_width: 720,
        p_height: 1280,
      }),
      "a stray word",
    );
    assert.equal(stray.fate, "unknown");
    assert.equal((await fileNow(file.id)).copy_state, "returning");
    // Its own word: here again. No look reset, no digest.
    const heard = ok(
      await db.rpc("file_media_ready", { p_media_ref: first, p_seconds: 61, p_width: 720, p_height: 1280 }),
      "its word",
    );
    assert.deepEqual([heard.fate, heard.file_id], ["returned", file.id]);
    const back = await fileNow(file.id);
    assert.deepEqual(
      [back.copy_state, back.media_ref, back.media_status, back.look_status],
      ["here", first, "ready", "done"],
    );
    assert.equal(Number(back.seconds), 60, "its length is not rewritten");
    assert.notEqual(back.copy_used_at, null);
    assert.deepEqual(await digestsOf(ws, file.id), [], "no digest is put on the ledger");
    // Said again: nothing changes.
    const again = ok(
      await db.rpc("file_media_ready", { p_media_ref: first, p_seconds: 61, p_width: 720, p_height: 1280 }),
      "again",
    );
    assert.equal(again.fate, "repeated");
    assert.deepEqual(await digestsOf(ws, file.id), []);
    assert.deepEqual(ok(await begin(ws, file.id), "here now"), { fate: "here" });
  },
);

test(
  "a copy that could not be prepared again leaves the file away, with why, its media_status untouched",
  { skip },
  async () => {
    const ws = await workspace();
    const { file } = await clip(ws, { copy_state: "away" });
    ok(await begin(ws, file.id), "begun");
    const ref = `copies-return-${randomUUID()}`;
    ok(await db.rpc("file_copy_returning", { p_tenant_id: ws.T, p_id: file.id, p_media_ref: ref }), "kept");
    const failed = ok(
      await db.rpc("file_media_failed", { p_media_ref: ref, p_error: "ERR_MALFORMED_VIDEO" }),
      "its word",
    );
    assert.deepEqual([failed.fate, failed.file_id], ["unreturned", file.id]);
    const row = await fileNow(file.id);
    assert.deepEqual(
      [row.copy_state, row.copy_why, row.media_ref, row.media_status, row.look_status],
      ["away", "failed", null, "ready", "done"],
    );
    // An attempt is undone only by its own copy's id: a later return is never ended by an earlier one's failure.
    ok(await begin(ws, file.id), "begun again");
    assert.equal(
      ok(
        await db.rpc("file_copy_return_failed", {
          p_tenant_id: ws.T,
          p_id: file.id,
          p_why: "stopped",
          p_media_ref: ref,
        }),
        "the old attempt",
      ),
      false,
    );
    assert.equal((await fileNow(file.id)).copy_state, "returning");
    assert.equal(
      ok(
        await db.rpc("file_copy_return_failed", {
          p_tenant_id: ws.T,
          p_id: file.id,
          p_why: "stopped",
          p_media_ref: null,
        }),
        "this one",
      ),
      true,
    );
    assert.deepEqual([(await fileNow(file.id)).copy_state, (await fileNow(file.id)).copy_why], ["away", "stopped"]);
  },
);

test(
  "a return says lost, no room or a day's budget, each on its row, and one whose job died is begun again",
  { skip },
  async () => {
    const ws = await workspace();
    // Lost: no origin can give it back.
    const lost = await clip(ws, { copy_state: "away" }, { state: "outside", gone_at: daysAgo(1) });
    assert.deepEqual(ok(await begin(ws, lost.file.id), "lost"), { fate: "lost", why: "outside" });
    assert.deepEqual(
      [(await fileNow(lost.file.id)).copy_state, (await fileNow(lost.file.id)).copy_why],
      ["lost", "outside"],
    );
    // A day's budget: the workspace's returns, a day as Google counts one.
    const waits = await clip(ws, { copy_state: "away" });
    const bound = ok(await begin(ws, waits.file.id, { p_workspace_returns_max: 0 }), "the day is spent");
    assert.deepEqual([bound.fate, bound.binds], ["wait", "workspace_returns"]);
    assert.ok(Date.parse(bound.until) > Date.now());
    assert.deepEqual(
      [(await fileNow(waits.file.id)).copy_state, (await fileNow(waits.file.id)).copy_why],
      ["away", "budget"],
    );
    assert.equal(
      ok(await begin(ws, waits.file.id, { p_platform_bytes_max: 0 }), "the platform's bytes").binds,
      "platform_bytes",
    );
    assert.equal(ok(await begin(ws, waits.file.id, { p_units_max: 0 }), "the units").binds, "units");
    // No room: the videos are full of what may not go.
    await video(ws, { source: "upload", seconds: 3590 });
    const noRoom = ok(await begin(ws, waits.file.id), "no room");
    assert.deepEqual([noRoom.fate, Number(noRoom.seconds)], ["room", 60]);
    assert.deepEqual(
      [(await fileNow(waits.file.id)).copy_state, (await fileNow(waits.file.id)).copy_why],
      ["away", "room"],
    );
    // A return begun whose job died before the platform was asked is begun again once it is stale.
    const other = await workspace();
    const died = await clip(other, { copy_state: "away" });
    ok(await begin(other, died.file.id), "begun");
    assert.deepEqual(ok(await begin(other, died.file.id), "fresh"), { fate: "returning" });
    assert.deepEqual(ok(await begin(other, died.file.id, { p_stale_seconds: 0 }), "stale"), { fate: "go" });
    assert.equal((await fileNow(died.file.id)).copy_state, "returning");
  },
);

test("a take holds its room from its judging, so two at the edge are not both judged to fit", { skip }, async () => {
  const ws = await workspace();
  await video(ws, { source: "upload", seconds: 3500 });
  const first = await origin(ws, null, { state: "taking" });
  const second = await origin(ws, null, { state: "taking" });
  const judged = (itemId, over = {}) =>
    db.rpc("file_video_sourced", {
      p_tenant_id: ws.T,
      p_id: randomUUID(),
      p_item_id: itemId,
      p_media_ref: null,
      p_name: "clip",
      p_mime: "video/quicktime",
      p_bytes: 1_000,
      p_seconds: 90,
      p_fingerprint: `copies-hold-${randomUUID()}`,
      ...over,
    });
  assert.equal(ok(await judged(first.id), "the first").fate, "room");
  assert.equal(Number((await itemNow(first.id)).held_seconds), 90);
  assert.equal(await seconds(ws), 3590, "what a take holds counts toward the minutes");
  assert.equal(ok(await judged(second.id), "the second").fate, "minutes");
  assert.equal((await itemNow(second.id)).held_seconds, null);
  // Judged again, its own hold is not counted against it.
  assert.equal(ok(await judged(first.id), "the first again").fate, "room");
  // Its row written: the file counts, and the hold is let go of.
  const id = randomUUID();
  const kept = ok(await judged(first.id, { p_id: id, p_media_ref: `copies-take-${randomUUID()}` }), "written");
  assert.equal(kept.fate, "kept");
  assert.equal((await itemNow(first.id)).held_seconds, null);
  assert.equal(await seconds(ws), 3590);
  // A take that leaves its job holds nothing.
  const third = await origin(ws, null, { state: "taking", held_seconds: 500 });
  assert.equal(await seconds(ws), 4090);
  ok(await db.from("source_items").update({ state: "waiting" }).eq("id", third.id), "put back");
  assert.equal(await seconds(ws), 3590);
});

test(
  "the seven-day cleanup removes an unused file seen in the bin or moved out, and nothing else",
  { skip },
  async () => {
    const ws = await workspace();
    const binned = await clip(ws, {}, { state: "gone", gone_at: daysAgo(8) });
    const moved = await clip(ws, { copy_state: "away" }, { state: "outside", gone_at: daysAgo(8) });
    const recent = await clip(ws, {}, { state: "gone", gone_at: daysAgo(6) });
    const vanished = await clip(ws, {}, { state: "no_access", why: "not_found", gone_at: daysAgo(60) });
    const orphan = await video(ws, { created_at: daysAgo(60) });
    // The same bytes sit in a second place in the folder: another origin still holds the file.
    const twice = await clip(ws, {}, { state: "gone", gone_at: daysAgo(8) });
    const second = await origin(ws, twice.file);
    // A video made here used this one.
    const used = await clip(ws, {}, { state: "gone", gone_at: daysAgo(8) });
    ok(
      await db.from("pieces").insert({
        tenant_id: ws.T,
        shape: "blocks",
        plan: { shape: "blocks", blocks: [{ is: "clip", file_id: used.file.id }] },
        look: {},
        edition: 1,
        card_key: `copies-${stamp}-${randomUUID()}`,
        status: "made",
        made_at: new Date().toISOString(),
      }),
      "a made video",
    );
    const done = ok(
      await db.rpc("source_items_grace_end", { p_grace_seconds: WEEK_S, p_limit: 10_000 }),
      "the cleanup",
    );
    assert.ok(done.removed >= 2 && done.kept >= 2 && done.cleared >= 4);
    for (const gone of [binned, moved]) {
      assert.notEqual((await fileNow(gone.file.id)).removed_at, null, "removed");
      assert.equal(await itemNow(gone.item.id), null, "and its tombstone row is deleted");
    }
    const purges = ok(
      await db.from("jobs").select("payload").eq("tenant_id", ws.T).eq("kind", "file_purge"),
      "the purges",
    );
    assert.deepEqual(purges.map((job) => job.payload.file_id).sort(), [binned.file.id, moved.file.id].sort());
    assert.deepEqual(
      ok(await db.from("files_let_go").select("fingerprint").eq("tenant_id", ws.T), "let go"),
      [],
      "nothing is written to the owner's own let-go list",
    );
    // Inside its grace, only vanished, or with no origin at all: untouched.
    assert.equal((await fileNow(recent.file.id)).removed_at, null);
    assert.equal((await itemNow(recent.item.id)).state, "gone");
    assert.equal((await fileNow(vanished.file.id)).removed_at, null);
    assert.equal((await itemNow(vanished.item.id)).state, "no_access");
    assert.equal((await fileNow(orphan.id)).removed_at, null);
    // Held by another origin, or used: the file stays, and only the tombstone goes.
    assert.equal((await fileNow(twice.file.id)).removed_at, null);
    assert.equal(await itemNow(twice.item.id), null);
    assert.equal((await itemNow(second.id)).state, "in");
    assert.equal((await fileNow(used.file.id)).removed_at, null);
  },
);

test(
  "none of it is a member's to call; a member reads where its own copies stand, and no one signed out reads any",
  { skip },
  async () => {
    const ws = await workspace();
    const { file } = await clip(ws, { copy_state: "away", copy_why: "room" });
    const email = `copies-owner-${stamp}@example.com`;
    const password = `pw-${stamp}-copies-Aa1!`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(await db.from("memberships").insert({ tenant_id: ws.T, user_id: made.data.user.id, role: "owner" }), "the seat");
    member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await member.auth.signInWithPassword({ email, password }), "the owner signs in");
    for (const [name, args] of [
      ["file_copy_settle", { p_tenant_id: ws.T, p_file_id: file.id }],
      ["file_copy_origin", { p_tenant_id: ws.T, p_file_id: file.id }],
      ["file_copy_standing", { p_tenant_id: ws.T, p_file_id: file.id }],
      [
        "file_copies_let_go",
        {
          p_tenant_id: ws.T,
          p_seconds: 1,
          p_unused_before: null,
          p_rested_before: new Date().toISOString(),
          p_limit: 1,
        },
      ],
      ["file_copy_gone", { p_tenant_id: ws.T, p_id: file.id }],
      [
        "file_copy_return_begin",
        {
          p_tenant_id: ws.T,
          p_id: file.id,
          p_units: 1,
          p_platform_bytes_max: HUGE,
          p_workspace_returns_max: 9,
          p_units_max: HUGE,
          p_stale_seconds: 600,
        },
      ],
      ["file_copy_returning", { p_tenant_id: ws.T, p_id: file.id, p_media_ref: "x" }],
      ["file_copy_return_failed", { p_tenant_id: ws.T, p_id: file.id, p_why: "stopped", p_media_ref: null }],
      ["source_items_grace_end", { p_grace_seconds: 0, p_limit: 1 }],
      ["video_seconds_free", { p_tenant_id: ws.T }],
      ["video_seconds_held", { p_tenant_id: ws.T }],
      ["file_road_is_watched", { p_source: "drive" }],
    ]) {
      const refused = await member.rpc(name, args);
      assert.ok(refused.error, `${name}: a member's session is refused`);
    }
    assert.equal((await fileNow(file.id)).copy_state, "away", "and nothing a member called moved it");
    const mine = ok(await member.from("files").select("id, copy_state, copy_why").eq("id", file.id), "own files");
    assert.deepEqual(mine, [{ id: file.id, copy_state: "away", copy_why: "room" }]);
    const hidden = await member.from("files").select("copy_used_at").eq("id", file.id);
    assert.ok(hidden.error, "when a copy was used is not a member's to read");
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const stranger = await anon.from("files").select("id, copy_state").eq("id", file.id);
    assert.ok(stranger.error || stranger.data.length === 0);
  },
);

test(
  "an upload that meets a watched folder's file marks it its owner's, and it is never let go or cleaned up",
  { skip },
  async () => {
    const ws = await workspace();
    const watched = await clip(ws, { copy_used_at: daysAgo(30) });
    // The owner uploads the same clip from the phone: one file, now theirs.
    const begun = ok(
      await db.rpc("file_video_begin", {
        p_tenant_id: ws.T,
        p_id: randomUUID(),
        p_media_ref: `copies-upload-${randomUUID()}`,
        p_name: "clip",
        p_mime: "video/quicktime",
        p_bytes: 50_000_000,
        p_fingerprint: watched.file.fingerprint,
        p_seconds: 60,
      }),
      "the upload",
    );
    assert.deepEqual([begun.fate, begun.file_id], ["here", watched.file.id]);
    const marked = await fileNow(watched.file.id);
    assert.deepEqual([marked.owner_uploaded, marked.source, marked.copy_state], [true, "drive", "here"]);
    assert.deepEqual(ok(await letGo(ws, { p_unused_before: new Date().toISOString() }), "by age"), []);
    assert.equal(ok(await db.rpc("file_copies_free_at", { p_tenant_id: ws.T, p_rest_seconds: 3600 }), "free at"), null);
    // Its folder's item binned eight days ago: its own upload holds it, and the cleanup keeps it.
    ok(
      await db
        .from("source_items")
        .update({ state: "gone", gone_at: daysAgo(8) })
        .eq("id", watched.item.id),
      "binned",
    );
    ok(await db.rpc("source_items_grace_end", { p_grace_seconds: WEEK_S, p_limit: 10_000 }), "the cleanup");
    assert.equal((await fileNow(watched.file.id)).removed_at, null);
    // A photo the same way, through the photo's door.
    const [photo] = ok(
      await db
        .from("files")
        .insert({
          tenant_id: ws.T,
          status: "filed",
          source: "drive",
          name: `photo-${stamp}`,
          mime: "image/jpeg",
          bytes: 1_000,
          fingerprint: `copies-photo-${randomUUID()}`,
          kind: "image",
        })
        .select("*"),
      "a watched photo",
    );
    const found = ok(
      await db.rpc("file_found", {
        p_tenant_id: ws.T,
        p_id: randomUUID(),
        p_status: "filed",
        p_source: "upload",
        p_source_ref: null,
        p_name: "photo",
        p_mime: "image/jpeg",
        p_bytes: 1_000,
        p_fingerprint: photo.fingerprint,
        p_width: 100,
        p_height: 100,
        p_shows: null,
        p_edition: 1,
      }),
      "the photo's upload",
    );
    assert.deepEqual([found.fate, found.file_id], ["here", photo.id]);
    assert.equal((await fileNow(photo.id)).owner_uploaded, true);
    // A found road meeting the same file marks nothing: only the owner's own upload does.
    const other = await clip(ws);
    ok(
      await db.rpc("file_found", {
        p_tenant_id: ws.T,
        p_id: randomUUID(),
        p_status: "inbox",
        p_source: "website",
        p_source_ref: "https://example.com/a.jpg",
        p_name: "x",
        p_mime: "image/jpeg",
        p_bytes: 1,
        p_fingerprint: other.file.fingerprint,
        p_width: 1,
        p_height: 1,
        p_shows: null,
        p_edition: 1,
      }),
      "a found twin",
    );
    assert.equal((await fileNow(other.file.id)).owner_uploaded, false);
  },
);

test(
  "a full workspace's next try is when a resting copy's rest ends; none at all where nothing may ever go",
  { skip },
  async () => {
    const ws = await workspace();
    const usedAt = new Date(Date.now() - 20 * 60 * 1000);
    await clip(ws, { copy_used_at: usedAt.toISOString() });
    await clip(ws, { copy_used_at: daysAgo(3) });
    const at = ok(await db.rpc("file_copies_free_at", { p_tenant_id: ws.T, p_rest_seconds: 3600 }), "free at");
    assert.ok(Math.abs(Date.parse(at) - (usedAt.getTime() + 3_600_000)) < 2_000, "the resting copy's rest ends then");
    const none = await workspace();
    await video(none, { source: "upload", seconds: 3600 });
    assert.equal(ok(await db.rpc("file_copies_free_at", { p_tenant_id: none.T, p_rest_seconds: 3600 }), "none"), null);
  },
);

test(
  "a superseded file goes a week on unless used or held; an item that holds it again clears its mark",
  { skip },
  async () => {
    const ws = await workspace();
    const unused = await clip(ws, { superseded_at: daysAgo(8) }, { state: "listed", file_id: null });
    const held = await clip(ws, { superseded_at: daysAgo(8) }, { state: "listed", file_id: null });
    // The item takes hold of it again (its new bytes were the same file after all): the mark goes by itself.
    ok(
      await db.from("source_items").update({ file_id: held.file.id, state: "in" }).eq("id", held.item.id),
      "held again",
    );
    assert.equal((await fileNow(held.file.id)).superseded_at, null);
    const posted = await clip(ws, { superseded_at: daysAgo(8) }, { state: "listed", file_id: null });
    ok(
      await db.from("posts").insert({
        tenant_id: ws.T,
        file_id: posted.file.id,
        place: "hand",
        kind: "reel",
        status: "published",
      }),
      "a post of it",
    );
    const done = ok(
      await db.rpc("source_items_grace_end", { p_grace_seconds: WEEK_S, p_limit: 10_000 }),
      "the cleanup",
    );
    assert.ok(done.removed >= 1 && done.kept >= 1);
    assert.notEqual((await fileNow(unused.file.id)).removed_at, null);
    const event = ok(
      await db.from("events").select("data").eq("tenant_id", ws.T).eq("kind", "file.removed"),
      "the removal's event",
    );
    assert.ok(event.some((e) => e.data.file_id === unused.file.id && e.data.why === "source_changed"));
    const kept = await fileNow(posted.file.id);
    assert.deepEqual([kept.removed_at, kept.superseded_at], [null, null], "kept, and judged once");
    assert.equal((await fileNow(held.file.id)).removed_at, null);
  },
);
