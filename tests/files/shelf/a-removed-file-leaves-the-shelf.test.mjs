/**
 * A removed file takes its shelf copy with it, and nothing is left saving for good (apps/edge/lib/files/upkeep.ts
 * and copy/sweep.ts, the archive plan's B2). The purge that lets a removed file's bytes go lets its copy on
 * Chanlytics' own shelf go too, whatever state that copy's row is in, and holds the file's row until the shelf says
 * it did. Nothing leaves the shelf before the purge: Undo's ten minutes are whole. And the half-hourly pass writes
 * the job again for a copy left saving with none, which is the floor under the doors that write it themselves.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import {
  T,
  beginShelving,
  keepCopiesMoving,
  madeVideo,
  platformSaw,
  realFetch,
  setPg,
  shaOf,
  shelfWorld,
  shelveNow,
  theWeb,
  videoBytes,
  videoRow,
} from "./_world.mjs";

const { fileJobs } = await import(at("apps/edge/lib/files/upkeep.ts"));

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

const purgeJob = (file) => ({
  id: "j1",
  kind: "file_purge",
  tenant_id: T,
  payload: { file_id: file.id, why: "remove" },
});
const HOUR = 3_600_000;

test("a purged video's copy leaves the shelf with it, and nothing leaves before the purge", async () => {
  const file = madeVideo();
  const web = theWeb();
  const w = theWorld({ files: [file] });
  await shelveNow(w, file, videoBytes(1));
  const ref = file.media_ref;
  // Removed: hidden at once, and for ten minutes Undo can bring it back, with its shelf copy as it was.
  w.file(file.id).removed_at = new Date().toISOString();
  assert.ok(w.onShelf(file.id), "the shelf still holds it while Undo can");

  await fileJobs(w.db).purge(purgeJob(file));
  assert.equal(w.onShelf(file.id), undefined, "the shelf holds nothing of it");
  assert.equal(w.file(file.id), undefined, "its row is gone");
  assert.equal(w.shelfRow(file.id), null, "and its copy's rows with it");
  assert.deepEqual(platformSaw(web).deleted, [ref]);
  assert.equal(w.relay.asked.at(-1).method, "DELETE");
});

test("a shelf that will not say it let go holds the file's row, and the purge is tried again", async () => {
  const file = madeVideo();
  theWeb();
  const w = theWorld({ files: [file] });
  await shelveNow(w, file, videoBytes(1));
  w.file(file.id).removed_at = new Date().toISOString();
  w.relay.state.down = true;
  await assert.rejects(() => fileJobs(w.db).purge(purgeJob(file)), /the shelf kept the video/);
  assert.ok(w.file(file.id), "its row stays until the shelf's copy is gone");
  assert.ok(w.shelfRow(file.id));
  // The shelf answers again: the same job finishes it.
  w.relay.state.down = false;
  resetBreakers();
  await fileJobs(w.db).purge(purgeJob(file));
  assert.equal(w.onShelf(file.id), undefined);
  assert.equal(w.file(file.id), undefined);
});

test("a copy in any state goes with its file, and a file with no shelf copy asks the shelf nothing", async () => {
  theWeb();
  // Still saving when its file was removed: the object may or may not be there. Either way it is asked to go.
  const saving = madeVideo();
  const w = theWorld({ files: [saving], kept: [[saving.id, videoBytes(2)]] });
  await beginShelving(w.db, {
    tenantId: T,
    fileId: saving.id,
    bytes: videoBytes(2).length,
    sha256: shaOf(videoBytes(2)),
  });
  w.file(saving.id).removed_at = new Date().toISOString();
  await fileJobs(w.db).purge(purgeJob(saving));
  assert.equal(w.file(saving.id), undefined);
  assert.equal(w.relay.asked.filter((ask) => ask.method === "DELETE").length, 1);
  w.close();

  const plain = videoRow({ source: "upload" });
  const none = theWorld({ files: [plain] });
  none.file(plain.id).removed_at = new Date().toISOString();
  await fileJobs(none.db).purge(purgeJob(plain));
  assert.equal(none.file(plain.id), undefined);
  assert.equal(none.relay.asked.length, 0, "a video with no shelf copy asks the shelf nothing");
  // And a file still in the Library is never touched by a purge that comes for it.
  const kept = madeVideo();
  none.tables.files.push(kept);
  await fileJobs(none.db).purge(purgeJob(kept));
  assert.ok(none.file(kept.id));
});

test("the half-hourly pass writes the job again for a copy left saving for an hour, and for no other", async () => {
  theWeb();
  const stale = madeVideo();
  const fresh = madeVideo();
  const live = madeVideo();
  const done = madeVideo();
  const w = theWorld({ files: [stale, fresh, live, done] });
  // One whose copy is checked already, then three begun and left as their doors leave them: saving, with a job.
  await shelveNow(w, done, videoBytes(8));
  for (const [seed, file] of [stale, fresh, live].entries())
    await beginShelving(w.db, { tenantId: T, fileId: file.id, bytes: 100, sha256: shaOf(videoBytes(seed)) });
  const jobOf = (file) => w.shelveJobs().filter((job) => job.payload.file_id === file.id);
  // The stale one's job ended and nothing settled its row; the live one's is still on the ledger.
  jobOf(stale)[0].state = "failed";
  jobOf(fresh)[0].state = "failed";
  const longAgo = new Date(Date.now() - 2 * HOUR).toISOString();
  w.shelfRow(stale.id).updated_at = longAgo;
  w.shelfRow(live.id).updated_at = longAgo;

  const said = await keepCopiesMoving(w.db, Date.now());
  assert.equal(said.shelved, 1, "the pass says how many it asked for again");
  assert.deepEqual(
    [stale, fresh, live, done].map((file) => jobOf(file).filter((job) => job.state === "scheduled").length),
    [1, 0, 1, 0],
    "the stale one gets its job; the fresh one waits; the live one has its own; the checked one needs none",
  );
  assert.equal(jobOf(live).length, 1, "no second job beside one still on the ledger");
  // Asked again at once: nothing more is written, since each is asked for once a stale stretch.
  assert.equal((await keepCopiesMoving(w.db, Date.now())).shelved, 0);
});
