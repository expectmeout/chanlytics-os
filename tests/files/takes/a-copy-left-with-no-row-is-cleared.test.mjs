/**
 * A take's copy at the video platform that no row holds (apps/edge/lib/files/takes/copies.ts; the review of 18
 * November 2026, finding 10): a job can die between the platform taking a clip's address and the row that holds its
 * copy being written. The copy is named for its item, so it is deleted in two places: before the item's next take
 * asks for another (a try that failed, or a take that was lost), and as the platform says its word about a video no
 * row holds. A copy named for an item this database does not know is another deployment's, and is left alone.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { STREAM_API, T, bytesOf, itemRow, realFetch, runTakes, setPg, theSync, theWeb, world } from "./_world.mjs";

const SECRET = "stream-webhook-secret-for-this-file";
process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = SECRET;

const { receiveStreamWebhook } = await import(at("apps/edge/lib/files/video-webhook.ts"));

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
const LEFT = "c".repeat(32);

/** A copy the platform holds under a take's name, from a try whose job died before it wrote the row. */
const leftCopy = (itemId, uid = LEFT) => ({ uid, meta: { name: `take:${itemId}` }, requireSignedURLs: true });
const deletes = (web) => web.calls.filter((c) => c.method === "DELETE").map((c) => c.url);
const searches = (web) => web.calls.filter((c) => c.url.startsWith(`${STREAM_API}?search=`));

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
const readyNamed = (uid, name) =>
  delivery({ uid, readyToStream: true, status: { state: "ready" }, duration: 38.1, meta: { name } });
const failedNamed = (uid, name) =>
  delivery({ uid, status: { state: "error", errorReasonCode: "ERR_FETCH_ORIGIN_ERROR" }, meta: { name } });

test("a first take asks the platform for nothing but the copy, and names it for its item", async () => {
  const item = itemRow({ provider_id: "drive-file-1" });
  const drive = { [item.provider_id]: CLIP };
  const w = world({ items: [item] });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "asked" }]);
  assert.equal(web.copies[0].meta.name, `take:${item.id}`);
  assert.equal(searches(web).length, 0, "no list is read on a first take");
});

test("a take that was lost clears the copy it left before it asks for another", async () => {
  // Being taken since hours ago, with no file: its job died after the platform took the address.
  const item = itemRow({ provider_id: "drive-file-1", state: "taking", updated_at: "2026-11-17T10:00:00.000Z" });
  const drive = { [item.provider_id]: CLIP };
  const w = world({ items: [item] });
  theSync({ drive });
  const web = theWeb({ drive, held: [leftCopy(item.id), leftCopy(randomUUID(), "d".repeat(32))] });
  assert.deepEqual(await runTakes(w), [{ took: "asked" }], "the clock finds it never ended, and it is taken again");
  assert.equal(searches(web).length, 1);
  assert.deepEqual(deletes(web), [`${STREAM_API}/${LEFT}`], "its own left copy, and never another item's");
  const copy = web.copies.at(-1);
  assert.equal(w.tables.files.at(-1).media_ref, copy.uid, "the row holds the new copy");
  assert.equal(copy.deleted ?? false, false);
});

test("a try again after a failed fetch clears only what no row holds", async () => {
  const item = itemRow({ provider_id: "drive-file-1", take_tries: 1 });
  const drive = { [item.provider_id]: CLIP };
  // Another item's Library file holds a copy under this name's search (a name is searched by part of a word).
  const heldBy = {
    id: "ffffffff-0000-4000-8000-000000000007",
    tenant_id: T,
    kind: "video",
    source: "drive",
    fingerprint: "another-clip",
    media_ref: LEFT,
    media_status: "ready",
    seconds: 10,
    removed_at: null,
  };
  const w = world({ items: [item], files: [heldBy] });
  theSync({ drive });
  const web = theWeb({ drive, held: [leftCopy(item.id)] });
  assert.deepEqual(await runTakes(w), [{ took: "asked" }]);
  assert.equal(searches(web).length, 1);
  assert.deepEqual(deletes(web), [], "a copy a row holds is never deleted");
});

test("the platform not answering its list does not stop the take", async () => {
  const item = itemRow({ provider_id: "drive-file-1", take_tries: 1 });
  const drive = { [item.provider_id]: CLIP };
  const w = world({ items: [item] });
  theSync({ drive });
  const web = theWeb({ drive });
  const answered = globalThis.fetch;
  globalThis.fetch = (url, init) =>
    String(url).startsWith(`${STREAM_API}?search=`)
      ? Promise.resolve(new Response("upstream timed out", { status: 504 }))
      : answered(url, init);
  try {
    assert.deepEqual(await runTakes(w), [{ took: "asked" }]);
  } finally {
    globalThis.fetch = answered;
  }
  assert.equal(web.copies.length, 1);
});

test("the platform's word about a take's copy no row holds deletes it, where its item is no longer being written", async () => {
  // The item was put back to wait (its lost take was found by the clock): nothing is writing a row for this copy.
  const item = itemRow({ provider_id: "drive-file-1", state: "waiting", why: "lost" });
  const w = world({ items: [item] });
  const web = theWeb({});
  assert.equal((await receiveStreamWebhook(readyNamed(LEFT, `take:${item.id}`))).status, 200);
  assert.deepEqual(deletes(web), [`${STREAM_API}/${LEFT}`]);
  assert.equal(w.tables.files.length, 0);
});

test("a copy whose take may still be writing its row is left, unless the platform already says it is playable", async () => {
  const item = itemRow({ provider_id: "drive-file-1", state: "taking" });
  world({ items: [item] });
  const web = theWeb({});
  // An error within the second: the job that asked may be between the platform's answer and its row.
  assert.equal((await receiveStreamWebhook(failedNamed(LEFT, `take:${item.id}`))).status, 200);
  assert.deepEqual(deletes(web), []);
  // Playable is minutes on: a living job wrote its row long ago, so this copy has none and never will.
  assert.equal((await receiveStreamWebhook(readyNamed(LEFT, `take:${item.id}`))).status, 200);
  assert.deepEqual(deletes(web), [`${STREAM_API}/${LEFT}`]);
});

test("a video that is no take's, or a take's of an item this database does not know, is left alone", async () => {
  world({ items: [itemRow({ provider_id: "drive-file-1" })] });
  const web = theWeb({});
  for (const name of [`take:${randomUUID()}`, "take:not-an-id", "ffffffff-0000-4000-8000-000000000001", null])
    assert.equal((await receiveStreamWebhook(readyNamed("e".repeat(32), name))).status, 200);
  assert.deepEqual(
    deletes(web),
    [],
    "another deployment's copy, a member's upload, a found video: none is ours to delete",
  );
});
