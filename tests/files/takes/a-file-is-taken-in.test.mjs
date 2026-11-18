/**
 * A watched folder's file taken into the Library (apps/edge/lib/files/takes, the footage sources plan's P3), run over a
 * database in memory, a Drive and a video platform that answer from memory, and a pretend sync. The clock hands a
 * waiting item its job and the real handler runs it: a photo's bytes go into Storage and it is a file with its look
 * asked for; a clip is proven by its first MiB and fetched by the video platform from the relay's address, under a
 * ticket and never a Google key; the same bytes already in the Library are one file with one more origin; what its
 * owner removed stays removed; changed bytes are a new file.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { squarePng } from "../../look/_png.mjs";
import { linesOf } from "../../_log-lines.mjs";
import { importSrc } from "../../_source.mjs";
import {
  DRIVE_KEY,
  REFRESH_TOKEN,
  RELAY_URL,
  STREAM_API,
  T,
  TICKET_KEY,
  bytesOf,
  itemRow,
  printOf,
  realFetch,
  runTakes,
  takeJob,
  setPg,
  theSync,
  theWeb,
  world,
} from "./_world.mjs";

const { readRelayTicket } = await importSrc("packages/channels/src/files/relay-ticket.ts");

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const MIB = 1_048_576;
const PHOTO = squarePng(600);
/** An iPhone clip as Drive lists it: 255 MB, 38 seconds, of which only the first MiB is ever read here. */
const CLIP = {
  mime: "video/quicktime",
  name: "IMG_1561.MOV",
  seconds: 38.1,
  size: 255_147_868,
  bytes: bytesOf(MIB, 1),
};
const clipPrint = printOf(CLIP.bytes, CLIP.size);

/** One waiting item and what Drive holds of it. */
function oneItem(held, over = {}) {
  const item = itemRow({
    provider_id: "drive-file-1",
    kind: held.mime.startsWith("video/") ? "video" : "image",
    ...over,
  });
  const drive = { [item.provider_id]: held };
  return { item, drive };
}

test("a photo comes in: its bytes into Storage, a file by the one door, filed, its look asked for, its item in", async () => {
  const { item, drive } = oneItem({ mime: "image/png", name: "Front Desk.PNG", bytes: PHOTO });
  const w = world({ items: [item] });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "in" }]);
  const [file] = w.tables.files;
  assert.deepEqual(
    [file.kind, file.status, file.source, file.name, file.mime, file.bytes, file.width, file.height],
    ["image", "filed", "drive", "front-desk", "image/png", PHOTO.length, 600, 600],
  );
  assert.equal(file.fingerprint, printOf(PHOTO, PHOTO.length), "the fingerprint an upload of the same photo has");
  assert.deepEqual(w.bucket.uploaded, [{ path: `${T}/${file.id}/original.png`, bytes: PHOTO.length }]);
  assert.ok(
    w.tables.jobs.some((j) => j.kind === "file_look" && j.payload.file_id === file.id),
    "the look, as an upload's",
  );
  const taken = w.item(item.id);
  assert.deepEqual([taken.state, taken.file_id, taken.why, taken.bytes], ["in", file.id, null, PHOTO.length]);
  assert.equal(web.calls.filter((c) => c.url.includes("alt=media")).length, 1, "one download, whole");
  assert.equal(w.tables.source_days[0].units, 205, "the record's 5 and the download's 200, counted");
  assert.deepEqual(w.unitWrites, [205], "in one write as the job ends, not one a call");
  assert.equal(w.tables.source_days[0].bytes, PHOTO.length);
  // Its look-print is taken where an upload's is, as its look starts, from the copy Storage makes (so a HEIC is
  // printed too): none is carried to the door, and a look-alike found online meets it there (00630 file_printed).
  const door = w.asked.find((a) => a.door === "file_found");
  assert.deepEqual([door.p_source, door.p_status, door.p_print ?? null], ["drive", "filed", null]);
});

test("a photo an iPhone made (HEIC) is kept as Drive calls it, and the look reads it", async () => {
  const heic = bytesOf(40_000, 9);
  const { item, drive } = oneItem({ mime: "image/heic", name: "IMG_3190.HEIC", bytes: heic });
  const w = world({ items: [item] });
  theSync({ drive });
  theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "in" }]);
  assert.deepEqual(
    [w.tables.files[0].mime, w.tables.files[0].width, w.tables.files[0].name],
    ["image/heic", null, "img-3190"],
  );
  assert.match(w.bucket.uploaded[0].path, /original\.heic$/);
});

