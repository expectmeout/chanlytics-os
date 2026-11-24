/**
 * The half-hourly pass over copies on their way out or back, and the seven-day cleanup (apps/edge/lib/files/copy/
 * sweep.ts over 00654; the footage sources plan, "Availability" and D3 as narrowed on 18 November; the review's
 * finding 12). A letting go whose delete never landed is finished. A copy coming back whose word was lost is asked
 * after, as an upload is, and one whose job died is away again. And what left a watched folder seven days ago goes
 * only where nothing used it and no other origin holds it: never a file with no origin, never an item that only
 * vanished, and never through the owner's own let-go list.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import {
  COPY_RETURN,
  LET_GO,
  NOW,
  SOURCE,
  SOURCE_GRACE,
  T,
  copyId,
  daysAgo,
  keepCopiesMoving,
  platformSaw,
  realFetch,
  setPg,
  theWeb,
  videoRow,
  watchedClip,
  world,
} from "./_world.mjs";
const { planPage, keepPage } = await import(at("apps/edge/lib/files/sources/items.ts"));

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const minutesAgo = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

test("a letting go whose delete never landed is finished, and one still under way is left", async () => {
  const stalled = watchedClip({ copy_state: "going", updated_at: minutesAgo(11) });
  const underWay = watchedClip({ copy_state: "going", updated_at: minutesAgo(3) });
  const w = world({ files: [stalled.row, underWay.row], items: [stalled.origin, underWay.origin] });
  const web = theWeb({});
  const copy = stalled.row.media_ref;
  await keepCopiesMoving(w.db, NOW);
  assert.deepEqual(platformSaw(web).deleted, [copy]);
  assert.deepEqual([w.file(stalled.row.id).copy_state, w.file(stalled.row.id).media_ref], ["away", null]);
  assert.equal(w.file(underWay.row.id).copy_state, "going");
  assert.equal(LET_GO.staleMs, 10 * 60_000);
});

test("a return whose job died before the platform was asked is away again; one just begun is left", async () => {
  const died = watchedClip({ copy_state: "returning", media_ref: null, updated_at: minutesAgo(11) });
  const begun = watchedClip({ copy_state: "returning", media_ref: null, updated_at: minutesAgo(3) });
  const w = world({ files: [died.row, begun.row], items: [died.origin, begun.origin] });
  const web = theWeb({});
  await keepCopiesMoving(w.db, NOW);
  assert.deepEqual(
    [w.file(died.row.id).copy_state, w.file(died.row.id).copy_why, w.file(died.row.id).media_status],
    ["away", "stopped", "ready"],
  );
  assert.equal(w.file(begun.row.id).copy_state, "returning");
  assert.deepEqual(platformSaw(web), { asked: 0, deleted: [] });
  assert.equal(COPY_RETURN.staleSeconds, 600);
});

test("a copy coming back whose word was lost is asked after: ready is here and nothing else, an error is away", async () => {
  const [readyId, errorId, goneId, slowId] = [copyId(), copyId(), copyId(), copyId()];
  const back = watchedClip({ copy_state: "returning", media_ref: readyId, updated_at: minutesAgo(5) });
  const broke = watchedClip({ copy_state: "returning", media_ref: errorId, updated_at: minutesAgo(5) });
  const vanished = watchedClip({ copy_state: "returning", media_ref: goneId, updated_at: minutesAgo(5) });
  const slow = watchedClip({ copy_state: "returning", media_ref: slowId, updated_at: minutesAgo(5) });
  const all = [back, broke, vanished, slow];
  const w = world({ files: all.map((c) => c.row), items: all.map((c) => c.origin) });
  const web = theWeb({
    held: [
      { uid: readyId, state: "ready" },
      { uid: errorId, state: "error" },
      { uid: goneId, state: "ready", deleted: true },
      { uid: slowId, state: "inprogress" },
    ],
  });
  await keepCopiesMoving(w.db, NOW);
  const of = (clip) => w.file(clip.row.id);
  assert.deepEqual([of(back).copy_state, of(back).media_ref, of(back).look_status], ["here", readyId, "done"]);
  assert.deepEqual(w.tables.jobs, [], "no digest and no look is put on the ledger for a copy that came back");
  assert.deepEqual([of(broke).copy_state, of(broke).copy_why, of(broke).media_ref], ["away", "failed", null]);
  assert.deepEqual([of(vanished).copy_state, of(vanished).copy_why], ["away", "failed"]);
  assert.deepEqual([of(slow).copy_state, of(slow).media_ref], ["returning", slowId], "still being prepared: left");
  for (const clip of all) assert.equal(of(clip).media_status, "ready", "a return never touches media_status");
  assert.ok(platformSaw(web).deleted.includes(errorId), "the copy that could not be prepared is deleted there");
});

test("a copy the platform still has not prepared after an hour is given up: away, and its copy deleted", async () => {
  const slowId = copyId();
  const slow = watchedClip({ copy_state: "returning", media_ref: slowId, updated_at: minutesAgo(61) });
  const w = world({ files: [slow.row], items: [slow.origin] });
  const web = theWeb({ held: [{ uid: slowId, state: "inprogress" }] });
  await keepCopiesMoving(w.db, NOW);
  assert.deepEqual([w.file(slow.row.id).copy_state, w.file(slow.row.id).copy_why], ["away", "failed"]);
  assert.deepEqual(platformSaw(web).deleted, [slowId]);
  assert.equal(COPY_RETURN.giveUpMs, 60 * 60_000);
});

/* ------------------------------------------------------------------------------------------ the seven-day cleanup */

