/**
 * A shelved video steps aside (apps/edge/lib/files/copy/let-go.ts and shelf/check.ts, the archive plan's B2): a video
 * Chanlytics made gives up its place at the video platform once the shelf is seen, at that moment, to hold its very
 * bytes, and never on the strength of its row alone. A shelf that holds nothing or other bytes keeps the video where
 * it is, puts the copy back from the video's own kept file, and says so once; a shelf that gives no answer keeps it
 * here and changes nothing. The real letting go and sweep run here, over the relay's own handler.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { linesOf } from "../../_log-lines.mjs";
import {
  LET_GO,
  T,
  daysAgo,
  keepCopiesMoving,
  letUnusedCopiesGo,
  madeVideo,
  makeRoom,
  platformSaw,
  realFetch,
  runShelving,
  setPg,
  shelfWorld,
  shelveNow,
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

const soon = () => Date.now() + 30_000;
const eventsOf = (lines, event) => lines.filter((line) => line.event === event);
/** A made video unused for three weeks, shelved and checked: one the two-week pass lets go. */
async function shelvedLongAgo(w, file, seed = 1) {
  await shelveNow(w, file, videoBytes(seed));
  return file;
}
const old = (over = {}) =>
  madeVideo({ ready_at: daysAgo(21), created_at: daysAgo(21), copy_used_at: daysAgo(21), ...over });

test("a made video with a checked copy the shelf still holds is let go, and plays again on Play", async () => {
  const file = old();
  const web = theWeb();
  const w = theWorld({ files: [file] });
  await shelvedLongAgo(w, file);
  const ref = file.media_ref;
  const before = w.relay.asked.length;

  const { result, lines } = await linesOf(() => letUnusedCopiesGo(w.db, T, soon()));
  assert.equal(result, 1);
  assert.deepEqual(
    [w.file(file.id).copy_state, w.file(file.id).copy_why, w.file(file.id).media_ref],
    ["away", null, null],
    "away, not lost: the shelf can give it back",
  );
  assert.deepEqual(platformSaw(web).deleted, [ref], "deleted at the video platform, once");
  // The shelf was asked what it holds, at that moment, before anything was deleted.
  assert.deepEqual(
    w.relay.asked.slice(before).map((ask) => ask.method),
    ["HEAD"],
  );
  assert.ok(w.onShelf(file.id), "and its copy is still on the shelf");
  const [line] = eventsOf(lines, "copy_let_go");
  assert.deepEqual([line.by, line.marked, line.went, line.from_shelf], ["age", 1, 1, 1]);
});

test("a shelf that holds nothing keeps the video here, puts the copy back from its kept file, and says so once", async () => {
  const file = old();
  const web = theWeb();
  const w = theWorld({ files: [file] });
  await shelvedLongAgo(w, file);
  // The object is gone from the shelf, though its row says checked. It must never happen; this is what happens if it does.
  w.relay.shelf.held.clear();

  const { result, lines } = await linesOf(() => letUnusedCopiesGo(w.db, T, soon()));
  assert.equal(result, 0);
  assert.deepEqual(
    [w.file(file.id).copy_state, Boolean(w.file(file.id).media_ref)],
    ["here", true],
    "it plays as it did",
  );
  assert.deepEqual(platformSaw(web).deleted, [], "nothing was deleted at the video platform");
  assert.equal(w.shelfRow(file.id).state, "saving", "its copy is being put back");
  assert.equal(
    w.shelveJobs().filter((job) => job.state === "scheduled").length,
    1,
    "with its job, written by the door",
  );
  assert.deepEqual(
    eventsOf(lines, "shelf_copy_lost").map((line) => [line.level, line.file, line.found, line.kept, line.again]),
    [["error", file.id, "nothing", "here", true]],
  );
  // It may not go while it is put back; once the job has run, it is the shelf's again and may.
  assert.equal(await letUnusedCopiesGo(w.db, T, soon()), 0);
  await runShelving(w);
  assert.equal(w.shelfRow(file.id).state, "checked");
  assert.ok(w.onShelf(file.id));
  assert.equal(await letUnusedCopiesGo(w.db, T, soon()), 1);
  assert.equal(w.file(file.id).copy_state, "away");
});

test("a shelf that holds other bytes keeps the video here and puts its own back", async () => {
  const file = old();
  const web = theWeb();
  const w = theWorld({ files: [file] });
  await shelvedLongAgo(w, file);
  const stored = w.onShelf(file.id);
  // Other bytes under its key: other size, other checksum. The bucket's own check makes this impossible by a put.
  const other = videoBytes(7, 1000);
  Object.assign(stored, { bytes: Buffer.from(other), sha256: "f".repeat(64) });

  const { result, lines } = await linesOf(() => letUnusedCopiesGo(w.db, T, soon()));
  assert.equal(result, 0);
  assert.equal(w.file(file.id).copy_state, "here");
  assert.deepEqual(platformSaw(web).deleted, []);
  assert.equal(eventsOf(lines, "shelf_copy_lost")[0].found, "other_bytes");
  await runShelving(w);
  assert.deepEqual(new Uint8Array(w.onShelf(file.id).bytes), videoBytes(1), "its own bytes are on the shelf again");
  assert.equal(w.shelfRow(file.id).state, "checked");
});

