/**
 * A watched folder's read (the footage sources plan, P2; job kind source_read), run over a database in memory against
 * a Drive that answers from memory: its provider's changes read from the place its row keeps. What the plan asks of
 * it is proved here by running it: a crash between keeping a page and moving the place neither loses nor doubles a
 * file; a change in a shared drive is seen; what changed elsewhere in the account is never named; deleted, moved out
 * and unreadable are told apart; and a folder whose account or connector no longer lets it be read is paused.
 */
import crypto from "node:crypto";
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { driveRefusal } from "./_fake-drive.mjs";
import { CONNECTION, OWNER, ROOT, SOURCE, firstWalk, runJobs, schedule, setEnv, world } from "./_world.mjs";

setEnv();
const { SOURCE_PACE } = await import(at("apps/edge/lib/files/sources/pace.ts"));
const { SOURCE_WORDS } = await import(at("apps/edge/lib/files/sources/words.ts"));

let w;
beforeEach(() => resetBreakers());
afterEach(() => w?.restore());

const stateOf = (id) => w.item(id)?.state;
/** One read of the world's folder, asked for and run with whatever it hands on. */
const read = async (world_ = w) => {
  schedule(world_, "source_read", { source_id: SOURCE }, [SOURCE]);
  return runJobs(world_);
};

/** A watched folder after its first walk and its first read, the Drive's record of calls cleared. */
async function watched(build, source = {}) {
  w = world({ source });
  w.drive.folder(ROOT, "Footage", null, source.drive_id ? { driveId: source.drive_id } : {});
  build?.(w.drive);
  await firstWalk(w);
  w.drive.calls.length = 0;
  return w;
}
const tree = (drive) =>
  drive
    .folder("sub-1", "November", ROOT)
    .folder("elsewhere", "Private", null)
    .video("clip-1", "a.MOV", ROOT)
    .video("clip-2", "b.MOV", ROOT)
    .video("clip-3", "c.MOV", "sub-1")
    .video("clip-4", "d.MOV", "sub-1");

/* -------------------------------------------------------------------------------------------- what a read finds -- */

test("a new clip in the folder is listed and waits, and what changed elsewhere in the account is never named", async () => {
  await watched(tree);
  w.drive.video("clip-new", "IMG_9000.MOV", "sub-1").busyElsewhere(6);
  const [answer] = await read();

  assert.equal(stateOf("clip-new"), "waiting");
  assert.equal(w.item("clip-new").name, "IMG_9000.MOV");
  assert.deepEqual(
    { changes: answer.read.changes, inside: answer.read.inside, added: answer.read.added },
    { changes: 7, inside: 1, added: 1 },
  );
  const records = w.drive.calls.filter((call) => call.path.startsWith("/drive/v3/files/"));
  assert.deepEqual(
    records.map((call) => call.path),
    ["/drive/v3/files/clip-new"],
    "only the item inside the folder is read by its own record",
  );
  assert.equal(
    w.tables.source_items.some((row) => row.provider_id.startsWith("doc-")),
    false,
    "nothing of the rest of the account is kept",
  );
  const [list] = w.drive.calls.filter((call) => call.path === "/drive/v3/changes");
  assert.doesNotMatch(list.query.fields, /name/, "the list is asked for ids, never a name");
  assert.equal(w.drive.units(), 105, "a read that found one item costs a list and one record");
  assert.equal(answer.read.units, 105, "and the read says what it spent");
});

