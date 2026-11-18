/**
 * A watched folder's walk (the footage sources plan, P2; job kind source_walk), run over a database in memory against
 * a Drive that answers from memory. The first walk lists the whole tree and the folder is then watched; a re-walk finds
 * what the changes missed and tells deleted, moved out and unreadable apart; a wave of removals is held; and a walk that
 * dies part way is taken up where its rows stand, listing nothing twice. Nothing here moves a file's bytes.
 */
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { at } from "../../_cron-doors-world.mjs";
import { ROOT, SOURCE, firstWalk, runJobs, schedule, setEnv, world } from "./_world.mjs";

setEnv();
const { sweepSources } = await import(at("apps/edge/lib/files/sources/sweep.ts"));
const { SOURCE_PACE } = await import(at("apps/edge/lib/files/sources/pace.ts"));
const { SOURCE_WORDS } = await import(at("apps/edge/lib/files/sources/words.ts"));

let w;
beforeEach(() => resetBreakers());
afterEach(() => w?.restore());

const log = { info() {}, warn() {}, error() {}, child: () => log };
/** One turn of the footage clock, and then the jobs it handed out. */
const clockTurn = async (world_) => {
  await sweepSources({ db: world_.db, L: log, started: Date.now() });
  return runJobs(world_);
};
const stateOf = (id) => w.item(id)?.state;
const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

/** A small tree: the watched folder, a folder inside it, and what a business keeps there. */
function smallTree(drive) {
  drive
    .folder(ROOT, "Footage", null)
    .folder("sub-1", "November", ROOT)
    .video("clip-1", "IMG_3185.MOV", ROOT)
    .video("clip-2", "IMG_1561.MOV", ROOT)
    .photo("photo-1", "IMG_0001.HEIC", "sub-1")
    .put({ id: "doc-1", name: "Price list", mimeType: "application/vnd.google-apps.document", parents: [ROOT] })
    .put({ id: "raw-1", name: "IMG_1.dng", mimeType: "image/x-adobe-dng", parents: [ROOT], size: 30_000_000 })
    .video("long-1", "Whole afternoon.MOV", ROOT, { videoMediaMetadata: { durationMillis: "1500000" } })
    .video("heavy-1", "Master.MOV", "sub-1", { size: 900_000_000 });
}

test("a first walk lists the whole tree, says what each item is, and then the folder is watched and read", async () => {
  w = world();
  smallTree(w.drive);
  const answers = await firstWalk(w);

  assert.deepEqual(
    Object.fromEntries(
      w.items().map((row) => [row.provider_id, [row.kind, row.state, row.why ?? null, row.parent_id]]),
    ),
    {
      [ROOT]: ["folder", "listed", null, null],
      "sub-1": ["folder", "listed", null, ROOT],
      "clip-1": ["video", "waiting", null, ROOT],
      "clip-2": ["video", "waiting", null, ROOT],
      "photo-1": ["image", "waiting", null, "sub-1"],
      "raw-1": ["other", "not_media", null, ROOT],
      "long-1": ["video", "too_big", "seconds", ROOT],
      "heavy-1": ["video", "too_big", "bytes", "sub-1"],
    },
    "every photo and video once: a RAW photo passed over, a video over a cap listed and never asked for",
  );
  assert.equal(w.item("doc-1"), undefined, "a document is never listed: it has no row and no name here");
  assert.match(
    w.drive.calls.find((call) => call.path === "/drive/v3/files").query.q,
    /mimeType = 'application\/vnd\.google-apps\.folder' or mimeType contains 'image\/' or mimeType contains 'video\/'/,
    "Drive is asked for folders, photos and videos alone",
  );
  const source = w.source();
  assert.equal(source.state, "watching");
  assert.equal(source.walk_kind, null, "no walk is left in flight");
  assert.equal(source.walk_run, 1);
  assert.ok(source.reconciled_at && source.next_walk_at);
  assert.deepEqual(
    answers.map((answer) => answer.kind),
    ["source_walk", "source_read"],
    "the walk hands the folder its first read at once, from the place saved before the walk began",
  );
  assert.notEqual(source.change_cursor, "100", "that read moved the folder's place to the end of the list");
  assert.equal(w.items().length, 8, "what the read found again was already listed: nothing is listed twice");
  assert.equal(
    w.tables.source_items.some((row) => row.file_id),
    false,
    "nothing is taken into the Library here",
  );
});

