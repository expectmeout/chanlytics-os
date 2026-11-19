/**
 * The video platform's word about a clip a watched folder brought (apps/edge/lib/files/takes/word.ts, heard at the
 * real webhook door and by the sweep that asks after a lost one; the footage sources plan, "Taking a file in", steps
 * 4 and 5): ready, and the item is in. An error, and the failed copy is let go and the clip fetched again as a new
 * job, twice; then the item says it failed. A word heard twice changes nothing, and one whose settlement did not
 * land the first time lands the second.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { STREAM_API, T, bytesOf, itemRow, realFetch, runTakes, setPg, theSync, theWeb, world } from "./_world.mjs";

const SECRET = "stream-webhook-secret-for-this-file";
process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = SECRET;

const { receiveStreamWebhook } = await import(at("apps/edge/lib/files/video-webhook.ts"));
const { settleTakenVideo } = await import(at("apps/edge/lib/files/takes/word.ts"));
const { SETTLERS } = await import(at("packages/jobs/src/runner/settle.ts"));

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const MIB = 1_048_576;
const CLIP = {
  mime: "video/quicktime",
  name: "IMG_1561.MOV",
  seconds: 38.1,
  size: 255_147_868,
  bytes: bytesOf(MIB, 1),
};

/** Stream's delivery about one video, signed as Stream signs it. */
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
const ready = (uid) => delivery({ uid, readyToStream: true, status: { state: "ready" }, duration: 38.1 });
const failed = (uid) => delivery({ uid, status: { state: "error", errorReasonCode: "ERR_MALFORMED_VIDEO" } });

/** One clip asked of the video platform: the world, its item and the copy's id. */
async function clipAsked() {
  const item = itemRow({ provider_id: "drive-file-1" });
  const drive = { [item.provider_id]: CLIP };
  const w = world({ items: [item] });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "asked" }]);
  return { w, web, item, file: () => w.tables.files.at(-1), uid: () => web.copies.at(-1).uid };
}

test("ready: the item is in, and a second delivery changes nothing", async () => {
  const { w, item, file, uid } = await clipAsked();
  assert.equal((await receiveStreamWebhook(ready(uid()))).status, 200);
  assert.equal(file().media_status, "ready");
  assert.deepEqual([w.item(item.id).state, w.item(item.id).file_id, w.item(item.id).why], ["in", file().id, null]);
  assert.equal((await receiveStreamWebhook(ready(uid()))).status, 200);
  assert.equal(w.item(item.id).state, "in");
});

test("an error: the failed copy is let go and the clip is fetched again as a new job, twice; then it says it failed", async () => {
  const { w, web, item, uid } = await clipAsked();
  for (const tries of [1, 2]) {
    const failedFile = w.tables.files.at(-1);
    assert.equal((await receiveStreamWebhook(failed(uid()))).status, 200);
    // The failed copy first: the file is removed (not let go by its owner) and its purge is on the ledger.
    assert.ok(failedFile.removed_at, "the failed row leaves the Library");
    assert.equal(w.tables.files_let_go.length, 0, "nothing says its owner removed it: it may be fetched again");
    assert.ok(
      w.tables.jobs.some(
        (j) => j.kind === "file_purge" && j.payload.file_id === failedFile.id && j.payload.why === "remove",
      ),
      "its purge deletes the copy at the video platform",
    );
    const waits = w.item(item.id);
    assert.deepEqual([waits.state, waits.why, waits.take_tries, waits.file_id], ["waiting", "retry", tries, null]);
    const restMin = (Date.parse(waits.take_after) - Date.now()) / 60_000;
    assert.ok(tries === 1 ? restMin > 1.9 && restMin <= 2 : restMin > 9.9 && restMin <= 10, `rests ${restMin} minutes`);
    // Once it has rested, the clock hands it a new job for its next try, and the platform is asked for a new copy.
    assert.deepEqual(await runTakes(w), [], "not before it has rested");
    w.nowMs = Date.parse(waits.take_after) + 1_000;
    assert.deepEqual(await runTakes(w), [{ took: "asked" }]);
    assert.equal(w.tables.jobs.filter((j) => j.kind === "source_take").at(-1).payload.try, String(tries));
    assert.equal(web.copies.length, tries + 1);
    assert.notEqual(w.tables.files.at(-1).id, failedFile.id, "a new file for the new copy");
  }
  // The third failure is the last: the item says it failed, and the clock hands it nothing more.
  assert.equal((await receiveStreamWebhook(failed(uid()))).status, 200);
  assert.deepEqual([w.item(item.id).state, w.item(item.id).why, w.item(item.id).file_id], ["failed", "stream", null]);
  w.nowMs += 24 * 3_600_000;
  assert.deepEqual(await runTakes(w), []);
  assert.equal(w.tables.files.filter((f) => !f.removed_at).length, 0, "no failed tile is left in the Library");
  assert.equal(web.calls.filter((c) => c.url === `${STREAM_API}/copy`).length, 3, "three fetches in all, and no more");
});

