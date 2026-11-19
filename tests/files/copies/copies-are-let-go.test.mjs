/**
 * Letting a watched clip's copy go (apps/edge/lib/files/copy/let-go.ts over 00654 file_copies_let_go; the footage
 * sources plan, "Availability", D6 and D23; acceptance tests 12, 13 and 28; the review's finding 9). With the videos
 * full the least recently used watched copy is let go and the next clip comes in. An upload, a video made here and a
 * found video (waiting, kept or set aside) are never let go. Nothing goes while a video being made names it. A copy
 * unused for two weeks goes with room to spare. And a take holds its room from its judging, so two at the edge of the
 * sixty minutes are not both fetched.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import {
  LET_GO,
  NOW,
  T,
  bytesOf,
  daysAgo,
  driveOf,
  itemRow,
  letUnusedCopiesGo,
  makeRoom,
  platformSaw,
  realFetch,
  runTakes,
  setPg,
  theSync,
  theWeb,
  videoRow,
  watchedClip,
  world,
} from "./_world.mjs";

const { recordVideoSourced } = await import(at("packages/db/src/repositories/files/source-takes.ts"));

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const MIB = 1_048_576;
const SOON = () => Date.now() + 30_000;

/** A new clip waiting in the watched folder, and what Drive holds of it. */
function newClip(seconds, seed = 9) {
  const item = itemRow({ provider_id: `drive-new-${seed}`, name: `new-${seed}.MOV` });
  const held = {
    mime: "video/quicktime",
    name: item.name,
    seconds,
    size: 40_000_000 + seed,
    bytes: bytesOf(MIB, seed),
  };
  return { item, drive: { [item.provider_id]: held } };
}

/** Six watched clips of ten minutes each: the sixty minutes full, each used a day later than the one before. */
const sixFull = () => [6, 5, 4, 3, 2, 1].map((days) => watchedClip({ seconds: 600, copy_used_at: daysAgo(days) }));

test("with the videos full, the least recently used watched copy is let go and the next clip comes in", async () => {
  const clips = sixFull();
  const fresh = newClip(120);
  const w = world({ files: clips.map((c) => c.row), items: [...clips.map((c) => c.origin), fresh.item] });
  const drive = { ...driveOf(...clips), ...fresh.drive };
  theSync({ drive });
  const web = theWeb({ drive });
  const oldest = clips[0].row;
  const oldestCopy = oldest.media_ref;
  assert.deepEqual(await runTakes(w), [{ took: "asked" }], "the new clip is asked of the video platform");
  assert.deepEqual(platformSaw(web).deleted, [oldestCopy], "one copy is deleted there: the one used longest ago");
  assert.deepEqual(
    [w.file(oldest.id).copy_state, w.file(oldest.id).media_ref, w.file(oldest.id).removed_at],
    ["away", null, null],
    "it is away, holds no id, and is still in the Library",
  );
  assert.equal(w.file(oldest.id).media_status, "ready");
  assert.equal(w.file(oldest.id).look_status, "done", "what AI wrote of it stays");
  for (const kept of clips.slice(1)) assert.equal(w.file(kept.row.id).copy_state, "here", "no other copy went");
  assert.equal(platformSaw(web).asked, 1);
  assert.equal(w.item(fresh.item.id).state, "taking");
});

test("uploads, videos made here and found videos are never let go: waiting, kept or set aside", async () => {
  const mine = [
    videoRow({ source: "upload", seconds: 900, copy_used_at: daysAgo(300) }),
    videoRow({ source: "made", seconds: 900, copy_used_at: daysAgo(300) }),
    videoRow({ source: "instagram", status: "inbox", seconds: 600, copy_used_at: daysAgo(300) }),
    videoRow({ source: "website", status: "filed", seconds: 600, copy_used_at: daysAgo(300) }),
    videoRow({ source: "google_profile", status: "set_aside", seconds: 600, copy_used_at: daysAgo(300) }),
  ];
  const fresh = newClip(120);
  // The same clip as the upload also sits in the watched folder (one Library file, two origins): its folder could
  // give it back, and it is still the owner's own upload, never let go.
  const alsoInTheFolder = itemRow({ state: "in", file_id: mine[0].id, provider_id: "drive-twin-of-the-upload" });
  const w = world({ files: mine, items: [fresh.item, alsoInTheFolder] });
  theSync({ drive: fresh.drive });
  const web = theWeb({ drive: fresh.drive });
  assert.deepEqual(await runTakes(w), [{ took: "waits:room" }], "the clip waits: nothing may be let go for it");
  assert.equal(await makeRoom(w.db, T, 120, SOON()), false);
  assert.equal(await letUnusedCopiesGo(w.db, T, SOON()), 0, "nor by age, however long unused");
  assert.deepEqual(platformSaw(web), { asked: 0, deleted: [] }, "nothing is deleted at the video platform");
  for (const row of mine) {
    assert.equal(w.file(row.id).copy_state, "here", `${row.source} stays here`);
    assert.equal(w.file(row.id).media_ref, row.media_ref);
  }
  assert.deepEqual([w.item(fresh.item.id).state, w.item(fresh.item.id).why], ["waiting", "room"]);
});

