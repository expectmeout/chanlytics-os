/**
 * A copy that cannot come back says so, plainly and as data (apps/edge/lib/files/copy/ensure.ts and the readers that
 * ask it; the footage sources plan, "Availability", acceptance test 17). A watched clip whose copy was let go and
 * whose original has since left its folder is lost: whoever asks is answered with why, as a word of a closed set, and
 * nothing fails silently, nothing is thrown, and nothing is asked of the video platform. One whose original comes
 * back is fetched again. And a purpose that only uses a copy never brings one back.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { FILE_COPY_LOSSES, FILE_COPY_STATES, FILE_COPY_WAITS, FILE_COPY_WHYS } from "@chanlytics/contracts";
import { at } from "../../_cron-doors-world.mjs";
import {
  LET_GO,
  NOW,
  T,
  daysAgo,
  ensureCopy,
  ensureCopyOf,
  platformSaw,
  realFetch,
  setPg,
  theSync,
  theWeb,
  videoRow,
  watchedClip,
  world,
} from "./_world.mjs";

// What signs a video's tokens: set so the moments' door is open here. No case reaches the platform with them.
Object.assign(process.env, {
  CLOUDFLARE_STREAM_KEY_ID: "key-id-for-this-file",
  CLOUDFLARE_STREAM_KEY_JWK: "not-a-key",
  CLOUDFLARE_STREAM_CUSTOMER_CODE: "abc",
});

const { signVideoPlay } = await import(at("apps/edge/lib/files/video-doors.ts"));
const { listFileCopies } = await import(at("apps/edge/lib/files/copies.ts"));

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const U = "bbbbbbbb-0000-4000-8000-000000000001";
const AUTH = { ok: true, via: "token", workspace: T, user: U };
const played = async (id) => {
  const response = await signVideoPlay(AUTH, { tenant_id: T, id });
  return [response.status, await response.json()];
};
const copiesAsked = async (body) => {
  const response = await listFileCopies(
    AUTH,
    new Request("https://edge.example/api/admin/files/copies", {
      method: "POST",
      body: JSON.stringify({ tenant_id: T, ...body }),
    }),
  );
  return [response.status, await response.json()];
};

/** A clip whose copy was let go, and what became of the original its folder held. */
function clipWhoseOriginal(item) {
  const clip = watchedClip({ copy_state: "away" }, item ?? {});
  const w = world({ files: [clip.row], items: item === null ? [] : [clip.origin] });
  theSync({});
  const web = theWeb({});
  return { w, web, clip, row: () => w.file(clip.row.id) };
}

test("a lost original is said plainly: why, on the row and to whoever asks, and never as a failure", async () => {
  const { w, web, clip, row } = clipWhoseOriginal({ state: "gone", gone_at: daysAgo(1) });
  assert.deepEqual(await played(clip.row.id), [200, { ok: true, copy: "lost", why: "gone" }]);
  assert.deepEqual([row().copy_state, row().copy_why], ["lost", "gone"], "its row says so, for any page that reads it");
  assert.equal(row().removed_at, null, "it is still in the Library: its stills and its words are still its file's");
  assert.equal(row().media_status, "ready");
  assert.deepEqual(w.returns(), [], "no return is asked for: nothing can give it back");
  assert.deepEqual(platformSaw(web), { asked: 0, deleted: [] });
  // AI asking for a moment of it is told in words it can say, not refused and not left waiting.
  const [status, said] = await copiesAsked({ moments: [{ key: "m", id: clip.row.id, at: 2 }] });
  assert.equal(status, 200);
  assert.equal(said.moments[0].file_id, null);
  assert.match(said.moments[0].wont, /no longer in the folder/);
});

test("each way an original is lost has its own word, one of a closed set", async () => {
  const cases = [
    [{ state: "gone", gone_at: daysAgo(2) }, "gone"],
    [{ state: "outside", gone_at: daysAgo(2) }, "outside"],
    [{ state: "no_access", gone_at: daysAgo(2) }, "no_access"],
    [{ state: "no_access", why: "not_found", gone_at: daysAgo(2) }, "not_found"],
    // No watched folder holds it: its account was disconnected, and its items went with it.
    [null, "no_origin"],
  ];
  for (const [item, loss] of cases) {
    const { w, clip } = clipWhoseOriginal(item);
    const held = await ensureCopy(w.db, T, clip.row.id, "play");
    assert.deepEqual([held.copy, held.loss], ["lost", loss]);
    assert.ok(FILE_COPY_LOSSES.includes(loss));
    assert.deepEqual([w.file(clip.row.id).copy_state, w.file(clip.row.id).copy_why], ["lost", loss]);
  }
  // The sets a screen has words for: every state, and every reason a copy waits or is lost.
  assert.deepEqual(FILE_COPY_STATES, ["here", "going", "away", "returning", "lost"]);
  assert.deepEqual(FILE_COPY_WHYS, [...FILE_COPY_WAITS, ...FILE_COPY_LOSSES]);
});

