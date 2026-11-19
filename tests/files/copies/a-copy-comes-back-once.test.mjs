/**
 * A watched clip's copy brought back to the video platform (apps/edge/lib/files/copy: the door ensure.ts and the
 * job bring-back.ts; the footage sources plan, "Availability", acceptance tests 10 and 11, and the review's finding
 * 13). Play, AI and a video being made asking at once are one return. A copy coming back is here again and nothing
 * else: no digest, no look, nothing spent on AI. One that fails to come back leaves the file as it was. A word about
 * an earlier attempt's copy never settles a later one. And the relay's key door opens for a clip being brought back.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { importSrc } from "../../_source.mjs";
import {
  DOOR_SECRET,
  DRIVE_KEY,
  STREAM_API,
  T,
  TICKET_KEY,
  driveOf,
  ensureCopy,
  keyDoor,
  platformSaw,
  realFetch,
  returnJob,
  runReturns,
  setPg,
  theSync,
  theWeb,
  watchedClip,
  world,
} from "./_world.mjs";

const SECRET = "stream-webhook-secret-for-this-file";
process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = SECRET;

const { receiveStreamWebhook } = await import(at("apps/edge/lib/files/video-webhook.ts"));
const { SETTLERS } = await import(at("packages/jobs/src/runner/settle.ts"));
const { signRelayTicket } = await importSrc("packages/channels/src/files/relay-ticket.ts");

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

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

/** One clip whose copy was let go, its folder still holding the original: the world, its web and its sync. */
function clipAway(file = {}) {
  const clip = watchedClip({ copy_state: "away", ...file });
  const w = world({ files: [clip.row], items: [clip.origin] });
  const drive = driveOf(clip);
  theSync({ drive });
  const web = theWeb({ drive });
  return { w, web, clip, row: () => w.file(clip.row.id) };
}

test("play, AI and a video being made asking at once bring a copy back once", async () => {
  const { w, web, clip, row } = clipAway();
  const answers = await Promise.all(
    ["play", "moment", "piece", "warm"].map((purpose) => ensureCopy(w.db, T, clip.row.id, purpose)),
  );
  assert.deepEqual(
    answers.map((held) => held.copy),
    ["returning", "returning", "returning", "returning"],
    "each asker is told it is on its way",
  );
  assert.equal(w.returns().length, 1, "one job on the ledger for all four");
  assert.deepEqual(w.returns()[0].payload, { file_id: clip.row.id });
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
  assert.equal(platformSaw(web).asked, 1, "the video platform is asked for one copy");
  assert.equal(row().copy_state, "returning");
  assert.equal(row().media_ref, web.copies[0].uid, "and the row holds that copy's id");
  // A fifth asker while it is on its way joins it: nothing new on the ledger, nothing asked of the platform.
  assert.equal((await ensureCopy(w.db, T, clip.row.id, "play")).copy, "returning");
  // The same job run again (the ledger delivers at least once) asks for nothing.
  assert.deepEqual(await returnJob(w, w.returns()[0]), { skipped: "its copy is returning" });
  assert.equal(platformSaw(web).asked, 1);
  assert.equal(w.returns().length, 1);
});

test("the clip is fetched from the relay under a ticket for its own item, and its bytes never pass through the app", async () => {
  const { w, web, clip } = clipAway();
  await ensureCopy(w.db, T, clip.row.id, "play");
  await runReturns(w);
  const asked = JSON.parse(web.calls.find((c) => c.url === `${STREAM_API}/copy`).body);
  assert.ok(asked.input.startsWith(`https://relay.example/clip/${clip.origin.id}/clip.mov?ticket=`));
  assert.equal(asked.meta.name, `return:${clip.row.id}`, "named for its file, so a copy with no row can be traced");
  assert.ok(!asked.input.includes(DRIVE_KEY), "the address carries a ticket, never a Google key");
  // The only thing asked of Drive is the item's own record: nothing is downloaded by the app for a return.
  assert.equal(web.calls.filter((c) => c.url.includes("alt=media")).length, 0);
  assert.deepEqual(w.unitWrites, [5], "a record's five units, counted once");
});

