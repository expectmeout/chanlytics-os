/**
 * What the shelf really holds is what its rows say (apps/edge/lib/files/shelf/holds.ts in the half-hourly pass, over
 * the relay's list; lane 1 of the "Prove it works" plan, item 6). Every other check asks the shelf about one video at
 * the moment something leans on it; nothing ever asked the shelf what it holds. So an object no row names stayed for
 * good, and a row that said checked with nothing behind it was found only on the day its video was wanted.
 *
 * The pass now compares, a few workspaces at a time: on the shelf with no row is taken off, and a checked row with
 * nothing behind it is put back from the video's own kept file. Nothing is judged by half an answer: a relay that
 * cannot list (down, or older than the list) changes nothing. And a removed file leaves nothing on the shelf, even
 * when it is removed while its copy is landing and the run that put it dies.
 *
 * The real pass, shelving and purge run here, over a database in memory and the relay's own handler over a bucket in
 * memory.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { linesOf } from "../../_log-lines.mjs";
import {
  T,
  TICKET_KEY,
  beginShelving,
  keepCopiesMoving,
  keepShelfTrue,
  madeVideo,
  realFetch,
  runShelving,
  setPg,
  shaOf,
  shelfWorld,
  shelveJob,
  shelveNow,
  theWeb,
  videoBytes,
} from "./_world.mjs";

const { fileJobs } = await import(at("apps/edge/lib/files/upkeep.ts"));
const { readShelfTicket } = await import(at("apps/relay/src/ticket.ts"));

let open = null;
let fetchBefore = null;
function theWorld(options) {
  open = shelfWorld(options);
  return open;
}
afterEach(() => {
  if (fetchBefore) globalThis.fetch = fetchBefore;
  fetchBefore = null;
  open?.close();
  open = null;
  resetBreakers();
});
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});

const OTHER_WORKSPACE = "bbbbbbbb-0000-4000-8000-000000000002";
const eventsOf = (lines, event) => lines.filter((line) => line.event === event);
const keyOf = (fileId, tenant = T) => `${tenant}/${fileId}/video`;
/** An object put straight on the shelf, as a put that outlived its row would leave one. */
const strand = (w, fileId, tenant = T) =>
  w.relay.shelf.held.set(keyOf(fileId, tenant), { bytes: Buffer.from(videoBytes(5)), sha256: shaOf(videoBytes(5)) });
const listsAsked = (w) => w.relay.asked.filter((ask) => new URL(ask.url).pathname === "/shelf/list");
const purgeJob = (file) => ({
  id: "j1",
  kind: "file_purge",
  tenant_id: T,
  payload: { file_id: file.id, why: "remove" },
});
/** The relay's answer to one kind of ask, written by the case; every other ask is answered as it is. */
function relayAnswers(w, when, answer) {
  fetchBefore = globalThis.fetch;
  const send = fetchBefore;
  globalThis.fetch = async (url, init = {}) =>
    when(String(url), init) ? answer(String(url), init, send) : send(url, init);
}
const isList = (url) => new URL(url).pathname === "/shelf/list";

