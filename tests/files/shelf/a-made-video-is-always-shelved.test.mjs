/**
 * A made video is always shelved (apps/edge/lib/files/shelf/catch-up.ts in the half-hourly pass, over 00729; lane 1
 * of the "Prove it works" plan). A made video's copy is begun as it is made, and a run that ended between "sent" and
 * that step, a call that failed, a full shelf, or a video made before the switch was on left a video with no shelf
 * copy's row, which nothing ever read for. The pass now finds each one, reads its kept file, takes its SHA-256 and
 * begins its copy through the door a new video's goes through; puts back a copy the shelf refused; and counts the
 * shelf's room one way for all of them, so nothing passes the limit by being tried again.
 *
 * The real pass, shelving and return run here, over a database in memory, the relay's own handler and a bucket in
 * memory. The SQL itself is held by the-shelf-rules.db.test.mjs.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { linesOf } from "../../_log-lines.mjs";
import {
  FILE_SHELF_MINUTES_MAX,
  T,
  beginShelving,
  keepShelfCaughtUp,
  daysAgo,
  ensureCopy,
  fileMadePathOf,
  keepCopiesMoving,
  letUnusedCopiesGo,
  madeVideo,
  realFetch,
  runReturns,
  runShelving,
  setPg,
  shaOf,
  shelfWorld,
  shelveNow,
  theSync,
  theWeb,
  videoBytes,
  videoRow,
} from "./_world.mjs";

let open = null;
function theWorld(options) {
  open = shelfWorld(options);
  return open;
}
afterEach(() => {
  open?.close();
  open = null;
  resetBreakers();
});
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});

const SHELF_SECONDS = FILE_SHELF_MINUTES_MAX * 60;
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const eventsOf = (lines, event) => lines.filter((line) => line.event === event);
const whysOf = (lines) => eventsOf(lines, "file_shelve_failed").map((line) => line.why);
/** A video made here days ago, with nothing on the shelf and no row there: what the pass is for. */
const bare = (over = {}) => madeVideo({ created_at: daysAgo(3), ready_at: daysAgo(3), ...over });
/** A copy the shelf refused, as the ledger leaves one whose job would not finish: its row failed, and aged. */
async function refuse(w, file, agedMinutes = 120) {
  await w.db.rpc("file_shelf_failed", { p_tenant_id: T, p_file_id: file.id, p_why: "refused" });
  for (const job of w.shelveJobs()) job.state = "failed";
  w.shelfRow(file.id).updated_at = minutesAgo(agedMinutes);
}

