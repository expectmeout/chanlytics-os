/**
 * How fast a watched folder's files arrive, and what holds them back (apps/edge/lib/files/takes/hand-out.ts and
 * step.ts; the review of 18 November 2026, findings 5, 6, 8 and 16): a workspace has a few takes in flight and the
 * next is handed as one ends, so a first watch arrives in one turn of the clock, not a few a turn; the clips being
 * prepared at the video platform are held under one number for every workspace, and its "too many at once" is a
 * short rest that spends no try; a kind that is paused is handed nothing; and bytes their provider's own checksum
 * says are already taken share the file, with no download.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { squarePng } from "../../look/_png.mjs";
import {
  STREAM_API,
  T,
  T2,
  TAKE_HAND_OUT,
  bytesOf,
  handOutTakes,
  itemRow,
  realFetch,
  runTakes,
  setPg,
  takeJob,
  theSync,
  theWeb,
  world,
} from "./_world.mjs";

const { settleTakenVideo } = await import(at("apps/edge/lib/files/takes/word.ts"));

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const MIB = 1_048_576;
/** A clip as Drive lists it; each seed is another clip. */
const clip = (seed) => ({
  mime: "video/quicktime",
  name: `IMG_${1500 + seed}.MOV`,
  seconds: 20,
  size: 50_000_000 + seed,
  bytes: bytesOf(MIB, seed),
});
/** A photo an iPhone made; each seed is another photo. */
const photo = (seed) => ({ mime: "image/heic", name: `IMG_${3000 + seed}.HEIC`, bytes: bytesOf(20_000, seed) });

/** So many waiting items, each with what Drive holds of it: newest first as they are numbered. */
function folderOf(count, held, over = () => ({})) {
  const items = [];
  const drive = {};
  for (let i = 0; i < count; i += 1) {
    const item = itemRow({
      provider_id: `drive-file-${i}`,
      kind: held(i).mime.startsWith("video/") ? "video" : "image",
      modified_at: new Date(Date.parse("2026-11-16T10:00:00Z") - i * 60_000).toISOString(),
      ...over(i),
    });
    items.push(item);
    drive[item.provider_id] = held(i);
  }
  return { items, drive };
}
const taking = (w) => w.tables.source_items.filter((i) => i.state === "taking").length;
const takeJobs = (w) => w.tables.jobs.filter((j) => j.kind === "source_take");

test("FINDING 5: a first watch of fifty photos arrives in one turn of the clock, five in flight, the next handed as one ends", async () => {
  const { items, drive } = folderOf(50, photo);
  const w = world({ items });
  theSync({ drive });
  theWeb({ drive });
  // The clock's own turn hands a workspace what it may have in flight, and no more.
  assert.equal(await handOutTakes(w.db), TAKE_HAND_OUT.inFlight);
  assert.equal(taking(w), 5);
  // Each take that ends hands its workspace's next one, so the rest follow without waiting for the clock.
  let most = 0;
  for (let ran = 0; ran < takeJobs(w).length; ran += 1) {
    most = Math.max(most, taking(w));
    assert.deepEqual(await takeJob(w, takeJobs(w)[ran]), { took: "in" });
  }
  assert.equal(takeJobs(w).length, 50, "every photo was handed its job in that one turn");
  assert.equal(w.tables.files.length, 50);
  assert.equal(
    w.tables.source_items.every((i) => i.state === "in"),
    true,
  );
  assert.equal(most, 5, "never more than five of a workspace's files in flight");
  const asked = w.handOuts.slice(1);
  assert.equal(asked.length, 50, "one hand-out as each take ends");
  assert.equal(
    asked.every((a) => a.p_tenant_id === T),
    true,
    "asked for that one workspace, never for every workspace's due files",
  );
  assert.equal(w.handOuts[0].p_tenant_id, null, "the clock's turn is the one that asks for all");
});