test("a first watch asks for the newest fifty of the last thirty days; everything else is listed and waits", async () => {
  w = world();
  w.drive.folder(ROOT, "Footage", null);
  for (let n = 0; n < 60; n++) w.drive.photo(`new-${n}`, `new ${n}.jpg`, ROOT, { modifiedTime: daysAgo(n / 4) });
  for (let n = 0; n < 5; n++) w.drive.photo(`old-${n}`, `old ${n}.jpg`, ROOT, { modifiedTime: daysAgo(40 + n) });
  await firstWalk(w);

  const waiting = w.items().filter((row) => row.state === "waiting");
  assert.equal(waiting.length, SOURCE_PACE.firstWatchItems);
  assert.deepEqual(
    waiting.map((row) => row.provider_id).sort(),
    Array.from({ length: 50 }, (_, n) => `new-${n}`).sort(),
    "the newest fifty",
  );
  assert.equal(w.items().filter((row) => row.state === "listed" && row.kind === "image").length, 15);
  assert.equal(stateOf("old-0"), "listed", "years of footage is listed, and comes in when asked");
});

test("a folder that takes no subfolders lists its own files alone", async () => {
  w = world({ source: { include_subfolders: false } });
  smallTree(w.drive);
  await firstWalk(w);
  assert.equal(stateOf("sub-1"), "listed", "the folder inside is seen");
  assert.equal(w.item("photo-1"), undefined, "and what it holds is not listed");
  assert.equal(w.item("heavy-1"), undefined);
  assert.equal(stateOf("clip-1"), "waiting");
});

test("a walk that dies part way is taken up where its rows stand, and lists nothing twice", async () => {
  w = world();
  smallTree(w.drive);
  w.drive.setPageCap(2);
  // The third page of the tree gets no answer, twice: the job throws, as the ledger would see it.
  let asked = 0;
  w.drive.onEachCall((call) => {
    if (call.path !== "/drive/v3/files") return;
    asked += 1;
    if (asked === 3) w.drive.answerNext("/drive/v3/files", new Response("upstream", { status: 503 }));
    if (asked === 4) w.drive.answerNext("/drive/v3/files", new Response("upstream", { status: 503 }));
  });
  await assert.rejects(() => firstWalk(w), /no answer/);
  const partWay = w.items().length;
  assert.ok(partWay > 0 && partWay < 8, "some of the tree was kept before the walk died");
  assert.equal(w.source().walk_kind, "snapshot", "the walk is still in flight on its row");
  assert.equal(w.source().state, "setting_up");

  // Half an hour on with nothing written, the clock takes the walk up again under a step of its own.
  w.source().walk_touched_at = new Date(Date.now() - SOURCE_PACE.walkStaleMs - 1000).toISOString();
  const answers = await clockTurn(w);
  assert.match(answers[0].payload.step, /^again-\d+$/);
  assert.equal(w.source().state, "watching");
  const ids = w.items().map((row) => row.provider_id);
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids).size, 8, "each item once, whatever was listed before the walk died");
});

test("a folder too large for one step keeps the page it stands at and is closed by the step that ends it", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  w = world();
  w.drive.folder(ROOT, "Footage", null);
  for (let n = 0; n < 9; n++) w.drive.photo(`photo-${n}`, `${n}.jpg`, ROOT);
  w.drive.setPageCap(2);
  // Each page takes twenty seconds of a forty-second step: two pages a step.
  w.drive.onEachCall((call) => {
    if (call.path === "/drive/v3/files") t.mock.timers.tick(20_000);
  });
  schedule(w, "source_walk", { source_id: SOURCE, run: "1", step: "0", walk: "snapshot" }, [SOURCE, "1", "0"]);
  const answers = await runJobs(w, { kinds: ["source_walk"] });

  const steps = answers.map((answer) => answer.payload.step);
  assert.deepEqual(steps, ["0", "1", "2"], "three steps, each handing the next on");
  assert.deepEqual(
    answers.map((answer) => answer.walked.pages),
    [2, 2, 1],
  );
  assert.equal(w.items().filter((row) => row.kind === "image").length, 9);
  assert.equal(w.item(ROOT).walk_page, null, "the folder's place is cleared once it is listed whole");
  assert.equal(w.item(ROOT).walked_run, 1);
  assert.equal(w.source().state, "watching");
});