test("a word whose settlement did not land is settled when it is heard again", async () => {
  const { w, item, file, uid } = await clipAsked();
  // The row was finished, and the process died before the item was: the platform's word comes again as `repeated`.
  file().media_status = "ready";
  assert.equal(w.item(item.id).state, "taking");
  assert.equal((await receiveStreamWebhook(ready(uid()))).status, 200);
  assert.equal(w.item(item.id).state, "in");
});

test("a settlement that cannot be written is not heard: the platform is told to say it again", async () => {
  const { w, item, uid } = await clipAsked();
  const from = w.db.from.bind(w.db);
  w.db.from = (table) => {
    if (table === "source_items") throw new Error("connection reset");
    return from(table);
  };
  assert.equal((await receiveStreamWebhook(ready(uid()))).status, 503);
  w.db.from = from;
  assert.equal(w.item(item.id).state, "taking");
  assert.equal((await receiveStreamWebhook(ready(uid()))).status, 200);
  assert.equal(w.item(item.id).state, "in", "said again, it lands");
});

test("an upload's failed video is its owner's: it is never removed here", async () => {
  const upload = {
    id: "ffffffff-0000-4000-8000-000000000001",
    tenant_id: T,
    kind: "video",
    source: "upload",
    fingerprint: "an-upload",
    media_ref: "a".repeat(32),
    media_status: "uploading",
    removed_at: null,
  };
  const w = world({ files: [upload] });
  assert.equal((await receiveStreamWebhook(failed(upload.media_ref))).status, 200);
  assert.deepEqual([upload.media_status, upload.removed_at], ["failed", null]);
  assert.equal(w.tables.jobs.length, 0);
});

test("a word about nothing a folder brought, or with no row, is nothing to settle", async () => {
  const w = world({});
  await settleTakenVideo(w.db, { fate: "unknown", tenant_id: null, file_id: null, made: false });
  await settleTakenVideo(w.db, {
    fate: "gone",
    tenant_id: T,
    file_id: "ffffffff-0000-4000-8000-000000000003",
    made: false,
  });
  // A found video passed over as the platform said its length (00643 file_media_ready): no folder brought it.
  await settleTakenVideo(w.db, {
    fate: "passed",
    tenant_id: T,
    file_id: "ffffffff-0000-4000-8000-000000000006",
    made: false,
  });
  assert.equal(w.tables.jobs.length, 0);
});

test("a take whose job ended for good before it began a file waits to be tried again, then says it failed", async () => {
  const item = itemRow({ state: "taking" });
  const w = world({ items: [item] });
  const job = { id: "job-1", kind: "source_take", tenant_id: T, payload: { item_id: item.id, try: "0" } };
  assert.deepEqual(await SETTLERS.source_take(w.db, job, false), [{ what: "file", changed: true }]);
  assert.deepEqual([w.item(item.id).state, w.item(item.id).why, w.item(item.id).take_tries], ["waiting", "retry", 1]);
  Object.assign(w.item(item.id), { state: "taking", take_tries: 2 });
  await SETTLERS.source_take(w.db, job, false);
  assert.deepEqual([w.item(item.id).state, w.item(item.id).why], ["failed", "stopped"]);
  // One whose clip is with the video platform is the platform's to finish: the ledger's end leaves it.
  const asked = itemRow({ state: "taking", file_id: "ffffffff-0000-4000-8000-000000000004" });
  const w2 = world({ items: [asked] });
  assert.deepEqual(await SETTLERS.source_take(w2.db, { ...job, payload: { item_id: asked.id, try: "0" } }, false), [
    { what: "file", changed: false },
  ]);
  assert.equal(w2.item(asked.id).state, "taking");
});

/** A ready delivery that says how long the platform measured the video to be. */
const readyAt = (uid, duration) => delivery({ uid, readyToStream: true, status: { state: "ready" }, duration });

/**
 * A clip Drive never measured, asked of the video platform once its day's wait for a length was over: its row holds
 * no length, so the platform's word is the first that says one. `files` is what the Library holds already.
 */
