/**
 * What a watched folder could not bring in is said, once and quietly, wherever the folder is said; a clip Drive is still
 * processing is said too; and every count of the folder is one count (the content loop PRD v3.1, pass 0, F3, F4 and
 * F5). The first real run found the row and the Library's line saying "24 of 26" while six clips had failed and one
 * was too long, AI's facts silent on them; the Stop sheet saying 24 where the row said 23 and the Library held 25; and
 * two clips waiting a day for Drive's length with no word. Now the folder's one count (source_items_tally) says what
 * came in, what is kept in Drive, what could not come in with each one's reason, and what Drive is still processing,
 * and the row in Settings, the Library's line, the Stop sheet and AI's facts all say it from the page's one read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../../_cron-doors-world.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { driveRow } from "../../../apps/dashboard/src/surfaces/settings/connections/model/setup-rows.ts";

const { FOOTAGE_WORDS, footageLineOf, footageStandingOf } = await importSrc("packages/contracts/src/files/footage.ts");
const { footageAsidesOf } = await importSrc("packages/contracts/src/files/footage-asides.ts");
const { stopWordsOf } = await importSrc("apps/dashboard/src/surfaces/files/footage/leave-words.ts");
const { folderLineOf } = await import(at("apps/dashboard/src/server/files/line.ts"));
const { countFolderStanding } = await import(at("packages/db/src/repositories/files/source-standing.ts"));

const clock = () => "2:14 PM";
const counts = (over = {}) => ({
  found: 33,
  in: 25,
  away: 0,
  coming: 0,
  landed: 0,
  processing: 0,
  ...over,
  waits: { budget: 0, room: 0, library_full: 0, videos_off: 0, ...(over.waits ?? {}) },
  missed: { failed: 0, too_long: 0, too_large: 0, ...(over.missed ?? {}) },
});
const folder = (over = {}) => ({
  id: "s",
  provider_id: "drive-folder",
  name: "Footage run A",
  state: "watching",
  subfolders: true,
  looking: false,
  held: null,
  stopped_why: null,
  over_listed: false,
  updated_at: "2026-11-21T19:14:00.000Z",
  counts: counts(),
  videos: null,
  ...over,
});
const footage = (over = {}) => ({
  offered: true,
  can_change: true,
  account: { id: "a", email: "ruben@example.com", health: "ok", connected_by: null, by_you: true },
  folder: folder(),
  ...over,
});
/** The run's folder: 25 in, six that failed, one too long. */
const theRun = (over = {}) =>
  footage({ folder: folder({ counts: counts({ missed: { failed: 6, too_long: 1 }, ...over }) }) });
const driveRowOf = (dto) => driveRow({ tz: "UTC", footage: dto }, { nowMs: Date.parse("2026-11-21T20:00:00Z") });

test("what could not come in is one quiet line, with each one's reason, and a quiet folder says nothing more", () => {
  assert.deepEqual(footageAsidesOf(footage().folder), [], "nothing missed, nothing processing: nothing said");
  const [missed] = footageAsidesOf(theRun().folder);
  assert.equal(missed.key, "missed");
  assert.equal(missed.head, "7 couldn't be brought in");
  assert.deepEqual(missed.reasons, [
    "6 were tried three times: check that they play in Drive",
    "1 is longer than 10 minutes, so AI can't watch it",
  ]);
  const large = footageAsidesOf(folder({ counts: counts({ missed: { too_large: 1 } }) }))[0];
  assert.deepEqual([large.head, large.reasons], ["1 couldn't be brought in", ["1 is too large to bring in"]]);
  assert.equal(FOOTAGE_WORDS.seeWhich, "See which");
});

test("the Library's line says it: on a quiet folder as the line itself, beside what the line already says", () => {
  const quiet = theRun();
  const line = footageLineOf(quiet, footageStandingOf(quiet, clock));
  assert.deepEqual([line.head, line.sub, line.tone, line.act], ["7 couldn't be brought in", "See which", "rest", null]);
  const busy = theRun({ coming: 3, landed: 2 });
  const coming = footageLineOf(busy, footageStandingOf(busy, clock));
  assert.equal(coming.head, "Bringing in 2 of 5");
  assert.equal(coming.sub, "From “Footage run A” · 7 couldn't be brought in", "said once, after what is on its way");
  assert.equal(footageLineOf(footage(), footageStandingOf(footage(), clock)), null, "a quiet, well folder: no line");
});