test("a photo already in the Library is one file with one more origin, and one its owner removed stays removed: nothing is stored", async () => {
  const print = printOf(PHOTO, PHOTO.length);
  const upload = {
    id: "ffffffff-0000-4000-8000-000000000005",
    tenant_id: T,
    kind: "image",
    source: "upload",
    fingerprint: print,
    removed_at: null,
  };
  const twin = oneItem({ mime: "image/png", name: "front.png", bytes: PHOTO });
  const w = world({ items: [twin.item], files: [upload] });
  theSync({ drive: twin.drive });
  theWeb({ drive: twin.drive });
  assert.deepEqual(await runTakes(w), [{ took: "in" }]);
  assert.deepEqual([w.item(twin.item.id).state, w.item(twin.item.id).file_id], ["in", upload.id]);
  assert.equal(w.tables.files.length, 1, "one Library file");
  assert.deepEqual(
    [w.bucket.uploaded.length, w.bucket.removed.length],
    [0, 0],
    "no second copy is stored, even for a moment",
  );

  const gone = oneItem({ mime: "image/png", name: "front.png", bytes: PHOTO });
  const w2 = world({ items: [gone.item], letGo: [{ tenant_id: T, fingerprint: print }] });
  theSync({ drive: gone.drive });
  theWeb({ drive: gone.drive });
  assert.deepEqual(await runTakes(w2), [{ took: "let_go" }]);
  assert.deepEqual([w2.item(gone.item.id).state, w2.item(gone.item.id).file_id], ["let_go", null]);
  assert.equal(w2.tables.files.length, 0);
  assert.equal(w2.bucket.uploaded.length, 0);
});

test("what only claims to be a photo, or is too small to use, is passed over and nothing is stored", async () => {
  const cases = [
    [{ mime: "image/jpeg", name: "notes.jpg", bytes: bytesOf(5_000, 3) }, "not_media:unreadable"],
    [{ mime: "image/png", name: "icon.png", bytes: squarePng(80) }, "not_media:too_small"],
  ];
  for (const [held, took] of cases) {
    const { item, drive } = oneItem(held);
    const w = world({ items: [item] });
    theSync({ drive });
    theWeb({ drive });
    assert.deepEqual(await runTakes(w), [{ took }]);
    assert.equal(w.tables.files.length, 0);
    assert.equal(w.bucket.uploaded.length, 0);
    assert.equal(w.item(item.id).state, "not_media");
  }
});

test("a clip comes in by the relay: proven by its first MiB, room judged, then fetched by the video platform", async () => {
  const { item, drive } = oneItem(CLIP);
  const w = world({ items: [item] });
  theSync({ drive });
  const web = theWeb({ drive });
  const { result: ends, lines } = await linesOf(() => runTakes(w));
  assert.deepEqual(ends, [{ took: "asked" }]);

  // Drive was asked once, for the first MiB alone: 255 MB never passed through the app.
  const reads = web.calls.filter((c) => c.url.includes("alt=media"));
  assert.equal(reads.length, 1);
  assert.equal(reads[0].headers.range, `bytes=0-${MIB - 1}`);

  // The door judged first with no copy named, then wrote the row with the copy the platform answered.
  const doors = w.asked.filter((a) => a.door === "file_video_sourced");
  assert.deepEqual(
    doors.map((d) => d.p_media_ref),
    [null, web.copies[0].uid],
  );
  assert.deepEqual(
    [doors[1].p_bytes, doors[1].p_seconds, doors[1].p_fingerprint, doors[1].p_mime, doors[1].p_name],
    [CLIP.size, 38.1, clipPrint, "video/quicktime", "img-1561"],
  );

  // The address the platform was sent to is the relay's, for this item, under a ticket the app signed for hours.
  const address = new URL(web.copies[0].input);
  assert.equal(address.origin, RELAY_URL);
  assert.equal(address.pathname, `/clip/${item.id}/clip.mov`);
  const ticket = readRelayTicket(TICKET_KEY, address.searchParams.get("ticket"), Date.now());
  assert.equal(ticket.ok, true);
  assert.equal(ticket.item, item.id, "the ticket names this one item");
  const hoursLeft = (ticket.expiresAt * 1000 - Date.now()) / 3_600_000;
  assert.ok(hoursLeft > 5.9 && hoursLeft <= 6, `a ticket runs six hours, not ${hoursLeft}`);
  assert.equal(web.copies[0].requireSignedURLs, true);

  // The row is on its way, counted in the videos' minutes by its own length, and the item is its origin, still taking.
  const [file] = w.tables.files;
  assert.deepEqual(
    [file.kind, file.status, file.source, file.media_status, file.media_ref, file.seconds, file.bytes],
    ["video", "filed", "drive", "uploading", web.copies[0].uid, 38.1, CLIP.size],
  );
  assert.equal(
    web.copies[0].meta.name,
    `take:${item.id}`,
    "the copy is named for its item, so one left with no row can be traced to its take",
  );
  const taken = w.item(item.id);
  assert.deepEqual([taken.state, taken.file_id, taken.bytes, taken.seconds], ["taking", file.id, CLIP.size, 38.1]);

  // No Google key in any address or log line, and no refresh token anywhere at all.
  const said = JSON.stringify({ calls: web.calls.map((c) => [c.url, c.body]), lines, tables: w.tables });
  for (const call of web.calls)
    assert.ok(!call.url.includes(DRIVE_KEY), `no key in ${new URL(call.url).host}'s address`);
  assert.ok(!JSON.stringify(lines).includes(DRIVE_KEY), "no key in a log line");
  assert.ok(!web.copies[0].input.includes(DRIVE_KEY), "the platform is handed a ticket, never a key");
  assert.ok(!said.includes(REFRESH_TOKEN), "the refresh token never leaves Vault");
  const keyed = web.calls.filter((c) => (c.headers.authorization ?? "").includes(DRIVE_KEY));
  assert.ok(
    keyed.every((c) => new URL(c.url).host === "www.googleapis.com"),
    "the key is shown to Google alone",
  );
});