test("beside uploads, only the watched copy goes", async () => {
  const upload = videoRow({ source: "upload", seconds: 3000, copy_used_at: daysAgo(300) });
  const found = videoRow({ source: "instagram", status: "set_aside", seconds: 300, copy_used_at: daysAgo(300) });
  const clip = watchedClip({ seconds: 300, copy_used_at: daysAgo(1) });
  const w = world({ files: [upload, found, clip.row], items: [clip.origin] });
  const web = theWeb({});
  const copy = clip.row.media_ref;
  assert.equal(await makeRoom(w.db, T, 200, SOON()), true);
  assert.deepEqual(platformSaw(web).deleted, [copy]);
  assert.deepEqual(
    [upload, found, clip.row].map((row) => w.file(row.id).copy_state),
    ["here", "here", "away"],
  );
});

test("nothing is let go while a video being made names it", async () => {
  const clips = sixFull();
  const named = clips[0];
  const piece = {
    id: "eeeeeeee-0000-4000-8000-000000000001",
    tenant_id: T,
    status: "making",
    plan: { shape: "blocks", blocks: [{ is: "clip", file_id: named.row.id, trim: 0, seconds: 4 }] },
  };
  const w = world({ files: clips.map((c) => c.row), items: clips.map((c) => c.origin), pieces: [piece] });
  const web = theWeb({});
  const next = clips[1].row.media_ref;
  assert.equal(await makeRoom(w.db, T, 120, SOON()), true);
  assert.equal(w.file(named.row.id).copy_state, "here", "the clip the video names keeps its copy");
  assert.deepEqual(platformSaw(web).deleted, [next], "the next least recently used goes in its place");
  // Once the video is made, the clip is one that may go like any other.
  piece.status = "made";
  assert.equal(await makeRoom(w.db, T, 700, SOON()), true);
  assert.equal(w.file(named.row.id).copy_state, "away");
});

test("a copy is let go only where it can come back, was looked at, and has rested", async () => {
  const cases = {
    looking: watchedClip({ seconds: 600, look_status: "waiting", created_at: daysAgo(1), copy_used_at: daysAgo(9) }),
    binned: watchedClip({ seconds: 600, copy_used_at: daysAgo(9) }, { state: "gone", gone_at: daysAgo(1) }),
    preparing: watchedClip({ seconds: 600, media_status: "processing", copy_used_at: daysAgo(9) }),
    justUsed: watchedClip({ seconds: 600, copy_used_at: new Date(NOW - 10 * 60_000).toISOString() }),
    justArrived: watchedClip({ seconds: 600, ready_at: new Date(NOW - 20 * 60_000).toISOString() }),
    free: watchedClip({ seconds: 600, copy_used_at: daysAgo(2) }),
  };
  const all = Object.values(cases);
  const w = world({ files: all.map((c) => c.row), items: all.map((c) => c.origin) });
  const web = theWeb({});
  const free = cases.free.row.media_ref;
  assert.equal(await makeRoom(w.db, T, 60, SOON()), true);
  assert.deepEqual(platformSaw(web).deleted, [free], "only the one that may go");
  // Needing more than every copy that may go would free lets nothing go: none is let go in vain.
  assert.equal(await makeRoom(w.db, T, 601, SOON()), false);
  for (const name of ["looking", "binned", "preparing", "justUsed", "justArrived"])
    assert.equal(w.file(cases[name].row.id).copy_state, "here", `${name} stays`);
  assert.equal(LET_GO.restMs, 60 * 60_000);
});

test("a folder no longer being read gives nothing back, so its copies are never let go", async () => {
  const clips = sixFull();
  const w = world({ files: clips.map((c) => c.row), items: clips.map((c) => c.origin), sourceState: "paused" });
  const web = theWeb({});
  assert.equal(await makeRoom(w.db, T, 120, SOON()), false);
  assert.equal(await letUnusedCopiesGo(w.db, T, SOON()), 0);
  assert.deepEqual(platformSaw(web).deleted, []);
});