test("FINDING 5: five clips are with the video platform at once, and its word about one hands the next", async () => {
  const { items, drive } = folderOf(8, clip);
  const w = world({ items });
  theSync({ drive });
  const web = theWeb({ drive });
  const ends = await runTakes(w);
  assert.deepEqual(
    ends,
    Array.from({ length: 5 }, () => ({ took: "asked" })),
    "five asked, and three still wait",
  );
  assert.equal(web.copies.length, 5);
  assert.deepEqual([taking(w), w.tables.source_items.filter((i) => i.state === "waiting").length], [5, 3]);
  // The platform says one is playable: its item is in, and the workspace's next clip is handed its job at once.
  const first = w.tables.files[0];
  await settleTakenVideo(w.db, { fate: "ready", tenant_id: T, file_id: first.id, made: false }, 20);
  assert.equal(takeJobs(w).length, 6);
  assert.deepEqual(await takeJob(w, takeJobs(w).at(-1)), { took: "asked" });
  assert.equal(web.copies.length, 6);
});

test("FINDING 6: the clips being prepared for takes are held under one number for every workspace; photos still go", async () => {
  // Every workspace but ours has clips with the platform already: two short of what it prepares for takes at once.
  const elsewhere = Array.from({ length: TAKE_HAND_OUT.videosAtOnce - 2 }, () =>
    itemRow({ tenant_id: T2, state: "taking", file_id: randomUUID(), provider_id: `their-${randomUUID()}` }),
  );
  // Each is a clip on its way at the video platform: the one file a take left taking is never put back for.
  const onTheirWay = elsewhere.map((item) => ({
    id: item.file_id,
    tenant_id: T2,
    kind: "video",
    source: "drive",
    media_status: "uploading",
    removed_at: null,
  }));
  const ours = folderOf(5, (i) => (i < 4 ? clip(i) : photo(i)));
  const w = world({ tenants: [T, T2], items: [...elsewhere, ...ours.items], files: onTheirWay });
  theSync({ drive: ours.drive });
  theWeb({ drive: ours.drive });
  assert.equal(await handOutTakes(w.db), 3, "two clips, which is the platform's room, and the photo");
  const handed = takeJobs(w).map((j) => w.item(j.payload.item_id).kind);
  assert.deepEqual(handed.sort(), ["image", "video", "video"]);
  assert.equal(w.handOuts[0].p_videos_max, TAKE_HAND_OUT.videosAtOnce);
});

test('FINDING 6: the video platform\'s "too many at once" is a short rest that spends no try', async () => {
  const { items, drive } = folderOf(1, clip);
  const w = world({ items });
  theSync({ drive });
  const web = theWeb({ drive, busyCopies: 1 });
  assert.deepEqual(await runTakes(w), [{ took: "waits:busy" }]);
  const waits = w.item(items[0].id);
  assert.deepEqual([waits.state, waits.why, waits.take_tries, waits.file_id], ["waiting", "busy", 0, null]);
  const rest = Date.parse(waits.take_after) - Date.now();
  assert.ok(rest > 60_000 && rest <= 120_000, `about two minutes, not ${rest} ms`);
  assert.equal(w.tables.files.length, 0);
  // Asked again once it has rested, it is taken: nothing was wrong with the clip.
  w.nowMs = Date.now() + 3 * 60_000;
  assert.deepEqual(await runTakes(w), [{ took: "asked" }]);
  assert.equal(web.copies.length, 1);
});

test("FINDING 16: a paused kind is handed nothing, and no item flips to taking and back", async () => {
  const { items, drive } = folderOf(3, photo);
  // One whose take never ended, hours ago: with the kind running it would wait again and be handed its job.
  const stuck = itemRow({ state: "taking", updated_at: "2026-11-17T10:00:00.000Z", provider_id: "drive-stuck" });
  const w = world({ items: [...items, stuck] });
  theSync({ drive });
  theWeb({ drive });
  w.kindPaused = true;
  assert.equal(await handOutTakes(w.db), 0);
  assert.equal(takeJobs(w).length, 0);
  assert.deepEqual(
    w.tables.source_items.map((i) => i.state),
    ["waiting", "waiting", "waiting", "taking"],
    "each stands as it stood",
  );
  // Resumed, the hand-out goes on from where it was.
  w.kindPaused = false;
  assert.equal(await handOutTakes(w.db), 4);
});

