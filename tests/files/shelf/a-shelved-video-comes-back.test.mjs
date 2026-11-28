/**
 * A shelved video comes back (apps/edge/lib/files/copy/bring-back.ts with shelf/check.ts, the archive plan's B2): a
 * made video whose copy stepped aside is fetched again by the video platform from Chanlytics' own shelf, through the
 * relay, under a ticket that reads that one file. The shelf is asked first, at that moment, and before any folder. No
 * Google key is asked for and nothing of a provider's day is spent. A shelf that holds nothing puts the copy back from
 * the video's own kept file, and the video is lost only when that is gone too. The real door, return, sweep and
 * webhook run here, over the relay's own handler.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { linesOf } from "../../_log-lines.mjs";
import {
  STREAM_API,
  T,
  TICKET_KEY,
  driveOf,
  ensureCopy,
  fileMadePathOf,
  letUnusedCopiesGo,
  madeVideo,
  platformSaw,
  realFetch,
  returnJob,
  runReturns,
  runShelving,
  setPg,
  shelfWorld,
  shelveNow,
  theSync,
  theWeb,
  videoBytes,
  videoRow,
  watchedClip,
  daysAgo,
} from "./_world.mjs";

const SECRET = "stream-webhook-secret-for-this-file";
process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = SECRET;
const { receiveStreamWebhook } = await import(at("apps/edge/lib/files/video-webhook.ts"));
const { readShelfTicket } = await import(at("apps/relay/src/ticket.ts"));

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

/** The platform's delivery about one video, signed as it signs one. */
function delivery(event) {
  const body = JSON.stringify(event);
  const time = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", SECRET).update(`${time}.${body}`).digest("hex");
  return new Request("https://edge.example/api/stream-webhook", {
    method: "POST",
    headers: { "webhook-signature": `time=${time},sig1=${sig}` },
    body,
  });
}
const ready = (uid, name) =>
  delivery({ uid, readyToStream: true, status: { state: "ready" }, duration: 60, meta: { name } });
const failed = (uid, name) =>
  delivery({ uid, status: { state: "error", errorReasonCode: "ERR_MALFORMED_VIDEO" }, meta: { name } });

const soon = () => Date.now() + 30_000;
const old = (over = {}) =>
  madeVideo({ ready_at: daysAgo(21), created_at: daysAgo(21), copy_used_at: daysAgo(21), ...over });
const eventsOf = (lines, event) => lines.filter((line) => line.event === event);
const askedOf = (web) => web.calls.filter((c) => c.url === `${STREAM_API}/copy`).map((c) => JSON.parse(c.body));

/** One made video, shelved, checked, and stepped aside: the world, its web, and the row. */
async function shelvedAway({ seed = 1, ...options } = {}) {
  const file = old();
  const web = theWeb();
  const sync = theSync();
  const w = theWorld({ files: [file], ...options });
  await shelveNow(w, file, videoBytes(seed));
  assert.equal(await letUnusedCopiesGo(w.db, T, soon()), 1);
  assert.equal(w.file(file.id).copy_state, "away");
  return { w, web, sync, file, row: () => w.file(file.id) };
}

test("Play brings a shelved video back from the shelf: the platform fetches it there, under a ticket that reads that file", async () => {
  const { w, web, sync, file, row } = await shelvedAway();
  const daysBefore = JSON.stringify(w.tables.source_days);
  assert.equal((await ensureCopy(w.db, T, file.id, "play")).copy, "returning");
  const { result, lines } = await linesOf(() => runReturns(w));
  assert.deepEqual(result, [{ returned: "asked" }]);
  const [asked] = askedOf(web);
  const address = new URL(asked.input);
  assert.equal(address.origin + address.pathname, `https://relay.example/shelf/${file.id}/video.mp4`);
  assert.equal(asked.meta.name, `return:${file.id}`, "named for its file, as any return's copy is");
  const ticket = await readShelfTicket(TICKET_KEY, address.searchParams.get("ticket"), Date.now());
  assert.deepEqual([ticket.ok, ticket.tenant, ticket.file, ticket.use], [true, T, file.id, "read"]);
  const hoursLeft = (ticket.expiresAt * 1000 - Date.now()) / 3_600_000;
  assert.ok(hoursLeft > 5.9 && hoursLeft <= 6, `the ticket runs six hours, as a clip's does, not ${hoursLeft}`);
  // The relay answers that address as the platform asks it: its size first, then its bytes by range.
  const head = await w.relay.answer(asked.input, { method: "HEAD" });
  assert.deepEqual([head.status, head.headers.get("content-length")], [200, String(videoBytes(1).length)]);
  const part = await w.relay.answer(asked.input, { headers: { range: "bytes=0-4095" } });
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), videoBytes(1).subarray(0, 4096));
  // Nothing of Google's: no folder opened, no key handed out, and nothing written on the provider's day.
  assert.deepEqual([...sync], []);
  assert.equal(JSON.stringify(w.tables.source_days), daysBefore);
  assert.deepEqual(
    w.unitWrites.filter((units) => units > 0),
    [],
    "no unit of Google's is counted",
  );
  assert.equal(w.asked.find((a) => a.door === "file_copy_return_begin").p_units, 0);
  assert.deepEqual(
    eventsOf(lines, "copy_return").map((line) => [line.file, line.took, line.origin]),
    [[file.id, "asked", "shelf"]],
  );
  // The platform's word finishes it, as it does a watched clip's: here again, and nothing else.
  assert.equal(row().copy_state, "returning");
  assert.equal((await receiveStreamWebhook(ready(web.copies[0].uid, `return:${file.id}`))).status, 200);
  assert.deepEqual([row().copy_state, row().media_ref], ["here", web.copies[0].uid]);
});