test("an object no row names is taken off the shelf, and every object a row names stays", async () => {
  const file = madeVideo();
  theWeb();
  const w = theWorld({ files: [file] });
  await shelveNow(w, file, videoBytes(1));
  const orphan = randomUUID();
  strand(w, orphan);

  const { result, lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(result.held, 1);
  assert.equal(w.onShelf(orphan), undefined, "what no row names is gone");
  assert.ok(w.onShelf(file.id), "what a row names is as it was");
  assert.equal(w.shelfRow(file.id).state, "checked");
  assert.deepEqual(
    eventsOf(lines, "file_shelve_failed").map((line) => [line.level, line.why, line.file, line.gone]),
    [["warn", "unheld", orphan, true]],
  );
  // Asked under a ticket for this workspace alone, in the header.
  const [asked] = listsAsked(w);
  const ticket = await readShelfTicket(TICKET_KEY, asked.headers.authorization.slice("Bearer ".length), Date.now());
  assert.deepEqual([ticket.ok, ticket.tenant, ticket.file, ticket.use], [true, T, null, "list"]);
  // The next pass finds the shelf and the rows agreed, and changes nothing.
  const again = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(again.result.held, 0);
  assert.deepEqual(eventsOf(again.lines, "file_shelve_failed"), []);
});

test("a row that says checked with nothing behind it is put back from the kept file, and said once", async () => {
  const file = madeVideo();
  theWeb();
  const w = theWorld({ files: [file] });
  await shelveNow(w, file, videoBytes(1));
  // The object is gone though its row says checked. It must never happen; this is what the pass does if it does.
  w.relay.shelf.held.clear();

  const { result, lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(result.held, 1);
  assert.equal(w.shelfRow(file.id).state, "saving", "its copy is being put back");
  assert.equal(w.shelveJobs().filter((job) => job.state === "scheduled").length, 1, "with its job");
  assert.deepEqual(
    eventsOf(lines, "shelf_copy_lost").map((line) => [line.level, line.file, line.found, line.again]),
    [["error", file.id, "nothing", true]],
  );
  assert.deepEqual([w.file(file.id).copy_state, Boolean(w.file(file.id).media_ref)], ["here", true], "it plays on");
  // While it is on its way back, the pass leaves it alone; once it is there, the shelf and its rows agree.
  const during = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.deepEqual([during.result.held, eventsOf(during.lines, "shelf_copy_lost").length], [0, 0]);
  assert.deepEqual(await runShelving(w), [{ shelved: "checked" }]);
  assert.deepEqual(new Uint8Array(w.onShelf(file.id).bytes), videoBytes(1));
  assert.equal((await keepCopiesMoving(w.db, Date.now())).held, 0);
});

test("nothing on its way is judged: a copy still saving, an object whose row is saving, a copy begun as the list was read", async () => {
  const saving = madeVideo();
  const landed = madeVideo();
  const late = madeVideo();
  theWeb();
  const w = theWorld({
    files: [saving, landed, late],
    kept: [
      [saving.id, videoBytes(1)],
      [landed.id, videoBytes(2)],
      [late.id, videoBytes(3)],
    ],
  });
  // A copy begun whose bytes have not been put yet: a row, and nothing on the shelf.
  await beginShelving(w.db, {
    tenantId: T,
    fileId: saving.id,
    bytes: videoBytes(1).length,
    sha256: shaOf(videoBytes(1)),
  });
  // A copy whose bytes landed and whose check has not run: an object, and a row still saving.
  await beginShelving(w.db, {
    tenantId: T,
    fileId: landed.id,
    bytes: videoBytes(2).length,
    sha256: shaOf(videoBytes(2)),
  });
  strand(w, landed.id);
  // And one begun between the pass's read of the rows and its read of the list: its object is listed, its row was not read.
  relayAnswers(w, isList, async (url, init, send) => {
    await beginShelving(w.db, {
      tenantId: T,
      fileId: late.id,
      bytes: videoBytes(3).length,
      sha256: shaOf(videoBytes(3)),
    });
    strand(w, late.id);
    return send(url, init);
  });
  const { result, lines } = await linesOf(() => keepShelfTrue(w.db, Date.now()));
  assert.equal(result, 0);
  assert.ok(w.onShelf(landed.id), "an object whose row is saving is its row's");
  assert.ok(w.onShelf(late.id), "an object whose row came after the rows were read is asked about again, and kept");
  assert.deepEqual(
    [saving, landed, late].map((file) => w.shelfRow(file.id).state),
    ["saving", "saving", "saving"],
  );
  assert.deepEqual(eventsOf(lines, "file_shelve_failed"), []);
  assert.deepEqual(eventsOf(lines, "shelf_copy_lost"), []);
});

test("a relay that cannot say what it holds changes nothing: down, older than the list, or half a list", async () => {
  const file = madeVideo();
  theWeb();
  const w = theWorld({ files: [file] });
  await shelveNow(w, file, videoBytes(1));
  const orphan = randomUUID();
  strand(w, orphan);
  const untouched = () => {
    assert.ok(w.onShelf(orphan), "nothing is taken off on no answer");
    assert.equal(w.shelfRow(file.id).state, "checked", "and no row is moved");
  };

  // An older relay knows no such path: the app deployed ahead of the relay's own deploy.
  relayAnswers(w, isList, () => new Response(JSON.stringify({ error: "request", reason: "path" }), { status: 404 }));
  const older = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(older.result.held, 0);
  assert.deepEqual(eventsOf(older.lines, "files_sweep_failed"), [], "not an error: the relay is only not there yet");
  untouched();
  globalThis.fetch = fetchBefore;

  // The first page whole and the second lost: what the second would have named must not read as missing.
  w.relay.shelf.held.delete(keyOf(file.id));
  let pages = 0;
  relayAnswers(w, isList, () =>
    ++pages === 1
      ? new Response(JSON.stringify({ files: [orphan], other: 0, more: true, cursor: "next" }), { status: 200 })
      : new Response(JSON.stringify({ error: "shelf", reason: "unreachable" }), { status: 502 }),
  );
  const half = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(half.result.held, 0);
  untouched();
  assert.deepEqual(eventsOf(half.lines, "shelf_copy_lost"), []);
  globalThis.fetch = fetchBefore;
  resetBreakers();

  // No answer at all.
  w.relay.state.down = true;
  assert.equal((await keepCopiesMoving(w.db, Date.now())).held, 0);
  untouched();
});

test("only what is this workspace's and understood is touched: another's objects, a stray key and a removed file's copy are left", async () => {
  const file = madeVideo();
  const removed = madeVideo();
  theWeb();
  const w = theWorld({ files: [file, removed] });
  await shelveNow(w, file, videoBytes(1));
  await shelveNow(w, removed, videoBytes(2));
  // Another workspace's object, under its own name: this workspace's ticket lists nothing of it.
  strand(w, randomUUID(), OTHER_WORKSPACE);
  // A key under this workspace's name that is no file's.
  w.relay.shelf.held.set(`${T}/notes`, { bytes: Buffer.from("x"), sha256: "0".repeat(64) });
  // A removed file whose purge has taken its object and not yet its rows.
  w.file(removed.id).removed_at = new Date().toISOString();
  w.relay.shelf.held.delete(keyOf(removed.id));

  const { result, lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.equal(result.held, 0);
  assert.equal(w.relay.shelf.held.size, 3, "this workspace's video, the other workspace's, and the stray key");
  assert.equal(w.shelfRow(removed.id).state, "checked", "a removed file's copy is its purge's to take, not put back");
  assert.deepEqual(eventsOf(lines, "shelf_copy_lost"), [], "and it is not said lost");
  assert.deepEqual(
    eventsOf(lines, "file_shelve_failed").map((line) => [line.why, line.keys]),
    [["unknown_keys", 1]],
    "a key that is no file's is said, never touched",
  );
});

test("the step has a time: once it has come, no workspace is begun and nothing on the shelf is touched", async () => {
  const file = madeVideo();
  theWeb();
  const w = theWorld({ files: [file] });
  await shelveNow(w, file, videoBytes(1));
  const orphan = randomUUID();
  strand(w, orphan);
  // A pass that began long ago: this step's time is spent before its first workspace.
  assert.equal(await keepShelfTrue(w.db, Date.now() - 60_000), 0);
  assert.deepEqual(listsAsked(w), [], "the shelf is not even asked");
  assert.ok(w.onShelf(orphan));
  // In its time, the same shelf is mended.
  assert.equal(await keepShelfTrue(w.db, Date.now()), 1);
  assert.equal(w.onShelf(orphan), undefined);
});

test("a few workspaces a pass, and every workspace in its turn; one whose switch is off is never asked about", async () => {
  theWeb();
  const w = theWorld({ files: [] });
  const on = Array.from({ length: 24 }, (_, i) => `cccccccc-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  for (const tenant of on)
    w.tables.tenant_config.push({ tenant_id: tenant, config: { features: { video_shelf: true } } });
  const off = "dddddddd-0000-4000-8000-000000000001";
  w.tables.tenant_config.push({ tenant_id: off, config: { features: { video_shelf: false } } });
  const seen = new Set();
  const slot = 10 * 60_000;
  const start = Math.floor(Date.now() / slot) * slot;
  for (let pass = 0; pass < 60; pass += 1) {
    const before = listsAsked(w).length;
    await keepShelfTrue(w.db, start + pass * 3 * slot);
    const asked = listsAsked(w).slice(before);
    assert.ok(asked.length <= 10, `no more than ten workspaces a pass, not ${asked.length}`);
    for (const ask of asked) {
      const ticket = await readShelfTicket(TICKET_KEY, ask.headers.authorization.slice("Bearer ".length), Date.now());
      seen.add(ticket.tenant);
    }
  }
  assert.deepEqual([...seen].sort(), [T, ...on].sort(), "every workspace whose shelf is on, and no other");
  assert.ok(!seen.has(off));
});

test("a file removed while its copy is landing leaves nothing on the shelf, even when the run that put it dies", async () => {
  const BYTES = videoBytes(4);
  /** A made video whose copy is begun, removed as the relay stores its bytes; the put's answer never reaches the job. */
  async function removedWhileLanding() {
    const file = madeVideo();
    theWeb();
    const w = theWorld({ files: [file], kept: [[file.id, BYTES]] });
    await beginShelving(w.db, { tenantId: T, fileId: file.id, bytes: BYTES.length, sha256: shaOf(BYTES) });
    const answer = w.relay.answer;
    let dying = true;
    w.relay.answer = async (url, init) => {
      const reply = await answer(url, init);
      if (init?.method !== "POST" || !dying) return reply;
      dying = false;
      w.file(file.id).removed_at = new Date().toISOString();
      throw new Error("socket hang up");
    };
    const [job] = w.shelveJobs();
    await assert.rejects(() => shelveJob(w, job), /the shelf did not take the video/);
    assert.ok(w.onShelf(file.id), "the bytes landed, and the run that put them is dead");
    assert.equal(w.shelfRow(file.id).state, "saving");
    resetBreakers();
    return { w, file, job };
  }

  // The ledger runs the job again: the file is gone, so what landed is taken off, and the copy says it was refused.
  const again = await removedWhileLanding();
  assert.deepEqual(await shelveJob(again.w, again.job), { skipped: "the file was removed" });
  assert.equal(again.w.onShelf(again.file.id), undefined);
  assert.deepEqual([again.w.shelfRow(again.file.id).state, again.w.shelfRow(again.file.id).why], ["failed", "refused"]);
  again.w.close();

  // The job never runs again: the purge, ten minutes after the removal, takes the object whatever its row says.
  const never = await removedWhileLanding();
  await fileJobs(never.w.db).purge(purgeJob(never.file));
  assert.equal(never.w.onShelf(never.file.id), undefined, "nothing of it is on the shelf");
  assert.equal(never.w.file(never.file.id), undefined, "and its rows are gone");
  assert.equal(never.w.shelfRow(never.file.id), null);
  never.w.close();

  // And where bytes land after the purge has been and gone, against every bound on a put: no row names them, so the
  // pass that compares the shelf with its rows takes them off.
  const late = await removedWhileLanding();
  late.w.relay.shelf.held.clear();
  await fileJobs(late.w.db).purge(purgeJob(late.file));
  strand(late.w, late.file.id);
  const { result, lines } = await linesOf(() => keepCopiesMoving(late.w.db, Date.now()));
  assert.equal(result.held, 1);
  assert.equal(late.w.relay.shelf.held.size, 0, "the shelf holds nothing of a file that is gone");
  assert.deepEqual(
    eventsOf(lines, "file_shelve_failed").map((line) => [line.why, line.file, line.gone]),
    [["unheld", late.file.id, true]],
  );
});