/** A photo taken, and the same bytes uploaded to the folder again under another name. */
async function photoTakenTwice(second = {}) {
  const PHOTO = squarePng(600);
  const first = itemRow({ provider_id: "drive-first", kind: "image", name: "front.png" });
  const again = itemRow({
    provider_id: "drive-again",
    kind: "image",
    name: "front (1).png",
    modified_at: "2026-11-15T10:00:00.000Z",
    state: "listed",
  });
  const held = { mime: "image/png", name: "front.png", bytes: PHOTO, checksum: "md5-of-the-photo" };
  const drive = { [first.provider_id]: held, [again.provider_id]: { ...held, name: "front (1).png", ...second } };
  const w = world({ items: [first, again] });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "in" }]);
  return { w, web, first, again, PHOTO };
}
const downloads = (web) => web.calls.filter((c) => c.url.includes("alt=media")).length;

test("FINDING 8: bytes Drive's own checksum says are already taken share the file: no download, none of the day's takes", async () => {
  const { w, web, first, again } = await photoTakenTwice();
  const day = { ...w.tables.source_days[0] };
  w.item(again.id).state = "waiting";
  assert.deepEqual(await runTakes(w), [{ took: "in" }]);
  assert.deepEqual(
    [w.item(again.id).state, w.item(again.id).file_id],
    ["in", w.item(first.id).file_id],
    "one Library file, with one more origin",
  );
  assert.equal(w.tables.files.length, 1);
  assert.equal(downloads(web), 1, "the first take's, and no second");
  assert.equal(w.tables.source_days[0].units - day.units, 5, "its record alone was read");
  assert.deepEqual(
    [w.tables.source_days[0].takes, w.tables.source_days[0].bytes],
    [day.takes, day.bytes],
    "the day's takes and bytes are not spent on a file the Library has",
  );
});

test("FINDING 8: a file its owner removed stays removed when it is uploaded again, and other bytes are taken as new", async () => {
  // The first one's file was removed by its owner: its item says so, and the same bytes again are let go too.
  const removed = await photoTakenTwice();
  Object.assign(removed.w.item(removed.first.id), { state: "let_go", file_id: null });
  removed.w.item(removed.again.id).state = "waiting";
  assert.deepEqual(await runTakes(removed.w), [{ took: "let_go" }]);
  assert.equal(downloads(removed.web), 1);

  // The same name and size, another checksum: other bytes, so it is read and proven as any new file is.
  const other = await photoTakenTwice({ checksum: "md5-of-another" });
  other.w.item(other.again.id).state = "waiting";
  assert.deepEqual(await runTakes(other.w), [{ took: "in" }]);
  assert.equal(downloads(other.web), 2, "it is downloaded: its provider does not say it is the same");

  // The one taken first no longer holds a file (it left the Library some other way): nothing to share, so it is read.
  const gone = await photoTakenTwice();
  gone.w.tables.files[0].removed_at = new Date().toISOString();
  gone.w.item(gone.again.id).state = "waiting";
  await runTakes(gone.w);
  assert.equal(downloads(gone.web), 2);

  // A provider that gives no checksum is taken by its bytes, as before.
  const unsaid = await photoTakenTwice({ checksum: null });
  unsaid.w.item(unsaid.again.id).state = "waiting";
  await runTakes(unsaid.w);
  assert.equal(downloads(unsaid.web), 2);
});