test("every asker joins the one return, and the job run again asks for nothing", async () => {
  const { w, web, file } = await shelvedAway();
  const answers = await Promise.all(["play", "piece", "publish", "ad"].map((why) => ensureCopy(w.db, T, file.id, why)));
  assert.deepEqual(
    answers.map((held) => held.copy),
    ["returning", "returning", "returning", "returning"],
  );
  assert.equal(w.returns().length, 1);
  await runReturns(w);
  assert.deepEqual(await returnJob(w, w.returns()[0]), { skipped: "its copy is returning" });
  assert.equal(platformSaw(web).asked, 1);
});

test("a shelf that holds nothing puts the copy back from the kept file: the video waits, and comes back by itself once it is there", async () => {
  const { w, web, file, row } = await shelvedAway();
  w.relay.shelf.held.clear();
  await ensureCopy(w.db, T, file.id, "play");
  const { result, lines } = await linesOf(() => runReturns(w));
  assert.deepEqual(result, [{ returned: "waits:unreadable" }]);
  assert.deepEqual([row().copy_state, row().copy_why], ["away", "unreadable"], "it waits: it is not lost");
  assert.equal(platformSaw(web).asked, 0, "the platform is not sent to an empty shelf");
  assert.deepEqual(
    eventsOf(lines, "shelf_copy_lost").map((line) => [line.level, line.found, line.again]),
    [["error", "nothing", true]],
  );
  assert.equal(w.shelfRow(file.id).state, "saving");
  // While it is being put back, an ask says it waits, and nothing more is begun.
  w.returns()[0].state = "done";
  await ensureCopy(w.db, T, file.id, "play");
  assert.deepEqual(await runReturns(w), [{ returned: "waits:unreadable" }]);
  assert.equal(w.shelveJobs().filter((job) => job.state === "scheduled").length, 1, "one job puts it back");
  // The job runs: the shelf holds the video again, from its own kept file, and the return that waited goes back on
  // the ledger with the check (00729): nobody presses Play a second time.
  for (const job of w.returns()) job.state = "done";
  assert.deepEqual(await runShelving(w), [{ shelved: "checked" }]);
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.equal(platformSaw(web).asked, 1);
});

test("it is lost only when the kept file is gone too, and then it says so", async () => {
  const { w, web, file, row } = await shelvedAway();
  w.relay.shelf.held.clear();
  w.files.delete(fileMadePathOf(T, file.id, "video"));
  await ensureCopy(w.db, T, file.id, "play");
  assert.deepEqual(await runReturns(w), [{ returned: "waits:unreadable" }], "first it is asked for again");
  const { result, lines } = await linesOf(() => runShelving(w));
  assert.deepEqual(result, [{ shelved: "failed:not_found" }]);
  assert.deepEqual([row().copy_state, row().copy_why], ["lost", "no_origin"], "nothing is left to give it back");
  assert.equal(eventsOf(lines, "file_shelve_failed")[0].why, "not_found");
  for (const job of w.returns()) job.state = "done";
  const held = await ensureCopy(w.db, T, file.id, "play");
  assert.deepEqual([held.copy, held.loss], ["lost", "no_origin"]);
  assert.equal(platformSaw(web).asked, 0);
});