test("Drive's not-now ends the step, and the next is due after the rest it asked for", async () => {
  w = world();
  smallTree(w.drive);
  w.drive.answerNext(
    "/drive/v3/files",
    new Response(JSON.stringify({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }), {
      status: 403,
      headers: { "content-type": "application/json", "retry-after": "90" },
    }),
  );
  await firstWalk(w);
  const [next] = w.waiting("source_walk");
  assert.equal(next.payload.step, "1");
  const rest = Date.parse(next.due_at) - Date.now();
  assert.ok(rest > 80_000 && rest <= 90_000, `the next step waits Drive's ninety seconds (${rest} ms)`);
  assert.equal(w.jobs("source_walk").filter((job) => job.state === "failed").length, 0, "no try was spent");
  assert.equal(w.source().state, "setting_up");
});

/* ------------------------------------------------------------------------------------------------- the re-walk -- */

const DRIVE = "drive-1";
/**
 * A tree of many small folders: the watched folder, `folders` folders inside it, and two clips in each. In a shared
 * drive unless `driveId` is null.
 */
function manyFolders(drive, folders = 6, driveId = DRIVE) {
  const inDrive = driveId ? { driveId } : {};
  drive.folder(ROOT, "Footage", null, inDrive);
  for (let n = 1; n <= folders; n++)
    drive
      .folder(`shoot-${n}`, `Shoot ${n}`, ROOT, inDrive)
      .video(`clip-${n}a`, `${n}a.MOV`, `shoot-${n}`, inDrive)
      .video(`clip-${n}b`, `${n}b.MOV`, `shoot-${n}`, inDrive);
}
/** A world whose watched folder is in a shared drive. */
const driveWorld = () => world({ source: { drive_id: DRIVE } });
const listCalls = () => w.drive.calls.filter((call) => call.path === "/drive/v3/files");

test("a shared drive's folders are listed many in one question, and each item is kept under the folder it sits in", async () => {
  w = driveWorld();
  manyFolders(w.drive);
  const [walk] = await firstWalk(w);

  assert.deepEqual([walk.walked.folders, walk.walked.pages, walk.walked.added], [7, 2, 18]);
  const lists = listCalls();
  assert.equal(lists.length, 2, "the watched folder, then its six folders together: two calls, not seven");
  assert.equal(lists[1].query.q.split(" in parents").length - 1, 6, "one question names all six");
  assert.deepEqual(
    [lists[0].query.corpora, lists[1].query.corpora, lists[1].query.driveId],
    ["drive", "drive", DRIVE],
    "each is put to the whole drive: asked of the account's own files, Drive answers many folders only in part",
  );
  assert.equal(
    w.drive.units((call) => call.path === "/drive/v3/files"),
    200,
  );
  for (let n = 1; n <= 6; n++)
    assert.deepEqual(
      [w.item(`clip-${n}a`).parent_id, w.item(`clip-${n}b`).parent_id, w.item(`shoot-${n}`).walked_run],
      [`shoot-${n}`, `shoot-${n}`, 1],
    );
});

test("outside a shared drive each folder is asked alone, and the tree is listed whole all the same", async () => {
  w = world();
  manyFolders(w.drive, 6, null);
  const [walk] = await firstWalk(w);
  const asked = listCalls().map((call) => call.query.q.split(" in parents").length - 1);
  assert.deepEqual(asked, [1, 1, 1, 1, 1, 1, 1], "seven folders, seven questions");
  assert.deepEqual([walk.walked.folders, walk.walked.added], [7, 18]);
  assert.equal(w.items().filter((row) => row.kind === "video").length, 12, "every clip, whoever put it there");
});

test("a walk that spent more than a day's units puts the next one further off", async () => {
  // Thirty folders outside a shared drive: thirty-one questions, 3,100 units, where a day is held to 2,400.
  w = world({ source: { last_change_at: new Date().toISOString() } });
  manyFolders(w.drive, 30, null);
  await firstWalk(w);
  assert.equal(w.source().walk_units, 3100);
  const days = (Date.parse(w.source().next_walk_at) - Date.now()) / DAY;
  assert.ok(Math.abs(days - 3100 / 2400) < 0.01, `walked again in ${days} days, not one`);
});

test("no more folders are asked about in one question than the pace says", async () => {
  w = driveWorld();
  manyFolders(w.drive, SOURCE_PACE.foldersAtOnce + 5);
  await firstWalk(w);
  const asked = listCalls().map((call) => call.query.q.split(" in parents").length - 1);
  assert.deepEqual(asked, [1, SOURCE_PACE.foldersAtOnce, 5]);
  assert.equal(w.items().filter((row) => row.kind === "video").length, 2 * (SOURCE_PACE.foldersAtOnce + 5));
});