test("seven days after it was seen in the bin, an unused file with no other origin leaves the Library", async () => {
  const binned = watchedClip({}, { state: "gone", gone_at: daysAgo(8) });
  const moved = watchedClip({ copy_state: "away" }, { state: "outside", gone_at: daysAgo(8) });
  const recent = watchedClip({}, { state: "gone", gone_at: daysAgo(6) });
  const all = [binned, moved, recent];
  const w = world({ files: all.map((c) => c.row), items: all.map((c) => c.origin) });
  theWeb({});
  const done = await keepCopiesMoving(w.db, NOW);
  assert.deepEqual([done.removed, done.kept, done.cleared], [2, 0, 2]);
  assert.ok(w.file(binned.row.id).removed_at, "seen in the bin eight days ago: removed");
  assert.ok(w.file(moved.row.id).removed_at, "moved out eight days ago: removed");
  assert.equal(w.file(recent.row.id).removed_at, null, "six days ago: still inside its grace");
  assert.equal(w.item(recent.origin.id).state, "gone");
  assert.deepEqual(
    w.tables.jobs.filter((job) => job.kind === "file_purge").map((job) => job.payload),
    [binned.row.id, moved.row.id].map((id) => ({ file_id: id, why: "remove" })),
    "its bytes and its copy go by the purge",
  );
  assert.equal(w.item(binned.origin.id), undefined, "and the tombstone row is deleted");
  assert.equal(SOURCE_GRACE.seconds, 7 * 24 * 60 * 60);
});

test("the cleanup never writes the owner's own let-go list, so the same bytes put back come in again", async () => {
  const binned = watchedClip({}, { state: "gone", gone_at: daysAgo(30) });
  const w = world({ files: [binned.row], items: [binned.origin] });
  theWeb({});
  await keepCopiesMoving(w.db, NOW);
  assert.ok(w.file(binned.row.id).removed_at);
  assert.deepEqual(w.tables.files_let_go, [], "nothing is written to files_let_go");
});

