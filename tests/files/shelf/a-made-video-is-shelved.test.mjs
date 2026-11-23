/**
 * A made video is shelved (apps/edge/lib/files/shelf/shelve.ts, the archive plan's B2): as it is made its copy on
 * Chanlytics' own shelf is begun, with its job, in one step; the job has the relay pull the video's own kept file,
 * held to the bytes and the SHA-256 taken as it was made, reads back what the shelf then holds, and only then says the
 * copy is checked. The real job runs here, over a database in memory, the relay's own handler and a bucket in memory.
 * Whatever goes wrong, the video is made and plays; what is at stake is only whether it may later step aside.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { linesOf } from "../../_log-lines.mjs";
import {
  FILE_SHELF_MINUTES_MAX,
  T,
  beginShelving,
  fileMadePathOf,
  madeVideo,
  realFetch,
  runShelving,
  setPg,
  shaOf,
  shelfWorld,
  shelveJob,
  videoBytes,
} from "./_world.mjs";

let open = null;
/** A world, closed after its case so the next one's web is its own. */
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

const BYTES = videoBytes(1);
const SHA = shaOf(BYTES);
const made = (file, bytes = BYTES) => ({ tenantId: T, fileId: file.id, bytes: bytes.length, sha256: shaOf(bytes) });
const eventsOf = (lines, event) => lines.filter((line) => line.event === event);

test("a made video's copy is begun with its job, pulled from its own kept file, read back, and only then checked", async () => {
  const file = madeVideo({ seconds: 32 });
  const w = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  await beginShelving(w.db, made(file));
  assert.equal(w.shelfRow(file.id).state, "saving");
  assert.deepEqual(
    [w.shelfPiece(file.id).shelf_key, w.shelfPiece(file.id).bytes, w.shelfPiece(file.id).sha256],
    [`${T}/${file.id}/video`, BYTES.length, SHA],
  );
  assert.equal(w.shelveJobs().length, 1, "its job was written with its row, by the door");
  assert.equal(w.asked.find((a) => a.door === "file_shelf_begin").p_seconds_max, FILE_SHELF_MINUTES_MAX * 60);

  const { result, lines } = await linesOf(() => runShelving(w));
  assert.deepEqual(result, [{ shelved: "checked" }]);
  assert.deepEqual(new Uint8Array(w.onShelf(file.id).bytes), BYTES, "the shelf holds the video's own bytes");
  assert.equal(w.shelfRow(file.id).state, "checked");
  assert.equal(w.shelfPiece(file.id).state, "checked");
  // Pulled from the video's own kept file, by a link signed for a while, and from nowhere else.
  assert.deepEqual(w.storage.signed, [{ path: fileMadePathOf(T, file.id, "video"), seconds: 600 }]);
  assert.equal(w.relay.pulled.length, 1);
  // Asked in this order: what the shelf holds, the pull, what it holds now. The check is the shelf's own word.
  assert.deepEqual(
    w.relay.asked.map((ask) => ask.method),
    ["HEAD", "POST", "HEAD"],
  );
  const [line] = eventsOf(lines, "file_shelved");
  assert.deepEqual(
    [line.file, line.bytes, line.seconds, line.pulled, typeof line.took_ms],
    [file.id, BYTES.length, 32, true, "number"],
    "the line the bytes a minute are read from",
  );
});

test("where the switch is off, or the deployment has no relay, nothing is begun, and the video is as it was", async () => {
  const file = madeVideo();
  const off = theWorld({ files: [file], kept: [[file.id, BYTES]], shelfOn: false });
  await beginShelving(off.db, made(file));
  assert.equal(off.shelfRow(file.id), null);
  assert.equal(off.shelveJobs().length, 0);
  assert.equal(
    off.asked.some((a) => a.door === "file_shelf_begin"),
    false,
  );
  off.close();

  const w = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  const relayUrl = process.env.FOOTAGE_RELAY_URL;
  delete process.env.FOOTAGE_RELAY_URL;
  try {
    await beginShelving(w.db, made(file));
  } finally {
    process.env.FOOTAGE_RELAY_URL = relayUrl;
  }
  assert.equal(w.shelfRow(file.id), null);
  assert.equal(w.shelveJobs().length, 0);
});