test("a shelf that gives no answer keeps the video here and changes nothing", async () => {
  const file = old();
  const web = theWeb();
  const w = theWorld({ files: [file] });
  await shelvedLongAgo(w, file);
  w.relay.state.down = true;
  const { result, lines } = await linesOf(() => letUnusedCopiesGo(w.db, T, soon()));
  assert.equal(result, 0);
  assert.deepEqual([w.file(file.id).copy_state, Boolean(w.file(file.id).media_ref)], ["here", true]);
  assert.deepEqual(platformSaw(web).deleted, []);
  assert.equal(w.shelfRow(file.id).state, "checked", "its row is as it was");
  assert.deepEqual(eventsOf(lines, "shelf_copy_lost"), [], "no answer is not a loss");
});

test("only what something can give back is ever chosen: never an upload, a made video with no checked copy, or one being shelved", async () => {
  const upload = videoRow({ source: "upload", ready_at: daysAgo(21), created_at: daysAgo(21) });
  const bare = old();
  const saving = old();
  const web = theWeb();
  const w = theWorld({ files: [upload, bare, saving], kept: [[saving.id, videoBytes(3)]] });
  // One whose copy is on its way to the shelf and not yet there.
  w.tables.file_archives.push({ id: "a-1", tenant_id: T, file_id: saving.id, origin: "shelf", state: "saving" });
  w.tables.file_archive_parts.push({ id: "p-1", tenant_id: T, archive_id: "a-1", part: "video", state: "saving" });
  assert.equal(await letUnusedCopiesGo(w.db, T, soon()), 0);
  assert.equal(await makeRoom(w.db, T, 60, soon()), false, "and no room can be made of them");
  for (const file of [upload, bare, saving]) assert.equal(w.file(file.id).copy_state, "here");
  assert.deepEqual(platformSaw(web).deleted, []);
  assert.equal(w.relay.asked.length, 0, "the shelf is not even asked");
});

test("room is made of shelved videos, the least recently used first, each checked on the shelf as it goes", async () => {
  // Sixty minutes held: three made videos of twenty. A video of thirty needs two of them to go.
  const first = madeVideo({ seconds: 1200, copy_used_at: daysAgo(9), ready_at: daysAgo(9), created_at: daysAgo(9) });
  const second = madeVideo({ seconds: 1200, copy_used_at: daysAgo(5), ready_at: daysAgo(9), created_at: daysAgo(9) });
  const third = madeVideo({ seconds: 1200, copy_used_at: daysAgo(2), ready_at: daysAgo(9), created_at: daysAgo(9) });
  const web = theWeb();
  const w = theWorld({ files: [first, second, third] });
  for (const [seed, file] of [first, second, third].entries()) await shelveNow(w, file, videoBytes(seed + 1));
  // Their ids at the platform, read before they go: a copy that is away holds none.
  const oldest = [first.media_ref, second.media_ref];
  const { result, lines } = await linesOf(() => makeRoom(w.db, T, 1800, soon()));
  assert.equal(result, true);
  assert.deepEqual(
    [first, second, third].map((file) => w.file(file.id).copy_state),
    ["away", "away", "here"],
  );
  assert.deepEqual(platformSaw(web).deleted.sort(), oldest.sort());
  const [line] = eventsOf(lines, "copy_let_go");
  assert.deepEqual([line.by, line.marked, line.went, line.from_shelf, line.seconds], ["room", 2, 2, 2, 2400]);
});

test("the sweep that finishes a letting go left half done asks the shelf too", async () => {
  const file = old();
  const web = theWeb();
  const w = theWorld({ files: [file] });
  await shelvedLongAgo(w, file);
  // Marked going long ago, and its job died before the delete: the half-hourly pass finishes it.
  Object.assign(w.file(file.id), {
    copy_state: "going",
    updated_at: new Date(Date.now() - LET_GO.staleMs - 60_000).toISOString(),
  });
  w.relay.shelf.held.clear();
  const { lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(w.file(file.id).copy_state, "here", "the shelf holds nothing: it is not let go after all");
  assert.deepEqual(platformSaw(web).deleted, []);
  assert.equal(eventsOf(lines, "shelf_copy_lost").length, 1);

  // And with the shelf holding it, the same pass lets it go.
  await runShelving(w);
  Object.assign(w.file(file.id), {
    copy_state: "going",
    updated_at: new Date(Date.now() - LET_GO.staleMs - 60_000).toISOString(),
  });
  await keepCopiesMoving(w.db, Date.now());
  assert.equal(w.file(file.id).copy_state, "away");
  assert.equal(platformSaw(web).deleted.length, 1);
});