test("a shelf that gives no answer leaves the video waiting, and the next Play asks again", async () => {
  const { w, web, file, row } = await shelvedAway();
  w.relay.state.down = true;
  await ensureCopy(w.db, T, file.id, "play");
  const { result, lines } = await linesOf(() => runReturns(w));
  assert.deepEqual(result, [{ returned: "waits:unreadable" }]);
  assert.deepEqual([row().copy_state, row().copy_why], ["away", "unreadable"]);
  assert.equal(w.shelfRow(file.id).state, "checked", "no answer is not a loss: its row is as it was");
  assert.deepEqual(eventsOf(lines, "shelf_copy_lost"), []);
  w.relay.state.down = false;
  resetBreakers();
  w.returns()[0].state = "done";
  assert.equal((await ensureCopy(w.db, T, file.id, "play")).copy, "returning");
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.equal(platformSaw(web).asked, 1);
});

test("a fetch the platform could not finish (its ticket ended, the copy unreadable) leaves it away, and the next Play signs anew", async () => {
  const { w, web, file, row } = await shelvedAway();
  await ensureCopy(w.db, T, file.id, "play");
  await runReturns(w);
  const first = askedOf(web)[0].input;
  assert.equal((await receiveStreamWebhook(failed(web.copies[0].uid, `return:${file.id}`))).status, 200);
  assert.deepEqual([row().copy_state, row().copy_why, row().media_ref], ["away", "failed", null]);
  assert.equal(w.shelfRow(file.id).state, "checked", "the shelf still holds it");
  w.returns()[0].state = "done";
  assert.equal((await ensureCopy(w.db, T, file.id, "play")).copy, "returning");
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  const second = askedOf(web)[1].input;
  assert.equal(new URL(second).pathname, new URL(first).pathname);
  assert.equal(platformSaw(web).asked, 2, "asked again, under a ticket signed for this return");
});

test("where the minutes are full of videos that cannot step aside it waits for room, and is never said lost", async () => {
  const file = old();
  const web = theWeb();
  theSync();
  // An upload of an hour fills the minutes: nothing can give it back, so nothing can be let go for the return.
  const upload = videoRow({ source: "upload", seconds: 3600 - 60, copy_used_at: daysAgo(9), ready_at: daysAgo(9) });
  const w = theWorld({ files: [file] });
  await shelveNow(w, file, videoBytes(1));
  await letUnusedCopiesGo(w.db, T, soon());
  w.tables.files.push({ ...upload, seconds: 3600 });
  await ensureCopy(w.db, T, file.id, "play");
  assert.deepEqual(await runReturns(w), [{ returned: "waits:room" }]);
  assert.deepEqual([w.file(file.id).copy_state, w.file(file.id).copy_why], ["away", "room"]);
  assert.equal(platformSaw(web).asked, 0);
});

test("a video with a shelf copy and a watched folder's item comes from the shelf, and the folder is not opened", async () => {
  const web = theWeb();
  const clip = watchedClip({ ready_at: daysAgo(21), created_at: daysAgo(21), copy_used_at: daysAgo(21) });
  const sync = theSync({ drive: driveOf(clip) });
  const w = theWorld({ files: [clip.row], items: [clip.origin] });
  // The same file is a made video with a shelf copy too, as a later step's phone video may be.
  Object.assign(w.file(clip.row.id), { source: "made" });
  await shelveNow(w, clip.row, videoBytes(4));
  await letUnusedCopiesGo(w.db, T, soon());
  await ensureCopy(w.db, T, clip.row.id, "play");
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.ok(askedOf(web)[0].input.startsWith(`https://relay.example/shelf/${clip.row.id}/video.mp4?ticket=`));
  assert.deepEqual([...sync], [], "no folder is opened where the shelf can answer");

  // And where the shelf holds nothing, the folder's own original gives it back while the shelf is filled again.
  for (const job of w.returns()) job.state = "done";
  await receiveStreamWebhook(failed(web.copies[0].uid, `return:${clip.row.id}`));
  w.relay.shelf.held.clear();
  await ensureCopy(w.db, T, clip.row.id, "play");
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.ok(
    askedOf(web)[1].input.startsWith(`https://relay.example/clip/${clip.origin.id}/`),
    "from its folder's item",
  );
  assert.equal(w.shelfRow(clip.row.id).state, "saving", "and its shelf copy is being put back");
});