test("the cleanup never touches a file with no origin left: a disconnect must not empty a Library a week on", async () => {
  // Its account was disconnected a month ago: its folders and their items went by cascade, and its files stayed.
  const orphans = [
    videoRow({ created_at: daysAgo(40), updated_at: daysAgo(40) }),
    videoRow({ copy_state: "lost", copy_why: "no_origin", media_ref: null, updated_at: daysAgo(40) }),
    videoRow({ kind: "image", media_ref: null, media_status: null, mime: "image/jpeg", updated_at: daysAgo(40) }),
  ];
  const w = world({ files: orphans, items: [] });
  theWeb({});
  const done = await keepCopiesMoving(w.db, NOW);
  assert.deepEqual([done.removed, done.kept, done.cleared], [0, 0, 0]);
  for (const row of orphans) assert.equal(w.file(row.id).removed_at, null);
  assert.deepEqual(w.tables.jobs, []);
});

test("an item that only vanished is kept for good: never seen in the bin, never removed", async () => {
  const vanished = watchedClip({}, { state: "no_access", why: "not_found", gone_at: daysAgo(90) });
  const refused = watchedClip({}, { state: "no_access", gone_at: daysAgo(90) });
  const w = world({ files: [vanished.row, refused.row], items: [vanished.origin, refused.origin] });
  theWeb({});
  const done = await keepCopiesMoving(w.db, NOW);
  assert.deepEqual([done.removed, done.cleared], [0, 0]);
  assert.equal(w.file(vanished.row.id).removed_at, null);
  assert.equal(w.file(refused.row.id).removed_at, null);
  assert.equal(w.item(vanished.origin.id).state, "no_access", "and its row stays");
});

test("a file something used, or another origin holds, stays; its tombstone still goes", async () => {
  const posted = watchedClip({}, { state: "gone", gone_at: daysAgo(9) });
  const inAVideo = watchedClip({}, { state: "gone", gone_at: daysAgo(9) });
  const inAPost = watchedClip(
    { kind: "image", media_ref: null, media_status: null, mime: "image/jpeg" },
    { kind: "image", state: "outside", gone_at: daysAgo(9) },
  );
  const twice = watchedClip({}, { state: "gone", gone_at: daysAgo(9) });
  const all = [posted, inAVideo, inAPost, twice];
  // The same bytes sit in a second place in the folder, still there.
  const second = {
    ...twice.origin,
    id: "99999999-0000-4000-8000-000000000001",
    provider_id: "drive-second",
    state: "in",
    gone_at: null,
  };
  const w = world({
    files: [
      ...all.map((c) => c.row),
      // A post made from the photo: how it was made names the photo.
      videoRow({ kind: "image", source: "made", media_ref: null, media_status: null, made: { from: inAPost.row.id } }),
    ],
    items: [...all.map((c) => c.origin), second],
    posts: [{ id: "p1", tenant_id: T, file_id: posted.row.id }],
    pieces: [{ id: "v1", tenant_id: T, status: "made", plan: { blocks: [{ is: "clip", file_id: inAVideo.row.id }] } }],
  });
  theWeb({});
  const done = await keepCopiesMoving(w.db, NOW);
  assert.deepEqual([done.removed, done.kept, done.cleared], [0, 4, 4]);
  for (const clip of all) assert.equal(w.file(clip.row.id).removed_at, null);
  assert.equal(w.item(second.id).state, "in", "the origin that still holds it is untouched");
  assert.equal(w.item(posted.origin.id), undefined);
});

/* ---------------------------------------------------- a file held by its own road, and one its folder superseded */

test("the cleanup never removes a file its own road holds: an upload, a found file, or a watched one its owner uploaded", async () => {
  // Each came in by another road first, or was uploaded too, and its folder's item was binned eight days ago.
  const upload = watchedClip({ source: "upload" }, { state: "gone", gone_at: daysAgo(8) });
  const found = watchedClip({ source: "instagram", status: "filed" }, { state: "gone", gone_at: daysAgo(8) });
  const uploaded = watchedClip({ owner_uploaded: true }, { state: "outside", gone_at: daysAgo(8) });
  const all = [upload, found, uploaded];
  const w = world({ files: all.map((c) => c.row), items: all.map((c) => c.origin) });
  theWeb({});
  const done = await keepCopiesMoving(w.db, NOW);
  assert.deepEqual([done.removed, done.kept, done.cleared], [0, 3, 3]);
  for (const clip of all) assert.equal(w.file(clip.row.id).removed_at, null);
  assert.deepEqual(w.tables.jobs, []);
});

