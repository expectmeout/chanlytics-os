/**
 * A return that met a repair resumes by itself (00729 `file_shelf_checked`, with apps/edge/lib/files/copy/
 * bring-back.ts and shelf/shelve.ts; lane 1 of the "Prove it works" plan). Play on a made video that stepped aside
 * asks the shelf, at that moment, whether it holds the video's bytes. Where it does not, the copy is put back from
 * the video's own kept file and the return waits. Nothing asked again once the copy was back: the video stayed away
 * until a person pressed Play a second time, and a post, an ad or AI that had asked never did.
 *
 * The copy's own check now puts that return back on the ledger, in the step that says the copy is checked, so there
 * is no moment between the two for a run to die in. Each case here kills the shelving's run at one of its steps, with
 * the video platform and the shelf faked, and the real door, return and shelving run over the relay's own handler.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import {
  T,
  daysAgo,
  ensureCopy,
  letUnusedCopiesGo,
  madeVideo,
  platformSaw,
  realFetch,
  runReturns,
  runShelving,
  setPg,
  shelfWorld,
  shelveJob,
  shelveNow,
  theSync,
  theWeb,
  videoBytes,
} from "./_world.mjs";

let open = null;
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
const waiting = (w) => w.returns().filter((job) => job.state === "scheduled" && !job.ran);

/**
 * One made video, shelved, stepped aside, then asked for (`purpose`) while the shelf holds nothing of it: its copy is
 * being put back from its kept file, and its return was left waiting. The return's job has ended, as the ledger ends
 * one that ran.
 */
async function askedWhileLost(purpose = "play") {
  const file = madeVideo({ ready_at: daysAgo(21), created_at: daysAgo(21), copy_used_at: daysAgo(21) });
  const web = theWeb();
  theSync();
  open = shelfWorld({ files: [file] });
  const w = open;
  await shelveNow(w, file, videoBytes(1));
  assert.equal(await letUnusedCopiesGo(w.db, T, soon()), 1);
  w.relay.shelf.held.clear();
  assert.equal((await ensureCopy(w.db, T, file.id, purpose)).copy, "returning");
  assert.deepEqual(await runReturns(w), [{ returned: "waits:unreadable" }]);
  for (const job of w.returns()) job.state = "done";
  assert.deepEqual([w.file(file.id).copy_state, w.file(file.id).copy_why], ["away", "unreadable"]);
  assert.equal(w.shelfRow(file.id).state, "saving", "its copy is being put back");
  return { w, web, file, row: () => w.file(file.id) };
}

test("the copy is back on the shelf: the return that waited on it goes back on the ledger by itself, and the video comes back", async () => {
  const { w, web, file, row } = await askedWhileLost();
  assert.deepEqual(waiting(w), [], "nothing is asking for it now");
  assert.deepEqual(await runShelving(w), [{ shelved: "checked" }]);
  const again = waiting(w);
  assert.equal(again.length, 1, "its return is on the ledger again, written with the check");
  assert.deepEqual([again[0].kind, again[0].tenant_id, again[0].payload], ["copy_return", T, { file_id: file.id }]);
  // Nobody presses anything: the job runs, and the platform is sent to the shelf.
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.equal(platformSaw(web).asked, 1);
  assert.equal(row().copy_state, "returning");
});

for (const purpose of ["piece", "publish", "ad", "prefetch"])
  test(`the same serves whoever asked through the door: ${purpose}`, async () => {
    const { w, web } = await askedWhileLost(purpose);
    await runShelving(w);
    assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
    assert.equal(platformSaw(web).asked, 1);
  });

test("the shelving dies before its check: run again, it checks the copy and the return resumes once", async () => {
  const { w, web, file } = await askedWhileLost();
  // The database gives no answer to the check, once: the bytes are on the shelf, and the row still says saving.
  const ask = w.db.rpc.bind(w.db);
  let dying = true;
  w.db.rpc = (name, args) => {
    if (name !== "file_shelf_checked" || !dying) return ask(name, args);
    dying = false;
    return Promise.resolve({ data: null, error: { message: "connection terminated", code: "08006" } });
  };
  const [job] = w.shelveJobs().filter((j) => j.state === "scheduled");
  await assert.rejects(() => shelveJob(w, job), /cannot check the video's shelf copy/);
  assert.ok(w.onShelf(file.id), "the pull landed");
  assert.equal(w.shelfRow(file.id).state, "saving");
  assert.deepEqual(waiting(w), [], "nothing was said checked, so nothing resumed");
  // The ledger runs the job again: the shelf already holds the bytes, so nothing is pulled, and the check lands.
  assert.deepEqual(await shelveJob(w, job), { shelved: "checked" });
  assert.equal(waiting(w).length, 1);
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.equal(platformSaw(web).asked, 1);
});

test("the shelving dies right after its check: the return is already on the ledger, and a second run adds none", async () => {
  const { w, web, file } = await askedWhileLost();
  // The check lands in the database, and its answer never reaches the job.
  const ask = w.db.rpc.bind(w.db);
  let dying = true;
  w.db.rpc = async (name, args) => {
    const answer = await ask(name, args);
    if (name !== "file_shelf_checked" || !dying) return answer;
    dying = false;
    return { data: null, error: { message: "connection terminated", code: "08006" } };
  };
  const [job] = w.shelveJobs().filter((j) => j.state === "scheduled");
  await assert.rejects(() => shelveJob(w, job), /cannot check the video's shelf copy/);
  assert.equal(w.shelfRow(file.id).state, "checked", "the check landed");
  assert.equal(waiting(w).length, 1, "and the return with it, in the same step: there is no moment between them");
  // The ledger runs the shelving again: its copy is checked already, and no second return is written.
  assert.deepEqual(await shelveJob(w, job), { skipped: "its copy is checked" });
  assert.equal(waiting(w).length, 1);
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.equal(platformSaw(web).asked, 1, "asked of the platform once");
});

test("a video nobody asked for is not brought back because its copy was mended", async () => {
  const file = madeVideo({ ready_at: daysAgo(21), created_at: daysAgo(21), copy_used_at: daysAgo(21) });
  const web = theWeb();
  theSync();
  open = shelfWorld({ files: [file] });
  const w = open;
  await shelveNow(w, file, videoBytes(1));
  await letUnusedCopiesGo(w.db, T, soon());
  // Its copy is put back for another reason (the shelf was found to hold nothing), and no one has asked for the video.
  w.relay.shelf.held.clear();
  await w.db.rpc("file_shelf_again", { p_tenant_id: T, p_file_id: file.id });
  assert.deepEqual(await runShelving(w), [{ shelved: "checked" }]);
  assert.deepEqual(w.returns(), [], "it stays away: it steps back in only when something wants it");
  assert.deepEqual([w.file(file.id).copy_state, w.file(file.id).copy_why], ["away", null]);
  assert.equal(platformSaw(web).asked, 0);
});

test("a copy that comes back as other bytes resumes nothing, and the video says it is lost", async () => {
  const { w, web, file, row } = await askedWhileLost();
  // The kept file now holds other bytes than the video's: the shelf refuses them twice, and the copy fails.
  w.files.set([...w.files.keys()][0], videoBytes(9));
  assert.deepEqual(await runShelving(w), [{ shelved: "failed:mismatch" }]);
  assert.deepEqual(waiting(w), []);
  assert.deepEqual([row().copy_state, row().copy_why], ["lost", "no_origin"]);
  assert.equal(platformSaw(web).asked, 0);
  assert.ok(file.id);
});