test("with room to spare, a copy unused for two weeks is let go, and one used since is not", async () => {
  const old = watchedClip({ seconds: 60, copy_used_at: daysAgo(15) });
  const never = watchedClip({ seconds: 60, ready_at: daysAgo(20), created_at: daysAgo(20) });
  const used = watchedClip({ seconds: 60, copy_used_at: daysAgo(13) });
  const upload = videoRow({ source: "upload", seconds: 60, copy_used_at: daysAgo(200) });
  const w = world({ files: [old.row, never.row, used.row, upload], items: [old.origin, never.origin, used.origin] });
  const web = theWeb({});
  const unused = [old.row.media_ref, never.row.media_ref].sort();
  assert.equal(await letUnusedCopiesGo(w.db, T, SOON()), 2);
  assert.deepEqual(platformSaw(web).deleted.sort(), unused);
  assert.deepEqual(
    [old.row, never.row, used.row, upload].map((row) => w.file(row.id).copy_state),
    ["away", "away", "here", "here"],
  );
  assert.equal(LET_GO.unusedMs, 14 * 24 * 60 * 60_000);
});

test("a delete that does not land leaves the copy marked, never away with a copy still at the platform", async () => {
  const clip = watchedClip({ seconds: 600, copy_used_at: daysAgo(3) });
  const w = world({ files: [clip.row], items: [clip.origin] });
  const copy = clip.row.media_ref;
  // The platform answers every delete with a fault.
  const web = theWeb({});
  const answered = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if ((init?.method ?? "GET") !== "DELETE") return answered(url, init);
    return new Response(JSON.stringify({ success: false }), { status: 500 });
  };
  try {
    assert.equal(await makeRoom(w.db, T, 3100, SOON()), false, "the room was not made");
  } finally {
    globalThis.fetch = answered;
  }
  const row = w.file(clip.row.id);
  assert.equal(row.copy_state, "going", "marked, and not said away");
  assert.equal(row.media_ref, copy, "it still holds its id, so the sweep can finish the delete");
  assert.equal(platformSaw(web).asked, 0);
});

test("freed room releases what waited for it", async () => {
  const clips = sixFull();
  const waiting = itemRow({ state: "waiting", why: "room", take_after: new Date(NOW + 6 * 3_600_000).toISOString() });
  const w = world({ files: clips.map((c) => c.row), items: [...clips.map((c) => c.origin), waiting] });
  theWeb({});
  assert.equal(await makeRoom(w.db, T, 120, SOON()), true);
  assert.equal(w.item(waiting.id).take_after, null, "the clip that waited for room is due at once");
});

test("a take holds its room from its judging, so two at the edge are not both judged to fit", async () => {
  // 3,500 of the 3,600 seconds are an upload's: room for one clip of ninety seconds, not two.
  const upload = videoRow({ source: "upload", seconds: 3500 });
  const first = itemRow({ state: "taking", updated_at: new Date(NOW).toISOString() });
  const second = itemRow({ state: "taking", updated_at: new Date(NOW).toISOString() });
  const w = world({ files: [upload], items: [first, second] });
  const clip = (item, n) => ({
    tenantId: T,
    id: `ffffffff-0000-4000-8000-00000000000${n}`,
    itemId: item.id,
    name: `clip-${n}`,
    mime: "video/quicktime",
    bytes: 1000 + n,
    seconds: 90,
    fingerprint: `fingerprint-${n}`,
  });
  // Both judged before either is fetched, as two takes handed out together are.
  assert.equal((await recordVideoSourced(w.db, { ...clip(first, 1), mediaRef: null })).fate, "room");
  assert.equal(w.item(first.id).held_seconds, 90, "the first holds its ninety seconds");
  assert.equal((await recordVideoSourced(w.db, { ...clip(second, 2), mediaRef: null })).fate, "minutes");
  assert.equal(w.item(second.id).held_seconds ?? null, null);
  // The first is judged again (its job run twice): its own hold is not counted against it.
  assert.equal((await recordVideoSourced(w.db, { ...clip(first, 1), mediaRef: null })).fate, "room");
  // Its row written, the hold has done its work and the file counts in its place.
  assert.equal((await recordVideoSourced(w.db, { ...clip(first, 1), mediaRef: "c".repeat(32) })).fate, "kept");
  assert.equal(w.item(first.id).held_seconds, null);
  assert.equal((await recordVideoSourced(w.db, { ...clip(second, 2), mediaRef: null })).fate, "minutes");
  // A take that leaves its job (put back to wait) holds nothing.
  Object.assign(w.item(first.id), { state: "in" });
  w.tables.files.pop();
  Object.assign(w.item(second.id), { held_seconds: 90, state: "waiting" });
  assert.equal((await recordVideoSourced(w.db, { ...clip(first, 3), mediaRef: null })).fate, "room");
});