test("a copy coming back is here again and nothing else: no digest, no look, nothing spent on AI", async () => {
  const { w, web, clip, row } = clipAway({ look_status: "done", look: { says: "a haircut" } });
  await ensureCopy(w.db, T, clip.row.id, "play");
  await runReturns(w);
  const jobsBefore = w.tables.jobs.length;
  const callsBefore = web.calls.length;
  assert.equal((await receiveStreamWebhook(ready(web.copies[0].uid, `return:${clip.row.id}`))).status, 200);
  assert.equal(row().copy_state, "here");
  assert.equal(row().media_ref, web.copies[0].uid);
  assert.equal(row().media_status, "ready");
  assert.equal(row().look_status, "done", "its look is not reset");
  assert.deepEqual(row().look, { says: "a haircut" });
  assert.equal(w.tables.jobs.length, jobsBefore, "no digest, no look and no other job is put on the ledger");
  assert.equal(web.calls.length, callsBefore, "and nothing is asked of any provider: no model is called");
  // Here again: whoever asks now is given the copy, and a second delivery changes nothing.
  const held = await ensureCopy(w.db, T, clip.row.id, "play");
  assert.deepEqual([held.copy, held.mediaRef], ["here", web.copies[0].uid]);
  assert.equal((await receiveStreamWebhook(ready(web.copies[0].uid, `return:${clip.row.id}`))).status, 200);
  assert.equal(row().copy_state, "here");
  assert.equal(w.tables.jobs.length, jobsBefore);
});

test("a copy the platform could not prepare again leaves the file as it was: away, with why, its media_status untouched", async () => {
  const { w, web, clip, row } = clipAway();
  await ensureCopy(w.db, T, clip.row.id, "play");
  await runReturns(w);
  const uid = web.copies[0].uid;
  assert.equal((await receiveStreamWebhook(failed(uid, `return:${clip.row.id}`))).status, 200);
  assert.deepEqual([row().copy_state, row().copy_why, row().media_ref], ["away", "failed", null]);
  assert.equal(row().media_status, "ready", "the video itself was prepared once, and still is what its stills say");
  assert.equal(row().look_status, "done");
  assert.equal(row().removed_at, null, "and it is still in the Library");
  assert.deepEqual(platformSaw(web).deleted, [uid], "the failed copy is deleted at the platform");
  // The next ask begins anew.
  w.returns()[0].state = "done";
  assert.equal((await ensureCopy(w.db, T, clip.row.id, "play")).copy, "returning");
  assert.equal(w.returns().length, 2);
});

test("the platform refusing the address leaves the file away at once, and the ledger tries the job again", async () => {
  const clip = watchedClip({ copy_state: "away" });
  const w = world({ files: [clip.row], items: [clip.origin] });
  const drive = driveOf(clip);
  theSync({ drive });
  theWeb({ drive, refuseCopy: "Invalid input" });
  await ensureCopy(w.db, T, clip.row.id, "play");
  await assert.rejects(returnJob(w, w.returns()[0]), /did not take the clip/);
  assert.deepEqual([w.file(clip.row.id).copy_state, w.file(clip.row.id).copy_why], ["away", "stopped"]);
  assert.equal(w.file(clip.row.id).media_status, "ready");
});

test("the platform busy is a wait, not a failure: the file is away, and says why", async () => {
  const clip = watchedClip({ copy_state: "away" });
  const w = world({ files: [clip.row], items: [clip.origin] });
  const drive = driveOf(clip);
  theSync({ drive });
  theWeb({ drive, busyCopies: 1 });
  await ensureCopy(w.db, T, clip.row.id, "play");
  assert.deepEqual(await runReturns(w), [{ returned: "waits:busy" }]);
  assert.deepEqual([w.file(clip.row.id).copy_state, w.file(clip.row.id).copy_why], ["away", "busy"]);
});