test("Settings' row says it on the row itself, and See which opens what they are", () => {
  const row = driveRowOf(theRun());
  const said = (row.notes ?? []).filter((note) => note.live).map((note) => note.text);
  assert.deepEqual(said, ["7 couldn't be brought in"]);
  assert.equal(row.acts[0].label, "See which");
  assert.equal(row.acts[0].to, "verb:drive-contents");
  assert.equal((driveRowOf(footage()).notes ?? []).length, 0, "nothing missed: no note");
});

test("AI's facts say it, each with its one reason, and the time of day still stays out", () => {
  const line = folderLineOf(theRun());
  assert.match(
    line,
    /7 couldn't be brought in: 6 were tried three times: check that they play in Drive; 1 is longer than 10 minutes, so AI can't watch it\./,
  );
  assert.ok(!/PM|AM/.test(line));
  assert.ok(!folderLineOf(footage()).includes("couldn't"), "nothing missed, nothing said");
});

test("a video Drive is still processing is said, and is not counted as coming in", () => {
  const waiting = footage({ folder: folder({ counts: counts({ processing: 2 }) }) });
  const standing = footageStandingOf(waiting, clock);
  assert.notEqual(standing.key, "bringing_in", "it waits on Drive, not its turn");
  const line = footageLineOf(waiting, standing);
  assert.equal(line.head, "Google Drive is still processing 2");
  const [processing] = footageAsidesOf(waiting.folder);
  assert.deepEqual(processing.reasons, ["They come in once Drive has finished with them"]);
  assert.match(folderLineOf(waiting), /Google Drive is still processing 2: They come in once Drive has finished/);
  // With clips that could not come in too, both are said, the one on its way first and the other on the line's
  // second row, which wraps: a phone's width never cuts either.
  const both = theRun({ processing: 1 });
  const line2 = footageLineOf(both, footageStandingOf(both, clock));
  assert.deepEqual(
    [line2.head, line2.sub],
    ["Google Drive is still processing 1", "7 couldn't be brought in · See which"],
  );
});

test("one count everywhere: the row, the Library's line, the Stop sheet and AI say the folder's own 25", () => {
  const dto = footage({ folder: folder({ counts: counts({ in: 25, away: 4 }) }) });
  assert.match(footageStandingOf(dto, clock).say, /^25 photos and videos in/);
  assert.match(folderLineOf(dto), /25 photos and videos in/);
  const stop = stopWordsOf(dto.folder.counts);
  assert.equal(stop.stays, "Nothing new comes in. The 25 photos and videos that came in stay in your Library.");
  assert.equal(
    stop.away,
    "4 clips are kept in Drive right now. They still play here while Google Drive stays connected.",
  );
  assert.equal(stopWordsOf(counts({ in: 1 })).away, null, "none kept in Drive: nothing to say of them");
});

test("the folder's one count is read whole, and a database before it reads as nothing missed", async () => {
  const tally = {
    found: 33,
    in: 25,
    away: 4,
    coming: 1,
    landed: 1,
    budget: 0,
    room: 0,
    library_full: 0,
    videos_off: 0,
    waiting_length: 2,
    failed: 6,
    too_long: 1,
    too_large: 0,
  };
  const ref = { tenantId: "t", sourceId: "s" };
  const read = await countFolderStanding(fakeDb({}, {}, { source_items_tally: () => tally }), ref);
  assert.deepEqual(
    [read.in, read.away, read.waitingLength, read.failed, read.tooLong, read.tooLarge],
    [25, 4, 2, 6, 1, 0],
  );
  const { away: _a, waiting_length: _w, failed: _f, too_long: _l, too_large: _g, ...older } = tally;
  const before = await countFolderStanding(fakeDb({}, {}, { source_items_tally: () => older }), ref);
  assert.deepEqual([before.away, before.waitingLength, before.failed, before.tooLong], [0, 0, 0, 0]);
});
