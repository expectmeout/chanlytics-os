/**
 * A copy that was asked for and found no room waits, and comes back by itself (apps/edge/lib/files/copy/sweep.ts and
 * bring-back.ts over 00654 and 00655; the footage sources plan's P5, gate 3). Until this, a return that found the
 * videos full ended away with why `room`, and nothing asked again: an owner who pressed Play was left to press it
 * again. The half-hourly pass now asks for such a copy again, once a file, and the return judges the room as it
 * stands then. A wait older than the pass looks back, a day's budget and a clip nobody asked for are left alone.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import {
  COPY_RETURN,
  NOW,
  T,
  driveOf,
  ensureCopy,
  keepCopiesMoving,
  platformSaw,
  realFetch,
  runReturns,
  setPg,
  theSync,
  theWeb,
  videoRow,
  watchedClip,
  world,
} from "./_world.mjs";

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const minutesAgo = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

test("the pass asks again for a copy that waits for room, once a file, and for nothing else", async () => {
  const waits = watchedClip({ copy_state: "away", copy_why: "room", updated_at: minutesAgo(20) });
  const tomorrow = watchedClip({ copy_state: "away", copy_why: "budget", updated_at: minutesAgo(20) });
  const unasked = watchedClip({ copy_state: "away", copy_why: null, updated_at: minutesAgo(20) });
  const long = watchedClip({ copy_state: "away", copy_why: "room", updated_at: minutesAgo(7 * 60) });
  const all = [waits, tomorrow, unasked, long];
  const w = world({ files: all.map((clip) => clip.row), items: all.map((clip) => clip.origin) });
  theWeb({});
  const first = await keepCopiesMoving(w.db, NOW);
  assert.equal(first.asked, 1, "one copy waits for room inside the hours the pass looks back");
  assert.deepEqual(
    w.returns().map((job) => job.payload),
    [{ file_id: waits.row.id }],
    "its return is on the ledger; a day's budget, a clip nobody asked for and an old wait are left",
  );
  await keepCopiesMoving(w.db, NOW);
  assert.equal(w.returns().length, 1, "asked again while its return still waits: the same one job");
  assert.equal(COPY_RETURN.roomAskForMs, 6 * 60 * 60_000);
});

test("pressed once: it waits while the videos are full, and comes back by itself once there is room", async () => {
  // The owner's own upload fills the sixty minutes but for half a minute: nothing can step aside for a one-minute clip.
  const upload = videoRow({ source: "upload", seconds: 3570 });
  const clip = watchedClip({ copy_state: "away", seconds: 60 });
  const w = world({ files: [upload, clip.row], items: [clip.origin] });
  const drive = driveOf(clip);
  theSync({ drive });
  const web = theWeb({ drive });
  const row = () => w.file(clip.row.id);

  assert.equal((await ensureCopy(w.db, T, clip.row.id, "play")).copy, "returning", "Play asks for it");
  assert.deepEqual(await runReturns(w), [{ returned: "waits:room" }]);
  assert.deepEqual([row().copy_state, row().copy_why], ["away", "room"], "no room: it waits, and its row says so");
  assert.equal(platformSaw(web).asked, 0, "nothing is asked of the video platform while there is no room");

  // Still full at the next pass: asked for again, and it waits again. Nobody pressed anything.
  w.returns().forEach((job) => Object.assign(job, { state: "done" }));
  await keepCopiesMoving(w.db, NOW);
  assert.deepEqual(await runReturns(w), [{ returned: "waits:room" }]);
  assert.equal(row().copy_why, "room");

  // Room is made (the owner removes the long upload). The next pass asks again, and this time it comes back.
  Object.assign(upload, { removed_at: new Date(NOW).toISOString() });
  w.returns().forEach((job) => Object.assign(job, { state: "done" }));
  await keepCopiesMoving(w.db, NOW);
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.deepEqual([row().copy_state, row().copy_why], ["returning", null]);
  assert.equal(platformSaw(web).asked, 1, "the video platform is asked for the copy, once");
  assert.equal(row().media_ref, web.copies[0].uid);
});