test("a late word about an earlier attempt's copy never settles a later one, and that copy is deleted", async () => {
  const { w, web, clip, row } = clipAway();
  await ensureCopy(w.db, T, clip.row.id, "play");
  await runReturns(w);
  const first = web.copies[0].uid;
  // The first attempt fails; the owner asks again, and a second copy is asked for.
  await receiveStreamWebhook(failed(first, `return:${clip.row.id}`));
  w.returns()[0].state = "done";
  web.copies[0].deleted = true;
  await ensureCopy(w.db, T, clip.row.id, "play");
  await runReturns(w);
  const second = web.copies[1].uid;
  assert.notEqual(second, first);
  assert.deepEqual([row().copy_state, row().media_ref], ["returning", second]);
  // The first copy's "ready" arrives late: the row no longer holds its id, so it settles nothing.
  web.copies[0].deleted = false;
  assert.equal((await receiveStreamWebhook(ready(first, `return:${clip.row.id}`))).status, 200);
  assert.deepEqual([row().copy_state, row().media_ref], ["returning", second], "the newer return is untouched");
  assert.ok(platformSaw(web).deleted.includes(first), "and the copy no row holds is deleted, so it keeps no minutes");
  assert.ok(!platformSaw(web).deleted.includes(second));
  // The second's own word is what ends it.
  await receiveStreamWebhook(ready(second, `return:${clip.row.id}`));
  assert.deepEqual([row().copy_state, row().media_ref], ["here", second]);
});

test("a copy the platform holds that no row does is deleted at its word, unless its return may still be writing its id", async () => {
  const { w, web, clip, row } = clipAway();
  await ensureCopy(w.db, T, clip.row.id, "play");
  await runReturns(w);
  const uid = web.copies[0].uid;
  // Its job died after the platform took the address and before the id was kept: the row was ended as stopped.
  Object.assign(row(), { copy_state: "returning", media_ref: null });
  // The platform's word while the return may still be writing its id (and the word is not "ready"): left alone.
  assert.equal((await receiveStreamWebhook(failed(uid, `return:${clip.row.id}`))).status, 200);
  assert.deepEqual(platformSaw(web).deleted, [], "a living job's copy is not deleted under it");
  // Ended: the file is away, and the copy no row holds keeps no minutes.
  Object.assign(row(), { copy_state: "away", copy_why: "stopped" });
  assert.equal((await receiveStreamWebhook(ready(uid, `return:${clip.row.id}`))).status, 200);
  assert.deepEqual(platformSaw(web).deleted, [uid]);
  assert.deepEqual([row().copy_state, row().media_ref], ["away", null], "and the word settled nothing on the row");
  // A copy named for a file this database does not hold may be another deployment's: left alone.
  const stranger = "d".repeat(32);
  await receiveStreamWebhook(ready(stranger, "return:11111111-2222-4333-8444-555555555555"));
  assert.ok(!platformSaw(web).deleted.includes(stranger));
});

test("a folder that is not being read gives nothing back: the copy waits for it, and nothing is asked of the platform", async () => {
  const clip = watchedClip({ copy_state: "away" });
  const w = world({ files: [clip.row], items: [clip.origin] });
  theSync({ drive: driveOf(clip), closed: "the folder is paused" });
  const web = theWeb({});
  assert.equal((await ensureCopy(w.db, T, clip.row.id, "play")).copy, "returning");
  assert.deepEqual(await runReturns(w), [{ skipped: "the folder is paused" }]);
  assert.deepEqual([w.file(clip.row.id).copy_state, w.file(clip.row.id).copy_why], ["away", "folder"]);
  assert.equal(platformSaw(web).asked, 0);
});