test("a made video whose copy was never begun is found by the pass, its kept file read, and shelved", async () => {
  const file = bare({ seconds: 32 });
  const bytes = videoBytes(1);
  const w = theWorld({ files: [file], kept: [[file.id, bytes]] });
  assert.equal(w.shelfRow(file.id), null, "its run ended before its copy's first step: no row at all");

  const { result, lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(result.owed, 1);
  assert.deepEqual(w.storage.read, [fileMadePathOf(T, file.id, "video")], "its own kept file, read once");
  assert.equal(w.shelfRow(file.id).state, "saving");
  assert.deepEqual(
    [w.shelfPiece(file.id).bytes, w.shelfPiece(file.id).sha256],
    [bytes.length, shaOf(bytes)],
    "held to the very bytes of its kept file",
  );
  assert.equal(w.asked.find((a) => a.door === "file_shelf_begin").p_seconds_max, SHELF_SECONDS);
  assert.equal(w.shelveJobs().length, 1, "with its job, written by the door");
  assert.deepEqual(
    eventsOf(lines, "file_shelve_failed").map((line) => [line.level, line.why, line.begun]),
    [["warn", "never_begun", 1]],
    "one line says the floor was needed",
  );
  // The job it wrote is the one a new video's copy gets: pulled, read back, checked.
  assert.deepEqual(await runShelving(w), [{ shelved: "checked" }]);
  assert.deepEqual(new Uint8Array(w.onShelf(file.id).bytes), bytes);
  // And the next pass finds nothing owed, and reads nothing.
  w.storage.read.length = 0;
  assert.equal((await keepCopiesMoving(w.db, Date.now())).owed, 0);
  assert.deepEqual(w.storage.read, []);
});

test("once shelved by the pass, it may step aside and come back, as any made video", async () => {
  const file = bare({ copy_used_at: daysAgo(21), ready_at: daysAgo(21), created_at: daysAgo(21) });
  theWeb({ held: [{ uid: file.media_ref, state: "ready" }] });
  theSync();
  const w = theWorld({ files: [file], kept: [[file.id, videoBytes(2)]] });
  await keepCopiesMoving(w.db, Date.now());
  await runShelving(w);
  assert.equal(await letUnusedCopiesGo(w.db, T, Date.now() + 30_000), 1);
  assert.equal(w.file(file.id).copy_state, "away");
  assert.equal((await ensureCopy(w.db, T, file.id, "play")).copy, "returning");
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
});

test("videos made before the switch are shelved a few a pass, the newest first", async () => {
  const files = [5, 4, 3, 2, 1].map((days) => bare({ created_at: daysAgo(days) }));
  const w = theWorld({ files, kept: files.map((file, i) => [file.id, videoBytes(i + 1)]) });
  const first = await keepCopiesMoving(w.db, Date.now());
  const shelvedNow = () => files.filter((file) => w.shelfRow(file.id)).map((file) => file.id);
  assert.equal(first.owed, 3, "a few a pass");
  assert.deepEqual(shelvedNow(), [files[2].id, files[3].id, files[4].id], "the three made last");
  assert.equal((await keepCopiesMoving(w.db, Date.now())).owed, 2);
  assert.equal(shelvedNow().length, 5, "and the rest the pass after");
});

test("never a video still being made, an upload, a removed video, or a workspace whose switch is off", async () => {
  const making = madeVideo({ created_at: minutesAgo(10) });
  const upload = videoRow({ source: "upload", created_at: daysAgo(3) });
  const removed = bare({ removed_at: daysAgo(1) });
  const w = theWorld({
    files: [making, upload, removed],
    kept: [making, upload, removed].map((file, i) => [file.id, videoBytes(i + 1)]),
  });
  assert.equal((await keepCopiesMoving(w.db, Date.now())).owed, 0);
  assert.deepEqual(w.storage.read, [], "no kept file is opened");
  assert.deepEqual(w.tables.file_archives, []);
  open.close();

  const off = bare();
  const quiet = theWorld({ shelfOn: false, files: [off], kept: [[off.id, videoBytes(1)]] });
  assert.equal((await keepCopiesMoving(quiet.db, Date.now())).owed, 0);
  assert.equal(quiet.shelfRow(off.id), null, "a workspace whose switch is off stores nothing new");
});

test("a made video whose kept file is gone can be given no copy: its row says so once, and it is asked for no more", async () => {
  const file = bare();
  const w = theWorld({ files: [file] });
  const { lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.deepEqual(
    [w.shelfRow(file.id).state, w.shelfRow(file.id).why, w.shelfPiece(file.id)],
    ["failed", "not_found", null],
    "failed as not found, with no piece: there are no bytes to name",
  );
  assert.deepEqual(w.shelveJobs(), [], "and no job: nothing could ever finish it");
  assert.deepEqual(
    eventsOf(lines, "file_shelve_failed").map((line) => [line.why, line.file ?? null, line.unkept ?? null]),
    [
      ["not_found", file.id, null],
      ["never_begun", null, 1],
    ],
  );
  assert.deepEqual([w.file(file.id).copy_state, Boolean(w.file(file.id).media_ref)], ["here", true], "it plays on");
  // The next pass does not read for it again.
  w.storage.read.length = 0;
  const again = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.deepEqual(w.storage.read, []);
  assert.deepEqual(whysOf(again.lines), []);
});

test("a kept file that cannot be read just now is a line, and the video is asked for again", async () => {
  const file = bare();
  const w = theWorld({ files: [file], kept: [[file.id, videoBytes(1)]] });
  w.storage.readFails = "upstream timed out";
  const { result, lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(result.owed, 0);
  assert.equal(w.shelfRow(file.id), null, "no answer is not a kept file gone: nothing is written");
  assert.deepEqual(
    eventsOf(lines, "files_sweep_failed").map((line) => [line.level, line.part, line.file]),
    [["error", "shelf_owed", file.id]],
  );
  w.storage.readFails = null;
  assert.equal((await keepCopiesMoving(w.db, Date.now())).owed, 1);
});

test("a full shelf says so every pass, and the video is shelved by itself once there is room", async () => {
  // The shelf holds all but thirty seconds of its room; a video of a minute does not fit.
  const big = madeVideo({ seconds: SHELF_SECONDS - 30 });
  const waits = bare({ seconds: 60 });
  const w = theWorld({ files: [big, waits], kept: [[waits.id, videoBytes(2)]] });
  await shelveNow(w, big, videoBytes(1));
  w.storage.read.length = 0;

  const full = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(full.result.owed, 0);
  assert.equal(w.shelfRow(waits.id), null, "no row is the state: it is asked for again next pass");
  assert.deepEqual(w.storage.read, [], "and its kept file is not read to no end");
  assert.deepEqual(
    eventsOf(full.lines, "file_shelve_failed").map((line) => [line.level, line.why, line.videos, line.workspaces]),
    [["warn", "shelf_full", 1, 1]],
    "one line for Health: how many videos wait, in how many workspaces",
  );
  // The big one is removed: its room is free at once, and the next pass shelves what waited.
  w.file(big.id).removed_at = new Date().toISOString();
  const roomy = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(roomy.result.owed, 1);
  assert.equal(w.shelfRow(waits.id).state, "saving");
  assert.ok(!whysOf(roomy.lines).includes("shelf_full"));
});

test("a copy the shelf refused is put back by the pass, an hour on", async () => {
  const file = bare();
  const w = theWorld({ files: [file], kept: [[file.id, videoBytes(1)]] });
  await keepCopiesMoving(w.db, Date.now());
  // Its job ended with the relay down past its tries: the ledger fails the copy as refused.
  await refuse(w, file, 20);
  assert.equal((await keepCopiesMoving(w.db, Date.now())).owed, 0, "refused a moment ago: left its while");
  await refuse(w, file);
  const { result, lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(result.owed, 1);
  assert.equal(w.shelfRow(file.id).state, "saving");
  assert.equal(w.asked.findLast((a) => a.door === "file_shelf_again").p_seconds_max, SHELF_SECONDS);
  assert.equal(w.shelveJobs().filter((job) => job.state === "scheduled").length, 1, "with its job again");
  assert.deepEqual(
    eventsOf(lines, "file_shelve_failed").map((line) => [line.why, line.again]),
    [["never_begun", 1]],
  );
  assert.deepEqual(w.storage.read.length, 1, "its bytes and SHA-256 are kept: its file is not read again");
  assert.deepEqual(await runShelving(w), [{ shelved: "checked" }]);
});

test("a failed copy tried again cannot pass the limit", async () => {
  // Two videos of half the shelf's room each. The first is shelved; the second's copy is refused, and holds no room.
  const half = SHELF_SECONDS / 2;
  const first = madeVideo({ seconds: half });
  const second = bare({ seconds: half, copy_used_at: daysAgo(21), ready_at: daysAgo(21), created_at: daysAgo(21) });
  const third = madeVideo({ seconds: half });
  theWeb();
  theSync();
  const w = theWorld({ files: [first, second, third], kept: [[second.id, videoBytes(2)]] });
  await shelveNow(w, first, videoBytes(1));
  const bytes = videoBytes(2);
  await beginShelving(w.db, { tenantId: T, fileId: second.id, bytes: bytes.length, sha256: shaOf(bytes) });
  await refuse(w, second);
  // A third takes the room the refused copy no longer holds: the shelf is at its limit.
  await shelveNow(w, third, videoBytes(3));

  const { result, lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(result.owed, 0);
  assert.equal(w.shelfRow(second.id).state, "failed", "the pass does not put it back past the limit");
  assert.deepEqual(
    eventsOf(lines, "file_shelve_failed").map((line) => [line.why, line.videos]),
    [["shelf_full", 1]],
    "it waits with the full shelf's, and is said",
  );
  // Nor does anything that leans on it: the door a return asks is handed the same limit.
  const said = await w.db.rpc("file_shelf_again", {
    p_tenant_id: T,
    p_file_id: second.id,
    p_seconds_max: SHELF_SECONDS,
  });
  assert.equal(said.data, false);
  const held = w.tables.file_archives.filter((row) => ["saving", "saved", "checked"].includes(row.state));
  assert.equal(
    held.reduce((sum, row) => sum + w.file(row.file_id).seconds, 0),
    SHELF_SECONDS,
    "the shelf holds exactly its room, never more",
  );
  // Room again (the third is removed): the same copy comes back the next pass.
  w.file(third.id).removed_at = new Date().toISOString();
  assert.equal((await keepCopiesMoving(w.db, Date.now())).owed, 1);
  assert.equal(w.shelfRow(second.id).state, "saving");
});

test("the step has a time: past it no kept file is opened, and what is left waits for the next pass", async () => {
  const files = [2, 1].map((days) => bare({ created_at: daysAgo(days) }));
  const w = theWorld({ files, kept: files.map((file, i) => [file.id, videoBytes(i + 1)]) });
  // A pass that began long ago: its time for this step is spent before the first file.
  assert.equal(await keepShelfCaughtUp(w.db, Date.now() - 60_000), 0);
  assert.deepEqual(w.storage.read, []);
  assert.equal(await keepShelfCaughtUp(w.db, Date.now()), 2);
});