test("where one folder of a question is gone the whole question is refused: each is listed alone, and only it is missed", async () => {
  w = driveWorld();
  manyFolders(w.drive);
  await firstWalk(w);
  w.source().next_walk_at = new Date(Date.now() - 1000).toISOString();
  // A folder is no longer there with what it held (deleted for good, or out of the account's sight: Drive answers
  // the same for both), and no read of the changes saw it.
  w.drive.remove("shoot-3").remove("clip-3a").remove("clip-3b");
  w.drive.calls.length = 0;
  const [walk] = await clockTurn(w);

  assert.equal(listCalls().length, 1 + 7, "one question refused, then the seven folders one at a time");
  assert.equal(walk.walked.missed, 3, "the folder and its two clips, and nothing else");
  // The other folders and their clips stand as they were (a first watch had asked for the clips).
  assert.deepEqual(["shoot-3", "clip-3a", "clip-3b", "shoot-2", "clip-2a", "clip-4b"].map(stateOf), [
    "no_access",
    "no_access",
    "no_access",
    "listed",
    "waiting",
    "waiting",
  ]);
  assert.equal(w.source().state, "watching");
  assert.equal(w.items().filter((row) => row.missed_run != null).length, 0);
});

test("folders listed together that do not fit one step keep the page they stand at, and the next step goes on from it", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  w = driveWorld();
  manyFolders(w.drive, 4);
  w.drive.setPageCap(3);
  // Each page takes twenty seconds of a forty-second step: two pages a step.
  w.drive.onEachCall((call) => {
    if (call.path === "/drive/v3/files") t.mock.timers.tick(20_000);
  });
  schedule(w, "source_walk", { source_id: SOURCE, run: "1", step: "0", walk: "snapshot" }, [SOURCE, "1", "0"]);
  const answers = await runJobs(w, { kinds: ["source_walk"] });

  // The watched folder holds four folders (two pages of three), then their eight clips together (three pages).
  assert.deepEqual(
    answers.map((answer) => [answer.payload.step, answer.walked.pages]),
    [
      ["0", 2],
      ["1", 2],
      ["2", 1],
    ],
  );
  assert.equal(listCalls().length, 5, "five pages in all, and none asked for twice");
  assert.equal(w.items().filter((row) => row.kind === "video").length, 8);
  assert.deepEqual(
    [1, 2, 3, 4].map((n) => [w.item(`shoot-${n}`).walk_page, w.item(`shoot-${n}`).walked_run]),
    [
      [null, 1],
      [null, 1],
      [null, 1],
      [null, 1],
    ],
    "each folder's place is cleared once they are listed whole",
  );
  assert.deepEqual(
    [answers.map((answer) => answer.walked.units), w.source().walk_units],
    [[200, 200, 100], 500],
    "each step says what it spent, and the folder's row keeps the whole walk's",
  );

  // A re-walk of the same tree, in steps too: nothing is missed, since what each page showed was stamped.
  w.source().next_walk_at = new Date(Date.now() - 1000).toISOString();
  w.drive.trash("clip-2a");
  const again = await clockTurn(w);
  assert.equal(again.at(-1).walked.ended, true);
  assert.deepEqual(
    w
      .items()
      .filter((row) => row.state === "gone")
      .map((row) => row.provider_id),
    ["clip-2a"],
    "only the clip in the bin is said gone",
  );
});

/** A watched folder after its first walk and read, with a re-walk due. */
async function watched(build) {
  w = world();
  build(w.drive);
  await firstWalk(w);
  w.source().next_walk_at = new Date(Date.now() - 1000).toISOString();
  w.drive.calls.length = 0;
  return w;
}