async function unmeasuredClipAsked(files = []) {
  const item = itemRow({ provider_id: "drive-file-1", first_seen_at: "2026-11-10T10:00:00.000Z" });
  const drive = { [item.provider_id]: { ...CLIP, seconds: null } };
  const w = world({ items: [item], files });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "asked" }]);
  const file = w.tables.files.at(-1);
  assert.equal(file.seconds, null, "taken by its size alone: nothing has said its length");
  return { w, web, item, file, uid: web.copies.at(-1).uid };
}

test("FINDING 11: a clip Drive never measured, found longer than ten minutes as the platform says so, is passed over as too long", async () => {
  const { w, item, file, uid } = await unmeasuredClipAsked();
  assert.equal((await receiveStreamWebhook(readyAt(uid, 700))).status, 200);
  assert.ok(file.removed_at, "the Library's row is removed, and its purge deletes the copy");
  const ended = w.item(item.id);
  assert.deepEqual(
    [ended.state, ended.why, ended.file_id, ended.seconds, ended.take_after],
    ["too_big", "seconds", null, 700, null],
    "said as too big, by its length, as one Drive had measured would have been",
  );
  // Said again, nothing changes; and nothing is fetched again.
  assert.equal((await receiveStreamWebhook(readyAt(uid, 700))).status, 200);
  assert.equal(w.item(item.id).state, "too_big");
  assert.equal(w.tables.jobs.filter((j) => j.kind === "source_take").length, 1);
});

test("FINDING 11: one with no room for the length the platform says waits for room, and is not counted", async () => {
  const kept = {
    id: "ffffffff-0000-4000-8000-000000000009",
    tenant_id: T,
    kind: "video",
    source: "upload",
    fingerprint: "what-is-kept",
    media_ref: "b".repeat(32),
    media_status: "ready",
    seconds: 3590,
    removed_at: null,
  };
  const { w, item, file, uid } = await unmeasuredClipAsked([kept]);
  assert.equal((await receiveStreamWebhook(readyAt(uid, 30))).status, 200);
  assert.ok(file.removed_at);
  const waits = w.item(item.id);
  assert.deepEqual([waits.state, waits.why, waits.file_id, waits.seconds], ["waiting", "room", null, 30]);
  const hours = (Date.parse(waits.take_after) - Date.now()) / 3_600_000;
  assert.ok(hours > 5.9 && hours <= 6, `it is asked after again in six hours, or as room is freed: ${hours}`);
});

test("FINDING 11: one the platform measures within the limits is in, with its length", async () => {
  const { w, item, file, uid } = await unmeasuredClipAsked();
  assert.equal((await receiveStreamWebhook(readyAt(uid, 38.1))).status, 200);
  assert.deepEqual([file.media_status, file.seconds, file.removed_at ?? null], ["ready", 38.1, null]);
  assert.equal(w.item(item.id).state, "in");
});

test("FINDING 11: a clip passed over whose item was not settled is settled when the word comes again", async () => {
  const { w, item, uid } = await unmeasuredClipAsked();
  const from = w.db.from.bind(w.db);
  w.db.from = (table) => {
    if (table === "source_items") throw new Error("connection reset");
    return from(table);
  };
  assert.equal((await receiveStreamWebhook(readyAt(uid, 700))).status, 503);
  w.db.from = from;
  assert.equal(w.item(item.id).state, "taking", "the row is removed, and its item still says it is being taken");
  // The platform says it again: the row is gone, and still says why it went.
  assert.equal((await receiveStreamWebhook(readyAt(uid, 700))).status, 200);
  assert.deepEqual([w.item(item.id).state, w.item(item.id).why, w.item(item.id).seconds], ["too_big", "seconds", 700]);
});

test("a word about a video no folder brought asks the hand-out for nothing", async () => {
  const upload = {
    id: "ffffffff-0000-4000-8000-00000000000a",
    tenant_id: T,
    kind: "video",
    source: "upload",
    fingerprint: "another-upload",
    media_ref: "f".repeat(32),
    media_status: "uploading",
    seconds: 12,
    removed_at: null,
  };
  const w = world({ files: [upload] });
  assert.equal((await receiveStreamWebhook(ready(upload.media_ref))).status, 200);
  assert.equal(upload.media_status, "ready");
  assert.equal(
    w.handOuts.length,
    0,
    "a member's own video settles no item, so no workspace's files are looked through",
  );
  // And a clip a folder brought does: its workspace's next file is handed its job as it settles.
  const taken = await clipAsked();
  const before = taken.w.handOuts.length;
  assert.equal((await receiveStreamWebhook(ready(taken.uid()))).status, 200);
  assert.equal(taken.w.handOuts.length, before + 1);
  assert.equal(taken.w.handOuts.at(-1).p_tenant_id, T);
});