test("a video that does not fit the shelf's room is not shelved, says so once, and is still a video", async () => {
  // 299 minutes and 30 seconds are on the shelf. A video of 30 seconds fits; one of 31 does not.
  const full = madeVideo({ seconds: FILE_SHELF_MINUTES_MAX * 60 - 30 });
  const fits = madeVideo({ seconds: 30 });
  const over = madeVideo({ seconds: 31 });
  for (const [file, begun] of [
    [over, false],
    [fits, true],
  ]) {
    const w = theWorld({ files: [full, file], kept: [[full.id, videoBytes(2)]] });
    await beginShelving(w.db, made(full, videoBytes(2)));
    const { lines } = await linesOf(() => beginShelving(w.db, made(file)));
    assert.equal(Boolean(w.shelfRow(file.id)), begun);
    assert.equal(
      w.shelveJobs().some((job) => job.payload.file_id === file.id),
      begun,
    );
    assert.deepEqual(
      eventsOf(lines, "file_shelve_failed").map((line) => [line.level, line.file, line.why]),
      begun ? [] : [["warn", file.id, "shelf_full"]],
    );
    assert.equal(w.file(file.id).copy_state, "here");
    w.close();
  }
});

test("a job run again finds the video already on the shelf and pulls nothing: a run that died after its put loses no work", async () => {
  const file = madeVideo();
  const w = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  await beginShelving(w.db, made(file));
  const [job] = w.shelveJobs();
  // The first run put the bytes and died before it said so: the object is there, the row still saving.
  await shelveJob(w, job);
  Object.assign(w.shelfRow(file.id), { state: "saving", checked_at: null });
  Object.assign(w.shelfPiece(file.id), { state: "saving", checked_at: null });
  const pulls = w.relay.pulled.length;

  const { result, lines } = await linesOf(() => shelveJob(w, job));
  assert.deepEqual(result, { shelved: "checked" });
  assert.equal(w.relay.pulled.length, pulls, "no second pull");
  assert.equal(w.shelfRow(file.id).state, "checked");
  assert.equal(eventsOf(lines, "file_shelved")[0].pulled, false);
  // And a third run, of a copy already checked: nothing to do.
  assert.deepEqual(await shelveJob(w, job), { skipped: "its copy is checked" });
  // Two runs at once, both past the first read: the same bytes are put twice under one key, and one row is checked.
  const twice = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  await beginShelving(twice.db, made(file));
  const [again] = twice.shelveJobs();
  assert.deepEqual(await Promise.all([shelveJob(twice, again), shelveJob(twice, again)]), [
    { shelved: "checked" },
    { shelved: "checked" },
  ]);
  assert.equal(twice.relay.shelf.held.size, 1);
  assert.equal(twice.tables.file_archives.length, 1);
});

test("a kept file of other bytes is sent once more, then the copy fails as a mismatch and nothing is on the shelf", async () => {
  const file = madeVideo();
  const other = videoBytes(9);
  // The bucket holds other bytes than the ones the video was made of: the shelf itself refuses them.
  const w = theWorld({ files: [file], kept: [[file.id, other]] });
  await beginShelving(w.db, { tenantId: T, fileId: file.id, bytes: other.length, sha256: SHA });
  const { result, lines } = await linesOf(() => runShelving(w));
  assert.deepEqual(result, [{ shelved: "failed:mismatch" }]);
  assert.equal(w.relay.pulled.length, 2, "sent once more (FR-11.3), and no third time");
  assert.equal(w.onShelf(file.id), undefined);
  assert.deepEqual([w.shelfRow(file.id).state, w.shelfRow(file.id).why], ["failed", "mismatch"]);
  assert.deepEqual(
    eventsOf(lines, "file_shelve_failed").map((line) => [line.level, line.why]),
    [
      ["error", "mismatch"],
      ["error", "mismatch"],
    ],
  );
  assert.equal(w.file(file.id).copy_state, "here", "the video plays as it did");

  // A first sending that did not match and a second that did: checked.
  const mends = theWorld({ files: [file], kept: [[file.id, other]] });
  await beginShelving(mends.db, made(file));
  const [job] = mends.shelveJobs();
  let sends = 0;
  const pull = mends.relay.answer;
  mends.relay.answer = (url, init) => {
    // The bucket's file is put right between the two sendings.
    if (init?.method === "POST" && ++sends === 2) mends.files.set(fileMadePathOf(T, file.id, "video"), BYTES);
    return pull(url, init);
  };
  assert.deepEqual(await shelveJob(mends, job), { shelved: "checked" });
  assert.equal(sends, 2);

  // No time left in the run for a second sending: it throws, and the ledger's next try sends it.
  const late = theWorld({ files: [file], kept: [[file.id, other]] });
  await beginShelving(late.db, { tenantId: T, fileId: file.id, bytes: other.length, sha256: SHA });
  await assert.rejects(() => shelveJob(late, late.shelveJobs()[0], Date.now() + 10_000), /no time to send it again/);
  assert.equal(late.relay.pulled.length, 1);
  assert.equal(late.shelfRow(file.id).state, "saving", "still saving: its job is tried again");
});