test("a re-walk finds what the changes missed, and tells binned, moved out, unreadable and no longer found apart", async () => {
  await watched((drive) => {
    smallTree(drive);
    drive.folder("elsewhere", "Private", null).video("clip-3", "c.MOV", ROOT).video("clip-4", "d.MOV", ROOT);
  });
  // Four things happen that no read of the changes saw.
  w.drive.remove("clip-1");
  w.drive.move("clip-2", "elsewhere");
  w.drive.forbid("clip-3");
  w.drive.trash("clip-4");
  w.drive.video("clip-new", "e.MOV", "sub-1");
  const cursor = w.source().change_cursor;

  const [walk] = await clockTurn(w);
  assert.equal(walk.payload.walk, "reconcile");
  assert.deepEqual(
    [stateOf("clip-1"), w.item("clip-1").why],
    ["no_access", "not_found"],
    "a 404 does not say deleted: the bin never showed it, so it is kept as unreadable, and its row says not found",
  );
  assert.equal(stateOf("clip-2"), "outside", "still there, moved out of the tree");
  assert.deepEqual([stateOf("clip-3"), w.item("clip-3").why], ["no_access", null], "refused is never read as gone");
  assert.equal(stateOf("clip-4"), "gone", "in the bin: the one sign of a deletion");
  assert.ok(w.item("clip-1").gone_at && w.item("clip-2").gone_at);
  assert.equal(stateOf("clip-new"), "waiting", "what the changes missed is found and asked for");
  assert.equal(w.source().change_cursor, cursor, "a walk never moves the folder's place in the changes");
  assert.equal(w.source().walk_kind, null);
  assert.equal(
    w.drive.count("/drive/v3/files/*"),
    4,
    "only what the walk did not find is asked after by its own record, five units each",
  );
});

test("a re-walk writes nothing on an item that did not change", async () => {
  await watched(smallTree);
  const before = w.db.seen.length;
  await clockTurn(w);
  const writes = w.db.seen
    .slice(before)
    .filter((statement) => statement.table === "source_items" && statement.op !== "select");
  // Each folder's own row says it was listed, and that is all: an item its provider says nothing new of is not written.
  assert.deepEqual(
    [...new Set(writes.filter((statement) => statement.op === "update").flatMap((s) => Object.keys(s.values ?? {})))],
    ["walked_run", "walk_page"],
    "the only rows changed are the folders' own, marked as listed by this run",
  );
  const kept = writes.filter((statement) => statement.op === "upsert");
  assert.deepEqual(
    kept.map((statement) => [statement.values].flat().map((value) => value.provider_id)),
    [[ROOT]],
    "the tree's root is written once if it is not there, and no item's facts are written over",
  );
  assert.equal(
    writes.some((statement) => statement.op === "update" && "seen_run" in (statement.values ?? {})),
    false,
    "a folder listed in one step is compared in memory: no item is stamped",
  );
  assert.equal(w.items().filter((row) => row.missed_run != null).length, 0);
});

test("a wave of removals is held: nothing is marked until the next re-walk still misses them", async () => {
  await watched((drive) => {
    drive.folder(ROOT, "Footage", null);
    for (let n = 0; n < 30; n++) drive.photo(`photo-${n}`, `${n}.jpg`, ROOT);
  });
  for (let n = 0; n < 25; n++) w.drive.trash(`photo-${n}`);

  await clockTurn(w);
  assert.equal(w.items().filter((row) => row.state === "gone").length, 0, "held: none is marked");
  assert.equal(w.source().hold_count, 25);
  assert.ok(w.source().hold_at);
  const dueIn = Date.parse(w.source().next_walk_at) - Date.now();
  assert.ok(dueIn > 0 && dueIn <= SOURCE_PACE.rewalkMs, "the walk that agrees is a day on at most");
  assert.equal(w.drive.count("/drive/v3/files/*"), 0, "and none is asked after yet");

  // A day on, the re-walk still misses them: it agrees, and they are gone.
  w.source().next_walk_at = new Date(Date.now() - 1000).toISOString();
  w.source().hold_at = new Date(Date.now() - DAY).toISOString();
  await clockTurn(w);
  assert.equal(w.items().filter((row) => row.state === "gone").length, 25);
  assert.equal(w.source().hold_at, null, "the hold is cleared");
  assert.equal(w.source().hold_count, null);
  assert.equal(stateOf("photo-29"), "waiting", "what is still there is untouched");
});

test("a held wave whose files come back is cleared with nothing marked", async () => {
  await watched((drive) => {
    drive.folder(ROOT, "Footage", null).folder("elsewhere", "Private", null);
    for (let n = 0; n < 30; n++) drive.photo(`photo-${n}`, `${n}.jpg`, ROOT);
  });
  for (let n = 0; n < 25; n++) w.drive.move(`photo-${n}`, "elsewhere");
  await clockTurn(w);
  assert.equal(w.source().hold_count, 25);
  // They are put back before the next walk.
  for (let n = 0; n < 25; n++) w.drive.move(`photo-${n}`, ROOT);
  w.source().next_walk_at = new Date(Date.now() - 1000).toISOString();
  w.source().hold_at = new Date(Date.now() - DAY).toISOString();
  await clockTurn(w);
  assert.equal(w.items().filter((row) => ["gone", "outside"].includes(row.state)).length, 0);
  assert.equal(w.source().hold_at, null);
});