test("an original that comes back to its folder is fetched again: lost is not for ever", async () => {
  const { w, clip, row } = clipWhoseOriginal({ state: "gone", gone_at: daysAgo(1) });
  assert.equal((await ensureCopy(w.db, T, clip.row.id, "play")).copy, "lost");
  // Restored from the bin: the sync says the item is in again.
  Object.assign(w.item(clip.origin.id), { state: "in", gone_at: null });
  assert.equal((await ensureCopy(w.db, T, clip.row.id, "play")).copy, "returning");
  assert.deepEqual([row().copy_state, row().copy_why], ["away", null]);
  assert.equal(w.returns().length, 1);
});

test("play of a copy that is away answers that it is on its way, and that press is what asks for it", async () => {
  const clip = watchedClip({ copy_state: "away" });
  const w = world({ files: [clip.row], items: [clip.origin] });
  assert.deepEqual(await played(clip.row.id), [200, { ok: true, copy: "returning" }]);
  assert.equal(w.returns().length, 1);
  // Pressed again while it is on its way: the same answer, and no second job.
  assert.deepEqual(await played(clip.row.id), [200, { ok: true, copy: "returning" }]);
  assert.equal(w.returns().length, 1);
});

test("a purpose that only uses a copy never brings one back", async () => {
  const away = watchedClip({ copy_state: "away", copy_why: "room" });
  const lost = watchedClip({ copy_state: "lost", copy_why: "outside" }, { state: "outside", gone_at: daysAgo(1) });
  const w = world({ files: [away.row, lost.row], items: [away.origin, lost.origin] });
  for (const purpose of ["look", "digest", "upkeep"]) {
    const held = await ensureCopyOf(w.db, w.file(away.row.id), purpose);
    assert.deepEqual([held.copy, held.mediaRef, held.reason], ["away", null, "room"]);
    const gone = await ensureCopyOf(w.db, w.file(lost.row.id), purpose);
    assert.deepEqual([gone.copy, gone.mediaRef, gone.loss], ["lost", null, "outside"]);
  }
  assert.deepEqual(w.returns(), [], "nothing was asked back");
  assert.equal(w.asked.length, 0, "and no door was knocked on for it");
});

test("a copy that is here is given to whoever asks, and a use that wants it is written, at most once in a while", async () => {
  const clip = watchedClip({ copy_used_at: daysAgo(2) });
  const w = world({ files: [clip.row], items: [clip.origin] });
  const row = () => w.file(clip.row.id);
  const before = row().copy_used_at;
  // A use that only reads what is there writes nothing.
  assert.deepEqual((await ensureCopy(w.db, T, clip.row.id, "upkeep")).mediaRef, clip.row.media_ref);
  assert.equal(row().copy_used_at, before);
  const held = await ensureCopy(w.db, T, clip.row.id, "play");
  assert.deepEqual([held.copy, held.mediaRef], ["here", clip.row.media_ref]);
  const used = row().copy_used_at;
  assert.ok(Date.parse(used) >= NOW - 1000, "played: it is the most recently used now");
  // Shown to AI a moment later: one sitting is one write.
  await ensureCopy(w.db, T, clip.row.id, "moment");
  assert.equal(row().copy_used_at, used);
  assert.equal(LET_GO.touchEveryMs, 5 * 60_000);
});

test("a row from before copies could be let go is here: the door asks nothing of the database for it", async () => {
  const upload = videoRow({ source: "upload" });
  delete upload.copy_state;
  delete upload.copy_why;
  const w = world({ files: [upload] });
  const held = await ensureCopyOf(w.db, upload, "digest");
  assert.deepEqual([held.copy, held.mediaRef], ["here", upload.media_ref]);
  assert.equal((await ensureCopy(w.db, T, "cccccccc-0000-4000-8000-0000000000aa", "play")).copy, "none");
});

test("when AI proposes a video its clips are asked back then: the away ones return, the ones here are marked used", async () => {
  const away = watchedClip({ copy_state: "away" });
  const here = watchedClip({ copy_used_at: daysAgo(9) });
  const lost = watchedClip({ copy_state: "away" }, { state: "gone", gone_at: daysAgo(1) });
  const w = world({ files: [away.row, here.row, lost.row], items: [away.origin, here.origin, lost.origin] });
  const [status, said] = await copiesAsked({ warm: [away.row.id, here.row.id, lost.row.id] });
  assert.equal(status, 200);
  assert.deepEqual(said.warmed, [
    { id: away.row.id, copy: "returning" },
    { id: here.row.id, copy: "here" },
    { id: lost.row.id, copy: "lost" },
  ]);
  assert.deepEqual(
    w.returns().map((job) => job.payload.file_id),
    [away.row.id],
    "one return, for the clip that is away: asked for now, not at the owner's press",
  );
  assert.ok(Date.parse(w.file(here.row.id).copy_used_at) >= NOW - 1000, "the one here is not the next let go");
});

test("AI asking for a moment of a clip that is away is told it is coming, and that asking is what brings it", async () => {
  const clip = watchedClip({ copy_state: "away" });
  const w = world({ files: [clip.row], items: [clip.origin] });
  const [, said] = await copiesAsked({ frames: [{ key: "f", id: clip.row.id, at: 1 }] });
  assert.equal(said.frames[0].kept, false);
  assert.match(said.frames[0].wont, /being brought back/);
  assert.equal(w.returns().length, 1);
});