test("the same clip already in the Library, from a phone, is one file with one more origin: nothing is fetched", async () => {
  const upload = {
    id: "ffffffff-0000-4000-8000-000000000001",
    tenant_id: T,
    kind: "video",
    source: "upload",
    fingerprint: clipPrint,
    media_ref: "0".repeat(32),
    media_status: "ready",
    seconds: 38.1,
    removed_at: null,
  };
  const { item, drive } = oneItem(CLIP);
  const second = itemRow({
    provider_id: "drive-file-2",
    name: "copy of IMG_1561.MOV",
    modified_at: "2026-11-15T10:00:00.000Z",
  });
  drive[second.provider_id] = { ...CLIP, name: second.name };
  const w = world({ items: [item, second], files: [upload] });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "in" }, { took: "in" }]);
  assert.equal(w.tables.files.length, 1, "one Library file");
  assert.deepEqual(
    [w.item(item.id).file_id, w.item(second.id).file_id, w.item(item.id).state, w.item(second.id).state],
    [upload.id, upload.id, "in", "in"],
    "and two origins that both point at it",
  );
  assert.equal(web.copies.length, 0, "the video platform is never asked");
  assert.equal(w.tables.source_days[0].bytes, 0, "and no bytes are spent");
});

test("a clip its owner removed from the Library is not brought back by the folder", async () => {
  const { item, drive } = oneItem(CLIP);
  const w = world({ items: [item], letGo: [{ tenant_id: T, fingerprint: clipPrint }] });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "let_go" }]);
  assert.deepEqual([w.item(item.id).state, w.item(item.id).file_id], ["let_go", null]);
  assert.equal(w.tables.files.length, 0);
  assert.equal(web.copies.length, 0);
});

test("a clip whose bytes changed is a new file: its fingerprint is not the old one's", async () => {
  const old = {
    id: "ffffffff-0000-4000-8000-000000000002",
    tenant_id: T,
    kind: "video",
    source: "drive",
    fingerprint: clipPrint,
    media_ref: "1".repeat(32),
    media_status: "ready",
    seconds: 38.1,
    removed_at: null,
  };
  const edited = { ...CLIP, size: 250_000_000, bytes: bytesOf(MIB, 2) };
  const { item, drive } = oneItem(edited);
  const w = world({ items: [item], files: [old] });
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "asked" }]);
  assert.equal(w.tables.files.length, 2, "the old file stays as it was, and the new bytes are their own file");
  assert.notEqual(w.tables.files[1].fingerprint, clipPrint);
  assert.equal(w.item(item.id).file_id, w.tables.files[1].id);
  assert.equal(web.copies.length, 1);
});