/** What Drive says of an item now: the same item, other bytes. */
const recordOf = (item, over = {}) => ({
  id: item.provider_id,
  kind: item.kind,
  parentId: item.parent_id,
  name: item.name,
  mime: "video/quicktime",
  modifiedAt: "2026-11-18T10:00:00.000Z",
  createdAt: "2026-11-10T10:00:00.000Z",
  checksum: item.checksum,
  bytes: Number(item.bytes),
  seconds: Number(item.seconds),
  addedBy: null,
  trashed: false,
  ...over,
});

test("a listing that sees new bytes marks the old file superseded as its item lets go of it", async () => {
  const taken = watchedClip();
  const away = watchedClip({}, { state: "gone", gone_at: daysAgo(1) });
  const w = world({ files: [taken.row, away.row], items: [taken.origin, away.origin] });
  const ref = { tenantId: T, sourceId: SOURCE };
  const seen = [
    recordOf(taken.origin, { checksum: "md5-of-an-edit" }),
    recordOf(away.origin, { bytes: Number(away.origin.bytes) + 1 }),
  ];
  await keepPage(w.db, ref, planPage(ref, seen, [taken.origin, away.origin], true), 0);
  for (const clip of [taken, away]) {
    assert.ok(w.file(clip.row.id).superseded_at, "the old file is marked");
    assert.equal(w.item(clip.origin.id).file_id, null, "and its item let go of it");
    assert.equal(w.file(clip.row.id).removed_at, null, "it stays in the Library for now");
  }
  assert.equal(w.item(taken.origin.id).state, "waiting", "the new bytes are asked for as a new file");
  // The same bytes seen again mark nothing: no file is let go.
  const first = w.file(taken.row.id).superseded_at;
  await keepPage(w.db, ref, planPage(ref, [seen[0]], [w.item(taken.origin.id)], true), 0);
  assert.equal(w.file(taken.row.id).superseded_at, first);
});

test("seven days after it was superseded an unused file goes; one used, or held again, stays and loses its mark", async () => {
  const unused = watchedClip({ superseded_at: daysAgo(8) }, { state: "listed", file_id: null });
  const recent = watchedClip({ superseded_at: daysAgo(6) }, { state: "listed", file_id: null });
  const posted = watchedClip({ superseded_at: daysAgo(8) }, { state: "listed", file_id: null });
  const heldAgain = watchedClip({ superseded_at: daysAgo(8) });
  const uploaded = watchedClip({ superseded_at: daysAgo(8), owner_uploaded: true }, { state: "listed", file_id: null });
  const all = [unused, recent, posted, heldAgain, uploaded];
  const w = world({
    files: all.map((c) => c.row),
    items: all.map((c) => c.origin),
    posts: [{ id: "p1", tenant_id: T, file_id: posted.row.id }],
  });
  theWeb({});
  const done = await keepCopiesMoving(w.db, NOW);
  assert.deepEqual([done.removed, done.kept, done.cleared], [1, 3, 0]);
  assert.ok(w.file(unused.row.id).removed_at, "unused, a week on: removed");
  assert.deepEqual(
    w.tables.jobs.map((job) => job.payload),
    [{ file_id: unused.row.id, why: "remove" }],
  );
  assert.deepEqual(
    w.tables.events.map((e) => e.data),
    [{ file_id: unused.row.id, why: "source_changed" }],
  );
  assert.deepEqual(w.tables.files_let_go, [], "never written to the owner's own let-go list");
  for (const kept of [posted, heldAgain, uploaded]) {
    assert.equal(w.file(kept.row.id).removed_at, null);
    assert.equal(w.file(kept.row.id).superseded_at, null, "judged once: its mark goes");
  }
  assert.equal(w.file(recent.row.id).removed_at, null, "inside its grace");
  assert.ok(w.file(recent.row.id).superseded_at);
});