test("FINDING 8: a clip of bytes already taken costs no range read and asks the video platform for nothing", async () => {
  const first = itemRow({ provider_id: "drive-clip", name: "IMG_1561.MOV" });
  const again = itemRow({ provider_id: "drive-clip-again", name: "IMG_1561 (1).MOV", state: "listed" });
  const held = { ...clip(1), checksum: "md5-of-the-clip" };
  const drive = { [first.provider_id]: held, [again.provider_id]: held };
  const w = world({ items: [first, again] });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "asked" }]);
  // The platform says it is playable, so the first item is in; then the folder holds the same clip again.
  await settleTakenVideo(w.db, { fate: "ready", tenant_id: T, file_id: w.tables.files[0].id, made: false }, 20);
  const before = web.calls.length;
  w.item(again.id).state = "waiting";
  assert.deepEqual(await runTakes(w), [{ took: "in" }]);
  assert.equal(w.item(again.id).file_id, w.tables.files[0].id);
  assert.equal(web.calls.length, before, "Drive's bytes are not read, and the platform is not asked");
  assert.equal(web.copies.length, 1);
  assert.equal(
    web.calls.some((c) => c.url.startsWith(`${STREAM_API}?search=`)),
    false,
  );
});

test("a video its provider has not measured yet waits for its length as long as the sync says, and no longer", async () => {
  const hour = 3_600_000;
  const now = Date.parse("2026-11-17T20:00:00Z");
  const { items, drive } = folderOf(3, clip, (i) => ({
    seconds: null,
    // The first is a fresh upload; the second's wait is over; the third never had one (its provider gave no upload time).
    length_until: [new Date(now + hour).toISOString(), new Date(now - 1000).toISOString(), null][i],
  }));
  const w = world({ items });
  theSync({ drive });
  theWeb({ drive });
  assert.equal(w.nowMs, now);
  assert.equal(await handOutTakes(w.db), 2);
  assert.deepEqual(
    items.map((item) => w.item(item.id).state),
    ["waiting", "taking", "taking"],
    "the one still waited for is handed no job, and holds no place in flight",
  );
  assert.equal(w.item(items[0].id).why, null, "it only waits: nothing is wrong with it");
  // Its wait is over (its length came, or a day passed): it is handed its job like any other.
  w.nowMs = now + 2 * hour;
  assert.equal(await handOutTakes(w.db), 1);
  assert.equal(w.item(items[0].id).state, "taking");
});

test("a take left taking with a file that is not a clip on its way waits again, and its next take finds the file it holds", async () => {
  const stale = "2026-11-17T10:00:00.000Z";
  // It was in, left its folder and came back, and the job it was handed was lost before it ran.
  const held = { id: randomUUID(), tenant_id: T, kind: "image", source: "drive", media_status: null, removed_at: null };
  const lost = itemRow({
    kind: "image",
    state: "taking",
    file_id: held.id,
    updated_at: stale,
    provider_id: "drive-back",
  });
  // A clip on its way at the video platform is the platform's to finish, however long it takes.
  const coming = {
    id: randomUUID(),
    tenant_id: T,
    kind: "video",
    source: "drive",
    media_status: "uploading",
    removed_at: null,
  };
  const fetching = itemRow({ state: "taking", file_id: coming.id, updated_at: stale, provider_id: "drive-clip" });
  const w = world({ items: [lost, fetching], files: [held, coming] });
  const opened = theSync({ drive: {} });
  const web = theWeb({ drive: {} });
  assert.deepEqual(await runTakes(w), [{ took: "in" }]);
  const back = w.item(lost.id);
  assert.deepEqual([back.state, back.file_id, back.why], ["in", held.id, null]);
  assert.deepEqual(
    [w.item(fetching.id).state, w.item(fetching.id).file_id, w.item(fetching.id).why],
    ["taking", coming.id, null],
    "the clip on its way is left as it stands",
  );
  assert.deepEqual([opened.length, web.calls.length], [0, 0], "nothing is asked of Drive for a file already here");
  assert.deepEqual(w.unitWrites, []);
});