test("bytes that are no longer the ones the file is of are never fetched into it", async () => {
  const clip = watchedClip({ copy_state: "away" });
  const w = world({ files: [clip.row], items: [clip.origin] });
  const drive = driveOf(clip);
  drive[clip.origin.provider_id].checksum = "md5-of-an-edit";
  theSync({ drive });
  const web = theWeb({ drive });
  await ensureCopy(w.db, T, clip.row.id, "play");
  assert.deepEqual(await runReturns(w), [{ returned: "waits:changed" }]);
  assert.deepEqual([w.file(clip.row.id).copy_state, w.file(clip.row.id).copy_why], ["away", "changed"]);
  assert.equal(platformSaw(web).asked, 0);
});

test("a day's budget of returns binds and says so, and carries on the next day", async () => {
  const clips = [1, 2, 3].map(() => watchedClip({ copy_state: "away" }));
  const w = world({ files: clips.map((c) => c.row), items: clips.map((c) => c.origin) });
  const drive = driveOf(...clips);
  theSync({ drive });
  const web = theWeb({ drive });
  // As many as the workspace's day holds were brought back today already (this very moment, so the case holds at
  // any hour: a minute ago can be yesterday as Google counts a day).
  const { RETURN_BUDGETS } = await import("./_world.mjs");
  const most = RETURN_BUDGETS.workspaceReturnsADay;
  for (let n = 0; n < most; n += 1)
    w.tables.files.push({ ...watchedClip().row, copy_returned_at: new Date(w.nowMs).toISOString() });
  await ensureCopy(w.db, T, clips[0].row.id, "play");
  assert.deepEqual(await runReturns(w), [{ returned: "waits:budget" }]);
  assert.deepEqual([w.file(clips[0].row.id).copy_state, w.file(clips[0].row.id).copy_why], ["away", "budget"]);
  assert.equal(platformSaw(web).asked, 0, "nothing is fetched once the day is spent");
  // Tomorrow, as Google counts a day, the same ask goes through.
  w.nowMs += 24 * 60 * 60 * 1000;
  w.returns()[0].state = "done";
  await ensureCopy(w.db, T, clips[0].row.id, "play");
  assert.deepEqual(await runReturns(w), [{ returned: "asked" }]);
});

test("a return whose job ended for good stops saying it is on its way", async () => {
  const { w, clip, row } = clipAway();
  // Begun, and the platform never asked: its job died in between.
  Object.assign(row(), { copy_state: "returning", updated_at: new Date(w.nowMs).toISOString() });
  const settled = await SETTLERS.copy_return(
    w.db,
    { tenant_id: T, kind: "copy_return", payload: { file_id: clip.row.id } },
    true,
  );
  assert.deepEqual(settled, [{ what: "file", changed: true }]);
  assert.deepEqual([row().copy_state, row().copy_why, row().media_status], ["away", "stopped", "ready"]);
});

test("the relay's key door opens for a clip being brought back, under the same ticket rule, and for nothing at rest", async () => {
  const { clip, row } = clipAway();
  const ticket = signRelayTicket(TICKET_KEY, { item: clip.origin.id, expiresAt: Math.floor(Date.now() / 1000) + 3600 });
  const knock = (secret = DOOR_SECRET) =>
    keyDoor(
      new Request("https://edge.example/api/sources/key", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ ticket, method: "GET", range: "bytes=0-" }),
      }),
    );
  // Away, with its item in: nothing is being fetched, so the door stays shut whatever the ticket says.
  assert.equal((await knock()).status, 404);
  // Being brought back: it opens, for the relay's own knock alone.
  Object.assign(row(), { copy_state: "returning" });
  const opened = await knock();
  assert.equal(opened.status, 200);
  assert.deepEqual(await opened.json(), { access_token: DRIVE_KEY, file_id: clip.origin.provider_id });
  assert.equal((await knock("another-key")).status, 401);
  // Here again: shut.
  Object.assign(row(), { copy_state: "here", media_ref: "b".repeat(32) });
  assert.equal((await knock()).status, 404);
});