test("a video over the caps is said to be too big for free, and one that grew since it was listed is not taken", async () => {
  const long = oneItem({ ...CLIP, seconds: 3_600, size: 2_000_000_000 });
  const w = world({ items: [long.item] });
  theSync({ drive: long.drive });
  const web = theWeb({ drive: long.drive });
  assert.deepEqual(await runTakes(w), [{ took: "too_big:bytes" }]);
  assert.deepEqual([w.item(long.item.id).state, w.item(long.item.id).why], ["too_big", "bytes"]);
  assert.equal(web.calls.length, 0, "not one byte is read to learn it");

  // Listed at 400 MB; by the time its first MiB is read, Drive says it is 600 MB.
  const grew = oneItem(CLIP);
  const w2 = world({ items: [grew.item] });
  theSync({ drive: grew.drive });
  const web2 = theWeb({ drive: { [grew.item.provider_id]: { ...CLIP, size: 600_000_000 } } });
  assert.deepEqual(await runTakes(w2), [{ took: "too_big:bytes" }]);
  assert.equal(web2.copies.length, 0);
});

test("a clip its door calls longer than AI can watch is ended as too big, by its length, and nothing is fetched", async () => {
  // The screen refuses a clip whose record says over ten minutes; the door's word is the same rule, asked again where
  // a record said no length. Either way it is said once, as too big.
  const { item, drive } = oneItem({ ...CLIP, seconds: null }, { first_seen_at: "2026-11-15T20:00:00Z" });
  const w = world({ items: [item] });
  w.doorCallsLong = true;
  theSync({ drive });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ took: "too_big:seconds" }]);
  assert.deepEqual([w.item(item.id).state, w.item(item.id).why], ["too_big", "seconds"]);
  assert.equal(web.calls.filter((c) => c.url.includes("/stream/copy")).length, 0, "the video platform is never asked");
  assert.equal(w.tables.files.length, 0);
});

test("a job run again asks for no second copy, and a take another writer ended is left alone", async () => {
  const { item, drive } = oneItem(CLIP);
  const w = world({ items: [item] });
  theSync({ drive });
  const web = theWeb({ drive });
  await runTakes(w);
  const job = w.tables.jobs.find((j) => j.kind === "source_take");
  assert.deepEqual(await takeJob(w, job), {
    skipped: "its clip is with the video platform",
  });
  assert.equal(web.copies.length, 1);
  assert.equal(w.tables.files.length, 1);

  // The sync marked it gone meanwhile: the job finds nothing to do, and writes nothing over it.
  Object.assign(w.item(item.id), { state: "gone", file_id: null });
  assert.deepEqual(await takeJob(w, job), { skipped: "the item is gone" });
  assert.equal(w.item(item.id).state, "gone");
});

/** A Library file a watched folder brought before, as its row stands. */
const heldFile = (over = {}) => ({
  id: "ffffffff-0000-4000-8000-000000000007",
  tenant_id: T,
  kind: "image",
  source: "drive",
  fingerprint: "a-print-of-its-own",
  media_ref: null,
  media_status: null,
  removed_at: null,
  ...over,
});

test("a file that left its folder and came back is in again with the file it had: nothing is asked, read or spent", async () => {
  // The sync keeps the file on the row of an item that was in, left and is seen again, and asks for it again.
  for (const held of [heldFile(), heldFile({ kind: "video", media_ref: "copy-1", media_status: "ready" })]) {
    const { item, drive } = oneItem(held.kind === "video" ? CLIP : { mime: "image/png", name: "a.png", bytes: PHOTO }, {
      file_id: held.id,
      // A take of it that never ended, before it left: the hand-out keeps that reason on a row it hands out.
      why: "lost",
    });
    const w = world({ items: [item], files: [held] });
    const opened = theSync({ drive });
    const web = theWeb({ drive });
    assert.deepEqual(await runTakes(w), [{ took: "in" }]);
    const back = w.item(item.id);
    assert.deepEqual([back.state, back.file_id, back.why, back.take_after], ["in", held.id, null, null]);
    assert.deepEqual([opened.length, web.calls.length], [0, 0], "no key is asked for and no byte is read");
    assert.deepEqual([w.unitWrites, w.tables.source_days], [[], []], "none of the day's budget is spent");
    assert.equal(w.tables.files.length, 1, "one Library file, as before");
    assert.equal(w.asked.length, 0, "no door is knocked on");
  }
});