test("a document changed inside the folder is never read or kept, and is no change inside for the pace", async () => {
  await watched(tree);
  // Someone edits a price list in the watched folder, and a RAW photo lands beside it.
  w.drive.put({
    id: "doc-in",
    name: "Price list",
    mimeType: "application/vnd.google-apps.document",
    parents: ["sub-1"],
  });
  const [docOnly] = await read();
  assert.deepEqual([docOnly.read.changes, docOnly.read.inside], [1, 0], "a change, and none inside");
  assert.equal(w.drive.count("/drive/v3/files/*"), 0, "its record is not asked for");
  assert.equal(w.item("doc-in"), undefined, "and it has no row and no name here");
  assert.equal(w.source().busy_reads, 1, "for the pace it is a change elsewhere");

  w.drive.put({ id: "raw-in", name: "IMG_2.dng", mimeType: "image/x-adobe-dng", parents: ["sub-1"], size: 30_000_000 });
  const [raw] = await read();
  assert.equal(raw.read.inside, 1);
  assert.equal(
    stateOf("raw-in"),
    "not_media",
    "a photo of a type the Library does not take is listed, and passed over",
  );
});

test("a change inside a large tree does not bring its walk forward past what its last walk spent", async () => {
  await watched(tree);
  // Its last whole walk spent 170,000 units a moment ago: the next is thirty days on.
  const inThirtyDays = new Date(Date.now() + SOURCE_PACE.rewalkLongestMs).toISOString();
  Object.assign(w.source(), {
    walk_units: 170_000,
    reconciled_at: new Date().toISOString(),
    next_walk_at: inThirtyDays,
  });
  w.drive.video("clip-new", "e.MOV", ROOT);
  await read();
  assert.equal(stateOf("clip-new"), "waiting", "the change itself is read at once");
  assert.equal(w.source().next_walk_at, inThirtyDays, "and the net under it stays where its cost put it");

  // A small tree that changed is walked within a day, as before.
  Object.assign(w.source(), { walk_units: 300, next_walk_at: inThirtyDays });
  w.drive.video("clip-newer", "f.MOV", ROOT);
  await read();
  const next = Date.parse(w.source().next_walk_at) - Date.now();
  assert.ok(next > SOURCE_PACE.rewalkMs - 60_000 && next <= SOURCE_PACE.rewalkMs, `a day on (${next})`);
});

