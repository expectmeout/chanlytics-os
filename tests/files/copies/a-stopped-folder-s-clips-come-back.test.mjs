/**
 * A stopped folder's clips step aside and come back while its Google account stays connected (the content loop PRD
 * v3.1, pass 0, F1; Ruben's call 1 of 21 Nov 2026). The first real run found folder B, stopped, holding 55.8 of the
 * sixty minutes for good: its clips could never step aside, and a press of Play was refused and told "Google Drive
 * needs to be connected again" while it was. A stopped folder's original is still readable through the account, so
 * its clips are let go and brought back as a watched folder's are; only an account that needs connecting again, or a
 * folder Drive cannot open, says otherwise, each in its own word (copy_why `connection`, `cant_open`).
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import {
  T,
  daysAgo,
  driveOf,
  ensureCopy,
  letUnusedCopiesGo,
  makeRoom,
  platformSaw,
  realFetch,
  runReturns,
  setPg,
  theSync,
  theWeb,
  watchedClip,
  world,
} from "./_world.mjs";

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const SOON = () => Date.now() + 30_000;

/** Six clips of ten minutes, the sixty minutes full, each used a day later than the one before. */
const sixFull = () => [6, 5, 4, 3, 2, 1].map((days) => watchedClip({ seconds: 600, copy_used_at: daysAgo(days) }));

test("a stopped folder's clips step aside for a new one while its account is connected, the least used first", async () => {
  const clips = sixFull();
  const w = world({ files: clips.map((c) => c.row), items: clips.map((c) => c.origin), sourceState: "stopped" });
  const web = theWeb({});
  const oldest = clips[0].row.media_ref;
  assert.equal(await makeRoom(w.db, T, 120, SOON()), true, "room is made, as for a folder being read");
  assert.deepEqual(platformSaw(web).deleted, [oldest], "the one used longest ago goes");
  assert.equal(w.file(clips[0].row.id).copy_state, "away");
  // Unused for two weeks, one steps aside with room to spare too.
  const old = watchedClip({ seconds: 60, copy_used_at: daysAgo(20) });
  const quiet = world({ files: [old.row], items: [old.origin], sourceState: "stopped" });
  theWeb({});
  assert.equal(await letUnusedCopiesGo(quiet.db, T, SOON()), 1);
});

test("Play brings a stopped folder's clip back, through the account's key, as a watched folder's", async () => {
  const clip = watchedClip({ copy_state: "away" });
  const w = world({ files: [clip.row], items: [clip.origin], sourceState: "stopped" });
  const drive = driveOf(clip);
  const opened = theSync({ drive });
  const web = theWeb({ drive });
  assert.equal((await ensureCopy(w.db, T, clip.row.id, "play")).copy, "returning");
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.equal(w.file(clip.row.id).copy_state, "returning", "on its way, never 'connect Drive again'");
  assert.equal(platformSaw(web).asked, 1);
  assert.deepEqual(opened.roads, ["return"], "the folder is opened for a return, which a stopped folder gives");
});

test("an account that needs connecting again keeps a stopped folder's clips, and a clip away says the account", async () => {
  const clips = sixFull();
  const w = world({
    files: clips.map((c) => c.row),
    items: clips.map((c) => c.origin),
    sourceState: "stopped",
    connectionHealth: "needs_reconnect",
  });
  const web = theWeb({});
  assert.equal(await makeRoom(w.db, T, 120, SOON()), false, "nothing steps aside that could not come back");
  assert.deepEqual(platformSaw(web).deleted, []);

  const clip = watchedClip({ copy_state: "away" });
  const away = world({ files: [clip.row], items: [clip.origin], sourceState: "stopped" });
  theSync({ drive: driveOf(clip), closed: { skipped: "the account is needs_reconnect", cause: "account" } });
  const none = theWeb({});
  await ensureCopy(away.db, T, clip.row.id, "play");
  assert.deepEqual(await runReturns(away), [{ skipped: "the account is needs_reconnect" }]);
  assert.deepEqual([away.file(clip.row.id).copy_state, away.file(clip.row.id).copy_why], ["away", "connection"]);
  assert.equal(platformSaw(none).asked, 0);
});

test("a folder Drive can't open gives nothing back, and its clip says the folder, never the account", async () => {
  const clip = watchedClip({ copy_state: "away" });
  const w = world({ files: [clip.row], items: [clip.origin], sourceState: "frozen" });
  theSync({ drive: driveOf(clip), closed: { skipped: "the folder is frozen", cause: "folder" } });
  const web = theWeb({});
  await ensureCopy(w.db, T, clip.row.id, "play");
  assert.deepEqual(await runReturns(w), [{ skipped: "the folder is frozen" }]);
  assert.deepEqual([w.file(clip.row.id).copy_state, w.file(clip.row.id).copy_why], ["away", "cant_open"]);
  assert.equal(platformSaw(web).asked, 0);
});

test("a key Google refuses part way says the account, as the sync settles it", async () => {
  const clip = watchedClip({ copy_state: "away" });
  const w = world({ files: [clip.row], items: [clip.origin], sourceState: "stopped" });
  theSync({
    drive: driveOf(clip),
    recordThrows: Object.assign(new Error("refused"), { name: "SourceKeyRefused", refused: "grant" }),
    signedOut: "the account is signed out",
  });
  theWeb({});
  await ensureCopy(w.db, T, clip.row.id, "play");
  assert.deepEqual(await runReturns(w), [{ skipped: "the account is signed out" }]);
  assert.equal(w.file(clip.row.id).copy_why, "connection");
});