test("one that came back whose file is no longer there lets go of it and is taken as any waiting file", async () => {
  // Its owner removed the file while it was away: the door says so, and it stays removed.
  const print = printOf(PHOTO, PHOTO.length);
  const removed = heldFile({ fingerprint: print, removed_at: "2026-11-12T09:00:00.000Z" });
  const gone = oneItem({ mime: "image/png", name: "front.png", bytes: PHOTO }, { file_id: removed.id });
  const w = world({ items: [gone.item], files: [removed], letGo: [{ tenant_id: T, fingerprint: print }] });
  theSync({ drive: gone.drive });
  theWeb({ drive: gone.drive });
  assert.deepEqual(await runTakes(w), [{ took: "let_go" }]);
  assert.deepEqual([w.item(gone.item.id).state, w.item(gone.item.id).file_id], ["let_go", null]);
  assert.equal(w.bucket.uploaded.length, 0);

  // Its clip was never prepared, and the item was away when the platform said so: it is fetched again, as a new file.
  const failed = heldFile({ kind: "video", media_ref: "copy-0", media_status: "failed" });
  const again = oneItem(CLIP, { file_id: failed.id });
  const w2 = world({ items: [again.item], files: [failed] });
  theSync({ drive: again.drive });
  const web = theWeb({ drive: again.drive });
  assert.deepEqual(await runTakes(w2), [{ took: "asked" }]);
  assert.equal(web.copies.length, 1, "one copy asked of the video platform");
  const fresh = w2.tables.files.find((f) => f.id !== failed.id);
  assert.deepEqual([w2.item(again.item.id).state, w2.item(again.item.id).file_id], ["taking", fresh.id]);

  // And a file that is not there at all (purged) holds nothing either.
  const lost = oneItem({ mime: "image/png", name: "front.png", bytes: PHOTO }, { file_id: removed.id });
  const w3 = world({ items: [lost.item] });
  theSync({ drive: lost.drive });
  theWeb({ drive: lost.drive });
  assert.deepEqual(await runTakes(w3), [{ took: "in" }]);
  assert.equal(w3.item(lost.item.id).file_id, w3.tables.files[0].id, "its new file, not the one it named");
});

test("the database failing after the platform took the clip throws, and lets the copy go where no row holds it", async () => {
  const { item, drive } = oneItem(CLIP);
  const w = world({ items: [item] });
  theSync({ drive });
  const web = theWeb({ drive });
  const real = w.db.rpc.bind(w.db);
  let doors = 0;
  // The judging answers; the write, after the platform was asked, loses its connection.
  w.db.rpc = (name, args) => {
    if (name === "file_video_sourced" && (doors += 1) === 2) w.doorThrows = "connection reset";
    return real(name, args);
  };
  await assert.rejects(runTakes(w), /connection reset/);
  assert.deepEqual(
    web.calls.filter((c) => c.url.startsWith(STREAM_API)).map((c) => c.method),
    ["POST", "DELETE"],
    "asked, then let go",
  );
  assert.equal(w.tables.files.length, 0);
  assert.equal(w.item(item.id).state, "taking", "the ledger tries the job again");
});

test("a folder that is not being read is not read here either: its item waits, and Drive is never asked", async () => {
  const { item, drive } = oneItem(CLIP);
  const w = world({ items: [item] });
  theSync({ drive, closed: "the account is needs_reconnect" });
  const web = theWeb({ drive });
  assert.deepEqual(await runTakes(w), [{ skipped: "the account is needs_reconnect" }]);
  assert.deepEqual([w.item(item.id).state, w.item(item.id).why], ["waiting", "folder"]);
  assert.equal(web.calls.length, 0);

  // And a folder paused or stopped is handed no job at all.
  const paused = world({ items: [itemRow()], sourceState: "paused" });
  assert.deepEqual(await runTakes(paused), []);
});

test("an item Drive will not give is a failed try: tried twice more, then it says it failed", async () => {
  const { item, drive } = oneItem(CLIP);
  const w = world({ items: [item] });
  theSync({ drive: {} });
  theWeb({ drive });
  for (const tries of [1, 2]) {
    assert.deepEqual(await runTakes(w), [{ took: "unread:gone" }]);
    assert.deepEqual(
      [w.item(item.id).state, w.item(item.id).why, w.item(item.id).take_tries],
      ["waiting", "retry", tries],
    );
    w.item(item.id).take_after = null;
  }
  assert.deepEqual(await runTakes(w), [{ took: "unread:gone" }]);
  assert.deepEqual([w.item(item.id).state, w.item(item.id).why], ["failed", "unreadable"]);
  assert.deepEqual(await runTakes(w), [], "a failed item is handed no more jobs");
});