test("a crash between keeping a page and moving the place neither loses nor doubles a file", async () => {
  await watched(tree);
  const place = w.source().change_cursor;
  w.drive.video("clip-new", "e.MOV", ROOT).photo("photo-new", "f.jpg", "sub-1");

  // The items are kept, and then the write that moves the place fails: the job dies there.
  w.faults["media_sources.update"] = { message: "the connection was lost" };
  await assert.rejects(() => read(), /cannot move the watched folder's place/);
  assert.equal(w.source().change_cursor, place, "the place did not move");
  assert.equal(stateOf("clip-new"), "waiting", "what the page held was already kept");

  // The ledger runs it again: the same page is read from the same place, and nothing is written twice.
  delete w.faults["media_sources.update"];
  const [again] = await read();
  assert.equal(again.read.added, 0, "nothing was new the second time");
  assert.notEqual(w.source().change_cursor, place, "now the place moved");
  const ids = w.items().map((row) => row.provider_id);
  assert.equal(new Set(ids).size, ids.length, "each item once");
  assert.deepEqual([stateOf("clip-new"), stateOf("photo-new")], ["waiting", "waiting"], "none lost");

  // And a crash before anything of the page is kept loses nothing either.
  w.drive.video("clip-later", "g.MOV", ROOT);
  w.faults["source_items.upsert"] = { message: "the connection was lost" };
  const before = w.source().change_cursor;
  await assert.rejects(() => read());
  assert.equal(w.source().change_cursor, before);
  delete w.faults["source_items.upsert"];
  await read();
  assert.equal(stateOf("clip-later"), "waiting");
});

test("two reads of one folder cannot both move its place", async () => {
  await watched(tree);
  w.drive.video("clip-new", "e.MOV", ROOT);
  // While this read is asking for the item's record, another read moves the folder's place.
  w.drive.onEachCall((call) => {
    if (call.path === "/drive/v3/files/clip-new") w.source().change_cursor = "moved-by-another-read";
  });
  const [answer] = await read();
  assert.equal(answer.read.ended, false, "it stops, and writes no pace of its own");
  assert.equal(w.source().change_cursor, "moved-by-another-read", "the other read's place stands");
  assert.equal(w.items().filter((row) => row.provider_id === "clip-new").length, 1, "and the item is kept once");
});

test("a change in a shared drive is seen: its changes are read from that drive's own list", async () => {
  await watched((drive) => drive.video("clip-1", "a.MOV", ROOT, { driveId: "drive-9" }), { drive_id: "drive-9" });
  w.drive.video("clip-new", "b.MOV", ROOT, { driveId: "drive-9" });
  // The same person is busy in their own Drive: none of that is in the shared drive's list.
  w.drive.busyElsewhere(20);
  const [answer] = await read();
  assert.equal(stateOf("clip-new"), "waiting");
  assert.equal(answer.read.changes, 1, "the shared drive's list holds only what changed in it");
  const [list] = w.drive.calls.filter((call) => call.path === "/drive/v3/changes");
  assert.equal(list.query.driveId, "drive-9");
  assert.equal(list.query.includeItemsFromAllDrives, "true");
});

test("deleted, binned, moved out and unreadable are told apart, and removed alone is asked about first", async () => {
  await watched(tree);
  w.drive.remove("clip-1");
  w.drive.trash("clip-2");
  w.drive.move("clip-3", "elsewhere");
  w.drive.forbid("clip-4");
  const [answer] = await read();

  assert.equal(stateOf("clip-1"), "gone", "its provider no longer knows it, and the watched folder still answers");
  assert.equal(stateOf("clip-2"), "gone", "in the bin");
  assert.equal(stateOf("clip-3"), "outside", "still there, under a folder the tree does not hold");
  assert.equal(stateOf("clip-4"), "no_access", "access lost is never read as gone");
  assert.equal(answer.read.marked, 4);
  assert.ok(w.item("clip-1").gone_at);
  const records = w.drive.calls.filter((call) => call.path.startsWith("/drive/v3/files/")).map((call) => call.path);
  assert.deepEqual(
    records.sort(),
    ["/drive/v3/files/clip-1", "/drive/v3/files/clip-4", `/drive/v3/files/${ROOT}`].sort(),
    "the two reported removed are asked about by their own record, and the 404 by whether the folder still answers",
  );
});

test("a 404 is not gone when the watched folder itself no longer answers: the folder is frozen and nothing is marked", async () => {
  await watched(tree);
  // The whole folder is no longer shared with the account: every item in it answers 404, as a deleted file does.
  w.drive.unshare("clip-1").unshare("clip-2").unshare(ROOT);
  await read();
  assert.equal(w.source().state, "frozen");
  assert.equal(w.source().last_error, SOURCE_WORDS.unreadable);
  assert.deepEqual([stateOf("clip-1"), stateOf("clip-2")], ["waiting", "waiting"], "access lost never deletes");
});

test("a folder that leaves takes what it holds, and a folder moved in brings its clips by a walk of its own", async () => {
  await watched((drive) => {
    tree(drive);
    drive
      .folder("shoot", "Saturday shoot", "elsewhere")
      .video("clip-5", "e.MOV", "shoot")
      .video("clip-6", "f.MOV", "shoot");
  });
  w.drive.move("sub-1", "elsewhere");
  w.drive.move("shoot", ROOT);
  const answers = await read();

  assert.deepEqual([stateOf("sub-1"), stateOf("clip-3"), stateOf("clip-4")], ["outside", "outside", "outside"]);
  assert.deepEqual(
    answers.map((answer) => [answer.kind, answer.payload.walk ?? null]),
    [
      ["source_read", null],
      ["source_walk", "subtree"],
    ],
    "the read lists the folder, and hands its contents to a walk",
  );
  assert.equal(stateOf("shoot"), "listed");
  assert.deepEqual([stateOf("clip-5"), stateOf("clip-6")], ["waiting", "waiting"], "its clips came in with it");
  assert.equal(w.item("clip-5").parent_id, "shoot");
  assert.equal(w.source().walk_kind, null);
  assert.equal(w.item(ROOT).walked_run, 1, "the rest of the tree was not walked again");
});

test("a changed file's bytes make it wanted again; a renamed one keeps its place", async () => {
  await watched((drive) => {
    drive.photo("old-photo", "2019.jpg", ROOT, { modifiedTime: "2019-05-01T00:00:00.000Z" });
  });
  assert.equal(stateOf("old-photo"), "listed", "years old: listed, not asked for");
  w.drive.put({ id: "old-photo", name: "2019 team.jpg" });
  await read();
  assert.deepEqual([stateOf("old-photo"), w.item("old-photo").name], ["listed", "2019 team.jpg"]);
  w.drive.put({ id: "old-photo", md5Checksum: "other-bytes", size: 3_100_000 });
  await read();
  assert.equal(stateOf("old-photo"), "waiting", "new bytes are a new file to take in");
});

test("a state the taking of a file set is never written over by a listing; only where the item sits and its name", async () => {
  await watched(tree);
  const taken = w.item("clip-1");
  Object.assign(taken, { state: "in", checksum: "the-bytes-that-were-taken", bytes: 111 });
  w.drive.put({ id: "clip-1", name: "renamed.MOV", md5Checksum: "newer-bytes", size: 222, parents: ["sub-1"] });
  await read();
  const after = w.item("clip-1");
  assert.equal(after.state, "in");
  assert.deepEqual([after.name, after.parent_id], ["renamed.MOV", "sub-1"]);
  assert.deepEqual(
    [after.checksum, after.bytes],
    ["the-bytes-that-were-taken", 111],
    "what was taken stays on its row, so the next phase can see the bytes changed",
  );
});

test("a wave of removals in the changes is held, and no later page marks what the hold kept", async () => {
  await watched((drive) => {
    for (let n = 0; n < 40; n++) drive.photo(`photo-${n}`, `${n}.jpg`, ROOT);
  });
  for (let n = 0; n < 30; n++) w.drive.trash(`photo-${n}`);
  const [answer] = await read();
  assert.equal(answer.read.held, 30);
  assert.equal(w.items().filter((row) => row.state === "gone").length, 0, "nothing leaves on a wave");
  assert.equal(w.source().hold_count, 30);
  const dueIn = Date.parse(w.source().next_walk_at) - Date.now();
  assert.ok(dueIn > SOURCE_PACE.rewalkMs - 60_000 && dueIn <= SOURCE_PACE.rewalkMs, "its re-walk is a day on");

  // While the hold stands, one more removal is not marked either: the re-walk decides for all of them.
  w.drive.trash("photo-39");
  await read();
  assert.equal(stateOf("photo-39"), "waiting");
});

/* ---------------------------------------------------------------------------------------------- the read's pace -- */

test("a read writes the folder's pace: the floor after a quiet read, the short gap while its account is busy inside", async () => {
  await watched(tree);
  // Nothing inside it has changed for more than a week.
  w.source().last_change_at = new Date(Date.now() - SOURCE_PACE.quietAfterMs - 60_000).toISOString();
  await read();
  let source = w.source();
  const quiet = Date.parse(source.next_read_at) - Date.now();
  assert.ok(quiet > SOURCE_PACE.quietFloorMs - 60_000, "nothing inside changed lately: the quiet floor");
  assert.equal(source.read_gap_seconds, 300);

  w.drive.video("clip-new", "e.MOV", ROOT);
  await read();
  source = w.source();
  const live = Date.parse(source.next_read_at) - Date.now();
  assert.ok(live > SOURCE_PACE.floorMs - 60_000 && live <= SOURCE_PACE.floorMs, "something changed: the hour's floor");
  assert.ok(source.last_change_at);
  const walkIn = Date.parse(source.next_walk_at) - Date.now();
  assert.ok(walkIn <= SOURCE_PACE.rewalkMs, "and a folder that changed is walked within a day");

  // Three reads in a row find changes elsewhere and none inside: the long gap.
  for (let n = 0; n < SOURCE_PACE.busyAfterReads; n++) {
    w.drive.busyElsewhere(4);
    await read();
  }
  assert.equal(w.source().busy_reads, SOURCE_PACE.busyAfterReads);
  assert.equal(w.source().read_gap_seconds, 1800, "a Drive busy elsewhere is read once in thirty minutes at most");
  w.drive.video("clip-newer", "f.MOV", ROOT);
  await read();
  assert.deepEqual([w.source().busy_reads, w.source().read_gap_seconds], [0, 300], "something inside ends it");
});

test("Drive's not-now ends the read with no try spent: the place stays, and the folder is read after the rest", async () => {
  await watched(tree);
  const place = w.source().change_cursor;
  w.drive.video("clip-new", "e.MOV", ROOT);
  w.drive.answerNext("/drive/v3/changes", driveRefusal(429, "rateLimitExceeded", {}, { "retry-after": "120" }));
  const [answer] = await read();
  assert.equal(answer.read.ended, false);
  assert.equal(w.source().change_cursor, place);
  const rest = Date.parse(w.source().next_read_at) - Date.now();
  assert.ok(rest > 110_000 && rest <= 120_000, `the clock hands it its next read after Drive's two minutes (${rest})`);
  assert.equal(w.jobs("source_read").filter((job) => job.state === "failed").length, 0);
  await read();
  assert.equal(stateOf("clip-new"), "waiting", "nothing was lost");
});

test("a page whose records run past the job's time is left unkept, and the next read keeps it whole and once", async (t) => {
  await watched(tree);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const place = w.source().change_cursor;
  for (let n = 0; n < 12; n++) w.drive.video(`late-${n}`, `L${n}.MOV`, "sub-1");
  const late = () => w.items().filter((row) => row.provider_id.startsWith("late-"));
  // Each record takes ten seconds of the job's forty: its time is gone before the page's twelve are read.
  w.drive.onEachCall((call) => {
    if (call.path.startsWith("/drive/v3/files/")) t.mock.timers.tick(10_000);
  });
  const [slow] = await read();
  assert.equal(slow.read.ended, false);
  assert.equal(w.drive.count("/drive/v3/files/*"), 5, "no record is asked for once the job's time is gone");
  assert.deepEqual([late().length, w.source().change_cursor], [0, place], "nothing kept, and the place where it was");
  assert.ok(Date.parse(w.source().next_read_at) <= Date.now(), "the clock hands the folder its next read at once");
  assert.equal(w.jobs("source_read").filter((job) => job.state === "failed").length, 0, "no try was spent");

  w.drive.onEachCall(null);
  await read();
  assert.deepEqual(
    late().map((row) => row.state),
    Array.from({ length: 12 }, () => "waiting"),
    "each of the twelve once",
  );
  assert.notEqual(w.source().change_cursor, place);
});

test("a fresh upload listed without its length is asked after again, and no second change is needed to say it", async () => {
  await watched(tree);
  const day = SOURCE_PACE.lengthWaitMs;
  w.drive
    .video("fresh", "F.MOV", ROOT, { videoMediaMetadata: undefined })
    .video("long", "L.MOV", "sub-1", { videoMediaMetadata: undefined })
    .video("old", "O.AVI", ROOT, {
      videoMediaMetadata: undefined,
      createdTime: new Date(Date.now() - 2 * day).toISOString(),
    });
  await read();
  assert.deepEqual(
    ["fresh", "long", "old"].map((id) => [stateOf(id), w.item(id).seconds]),
    [
      ["waiting", null],
      ["waiting", null],
      ["waiting", null],
    ],
    "none is too long or passed over for lacking a length",
  );
  const until = Date.parse(w.item("fresh").length_until) - Date.now();
  assert.ok(until > day - 60_000 && until <= day, "waited for a day from its upload");
  assert.ok(Date.parse(w.item("old").length_until) < Date.now(), "one uploaded days ago is not waited for");
  const soon = Date.parse(w.source().next_read_at) - Date.now();
  assert.ok(soon > 0 && soon <= SOURCE_PACE.lengthRetryMs, `the folder is read again in a few minutes (${soon})`);

  // Drive measures the two: one is eight seconds, one fifteen minutes. No change is listed for either.
  w.drive.measure("fresh", 8000).measure("long", 900_000);
  w.drive.calls.length = 0;
  const [answer] = await read();
  assert.equal(answer.read.changes, 0, "the list held nothing new");
  assert.deepEqual(
    w.drive.calls
      .filter((call) => call.path.startsWith("/drive/v3/files/"))
      .map((call) => call.path)
      .sort(),
    ["/drive/v3/files/fresh", "/drive/v3/files/long"],
    "only the two still waited for are asked after, five units each",
  );
  assert.deepEqual(
    ["fresh", "long"].map((id) => [stateOf(id), w.item(id).why, w.item(id).seconds, w.item(id).length_until]),
    [
      ["waiting", null, 8, null],
      ["too_big", "seconds", 900, null],
    ],
  );
  assert.equal(w.item("long").parent_id, "sub-1", "where it sits is left as it was");

  // Nothing waits any more: a read asks for no record.
  w.drive.calls.length = 0;
  await read();
  assert.equal(w.drive.count("/drive/v3/files/*"), 0);
});

test("a place in the changes its provider no longer knows is found again, and the whole tree is walked", async () => {
  await watched(tree);
  w.drive.video("clip-missed", "e.MOV", ROOT);
  w.drive.forgetPlaces();
  await read();
  const source = w.source();
  assert.ok(Number(source.change_cursor) > 100, "a new place, from now");
  assert.ok(Date.parse(source.next_walk_at) <= Date.now(), "and its walk is due at the clock's next turn");
  assert.equal(stateOf("clip-missed"), undefined, "the lost stretch is the walk's to find");
});

test("a read ends by opening the folder's channel where one is due, and closes the one it replaces", async () => {
  await watched(tree);
  await read();
  let source = w.source();
  const first = source.channel_id;
  assert.match(first, new RegExp(`^src-${SOURCE}-[0-9a-f]{8}$`), "the channel's id names its folder");
  assert.equal(w.drive.channels.size, 1);
  const opened = w.drive.channels.get(first);
  assert.equal(opened.address, "https://edge.example.com/api/sources/drive");
  const sha256 = crypto.createHash("sha256").update(opened.token).digest("hex");
  assert.equal(source.channel_token_hash, sha256, "the row keeps the token's hash");
  assert.notEqual(source.channel_token_hash, opened.token, "and never the token");
  assert.equal(source.channel_resource_id, opened.resourceId);

  await read();
  assert.equal(w.source().channel_id, first, "a channel with days left is kept");

  // Two days before it ends, the next read opens a new one and closes the old.
  w.source().channel_expires_at = new Date(Date.now() + SOURCE_PACE.channelRenewBeforeMs - 60_000).toISOString();
  await read();
  source = w.source();
  assert.notEqual(source.channel_id, first);
  assert.deepEqual([...w.drive.channels.keys()], [source.channel_id], "the one it replaced is closed at Drive");
});

/* ---------------------------------------------------------------------------------- folders that may not be read -- */

test("an account Google signed out needs a reconnect, and its folders pause with nothing in the Library touched", async () => {
  await watched(tree);
  const itemsBefore = JSON.stringify(w.items());
  // Its hour's key has run out, and Google refuses the refresh for good.
  w.vault.get(CONNECTION).expires_at = Date.now() - 1000;
  w.drive.grant({ error: "invalid_grant" });
  const [answer] = await read();
  assert.equal(answer.skipped, "the account is signed out");
  assert.equal(w.tables.source_connections[0].health, "needs_reconnect");
  const source = w.source();
  assert.deepEqual([source.state, source.last_error], ["paused", SOURCE_WORDS.signedOut]);
  assert.equal(source.next_read_at, null, "the clock hands a paused folder nothing");
  assert.equal(JSON.stringify(w.items()), itemsBefore);
  assert.equal(w.drive.count("/drive/v3/changes"), 0, "and Drive is not asked");
});

test("a refusal that may be about the project pauses nothing: the read fails to be tried again, and the folder stands", async () => {
  await watched(tree);
  const place = w.source().change_cursor;
  // Drive's API switched off for the project: every account's list answers 403.
  w.drive.answerNext("/drive/v3/changes", driveRefusal(403, "accessNotConfigured"));
  await assert.rejects(() => read(), /no answer \(status 403, accessNotConfigured\)/);
  assert.equal(w.tables.source_connections[0].health, "ok", "the account is not signed out");
  assert.deepEqual([w.source().state, w.source().last_error, w.source().change_cursor], ["watching", null, place]);
  assert.equal(
    w.jobs("source_read").at(-1).state,
    "failed",
    "the job is the ledger's to try again and to tell the platform of",
  );
});

test("a key Drive refuses is asked for anew once: a stale one is replaced and nothing is paused", async () => {
  await watched(tree);
  w.drive.answerNext("/drive/v3/changes", driveRefusal(401, "authError"));
  w.drive.grant({ access_token: "access-token-2", expires_in: 3600, scope: "drive" });
  await assert.rejects(() => read(), /key was refused/, "the job is tried again");
  assert.equal(w.vault.get(CONNECTION).access_token, "access-token-2", "with the new key, kept");
  assert.deepEqual([w.tables.source_connections[0].health, w.source().state], ["ok", "watching"]);
  w.drive.video("clip-new", "e.MOV", ROOT);
  await read();
  assert.equal(stateOf("clip-new"), "waiting", "and the next read goes through");
});

test("only a refresh Google refuses for good, or a key without the footage's scope, signs the account out", async () => {
  await watched(tree);
  w.drive.answerNext("/drive/v3/changes", driveRefusal(401, "authError"));
  w.drive.grant({ error: "invalid_grant" });
  const [answer] = await read();
  assert.equal(answer.skipped, "the account is signed out");
  assert.deepEqual(
    [w.tables.source_connections[0].health, w.source().state, w.source().last_error],
    ["needs_reconnect", "paused", SOURCE_WORDS.signedOut],
  );

  await watched(tree);
  w.drive.answerNext("/drive/v3/changes", driveRefusal(403, "insufficientPermissions"));
  const [scope] = await read();
  assert.equal(scope.skipped, "the account is signed out");
  assert.equal(w.tables.source_connections[0].health, "needs_reconnect");
  assert.equal(w.drive.count("/token"), 0, "a missing scope needs no refresh to be known");
});

test("when the member who connected the account leaves, its folders pause at once and keep what came in", async () => {
  await watched(tree);
  w.tables.memberships.length = 0;
  const [answer] = await read();
  assert.equal(answer.skipped, "whoever connected the account left");
  assert.deepEqual([w.source().state, w.source().last_error], ["paused", SOURCE_WORDS.connectorLeft]);
  assert.equal(w.drive.calls.length, 0, "a departed person's Drive is not read again");
  assert.equal(stateOf("clip-1"), "waiting", "what came in stays");
  assert.equal(w.tables.source_connections[0].connected_by, OWNER);
});

test("an hour's key that ran out is refreshed and kept, and the read goes on", async () => {
  await watched(tree);
  w.vault.get(CONNECTION).expires_at = Date.now() - 1000;
  w.drive.grant((form) => {
    assert.equal(form.get("grant_type"), "refresh_token");
    assert.equal(form.get("refresh_token"), "refresh-token-1");
    return { access_token: "access-token-2", expires_in: 3600, scope: "drive" };
  });
  w.drive.video("clip-new", "e.MOV", ROOT);
  await read();
  assert.equal(stateOf("clip-new"), "waiting");
  const kept = w.vault.get(CONNECTION);
  assert.deepEqual([kept.access_token, kept.refresh_token], ["access-token-2", "refresh-token-1"]);
});