test("a video with no kept file fails as not found, at once and for good, and nothing is pulled", async () => {
  const file = madeVideo();
  const w = theWorld({ files: [file] });
  await beginShelving(w.db, made(file));
  const { result, lines } = await linesOf(() => runShelving(w));
  assert.deepEqual(result, [{ shelved: "failed:not_found" }]);
  assert.deepEqual([w.shelfRow(file.id).state, w.shelfRow(file.id).why], ["failed", "not_found"]);
  assert.equal(w.relay.pulled.length, 0);
  assert.deepEqual(
    eventsOf(lines, "file_shelve_failed").map((line) => [line.level, line.why]),
    [["error", "not_found"]],
  );
  // The bucket not answering is not "no file": the job is tried again.
  const silent = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  await beginShelving(silent.db, made(file));
  silent.storage.signFails = "the bucket gave no answer";
  await assert.rejects(() => shelveJob(silent, silent.shelveJobs()[0]), /could not be signed/);
  assert.equal(silent.shelfRow(file.id).state, "saving");
});

test("a relay that gives no answer, has no shelf, or cannot read the file is a throw: the job is tried again, the copy stays saving", async () => {
  const file = madeVideo();
  // No answer at all.
  const down = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  await beginShelving(down.db, made(file));
  down.relay.state.down = true;
  await assert.rejects(() => shelveJob(down, down.shelveJobs()[0]), /the shelf gave no answer/);
  assert.equal(down.shelfRow(file.id).state, "saving");
  down.close();
  resetBreakers();
  // A Worker bound to no bucket.
  const unbound = theWorld({ files: [file], kept: [[file.id, BYTES]], bucket: null });
  await beginShelving(unbound.db, made(file));
  await assert.rejects(() => shelveJob(unbound, unbound.shelveJobs()[0]), /the shelf gave no answer/);
  unbound.close();
  resetBreakers();
  // The pull's own failure: the file is there when its link is signed, and gone when the relay reads it.
  const flaky = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  await beginShelving(flaky.db, made(file));
  const sign = flaky.db.storage.from().createSignedUrl;
  const signed = await sign(fileMadePathOf(T, file.id, "video"), 600);
  flaky.db.storage = { from: () => ({ createSignedUrl: async () => signed }) };
  flaky.files.clear();
  await assert.rejects(() => shelveJob(flaky, flaky.shelveJobs()[0]), /did not take the video \(source\)/);
  assert.equal(flaky.shelfRow(file.id).state, "saving");
  assert.equal(flaky.onShelf(file.id), undefined);
});

test("a file removed before its job runs, or while its pull runs, leaves nothing on the shelf", async () => {
  // Removed before the run: nothing is pulled, and the copy stops saying it is on its way.
  const file = madeVideo();
  const before = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  await beginShelving(before.db, made(file));
  before.file(file.id).removed_at = new Date().toISOString();
  assert.deepEqual(await shelveJob(before, before.shelveJobs()[0]), { skipped: "the file was removed" });
  assert.equal(before.relay.pulled.length, 0);
  assert.equal(before.onShelf(file.id), undefined);
  assert.deepEqual([before.shelfRow(file.id).state, before.shelfRow(file.id).why], ["failed", "refused"]);
  before.close();

  // Removed while the relay pulls: the object that landed is taken off again before the job ends.
  const during = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  during.file(file.id).removed_at = null;
  await beginShelving(during.db, made(file));
  const answer = during.relay.answer;
  during.relay.answer = async (url, init) => {
    const reply = await answer(url, init);
    if (init?.method === "POST") during.file(file.id).removed_at = new Date().toISOString();
    return reply;
  };
  assert.deepEqual(await shelveJob(during, during.shelveJobs()[0]), { skipped: "the file was removed" });
  assert.equal(during.onShelf(file.id), undefined, "what landed was taken off again");
  assert.equal(during.shelfRow(file.id).state, "failed");
  assert.equal(during.relay.asked.at(-1).method, "DELETE");
  during.close();

  // Purged already, its rows gone with it: nothing to do, and nothing is asked of the shelf.
  const purged = theWorld({ files: [], kept: [] });
  assert.deepEqual(await shelveJob(purged, { tenant_id: T, payload: { file_id: file.id } }), {
    skipped: "no shelf copy",
  });
  assert.equal(purged.relay.asked.length, 0);
});

test("a copy that is not saving is none of the job's: checked, failed, or another workspace's", async () => {
  const file = madeVideo();
  const w = theWorld({ files: [file], kept: [[file.id, BYTES]] });
  await beginShelving(w.db, made(file));
  Object.assign(w.shelfRow(file.id), { state: "failed", why: "refused" });
  assert.deepEqual(await shelveJob(w, w.shelveJobs()[0]), { skipped: "its copy is failed" });
  assert.equal(w.relay.asked.length, 0);
});