test("one file gone from a small folder is simply gone: a hold is for a wave", async () => {
  await watched((drive) => {
    drive.folder(ROOT, "Footage", null).photo("a", "a.jpg", ROOT).photo("b", "b.jpg", ROOT).photo("c", "c.jpg", ROOT);
  });
  w.drive.trash("a");
  await clockTurn(w);
  assert.equal(stateOf("a"), "gone", "a third of the folder, and still under the hold's least");
  assert.equal(w.source().hold_at, null);
});

test("a folder someone restricts takes nothing out: what it held is kept as unreadable, and is listed again by itself", async () => {
  await watched(smallTree);
  // The folder and what it holds are no longer shared with the account: Drive answers each as it does a deleted file.
  w.drive.unshare("sub-1").unshare("photo-1").unshare("heavy-1");
  await clockTurn(w);
  for (const id of ["sub-1", "photo-1", "heavy-1"])
    assert.deepEqual([stateOf(id), w.item(id).why], ["no_access", "not_found"], `${id} is kept, never said gone`);
  assert.equal(w.items().filter((row) => row.state === "gone").length, 0);
  assert.equal(w.source().state, "watching", "the watched folder itself still answers");
  assert.equal(w.source().hold_at, null, "three items are no wave");

  // Shared again: the next walk lists the folder and what it holds again, as it does one moved back in.
  w.drive.share("sub-1").share("photo-1").share("heavy-1");
  w.source().next_walk_at = new Date(Date.now() - 1000).toISOString();
  await clockTurn(w);
  assert.deepEqual([stateOf("sub-1"), stateOf("photo-1")], ["listed", "listed"]);
  assert.deepEqual([w.item("photo-1").why, w.item("photo-1").gone_at], [null, null]);
});

test("a folder that left takes what it holds with it", async () => {
  await watched((drive) => {
    smallTree(drive);
    drive.folder("elsewhere", "Private", null);
  });
  w.drive.move("sub-1", "elsewhere");
  await clockTurn(w);
  assert.equal(stateOf("sub-1"), "outside");
  assert.equal(stateOf("photo-1"), "outside", "what sat in it is outside with it");
  assert.equal(stateOf("heavy-1"), "outside");
  assert.equal(stateOf("clip-1"), "waiting");

  // Moved back in, a later walk lists it and what it holds again.
  w.drive.move("sub-1", ROOT);
  w.source().next_walk_at = new Date(Date.now() - 1000).toISOString();
  await clockTurn(w);
  assert.equal(stateOf("sub-1"), "listed");
  assert.equal(stateOf("photo-1"), "listed", "back, and listed: it is asked for when someone asks");
  assert.equal(w.item("photo-1").gone_at, null);
});

test("a watched folder that cannot be read is frozen with nothing marked, and thaws by itself", async () => {
  await watched(smallTree);
  w.drive.unshare(ROOT);
  await clockTurn(w);
  const frozen = w.source();
  assert.equal(frozen.state, "frozen");
  assert.equal(frozen.last_error, SOURCE_WORDS.unreadable);
  assert.equal(frozen.walk_kind, null, "its walk ended where it stood");
  assert.equal(w.items().filter((row) => ["gone", "outside", "no_access"].includes(row.state)).length, 0);

  // No re-walk runs while it is frozen; its read asks after the folder at the quiet floor.
  frozen.next_walk_at = new Date(Date.now() - 1000).toISOString();
  frozen.next_read_at = new Date(Date.now() - 1000).toISOString();
  const answers = await clockTurn(w);
  assert.deepEqual(
    answers.map((answer) => [answer.kind, answer.skipped]),
    [["source_read", "the folder is frozen"]],
  );
  assert.ok(Date.parse(w.source().next_read_at) - Date.now() > SOURCE_PACE.quietFloorMs - 60_000);

  // Shared again: the next read finds it answering, and the folder is watched and walked again.
  w.drive.share(ROOT);
  w.tables.media_sources[0].next_read_at = new Date(Date.now() - 1000).toISOString();
  await clockTurn(w);
  assert.equal(w.source().state, "watching");
  assert.equal(w.source().last_error, null);
});
